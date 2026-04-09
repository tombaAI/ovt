"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentSheet } from "./payment-sheet";
import type { ContribRow, PeriodTab, PeriodDetail, PeriodStatus } from "./page";

type FilterKey = "all" | "issues" | "paid" | "underpaid" | "overpaid" | "unpaid" | "todo";

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "issues",    label: "Problémy"    },
    { key: "unpaid",    label: "Nezaplaceno" },
    { key: "underpaid", label: "Nedoplatek"  },
    { key: "overpaid",  label: "Přeplatek"   },
    { key: "paid",      label: "Zaplaceno"   },
    { key: "todo",      label: "S úkolem"    },
    { key: "all",       label: "Všichni"     },
];

const STATUS_BADGE: Record<ContribRow["status"], { label: string; cls: string }> = {
    paid:      { label: "Zaplaceno",   cls: "bg-[#327600]/10 text-[#327600] border-0"     },
    overpaid:  { label: "Přeplatek",   cls: "bg-orange-100 text-orange-700 border-0"      },
    underpaid: { label: "Nedoplatek",  cls: "bg-red-100 text-red-700 border-0"            },
    unpaid:    { label: "Nezaplaceno", cls: "bg-red-50 text-red-600 border border-red-200" },
};

const LIFECYCLE: Record<PeriodStatus, { label: string; cls: string }> = {
    draft:      { label: "Příprava",        cls: "bg-gray-100 text-gray-700 border border-gray-300" },
    confirmed:  { label: "Potvrzeno",       cls: "bg-blue-100 text-blue-700 border border-blue-200" },
    collecting: { label: "Výběr příspěvků", cls: "bg-[#327600]/10 text-[#327600] border border-[#327600]/20" },
    closed:     { label: "Uzavřeno",        cls: "bg-slate-100 text-slate-500 border border-slate-200" },
};

function fmt(n: number | null) {
    if (n === null) return "—";
    return n.toLocaleString("cs-CZ") + " Kč";
}

function diff(row: ContribRow): number | null {
    if (row.amountTotal === null) return null;
    return row.paidTotal - row.amountTotal;
}

interface Props {
    periods: PeriodTab[];
    period: PeriodDetail;
    rows: ContribRow[];
}

export function ContributionsClient({ periods, period, rows }: Props) {
    const router = useRouter();
    const [filter, setFilter]         = useState<FilterKey>("issues");
    const [sheetOpen, setSheetOpen]   = useState(false);
    const [editContribId, setEditContribId] = useState<number | null>(null);

    const editRow = editContribId !== null ? (rows.find(r => r.contribId === editContribId) ?? null) : null;

    const onPaymentUpdated = useCallback(() => { router.refresh(); }, [router]);

    function openEdit(r: ContribRow) {
        setEditContribId(r.contribId);
        setSheetOpen(true);
        router.refresh();
    }

    const counts = useMemo(() => ({
        all:       rows.length,
        paid:      rows.filter(r => r.status === "paid").length,
        overpaid:  rows.filter(r => r.status === "overpaid").length,
        underpaid: rows.filter(r => r.status === "underpaid").length,
        unpaid:    rows.filter(r => r.status === "unpaid").length,
        issues:    rows.filter(r => r.status !== "paid").length,
        todo:      rows.filter(r => r.todoNote !== null).length,
    }), [rows]);

    const filtered = useMemo(() => {
        if (filter === "all")    return rows;
        if (filter === "issues") return rows.filter(r => r.status !== "paid");
        if (filter === "todo")   return rows.filter(r => r.todoNote !== null);
        return rows.filter(r => r.status === filter);
    }, [rows, filter]);

    const stats = useMemo(() => ({
        collected: rows.reduce((s, r) => s + r.paidTotal, 0),
        expected:  rows.reduce((s, r) => s + (r.amountTotal ?? 0), 0),
    }), [rows]);

    const lifecycle = LIFECYCLE[period.status as PeriodStatus] ?? LIFECYCLE.collecting;

    return (
        <div className="space-y-5">
            {/* ── Year tabs ── */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
                {periods.map(p => {
                    const lc = LIFECYCLE[p.status as PeriodStatus] ?? LIFECYCLE.collecting;
                    const isSelected = p.year === period.year;
                    return (
                        <button key={p.year}
                            onClick={() => router.push(`/dashboard/contributions?year=${p.year}`)}
                            className={[
                                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors shrink-0",
                                isSelected
                                    ? "bg-[#26272b] text-white"
                                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                            ].join(" ")}>
                            {p.year}
                            <span className={[
                                "text-xs px-1.5 py-0.5 rounded-full border",
                                isSelected ? "bg-white/15 text-white border-white/20" : lc.cls,
                            ].join(" ")}>
                                {lc.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ── Period header ── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Příspěvky {period.year}</h1>
                    <p className="text-gray-500 mt-0.5 text-sm">
                        Základ {period.amountBase} Kč
                        {period.amountBoat1 > 0 && ` · Loď 1 ${period.amountBoat1} Kč`}
                        {period.amountBoat2 > 0 && ` · Loď 2 ${period.amountBoat2} Kč`}
                        {period.amountBoat3 > 0 && ` · Loď 3 ${period.amountBoat3} Kč`}
                        {period.dueDate && ` · Splatnost ${period.dueDate}`}
                    </p>
                </div>
                <Badge className={`${lifecycle.cls} text-sm font-medium px-3 py-1 shrink-0`}>
                    {lifecycle.label}
                </Badge>
            </div>

            {/* ── Summary tiles ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Zaplaceno správně</p>
                    <p className="text-2xl font-semibold text-[#327600]">{counts.paid}</p>
                </div>
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Nezaplaceno</p>
                    <p className="text-2xl font-semibold text-red-600">{counts.unpaid}</p>
                </div>
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Nedoplatek / přeplatek</p>
                    <p className="text-2xl font-semibold text-orange-500">{counts.underpaid + counts.overpaid}</p>
                </div>
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Vybráno / očekáváno</p>
                    <p className="text-lg font-semibold text-gray-800">{stats.collected.toLocaleString("cs-CZ")} Kč</p>
                    <p className="text-xs text-gray-400">z {stats.expected.toLocaleString("cs-CZ")} Kč</p>
                </div>
            </div>

            {/* ── Filter pills ── */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-none">
                {FILTERS.map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={[
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0",
                            filter === f.key
                                ? f.key === "todo" ? "bg-orange-500 text-white" : "bg-[#327600] text-white"
                                : f.key === "todo" && counts.todo > 0
                                    ? "bg-orange-50 text-orange-700 border border-orange-300 hover:bg-orange-100"
                                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                        ].join(" ")}>
                        {f.label}
                        <span className={[
                            "text-xs rounded-full px-1.5",
                            filter === f.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
                        ].join(" ")}>
                            {counts[f.key]}
                        </span>
                    </button>
                ))}
            </div>

            {/* ── Mobile cards ── */}
            <div className="md:hidden space-y-2">
                {filtered.length === 0 && (
                    <p className="text-center text-gray-400 py-12 text-sm">Žádné záznamy</p>
                )}
                {filtered.map(r => {
                    const d = diff(r);
                    const sb = STATUS_BADGE[r.status];
                    return (
                        <button key={r.contribId} onClick={() => openEdit(r)}
                            className="w-full text-left bg-white rounded-xl border border-gray-200 p-3.5 active:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-gray-900">{r.firstName} {r.lastName}</p>
                                <Badge className={`${sb.cls} text-xs font-normal shrink-0`}>{sb.label}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-sm text-gray-500">
                                <span>Předpis: <strong className="text-gray-800">{fmt(r.amountTotal)}</strong></span>
                                <span>Zaplaceno: <strong className="text-gray-800">{fmt(r.paidTotal)}</strong></span>
                                {d !== null && d !== 0 && (
                                    <span className={d > 0 ? "text-orange-600" : "text-red-600"}>
                                        {d > 0 ? `+${d.toLocaleString("cs-CZ")}` : d.toLocaleString("cs-CZ")} Kč
                                    </span>
                                )}
                            </div>
                            {r.lastPaidAt && <p className="text-xs text-gray-400 mt-1">{r.lastPaidAt}</p>}
                        </button>
                    );
                })}
            </div>

            {/* ── Desktop table ── */}
            <div className="hidden md:block rounded-xl border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead>Člen</TableHead>
                            <TableHead className="text-right">Předpis</TableHead>
                            <TableHead className="text-right">Zaplaceno</TableHead>
                            <TableHead className="text-right hidden lg:table-cell">Rozdíl</TableHead>
                            <TableHead className="hidden lg:table-cell">Datum</TableHead>
                            <TableHead>Stav</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-gray-400 py-10">
                                    Žádné záznamy
                                </TableCell>
                            </TableRow>
                        )}
                        {filtered.map(r => {
                            const d = diff(r);
                            const sb = STATUS_BADGE[r.status];
                            return (
                                <TableRow key={r.contribId}
                                    className="hover:bg-gray-50/60 cursor-pointer"
                                    onClick={() => openEdit(r)}>
                                    <TableCell className="font-medium">
                                        <span>{r.firstName} {r.lastName}</span>
                                        {r.todoNote && (
                                            <span className="ml-2 text-xs text-orange-600 font-normal truncate max-w-[160px] inline-block align-middle">
                                                {r.todoNote}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">{fmt(r.amountTotal)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">{fmt(r.paidTotal)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm hidden lg:table-cell">
                                        {d === null || d === 0 ? "—" : (
                                            <span className={d > 0 ? "text-orange-600" : "text-red-600"}>
                                                {d > 0 ? "+" : ""}{d.toLocaleString("cs-CZ")} Kč
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-500 hidden lg:table-cell">
                                        {r.lastPaidAt ?? "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`${sb.cls} text-xs font-normal`}>{sb.label}</Badge>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <PaymentSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                row={editRow}
                onPaymentUpdated={onPaymentUpdated}
            />
        </div>
    );
}
