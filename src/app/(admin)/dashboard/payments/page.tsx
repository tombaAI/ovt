import Link from "next/link";
import {
    loadLedgerRows,
    getLedgerStats,
    type ReconciliationStatus,
} from "@/lib/actions/reconciliation";
import { PaymentsClient } from "./payments-client";
import { getSelectedYear } from "@/lib/actions/year";

export const dynamic = "force-dynamic";

const VALID_SOURCES = ["fio_bank", "file_import", "cash"] as const;
type SourceFilter = typeof VALID_SOURCES[number];

export default async function PaymentsPage(props: {
    searchParams: Promise<{ status?: string; source?: string; profileId?: string }>;
}) {
    const { status: statusParam, source: sourceParam, profileId: profileIdParam } = await props.searchParams;

    const selectedYear = await getSelectedYear();

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
            <div className="flex items-start justify-between gap-4">
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
                <Link href="/dashboard/payments/history"
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground border border-gray-200 rounded-full px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors">
                    Historie importů →
                </Link>
            </div>

            <PaymentsClient
                rows={rows}
                stats={stats}
                selectedYear={selectedYear}
                statusFilter={statusFilter}
                sourceFilter={sourceFilter}
                profileIdFilter={profileIdFilter}
            />
        </div>
    );
}
