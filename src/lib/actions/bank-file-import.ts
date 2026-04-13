"use server";

import { eq, sql } from "drizzle-orm";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { importProfiles, importHistory, bankImportTransactions } from "@/db/schema";
import { parseCsvBuffer } from "@/lib/import/parse-csv";
import { createLedgerFromImportTx } from "./reconciliation";

// ── Typy ─────────────────────────────────────────────────────────────────────

/** Konfigurace parseru uložená v import_profiles.config */
type BankProfileConfig = {
    filterColumn?:           string;  // sloupec pro filtrování směru (např. "Směr úhrady")
    filterValue?:            string;  // hodnota pro příchozí platby (např. "Příchozí")
    dateFormat?:             string;  // formát datumu (např. "dd/MM/yyyy")
    amountDecimalSeparator?: string;  // oddělovač desetinné části (např. ",")
};

type ColumnMapping = { sourceCol: string; targetField: string };

/** Výsledek importu bankovního souboru */
export type BankImportResult = {
    total:      number;  // řádků v souboru
    filtered:   number;  // přeskočených (odchozí, prázdné, …)
    inserted:   number;  // nových transakcí vložených do staging
    duplicates: number;  // duplikátů (external_key již existoval)
    ledgerNew:  number;  // nových záznamů v payment_ledger
    autoMatch:  { confirmed: number; suggested: number };
};

export type BankImportFileResult =
    | { error: string }
    | { result: BankImportResult };

// ── Pomocné funkce parsování ──────────────────────────────────────────────────

/** Převede datum dle formátu profilu na ISO YYYY-MM-DD */
function parseDate(value: string, format: string): string | null {
    const v = value.trim();
    if (!v) return null;

    if (format === "dd/MM/yyyy") {
        // "01/04/2026" → "2026-04-01"
        const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return null;
        return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    if (format === "yyyy-MM-dd" || format === "ISO") {
        return v.substring(0, 10);
    }
    // fallback: zkus ISO parsing
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
}

/** Převede částku na celé Kč (integer) dle konfigurace profilu */
function parseAmount(value: string, decimalSep: string): number | null {
    const v = value.trim();
    if (!v) return null;
    // Nahraď oddělovač tisíců (mezera nebo háček) a pak desetinnou čárku tečkou
    const normalized = v
        .replace(/\s/g, "")
        .replace(new RegExp(`\\${decimalSep}`, "g"), ".");
    const num = parseFloat(normalized);
    return isNaN(num) ? null : Math.round(num);
}

/** Vytáhne hodnotu sloupce z řádku (bez ohledu na uvozovky a whitespace) */
function getCol(row: Record<string, string>, colName: string): string {
    return (row[colName] ?? "").trim();
}

// ── Hlavní server action ──────────────────────────────────────────────────────

/**
 * Importuje bankovní CSV soubor dle zvoleného profilu.
 *
 * Tok:
 *  1. Parsuje soubor s nastavením profilu (delimiter, encoding, header_row).
 *  2. Filtruje řádky dle filterColumn/filterValue (typicky "Příchozí").
 *  3. Mapuje sloupce na pole bank_import_transactions dle profile.mappings.
 *  4. Upsertuje do bank_import_transactions (idempotentní přes profile_id + external_key).
 *  5. Pro každý nový záznam vytvoří payment_ledger + spustí auto-matcher.
 *  6. Uloží záznam do import_history.
 */
export async function importBankFileAction(
    formData: FormData,
    profileId: number,
): Promise<BankImportFileResult> {
    const session = await auth();
    const importedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    // 1. Načti profil
    const [profile] = await db
        .select()
        .from(importProfiles)
        .where(eq(importProfiles.id, profileId));

    if (!profile) return { error: "Profil nenalezen" };
    if (profile.profileType !== "bank") return { error: "Profil není bankovní (profile_type != 'bank')" };

    const config = (profile.config ?? {}) as BankProfileConfig;
    const mappings = (profile.mappings ?? []) as ColumnMapping[];
    const matchKeys = (profile.matchKeys ?? []) as ColumnMapping[];

    if (matchKeys.length === 0) return { error: "Profil nemá nastaven párovací klíč (match_keys)" };
    if (mappings.length === 0)  return { error: "Profil nemá nastaveno mapování sloupců (mappings)" };

    // 2. Načti a parsuj soubor
    const file = formData.get("file") as File | null;
    if (!file) return { error: "Soubor není přiložen" };
    if (file.size > 10 * 1024 * 1024) return { error: "Soubor je příliš velký (max 10 MB)" };

    let parsed;
    try {
        const buf = Buffer.from(await file.arrayBuffer());
        parsed = parseCsvBuffer(buf, {
            delimiter:     profile.delimiter ?? undefined,
            encoding:      (profile.encoding as "utf-8" | "win-1250" | undefined) ?? undefined,
            headerRowIndex: profile.headerRowIndex,
        });
    } catch (e) {
        console.error("[bank-file-import] parseCsvBuffer error:", e);
        return { error: "Nepodařilo se načíst soubor. Zkontrolujte formát." };
    }

    // 3. Vytvoř mapování: targetField → sourceCol
    const fieldToCol = new Map<string, string>(
        mappings.map(m => [m.targetField, m.sourceCol])
    );
    const keyToCol = new Map<string, string>(
        matchKeys.map(m => [m.targetField, m.sourceCol])
    );

    const externalKeyCol = keyToCol.get("external_key");
    if (!externalKeyCol) return { error: "Profil nemá definovaný external_key v match_keys" };

    const dateFormat  = config.dateFormat ?? "dd/MM/yyyy";
    const decimalSep  = config.amountDecimalSeparator ?? ",";

    // 4. Vytvoř záznam import_history (run)
    const [importRun] = await db.insert(importHistory).values({
        importType:          "bank",
        profileId:            profile.id,
        profileNameSnapshot:  profile.name,
        filename:             file.name,
        encodingDetected:     parsed.encoding,
        recordsTotal:         parsed.totalRows,
        importedBy,
    }).returning({ id: importHistory.id });

    const importRunId = importRun.id;

    // 5. Zpracuj řádky
    let filtered   = 0;
    let inserted   = 0;
    let duplicates = 0;
    let ledgerNew  = 0;
    const autoMatch = { confirmed: 0, suggested: 0 };

    for (const row of parsed.rows) {
        // Filter dle směru platby
        if (config.filterColumn && config.filterValue) {
            const direction = getCol(row, config.filterColumn);
            if (!direction.includes(config.filterValue)) {
                filtered++;
                continue;
            }
        }

        // Unikátní klíč
        const externalKey = getCol(row, externalKeyCol);
        if (!externalKey) { filtered++; continue; }

        // Mapuj pole
        const paidAtRaw = getCol(row, fieldToCol.get("paid_at") ?? "");
        const amountRaw = getCol(row, fieldToCol.get("amount") ?? "");

        const paidAt  = parseDate(paidAtRaw, dateFormat);
        const amount  = parseAmount(amountRaw, decimalSep);

        if (!paidAt || amount === null) { filtered++; continue; }
        if (amount <= 0) { filtered++; continue; } // jen příchozí

        const vs              = getCol(row, fieldToCol.get("variable_symbol") ?? "") || null;
        const counterpartyAcc = getCol(row, fieldToCol.get("counterparty_account") ?? "") || null;
        const counterpartyNm  = getCol(row, fieldToCol.get("counterparty_name") ?? "") || null;
        const message         = getCol(row, fieldToCol.get("message") ?? "") || null;

        // Upsert do bank_import_transactions (idempotentní)
        // amount jako string pro NUMERIC(10,2) sloupec
        const amountStr = amount.toFixed(2);
        const upsertResult = await db.execute(sql`
            INSERT INTO app.bank_import_transactions
                (import_run_id, profile_id, external_key,
                 paid_at, amount, currency,
                 variable_symbol, counterparty_account, counterparty_name, message,
                 raw_data)
            VALUES
                (${importRunId}, ${profileId}, ${externalKey},
                 ${paidAt}, ${amountStr}::NUMERIC, 'CZK',
                 ${vs}, ${counterpartyAcc}, ${counterpartyNm}, ${message},
                 ${JSON.stringify(row)}::jsonb)
            ON CONFLICT (profile_id, external_key) DO NOTHING
            RETURNING id
        `);

        const newRows = upsertResult as unknown as Array<{ id: number }>;
        if (newRows.length === 0) {
            duplicates++;
            continue;
        }

        inserted++;
        const importTxId = newRows[0].id;

        // Vytvoř ledger záznam + auto-match
        await createLedgerFromImportTx(
            importTxId,
            importRunId,
            paidAt,
            amount,
            "CZK",
            vs,
            counterpartyAcc,
            counterpartyNm,
            message,
            importedBy,
        );
        ledgerNew++;

        // Načti výsledný stav ledgeru pro statistiku
        const [ledgerRow] = await db
            .select({
                status: sql<string>`
                    (SELECT reconciliation_status FROM app.payment_ledger
                     WHERE bank_import_tx_id = ${importTxId})
                `,
            })
            .from(bankImportTransactions)
            .where(eq(bankImportTransactions.id, importTxId));

        if (ledgerRow?.status === "confirmed") autoMatch.confirmed++;
        if (ledgerRow?.status === "suggested") autoMatch.suggested++;
    }

    // 6. Aktualizuj import_history se statistikami
    await db.update(importHistory)
        .set({
            recordsTotal:         parsed.totalRows,
            recordsMatched:       duplicates,
            recordsNewCandidates: inserted,
            recordsWithDiffs:     ledgerNew,
            recordsOnlyInDb:      filtered,
        })
        .where(eq(importHistory.id, importRunId));

    return {
        result: {
            total:      parsed.totalRows,
            filtered,
            inserted,
            duplicates,
            ledgerNew,
            autoMatch,
        },
    };
}

// ── Pomocné akce ─────────────────────────────────────────────────────────────

/** Vrátí seznam bankovních import profilů pro UI select */
export async function getBankImportProfiles() {
    const db = getDb();
    return db
        .select({ id: importProfiles.id, name: importProfiles.name, note: importProfiles.note })
        .from(importProfiles)
        .where(eq(importProfiles.profileType, "bank"))
        .orderBy(importProfiles.name);
}

/** Vrátí historii bankovních importů */
export async function getBankImportHistory(limit = 20) {
    const db = getDb();
    return db
        .select()
        .from(importHistory)
        .where(eq(importHistory.importType, "bank"))
        .orderBy(sql`${importHistory.importedAt} DESC`)
        .limit(limit);
}
