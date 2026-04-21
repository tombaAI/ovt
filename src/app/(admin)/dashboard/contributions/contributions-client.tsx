"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentSheet } from "./payment-sheet";
import { PrepareDialog } from "./prepare-dialog";
import { EditPrescriptionDialog } from "./edit-prescription-dialog";
import { deleteAllPrescriptions } from "@/lib/actions/contribution-periods";
import type { PeriodFormData } from "@/lib/actions/contribution-periods";
import type { ContribRow, PeriodDetail, PeriodStatus } from "./page";

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
    paid:      { label: "V pořádku",   cls: "bg-[#327600]/10 text-[#327600] border-0"      },
    overpaid:  { label: "Více",        cls: "bg-orange-100 text-orange-700 border-0"        },
    underpaid: { label: "Méně",        cls: "bg-red-100 text-red-700 border-0"              },
    unpaid:    { label: "Nezaplaceno", cls: "bg-red-50 text-red-600 border border-red-200"  },
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

// ── Odznaky složek příspěvku ──────────────────────────────────────────────────
type ContribBadge = { label: string; cls: string };

function contribBadges(r: ContribRow): ContribBadge[] {
    const badges: ContribBadge[] = [];
    const boat = "rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600";
    const warn  = "rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200";
    const good  = "rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#327600]/8 text-[#327600]";

    if (r.amountBoat1)    badges.push({ label: "Loď",        cls: boat });
    if (r.amountBoat2)    badges.push({ label: "2. loď",     cls: boat });
    if (r.amountBoat3)    badges.push({ label: "3. loď",     cls: boat });
    if (r.brigadeSurcharge && r.brigadeSurcharge > 0)
                          badges.push({ label: "Bez brigády", cls: warn });
    if (r.discountCommittee) badges.push({ label: "Výbor",   cls: good });
    if (r.discountTom)    badges.push({ label: "TOM",         cls: good });
    return badges;
}

interface Props {
    period: PeriodDetail;
    rows: ContribRow[];
    canPrepare?: boolean;
    prepareDefaults?: Partial<PeriodFormData>;
}

export function ContributionsClient({ period, rows, canPrepare = false, prepareDefaults = {} }: Props) {
    const router = useRouter();
    const [filter, setFilter]               = useState<FilterKey>("issues");
    const [sheetOpen, setSheetOpen]         = useState(false);
    const [editContribId, setEditContribId] = useState<number | null>(null);
    const [prepareOpen, setPrepareOpen]         = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteIsPending, startDelete]        = useTransition();
    const [editRow, setEditRow]                 = useState<ContribRow | null>(null);
    const [editOpen, setEditOpen]               = useState(false);

    const paymentSheetRow = editContribId !== null ? (rows.find(r => r.contribId === editContribId) ?? null) : null;

    const onPaymentUpdated = useCallback(() => { router.refresh(); }, [router]);

    function openPaymentSheet(r: ContribRow) {
        setEditContribId(r.contribId);
        setSheetOpen(true);
        router.refresh();
    }

    function openEditPrescription(r: ContribRow, e: React.MouseEvent) {
        e.stopPropagation();
        setEditRow(r);
        setEditOpen(true);
    }

    function handleDeleteAll() {
        startDelete(async () => {
            await deleteAllPrescriptions(period.id);
            setDeleteConfirmOpen(false);
            router.refresh();
        });
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
            {/* ── Period header ── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Příspěvky {period.year}</h1>
                    <div className="mt-2 inline-flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
                        <span className="whitespace-nowrap">
                            <span className="text-gray-400">Člen</span>{" "}
                            <span className="font-medium text-gray-700">{period.amountBase.toLocaleString("cs-CZ")} Kč</span>
                        </span>
                        {period.amountBoat1 > 0 && (
                            <span className="whitespace-nowrap">
                                <span className="text-gray-400">Loď</span>{" "}
                                <span className="font-medium text-gray-700">
                                    {period.amountBoat1.toLocaleString("cs-CZ")} Kč
                                    {period.amountBoat2 > 0 && ` / ${period.amountBoat2.toLocaleString("cs-CZ")} Kč`}
                                </span>
                            </span>
                        )}
                        {period.brigadeSurcharge > 0 && (
                            <span className="whitespace-nowrap">
                                <span className="text-gray-400">Brigáda</span>{" "}
                                <span className="font-medium text-gray-700">+{period.brigadeSurcharge.toLocaleString("cs-CZ")} Kč</span>
                            </span>
                        )}
                        {period.discountCommittee > 0 && (
                            <span className="whitespace-nowrap">
                                <span className="text-gray-400">Sleva výbor</span>{" "}
                                <span className="font-medium text-gray-700">−{period.discountCommittee.toLocaleString("cs-CZ")} Kč</span>
                            </span>
                        )}
                        {period.discountTom > 0 && (
                            <span className="whitespace-nowrap">
                                <span className="text-gray-400">Sleva TOM</span>{" "}
                                <span className="font-medium text-gray-700">−{period.discountTom.toLocaleString("cs-CZ")} Kč</span>
                            </span>
                        )}
                        {period.dueDate && (
                            <span className="whitespace-nowrap">
                                <span className="text-gray-400">Splatnost</span>{" "}
                                <span className="font-medium text-gray-700">{period.dueDate}</span>
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {canPrepare && rows.length > 0 && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteConfirmOpen(true)}
                            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Smazat vše
                        </Button>
                    )}
                    {canPrepare && (
                        <Button
                            size="sm"
                            onClick={() => setPrepareOpen(true)}
                            className="bg-[#327600] hover:bg-[#327600]/90 text-white"
                        >
                            Připravit předpisy
                        </Button>
                    )}
                    <Badge className={`${lifecycle.cls} text-sm font-medium px-3 py-1`}>
                        {lifecycle.label}
                    </Badge>
                </div>
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
                    const badges = contribBadges(r);
                    return (
                        <button key={r.contribId} onClick={() => openPaymentSheet(r)}
                            className="w-full text-left bg-white rounded-xl border border-gray-200 p-3.5 active:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-medium text-gray-900">{r.firstName} {r.lastName}</p>
                                    {badges.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {badges.map(b => (
                                                <span key={b.label} className={b.cls}>{b.label}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {canPrepare && (
                                        <button
                                            onClick={e => openEditPrescription(r, e)}
                                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-[#327600]"
                                            title="Upravit částky"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <Badge className={`${sb.cls} text-xs font-normal`}>{sb.label}</Badge>
                                </div>
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
                            const badges = contribBadges(r);
                            return (
                                <TableRow key={r.contribId}
                                    className="hover:bg-gray-50/60 cursor-pointer"
                                    onClick={() => openPaymentSheet(r)}>
                                    <TableCell className="font-medium">
                                        <div>
                                            <span>{r.firstName} {r.lastName}</span>
                                            {r.todoNote && (
                                                <span className="ml-2 text-xs text-orange-600 font-normal truncate max-w-[160px] inline-block align-middle">
                                                    {r.todoNote}
                                                </span>
                                            )}
                                        </div>
                                        {badges.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {badges.map(b => (
                                                    <span key={b.label} className={b.cls}>{b.label}</span>
                                                ))}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        <span className="inline-flex items-center gap-2">
                                            {fmt(r.amountTotal)}
                                            {canPrepare && (
                                                <button
                                                    onClick={e => openEditPrescription(r, e)}
                                                    className="p-0.5 rounded hover:bg-gray-100 text-gray-300 hover:text-[#327600]"
                                                    title="Upravit částky"
                                                >
                                                    <Pencil className="w-3 h-3" />
                                                </button>
                                            )}
                                        </span>
                                    </TableCell>
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
                row={paymentSheetRow}
                onPaymentUpdated={onPaymentUpdated}
            />

            <PrepareDialog
                open={prepareOpen}
                onOpenChange={setPrepareOpen}
                year={period.year}
                defaults={prepareDefaults}
            />

            {/* ── Smazat vše — potvrzení ── */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Smazat všechny předpisy?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-gray-600">
                        Budou smazány všechny předpisy příspěvků pro rok{" "}
                        <strong>{period.year}</strong> ({rows.length} záznamů).
                        Akci nelze vrátit.
                    </p>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteConfirmOpen(false)}
                            disabled={deleteIsPending}
                        >
                            Zrušit
                        </Button>
                        <Button
                            onClick={handleDeleteAll}
                            disabled={deleteIsPending}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {deleteIsPending ? "Mažu…" : "Smazat vše"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Upravit částky předpisu ── */}
            <EditPrescriptionDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                row={editRow}
            />
        </div>
    );
}
