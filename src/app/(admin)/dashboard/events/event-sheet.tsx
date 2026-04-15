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
import type { EventRow, EventType, EventStatus, EventAuditEntry, GcalDiffResult } from "@/lib/actions/events";

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

// ── GCal diff section ─────────────────────────────────────────────────────────

function GcalDiffSection({ eventId, gcalEventId, onAccepted }: {
    eventId: number;
    gcalEventId: string;
    onAccepted: () => void;
}) {
    const [diff, setDiff]       = useState<GcalDiffResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);
    const [accepting, setAccepting] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        setLoading(true);
        setError(null);
        getEventGcalDiff(eventId)
            .then(setDiff)
            .catch(e => setError(e instanceof Error ? e.message : "Chyba"))
            .finally(() => setLoading(false));
    }, [eventId, gcalEventId]);

    async function handleAccept(field: string, gcalValue: string | null) {
        setAccepting(field);
        try {
            await acceptGcalField(eventId, field, gcalValue);
            onAccepted();
            // Refresh diff
            const updated = await getEventGcalDiff(eventId);
            setDiff(updated);
        } finally {
            setAccepting(null);
        }
    }

    async function handlePushToGcal() {
        setSyncing(true);
        try {
            await syncEventToGcal(eventId);
            onAccepted();
            const updated = await getEventGcalDiff(eventId);
            setDiff(updated);
        } finally {
            setSyncing(false);
        }
    }

    if (loading) return <p className="text-xs text-gray-400 py-2">Načítám stav v Google Kalendáři…</p>;
    if (error)   return <p className="text-xs text-red-500 py-2">{error}</p>;
    if (!diff)   return null;
    if (!diff.gcalExists) return (
        <p className="text-xs text-gray-400 py-2">Akce není nalezena v Google Kalendáři (byla smazána nebo ID nesedí)</p>
    );

    const hasDiffs = diff.fields.some(f => !f.match);

    return (
        <div className="space-y-2">
            {diff.gcalUpdatedAt && (
                <p className="text-xs text-gray-400">
                    GCal upraven: {new Date(diff.gcalUpdatedAt).toLocaleDateString("cs-CZ")}
                </p>
            )}
            <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-gray-50 border-b">
                            <th className="text-left px-3 py-2 font-medium text-gray-500 w-24">Pole</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">Web</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">Google</th>
                            <th className="w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {diff.fields.map(f => (
                            <tr key={f.field} className={f.match ? "" : "bg-amber-50"}>
                                <td className="px-3 py-2 text-gray-500 font-medium">{f.label}</td>
                                <td className="px-3 py-2 text-gray-800">
                                    {f.field === "dateFrom" || f.field === "dateTo"
                                        ? fmtDate(f.appValue)
                                        : f.appValue ?? <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-gray-800">
                                    {f.match
                                        ? <span className="text-green-600">✓</span>
                                        : (f.field === "dateFrom" || f.field === "dateTo"
                                            ? fmtDate(f.gcalValue)
                                            : f.gcalValue ?? <span className="text-gray-300">—</span>)
                                    }
                                </td>
                                <td className="px-2 py-1">
                                    {!f.match && (
                                        <button
                                            title="Přijmout hodnotu z Google Kalendáře"
                                            disabled={accepting === f.field}
                                            onClick={() => handleAccept(f.field, f.gcalValue)}
                                            className="text-sky-600 hover:text-sky-800 disabled:opacity-40 text-sm font-medium px-1 rounded hover:bg-sky-50 transition-colors">
                                            {accepting === f.field ? "…" : "←"}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex items-center gap-3 pt-1">
                {hasDiffs && <p className="text-xs text-amber-600">⚠ Web a Google Kalendář se liší</p>}
                {!hasDiffs && <p className="text-xs text-green-600">✓ Shodné s Google Kalendářem</p>}
                <Button variant="outline" size="sm" className="ml-auto text-xs h-7"
                    disabled={syncing} onClick={handlePushToGcal}>
                    {syncing ? "Zapisuji…" : "→ Zapsat web → Google"}
                </Button>
            </div>
        </div>
    );
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

function ImmediateDate({ label, value, eventId, field, onSaved, min }: {
    label: string;
    value: string | null;
    eventId: number;
    field: string;
    onSaved: () => void;
    min?: string;
}) {
    const [saving, setSaving] = useState(false);
    const [draft, setDraft]   = useState(value ?? "");

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

    return (
        <div className="border-b last:border-0 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                <p className="text-sm font-medium text-gray-500 sm:w-28 shrink-0 mb-0.5 sm:mb-0">{label}</p>
                <input
                    type="date"
                    value={draft}
                    min={min}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={handleBlur}
                    disabled={saving}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                />
                {saving && <span className="text-xs text-gray-400">ukládám…</span>}
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

    useEffect(() => { if (!open) setActiveField(null); }, [open]);

    function save(field: string) {
        return async (value: string): Promise<{ success: true } | { error: string }> => {
            try {
                await updateEventField(event!.id, field, value || null);
                onSaved();
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
                                onSave={save("name")} />
                            <InlineField label="Místo" fieldId="location" type="text"
                                value={event.location} placeholder="Řeka, místo…"
                                activeField={activeField} onActiveFieldChange={setActiveField}
                                onSave={save("location")} />
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
                                eventId={event.id} field="dateFrom" onSaved={onSaved} />
                            <ImmediateDate label="Datum do" value={event.dateTo}
                                eventId={event.id} field="dateTo" onSaved={onSaved} min={event.dateFrom ?? undefined} />
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
                        {event.gcalEventId && (
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-700">Google Kalendář</p>
                                <GcalDiffSection
                                    eventId={event.id}
                                    gcalEventId={event.gcalEventId}
                                    onAccepted={onSaved}
                                />
                            </div>
                        )}
                        {!event.gcalEventId && (
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
