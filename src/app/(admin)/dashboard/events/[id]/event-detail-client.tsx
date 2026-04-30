"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Download, FileText, MoreHorizontal, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InlineField } from "@/app/(admin)/dashboard/members/inline-field";
import {
    updateEventField, deleteEvent, getEventAuditLog,
    getEventGcalDiff, syncEventToGcal, acceptGcalField,
    getMembersForAutocomplete,
} from "@/lib/actions/events";
import { getEventRegistrationsForAdmin, getRegistrationAuditLog } from "@/lib/actions/event-registrations";
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, MONTH_NAMES } from "@/lib/events-config";
import type {
    EventRow, EventType, EventStatus, EventAuditEntry,
    GcalDiffResult, GcalDiffField, MemberOption,
} from "@/lib/actions/events";
import type { EventRegistrationAdminRow, RegistrationAuditEntry } from "@/lib/actions/event-registrations";
import { EventExpensesTab } from "./event-expenses-tab";

interface Props {
    event: EventRow;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

function fmtDateTime(d: Date) {
    return new Intl.DateTimeFormat("cs-CZ", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(d));
}

function matchesMember(m: MemberOption, q: string) {
    const lq = q.toLowerCase();
    return (
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(lq) ||
        `${m.lastName} ${m.firstName}`.toLowerCase().includes(lq) ||
        (m.nickname?.toLowerCase().includes(lq) ?? false)
    );
}

function memberLabel(m: MemberOption) {
    return m.nickname ? `${m.lastName} ${m.firstName} (${m.nickname})` : `${m.lastName} ${m.firstName}`;
}

function getFieldDiff(diff: GcalDiffResult | null, field: string): GcalDiffField | null {
    if (!diff || !diff.gcalExists) return null;
    const entry = diff.fields.find(f => f.field === field);
    return entry && !entry.match ? entry : null;
}

const EVENT_TYPES    = Object.entries(EVENT_TYPE_LABELS)   as [EventType, string][];
const EVENT_STATUSES = Object.entries(EVENT_STATUS_LABELS) as [EventStatus, string][];

const EVENT_FIELD_LABELS: Record<string, string> = {
    name: "Název", eventType: "Typ",
    dateFrom: "Datum od", dateTo: "Datum do",
    timeFrom: "Čas od", timeTo: "Čas do",
    registrationFrom: "Přihlášky od", registrationTo: "Přihlášky do",
    approxMonth: "Orien. měsíc", location: "Místo", leaderId: "Vedoucí",
    status: "Stav", description: "Popis", externalUrl: "Odkaz",
    gcalSync: "GCal sync", note: "Poznámka", accept_from_gcal: "← přijato z GCal",
};

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

const PAYMENT_STATUS_COLORS: Record<string, string> = {
    pending:   "bg-amber-50 text-amber-700",
    matched:   "bg-blue-50 text-blue-700",
    paid:      "bg-green-50 text-green-700",
    cancelled: "bg-red-50 text-red-600",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
    pending:   "čeká",
    matched:   "spárováno",
    paid:      "zaplaceno",
    cancelled: "zrušeno",
};

const PAYMENT_STATUS_BAR_COLORS: Record<string, string> = {
    pending: "from-amber-200 via-amber-300 to-amber-400",
    matched: "from-blue-200 via-blue-300 to-blue-400",
    paid: "from-green-200 via-green-300 to-green-400",
    cancelled: "from-rose-200 via-rose-300 to-rose-400",
};

// ── Audit log dialog ──────────────────────────────────────────────────────────

function AuditLogDialog({ open, onOpenChange, eventId }: {
    open: boolean; onOpenChange: (v: boolean) => void; eventId: number;
}) {
    const [log, setLog]         = useState<EventAuditEntry[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        getEventAuditLog(eventId).then(e => { setLog(e); setLoading(false); });
    }, [open, eventId]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Audit log</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto space-y-2 pt-1">
                    {loading && <p className="text-sm text-gray-400 py-4">Načítám…</p>}
                    {!loading && log.length === 0 && <p className="text-sm text-gray-400 py-4">Žádné záznamy</p>}
                    {log.map(entry => (
                        <div key={entry.id} className="text-xs border rounded-lg p-2.5 bg-gray-50 space-y-1">
                            <div className="flex items-center justify-between gap-2 text-gray-500 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-gray-700">{entry.changedBy}</span>
                                    {entry.action === "accept_from_gcal" && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-600 border border-violet-200">
                                            ← z GCal
                                        </span>
                                    )}
                                </div>
                                <span>{fmtDateTime(entry.changedAt)}</span>
                            </div>
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
            </DialogContent>
        </Dialog>
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
        try { await updateEventField(eventId, field, e.target.value || null); onSaved(); }
        finally { setSaving(false); }
    }

    return (
        <div className="border-b last:border-0 py-3 flex flex-col sm:flex-row sm:items-center sm:gap-4">
            <p className="text-sm font-medium text-gray-500 sm:w-28 shrink-0 mb-0.5 sm:mb-0">{label}</p>
            <select value={value ?? ""} onChange={handleChange} disabled={saving}
                className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50">
                {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
        </div>
    );
}

// ── Immediate-save date (+ optional time on same row) ────────────────────────

function ImmediateDate({ label, value, eventId, field, onSaved, min, gcalValue, onGcalAccept, onGcalPush,
    timeValue, timeField, timeGcalValue, onTimeGcalAccept, onTimeGcalPush }: {
    label: string;
    value: string | null;
    eventId: number;
    field: string;
    onSaved: () => void;
    min?: string;
    gcalValue?: string | null;
    onGcalAccept?: () => Promise<void>;
    onGcalPush?: () => Promise<void>;
    // optional inline time
    timeValue?: string | null;
    timeField?: string;
    timeGcalValue?: string | null;
    onTimeGcalAccept?: () => Promise<void>;
    onTimeGcalPush?: () => Promise<void>;
}) {
    const [savingDate, setSavingDate]         = useState(false);
    const [savingTime, setSavingTime]         = useState(false);
    const [draftDate, setDraftDate]           = useState(value ?? "");
    const [draftTime, setDraftTime]           = useState(timeValue ?? "");
    const [acceptingGcal, setAcceptingGcal]   = useState(false);
    const [pushingGcal, setPushingGcal]       = useState(false);
    const [acceptingTimeGcal, setAcceptingTimeGcal] = useState(false);
    const [pushingTimeGcal, setPushingTimeGcal]     = useState(false);

    useEffect(() => setDraftDate(value ?? ""), [value]);
    useEffect(() => setDraftTime(timeValue ?? ""), [timeValue]);

    async function handleDateBlur() {
        if (draftDate === (value ?? "")) return;
        setSavingDate(true);
        try { await updateEventField(eventId, field, draftDate || null); onSaved(); }
        finally { setSavingDate(false); }
    }

    async function handleTimeBlur() {
        if (!timeField || draftTime === (timeValue ?? "")) return;
        setSavingTime(true);
        try { await updateEventField(eventId, timeField, draftTime || null); onSaved(); }
        finally { setSavingTime(false); }
    }

    async function clearTime() {
        if (!timeField || !timeValue) return;
        setSavingTime(true);
        try { await updateEventField(eventId, timeField, null); onSaved(); setDraftTime(""); }
        finally { setSavingTime(false); }
    }

    const hasDateGcalDiff = gcalValue !== undefined && gcalValue !== value;
    const hasTimeGcalDiff = timeGcalValue !== undefined && timeGcalValue !== timeValue;

    return (
        <div className="border-b last:border-0 py-3 flex flex-col sm:flex-row sm:items-start sm:gap-4">
            <p className="text-sm font-medium text-gray-500 sm:w-28 sm:pt-1 shrink-0 mb-0.5 sm:mb-0">{label}</p>
            <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={draftDate} min={min}
                        onChange={e => setDraftDate(e.target.value)}
                        onBlur={handleDateBlur} disabled={savingDate}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    />
                    {timeField !== undefined && (
                        <div className="flex items-center gap-1">
                            <input type="time" value={draftTime}
                                onChange={e => setDraftTime(e.target.value)}
                                onBlur={handleTimeBlur} disabled={savingTime}
                                className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                            />
                            {timeValue && (
                                <button onClick={clearTime} disabled={savingTime}
                                    className="text-gray-400 hover:text-gray-600 text-base leading-none px-0.5 disabled:opacity-40"
                                    title="Odebrat čas">×</button>
                            )}
                        </div>
                    )}
                    {(savingDate || savingTime) && <span className="text-xs text-gray-400">ukládám…</span>}
                </div>

                {/* GCal diff pro datum */}
                {hasDateGcalDiff && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-violet-600">
                            GCal datum: <span className="font-medium">{gcalValue ? fmtDate(gcalValue) : "(prázdné)"}</span>
                        </span>
                        {onGcalAccept && (
                            <button onClick={async () => { setAcceptingGcal(true); await onGcalAccept(); setAcceptingGcal(false); }}
                                disabled={acceptingGcal}
                                className="text-xs text-violet-600 border border-violet-300 rounded px-1.5 py-0.5 hover:bg-violet-50 disabled:opacity-50">
                                {acceptingGcal ? "…" : "← z GCal"}
                            </button>
                        )}
                        {onGcalPush && (
                            <button onClick={async () => { setPushingGcal(true); await onGcalPush(); setPushingGcal(false); }}
                                disabled={pushingGcal}
                                className="text-xs text-gray-500 border border-gray-300 rounded px-1.5 py-0.5 hover:bg-gray-50 disabled:opacity-50">
                                {pushingGcal ? "…" : "→ do GCal"}
                            </button>
                        )}
                    </div>
                )}

                {/* GCal diff pro čas */}
                {hasTimeGcalDiff && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-violet-600">
                            GCal čas: <span className="font-medium">{timeGcalValue ?? "(žádný)"}</span>
                        </span>
                        {onTimeGcalAccept && (
                            <button onClick={async () => { setAcceptingTimeGcal(true); await onTimeGcalAccept(); setAcceptingTimeGcal(false); }}
                                disabled={acceptingTimeGcal}
                                className="text-xs text-violet-600 border border-violet-300 rounded px-1.5 py-0.5 hover:bg-violet-50 disabled:opacity-50">
                                {acceptingTimeGcal ? "…" : "← z GCal"}
                            </button>
                        )}
                        {onTimeGcalPush && (
                            <button onClick={async () => { setPushingTimeGcal(true); await onTimeGcalPush(); setPushingTimeGcal(false); }}
                                disabled={pushingTimeGcal}
                                className="text-xs text-gray-500 border border-gray-300 rounded px-1.5 py-0.5 hover:bg-gray-50 disabled:opacity-50">
                                {pushingTimeGcal ? "…" : "→ do GCal"}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Immediate-save leader autocomplete ────────────────────────────────────────

function ImmediateLeader({ value, valueId, eventId, allMembers, membersLoaded, onSaved }: {
    value: string | null;
    valueId: number | null;
    eventId: number;
    allMembers: MemberOption[];
    membersLoaded: boolean;
    onSaved: () => void;
}) {
    const [text, setText]           = useState(value ?? "");
    const [focused, setFocused]     = useState(false);
    const [currentId, setCurrentId] = useState<number | null>(valueId);
    const [saving, setSaving]       = useState(false);

    useEffect(() => { setText(value ?? ""); setCurrentId(valueId); }, [value, valueId]);

    const suggestions = focused && text.trim() && membersLoaded
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

    return (
        <div className="border-b last:border-0 py-3 flex flex-col sm:flex-row sm:items-center sm:gap-4">
            <p className="text-sm font-medium text-gray-500 sm:w-28 shrink-0 mb-0.5 sm:mb-0">Vedoucí</p>
            <div className="relative flex-1">
                <input type="text" value={text}
                    placeholder={membersLoaded ? "Příjmení nebo přezdívka…" : "Načítám seznam členů…"}
                    autoComplete="off" disabled={saving || !membersLoaded}
                    onChange={e => { setText(e.target.value); if (!e.target.value.trim()) clear(); }}
                    onFocus={() => setFocused(true)} onBlur={onBlur}
                    onKeyDown={e => {
                        if (e.key === "Enter" && suggestions.length > 0) { e.preventDefault(); select(suggestions[0]); }
                        if (e.key === "Escape") onBlur();
                    }}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 pr-7 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                />
                {currentId && membersLoaded && (
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
                {saving && <span className="ml-2 text-xs text-gray-400">ukládám…</span>}
            </div>
        </div>
    );
}

// ── Immediate-save textarea (click-to-edit) ───────────────────────────────────

function ImmediateTextarea({ label, value, eventId, field, onSaved, placeholder, gcalValue, onGcalAccept, onGcalPush }: {
    label: string;
    value: string | null;
    eventId: number;
    field: string;
    onSaved: () => void;
    placeholder?: string;
    gcalValue?: string | null;       // undefined = pole mimo GCal sync; null = GCal má prázdné
    onGcalAccept?: () => Promise<void>;
    onGcalPush?: () => Promise<void>; // předávat vždy pokud je akce v GCal
}) {
    const [editing, setEditing]             = useState(false);
    const [draft, setDraft]                 = useState(value ?? "");
    const [saving, setSaving]               = useState(false);
    const [acceptingGcal, setAcceptingGcal] = useState(false);
    const [pushingGcal, setPushingGcal]     = useState(false);

    useEffect(() => { if (!editing) setDraft(value ?? ""); }, [value, editing]);

    async function handleSave() {
        const newVal = draft.trim() || null;
        if (newVal === (value ?? null)) { setEditing(false); return; }
        setSaving(true);
        try { await updateEventField(eventId, field, newVal); onSaved(); setEditing(false); }
        finally { setSaving(false); }
    }

    // diff existuje jen pokud byl gcalValue předán (pole je v GCal sync) a hodnoty se liší
    const hasGcalDiff = gcalValue !== undefined && gcalValue !== (value?.trim() || null);
    // pole je v GCal sync pokud byl gcalValue předán NEBO onGcalPush předán
    const isGcalField = gcalValue !== undefined || onGcalPush !== undefined;

    return (
        <div className="border-b last:border-0 py-3">
            <p className="text-sm font-medium text-gray-500 mb-1.5">{label}</p>
            {editing ? (
                <div className="space-y-2">
                    <Textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => e.key === "Escape" && (setDraft(value ?? ""), setEditing(false))}
                        placeholder={placeholder} rows={4} className="text-sm resize-none" />
                    <div className="flex items-center gap-2">
                        <button onClick={handleSave} disabled={saving}
                            className="w-8 h-8 flex items-center justify-center rounded-md bg-[#327600] text-white hover:bg-[#2a6400] disabled:opacity-50 text-sm">✓</button>
                        <button onClick={() => { setDraft(value ?? ""); setEditing(false); }}
                            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-100 text-sm">✕</button>
                        {saving && <span className="text-xs text-gray-400">ukládám…</span>}
                    </div>
                </div>
            ) : (
                <div>
                    <button onClick={() => setEditing(true)}
                        className="w-full text-left text-sm rounded-md px-1 -mx-1 py-1 hover:bg-blue-50 transition-colors group">
                        {value
                            ? <span className="text-gray-900 whitespace-pre-wrap group-hover:text-blue-700">{value}</span>
                            : <span className="text-gray-400 italic group-hover:text-blue-500">{placeholder ?? "(nezadáno)"}</span>
                        }
                    </button>

                    {/* ── GCal diff (obě hodnoty, prominentní) ── */}
                    {hasGcalDiff && (
                        <div className="mt-2 rounded-lg border border-violet-200 overflow-hidden">
                            <div className="px-3 py-1.5 bg-violet-50 border-b border-violet-200">
                                <p className="text-xs font-medium text-violet-700">⚠ Liší se od Google Kalendáře</p>
                            </div>
                            <div className="grid grid-cols-2 divide-x divide-violet-100 bg-white">
                                <div className="px-3 py-2">
                                    <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Aplikace</p>
                                    <p className="text-xs text-gray-900 whitespace-pre-wrap">{value ?? "(prázdné)"}</p>
                                </div>
                                <div className="px-3 py-2 bg-violet-50/50">
                                    <p className="text-[11px] text-violet-500 uppercase tracking-wide mb-1">Google Kalendář</p>
                                    <p className="text-xs text-violet-800 whitespace-pre-wrap">{gcalValue ?? "(prázdné)"}</p>
                                </div>
                            </div>
                            <div className="flex gap-2 px-3 py-2 bg-gray-50 border-t border-violet-100">
                                {onGcalAccept && (
                                    <button onClick={async () => { setAcceptingGcal(true); await onGcalAccept(); setAcceptingGcal(false); }}
                                        disabled={acceptingGcal}
                                        className="text-xs text-violet-600 border border-violet-300 rounded px-2 py-1 hover:bg-violet-50 disabled:opacity-50">
                                        {acceptingGcal ? "…" : "← přijmout z GCal"}
                                    </button>
                                )}
                                {onGcalPush && (
                                    <button onClick={async () => { setPushingGcal(true); await onGcalPush(); setPushingGcal(false); }}
                                        disabled={pushingGcal}
                                        className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-50">
                                        {pushingGcal ? "…" : "→ zapsat do GCal"}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── V GCal sync, bez difu — subtilní řádek s možností pushnutí ── */}
                    {!hasGcalDiff && isGcalField && onGcalPush && (
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-gray-400">✓ v GCal</span>
                            <button onClick={async () => { setPushingGcal(true); await onGcalPush(); setPushingGcal(false); }}
                                disabled={pushingGcal}
                                className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                                {pushingGcal ? "…" : "→ zapsat do GCal"}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── GCal status bar ───────────────────────────────────────────────────────────

function GcalStatusBar({ diff, syncing, onPush }: {
    diff: GcalDiffResult | null;
    syncing: boolean;
    onPush: () => Promise<void>;
}) {
    const hasDiffs = diff?.gcalExists && diff.fields.some(f => !f.match);
    const allMatch = diff?.gcalExists && diff.fields.every(f => f.match);

    return (
        <div className="flex items-center gap-3 rounded-xl border bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
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

function GcalSyncStarter({ event, onSaved }: { event: EventRow; onSaved: () => void }) {
    const [syncing, setSyncing] = useState(false);
    const [msg, setMsg]         = useState<string | null>(null);

    async function handleSync() {
        if (!event.dateFrom) { setMsg("Nejprve nastav termín akce"); return; }
        setSyncing(true);
        try { await syncEventToGcal(event.id); onSaved(); setMsg("Přidáno do Google Kalendáře"); }
        catch (e) { setMsg(e instanceof Error ? e.message : "Chyba synchronizace"); }
        finally { setSyncing(false); }
    }

    return (
        <div className="flex items-center gap-3 rounded-xl border bg-gray-50 px-4 py-3">
            <Button variant="outline" size="sm" disabled={syncing || !event.dateFrom} onClick={handleSync}
                title={!event.dateFrom ? "Nejprve nastav termín" : undefined} className="text-xs h-7">
                {syncing ? "Přidávám…" : "+ Přidat do Google Kalendáře"}
            </Button>
            {msg && <p className={`text-xs ${msg.startsWith("Přidáno") ? "text-green-600" : "text-red-500"}`}>{msg}</p>}
            {!event.dateFrom && <p className="text-xs text-gray-400">Bez termínu — nelze synchronizovat</p>}
        </div>
    );
}

// ── Registrations tab ─────────────────────────────────────────────────────────

const fmtShortDate = (d: Date) =>
    new Intl.DateTimeFormat("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));

const REGISTRATION_FIELD_LABELS: Record<string, string> = {
    email:        "E-mail",
    phone:        "Telefon",
    firstName:    "Jméno",
    lastName:     "Příjmení",
    personsCount: "Počet osob",
    personsNames: "Účastníci",
    transportInfo: "Doprava / lodě",
    cancelledAt:  "Zrušení přihlášky",
};

function RegistrationHistory({ registrationId }: { registrationId: number }) {
    const [open, setOpen]       = useState(false);
    const [log, setLog]         = useState<RegistrationAuditEntry[] | null>(null);
    const [loading, setLoading] = useState(false);

    function toggle() {
        if (!open && log === null) {
            setLoading(true);
            getRegistrationAuditLog(registrationId)
                .then(e => { setLog(e); setLoading(false); })
                .catch(() => { setLog([]); setLoading(false); });
        }
        setOpen(v => !v);
    }

    if (log !== null && log.length === 0 && !open) return null;

    return (
        <div className="px-4 pb-2.5">
            <button onClick={toggle}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
                {open ? "▲" : "▼"}
                {loading ? " Načítám historii…"
                    : log === null ? " Historie změn"
                    : log.length === 0 ? " Žádné změny"
                    : ` Historie změn (${log.length})`}
            </button>
            {open && log && log.length > 0 && (
                <div className="mt-2 space-y-1.5">
                    {log.map(entry => (
                        <div key={entry.id} className="text-xs rounded-lg border border-gray-100 bg-white px-3 py-2 space-y-1">
                            <div className="flex items-center justify-between gap-2 text-gray-400 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-gray-600">{entry.changedBy}</span>
                                    <span className={`px-1.5 py-px rounded text-[10px] font-medium border ${
                                        entry.action === "cancel"
                                            ? "bg-red-50 text-red-600 border-red-200"
                                            : "bg-amber-50 text-amber-600 border-amber-200"
                                    }`}>
                                        {entry.action === "cancel" ? "zrušení" : "úprava"}
                                    </span>
                                </div>
                                <span>{fmtDateTime(entry.changedAt)}</span>
                            </div>
                            {Object.entries(entry.changes).map(([field, diff]) => (
                                <div key={field} className="flex gap-1 flex-wrap text-gray-500">
                                    <span className="text-gray-400">{REGISTRATION_FIELD_LABELS[field] ?? field}:</span>
                                    {diff.old !== null && <span className="line-through text-red-400">{diff.old}</span>}
                                    {diff.old !== null && diff.new !== null && <span className="text-gray-300">→</span>}
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

function RegistrationsTab({ eventId }: { eventId: number }) {
    const [rows, setRows]       = useState<EventRegistrationAdminRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);

    useEffect(() => {
        getEventRegistrationsForAdmin(eventId)
            .then(r => { setRows(r); setLoading(false); })
            .catch(e => { setError(e instanceof Error ? e.message : "Chyba"); setLoading(false); });
    }, [eventId]);

    if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Načítám přihlášky…</p>;
    if (error)   return <p className="text-sm text-red-500 py-4">{error}</p>;
    if (!rows || rows.length === 0) return (
        <p className="text-sm text-gray-400 py-8 text-center">Žádné přihlášky</p>
    );

    const totalPersons = rows.reduce((s, r) => s + r.personsCount, 0);
    const totalAmount = rows.reduce((s, r) => s + r.paymentAmount, 0);
    const paidCount = rows.filter(r => r.paymentStatus === "paid").length;
    const unresolvedCount = rows.filter(r => r.paymentStatus === "pending" || r.paymentStatus === "matched").length;

    const summaryCards = [
        {
            label: "Přihlášky",
            value: rows.length,
            suffix: rows.length === 1 ? "záznam" : rows.length < 5 ? "záznamy" : "záznamů",
            tone: "text-slate-700 bg-white/80 border-slate-200",
        },
        {
            label: "Účastníci",
            value: totalPersons,
            suffix: totalPersons === 1 ? "osoba" : totalPersons < 5 ? "osoby" : "osob",
            tone: "text-blue-700 bg-blue-50/80 border-blue-100",
        },
        {
            label: "Zaplaceno",
            value: paidCount,
            suffix: paidCount === 1 ? "platba" : paidCount < 5 ? "platby" : "plateb",
            tone: "text-emerald-700 bg-emerald-50/90 border-emerald-100",
        },
        {
            label: "Čeká řešení",
            value: unresolvedCount,
            suffix: unresolvedCount === 1 ? "položka" : unresolvedCount < 5 ? "položky" : "položek",
            tone: "text-amber-700 bg-amber-50/90 border-amber-100",
        },
    ] as const;

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">Přihlášení</p>
                        <h3 className="text-base sm:text-lg font-semibold text-slate-900">Souhrn registrací na akci</h3>
                    </div>
                    <p className="text-sm text-slate-500">
                        Předepsáno <span className="font-semibold text-slate-700 tabular-nums">{new Intl.NumberFormat("cs-CZ").format(totalAmount)} Kč</span>
                    </p>
                </div>

                <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                    {summaryCards.map(card => (
                        <div key={card.label} className={`rounded-xl border px-3 py-2.5 ${card.tone}`}>
                            <p className="text-[11px] uppercase tracking-wide opacity-80">{card.label}</p>
                            <p className="mt-1 text-lg font-semibold tabular-nums">
                                {card.value} <span className="text-xs font-medium opacity-80">{card.suffix}</span>
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                {rows.map(r => {
                    const participants = r.participants.length > 0
                        ? r.participants
                        : r.participantNames.map((name, i) => ({
                            fullName: name,
                            isPrimary: i === 0,
                            participantOrder: i + 1,
                        }));

                    return (
                        <div key={r.registrationId} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className={`h-1 bg-gradient-to-r ${PAYMENT_STATUS_BAR_COLORS[r.paymentStatus] ?? "from-slate-200 via-slate-300 to-slate-400"}`} />

                            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 space-y-3">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{r.firstName} {r.lastName}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                            <span>{r.email}</span>
                                            {r.phone && <span>{r.phone}</span>}
                                            <span className="text-slate-300">•</span>
                                            <span className="tabular-nums">{fmtShortDate(r.createdAt)}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                        {r.matchedLedgerId && (
                                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                                                banka spárována
                                            </span>
                                        )}
                                        <Badge className={`${PAYMENT_STATUS_COLORS[r.paymentStatus] ?? "bg-gray-50 text-gray-500"} border-0 text-[11px] font-medium`}>
                                            {PAYMENT_STATUS_LABELS[r.paymentStatus] ?? r.paymentStatus}
                                        </Badge>
                                        <span className="text-sm font-semibold text-slate-700 tabular-nums">
                                            {new Intl.NumberFormat("cs-CZ").format(r.paymentAmount)} Kč
                                        </span>
                                    </div>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-3 text-xs">
                                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
                                        <p className="text-slate-400">Předpis</p>
                                        <p className="font-medium text-slate-700">{r.paymentCodeLabel}</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
                                        <p className="text-slate-400">Variabilní symbol</p>
                                        <p className="font-medium text-slate-700 tabular-nums">{r.paymentVariableSymbol}</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
                                        <p className="text-slate-400">Počet osob</p>
                                        <p className="font-medium text-slate-700 tabular-nums">{r.personsCount}</p>
                                    </div>
                                </div>

                                {r.transportInfo && (
                                    <div className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2">
                                        <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Doprava a lodě</p>
                                        <p className="mt-1 text-xs text-amber-900 whitespace-pre-wrap">{r.transportInfo}</p>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-slate-500">Účastníci</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {participants.map(p => (
                                            <div key={p.participantOrder}
                                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 pl-2 pr-2.5 py-1">
                                                <span className="text-[11px] text-slate-400 tabular-nums">{p.participantOrder}.</span>
                                                <span className="text-xs text-slate-700">{p.fullName}</span>
                                                {p.isPrimary && (
                                                    <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                                                        kontakt
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <RegistrationHistory registrationId={r.registrationId} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function EventDetailClient({ event }: Props) {
    const router = useRouter();
    const [activeField, setActiveField] = useState<string | null>(null);
    const [diff, setDiff]               = useState<GcalDiffResult | null>(null);
    const [syncing, setSyncing]         = useState(false);
    const [auditOpen, setAuditOpen]     = useState(false);
    const [deleting, startDeleteT]      = useTransition();

    // Members loaded lazily — not needed for initial render
    const [allMembers, setAllMembers]     = useState<MemberOption[]>([]);
    const [membersLoaded, setMembersLoaded] = useState(false);

    useEffect(() => {
        getMembersForAutocomplete().then(m => { setAllMembers(m); setMembersLoaded(true); });
    }, []);

    // GCal diff — loaded after mount if event is in GCal
    useEffect(() => {
        if (!event.gcalEventId) return;
        getEventGcalDiff(event.id).then(setDiff).catch(() => setDiff(null));
    }, [event.id, event.gcalEventId]);

    function refresh() { router.refresh(); }

    // Po každém uložení pole, které může být v GCal, obnovíme diff
    function refreshWithDiff() {
        router.refresh();
        if (event.gcalEventId) getEventGcalDiff(event.id).then(setDiff).catch(() => {});
    }

    function save(field: string) {
        return async (value: string): Promise<{ success: true } | { error: string }> => {
            try {
                await updateEventField(event.id, field, value || null);
                refreshWithDiff();
                return { success: true };
            } catch (e) {
                return { error: e instanceof Error ? e.message : "Chyba" };
            }
        };
    }

    function makeGcalAccept(field: string, gcalValue: string | null) {
        return async () => {
            await acceptGcalField(event.id, field, gcalValue);
            refresh();
            setDiff(await getEventGcalDiff(event.id));
        };
    }

    async function pushToGcal() {
        setSyncing(true);
        try { await syncEventToGcal(event.id); refresh(); setDiff(await getEventGcalDiff(event.id)); }
        finally { setSyncing(false); }
    }

    function gcalFieldValue(field: string) {
        return getFieldDiff(diff, field)?.gcalValue ?? undefined;
    }

    function handleDelete() {
        if (!confirm(`Smazat akci „${event.name}"? Tato akce je nevratná.`)) return;
        startDeleteT(async () => {
            await deleteEvent(event.id);
            router.push(`/dashboard/events?year=${event.year}`);
        });
    }

    return (
        <>
            <div className="max-w-2xl mx-auto">

                {/* ── Page header ── */}
                <div className="flex items-center gap-3 mb-5">
                    <Link href={`/dashboard/events?year=${event.year}`}
                        className="flex items-center gap-0.5 text-sm text-gray-500 hover:text-gray-900 transition-colors shrink-0">
                        <ChevronLeft size={16} />
                        <span>Kalendář {event.year}</span>
                    </Link>
                    <div className="flex-1" />
                    <Button asChild size="sm" variant="outline">
                        <a href={`/api/events/${event.id}/vyuctovani`}>
                            <Download size={14} />
                            Vyúčtování oddílu
                        </a>
                    </Button>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                <MoreHorizontal size={15} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-44 p-1.5 space-y-0.5">
                            <button onClick={() => setAuditOpen(true)}
                                className="w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-gray-50 transition-colors">
                                Audit log
                            </button>
                            <button onClick={handleDelete} disabled={deleting}
                                className="w-full text-left px-2.5 py-1.5 rounded text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                                {deleting ? "Mažu…" : "Smazat akci"}
                            </button>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* ── Title + badges ── */}
                <div className="mb-5">
                    <h1 className="text-xl font-semibold text-gray-900 leading-tight">{event.name}</h1>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Badge className={`${TYPE_COLORS[event.eventType] ?? TYPE_COLORS.other} border-0 text-xs font-normal`}>
                            {EVENT_TYPE_LABELS[event.eventType]}
                        </Badge>
                        <Badge className={`${STATUS_COLORS[event.status] ?? ""} border-0 text-xs font-normal`}>
                            {EVENT_STATUS_LABELS[event.status]}
                        </Badge>
                        {event.gcalSync && event.gcalEventId && (
                            <Badge className="bg-violet-50 text-violet-600 border border-violet-200 text-xs font-normal">GCal</Badge>
                        )}
                    </div>
                </div>

                {/* ── Tabs ── */}
                <Tabs defaultValue="detail" className="gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-emerald-50/60 p-1.5 shadow-sm">
                        <TabsList className="mb-0 !grid w-full !h-auto grid-cols-3 gap-1.5 bg-transparent p-0">
                            <TabsTrigger value="detail"
                                className="h-auto min-h-[52px] rounded-xl border border-transparent px-3 py-2 data-[state=active]:bg-white data-[state=active]:border-emerald-200 data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-100/70">
                                <span className="inline-flex items-center gap-1.5">
                                    <FileText size={14} />
                                    <span className="font-semibold">Detail</span>
                                </span>
                            </TabsTrigger>
                            <TabsTrigger value="registrations"
                                className="h-auto min-h-[52px] rounded-xl border border-transparent px-3 py-2 data-[state=active]:bg-white data-[state=active]:border-emerald-200 data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-100/70">
                                <span className="inline-flex items-center gap-1.5">
                                    <Users size={14} />
                                    <span className="font-semibold">Přihlášky</span>
                                </span>
                            </TabsTrigger>
                            <TabsTrigger value="expenses"
                                className="h-auto min-h-[52px] rounded-xl border border-transparent px-3 py-2 data-[state=active]:bg-white data-[state=active]:border-emerald-200 data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-100/70">
                                <span className="inline-flex items-center gap-1.5">
                                    <Wallet size={14} />
                                    <span className="font-semibold">Náklady</span>
                                </span>
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* ── Tab: Detail ── */}
                    <TabsContent value="detail" className="space-y-4 mt-0">
                        <div className="rounded-xl border px-4">
                            <InlineField label="Název" fieldId="name" type="text"
                                value={event.name} placeholder="Název akce"
                                activeField={activeField} onActiveFieldChange={setActiveField}
                                onSave={save("name")}
                                gcalValue={gcalFieldValue("name")}
                                onGcalAccept={gcalFieldValue("name") !== undefined ? makeGcalAccept("name", gcalFieldValue("name") ?? null) : undefined}
                                onGcalPush={gcalFieldValue("name") !== undefined ? pushToGcal : undefined}
                            />
                            <ImmediateSelect label="Typ" value={event.eventType}
                                options={EVENT_TYPES} eventId={event.id} field="eventType" onSaved={refresh} />
                            <ImmediateSelect label="Stav" value={event.status}
                                options={EVENT_STATUSES} eventId={event.id} field="status" onSaved={refresh} />
                            <ImmediateDate label="Datum od" value={event.dateFrom}
                                eventId={event.id} field="dateFrom" onSaved={refreshWithDiff}
                                gcalValue={gcalFieldValue("dateFrom")}
                                onGcalAccept={gcalFieldValue("dateFrom") !== undefined ? makeGcalAccept("dateFrom", gcalFieldValue("dateFrom") ?? null) : undefined}
                                onGcalPush={gcalFieldValue("dateFrom") !== undefined ? pushToGcal : undefined}
                                timeValue={event.timeFrom} timeField="timeFrom"
                                timeGcalValue={gcalFieldValue("timeFrom")}
                                onTimeGcalAccept={gcalFieldValue("timeFrom") !== undefined ? makeGcalAccept("timeFrom", gcalFieldValue("timeFrom") ?? null) : undefined}
                                onTimeGcalPush={gcalFieldValue("timeFrom") !== undefined ? pushToGcal : undefined}
                            />
                            <ImmediateDate label="Datum do" value={event.dateTo}
                                eventId={event.id} field="dateTo" onSaved={refreshWithDiff}
                                min={event.dateFrom ?? undefined}
                                gcalValue={gcalFieldValue("dateTo")}
                                onGcalAccept={gcalFieldValue("dateTo") !== undefined ? makeGcalAccept("dateTo", gcalFieldValue("dateTo") ?? null) : undefined}
                                onGcalPush={gcalFieldValue("dateTo") !== undefined ? pushToGcal : undefined}
                                timeValue={event.timeTo} timeField="timeTo"
                                timeGcalValue={gcalFieldValue("timeTo")}
                                onTimeGcalAccept={gcalFieldValue("timeTo") !== undefined ? makeGcalAccept("timeTo", gcalFieldValue("timeTo") ?? null) : undefined}
                                onTimeGcalPush={gcalFieldValue("timeTo") !== undefined ? pushToGcal : undefined}
                            />
                            {!event.dateFrom && (
                                <ImmediateSelect label="Orien. měsíc"
                                    value={event.approxMonth ? String(event.approxMonth) : null}
                                    options={[["", "— neznámý —"], ...MONTH_NAMES.slice(1).map((m, i) => [String(i + 1), m] as [string, string])]}
                                    eventId={event.id} field="approxMonth" onSaved={refresh} />
                            )}
                            <InlineField label="Místo" fieldId="location" type="text"
                                value={event.location} placeholder="Řeka, místo…"
                                activeField={activeField} onActiveFieldChange={setActiveField}
                                onSave={save("location")}
                                gcalValue={gcalFieldValue("location")}
                                onGcalAccept={gcalFieldValue("location") !== undefined ? makeGcalAccept("location", gcalFieldValue("location") ?? null) : undefined}
                                onGcalPush={gcalFieldValue("location") !== undefined ? pushToGcal : undefined}
                            />
                            <ImmediateLeader value={event.leaderName} valueId={event.leaderId}
                                eventId={event.id} allMembers={allMembers} membersLoaded={membersLoaded} onSaved={refresh} />
                            <InlineField label="Odkaz" fieldId="externalUrl" type="text"
                                value={event.externalUrl} placeholder="https://…"
                                activeField={activeField} onActiveFieldChange={setActiveField}
                                onSave={save("externalUrl")} />
                        </div>

                        {/* ── Termín přihlášek ── */}
                        <div className="rounded-xl border px-4">
                            <ImmediateDate label="Přihlášky od" value={event.registrationFrom}
                                eventId={event.id} field="registrationFrom" onSaved={refresh} />
                            <ImmediateDate label="Přihlášky do" value={event.registrationTo}
                                eventId={event.id} field="registrationTo"
                                min={event.registrationFrom ?? undefined} onSaved={refresh} />
                        </div>

                        <div className="rounded-xl border px-4">
                            <ImmediateTextarea label="Popis" value={event.description}
                                eventId={event.id} field="description" onSaved={refreshWithDiff}
                                placeholder="Volitelný popis akce…"
                                gcalValue={gcalFieldValue("description")}
                                onGcalAccept={gcalFieldValue("description") !== undefined ? makeGcalAccept("description", gcalFieldValue("description") ?? null) : undefined}
                                onGcalPush={event.gcalEventId ? pushToGcal : undefined}
                            />
                            <ImmediateTextarea label="Interní poznámka" value={event.note}
                                eventId={event.id} field="note" onSaved={refresh}
                                placeholder="Interní poznámka…" />
                        </div>

                        {event.gcalEventId ? (
                            <GcalStatusBar diff={diff} syncing={syncing} onPush={pushToGcal} />
                        ) : (
                            <GcalSyncStarter event={event} onSaved={refresh} />
                        )}
                    </TabsContent>

                    {/* ── Tab: Přihlášky ── */}
                    <TabsContent value="registrations" className="mt-0">
                        <RegistrationsTab eventId={event.id} />
                    </TabsContent>

                    {/* ── Tab: Náklady ── */}
                    <TabsContent value="expenses" className="mt-0">
                        <EventExpensesTab
                            eventId={event.id}
                            eventName={event.name}
                            leaderName={event.leaderName}
                        />
                    </TabsContent>
                </Tabs>

            </div>

            <AuditLogDialog open={auditOpen} onOpenChange={setAuditOpen} eventId={event.id} />
        </>
    );
}
