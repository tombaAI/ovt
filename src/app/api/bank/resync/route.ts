import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncBankTransactionsByPeriod } from "@/lib/actions/bank";

export const dynamic = "force-dynamic";

/**
 * POST /api/bank/resync
 * Body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 *
 * Resync za zvolené období — pro počáteční naplnění nebo opravu dat.
 * Vyžaduje přihlášení (admin session).
 */
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let from: string, to: string;
    try {
        const body = await request.json();
        from = body.from;
        to = body.to;
        if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            throw new Error("Neplatný formát datumu");
        }
    } catch (err) {
        return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
    }

    try {
        const result = await syncBankTransactionsByPeriod(from, to);
        console.log(`[bank/resync] OK user=${session.user.email} period=${from}..${to} total=${result.total} inserted=${result.inserted} skipped=${result.skipped}`);
        return NextResponse.json({ ok: true, ...result });
    } catch (err) {
        console.error("[bank/resync] Chyba:", err);
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
}
