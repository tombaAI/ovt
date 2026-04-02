import { NextResponse } from "next/server";

import { getAdminEmailList, getRuntimeFlags } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

export async function GET() {
    const adminEmails = getAdminEmailList();
    const runtime = getRuntimeFlags();

    return NextResponse.json({
        ok: true,
        configured: true,
        detail:
            "Aplikace běží. Další praktické kroky jsou nastavit DATABASE_URL, ADMIN_EMAILS, MAIL_FROM a případně napojit Vercel doménu.",
        adminEmails,
        runtime,
        timestamp: new Date().toISOString()
    });
}
