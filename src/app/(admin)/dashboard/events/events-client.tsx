"use client";

import { useState, useTransition, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddEventSheet } from "./add-event-sheet";
import { copyEventsFromYear, getGcalSyncOverview, importGcalEvents } from "@/lib/actions/events";
import type { EventRow, GcalImportItem, GcalSyncOverview } from "@/lib/actions/events";
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

function GcalSyncOverviewCard({ year, onImported }: { year: number; onImported: () => void }) {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [overview, setOverview] = useState<GcalSyncOverview | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [expandedMissingInApp, setExpandedMissingInApp] = useState(false);
    const [expandedMissingInGcal, setExpandedMissingInGcal] = useState(false);
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const loadOverview = useCallback(async (mode: "initial" | "refresh") => {
        if (mode === "initial") {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        setError(null);

        try {
            const result = await getGcalSyncOverview(year);
            setOverview(result);
            setSelected(new Set(result.missingInApp.map((item) => item.gcalEventId)));
            setExpandedMissingInApp(false);
            setExpandedMissingInGcal(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Synchronizace se nepodařila");
        } finally {
            if (mode === "initial") {
                setLoading(false);
            } else {
                setRefreshing(false);
            }
        }
    }, [year]);

    useEffect(() => {
        let active = true;
        setMessage(null);

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await getGcalSyncOverview(year);
                if (!active) return;

                setOverview(result);
                setSelected(new Set(result.missingInApp.map((item) => item.gcalEventId)));
                setExpandedMissingInApp(false);
                setExpandedMissingInGcal(false);
            } catch (e) {
                if (!active) return;
                setError(e instanceof Error ? e.message : "Synchronizace se nepodařila");
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [year]);

    function toggleSelect(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    function toggleSelectAll(checked: boolean) {
        if (!overview) return;
        setSelected(checked ? new Set(overview.missingInApp.map((item) => item.gcalEventId)) : new Set());
    }

    async function handleImportSelected() {
        if (!overview) return;

        const toImport: GcalImportItem[] = overview.missingInApp.filter((item) => selected.has(item.gcalEventId));
        if (toImport.length === 0) return;

        setImporting(true);
        setError(null);
        setMessage(null);

        try {
            const result = await importGcalEvents(year, toImport);
            setMessage(
                `Importováno ${result.imported} akcí` +
                (result.skipped > 0 ? `, přeskočeno ${result.skipped}.` : ".")
            );
            onImported();
            await loadOverview("refresh");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Import se nepodařil");
        } finally {
            setImporting(false);
        }
    }

    const checkedAt = overview ? new Date(overview.checkedAt) : null;
    const canImport = overview ? overview.missingInApp.length > 0 : false;
    const allSelected = overview
        ? overview.missingInApp.length > 0 && selected.size === overview.missingInApp.length
        : false;

    return (
        <div className="rounded-xl border bg-white p-4 min-h-[176px]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-gray-900">Google kalendář: stav synchronizace</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Kontrola běží automaticky po otevření stránky.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={loading || refreshing || importing}
                    onClick={() => void loadOverview("refresh")}
                >
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Obnovuji…" : "Obnovit"}
                </Button>
            </div>

            <div className="mt-3">
                {loading ? (
                    <div className="h-[118px] rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        <span>Zjišťuji stav Google kalendáře…</span>
                    </div>
                ) : error ? (
                    <div className="h-[118px] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </div>
                ) : overview ? (
                    <div className="space-y-3">
                        <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 text-xs text-gray-600">
                            <p>
                                Porovnáno {overview.comparedGcalCount} akcí z Google kalendáře.
                                {overview.ignoredRecurringCount > 0 && (
                                    <span> Opakující se akce ignorovány: {overview.ignoredRecurringCount}.</span>
                                )}
                            </p>
                            {checkedAt && (
                                <p className="mt-1 text-gray-500">
                                    Poslední kontrola: {new Intl.DateTimeFormat("cs-CZ", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    }).format(checkedAt)}
                                </p>
                            )}
                        </div>

                        <div className="grid gap-2 lg:grid-cols-2">
                            <div className="rounded-lg border p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-gray-800">
                                        V Google jsou, v systému chybí: {overview.missingInApp.length}
                                    </p>
                                    {overview.missingInApp.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setExpandedMissingInApp((v) => !v)}
                                            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
                                        >
                                            {expandedMissingInApp ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                            {expandedMissingInApp ? "Skrýt" : "Rozbalit"}
                                        </button>
                                    )}
                                </div>

                                {overview.missingInApp.length === 0 && (
                                    <p className="text-xs text-gray-500 mt-1">Není co doplňovat.</p>
                                )}

                                {expandedMissingInApp && overview.missingInApp.length > 0 && (
                                    <div className="mt-2 border rounded-md overflow-hidden">
                                        <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-gray-50 text-xs text-gray-600">
                                            <input
                                                type="checkbox"
                                                checked={allSelected}
                                                onChange={(e) => toggleSelectAll(e.target.checked)}
                                                className="h-4 w-4 rounded border-gray-300 accent-[#327600]"
                                            />
                                            <span>Vybrat vše</span>
                                            <span className="ml-auto">{selected.size} vybráno</span>
                                        </div>
                                        <div className="max-h-52 overflow-y-auto divide-y">
                                            {overview.missingInApp.map((item) => (
                                                <label
                                                    key={item.gcalEventId}
                                                    className="flex items-start gap-2 px-2 py-1.5 text-xs hover:bg-gray-50 cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(item.gcalEventId)}
                                                        onChange={() => toggleSelect(item.gcalEventId)}
                                                        className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#327600]"
                                                    />
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-gray-800">{item.summary}</span>
                                                        <span className="text-gray-500">
                                                            {fmtDateRange(item.dateFrom, item.dateTo, null)}
                                                            {item.location ? ` · ${item.location}` : ""}
                                                        </span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-gray-800">
                                        V systému jsou, v Google chybí: {overview.missingInGcal.length}
                                    </p>
                                    {overview.missingInGcal.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setExpandedMissingInGcal((v) => !v)}
                                            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
                                        >
                                            {expandedMissingInGcal ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                            {expandedMissingInGcal ? "Skrýt" : "Rozbalit"}
                                        </button>
                                    )}
                                </div>

                                {overview.missingInGcal.length === 0 && (
                                    <p className="text-xs text-gray-500 mt-1">Bez nesrovnalostí.</p>
                                )}

                                {expandedMissingInGcal && overview.missingInGcal.length > 0 && (
                                    <div className="mt-2 border rounded-md max-h-52 overflow-y-auto divide-y">
                                        {overview.missingInGcal.map((item) => (
                                            <div key={item.id} className="px-2 py-1.5 text-xs">
                                                <p className="text-gray-800 truncate">{item.name}</p>
                                                <p className="text-gray-500">
                                                    {fmtDateRange(item.dateFrom, item.dateTo, null)}
                                                    {!item.gcalEventId && item.gcalSync ? " · sync zapnut" : ""}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {canImport && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                    size="sm"
                                    disabled={importing || selected.size === 0}
                                    className="bg-[#327600] hover:bg-[#2a6400]"
                                    onClick={() => void handleImportSelected()}
                                >
                                    {importing ? "Přidávám…" : `Přidat vybrané do systému (${selected.size})`}
                                </Button>
                                <p className="text-xs text-gray-500">Použije stejný import jako sekce Importy.</p>
                            </div>
                        )}

                        {message && (
                            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2.5 py-1.5">
                                {message}
                            </p>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
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

            <GcalSyncOverviewCard key={selectedYear} year={selectedYear} onImported={onSaved} />

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
