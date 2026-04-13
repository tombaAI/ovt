import { getDb } from "@/lib/db";
import { fioBankTransactions } from "@/db/schema";
import { sql } from "drizzle-orm";
import { loadBankTransactions, loadBankTransactionYears } from "@/lib/actions/bank";
import { BankImportClient } from "./bank-import-client";
import { CONTRIBUTION_YEAR } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function BankImportPage(props: {
    searchParams: Promise<{ year?: string }>;
}) {
    const { year: yearParam } = await props.searchParams;
    const db = getDb();

    const years = await loadBankTransactionYears();
    const selectedYear = Number(yearParam) || (years[0] ?? CONTRIBUTION_YEAR);

    const [stats] = await db.select({
        total:    sql<number>`count(*)`,
        lastDate: sql<string>`max(date)`,
        syncedAt: sql<string>`max(synced_at)`,
    }).from(fioBankTransactions);

    const lastSyncStr = stats.syncedAt
        ? new Date(stats.syncedAt).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })
        : null;

    const transactions = await loadBankTransactions(selectedYear);

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

            <BankImportClient
                transactions={transactions}
                years={years}
                selectedYear={selectedYear}
            />
        </div>
    );
}
