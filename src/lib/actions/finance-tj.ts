"use server";

import { getDb } from "@/lib/db";
import {
    importFinTjImports, importFinTjTransactions, importFinTjImportLines,
    importFinTjHospodareniImports, importFinTjHospodareniRows,
    importFinTjAllocations, memberContributions, contributionPeriods, members,
    paymentLedger, paymentAllocations,
    eventPaymentPrescriptions, eventRegistrations, events,
    mailEvents,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { parseTjFinancePdf, type TjParseResult } from "@/lib/parsers/tj-finance-parser";
import { parseHospodareniPdf } from "@/lib/parsers/tj-hospodareni-parser";
import { getEmailSettings, getResendClient } from "@/lib/email";
import { buildContribPaymentConfirmationEmail, buildEventPaymentConfirmationEmail } from "@/lib/email-templates/payment-confirmation";

// ── Typy ─────────────────────────────────────────────────────────────────────

export type FinanceTjImport = {
    id:            number;
    reportDate:    string;
    costCenter:    string;
    filterFrom:    string | null;
    filterTo:      string | null;
    filterRaw:     string | null;
    fileName:      string | null;
    importedBy:    string;
    importedAt:    Date;
    addedCount:    number;
    matchedCount:  number;
    conflictCount: number;
};

export type FinanceTjTransaction = {
    id:          number;
    importId:    number;
    docDate:     string;
    docNumber:   string;
    sourceCode:  string;
    description: string;
    accountCode: string;
    accountName: string;
    debit:       string;
    credit:      string;
    isSuspect:   boolean;
};

export type ImportLine = {
    id:             number;
    importId:       number;
    transactionId:  number | null;
    docNumber:      string;
    status:         "added" | "matched" | "conflict";
    conflictFields: string[];
    docDate:        string;
    sourceCode:     string;
    description:    string;
    accountCode:    string;
    accountName:    string;
    debit:          string;
    credit:         string;
};

export type ImportResult =
    | { error: string }
    | { success: true; importId: number; added: number; matched: number; conflicts: number; suspicious: number };

// ── Import PDF ────────────────────────────────────────────────────────────────

export async function importTjFinancePdf(formData: FormData): Promise<ImportResult> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };

    const file = formData.get("file") as File | null;
    if (!file) return { error: "Chybí soubor" };
    if (!file.name.toLowerCase().endsWith(".pdf")) return { error: "Očekáván PDF soubor" };

    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        console.log(`[finance-tj] PDF buffer: ${buffer.byteLength} bytes, soubor: ${file.name}`);

        const { extractText } = await import("unpdf");
        const { text, totalPages } = await extractText(new Uint8Array(buffer), { mergePages: true });
        const fullText = Array.isArray(text) ? text.join("\n") : text;
        console.log(`[finance-tj] PDF extrahován: ${totalPages} stran, ${fullText.length} znaků`);
        console.log(`[finance-tj] První 500 znaků:\n${fullText.slice(0, 500)}`);

        const parsed: TjParseResult = parseTjFinancePdf(fullText);
        console.log(`[finance-tj] Meta:`, parsed.meta);
        console.log(`[finance-tj] Transakcí: ${parsed.transactions.length}`);
        parsed.transactions.forEach((tx, i) =>
            console.log(`[finance-tj]   tx[${i}]: ${tx.docDate} ${tx.docNumber} ${tx.sourceCode} MD=${tx.debit} D=${tx.credit} | ${tx.description}`)
        );

        if (!parsed.meta.reportDate) {
            return { error: "Nepodařilo se rozpoznat datum sestavy. Je toto výsledovka po střediscích dokladově?" };
        }
        if (parsed.transactions.length === 0) {
            return { error: "V PDF nebyla nalezena žádná transakce." };
        }

        const db = getDb();

        // Cover záznam importu
        const [importRow] = await db
            .insert(importFinTjImports)
            .values({
                reportDate: parsed.meta.reportDate,
                costCenter: parsed.meta.costCenter,
                filterFrom: parsed.meta.filterFrom ?? undefined,
                filterTo:   parsed.meta.filterTo   ?? undefined,
                filterRaw:  parsed.meta.filterRaw  ?? undefined,
                fileName:   file.name,
                importedBy: session.user.email,
            })
            .returning({ id: importFinTjImports.id });

        // Batch lookup existujících transakcí podle doc_number
        const docNumbers = parsed.transactions.map(tx => tx.docNumber);
        const existingRows = await db
            .select()
            .from(importFinTjTransactions)
            .where(inArray(importFinTjTransactions.docNumber, docNumbers));
        const existingMap = new Map(existingRows.map(r => [r.docNumber, r]));

        // Rozdělit na nové a existující
        const newTxs = parsed.transactions.filter(tx => !existingMap.has(tx.docNumber));

        // Batch insert nových transakcí do master listu
        const newTxIdMap = new Map<string, number>(); // docNumber → id
        if (newTxs.length > 0) {
            const inserted = await db
                .insert(importFinTjTransactions)
                .values(newTxs.map(tx => ({
                    importId:    importRow.id,
                    docDate:     tx.docDate,
                    docNumber:   tx.docNumber,
                    sourceCode:  tx.sourceCode,
                    description: tx.description,
                    accountCode: tx.accountCode,
                    accountName: tx.accountName,
                    debit:       tx.debit.toFixed(2),
                    credit:      tx.credit.toFixed(2),
                })))
                .returning({ id: importFinTjTransactions.id, docNumber: importFinTjTransactions.docNumber });
            for (const row of inserted) newTxIdMap.set(row.docNumber, row.id);
        }

        // Sestavit rekonciliační log pro každý řádek importu
        const lines: Array<typeof importFinTjImportLines.$inferInsert> = [];
        let added = 0, matched = 0, conflicts = 0;

        for (const tx of parsed.transactions) {
            const existing = existingMap.get(tx.docNumber);
            const base = {
                importId:    importRow.id,
                docNumber:   tx.docNumber,
                docDate:     tx.docDate,
                sourceCode:  tx.sourceCode,
                description: tx.description,
                accountCode: tx.accountCode,
                accountName: tx.accountName,
                debit:       tx.debit.toFixed(2),
                credit:      tx.credit.toFixed(2),
            };

            if (existing) {
                const diff: string[] = [];
                if (existing.docDate    !== tx.docDate)             diff.push("docDate");
                if (parseFloat(existing.debit)  !== tx.debit)       diff.push("debit");
                if (parseFloat(existing.credit) !== tx.credit)      diff.push("credit");
                if (existing.description !== tx.description)        diff.push("description");
                if (existing.accountCode !== tx.accountCode)        diff.push("accountCode");
                if (existing.accountName !== tx.accountName)        diff.push("accountName");

                const status = diff.length === 0 ? "matched" as const : "conflict" as const;
                if (status === "matched") matched++; else conflicts++;
                console.log(`[finance-tj]   ${tx.docNumber}: ${status}${diff.length ? ` (${diff.join(", ")})` : ""}`);
                lines.push({ ...base, transactionId: existing.id, status, conflictFields: diff });
            } else {
                added++;
                console.log(`[finance-tj]   ${tx.docNumber}: added`);
                lines.push({ ...base, transactionId: newTxIdMap.get(tx.docNumber), status: "added", conflictFields: [] });
            }
        }

        await db.insert(importFinTjImportLines).values(lines);

        // ── Detekce podezřelých transakcí ────────────────────────────────────
        // Pokud PDF obsahuje filtr období (filterFrom–filterTo), porovnáme sadu
        // čísle dokladů v PDF se všemi transakcemi v DB za stejné období.
        // Transakce v DB, které v PDF chybí, označíme jako podezřelé (is_suspect=true).
        // Transakce, které jsou zpět v PDF a dříve byly podezřelé, odznačíme.
        let suspicious = 0;
        if (parsed.meta.filterFrom && parsed.meta.filterTo) {
            const dbTxsInPeriod = await db
                .select({
                    id:        importFinTjTransactions.id,
                    docNumber: importFinTjTransactions.docNumber,
                    isSuspect: importFinTjTransactions.isSuspect,
                })
                .from(importFinTjTransactions)
                .where(and(
                    gte(importFinTjTransactions.docDate, parsed.meta.filterFrom),
                    lte(importFinTjTransactions.docDate, parsed.meta.filterTo),
                ));

            const pdfDocNumbers = new Set(parsed.transactions.map(tx => tx.docNumber));

            const toMarkSuspect = dbTxsInPeriod
                .filter(tx => !pdfDocNumbers.has(tx.docNumber) && !tx.isSuspect)
                .map(tx => tx.id);

            const toUnsuspect = dbTxsInPeriod
                .filter(tx => pdfDocNumbers.has(tx.docNumber) && tx.isSuspect)
                .map(tx => tx.id);

            if (toMarkSuspect.length > 0) {
                await db.update(importFinTjTransactions)
                    .set({ isSuspect: true })
                    .where(inArray(importFinTjTransactions.id, toMarkSuspect));
                suspicious = toMarkSuspect.length;
                console.log(`[finance-tj] Podezřelé transakce (chybí v PDF): ${toMarkSuspect.length}`, toMarkSuspect);
            }
            if (toUnsuspect.length > 0) {
                await db.update(importFinTjTransactions)
                    .set({ isSuspect: false })
                    .where(inArray(importFinTjTransactions.id, toUnsuspect));
                console.log(`[finance-tj] Odznačeno podezřelých (vrátily se do PDF): ${toUnsuspect.length}`);
            }
        }

        revalidatePath("/dashboard/finance");
        return { success: true, importId: importRow.id, added, matched, conflicts, suspicious };
    } catch (e) {
        console.error("importTjFinancePdf error:", e);
        return { error: "Chyba při zpracování PDF" };
    }
}

// ── Dotazy ────────────────────────────────────────────────────────────────────

export async function getFinanceTjImports(): Promise<FinanceTjImport[]> {
    const db = getDb();

    // Correlated subquery nefunguje správně v Drizzle sql template — použijeme GROUP BY
    const [imports, lineCounts] = await Promise.all([
        db.select({
            id:         importFinTjImports.id,
            reportDate: importFinTjImports.reportDate,
            costCenter: importFinTjImports.costCenter,
            filterFrom: importFinTjImports.filterFrom,
            filterTo:   importFinTjImports.filterTo,
            filterRaw:  importFinTjImports.filterRaw,
            fileName:   importFinTjImports.fileName,
            importedBy: importFinTjImports.importedBy,
            importedAt: importFinTjImports.importedAt,
        }).from(importFinTjImports).orderBy(desc(importFinTjImports.importedAt)),

        db.select({
            importId: importFinTjImportLines.importId,
            status:   importFinTjImportLines.status,
            count:    sql<number>`COUNT(*)`.mapWith(Number),
        })
        .from(importFinTjImportLines)
        .groupBy(importFinTjImportLines.importId, importFinTjImportLines.status),
    ]);

    // Sestavit mapu počtů per import
    const countMap = new Map<number, { added: number; matched: number; conflict: number }>();
    for (const row of lineCounts) {
        if (!countMap.has(row.importId)) countMap.set(row.importId, { added: 0, matched: 0, conflict: 0 });
        const c = countMap.get(row.importId)!;
        if (row.status === "added")    c.added    = row.count;
        if (row.status === "matched")  c.matched  = row.count;
        if (row.status === "conflict") c.conflict = row.count;
    }

    return imports.map(imp => ({
        ...imp,
        addedCount:    countMap.get(imp.id)?.added    ?? 0,
        matchedCount:  countMap.get(imp.id)?.matched  ?? 0,
        conflictCount: countMap.get(imp.id)?.conflict ?? 0,
    }));
}

export async function getFinanceTjTransactions(): Promise<FinanceTjTransaction[]> {
    const db = getDb();
    return db
        .select()
        .from(importFinTjTransactions)
        .orderBy(desc(importFinTjTransactions.docDate));
}

export async function getImportLines(importId: number): Promise<ImportLine[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(importFinTjImportLines)
        .where(eq(importFinTjImportLines.importId, importId))
        .orderBy(importFinTjImportLines.docDate);
    return rows.map(r => ({
        ...r,
        conflictFields: r.conflictFields as string[],
    }));
}

// ── Hospodaření oddílů: typy ──────────────────────────────────────────────────

export type HospodareniImport = {
    id:          number;
    periodFrom:  string;
    periodTo:    string;
    prevodYear:  number | null;
    fileName:    string | null;
    importedBy:  string;
    importedAt:  Date;
    rowCount:    number;
};

export type HospodareniOddilRow = {
    oddilId:   string;
    oddilName: string;
    naklady:   number;
    vynosy:    number;
    vysledek:  number;
    prevod:    number;
    celkem:    number;
};

export type HospodareniWithReconciliation = {
    imp:           HospodareniImport;
    oddilRow:      HospodareniOddilRow | null;  // řádek pro náš oddíl (TJ_ODDIL_ID)
    txVysledek:    number;                      // SUM(credit) - SUM(debit) z výsledovek za stejné období
    txFrom:        string | null;               // nejstarší datum transakce v období
    txTo:          string | null;               // nejnovější datum transakce v období
};

// ── Hospodaření: import PDF ───────────────────────────────────────────────────

export type HospodareniImportResult =
    | { error: string }
    | { success: true; importId: number; rowCount: number };

export async function importTjHospodareniPdf(formData: FormData): Promise<HospodareniImportResult> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };

    const file = formData.get("file") as File | null;
    if (!file) return { error: "Chybí soubor" };
    if (!file.name.toLowerCase().endsWith(".pdf")) return { error: "Očekáván PDF soubor" };

    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const { extractText } = await import("unpdf");
        const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
        const fullText = Array.isArray(text) ? text.join("\n") : text;
        console.log(`[hospodareni] PDF extrahován, ${fullText.length} znaků`);
        console.log(`[hospodareni] První 500 znaků:\n${fullText.slice(0, 500)}`);

        const parsed = parseHospodareniPdf(fullText);
        console.log(`[hospodareni] Meta:`, parsed.meta);
        console.log(`[hospodareni] Řádků oddílů: ${parsed.rows.length}`);
        parsed.rows.forEach(r =>
            console.log(`[hospodareni]   ${r.oddilId} ${r.oddilName}: náklady=${r.naklady} výnosy=${r.vynosy} výsledek=${r.vysledek} prevod=${r.prevod} celkem=${r.celkem}`)
        );

        if (!parsed.meta.periodFrom || !parsed.meta.periodTo) {
            return { error: "Nepodařilo se rozpoznat období sestavy. Je toto správný dokument?" };
        }
        if (parsed.rows.length === 0) {
            return { error: "Nebyly nalezeny žádné řádky oddílů. Zkontrolujte formát PDF." };
        }

        const db = getDb();

        const [importRow] = await db
            .insert(importFinTjHospodareniImports)
            .values({
                periodFrom:  parsed.meta.periodFrom,
                periodTo:    parsed.meta.periodTo,
                prevodYear:  parsed.meta.prevodYear ?? undefined,
                fileName:    file.name,
                importedBy:  session.user.email,
            })
            .returning({ id: importFinTjHospodareniImports.id });

        await db.insert(importFinTjHospodareniRows).values(
            parsed.rows.map(r => ({
                importId:  importRow.id,
                oddilId:   r.oddilId,
                oddilName: r.oddilName,
                naklady:   r.naklady.toFixed(2),
                vynosy:    r.vynosy.toFixed(2),
                vysledek:  r.vysledek.toFixed(2),
                prevod:    r.prevod.toFixed(2),
                celkem:    r.celkem.toFixed(2),
            }))
        );

        revalidatePath("/dashboard/finance");
        return { success: true, importId: importRow.id, rowCount: parsed.rows.length };
    } catch (e) {
        console.error("importTjHospodareniPdf error:", e);
        return { error: "Chyba při zpracování PDF" };
    }
}

// ── Hospodaření: dotazy ───────────────────────────────────────────────────────

export async function getAllHospodareniWithReconciliation(): Promise<HospodareniWithReconciliation[]> {
    const db = getDb();
    const oddilId = process.env.TJ_ODDIL_ID ?? "207";

    const imports = await db
        .select({
            id:         importFinTjHospodareniImports.id,
            periodFrom: importFinTjHospodareniImports.periodFrom,
            periodTo:   importFinTjHospodareniImports.periodTo,
            prevodYear: importFinTjHospodareniImports.prevodYear,
            fileName:   importFinTjHospodareniImports.fileName,
            importedBy: importFinTjHospodareniImports.importedBy,
            importedAt: importFinTjHospodareniImports.importedAt,
        })
        .from(importFinTjHospodareniImports)
        .orderBy(desc(importFinTjHospodareniImports.periodTo));

    if (imports.length === 0) return [];

    const importIds = imports.map(i => i.id);

    // Řádky pro náš oddíl (inArray je bezpečnější než raw ANY)
    const oddilRows = await db
        .select()
        .from(importFinTjHospodareniRows)
        .where(and(
            inArray(importFinTjHospodareniRows.importId, importIds),
            eq(importFinTjHospodareniRows.oddilId, oddilId),
        ));
    const oddilRowMap = new Map(oddilRows.map(r => [r.importId, r]));

    // Počty řádků per import
    const rowCounts = await db
        .select({
            importId: importFinTjHospodareniRows.importId,
            count:    sql<number>`COUNT(*)`.mapWith(Number),
        })
        .from(importFinTjHospodareniRows)
        .where(inArray(importFinTjHospodareniRows.importId, importIds))
        .groupBy(importFinTjHospodareniRows.importId);
    const rowCountMap = new Map(rowCounts.map(r => [r.importId, r.count]));

    // Rekonciliace: součet výsledovky per období (jeden SQL pro všechny importy najednou)
    type ReconRow = { import_id: number; tx_vysledek: string; tx_from: string | null; tx_to: string | null };
    const reconResult = await db.execute<ReconRow>(sql`
        SELECT
            h.id                                                              AS import_id,
            COALESCE(SUM(tx.credit::numeric) - SUM(tx.debit::numeric), 0)    AS tx_vysledek,
            MIN(tx.doc_date::text)                                            AS tx_from,
            MAX(tx.doc_date::text)                                            AS tx_to
        FROM app.import_fin_tj_hospodareni_imports h
        LEFT JOIN app.import_fin_tj_transactions tx
               ON tx.doc_date BETWEEN h.period_from AND h.period_to
        WHERE h.id = ANY(${sql.raw(`ARRAY[${importIds.join(",")}]::integer[]`)})
        GROUP BY h.id
    `);
    const reconRows = reconResult as unknown as ReconRow[];
    const reconMap = new Map<number, ReconRow>(reconRows.map(r => [r.import_id, r]));

    return imports.map(imp => {
        const row    = oddilRowMap.get(imp.id) ?? null;
        const recon  = reconMap.get(imp.id);

        const oddilRow: HospodareniOddilRow | null = row ? {
            oddilId:   row.oddilId,
            oddilName: row.oddilName,
            naklady:   parseFloat(row.naklady),
            vynosy:    parseFloat(row.vynosy),
            vysledek:  parseFloat(row.vysledek),
            prevod:    parseFloat(row.prevod),
            celkem:    parseFloat(row.celkem),
        } : null;

        return {
            imp: {
                id:         imp.id,
                periodFrom: imp.periodFrom,
                periodTo:   imp.periodTo,
                prevodYear: imp.prevodYear,
                fileName:   imp.fileName,
                importedBy: imp.importedBy,
                importedAt: imp.importedAt,
                rowCount:   rowCountMap.get(imp.id) ?? 0,
            },
            oddilRow,
            txVysledek: recon ? parseFloat(recon.tx_vysledek) : 0,
            txFrom:     recon?.tx_from ?? null,
            txTo:       recon?.tx_to   ?? null,
        };
    });
}

// ── Stav účtu: typy ───────────────────────────────────────────────────────────

export type StavRok = {
    year:         number;
    startBalance: number | null;
    endBalance:   number | null;
    naklady:      number;
    vynosy:       number;
    txVysledek:   number;
    txCount:      number;
    isComplete:   boolean;
    matches:      boolean | null;
    latestTxDate: string | null;
    // Pro neuzavřené roky: nejnovější průběžná tabulka jako kontrolní bod
    snapshot: {
        date:           string;
        balance:        number;
        source:         string | null;
        // transakce od začátku roku DO data snapshotu
        txToSum:        number;
        txToCount:      number;
        snapshotMatches: boolean;    // startBalance + txToSum ≈ snapshot.balance
        // transakce PO datu snapshotu
        txAfterSum:     number;
        txAfterCount:   number;
    } | null;
};

export type StavUctuData = {
    oddilName:      string;
    years:          StavRok[];
    // Nejlepší aktuální odhad zůstatku pro summary nahoře
    currentBalance: number | null;
    currentDate:    string | null;  // ISO datum ke kterému je odhad platný
    currentIsExact: boolean;        // true = ověřený roční zůstatek, false = odhad
};

// ── Stav účtu: dotaz ──────────────────────────────────────────────────────────

export async function getStavUctu(): Promise<StavUctuData> {
    const db      = getDb();
    const oddilId = process.env.TJ_ODDIL_ID ?? "207";

    // Tabulky hospodaření pro náš oddíl
    const rows = await db
        .select({
            importId:   importFinTjHospodareniImports.id,
            periodFrom: importFinTjHospodareniImports.periodFrom,
            periodTo:   importFinTjHospodareniImports.periodTo,
            prevodYear: importFinTjHospodareniImports.prevodYear,
            fileName:   importFinTjHospodareniImports.fileName,
            celkem:     importFinTjHospodareniRows.celkem,
            prevod:     importFinTjHospodareniRows.prevod,
            oddilName:  importFinTjHospodareniRows.oddilName,
        })
        .from(importFinTjHospodareniImports)
        .innerJoin(
            importFinTjHospodareniRows,
            and(
                eq(importFinTjHospodareniRows.importId, importFinTjHospodareniImports.id),
                eq(importFinTjHospodareniRows.oddilId, oddilId),
            )
        )
        .orderBy(importFinTjHospodareniImports.periodTo, importFinTjHospodareniImports.id);

    const oddilName = rows[0]?.oddilName ?? "";

    if (rows.length === 0) return { oddilName, years: [], currentBalance: null, currentDate: null, currentIsExact: false };

    // Všechny transakce (z libovolného počtu importů výsledovek)
    const allTx = await db
        .select({ docDate: importFinTjTransactions.docDate, debit: importFinTjTransactions.debit, credit: importFinTjTransactions.credit })
        .from(importFinTjTransactions)
        .orderBy(importFinTjTransactions.docDate);

    // ── Sestav mapu zůstatků k 31.12.roku ────────────────────────────────────
    // Zdroje (priorita: přímá roční tabulka > prevod dalšího importu):
    const yearEnd = new Map<number, number>();

    for (const r of rows) {
        // Přímý roční zůstatek
        if (r.periodTo.endsWith("-12-31")) {
            const y = parseInt(r.periodTo.substring(0, 4));
            yearEnd.set(y, parseFloat(r.celkem));
        }
        // Implied zůstatek z prevod dalšího roku (nižší priorita)
        if (r.prevodYear !== null && !yearEnd.has(r.prevodYear)) {
            yearEnd.set(r.prevodYear, parseFloat(r.prevod));
        }
    }
    // Deduplikace tabulek: pro stejné period_to ponecháme nejnovější import
    const uniqueMap = new Map<string, typeof rows[0]>();
    for (const r of rows) {
        const ex = uniqueMap.get(r.periodTo);
        if (!ex || r.importId > ex.importId) uniqueMap.set(r.periodTo, r);
    }
    const tabulky = [...uniqueMap.values()].sort((a, b) => a.periodTo.localeCompare(b.periodTo));

    // ── Rozsah roků ──────────────────────────────────────────────────────────
    // Zahrnout i roky kde máme yearEnd data (např. 2023 z prevod 2024 tabulky)
    const yearEndKeys = [...yearEnd.keys()];
    const firstTxYear = allTx.length > 0 ? parseInt(allTx[0].docDate.substring(0, 4)) : null;
    const lastTxYear  = allTx.length > 0 ? parseInt(allTx[allTx.length - 1].docDate.substring(0, 4)) : null;
    const minYear = Math.min(
        firstTxYear ?? Infinity,
        yearEndKeys.length > 0 ? Math.min(...yearEndKeys) : Infinity,
    );
    const maxYear = Math.max(
        lastTxYear ?? -Infinity,
        yearEndKeys.length > 0 ? Math.max(...yearEndKeys) : -Infinity,
    );
    if (!isFinite(minYear) || !isFinite(maxYear)) return { oddilName, years: [], currentBalance: null, currentDate: null, currentIsExact: false };

    const years: StavRok[] = [];

    for (let year = minYear; year <= maxYear; year++) {
        const yStr  = year.toString();
        const from  = `${yStr}-01-01`;
        const to    = `${yStr}-12-31`;
        const yearTx = allTx.filter(tx => tx.docDate >= from && tx.docDate <= to);

        if (yearTx.length === 0 && !yearEnd.has(year) && !yearEnd.has(year - 1)) continue;

        const naklady    = yearTx.reduce((s, tx) => s + parseFloat(tx.debit),   0);
        const vynosy     = yearTx.reduce((s, tx) => s + parseFloat(tx.credit),  0);
        const txVysledek = vynosy - naklady;
        const startBalance = yearEnd.get(year - 1) ?? null;
        const endBalance   = yearEnd.get(year)     ?? null;
        const isComplete   = startBalance !== null && endBalance !== null;
        const delta        = isComplete ? endBalance! - startBalance! : null;
        const matches      = isComplete && delta !== null
            ? Math.abs(delta - txVysledek) < 0.01
            : null;

        // Nejnovější průběžná tabulka v tomto roce (snapshot pro neuzavřené roky)
        const yearTabs = tabulky.filter(t =>
            t.periodTo >= from && t.periodTo <= to && !t.periodTo.endsWith("-12-31")
        );
        const latestTab = yearTabs[yearTabs.length - 1] ?? null;
        let snapshot: StavRok["snapshot"] = null;
        if (latestTab) {
            const snapDate    = latestTab.periodTo;
            const snapBalance = parseFloat(latestTab.celkem);
            const txTo        = yearTx.filter(tx => tx.docDate <= snapDate);
            const txAfter     = yearTx.filter(tx => tx.docDate >  snapDate);
            const txToSum     = txTo.reduce((s, tx) => s + parseFloat(tx.credit) - parseFloat(tx.debit), 0);
            const txAfterSum  = txAfter.reduce((s, tx) => s + parseFloat(tx.credit) - parseFloat(tx.debit), 0);
            snapshot = {
                date:            snapDate,
                balance:         snapBalance,
                source:          latestTab.fileName,
                txToSum,
                txToCount:       txTo.length,
                snapshotMatches: startBalance !== null && Math.abs((startBalance + txToSum) - snapBalance) < 0.01,
                txAfterSum,
                txAfterCount:    txAfter.length,
            };
        }

        const latestTxDate = yearTx.length > 0 ? yearTx[yearTx.length - 1].docDate : null;

        years.push({ year, startBalance, endBalance, naklady, vynosy, txVysledek, txCount: yearTx.length, isComplete, matches, snapshot, latestTxDate });
    }

    // Summary: nejlepší aktuální odhad zůstatku
    const lastYear = years[years.length - 1] ?? null;
    let currentBalance: number | null = null;
    let currentDate:    string | null = null;
    let currentIsExact  = false;

    if (lastYear) {
        if (lastYear.endBalance !== null && lastYear.isComplete) {
            // Uzavřený rok — přesný roční zůstatek
            currentBalance = lastYear.endBalance;
            currentDate    = `${lastYear.year}-12-31`;
            currentIsExact = true;
        } else if (lastYear.snapshot && lastYear.startBalance !== null) {
            // Neuzavřený rok se snapshotem — odhad k datu poslední transakce
            currentBalance = lastYear.startBalance + lastYear.txVysledek;
            currentDate    = lastYear.latestTxDate;
            currentIsExact = false;
        } else if (lastYear.endBalance !== null) {
            // Jen rok-end zůstatek bez kompletní rekonciliace
            currentBalance = lastYear.endBalance;
            currentDate    = `${lastYear.year}-12-31`;
            currentIsExact = false;
        }
    }

    return { oddilName, years, currentBalance, currentDate, currentIsExact };
}

// ── TJ Alokace: typy ──────────────────────────────────────────────────────────

export type TjAllocation = {
    id:                  number;
    tjTransactionId:     number;
    // Příspěvek:
    contribId:           number | null;
    memberId:            number | null;
    memberName:          string | null;
    year:                number | null;
    // Akce:
    eventPrescriptionId: number | null;
    prescriptionCode:    number | null;
    eventName:           string | null;
    registrantName:      string | null;
    // Společné:
    amount:              string;
    note:                string | null;
    createdBy:           string;
    createdAt:           Date;
};

export type ContribOption = {
    contribId:       number;
    memberId:        number;
    memberName:      string;
    year:            number;
    amountTotal:     number | null;
    variableSymbol:  number | null;
    allocatedAmount: number;   // součet existujících payment_allocations
};

export type AllocResult = { error: string } | { success: true };

// ── TJ Alokace: akce ─────────────────────────────────────────────────────────

export async function getTjAllocations(tjTransactionId: number): Promise<TjAllocation[]> {
    const db = getDb();

    // Příspěvky
    const contribRows = await db
        .select({
            id:                  importFinTjAllocations.id,
            tjTransactionId:     importFinTjAllocations.tjTransactionId,
            contribId:           importFinTjAllocations.contribId,
            eventPrescriptionId: importFinTjAllocations.eventPrescriptionId,
            memberId:            importFinTjAllocations.memberId,
            memberName:          members.fullName,
            year:                contributionPeriods.year,
            amount:              importFinTjAllocations.amount,
            note:                importFinTjAllocations.note,
            createdBy:           importFinTjAllocations.createdBy,
            createdAt:           importFinTjAllocations.createdAt,
        })
        .from(importFinTjAllocations)
        .innerJoin(members, eq(members.id, importFinTjAllocations.memberId))
        .innerJoin(memberContributions, eq(memberContributions.id, importFinTjAllocations.contribId))
        .innerJoin(contributionPeriods, eq(contributionPeriods.id, memberContributions.periodId))
        .where(and(
            eq(importFinTjAllocations.tjTransactionId, tjTransactionId),
            sql`${importFinTjAllocations.contribId} IS NOT NULL`,
        ))
        .orderBy(importFinTjAllocations.createdAt);

    // Akce / event prescriptions
    const eventRows = await db
        .select({
            id:                  importFinTjAllocations.id,
            tjTransactionId:     importFinTjAllocations.tjTransactionId,
            eventPrescriptionId: importFinTjAllocations.eventPrescriptionId,
            prescriptionCode:    eventPaymentPrescriptions.prescriptionCode,
            eventName:           events.name,
            registrantFirstName: eventRegistrations.firstName,
            registrantLastName:  eventRegistrations.lastName,
            amount:              importFinTjAllocations.amount,
            note:                importFinTjAllocations.note,
            createdBy:           importFinTjAllocations.createdBy,
            createdAt:           importFinTjAllocations.createdAt,
        })
        .from(importFinTjAllocations)
        .innerJoin(eventPaymentPrescriptions, eq(eventPaymentPrescriptions.id, importFinTjAllocations.eventPrescriptionId))
        .innerJoin(eventRegistrations, eq(eventRegistrations.id, eventPaymentPrescriptions.registrationId))
        .innerJoin(events, eq(events.id, eventPaymentPrescriptions.eventId))
        .where(and(
            eq(importFinTjAllocations.tjTransactionId, tjTransactionId),
            sql`${importFinTjAllocations.eventPrescriptionId} IS NOT NULL`,
        ))
        .orderBy(importFinTjAllocations.createdAt);

    const contribAllocs: TjAllocation[] = contribRows.map(r => ({
        id:                  r.id,
        tjTransactionId:     r.tjTransactionId,
        contribId:           r.contribId,
        memberId:            r.memberId,
        memberName:          r.memberName,
        year:                Number(r.year),
        eventPrescriptionId: null,
        prescriptionCode:    null,
        eventName:           null,
        registrantName:      null,
        amount:              r.amount,
        note:                r.note,
        createdBy:           r.createdBy,
        createdAt:           r.createdAt,
    }));

    const eventAllocs: TjAllocation[] = eventRows.map(r => ({
        id:                  r.id,
        tjTransactionId:     r.tjTransactionId,
        contribId:           null,
        memberId:            null,
        memberName:          null,
        year:                null,
        eventPrescriptionId: r.eventPrescriptionId,
        prescriptionCode:    r.prescriptionCode,
        eventName:           r.eventName,
        registrantName:      `${r.registrantFirstName} ${r.registrantLastName}`,
        amount:              r.amount,
        note:                r.note,
        createdBy:           r.createdBy,
        createdAt:           r.createdAt,
    }));

    return [...contribAllocs, ...eventAllocs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function getAllTjAllocationSums(): Promise<Map<number, number>> {
    const db = getDb();
    const rows = await db
        .select({
            tjTransactionId: importFinTjAllocations.tjTransactionId,
            total:           sql<number>`SUM(amount::numeric)`.mapWith(Number),
        })
        .from(importFinTjAllocations)
        .groupBy(importFinTjAllocations.tjTransactionId);
    return new Map(rows.map(r => [r.tjTransactionId, r.total]));
}

export async function getContribsForAllocation(): Promise<ContribOption[]> {
    const db = getDb();
    const rows = await db
        .select({
            contribId:       memberContributions.id,
            memberId:        memberContributions.memberId,
            memberName:      members.fullName,
            year:            contributionPeriods.year,
            amountTotal:     memberContributions.amountTotal,
            variableSymbol:  members.variableSymbol,
            allocatedAmount: sql<number>`COALESCE(SUM(${paymentAllocations.amount}::numeric), 0)`.mapWith(Number),
        })
        .from(memberContributions)
        .innerJoin(members, eq(members.id, memberContributions.memberId))
        .innerJoin(contributionPeriods, eq(contributionPeriods.id, memberContributions.periodId))
        .leftJoin(paymentAllocations, eq(paymentAllocations.contribId, memberContributions.id))
        .groupBy(memberContributions.id, members.id, contributionPeriods.id)
        .orderBy(members.lastName, members.firstName, desc(contributionPeriods.year));
    return rows.map(r => ({
        ...r,
        year:            Number(r.year),
        variableSymbol:  r.variableSymbol ?? null,
        allocatedAmount: r.allocatedAmount ?? 0,
    }));
}

export async function createTjAllocation(params: {
    tjTransactionId: number;
    contribId:       number;
    memberId:        number;
    amount:          number;
    note?:           string;
    sendEmail?:      boolean;
}): Promise<AllocResult> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };
    try {
        const db = getDb();

        // Načteme TJ transakci pro datum a popis
        const [tjTx] = await db
            .select({ docDate: importFinTjTransactions.docDate, description: importFinTjTransactions.description, docNumber: importFinTjTransactions.docNumber })
            .from(importFinTjTransactions)
            .where(eq(importFinTjTransactions.id, params.tjTransactionId));
        if (!tjTx) return { error: "TJ transakce nenalezena" };

        // 1. Zapsat do payment_ledger → viditelné v přehledu příspěvků
        const [ledgerRow] = await db
            .insert(paymentLedger)
            .values({
                sourceType:           "tj_finance",
                paidAt:               tjTx.docDate,
                amount:               params.amount.toFixed(2),
                message:              tjTx.description,
                note:                 params.note || `TJ doklad: ${tjTx.docNumber}`,
                reconciliationStatus: "confirmed",
                createdBy:            session.user.email,
            })
            .returning({ id: paymentLedger.id });

        // 2. Zapsat alokaci do payment_allocations
        await db.insert(paymentAllocations).values({
            ledgerId:    ledgerRow.id,
            contribId:   params.contribId,
            memberId:    params.memberId,
            amount:      params.amount.toFixed(2),
            isSuggested: false,
            confirmedBy: session.user.email,
            confirmedAt: new Date(),
            createdBy:   session.user.email,
        });

        // 3. Zapsat do TJ alokační tabulky s vazbou na ledger
        await db.insert(importFinTjAllocations).values({
            tjTransactionId: params.tjTransactionId,
            contribId:       params.contribId,
            memberId:        params.memberId,
            ledgerId:        ledgerRow.id,
            amount:          params.amount.toFixed(2),
            note:            params.note || null,
            createdBy:       session.user.email,
        });

        // ── Potvrzovací e-mail členovi ───────────────────────────────────────
        try {
            const emailSettings = getEmailSettings();
            if (params.sendEmail !== false && emailSettings.configured) {
                const [memberRow] = await db
                    .select({ email: members.email, firstName: members.firstName, lastName: members.lastName, variableSymbol: members.variableSymbol })
                    .from(members).where(eq(members.id, params.memberId));
                const [contribRow] = await db
                    .select({ amountTotal: memberContributions.amountTotal })
                    .from(memberContributions).where(eq(memberContributions.id, params.contribId));
                const [periodRow] = await db
                    .select({ year: contributionPeriods.year })
                    .from(contributionPeriods)
                    .innerJoin(memberContributions, eq(memberContributions.periodId, contributionPeriods.id))
                    .where(eq(memberContributions.id, params.contribId));

                if (memberRow?.email) {
                    const toEmail = emailSettings.testTo ?? memberRow.email;
                    const { subject, html } = buildContribPaymentConfirmationEmail({
                        firstName:      memberRow.firstName,
                        lastName:       memberRow.lastName,
                        year:           Number(periodRow?.year ?? new Date().getFullYear()),
                        amountPaid:     contribRow?.amountTotal ?? params.amount,
                        paidAt:         tjTx.docDate,
                        variableSymbol: memberRow.variableSymbol,
                    });
                    const resend = getResendClient();
                    let messageId: string | null = null;
                    let sendError: string | null = null;
                    try {
                        const result = await resend.emails.send({ from: emailSettings.from, to: toEmail, subject, html, ...(emailSettings.replyTo ? { replyTo: emailSettings.replyTo } : {}) });
                        messageId = result.data?.id ?? null;
                    } catch (err) {
                        sendError = String(err);
                        console.error("createTjAllocation: e-mail failed", err);
                    }
                    await db.insert(mailEvents).values({
                        provider: "resend", direction: "outbound",
                        eventType: sendError ? "send_failed" : "sent",
                        emailType: "contrib_payment_confirmation",
                        messageId, fromEmail: emailSettings.from, toEmail, subject,
                        payload:  { error: sendError, tjTransactionId: params.tjTransactionId },
                        memberId: params.memberId, contribId: params.contribId,
                    });
                }
            }
        } catch (emailErr) {
            console.error("createTjAllocation: e-mail pipeline error", emailErr);
            // Neblokuje úspěch párování
        }

        revalidatePath("/dashboard/finance");
        revalidatePath("/dashboard/contributions");
        return { success: true };
    } catch (e) {
        console.error("createTjAllocation error:", e);
        return { error: "Chyba při ukládání alokace" };
    }
}

export async function deleteTjAllocation(allocationId: number): Promise<AllocResult> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };
    try {
        const db = getDb();

        const [alloc] = await db
            .select({ ledgerId: importFinTjAllocations.ledgerId, eventPrescriptionId: importFinTjAllocations.eventPrescriptionId })
            .from(importFinTjAllocations)
            .where(eq(importFinTjAllocations.id, allocationId));

        // Příspěvky: smazat payment_allocations → payment_ledger
        if (alloc?.ledgerId && !alloc.eventPrescriptionId) {
            await db.delete(paymentAllocations).where(eq(paymentAllocations.ledgerId, alloc.ledgerId));
            await db.delete(paymentLedger).where(eq(paymentLedger.id, alloc.ledgerId));
        }
        // Akce: vrátit event prescription na pending + smazat ledger
        if (alloc?.eventPrescriptionId && alloc.ledgerId) {
            await db.update(eventPaymentPrescriptions)
                .set({ status: "pending", matchedLedgerId: null, matchedAmount: null, matchedAt: null, updatedAt: new Date() })
                .where(eq(eventPaymentPrescriptions.id, alloc.eventPrescriptionId));
            await db.delete(paymentLedger).where(eq(paymentLedger.id, alloc.ledgerId));
        }

        await db.delete(importFinTjAllocations).where(eq(importFinTjAllocations.id, allocationId));

        revalidatePath("/dashboard/finance");
        revalidatePath("/dashboard/contributions");
        return { success: true };
    } catch (e) {
        console.error("deleteTjAllocation error:", e);
        return { error: "Chyba při mazání alokace" };
    }
}

// ── Event prescription párování ───────────────────────────────────────────────

export type EventPrescriptionOption = {
    prescriptionId:   number;
    prescriptionCode: number;
    eventId:          number;
    eventName:        string;
    registrationId:   number;
    registrantName:   string;
    amount:           string;
    status:           string;
    variableSymbol:   string;
};

export async function getEventPrescriptionsForAllocation(): Promise<EventPrescriptionOption[]> {
    const db = getDb();
    const rows = await db
        .select({
            prescriptionId:   eventPaymentPrescriptions.id,
            prescriptionCode: eventPaymentPrescriptions.prescriptionCode,
            eventId:          eventPaymentPrescriptions.eventId,
            eventName:        events.name,
            registrationId:   eventPaymentPrescriptions.registrationId,
            registrantFirst:  eventRegistrations.firstName,
            registrantLast:   eventRegistrations.lastName,
            amount:           eventPaymentPrescriptions.amount,
            status:           eventPaymentPrescriptions.status,
            variableSymbol:   eventPaymentPrescriptions.variableSymbol,
        })
        .from(eventPaymentPrescriptions)
        .innerJoin(events, eq(events.id, eventPaymentPrescriptions.eventId))
        .innerJoin(eventRegistrations, eq(eventRegistrations.id, eventPaymentPrescriptions.registrationId))
        .where(sql`${eventPaymentPrescriptions.status} IN ('pending', 'matched')`)
        .orderBy(events.name, eventRegistrations.lastName, eventRegistrations.firstName);
    return rows.map(r => ({
        prescriptionId:   r.prescriptionId,
        prescriptionCode: r.prescriptionCode,
        eventId:          r.eventId,
        eventName:        r.eventName,
        registrationId:   r.registrationId,
        registrantName:   `${r.registrantFirst} ${r.registrantLast}`,
        amount:           r.amount,
        status:           r.status,
        variableSymbol:   r.variableSymbol,
    }));
}

// ── Správa podezřelých transakcí ─────────────────────────────────────────────

export async function deleteSuspectTjTransaction(txId: number): Promise<AllocResult> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };
    try {
        const db = getDb();

        // Zamezit smazání, pokud existují alokace (cascade by smazal ledger záznamy)
        const [existingAlloc] = await db
            .select({ id: importFinTjAllocations.id })
            .from(importFinTjAllocations)
            .where(eq(importFinTjAllocations.tjTransactionId, txId))
            .limit(1);

        if (existingAlloc) return { error: "Transakce má alokace — nejprve je odeberte v dialogu párování" };

        await db.delete(importFinTjTransactions).where(eq(importFinTjTransactions.id, txId));

        revalidatePath("/dashboard/finance");
        return { success: true };
    } catch (e) {
        console.error("deleteSuspectTjTransaction error:", e);
        return { error: "Chyba při mazání transakce" };
    }
}

export async function dismissSuspectTjTransaction(txId: number): Promise<AllocResult> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };
    try {
        const db = getDb();
        await db.update(importFinTjTransactions)
            .set({ isSuspect: false })
            .where(eq(importFinTjTransactions.id, txId));

        revalidatePath("/dashboard/finance");
        return { success: true };
    } catch (e) {
        console.error("dismissSuspectTjTransaction error:", e);
        return { error: "Chyba při zamítnutí příznaku" };
    }
}

export async function createTjEventAllocation(params: {
    tjTransactionId:  number;
    prescriptionId:   number;
    amount:           number;
    note?:            string;
    sendEmail?:       boolean;
}): Promise<AllocResult> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };
    try {
        const db = getDb();

        const [tjTx] = await db
            .select({ docDate: importFinTjTransactions.docDate, description: importFinTjTransactions.description, docNumber: importFinTjTransactions.docNumber })
            .from(importFinTjTransactions)
            .where(eq(importFinTjTransactions.id, params.tjTransactionId));
        if (!tjTx) return { error: "TJ transakce nenalezena" };

        const [presc] = await db
            .select({ id: eventPaymentPrescriptions.id, status: eventPaymentPrescriptions.status })
            .from(eventPaymentPrescriptions)
            .where(eq(eventPaymentPrescriptions.id, params.prescriptionId));
        if (!presc) return { error: "Předpis platby nenalezen" };
        if (presc.status === "paid") return { error: "Tento předpis je již zaplacen" };

        // 1. Zapsat do payment_ledger
        const [ledgerRow] = await db
            .insert(paymentLedger)
            .values({
                sourceType:           "tj_finance",
                paidAt:               tjTx.docDate,
                amount:               params.amount.toFixed(2),
                message:              tjTx.description,
                note:                 params.note || `TJ doklad: ${tjTx.docNumber}`,
                reconciliationStatus: "confirmed",
                createdBy:            session.user.email,
            })
            .returning({ id: paymentLedger.id });

        // 2. Aktualizovat event prescription
        await db.update(eventPaymentPrescriptions)
            .set({
                status:          "matched",
                matchedLedgerId: ledgerRow.id,
                matchedAmount:   params.amount.toFixed(2),
                matchedAt:       new Date(),
                updatedAt:       new Date(),
            })
            .where(eq(eventPaymentPrescriptions.id, params.prescriptionId));

        // 3. Zapsat do TJ alokační tabulky
        await db.insert(importFinTjAllocations).values({
            tjTransactionId:     params.tjTransactionId,
            eventPrescriptionId: params.prescriptionId,
            ledgerId:            ledgerRow.id,
            amount:              params.amount.toFixed(2),
            note:                params.note || null,
            createdBy:           session.user.email,
        });

        // ── Potvrzovací e-mail přihlášenému ─────────────────────────────────
        try {
            const emailSettings = getEmailSettings();
            if (params.sendEmail !== false && emailSettings.configured) {
                const [prescFull] = await db
                    .select({ prescriptionCode: eventPaymentPrescriptions.prescriptionCode, registrationId: eventPaymentPrescriptions.registrationId, eventId: eventPaymentPrescriptions.eventId })
                    .from(eventPaymentPrescriptions)
                    .where(eq(eventPaymentPrescriptions.id, params.prescriptionId));
                const [regRow] = prescFull ? await db
                    .select({ email: eventRegistrations.email, firstName: eventRegistrations.firstName, lastName: eventRegistrations.lastName })
                    .from(eventRegistrations)
                    .where(eq(eventRegistrations.id, prescFull.registrationId)) : [];
                const [eventRow] = prescFull ? await db
                    .select({ name: events.name })
                    .from(events)
                    .where(eq(events.id, prescFull.eventId)) : [];

                if (regRow?.email && eventRow && prescFull) {
                    const toEmail = emailSettings.testTo ?? regRow.email;
                    const { subject, html } = buildEventPaymentConfirmationEmail({
                        firstName:        regRow.firstName,
                        lastName:         regRow.lastName,
                        eventName:        eventRow.name,
                        amountPaid:       params.amount,
                        paidAt:           tjTx.docDate,
                        prescriptionCode: prescFull.prescriptionCode,
                    });
                    const resend = getResendClient();
                    let messageId: string | null = null;
                    let sendError: string | null = null;
                    try {
                        const result = await resend.emails.send({ from: emailSettings.from, to: toEmail, subject, html, ...(emailSettings.replyTo ? { replyTo: emailSettings.replyTo } : {}) });
                        messageId = result.data?.id ?? null;
                    } catch (err) {
                        sendError = String(err);
                        console.error("createTjEventAllocation: e-mail failed", err);
                    }
                    await db.insert(mailEvents).values({
                        provider: "resend", direction: "outbound",
                        eventType: sendError ? "send_failed" : "sent",
                        emailType: "event_payment_confirmation",
                        messageId, fromEmail: emailSettings.from, toEmail, subject,
                        payload:  { error: sendError, tjTransactionId: params.tjTransactionId, prescriptionId: params.prescriptionId },
                    });
                }
            }
        } catch (emailErr) {
            console.error("createTjEventAllocation: e-mail pipeline error", emailErr);
            // Neblokuje úspěch párování
        }

        revalidatePath("/dashboard/finance");
        return { success: true };
    } catch (e) {
        console.error("createTjEventAllocation error:", e);
        return { error: "Chyba při ukládání alokace" };
    }
}
