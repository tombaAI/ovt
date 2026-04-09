import { NextRequest, NextResponse } from "next/server";
import { isWebhookAuthorized, unauthorizedResponse } from "@/app/api/webhooks/_auth";
import { syncBankTransactionsLast } from "@/lib/actions/bank";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/sync-bank
 *
 * Volán Vercel Cronem — provede inkrementální sync plateb z Fio (od posledního stažení).
 * Lze vyvolat i ručně s Bearer tokenem CRON_SECRET.
 */
export async function GET(request: NextRequest) {
    if (!isWebhookAuthorized(request, "CRON_SECRET")) {
        return unauthorizedResponse();
    }

    try {
        const result = await syncBankTransactionsLast();
        console.log(`[cron/sync-bank] OK — total=${result.total} inserted=${result.inserted} skipped=${result.skipped}`);
        return NextResponse.json({ ok: true, ...result });
    } catch (err) {
        console.error("[cron/sync-bank] Chyba při synchronizaci:", err);
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
}
