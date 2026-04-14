"use client";

import { useState, useEffect, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createEvent, updateEvent, deleteEvent, syncEventToGcal, removeEventFromGcal } from "@/lib/actions/events";
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, MONTH_NAMES } from "@/lib/events-config";
import type { EventRow, EventType, EventStatus } from "@/lib/actions/events";
import type { MemberOption } from "@/app/(admin)/dashboard/brigades/page";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    event: EventRow | null;
    allMembers: MemberOption[];
    defaultYear: number;
    onSaved: () => void;
}

function memberLabel(m: MemberOption) {
    return m.nickname
        ? `${m.lastName} ${m.firstName} (${m.nickname})`
        : `${m.lastName} ${m.firstName}`;
}

function matchesMember(m: MemberOption, q: string) {
    const lq = q.toLowerCase();
    return (
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(lq) ||
        `${m.lastName} ${m.firstName}`.toLowerCase().includes(lq) ||
        (m.nickname?.toLowerCase().includes(lq) ?? false)
    );
}

const EVENT_TYPES = Object.entries(EVENT_TYPE_LABELS) as [EventType, string][];
const EVENT_STATUSES = Object.entries(EVENT_STATUS_LABELS) as [EventStatus, string][];

export function EventSheet({ open, onOpenChange, event, allMembers, defaultYear, onSaved }: Props) {
    const isNew = event === null;

    const [name, setName]             = useState("");
    const [eventType, setEventType]   = useState<EventType>("other");
    const [dateFrom, setDateFrom]     = useState("");
    const [dateTo, setDateTo]         = useState("");
    const [approxMonth, setApproxMonth] = useState<number>(0);
    const [location, setLocation]     = useState("");
    const [leaderId, setLeaderId]     = useState<number | null>(null);
    const [leaderText, setLeaderText] = useState("");
    const [leaderFocused, setLeaderFocused] = useState(false);
    const [status, setStatus]         = useState<EventStatus>("planned");
    const [description, setDescription] = useState("");
    const [externalUrl, setExternalUrl] = useState("");
    const [gcalSync, setGcalSync]     = useState(false);
    const [note, setNote]             = useState("");

    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    // ── Init on open ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        setError(null);
        if (event) {
            setName(event.name);
            setEventType(event.eventType);
            setDateFrom(event.dateFrom ?? "");
            setDateTo(event.dateTo ?? "");
            setApproxMonth(event.approxMonth ?? 0);
            setLocation(event.location ?? "");
            setLeaderId(event.leaderId);
            const leader = event.leaderId ? allMembers.find(m => m.id === event.leaderId) : null;
            setLeaderText(leader ? `${leader.lastName} ${leader.firstName}` : "");
            setStatus(event.status);
            setDescription(event.description ?? "");
            setExternalUrl(event.externalUrl ?? "");
            setGcalSync(event.gcalSync);
            setNote(event.note ?? "");
        } else {
            setName("");
            setEventType("other");
            setDateFrom("");
            setDateTo("");
            setApproxMonth(0);
            setLocation("");
            setLeaderId(null);
            setLeaderText("");
            setStatus("planned");
            setDescription("");
            setExternalUrl("");
            setGcalSync(false);
            setNote("");
        }
    }, [open, event, allMembers]);

    // ── Leader autocomplete ───────────────────────────────────────────────────
    const leaderSuggestions = leaderFocused && leaderText.trim() !== ""
        ? allMembers.filter(m => matchesMember(m, leaderText)).slice(0, 6)
        : [];

    function selectLeader(m: MemberOption) {
        setLeaderId(m.id);
        setLeaderText(`${m.lastName} ${m.firstName}`);
        setLeaderFocused(false);
    }

    function onLeaderKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && leaderSuggestions.length > 0) {
            e.preventDefault();
            selectLeader(leaderSuggestions[0]);
        }
        if (e.key === "Escape") {
            const leader = leaderId ? allMembers.find(m => m.id === leaderId) : null;
            setLeaderText(leader ? `${leader.lastName} ${leader.firstName}` : "");
            setLeaderFocused(false);
        }
    }

    function onLeaderBlur() {
        setTimeout(() => {
            const leader = leaderId ? allMembers.find(m => m.id === leaderId) : null;
            setLeaderText(leader ? `${leader.lastName} ${leader.firstName}` : "");
            setLeaderFocused(false);
        }, 150);
    }

    // ── Save / Delete ─────────────────────────────────────────────────────────
    function handleSave() {
        setError(null);
        if (!name.trim()) { setError("Název je povinný"); return; }

        const data = {
            year:        defaultYear,
            name:        name.trim(),
            eventType,
            dateFrom:    dateFrom || null,
            dateTo:      dateTo || null,
            approxMonth: approxMonth || null,
            location:    location.trim() || null,
            leaderId,
            status,
            description: description.trim() || null,
            externalUrl: externalUrl.trim() || null,
            gcalSync,
            note:        note.trim() || null,
        };

        startTransition(async () => {
            try {
                if (isNew) {
                    const created = await createEvent(data);
                    // Auto-sync do GCal pokud je gcalSync=true a máme termín
                    if (gcalSync && dateFrom) {
                        try { await syncEventToGcal(created.id); } catch { /* sync selhání nevadí */ }
                    }
                } else {
                    await updateEvent(event.id, data);
                    if (gcalSync && dateFrom) {
                        try { await syncEventToGcal(event.id); } catch { /* sync selhání nevadí */ }
                    } else if (!gcalSync && event.gcalEventId) {
                        try { await removeEventFromGcal(event.id); } catch { /* sync selhání nevadí */ }
                    }
                }
                onSaved();
                onOpenChange(false);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Chyba při ukládání");
            }
        });
    }

    function handleDelete() {
        if (!event) return;
        if (!confirm(`Smazat akci „${event.name}"? Tato akce je nevratná.`)) return;
        startTransition(async () => {
            if (event.gcalEventId) {
                try { await removeEventFromGcal(event.id); } catch { /* ignorujeme */ }
            }
            await deleteEvent(event.id);
            onSaved();
            onOpenChange(false);
        });
    }

    // ── GCal sync ─────────────────────────────────────────────────────────────
    const [gcalSyncing, setGcalSyncing]   = useState(false);
    const [gcalSyncMsg, setGcalSyncMsg]   = useState<string | null>(null);
    const [gcalSyncedAt, setGcalSyncedAt] = useState<Date | null>(event?.gcalSyncedAt ?? null);
    const [gcalEventId, setGcalEventId]   = useState<string | null>(event?.gcalEventId ?? null);

    // Aktualizuj lokální GCal stav když se event změní (po otevření sheetu)
    useEffect(() => {
        setGcalSyncedAt(event?.gcalSyncedAt ?? null);
        setGcalEventId(event?.gcalEventId ?? null);
        setGcalSyncMsg(null);
    }, [event]);

    async function handleManualSync() {
        if (!event) return;
        if (!dateFrom) { setGcalSyncMsg("Nejprve nastav termín akce"); return; }
        setGcalSyncing(true);
        setGcalSyncMsg(null);
        try {
            const result = await syncEventToGcal(event.id);
            setGcalEventId(result.gcalEventId);
            setGcalSyncedAt(new Date());
            setGcalSyncMsg("Synchronizováno");
            onSaved();
        } catch (e) {
            setGcalSyncMsg(e instanceof Error ? e.message : "Chyba synchronizace");
        } finally {
            setGcalSyncing(false);
        }
    }

    async function handleRemoveFromGcal() {
        if (!event || !gcalEventId) return;
        if (!confirm("Odebrat tuto akci z Google Kalendáře?")) return;
        setGcalSyncing(true);
        try {
            await removeEventFromGcal(event.id);
            setGcalEventId(null);
            setGcalSyncedAt(null);
            setGcalSync(false);
            setGcalSyncMsg("Odebráno z Google Kalendáře");
            onSaved();
        } catch (e) {
            setGcalSyncMsg(e instanceof Error ? e.message : "Chyba při odebírání");
        } finally {
            setGcalSyncing(false);
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl px-5 pb-8 overflow-y-auto">
                <SheetHeader className="px-0 pt-5 pb-4">
                    <SheetTitle>{isNew ? "Nová akce" : `Akce: ${event.name}`}</SheetTitle>
                </SheetHeader>

                <div className="space-y-5">
                    {/* ── Název + typ ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="event-name">Název *</Label>
                        <Input
                            id="event-name"
                            placeholder="např. ČPV Otava, Doubrava, Zahraniční voda…"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="event-type">Typ akce</Label>
                            <select
                                id="event-type"
                                value={eventType}
                                onChange={e => setEventType(e.target.value as EventType)}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                {EVENT_TYPES.map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="event-status">Stav</Label>
                            <select
                                id="event-status"
                                value={status}
                                onChange={e => setStatus(e.target.value as EventStatus)}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                {EVENT_STATUSES.map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* ── Termín ── */}
                    <div className="space-y-2">
                        <Label>Termín</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <p className="text-xs text-gray-500">Od</p>
                                <Input
                                    type="date"
                                    value={dateFrom}
                                    onChange={e => setDateFrom(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <p className="text-xs text-gray-500">Do (nepovinné)</p>
                                <Input
                                    type="date"
                                    value={dateTo}
                                    onChange={e => setDateTo(e.target.value)}
                                    min={dateFrom || undefined}
                                />
                            </div>
                        </div>
                        {!dateFrom && (
                            <div className="space-y-1.5">
                                <p className="text-xs text-gray-500">Nebo orientační měsíc</p>
                                <select
                                    value={approxMonth}
                                    onChange={e => setApproxMonth(Number(e.target.value))}
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                    <option value={0}>— neznámý —</option>
                                    {MONTH_NAMES.slice(1).map((m, i) => (
                                        <option key={i + 1} value={i + 1}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* ── Místo ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="event-location">Místo / řeka</Label>
                        <Input
                            id="event-location"
                            placeholder="např. Otava, Český Krumlov…"
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                        />
                    </div>

                    {/* ── Vedoucí autocomplete ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="event-leader">Vedoucí akce</Label>
                        <div className="relative">
                            <Input
                                id="event-leader"
                                placeholder="Začni psát příjmení nebo přezdívku…"
                                value={leaderText}
                                autoComplete="off"
                                onChange={e => {
                                    setLeaderText(e.target.value);
                                    if (e.target.value.trim() === "") setLeaderId(null);
                                }}
                                onFocus={() => setLeaderFocused(true)}
                                onBlur={onLeaderBlur}
                                onKeyDown={onLeaderKeyDown}
                            />
                            {leaderId !== null && (
                                <button
                                    type="button"
                                    onClick={() => { setLeaderId(null); setLeaderText(""); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none px-1">
                                    ×
                                </button>
                            )}
                            {leaderSuggestions.length > 0 && (
                                <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-lg border shadow-md divide-y max-h-48 overflow-y-auto">
                                    {leaderSuggestions.map((m, i) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            className={[
                                                "w-full text-left px-3 py-2 text-sm transition-colors",
                                                i === 0 ? "bg-gray-50 font-medium" : "hover:bg-gray-50",
                                            ].join(" ")}
                                            onMouseDown={e => { e.preventDefault(); selectLeader(m); }}>
                                            {memberLabel(m)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-gray-400">Enter potvrdí první nabídku</p>
                    </div>

                    {/* ── Popis ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="event-description">Popis / pozvánka</Label>
                        <Textarea
                            id="event-description"
                            placeholder="Volitelný popis akce…"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={3}
                        />
                    </div>

                    {/* ── Odkaz + GCal ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="event-url">Odkaz (kanoe.cz, raft.cz…)</Label>
                        <Input
                            id="event-url"
                            type="url"
                            placeholder="https://…"
                            value={externalUrl}
                            onChange={e => setExternalUrl(e.target.value)}
                        />
                    </div>

                    {/* ── Google Kalendář ── */}
                    <div className="rounded-lg border bg-gray-50 px-4 py-3 space-y-3">
                        <div className="flex items-start gap-3">
                            <input
                                id="event-gcal"
                                type="checkbox"
                                checked={gcalSync}
                                onChange={e => setGcalSync(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#327600]"
                            />
                            <div className="flex-1 min-w-0">
                                <Label htmlFor="event-gcal" className="cursor-pointer">Synchronizovat s Google Kalendářem</Label>
                                {gcalEventId ? (
                                    <p className="text-xs text-green-700 mt-0.5">
                                        ✓ V kalendáři
                                        {gcalSyncedAt && ` · ${gcalSyncedAt.toLocaleDateString("cs")}`}
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {gcalSync
                                            ? dateFrom ? "Synchronizuje se při uložení" : "Nastav nejprve termín"
                                            : "Není v kalendáři"}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Tlačítka — jen pro existující akci */}
                        {!isNew && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={gcalSyncing || isPending || !dateFrom}
                                    onClick={handleManualSync}
                                    title={!dateFrom ? "Nejprve nastav termín akce" : undefined}
                                    className="text-xs h-7">
                                    {gcalSyncing ? "Synchronizuji…" : gcalEventId ? "Znovu synchronizovat" : "Synchronizovat nyní"}
                                </Button>
                                {gcalEventId && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={gcalSyncing || isPending}
                                        onClick={handleRemoveFromGcal}
                                        className="text-xs h-7 text-red-500 hover:text-red-700 hover:bg-red-50">
                                        Odebrat z kalendáře
                                    </Button>
                                )}
                                {gcalSyncMsg && (
                                    <span className={`text-xs ${gcalSyncMsg === "Synchronizováno" || gcalSyncMsg.startsWith("Odebráno") ? "text-green-600" : "text-red-500"}`}>
                                        {gcalSyncMsg}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Poznámka ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="event-note">Interní poznámka</Label>
                        <Textarea
                            id="event-note"
                            placeholder="Interní poznámka (nezobrazuje se členům)…"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={2}
                        />
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    {/* ── Akce ── */}
                    <div className="flex items-center gap-2 pt-2">
                        <Button
                            onClick={handleSave}
                            disabled={isPending}
                            className="bg-[#327600] hover:bg-[#2a6400]">
                            {isPending ? "Ukládám…" : isNew ? "Vytvořit akci" : "Uložit změny"}
                        </Button>
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Zrušit
                        </Button>
                        {!isNew && (
                            <Button
                                variant="ghost"
                                onClick={handleDelete}
                                disabled={isPending}
                                className="ml-auto text-red-500 hover:text-red-700 hover:bg-red-50">
                                Smazat
                            </Button>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
