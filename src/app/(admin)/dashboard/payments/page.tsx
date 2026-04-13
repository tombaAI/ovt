import {
    loadLedgerRows,
    getLedgerStats,
    loadLedgerYears,
    type ReconciliationStatus,
} from "@/lib/actions/reconciliation";
import { PaymentsClient } from "./payments-client";
import { CONTRIBUTION_YEAR } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function PaymentsPage(props: {
    searchParams: Promise<{ year?: string; status?: string }>;
}) {
    const { year: yearParam, status: statusParam } = await props.searchParams;

    const years        = await loadLedgerYears();
    const selectedYear = Number(yearParam) || (years[0] ?? CONTRIBUTION_YEAR);

    const validStatuses: ReconciliationStatus[] = ["unmatched", "suggested", "confirmed", "ignored"];
    const statusFilter = validStatuses.includes(statusParam as ReconciliationStatus)
        ? (statusParam as ReconciliationStatus)
        : undefined;

    const [rows, stats] = await Promise.all([
        loadLedgerRows({ year: selectedYear, status: statusFilter }),
        getLedgerStats(),
    ]);

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Platební ledger</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Přehled všech příchozích plateb z Fio banky, bankovních souborů a hotovosti.
                    Celkem {stats.total} plateb —{" "}
                    <span className="text-amber-600 font-medium">{stats.unmatched} nespárováno</span>,{" "}
                    <span className="text-blue-600 font-medium">{stats.suggested} ke kontrole</span>,{" "}
                    <span className="text-green-700 font-medium">{stats.confirmed} potvrzeno</span>.
                </p>
            </div>

            <PaymentsClient
                rows={rows}
                stats={stats}
                years={years}
                selectedYear={selectedYear}
                statusFilter={statusFilter}
            />
        </div>
    );
}
