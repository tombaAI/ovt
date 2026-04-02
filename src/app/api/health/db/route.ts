import { NextResponse } from "next/server";

import { getSqlClient, hasDatabaseUrl } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        detail: "DATABASE_URL zatím není nastavená. Aplikace bez ní běží, ale neověří spojení do PostgreSQL."
      },
      {
        status: 503
      }
    );
  }

  try {
    const sql = getSqlClient();
    const [row] = await sql<{ checked_at: string; database_name: string }[]>`
      select current_database() as database_name, now()::text as checked_at
    `;

    return NextResponse.json({
      ok: true,
      configured: true,
      detail: `Připojeno k databázi ${row.database_name}.`,
      checkedAt: row.checked_at,
      databaseName: row.database_name
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        detail: "Nepodařilo se připojit k databázi. Zkontroluj DATABASE_URL, síťový přístup a heslo k databázi."
      },
      {
        status: 503
      }
    );
  }
}
