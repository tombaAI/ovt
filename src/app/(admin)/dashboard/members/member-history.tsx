"use client";

import { useEffect, useState } from "react";
import {
    getMemberHistory, getMemberEventRegistrations,
    type MemberYearRecord, type MemberEventReg,
} from "@/lib/actions/members";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtDateShort(iso: string | null): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

function fmt(n: number | null) {
    if (n === null) return "—";
    return n.toLocaleString("cs-CZ") + " Kč";
}

function fmtSource(s: string) {
    if (s === "fio_bank") return "FIO";
    if (s === "file_import") return "import";
    if (s === "cash") return "hotovost";
    if (s === "tj_finance") return "TJ";
    return s;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
    cpv: "CPV",
    foreign: "Zahraniční",
    recreational: "Rekreační",
    club: "Oddílová",
    race: "Závod",
    brigada: "Brigáda",
    other: "Jiná",
};

function prescStatusBadge(status: string | null) {
    if (!status) return null;
    if (status === "paid") return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">zaplaceno</span>;
    if (status === "matched") return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">spárováno</span>;
    if (status === "pending") return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">čeká</span>;
    if (status === "cancelled") return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">storno</span>;
    return null;
}

// ── ContributionHistory ───────────────────────────────────────────────────────

export function ContributionHistory({ memberId }: { memberId: number }) {
    const [rows, setRows] = useState<MemberYearRecord[] | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    useEffect(() => {
        getMemberHistory(memberId).then(setRows);
    }, [memberId]);

    function toggle(year: number) {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(year)) { next.delete(year); } else { next.add(year); }
            return next;
        });
    }

    if (!rows) return <p className="text-xs text-gray-400 py-2">Načítám…</p>;
    if (rows.length === 0) return <p className="text-xs text-gray-400 py-2">Žádné záznamy</p>;

    return (
        <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[360px]">
                <thead>
                    <tr className="border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <th className="text-left pb-2 pr-3">Rok</th>
                        <th className="text-right pb-2 pr-3">Předpis</th>
                        <th className="text-right pb-2 pr-3">Zaplaceno</th>
                        <th className="text-right pb-2">Stav</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => {
                        const balance = r.hasContrib && r.amountTotal !== null
                            ? r.paidTotal - r.amountTotal
                            : null;
                        const isExpanded = expanded.has(r.year);
                        const hasPayments = r.payments.length > 0;
                        return (
                            <tr
                                key={r.year}
                                className={["border-b", hasPayments ? "cursor-pointer hover:bg-muted/30" : ""].join(" ")}
                                onClick={() => hasPayments && toggle(r.year)}
                            >
                                <td className="py-1.5 pr-3 font-semibold text-gray-800">
                                    <span className="flex items-center gap-1">
                                        {hasPayments && (
                                            <span className="text-gray-400 text-[10px]">{isExpanded ? "▾" : "▸"}</span>
                                        )}
                                        {r.year}
                                    </span>
                                    {isExpanded && r.payments.map(p => (
                                        <div key={p.id} className="mt-1 ml-3 text-xs text-gray-400 font-normal flex items-center gap-1.5">
                                            <span>{p.paidAt ? fmtDateShort(p.paidAt) : "—"}</span>
                                            <span className="text-[10px] px-1 rounded bg-gray-100 text-gray-500">{fmtSource(p.sourceType)}</span>
                                            {p.isSuggested && <span className="text-[10px] text-amber-500">návrh</span>}
                                            {p.note && <span className="italic truncate max-w-[120px]">{p.note}</span>}
                                        </div>
                                    ))}
                                </td>
                                {r.hasContrib ? (
                                    <>
                                        <td className="py-1.5 pr-3 text-right font-mono text-xs text-gray-600 align-top">{fmt(r.amountTotal)}</td>
                                        <td className="py-1.5 pr-3 text-right font-mono text-xs text-gray-600 align-top">
                                            {fmt(r.paidTotal)}
                                            {isExpanded && r.payments.map(p => (
                                                <div key={p.id} className="mt-1 text-xs font-semibold text-gray-700">
                                                    {p.amount.toLocaleString("cs-CZ")} Kč
                                                </div>
                                            ))}
                                        </td>
                                        <td className="py-1.5 text-right text-xs font-medium align-top">
                                            {balance === null && <span className="text-gray-400">—</span>}
                                            {balance === 0 && <span className="text-green-600">OK</span>}
                                            {balance !== null && balance > 0 && (
                                                <span className="text-blue-600">+{balance.toLocaleString("cs-CZ")} Kč</span>
                                            )}
                                            {balance !== null && balance < 0 && (
                                                <span className="text-red-600">{balance.toLocaleString("cs-CZ")} Kč</span>
                                            )}
                                        </td>
                                    </>
                                ) : (
                                    <td colSpan={3} className="py-1.5 pl-2 text-xs font-medium text-amber-600">
                                        ⚠ Chybí předpis
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ── EventHistory ──────────────────────────────────────────────────────────────

export function EventHistory({ memberId }: { memberId: number }) {
    const [rows, setRows] = useState<MemberEventReg[] | null>(null);

    useEffect(() => {
        getMemberEventRegistrations(memberId).then(setRows);
    }, [memberId]);

    if (!rows) return <p className="text-xs text-gray-400 py-2">Načítám…</p>;
    if (rows.length === 0) return <p className="text-xs text-gray-400 py-2">Žádné přihlášky</p>;

    return (
        <div className="space-y-1">
            {rows.map(r => {
                const cancelled = Boolean(r.cancelledAt);
                return (
                    <div
                        key={r.registrationId}
                        className={["rounded-lg border px-3 py-2", cancelled ? "opacity-50" : ""].join(" ")}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className={["text-sm font-medium truncate", cancelled ? "line-through text-gray-400" : ""].join(" ")}>
                                    {r.eventName}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                                    <span>{r.year}</span>
                                    {r.dateFrom && (
                                        <span>
                                            {fmtDateShort(r.dateFrom)}
                                            {r.dateTo && r.dateTo !== r.dateFrom ? ` – ${fmtDateShort(r.dateTo)}` : ""}
                                        </span>
                                    )}
                                    <span className="px-1 rounded bg-gray-100 text-gray-500">
                                        {EVENT_TYPE_LABELS[r.eventType] ?? r.eventType}
                                    </span>
                                    {r.personsCount > 1 && <span>{r.personsCount} os.</span>}
                                    {cancelled && <span className="text-red-500">storno</span>}
                                </div>
                            </div>
                            <div className="shrink-0 text-right space-y-0.5">
                                {r.prescriptionAmount !== null && (
                                    <p className="text-xs font-mono font-semibold text-gray-700">
                                        {r.prescriptionAmount.toLocaleString("cs-CZ")} Kč
                                    </p>
                                )}
                                {prescStatusBadge(r.prescriptionStatus)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
