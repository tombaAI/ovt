import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bankTransactions } from "@/db/schema";
import { loadBankTransactions } from "@/lib/actions/bank";
import { BankImportClient } from "./bank-import-client";

export const dynamic = "force-dynamic";

export default async function BankImportPage() {
    const db = getDb();

    // Statistiky
    const [stats] = await db.select({
        total:   sql<number>`count(*)`,
        lastDate: sql<string>`max(date)`,
        syncedAt: sql<string>`max(synced_at)`,
    }).from(bankTransactions);

    const lastSyncStr = stats.syncedAt
        ? new Date(stats.syncedAt).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })
        : null;

    // Načteme posledních 500 transakcí pro zobrazení
    const transactions = await loadBankTransactions({ limit: 500 });

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Platby z banky (Fio)</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Inkrementální synchronizace probíhá automaticky každý den v 6:00.
                    Načteno celkem <strong>{Number(stats.total)}</strong> transakcí
                    {stats.lastDate && <>, poslední ze dne <strong>{stats.lastDate}</strong></>}.
                    {lastSyncStr && <> Poslední sync: {lastSyncStr}.</>}
                </p>
            </div>

            <BankImportClient transactions={transactions} />
        </div>
    );
}
