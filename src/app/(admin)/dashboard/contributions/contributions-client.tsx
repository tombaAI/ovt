"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentSheet } from "./payment-sheet";
import type { ContribRow } from "./page";

type FilterKey = "all" | "issues" | "paid" | "underpaid" | "overpaid" | "unpaid";

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "issues",   label: "Problémy"   },
    { key: "unpaid",   label: "Nezaplaceno" },
    { key: "underpaid",label: "Nedoplatek"  },
    { key: "overpaid", label: "Přeplatek"   },
    { key: "paid",     label: "Zaplaceno"   },
    { key: "all",      label: "Všichni"     },
];

const STATUS_BADGE: Record<ContribRow["status"], { label: string; cls: string }> = {
    paid:      { label: "Zaplaceno",  cls: "bg-[#327600]/10 text-[#327600] border-0"          },
    overpaid:  { label: "Přeplatek",  cls: "bg-orange-100 text-orange-700 border-0"            },
    underpaid: { label: "Nedoplatek", cls: "bg-red-100 text-red-700 border-0"                  },
    unpaid:    { label: "Nezaplaceno",cls: "bg-red-50 text-red-600 border border-red-200"      },
};

function fmt(n: number | null) {
    if (n === null) return "—";
    return n.toLocaleString("cs-CZ") + " Kč";
}

function diff(row: ContribRow): number | null {
    if (row.paidAmount === null || row.amountTotal === null) return null;
    return row.paidAmount - row.amountTotal;
}

export function ContributionsClient({ rows }: { rows: ContribRow[] }) {
    const [filter, setFilter]       = useState<FilterKey>("issues");
    const [sheetOpen, setSheetOpen] = useState(false);
    const [editRow, setEditRow]     = useState<ContribRow | null>(null);

    const counts = useMemo(() => ({
        all:       rows.length,
        paid:      rows.filter(r => r.status === "paid").length,
        overpaid:  rows.filter(r => r.status === "overpaid").length,
        underpaid: rows.filter(r => r.status === "underpaid").length,
        unpaid:    rows.filter(r => r.status === "unpaid").length,
        issues:    rows.filter(r => r.status !== "paid").length,
    }), [rows]);

    const filtered = useMemo(() => {
        if (filter === "all")    return rows;
        if (filter === "issues") return rows.filter(r => r.status !== "paid");
        return rows.filter(r => r.status === filter);
    }, [rows, filter]);

    function openEdit(row: ContribRow) { setEditRow(row); setSheetOpen(true); }

    return (
        <div className="space-y-3">
            {/* Filter pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-none">
                {FILTERS.map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={[
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0",
                            filter === f.key
                                ? "bg-[#327600] text-white"
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
                                <p className="font-medium text-gray-900">{r.fullName}</p>
                                <Badge className={`${sb.cls} text-xs font-normal shrink-0`}>{sb.label}</Badge>
                            </div>
                            <div className="flex gap-4 mt-1.5 text-sm text-gray-500">
                                <span>Předpis: <strong className="text-gray-800">{fmt(r.amountTotal)}</strong></span>
                                <span>Zaplaceno: <strong className="text-gray-800">{fmt(r.paidAmount)}</strong></span>
                                {d !== null && d !== 0 && (
                                    <span className={d > 0 ? "text-orange-600" : "text-red-600"}>
                                        {d > 0 ? `+${d.toLocaleString("cs-CZ")}` : d.toLocaleString("cs-CZ")} Kč
                                    </span>
                                )}
                            </div>
                            {r.paidAt && <p className="text-xs text-gray-400 mt-1">{r.paidAt}</p>}
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
                            <TableHead className="w-20" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-gray-400 py-10">
                                    Žádné záznamy
                                </TableCell>
                            </TableRow>
                        )}
                        {filtered.map(r => {
                            const d = diff(r);
                            const sb = STATUS_BADGE[r.status];
                            return (
                                <TableRow key={r.contribId} className="hover:bg-gray-50/60">
                                    <TableCell className="font-medium">{r.fullName}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">{fmt(r.amountTotal)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">{fmt(r.paidAmount)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm hidden lg:table-cell">
                                        {d === null || d === 0 ? "—" : (
                                            <span className={d > 0 ? "text-orange-600" : "text-red-600"}>
                                                {d > 0 ? "+" : ""}{d.toLocaleString("cs-CZ")} Kč
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-500 hidden lg:table-cell">
                                        {r.paidAt ?? "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`${sb.cls} text-xs font-normal`}>{sb.label}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="sm"
                                            className="text-gray-400 hover:text-gray-700 h-7 px-2"
                                            onClick={() => openEdit(r)}>
                                            Upravit
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <PaymentSheet open={sheetOpen} onOpenChange={setSheetOpen} row={editRow} />
        </div>
    );
}
