"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddEventSheet } from "./add-event-sheet";
import { copyEventsFromYear } from "@/lib/actions/events";
import type { EventRow } from "@/lib/actions/events";
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, MONTH_NAMES } from "@/lib/events-config";
import { pushNavStack } from "@/lib/nav-stack";

interface MemberOption {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    nickname: string | null;
}

type FilterKey = "all" | "planned" | "confirmed" | "cancelled" | "completed" | "no_date" | "no_leader";

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all",       label: "Vše"           },
    { key: "planned",   label: "V plánu"       },
    { key: "confirmed", label: "Potvrzeno"     },
    { key: "completed", label: "Proběhlo"      },
    { key: "cancelled", label: "Zrušeno"       },
    { key: "no_date",   label: "Bez termínu"   },
    { key: "no_leader", label: "Bez vedoucího" },
];

const STATUS_COLORS: Record<string, string> = {
    planned:   "bg-blue-50 text-blue-700",
    confirmed: "bg-green-50 text-green-700",
    cancelled: "bg-red-50 text-red-600",
    completed: "bg-gray-100 text-gray-500",
};

const TYPE_COLORS: Record<string, string> = {
    cpv:          "bg-amber-50 text-amber-700",
    foreign:      "bg-purple-50 text-purple-700",
    recreational: "bg-sky-50 text-sky-700",
    club:         "bg-teal-50 text-teal-700",
    race:         "bg-orange-50 text-orange-700",
    brigada:      "bg-lime-50 text-lime-700",
    other:        "bg-gray-50 text-gray-500",
};

function fmtDate(iso: string) {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

function fmtDateRange(dateFrom: string | null, dateTo: string | null, approxMonth: number | null): string {
    if (dateFrom && dateTo && dateFrom !== dateTo) return `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
    if (dateFrom) return fmtDate(dateFrom);
    if (approxMonth) return `~ ${MONTH_NAMES[approxMonth]}`;
    return "—";
}

interface Props {
    years?: number[];
    selectedYear: number;
    events: EventRow[];
    allMembers: MemberOption[];
}

export function EventsClient({ years: yearsProp, selectedYear, events, allMembers }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [pendingYear, setPendingYear] = useState<number | null>(null);

    // Compute year tabs: union of prop, DB years in data, and a ±3 range around today/selection
    const years = useMemo(() => {
        const cur = new Date().getFullYear();
        const base = new Set<number>(yearsProp ?? []);
        for (let y = cur - 3; y <= cur + 1; y++) base.add(y);
        base.add(selectedYear);
        return Array.from(base).sort((a, b) => b - a);
    }, [yearsProp, selectedYear]);
    const [filter, setFilter]           = useState<FilterKey>("all");
    const [addOpen, setAddOpen]         = useState(false);
    const [copying, setCopying]         = useState(false);

    const displayYear = isPending && pendingYear !== null ? pendingYear : selectedYear;

    function navigateYear(year: number) {
        setPendingYear(year);
        startTransition(() => router.push(`/dashboard/events?year=${year}`));
    }

    const openDetail = useCallback((e: EventRow) => {
        pushNavStack({ url: `/dashboard/events?year=${selectedYear}`, label: `Kalendář ${selectedYear}` });
        router.push(`/dashboard/events/${e.id}`);
    }, [router, selectedYear]);

    const onSaved = useCallback(() => router.refresh(), [router]);

    async function handleCopyFromPrevYear() {
        const fromYear = selectedYear - 1;
        if (!confirm(`Zkopírovat akce z roku ${fromYear} do ${selectedYear}? Termíny a vedoucí budou prázdné.`)) return;
        setCopying(true);
        try {
            const result = await copyEventsFromYear(fromYear, selectedYear);
            router.refresh();
            alert(`Zkopírováno ${result.count} akcí z roku ${fromYear}.`);
        } finally {
            setCopying(false);
        }
    }

    const filtered = events.filter(e => {
        if (filter === "all")       return true;
        if (filter === "no_date")   return !e.dateFrom;
        if (filter === "no_leader") return !e.leaderId;
        return e.status === filter;
    });

    const noDate   = events.filter(e => !e.dateFrom).length;
    const noLeader = events.filter(e => !e.leaderId).length;

    return (
        <div className="space-y-4">

            {/* ── Year tabs ── */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
                {years.map(y => (
                    <button key={y} onClick={() => navigateYear(y)}
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

            {/* ── Heading + actions ── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Kalendář {displayYear}</h1>
                    <p className="text-gray-500 mt-0.5 text-sm">
                        {events.length} akcí
                        {noDate > 0 && ` · ${noDate} bez termínu`}
                        {noLeader > 0 && ` · ${noLeader} bez vedoucího`}
                    </p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                    {events.length === 0 && (
                        <Button variant="outline" size="sm" disabled={copying} onClick={handleCopyFromPrevYear}>
                            {copying ? "Kopíruji…" : `Kopírovat z ${selectedYear - 1}`}
                        </Button>
                    )}
                    <Button size="sm" className="bg-[#327600] hover:bg-[#2a6400]" onClick={() => setAddOpen(true)}>
                        + Nová akce
                    </Button>
                </div>
            </div>

            {/* ── Filter pills ── */}
            <div className="flex gap-2 flex-wrap">
                {FILTERS.map(f => {
                    const count = f.key === "all"       ? events.length
                                : f.key === "no_date"   ? noDate
                                : f.key === "no_leader" ? noLeader
                                : events.filter(e => e.status === f.key).length;
                    return (
                        <button key={f.key} onClick={() => setFilter(f.key)}
                            className={[
                                "px-3 py-1 rounded-full text-sm transition-colors",
                                filter === f.key
                                    ? "bg-[#26272b] text-white font-semibold"
                                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50",
                            ].join(" ")}>
                            {f.label}
                            {f.key !== "all" && (
                                <span className="ml-1.5 text-xs opacity-60">{count}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Table ── */}
            <div className={`rounded-xl border bg-white overflow-hidden transition-opacity duration-150 ${isPending ? "opacity-30 pointer-events-none" : ""}`}>
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50/70">
                            <TableHead className="w-40 text-xs font-medium text-gray-400">Termín</TableHead>
                            <TableHead className="text-xs font-medium text-gray-400">Akce</TableHead>
                            <TableHead className="hidden lg:table-cell text-xs font-medium text-gray-400">Vedoucí</TableHead>
                            <TableHead className="w-28 text-xs font-medium text-gray-400">Stav</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-gray-400 py-10">
                                    {events.length === 0
                                        ? `Žádné akce za rok ${displayYear}`
                                        : "Žádné akce odpovídají filtru"}
                                </TableCell>
                            </TableRow>
                        )}
                        {filtered.map(e => (
                            <TableRow key={e.id}
                                className="hover:bg-gray-50/60 cursor-pointer"
                                onClick={() => openDetail(e)}>
                                <TableCell className="text-sm text-gray-500 whitespace-nowrap tabular-nums">
                                    {fmtDateRange(e.dateFrom, e.dateTo, e.approxMonth)}
                                </TableCell>
                                <TableCell>
                                    <p className="font-medium text-gray-900 leading-snug">{e.name}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                        {e.location && (
                                            <span className="text-xs text-gray-400">{e.location}</span>
                                        )}
                                        <Badge className={`${TYPE_COLORS[e.eventType] ?? TYPE_COLORS.other} border-0 text-[11px] font-normal px-1.5 py-0`}>
                                            {EVENT_TYPE_LABELS[e.eventType]}
                                        </Badge>
                                    </div>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-sm text-gray-500">
                                    {e.leaderName ?? <span className="text-gray-300">—</span>}
                                </TableCell>
                                <TableCell>
                                    <Badge className={`${STATUS_COLORS[e.status] ?? ""} border-0 text-xs font-normal`}>
                                        {EVENT_STATUS_LABELS[e.status]}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* FAB mobile */}
            <button onClick={() => setAddOpen(true)}
                className="md:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#327600] text-white text-2xl shadow-lg flex items-center justify-center active:scale-95 transition-transform">
                +
            </button>

            <AddEventSheet
                open={addOpen}
                onOpenChange={setAddOpen}
                defaultYear={selectedYear}
                allMembers={allMembers}
                onSaved={onSaved}
            />
        </div>
    );
}
