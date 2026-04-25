"use server";

import { getDb } from "@/lib/db";
import { importFinTjImports, importFinTjTransactions, importFinTjImportLines } from "@/db/schema";
import { desc, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { parseTjFinancePdf, type TjParseResult } from "@/lib/parsers/tj-finance-parser";

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
    return db
        .select({
            id:            importFinTjImports.id,
            reportDate:    importFinTjImports.reportDate,
            costCenter:    importFinTjImports.costCenter,
            filterFrom:    importFinTjImports.filterFrom,
            filterTo:      importFinTjImports.filterTo,
            filterRaw:     importFinTjImports.filterRaw,
            fileName:      importFinTjImports.fileName,
            importedBy:    importFinTjImports.importedBy,
            importedAt:    importFinTjImports.importedAt,
            addedCount:    sql<number>`(SELECT COUNT(*) FROM app.import_fin_tj_import_lines l WHERE l.import_id = ${importFinTjImports.id} AND l.status = 'added')`.mapWith(Number),
            matchedCount:  sql<number>`(SELECT COUNT(*) FROM app.import_fin_tj_import_lines l WHERE l.import_id = ${importFinTjImports.id} AND l.status = 'matched')`.mapWith(Number),
            conflictCount: sql<number>`(SELECT COUNT(*) FROM app.import_fin_tj_import_lines l WHERE l.import_id = ${importFinTjImports.id} AND l.status = 'conflict')`.mapWith(Number),
        })
        .from(importFinTjImports)
        .orderBy(desc(importFinTjImports.importedAt));
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
        .where(sql`${importFinTjImportLines.importId} = ${importId}`)
        .orderBy(importFinTjImportLines.docDate);
    return rows.map(r => ({
        ...r,
        conflictFields: r.conflictFields as string[],
    }));
}
