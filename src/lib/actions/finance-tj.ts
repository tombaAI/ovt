"use server";

import { getDb } from "@/lib/db";
import {
    importFinTjImports, importFinTjTransactions, importFinTjImportLines,
    importFinTjHospodareniImports, importFinTjHospodareniRows,
} from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { parseTjFinancePdf, type TjParseResult } from "@/lib/parsers/tj-finance-parser";
import { parseHospodareniPdf } from "@/lib/parsers/tj-hospodareni-parser";

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
    | { success: true; importId: number; added: number; matched: number; conflicts: number };

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

        revalidatePath("/dashboard/finance");
        return { success: true, importId: importRow.id, added, matched, conflicts };
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
