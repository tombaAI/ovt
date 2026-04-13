import {
    loadLedgerRows,
    getLedgerStats,
    loadLedgerYears,
    type ReconciliationStatus,
} from "@/lib/actions/reconciliation";
import { PaymentsClient } from "./payments-client";
import { CONTRIBUTION_YEAR } from "@/lib/constants";

export const dynamic = "force-dynamic";

const VALID_SOURCES = ["fio_bank", "file_import", "cash"] as const;
type SourceFilter = typeof VALID_SOURCES[number];

export default async function PaymentsPage(props: {
    searchParams: Promise<{ year?: string; status?: string; source?: string; profileId?: string }>;
}) {
    const { year: yearParam, status: statusParam, source: sourceParam, profileId: profileIdParam } = await props.searchParams;

    const years        = await loadLedgerYears();
    const selectedYear = Number(yearParam) || (years[0] ?? CONTRIBUTION_YEAR);

    const validStatuses: ReconciliationStatus[] = ["unmatched", "suggested", "confirmed", "ignored"];
    const statusFilter = validStatuses.includes(statusParam as ReconciliationStatus)
        ? (statusParam as ReconciliationStatus)
        : undefined;

    const sourceFilter = VALID_SOURCES.includes(sourceParam as SourceFilter)
        ? (sourceParam as SourceFilter)
        : undefined;

    const profileIdFilter = profileIdParam ? Number(profileIdParam) : undefined;

    const [rows, stats] = await Promise.all([
        loadLedgerRows({ year: selectedYear, status: statusFilter, source: sourceFilter, profileId: profileIdFilter }),
        getLedgerStats(selectedYear),
    ]);

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Platební ledger</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Přehled příchozích plateb z Fio banky, bankovních souborů a hotovosti
                    za rok {selectedYear} — celkem {stats.total} plateb:{" "}
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
                sourceFilter={sourceFilter}
                profileIdFilter={profileIdFilter}
            />
        </div>
    );
}
