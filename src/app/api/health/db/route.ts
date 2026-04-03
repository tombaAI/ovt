import { NextResponse } from "next/server";

import { checkDatabase } from "@/lib/health";
import { hasDatabaseUrl } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
    if (!hasDatabaseUrl()) {
        return NextResponse.json(
            {
                ok: false,
                configured: false,
                detail: "DATABASE_URL není nastavená."
            },
            { status: 503 }
        );
    }

    const result = await checkDatabase();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
