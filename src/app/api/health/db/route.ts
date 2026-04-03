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
        const [row] = await sql<{
            admin_users_table: string | null;
            checked_at: string;
            database_name: string;
            mail_events_table: string | null;
        }[]>`
            select
                current_database() as database_name,
                now()::text as checked_at,
                to_regclass('app.admin_users')::text as admin_users_table,
                to_regclass('app.mail_events')::text as mail_events_table
        `;

        const schemaReady = Boolean(row.admin_users_table && row.mail_events_table);

        return NextResponse.json(
            {
                ok: schemaReady,
                configured: true,
                detail: schemaReady
                    ? `Připojeno k databázi ${row.database_name} a první migrace je přítomná.`
                    : `Připojeno k databázi ${row.database_name}, ale první migrace ještě není aplikovaná.`,
                checkedAt: row.checked_at,
                databaseName: row.database_name,
                schemaReady,
                tables: {
                    adminUsers: row.admin_users_table,
                    mailEvents: row.mail_events_table
                }
            },
            {
                status: schemaReady ? 200 : 503
            }
        );
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
