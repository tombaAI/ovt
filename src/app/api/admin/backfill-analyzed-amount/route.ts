import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { isWebhookAuthorized, unauthorizedResponse } from "@/app/api/webhooks/_auth";
import { getDb } from "@/lib/db";
import { eventExpenses, events } from "@/db/schema";
import { analyzeExpenseFile } from "@/lib/expense-analysis";
import { fetchPrivateBlobAsFile } from "@/lib/blob-fetch";

export const dynamic = "force-dynamic";

/**
 * Jednorázový backfill: doplní analyzed_amount u existujících nákladů s přílohou skutečnou
 * Gemini analýzou (ne odhadem). Viz docs/adr/0001-analyzed-amount-historical-backfill.md.
 *
 * Idempotentní a resumovatelný — bere jen řádky, kde analyzed_amount IS NULL a fileUrl IS NOT NULL,
 * na akcích BEZ výdajového zámku (lockForReimbursement). Volat opakovaně, dokud remaining != 0
 * (obchází timeout jedné serverless funkce při mnoha sekvenčních Gemini voláních).
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" ".../api/admin/backfill-analyzed-amount?limit=8"
 */
export async function POST(request: NextRequest) {
    if (!isWebhookAuthorized(request, "CRON_SECRET")) {
        return unauthorizedResponse();
    }

    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 8, 1), 20);

    const db = getDb();

    const pending = and(
        isNull(eventExpenses.analyzedAmount),
        isNotNull(eventExpenses.fileUrl),
        eq(events.lockForReimbursement, false),
    );

    const batch = await db
        .select({
            id: eventExpenses.id,
            amount: eventExpenses.amount,
            fileUrl: eventExpenses.fileUrl,
            fileName: eventExpenses.fileName,
            fileMime: eventExpenses.fileMime,
        })
        .from(eventExpenses)
        .innerJoin(events, eq(eventExpenses.eventId, events.id))
        .where(pending)
        .limit(limit);

    let updated = 0;
    let unreadable = 0;
    const failures: { id: number; error: string }[] = [];

    for (const row of batch) {
        try {
            const file = await fetchPrivateBlobAsFile(row.fileUrl!, row.fileName, row.fileMime);
            const analysis = await analyzeExpenseFile(file, { source: "backfill" });
            // Nečitelný doklad (Gemini vrátil null): pro jednorázový backfill uložíme jako baseline
            // aktuální amount — jinak by řádek zůstal NULL a resumování by ho zkoušelo donekonečna.
            // Reálně přečtené hodnoty se ukládají tak, jak jsou (skutečná neshoda se objeví).
            const baseline = analysis.total_amount != null ? String(analysis.total_amount) : row.amount;
            if (analysis.total_amount == null) unreadable++;
            await db
                .update(eventExpenses)
                .set({ analyzedAmount: baseline })
                .where(eq(eventExpenses.id, row.id));
            updated++;
        } catch (e) {
            failures.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
        }
    }

    // Zbývající řádky (jen ty, které ještě analýzu nedostaly — neúspěch nezapíše nic, zkusí se příště)
    const [{ remaining }] = await db
        .select({ remaining: sql<number>`count(*)::int` })
        .from(eventExpenses)
        .innerJoin(events, eq(eventExpenses.eventId, events.id))
        .where(pending);

    return NextResponse.json({ ok: true, processed: batch.length, updated, unreadable, failed: failures.length, failures, remaining });
}
