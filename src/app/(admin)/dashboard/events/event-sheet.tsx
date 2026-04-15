"use client";

import { useState, useEffect, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineField } from "@/app/(admin)/dashboard/members/inline-field";
import {
    createEvent, deleteEvent,
    updateEventField, getEventAuditLog, getEventGcalDiff,
    syncEventToGcal, acceptGcalField,
} from "@/lib/actions/events";
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, MONTH_NAMES } from "@/lib/events-config";
import type { EventRow, EventType, EventStatus, EventAuditEntry, GcalDiffResult, GcalDiffField } from "@/lib/actions/events";

interface MemberOption {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    nickname: string | null;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    event: EventRow | null;
    allMembers: MemberOption[];
    defaultYear: number;
    onSaved: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

function formatDateTime(d: Date) {
    return new Intl.DateTimeFormat("cs-CZ", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(d));
}

function memberLabel(m: MemberOption) {
    return m.nickname ? `${m.lastName} ${m.firstName} (${m.nickname})` : `${m.lastName} ${m.firstName}`;
}

function matchesMember(m: MemberOption, q: string) {
    const lq = q.toLowerCase();
    return (
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(lq) ||
        `${m.lastName} ${m.firstName}`.toLowerCase().includes(lq) ||
        (m.nickname?.toLowerCase().includes(lq) ?? false)
    );
}

const EVENT_TYPES  = Object.entries(EVENT_TYPE_LABELS)   as [EventType, string][];
const EVENT_STATUSES = Object.entries(EVENT_STATUS_LABELS) as [EventStatus, string][];

const EVENT_FIELD_LABELS: Record<string, string> = {
    name: "Název", eventType: "Typ", dateFrom: "Datum od", dateTo: "Datum do",
    approxMonth: "Orien. měsíc", location: "Místo", leaderId: "Vedoucí",
    status: "Stav", description: "Popis", externalUrl: "Odkaz",
    gcalSync: "GCal sync", note: "Poznámka",
    accept_from_gcal: "← přijato z GCal",
};

// ── GCal diff helpers ─────────────────────────────────────────────────────────

/** Najde diff entry pro konkrétní pole. Vrátí null pokud diff není načtený nebo pole shodné. */
function getFieldDiff(diff: GcalDiffResult | null, field: string): GcalDiffField | null {
    if (!diff || !diff.gcalExists) return null;
    const entry = diff.fields.find(f => f.field === field);
    return entry && !entry.match ? entry : null;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

function EventAuditLog({ eventId }: { eventId: number }) {
    const [log, setLog]         = useState<EventAuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen]       = useState(false);

    useEffect(() => {
        if (!open) return;
        getEventAuditLog(eventId).then(e => { setLog(e); setLoading(false); });
    }, [eventId, open]);

    return (
        <div>
            <button onClick={() => setOpen(v => !v)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                {open ? "▲" : "▼"} Historie změn
            </button>
            {open && (
                <div className="mt-2 space-y-2">
                    {loading && <p className="text-xs text-gray-400">Načítám…</p>}
                    {!loading && log.length === 0 && <p className="text-xs text-gray-400">Žádné záznamy</p>}
                    {log.map(entry => (
                        <div key={entry.id} className="text-xs border rounded-lg p-2.5 bg-gray-50 space-y-1">
                            <div className="flex items-center justify-between gap-2 text-gray-500">
                                <span className="font-medium text-gray-700 truncate">{entry.changedBy}</span>
                                <span className="shrink-0">{formatDateTime(entry.changedAt)}</span>
                            </div>
                            {entry.action === "accept_from_gcal" && (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-600 border border-sky-200">
                                    ← přijato z Google Kalendáře
                                </span>
                            )}
                            {Object.entries(entry.changes).map(([field, diff]) => (
                                <div key={field} className="flex gap-1 flex-wrap">
                                    <span className="text-gray-500">{EVENT_FIELD_LABELS[field] ?? field}:</span>
                                    {diff.old !== null && <span className="line-through text-red-400">{diff.old}</span>}
                                    {diff.old !== null && diff.new !== null && <span className="text-gray-400">→</span>}
                                    {diff.new !== null
                                        ? <span className="text-green-600">{diff.new}</span>
                                        : <span className="text-gray-400">(odstraněno)</span>}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Immediate-save select ─────────────────────────────────────────────────────

function ImmediateSelect({ label, value, options, eventId, field, onSaved }: {
    label: string;
    value: string | null;
    options: [string, string][];
    eventId: number;
    field: string;
    onSaved: () => void;
}) {
    const [saving, setSaving] = useState(false);

    async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        setSaving(true);
        try {
            await updateEventField(eventId, field, e.target.value || null);
            onSaved();
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="border-b last:border-0 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                <p className="text-sm font-medium text-gray-500 sm:w-28 shrink-0 mb-0.5 sm:mb-0">{label}</p>
                <select
                    value={value ?? ""}
                    onChange={handleChange}
                    disabled={saving}
                    className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50">
                    {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </div>
        </div>
    );
}

function ImmediateDate({ label, value, eventId, field, onSaved, min, gcalValue, onGcalAccept, onGcalPush }: {
    label: string;
    value: string | null;
    eventId: number;
    field: string;
    onSaved: () => void;
    min?: string;
    gcalValue?: string | null;
    onGcalAccept?: () => Promise<void>;
    onGcalPush?: () => Promise<void>;
}) {
    const [saving, setSaving]           = useState(false);
    const [draft, setDraft]             = useState(value ?? "");
    const [acceptingGcal, setAcceptingGcal] = useState(false);
    const [pushingGcal, setPushingGcal]     = useState(false);

    useEffect(() => setDraft(value ?? ""), [value]);

    async function handleBlur() {
        if (draft === (value ?? "")) return;
        setSaving(true);
        try {
            await updateEventField(eventId, field, draft || null);
            onSaved();
        } finally {
            setSaving(false);
        }
    }

    const hasGcalDiff = gcalValue !== undefined && gcalValue !== value;

    async function handleGcalAccept() {
        if (!onGcalAccept) return;
        setAcceptingGcal(true);
        await onGcalAccept();
        setAcceptingGcal(false);
    }

    async function handleGcalPush() {
        if (!onGcalPush) return;
        setPushingGcal(true);
        await onGcalPush();
        setPushingGcal(false);
    }

    return (
        <div className="border-b last:border-0 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                <p className="text-sm font-medium text-gray-500 sm:w-28 shrink-0 mb-0.5 sm:mb-0">{label}</p>
                <div className="flex-1">
                    <input
                        type="date"
                        value={draft}
                        min={min}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={handleBlur}
                        disabled={saving}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    />
                    {saving && <span className="ml-2 text-xs text-gray-400">ukládám…</span>}
                    {hasGcalDiff && (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-violet-600">
                                GCal: <span className="font-medium">{gcalValue ? fmtDate(gcalValue) : "(prázdné)"}</span>
                            </span>
                            {onGcalAccept && (
                                <button
                                    onClick={handleGcalAccept}
                                    disabled={acceptingGcal}
                                    className="text-xs text-violet-600 border border-violet-300 rounded px-1.5 py-0.5 hover:bg-violet-50 disabled:opacity-50"
                                    title="Přijmout hodnotu z Google Kalendáře"
                                >
                                    {acceptingGcal ? "…" : "← z GCal"}
                                </button>
                            )}
                            {onGcalPush && (
                                <button
                                    onClick={handleGcalPush}
                                    disabled={pushingGcal}
                                    className="text-xs text-gray-500 border border-gray-300 rounded px-1.5 py-0.5 hover:bg-gray-50 disabled:opacity-50"
                                    title="Zapsat aktuální hodnotu do Google Kalendáře"
                                >
                                    {pushingGcal ? "…" : "→ do GCal"}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ImmediateLeader({ value, valueId, eventId, allMembers, onSaved }: {
    value: string | null;
    valueId: number | null;
    eventId: number;
    allMembers: MemberOption[];
    onSaved: () => void;
}) {
    const [text, setText]           = useState(value ?? "");
    const [focused, setFocused]     = useState(false);
    const [currentId, setCurrentId] = useState<number | null>(valueId);
    const [saving, setSaving]       = useState(false);

    useEffect(() => { setText(value ?? ""); setCurrentId(valueId); }, [value, valueId]);

    const suggestions = focused && text.trim()
        ? allMembers.filter(m => matchesMember(m, text)).slice(0, 6)
        : [];

    async function select(m: MemberOption) {
        setText(`${m.lastName} ${m.firstName}`);
        setCurrentId(m.id);
        setFocused(false);
        setSaving(true);
        try { await updateEventField(eventId, "leaderId", String(m.id)); onSaved(); }
        finally { setSaving(false); }
    }

    async function clear() {
        setText(""); setCurrentId(null);
        setSaving(true);
        try { await updateEventField(eventId, "leaderId", null); onSaved(); }
        finally { setSaving(false); }
    }

    function onBlur() {
        setTimeout(() => {
            const leader = currentId ? allMembers.find(m => m.id === currentId) : null;
            setText(leader ? `${leader.lastName} ${leader.firstName}` : "");
            setFocused(false);
        }, 150);
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && suggestions.length > 0) { e.preventDefault(); select(suggestions[0]); }
        if (e.key === "Escape") { onBlur(); }
    }

    return (
        <div className="border-b last:border-0 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                <p className="text-sm font-medium text-gray-500 sm:w-28 shrink-0 mb-0.5 sm:mb-0">Vedoucí</p>
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={text}
                        placeholder="Příjmení nebo přezdívka…"
                        autoComplete="off"
                        onChange={e => { setText(e.target.value); if (!e.target.value.trim()) clear(); }}
                        onFocus={() => setFocused(true)}
                        onBlur={onBlur}
                        onKeyDown={onKeyDown}
                        disabled={saving}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 pr-7 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    />
                    {currentId && (
                        <button onClick={clear} type="button"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-base leading-none px-0.5">
                            ×
                        </button>
                    )}
                    {suggestions.length > 0 && (
                        <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-lg border shadow-md divide-y max-h-48 overflow-y-auto">
                            {suggestions.map((m, i) => (
                                <button key={m.id} type="button"
                                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${i === 0 ? "bg-gray-50 font-medium" : "hover:bg-gray-50"}`}
                                    onMouseDown={e => { e.preventDefault(); select(m); }}>
                                    {memberLabel(m)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {saving && <span className="text-xs text-gray-400">ukládám…</span>}
            </div>
        </div>
    );
}

// ── New event form ────────────────────────────────────────────────────────────

function NewEventForm({ defaultYear, allMembers, onSaved, onClose }: {
    defaultYear: number;
    allMembers: MemberOption[];
    onSaved: () => void;
    onClose: () => void;
}) {
    const [name, setName]         = useState("");
    const [eventType, setEventType] = useState<EventType>("other");
    const [dateFrom, setDateFrom] = useState("");
    const [approxMonth, setApproxMonth] = useState<number>(0);
    const [location, setLocation] = useState("");
    const [leaderId, setLeaderId] = useState<number | null>(null);
    const [leaderText, setLeaderText] = useState("");
    const [leaderFocused, setLeaderFocused] = useState(false);
    const [error, setError]       = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const leaderSuggestions = leaderFocused && leaderText.trim()
        ? allMembers.filter(m => matchesMember(m, leaderText)).slice(0, 6)
        : [];

    function selectLeader(m: MemberOption) {
        setLeaderId(m.id);
        setLeaderText(`${m.lastName} ${m.firstName}`);
        setLeaderFocused(false);
    }

    function handleSave() {
        setError(null);
        if (!name.trim()) { setError("Název je povinný"); return; }
        startTransition(async () => {
            try {
                await createEvent({
                    year: defaultYear, name: name.trim(),
                    eventType, dateFrom: dateFrom || null, dateTo: null,
                    approxMonth: approxMonth || null,
                    location: location.trim() || null, leaderId,
                    status: "planned", description: null, externalUrl: null,
                    gcalSync: false, note: null,
                });
                onSaved(); onClose();
            } catch (e) { setError(e instanceof Error ? e.message : "Chyba"); }
        });
    }

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label htmlFor="new-name">Název *</Label>
                <Input id="new-name" value={name} onChange={e => setName(e.target.value)}
                    placeholder="např. ČPV Otava, Doubrava…"
                    onKeyDown={e => e.key === "Enter" && handleSave()} />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label>Typ</Label>
                    <select value={eventType} onChange={e => setEventType(e.target.value as EventType)}
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                        {EVENT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <Label>Datum od</Label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                </div>
            </div>
            {!dateFrom && (
                <div className="space-y-1.5">
                    <Label>Orientační měsíc</Label>
                    <select value={approxMonth} onChange={e => setApproxMonth(Number(e.target.value))}
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                        <option value={0}>— neznámý —</option>
                        {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                </div>
            )}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label>Místo / řeka</Label>
                    <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="např. Otava…" />
                </div>
                <div className="space-y-1.5">
                    <Label>Vedoucí</Label>
                    <div className="relative">
                        <Input value={leaderText} autoComplete="off" placeholder="Příjmení…"
                            onChange={e => { setLeaderText(e.target.value); if (!e.target.value.trim()) setLeaderId(null); }}
                            onFocus={() => setLeaderFocused(true)}
                            onBlur={() => setTimeout(() => setLeaderFocused(false), 150)}
                            onKeyDown={e => { if (e.key === "Enter" && leaderSuggestions.length > 0) { e.preventDefault(); selectLeader(leaderSuggestions[0]); }}} />
                        {leaderSuggestions.length > 0 && (
                            <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-lg border shadow-md divide-y max-h-40 overflow-y-auto">
                                {leaderSuggestions.map((m, i) => (
                                    <button key={m.id} type="button"
                                        className={`w-full text-left px-3 py-2 text-sm ${i === 0 ? "bg-gray-50 font-medium" : "hover:bg-gray-50"}`}
                                        onMouseDown={e => { e.preventDefault(); selectLeader(m); }}>
                                        {memberLabel(m)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
                <Button onClick={handleSave} disabled={isPending} className="bg-[#327600] hover:bg-[#2a6400]">
                    {isPending ? "Ukládám…" : "Vytvořit akci"}
                </Button>
                <Button variant="ghost" onClick={onClose} disabled={isPending}>Zrušit</Button>
            </div>
        </div>
    );
}

// ── Main sheet ────────────────────────────────────────────────────────────────

export function EventSheet({ open, onOpenChange, event, allMembers, defaultYear, onSaved }: Props) {
    const isNew = event === null;
    const [activeField, setActiveField] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [diff, setDiff] = useState<GcalDiffResult | null>(null);
    const [syncing, setSyncing] = useState(false);

    // Načti diff kdykoliv se otevře sheet pro existující akci s gcalEventId
    useEffect(() => {
        if (!open || !event?.gcalEventId) { setDiff(null); return; }
        getEventGcalDiff(event.id).then(setDiff).catch(() => setDiff(null));
    }, [open, event?.id, event?.gcalEventId]);

    useEffect(() => { if (!open) { setActiveField(null); setDiff(null); } }, [open]);

    function save(field: string) {
        return async (value: string): Promise<{ success: true } | { error: string }> => {
            try {
                await updateEventField(event!.id, field, value || null);
                onSaved();
                // Obnovit diff po uložení
                if (event?.gcalEventId) {
                    getEventGcalDiff(event.id).then(setDiff).catch(() => {});
                }
                return { success: true };
            } catch (e) {
                return { error: e instanceof Error ? e.message : "Chyba" };
            }
        };
    }

    async function handleDelete() {
        if (!event) return;
        if (!confirm(`Smazat akci „${event.name}"? Tato akce je nevratná.`)) return;
        setDeleting(true);
        try {
            await deleteEvent(event.id);
            onSaved();
            onOpenChange(false);
        } finally {
            setDeleting(false);
        }
    }

    /** Přijme hodnotu z GCal pro dané pole a obnoví diff */
    function makeGcalAccept(field: string, gcalValue: string | null) {
        return async () => {
            await acceptGcalField(event!.id, field, gcalValue);
            onSaved();
            const updated = await getEventGcalDiff(event!.id);
            setDiff(updated);
        };
    }

    /** Zapíše celou akci do GCal a obnoví diff */
    async function pushToGcal() {
        if (!event) return;
        setSyncing(true);
        try {
            await syncEventToGcal(event.id);
            onSaved();
            const updated = await getEventGcalDiff(event.id);
            setDiff(updated);
        } finally {
            setSyncing(false);
        }
    }

    // Zkratka: vrátí gcalValue pro dané pole (null = shodné nebo diff nenačtený)
    function gcalFieldValue(field: string) {
        return getFieldDiff(diff, field)?.gcalValue ?? undefined;
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl px-5 pb-8 overflow-y-auto">
                <SheetHeader className="px-0 pt-5 pb-2">
                    <SheetTitle>{isNew ? "Nová akce" : event.name}</SheetTitle>
                </SheetHeader>

                {isNew ? (
                    <NewEventForm
                        defaultYear={defaultYear}
                        allMembers={allMembers}
                        onSaved={onSaved}
                        onClose={() => onOpenChange(false)}
                    />
                ) : (
                    <div className="space-y-6">
                        {/* ── Základní pole ── */}
                        <div className="rounded-lg border bg-white overflow-hidden">
                            <InlineField label="Název" fieldId="name" type="text"
                                value={event.name} placeholder="Název akce"
                                activeField={activeField} onActiveFieldChange={setActiveField}
                                onSave={save("name")}
                                gcalValue={gcalFieldValue("name")}
                                onGcalAccept={gcalFieldValue("name") !== undefined
                                    ? makeGcalAccept("name", gcalFieldValue("name") ?? null)
                                    : undefined}
                                onGcalPush={gcalFieldValue("name") !== undefined ? pushToGcal : undefined}
                            />
                            <InlineField label="Místo" fieldId="location" type="text"
                                value={event.location} placeholder="Řeka, místo…"
                                activeField={activeField} onActiveFieldChange={setActiveField}
                                onSave={save("location")}
                                gcalValue={gcalFieldValue("location")}
                                onGcalAccept={gcalFieldValue("location") !== undefined
                                    ? makeGcalAccept("location", gcalFieldValue("location") ?? null)
                                    : undefined}
                                onGcalPush={gcalFieldValue("location") !== undefined ? pushToGcal : undefined}
                            />
                            <InlineField label="Odkaz" fieldId="externalUrl" type="text"
                                value={event.externalUrl} placeholder="https://…"
                                activeField={activeField} onActiveFieldChange={setActiveField}
                                onSave={save("externalUrl")} />
                        </div>

                        {/* ── Výběry a datumy ── */}
                        <div className="rounded-lg border bg-white overflow-hidden">
                            <ImmediateSelect label="Typ" value={event.eventType}
                                options={EVENT_TYPES} eventId={event.id} field="eventType" onSaved={onSaved} />
                            <ImmediateSelect label="Stav" value={event.status}
                                options={EVENT_STATUSES} eventId={event.id} field="status" onSaved={onSaved} />
                            <ImmediateDate label="Datum od" value={event.dateFrom}
                                eventId={event.id} field="dateFrom" onSaved={onSaved}
                                gcalValue={gcalFieldValue("dateFrom")}
                                onGcalAccept={gcalFieldValue("dateFrom") !== undefined
                                    ? makeGcalAccept("dateFrom", gcalFieldValue("dateFrom") ?? null)
                                    : undefined}
                                onGcalPush={gcalFieldValue("dateFrom") !== undefined ? pushToGcal : undefined}
                            />
                            <ImmediateDate label="Datum do" value={event.dateTo}
                                eventId={event.id} field="dateTo" onSaved={onSaved}
                                min={event.dateFrom ?? undefined}
                                gcalValue={gcalFieldValue("dateTo")}
                                onGcalAccept={gcalFieldValue("dateTo") !== undefined
                                    ? makeGcalAccept("dateTo", gcalFieldValue("dateTo") ?? null)
                                    : undefined}
                                onGcalPush={gcalFieldValue("dateTo") !== undefined ? pushToGcal : undefined}
                            />
                            {!event.dateFrom && (
                                <ImmediateSelect label="Orien. měsíc"
                                    value={event.approxMonth ? String(event.approxMonth) : null}
                                    options={[["", "— neznámý —"], ...MONTH_NAMES.slice(1).map((m, i) => [String(i + 1), m] as [string, string])]}
                                    eventId={event.id} field="approxMonth" onSaved={onSaved} />
                            )}
                            <ImmediateLeader
                                value={event.leaderName}
                                valueId={event.leaderId}
                                eventId={event.id}
                                allMembers={allMembers}
                                onSaved={onSaved}
                            />
                        </div>

                        {/* ── Textové bloky ── */}
                        <div className="space-y-3">
                            <ImmediateTextarea label="Popis" value={event.description}
                                eventId={event.id} field="description" onSaved={onSaved} placeholder="Volitelný popis…" />
                            <ImmediateTextarea label="Interní poznámka" value={event.note}
                                eventId={event.id} field="note" onSaved={onSaved} placeholder="Interní poznámka…" />
                        </div>

                        {/* ── Google Kalendář ── */}
                        {event.gcalEventId ? (
                            <GcalStatusBar diff={diff} syncing={syncing} onPush={pushToGcal} />
                        ) : (
                            <GcalSyncStarter event={event} onSaved={onSaved} />
                        )}

                        {/* ── Smazání ── */}
                        <div className="flex justify-between items-center pt-2 border-t">
                            <EventAuditLog eventId={event.id} />
                            <Button variant="ghost" size="sm" disabled={deleting}
                                onClick={handleDelete}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs">
                                {deleting ? "Mažu…" : "Smazat akci"}
                            </Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

// ── Immediate textarea ────────────────────────────────────────────────────────

function ImmediateTextarea({ label, value, eventId, field, onSaved, placeholder }: {
    label: string;
    value: string | null;
    eventId: number;
    field: string;
    onSaved: () => void;
    placeholder?: string;
}) {
    const [draft, setDraft]   = useState(value ?? "");
    const [saving, setSaving] = useState(false);

    useEffect(() => setDraft(value ?? ""), [value]);

    async function handleBlur() {
        const newVal = draft.trim() || null;
        if (newVal === (value ?? null)) return;
        setSaving(true);
        try { await updateEventField(eventId, field, newVal); onSaved(); }
        finally { setSaving(false); }
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">{label}</p>
                {saving && <p className="text-xs text-gray-400">ukládám…</p>}
            </div>
            <Textarea value={draft} onChange={e => setDraft(e.target.value)}
                onBlur={handleBlur} placeholder={placeholder} rows={2}
                className="text-sm resize-none" />
        </div>
    );
}

// ── GCal status bar (event s gcalEventId) ────────────────────────────────────

function GcalStatusBar({ diff, syncing, onPush }: {
    diff: GcalDiffResult | null;
    syncing: boolean;
    onPush: () => Promise<void>;
}) {
    const hasDiffs = diff?.gcalExists && diff.fields.some(f => !f.match);
    const allMatch = diff?.gcalExists && diff.fields.every(f => f.match);

    return (
        <div className="flex items-center gap-3 rounded-lg border bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
            <span className="flex-1">
                {!diff && "GCal: načítám…"}
                {diff && !diff.gcalExists && "⚠ Akce nenalezena v Google Kalendáři"}
                {hasDiffs && <span className="text-violet-600">⚠ Hodnoty se liší od Google Kalendáře (viz pole výše)</span>}
                {allMatch && <span className="text-green-600">✓ Shodné s Google Kalendářem</span>}
            </span>
            <Button variant="outline" size="sm" disabled={syncing} onClick={onPush}
                className="text-xs h-7 shrink-0">
                {syncing ? "Zapisuji…" : "→ do GCal"}
            </Button>
        </div>
    );
}

// ── GCal sync starter (event bez gcalEventId) ─────────────────────────────────

function GcalSyncStarter({ event, onSaved }: { event: EventRow; onSaved: () => void }) {
    const [syncing, setSyncing] = useState(false);
    const [msg, setMsg]         = useState<string | null>(null);

    async function handleSync() {
        if (!event.dateFrom) { setMsg("Nejprve nastav termín akce"); return; }
        setSyncing(true);
        try {
            await syncEventToGcal(event.id);
            onSaved();
            setMsg("Přidáno do Google Kalendáře");
        } catch (e) {
            setMsg(e instanceof Error ? e.message : "Chyba synchronizace");
        } finally {
            setSyncing(false);
        }
    }

    return (
        <div className="flex items-center gap-3 rounded-lg border bg-gray-50 px-4 py-3">
            <Button variant="outline" size="sm" disabled={syncing || !event.dateFrom} onClick={handleSync}
                title={!event.dateFrom ? "Nejprve nastav termín" : undefined}
                className="text-xs h-7">
                {syncing ? "Přidávám…" : "+ Přidat do Google Kalendáře"}
            </Button>
            {msg && <p className={`text-xs ${msg.startsWith("Přidáno") ? "text-green-600" : "text-red-500"}`}>{msg}</p>}
        </div>
    );
}
