"use server";

import { getDb } from "@/lib/db";
import { importFinTjImports, importFinTjTransactions } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { parseTjFinancePdf, type TjParseResult } from "@/lib/parsers/tj-finance-parser";

// ── Typy ─────────────────────────────────────────────────────────────────────

export type FinanceTjImport = {
    id:         number;
    reportDate: string;
    costCenter: string;
    filterFrom: string | null;
    filterTo:   string | null;
    filterRaw:  string | null;
    fileName:   string | null;
    importedBy: string;
    importedAt: Date;
    txCount:    number;
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

export type ImportResult =
    | { error: string }
    | { success: true; importId: number; inserted: number; skipped: number };

// ── Import PDF ────────────────────────────────────────────────────────────────

export async function importTjFinancePdf(formData: FormData): Promise<ImportResult> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };

    const file = formData.get("file") as File | null;
    if (!file) return { error: "Chybí soubor" };
    if (!file.name.toLowerCase().endsWith(".pdf")) return { error: "Očekáván PDF soubor" };

    try {
        const buffer = Buffer.from(await file.arrayBuffer());

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse") as (
            buffer: Buffer
        ) => Promise<{ text: string }>;
        const { text } = await pdfParse(buffer);

        const parsed: TjParseResult = parseTjFinancePdf(text);

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
                reportDate:  parsed.meta.reportDate,
                costCenter:  parsed.meta.costCenter,
                filterFrom:  parsed.meta.filterFrom ?? undefined,
                filterTo:    parsed.meta.filterTo   ?? undefined,
                filterRaw:   parsed.meta.filterRaw  ?? undefined,
                fileName:    file.name,
                importedBy:  session.user.email,
            })
            .returning({ id: importFinTjImports.id });

        // Idempotentní insert — při konfliktu na doc_number nic neudělá
        const result = await db
            .insert(importFinTjTransactions)
            .values(
                parsed.transactions.map(tx => ({
                    importId:    importRow.id,
                    docDate:     tx.docDate,
                    docNumber:   tx.docNumber,
                    sourceCode:  tx.sourceCode,
                    description: tx.description,
                    accountCode: tx.accountCode,
                    accountName: tx.accountName,
                    debit:       tx.debit.toFixed(2),
                    credit:      tx.credit.toFixed(2),
                }))
            )
            .onConflictDoNothing({ target: importFinTjTransactions.docNumber })
            .returning({ id: importFinTjTransactions.id });

        const inserted = result.length;
        const skipped  = parsed.transactions.length - inserted;

        revalidatePath("/dashboard/finance");
        return { success: true, importId: importRow.id, inserted, skipped };
    } catch (e) {
        console.error("importTjFinancePdf error:", e);
        return { error: "Chyba při zpracování PDF" };
    }
}

// ── Dotazy ────────────────────────────────────────────────────────────────────

export async function getFinanceTjImports(): Promise<FinanceTjImport[]> {
    const db = getDb();
    const rows = await db
        .select({
            id:         importFinTjImports.id,
            reportDate: importFinTjImports.reportDate,
            costCenter: importFinTjImports.costCenter,
            filterFrom: importFinTjImports.filterFrom,
            filterTo:   importFinTjImports.filterTo,
            filterRaw:  importFinTjImports.filterRaw,
            fileName:   importFinTjImports.fileName,
            importedBy: importFinTjImports.importedBy,
            importedAt: importFinTjImports.importedAt,
            txCount:    sql<number>`(
                SELECT COUNT(*) FROM app.import_fin_tj_transactions t
                WHERE t.import_id = ${importFinTjImports.id}
            )`.mapWith(Number),
        })
        .from(importFinTjImports)
        .orderBy(desc(importFinTjImports.reportDate));

    return rows;
}

export async function getFinanceTjTransactions(importId?: number): Promise<FinanceTjTransaction[]> {
    const db = getDb();
    const query = db
        .select()
        .from(importFinTjTransactions)
        .orderBy(desc(importFinTjTransactions.docDate));

    if (importId !== undefined) {
        return query.where(eq(importFinTjTransactions.importId, importId));
    }
    return query;
}
