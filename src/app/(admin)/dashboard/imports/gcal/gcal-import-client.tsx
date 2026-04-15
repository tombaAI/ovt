"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchGcalEvents, importGcalEvents } from "@/lib/actions/events";
import type { GcalImportItem } from "@/lib/actions/events";

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + 1 - i);

function fmtDate(iso: string) {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

function fmtDateRange(dateFrom: string | null, dateTo: string | null): string {
    if (dateFrom && dateTo && dateFrom !== dateTo) return `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
    if (dateFrom) return fmtDate(dateFrom);
    return "bez termínu";
}

export function GcalImportClient() {
    const router = useRouter();
    const [year, setYear]               = useState(new Date().getFullYear());
    const [loading, setLoading]         = useState(false);
    const [items, setItems]             = useState<GcalImportItem[]>([]);
    const [selected, setSelected]       = useState<Set<string>>(new Set());
    const [error, setError]             = useState<string | null>(null);
    const [message, setMessage]         = useState<string | null>(null);
    const [importing, setImporting]     = useState(false);
    const [loaded, setLoaded]           = useState(false);

    async function handleLoad() {
        setLoaded(false);
        setItems([]);
        setSelected(new Set());
        setError(null);
        setMessage(null);
        setLoading(true);
        try {
            const result = await fetchGcalEvents(year);
            setItems(result);
            setSelected(new Set(result.map(i => i.gcalEventId)));
            setLoaded(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Chyba načítání");
        } finally {
            setLoading(false);
        }
    }

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    }

    function toggleAll(checked: boolean) {
        setSelected(checked ? new Set(items.map(i => i.gcalEventId)) : new Set());
    }

    async function handleImport() {
        const toImport = items.filter(i => selected.has(i.gcalEventId));
        if (toImport.length === 0) return;
        setImporting(true);
        setError(null);
        try {
            const result = await importGcalEvents(year, toImport);
            setMessage(
                `Importováno ${result.imported} akcí` +
                (result.skipped > 0 ? `, přeskočeno ${result.skipped} (již existují).` : ".")
            );
            router.refresh();
            setLoaded(false);
            setItems([]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Chyba importu");
        } finally {
            setImporting(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* ── Výběr roku + tlačítko načíst ── */}
            <div className="flex items-end gap-3">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Rok</label>
                    <select
                        value={year}
                        onChange={e => { setYear(Number(e.target.value)); setLoaded(false); setItems([]); setMessage(null); setError(null); }}
                        className="h-9 rounded-md border border-gray-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#327600]"
                    >
                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <Button
                    onClick={handleLoad}
                    disabled={loading}
                    variant="outline"
                    size="sm"
                >
                    {loading ? "Načítám…" : "Načíst z Google Kalendáře"}
                </Button>
            </div>

            {/* ── Chyba ── */}
            {error && (
                <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
            )}

            {/* ── Zpráva po importu ── */}
            {message && (
                <p className="text-sm text-green-700 bg-green-50 px-4 py-3 rounded-lg font-medium">{message}</p>
            )}

            {/* ── Výsledky ── */}
            {loaded && !error && (
                <div className="rounded-xl border bg-white overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                        <p className="font-medium text-sm text-gray-700">
                            Google Kalendář — {year}
                            <span className="ml-2 text-gray-400 font-normal">({items.length} akcí)</span>
                        </p>
                    </div>

                    {items.length === 0 ? (
                        <p className="text-sm text-gray-400 px-4 py-8 text-center">
                            Žádné akce v Google Kalendáři pro rok {year}
                        </p>
                    ) : (
                        <>
                            <div className="divide-y max-h-[480px] overflow-y-auto">
                                {/* Vybrat vše */}
                                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-xs text-gray-500 sticky top-0">
                                    <input
                                        type="checkbox"
                                        checked={selected.size === items.length}
                                        onChange={e => toggleAll(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 accent-[#327600]"
                                    />
                                    <span>Vybrat vše ({items.length})</span>
                                    <span className="ml-auto">{selected.size} vybráno</span>
                                </div>

                                {items.map(item => (
                                    <label key={item.gcalEventId}
                                        className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(item.gcalEventId)}
                                            onChange={() => toggle(item.gcalEventId)}
                                            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#327600]"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{item.summary}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {fmtDateRange(item.dateFrom, item.dateTo)}
                                                {item.location && ` · ${item.location}`}
                                            </p>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            <div className="flex items-center gap-3 px-4 py-3 border-t bg-gray-50">
                                <Button
                                    size="sm"
                                    disabled={importing || selected.size === 0}
                                    onClick={handleImport}
                                    className="bg-[#327600] hover:bg-[#2a6400]"
                                >
                                    {importing ? "Importuji…" : `Importovat vybrané (${selected.size})`}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
