"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PaymentSheet } from "./payment-sheet";
import type { LedgerRow, LedgerStats, ReconciliationStatus } from "@/lib/actions/reconciliation";

type SourceFilter = "fio_bank" | "file_import" | "cash";

interface Props {
    rows:         LedgerRow[];
    stats:        LedgerStats;
    years:        number[];
    selectedYear: number;
    statusFilter: ReconciliationStatus | undefined;
    sourceFilter: SourceFilter | undefined;
}

const STATUS_LABELS: Record<ReconciliationStatus, string> = {
    unmatched: "Nespárováno",
    suggested: "Ke kontrole",
    confirmed: "Potvrzeno",
    ignored:   "Ignorováno",
};

const STATUS_BADGE: Record<ReconciliationStatus, string> = {
    unmatched: "bg-gray-100 text-gray-600 border-gray-200",
    suggested: "bg-blue-100 text-blue-700 border-blue-200",
    confirmed: "bg-green-100 text-green-800 border-green-200",
    ignored:   "bg-amber-100 text-amber-700 border-amber-200",
};

const SOURCE_LABELS: Record<string, string> = {
    fio_bank:    "Fio",
    file_import: "Soubor",
    cash:        "Hotovost",
};

const SOURCE_BADGE: Record<string, string> = {
    fio_bank:    "bg-violet-100 text-violet-700 border-violet-200",
    file_import: "bg-sky-100 text-sky-700 border-sky-200",
    cash:        "bg-orange-100 text-orange-700 border-orange-200",
};

function formatAmount(amount: number) {
    return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 2 }).format(amount);
}

export function PaymentsClient({ rows, stats, years, selectedYear, statusFilter, sourceFilter }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [pendingYear, setPendingYear] = useState<number | null>(null);
    const [detail, setDetail] = useState<LedgerRow | null>(null);

    const displayYear = pendingYear ?? selectedYear;

    function buildParams(overrides: { year?: number; status?: string | null; source?: string | null }) {
        const params = new URLSearchParams({ year: String(overrides.year ?? displayYear) });
        const s = "status" in overrides ? overrides.status : statusFilter;
        const src = "source" in overrides ? overrides.source : sourceFilter;
        if (s)   params.set("status", s);
        if (src) params.set("source", src);
        return params.toString();
    }

    function navigateYear(year: number) {
        setPendingYear(year);
        startTransition(() => {
            router.push(`/dashboard/payments?${buildParams({ year })}`);
        });
    }

    function navigateStatus(status: ReconciliationStatus | undefined) {
        startTransition(() => {
            router.push(`/dashboard/payments?${buildParams({ status: status ?? null })}`);
        });
    }

    function navigateSource(source: SourceFilter | undefined) {
        startTransition(() => {
            router.push(`/dashboard/payments?${buildParams({ source: source ?? null })}`);
        });
    }

    const filterPills: Array<{ label: string; value: ReconciliationStatus | undefined; count?: number }> = [
        { label: "Vše",          value: undefined,    count: stats.total },
        { label: "Nespárováno",  value: "unmatched",  count: stats.unmatched },
        { label: "Ke kontrole",  value: "suggested",  count: stats.suggested },
        { label: "Potvrzeno",    value: "confirmed",  count: stats.confirmed },
        { label: "Ignorováno",   value: "ignored",    count: stats.ignored },
    ];

    return (
        <>
            {/* Year tabs */}
            {years.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
                    {years.map(y => (
                        <button key={y}
                            onClick={() => navigateYear(y)}
                            disabled={isPending}
                            className={[
                                "inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold transition-colors shrink-0",
                                y === displayYear
                                    ? "bg-[#26272b] text-white"
                                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                            ].join(" ")}>
                            {y}
                        </button>
                    ))}
                </div>
            )}

            {/* Status filter pills */}
            <div className="flex gap-2 flex-wrap">
                {filterPills.map(pill => (
                    <button key={pill.label}
                        onClick={() => navigateStatus(pill.value)}
                        disabled={isPending}
                        className={[
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors",
                            pill.value === statusFilter
                                ? "bg-[#26272b] text-white font-semibold"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                        ].join(" ")}>
                        {pill.label}
                        {pill.count !== undefined && (
                            <span className={[
                                "text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center",
                                pill.value === statusFilter
                                    ? "bg-white/20 text-white"
                                    : "bg-gray-100 text-gray-500",
                            ].join(" ")}>
                                {pill.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Source filter pills */}
            <div className="flex gap-2 flex-wrap">
                {([undefined, "fio_bank", "file_import", "cash"] as const).map(src => {
                    const label = src === undefined ? "Všechny zdroje" : SOURCE_LABELS[src];
                    const isActive = src === sourceFilter;
                    return (
                        <button key={src ?? "all"}
                            onClick={() => navigateSource(src)}
                            disabled={isPending}
                            className={[
                                "inline-flex items-center px-3 py-1 rounded-full text-xs transition-colors border",
                                isActive
                                    ? "bg-[#26272b] text-white border-[#26272b] font-semibold"
                                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
                            ].join(" ")}>
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* Tabulka */}
            <div className={`rounded-lg border overflow-x-auto transition-opacity duration-150 ${isPending ? "opacity-25 pointer-events-none" : ""}`}>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-gray-50 text-xs text-muted-foreground">
                            <th className="text-left px-3 py-2 font-medium">Datum</th>
                            <th className="text-right px-3 py-2 font-medium">Částka</th>
                            <th className="text-left px-3 py-2 font-medium">VS</th>
                            <th className="text-left px-3 py-2 font-medium">Protistrana / Zpráva</th>
                            <th className="text-left px-3 py-2 font-medium">Zdroj</th>
                            <th className="text-left px-3 py-2 font-medium">Stav</th>
                            <th className="text-left px-3 py-2 font-medium">Člen</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                                    {statusFilter
                                        ? `Žádné platby se stavem „${STATUS_LABELS[statusFilter]}" pro rok ${displayYear}.`
                                        : `Žádné platby pro rok ${displayYear}.`}
                                </td>
                            </tr>
                        )}
                        {rows.map(row => (
                            <tr key={row.id}
                                onClick={() => setDetail(row)}
                                className="hover:bg-gray-50 transition-colors cursor-pointer">
                                <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                                    {row.paidAt}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap text-green-700">
                                    {formatAmount(row.amount)}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                    {row.variableSymbol ?? <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2 text-xs max-w-[220px]">
                                    <div className="truncate font-medium">{row.counterpartyName ?? <span className="text-muted-foreground">—</span>}</div>
                                    {row.message && <div className="truncate text-muted-foreground">{row.message}</div>}
                                </td>
                                <td className="px-3 py-2">
                                    <Badge className={`text-xs font-normal border ${SOURCE_BADGE[row.sourceType] ?? "bg-gray-100 text-gray-600"}`}>
                                        {SOURCE_LABELS[row.sourceType] ?? row.sourceType}
                                    </Badge>
                                </td>
                                <td className="px-3 py-2">
                                    <Badge className={`text-xs font-normal border ${STATUS_BADGE[row.reconciliationStatus]}`}>
                                        {STATUS_LABELS[row.reconciliationStatus]}
                                    </Badge>
                                </td>
                                <td className="px-3 py-2 text-xs">
                                    {row.allocations.length > 0 ? (
                                        <span className="font-medium">
                                            {row.allocations.map(a => a.memberName).join(", ")}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {rows.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    {rows.length} plateb pro rok {displayYear}
                    {statusFilter ? ` · filtr: ${STATUS_LABELS[statusFilter]}` : ""}
                </p>
            )}

            {/* Detail sheet */}
            {detail && (
                <PaymentSheet
                    row={detail}
                    year={displayYear}
                    onClose={() => setDetail(null)}
                    onUpdated={() => { setDetail(null); router.refresh(); }}
                />
            )}
        </>
    );
}
