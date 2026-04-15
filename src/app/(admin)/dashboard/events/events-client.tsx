"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EventSheet } from "./event-sheet";
import { copyEventsFromYear, fetchGcalEvents, importGcalEvents } from "@/lib/actions/events";
import type { EventRow, GcalImportItem } from "@/lib/actions/events";
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, MONTH_NAMES } from "@/lib/events-config";

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
    planned:   "bg-blue-100 text-blue-700",
    confirmed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-600",
    completed: "bg-gray-100 text-gray-600",
};

const TYPE_COLORS: Record<string, string> = {
    cpv:          "bg-amber-100 text-amber-700",
    foreign:      "bg-purple-100 text-purple-700",
    recreational: "bg-sky-100 text-sky-700",
    club:         "bg-teal-100 text-teal-700",
    race:         "bg-orange-100 text-orange-700",
    brigada:      "bg-lime-100 text-lime-700",
    other:        "bg-gray-100 text-gray-500",
};

function fmtDate(iso: string) {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

function fmtDateRange(dateFrom: string | null, dateTo: string | null, approxMonth: number | null): string {
    if (dateFrom && dateTo && dateFrom !== dateTo) {
        return `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
    }
    if (dateFrom) return fmtDate(dateFrom);
    if (approxMonth) return `~${MONTH_NAMES[approxMonth]}`;
    return "—";
}

interface Props {
    years: number[];
    selectedYear: number;
    events: EventRow[];
    allMembers: MemberOption[];
}

export function EventsClient({ years, selectedYear, events, allMembers }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [pendingYear, setPendingYear] = useState<number | null>(null);
    const [filter, setFilter] = useState<FilterKey>("all");

    const [sheetOpen, setSheetOpen] = useState(false);
    const [editEvent, setEditEvent] = useState<EventRow | null>(null);
    const [copying, setCopying]     = useState(false);

    // ── GCal import ──────────────────────────────────────────────────────────
    const [gcalPanel, setGcalPanel]         = useState(false);
    const [gcalLoading, setGcalLoading]     = useState(false);
    const [gcalItems, setGcalItems]         = useState<GcalImportItem[]>([]);
    const [gcalSelected, setGcalSelected]   = useState<Set<string>>(new Set());
    const [gcalError, setGcalError]         = useState<string | null>(null);
    const [gcalImporting, setGcalImporting] = useState(false);
    const [gcalMsg, setGcalMsg]             = useState<string | null>(null);

    async function openGcalPanel() {
        setGcalPanel(true);
        setGcalItems([]);
        setGcalSelected(new Set());
        setGcalError(null);
        setGcalMsg(null);
        setGcalLoading(true);
        try {
            const items = await fetchGcalEvents(selectedYear);
            setGcalItems(items);
            // Předvyber eventy, které ještě nejsou v DB
            const existingGcalIds = new Set(events.map(e => e.gcalEventId).filter(Boolean));
            setGcalSelected(new Set(items.filter(i => !existingGcalIds.has(i.gcalEventId)).map(i => i.gcalEventId)));
        } catch (e) {
            setGcalError(e instanceof Error ? e.message : "Chyba načítání");
        } finally {
            setGcalLoading(false);
        }
    }

    function toggleGcalItem(id: string) {
        setGcalSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    }

    function toggleAllGcal(checked: boolean) {
        setGcalSelected(checked ? new Set(gcalItems.map(i => i.gcalEventId)) : new Set());
    }

    async function handleGcalImport() {
        const toImport = gcalItems.filter(i => gcalSelected.has(i.gcalEventId));
        if (toImport.length === 0) return;
        setGcalImporting(true);
        try {
            const result = await importGcalEvents(selectedYear, toImport);
            setGcalMsg(`Importováno ${result.imported} akcí${result.skipped > 0 ? `, přeskočeno ${result.skipped} (již existují)` : ""}.`);
            router.refresh();
            // Po importu zavřeme panel za 2s
            setTimeout(() => setGcalPanel(false), 2000);
        } catch (e) {
            setGcalError(e instanceof Error ? e.message : "Chyba importu");
        } finally {
            setGcalImporting(false);
        }
    }

    const displayYear = isPending && pendingYear !== null ? pendingYear : selectedYear;

    function navigateYear(year: number) {
        setPendingYear(year);
        startTransition(() => router.push(`/dashboard/events?year=${year}`));
    }

    const openNew = useCallback(() => {
        setEditEvent(null);
        setSheetOpen(true);
    }, []);

    const openDetail = useCallback((event: EventRow) => {
        setEditEvent(event);
        setSheetOpen(true);
    }, []);

    const onSaved = useCallback(() => {
        router.refresh();
    }, [router]);

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
                    <button key={y}
                        onClick={() => navigateYear(y)}
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
                        {events.length} akcí · {noDate} bez termínu · {noLeader} bez vedoucího
                    </p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                    <Button variant="outline" size="sm" onClick={openGcalPanel} disabled={gcalPanel}>
                        ↓ Načíst z Google Kalendáře
                    </Button>
                    {events.length === 0 && (
                        <Button variant="outline" size="sm" disabled={copying} onClick={handleCopyFromPrevYear}>
                            {copying ? "Kopíruji…" : `Kopírovat z ${selectedYear - 1}`}
                        </Button>
                    )}
                    <Button size="sm" className="bg-[#327600] hover:bg-[#2a6400]" onClick={openNew}>
                        + Nová akce
                    </Button>
                </div>
            </div>

            {/* ── GCal import panel ── */}
            {gcalPanel && (
                <div className="rounded-xl border bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                        <p className="font-medium text-gray-800 text-sm">Akce v Google Kalendáři — {selectedYear}</p>
                        <button onClick={() => setGcalPanel(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
                    </div>

                    {gcalLoading && (
                        <p className="text-sm text-gray-400 px-4 py-6 text-center">Načítám z Google Kalendáře…</p>
                    )}

                    {gcalError && (
                        <p className="text-sm text-red-500 px-4 py-4">{gcalError}</p>
                    )}

                    {gcalMsg && (
                        <p className="text-sm text-green-700 px-4 py-4 font-medium">{gcalMsg}</p>
                    )}

                    {!gcalLoading && !gcalError && !gcalMsg && gcalItems.length === 0 && (
                        <p className="text-sm text-gray-400 px-4 py-6 text-center">Žádné akce v Google Kalendáři pro rok {selectedYear}</p>
                    )}

                    {!gcalLoading && !gcalError && !gcalMsg && gcalItems.length > 0 && (
                        <>
                            <div className="divide-y max-h-96 overflow-y-auto">
                                {/* Záhlaví se "vybrat vše" */}
                                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-xs text-gray-500">
                                    <input
                                        type="checkbox"
                                        checked={gcalSelected.size === gcalItems.length}
                                        onChange={e => toggleAllGcal(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 accent-[#327600]"
                                    />
                                    <span>Vybrat vše ({gcalItems.length})</span>
                                </div>
                                {gcalItems.map(item => {
                                    const alreadyIn = events.some(e => e.gcalEventId === item.gcalEventId);
                                    return (
                                        <label key={item.gcalEventId}
                                            className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 ${alreadyIn ? "opacity-50" : ""}`}>
                                            <input
                                                type="checkbox"
                                                checked={gcalSelected.has(item.gcalEventId)}
                                                onChange={() => toggleGcalItem(item.gcalEventId)}
                                                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#327600]"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{item.summary}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {item.dateFrom ? fmtDateRange(item.dateFrom, item.dateTo, null) : "bez termínu"}
                                                    {item.location && ` · ${item.location}`}
                                                    {alreadyIn && <span className="ml-2 text-green-600">✓ již v seznamu</span>}
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-3 px-4 py-3 border-t bg-gray-50">
                                <Button
                                    size="sm"
                                    disabled={gcalImporting || gcalSelected.size === 0}
                                    onClick={handleGcalImport}
                                    className="bg-[#327600] hover:bg-[#2a6400]">
                                    {gcalImporting ? "Importuji…" : `Importovat vybrané (${gcalSelected.size})`}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setGcalPanel(false)}>Zrušit</Button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Filter pills ── */}
            <div className="flex gap-2 flex-wrap">
                {FILTERS.map(f => {
                    const count = f.key === "all"       ? events.length
                                : f.key === "no_date"   ? noDate
                                : f.key === "no_leader" ? noLeader
                                : events.filter(e => e.status === f.key).length;
                    return (
                        <button key={f.key}
                            onClick={() => setFilter(f.key)}
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
            <div className={`rounded-xl border bg-white overflow-hidden transition-opacity duration-150 ${isPending ? "opacity-25 pointer-events-none" : ""}`}>
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead className="w-44">Termín</TableHead>
                            <TableHead>Akce</TableHead>
                            <TableHead className="hidden md:table-cell w-36">Typ</TableHead>
                            <TableHead className="hidden lg:table-cell">Vedoucí</TableHead>
                            <TableHead className="w-28">Stav</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-gray-400 py-10">
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
                                <TableCell className="font-mono text-sm text-gray-700 whitespace-nowrap">
                                    {fmtDateRange(e.dateFrom, e.dateTo, e.approxMonth)}
                                </TableCell>
                                <TableCell>
                                    <span className="font-medium text-gray-900">{e.name}</span>
                                    {e.location && (
                                        <p className="text-xs text-gray-400 mt-0.5">{e.location}</p>
                                    )}
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                    <Badge className={`${TYPE_COLORS[e.eventType] ?? TYPE_COLORS.other} border-0 text-xs font-normal`}>
                                        {EVENT_TYPE_LABELS[e.eventType]}
                                    </Badge>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-gray-600 text-sm">
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
            <button onClick={openNew}
                className="md:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#327600] text-white text-2xl shadow-lg flex items-center justify-center active:scale-95 transition-transform">
                +
            </button>

            <EventSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                event={editEvent}
                allMembers={allMembers}
                defaultYear={selectedYear}
                onSaved={onSaved}
            />
        </div>
    );
}
