"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Download, FileText, MoreHorizontal, Users, Wallet, Calculator, UserCheck, Trash2, UserPlus, Ban, Pencil, QrCode, Mail, ChevronDown, ChevronUp, Loader2, RotateCcw, UserX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import type { EventPaymentPrescriptionStatus } from "@/db/schema";
import { EventExpensesTab } from "./event-expenses-tab";
import { EventSettlementTab } from "./event-settlement-tab";
import { EventPaymentsTab } from "./event-payments-tab";
import { AddRegistrationDialog, LinkParticipantDialog, AddParticipantDialog, EditRegistrationDialog } from "./admin-registration-dialog";
import type { SettlementParticipant } from "@/lib/actions/event-settlement";
import { removeParticipantFromRegistration, cancelAdminRegistration, restoreAdminRegistration, sendSingleRegistrationEmail, cancelParticipant, restoreParticipant, getEventFinalExpenses } from "@/lib/actions/event-settlement";
import type { CancelParticipantData } from "@/lib/actions/event-settlement";

interface Props {
    event: EventRow;
    isTreasurer: boolean;
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

const EVENT_TYPES = Object.entries(EVENT_TYPE_LABELS) as [EventType, string][];
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
    planned: "bg-blue-50 text-blue-700",
    confirmed: "bg-green-50 text-green-700",
    cancelled: "bg-red-50 text-red-600",
    completed: "bg-gray-100 text-gray-500",
};

const TYPE_COLORS: Record<string, string> = {
    cpv: "bg-amber-50 text-amber-700",
    foreign: "bg-purple-50 text-purple-700",
    recreational: "bg-sky-50 text-sky-700",
    club: "bg-teal-50 text-teal-700",
    race: "bg-orange-50 text-orange-700",
    brigada: "bg-lime-50 text-lime-700",
    other: "bg-gray-50 text-gray-500",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700",
    matched: "bg-blue-50 text-blue-700",
    paid: "bg-green-50 text-green-700",
    cancelled: "bg-red-50 text-red-600",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
    pending: "čeká",
    matched: "spárováno",
    paid: "zaplaceno",
    cancelled: "zrušeno",
};

const PAYMENT_STATUS_BAR_COLORS: Record<string, string> = {
    pending: "from-amber-200 via-amber-300 to-amber-400",
    matched: "from-blue-200 via-blue-300 to-blue-400",
    paid: "from-green-200 via-green-300 to-green-400",
    cancelled: "from-rose-200 via-rose-300 to-rose-400",
};

function fmtCzk(amount: number) {
    return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(amount) + " Kč";
}

// ── Stav doplatku (životní cyklus) — analogicky k záložce Platby ─────────────
// Stejná logika jako computeLifecycle v event-payments-tab.tsx, jen na datech
// z getEventRegistrationsForAdmin (bez canonického totalAmount z getEventSettlement,
// proto se "k úhradě" počítá jako depositAmount+settlementAmount — v drtivé většině
// případů totéž, liší se jen u propadlé zálohy v rámci přihlášky, viz spec).

type PaymentLifecycle =
    | { kind: "not_yet" }
    | { kind: "send_prescription" }
    | { kind: "awaiting" }
    | { kind: "paid" }
    | { kind: "underpaid"; diff: number }
    | { kind: "overpaid"; diff: number };

function computeRegistrationLifecycle(r: EventRegistrationAdminRow, isPrescribed: boolean): PaymentLifecycle {
    if (!isPrescribed) return { kind: "not_yet" };
    const paidOf = (status: EventPaymentPrescriptionStatus | null, amount: number | null, matched: number | null) =>
        (status === "matched" || status === "paid") ? (matched ?? amount ?? 0) : 0;
    const owedTotal = (r.depositAmount ?? 0) + (r.settlementAmount ?? 0);
    const paidTotal = paidOf(r.depositStatus, r.depositAmount, r.depositMatchedAmount) + paidOf(r.settlementStatus, r.settlementAmount, r.settlementMatchedAmount);
    const diff = paidTotal - owedTotal;
    if (Math.abs(diff) < 0.5) return { kind: "paid" };
    if (diff > 0) return { kind: "overpaid", diff };
    if (!r.settlementEmailSentAt) return { kind: "send_prescription" };
    if (r.settlementStatus === "matched" || r.settlementStatus === "paid") return { kind: "underpaid", diff: -diff };
    return { kind: "awaiting" };
}

/** Badge(y) stavu zálohy — sdílené mezi sbaleným headerem karty a jejím rozbaleným obsahem. */
function DepositStatusInline({ r }: { r: EventRegistrationAdminRow }) {
    if (r.depositAmount == null) {
        // Admin přihláška bez zálohy (addAdminEventRegistration ji nikdy nevytváří) —
        // doplatek se tu nezobrazuje, takže tu není co řešit ani ukazovat.
        return <Badge className="bg-slate-50 text-slate-400 border-0 text-[11px] font-medium">Bez zálohy</Badge>;
    }
    return (
        <>
            {/* "Nebude platit zálohu" je definitivní rozhodnutí — badge "čeká" by tu mátlo, na nic se nečeká. */}
            {!(r.depositStatus === "pending" && r.depositWontPay) && (
                <Badge className={`${PAYMENT_STATUS_COLORS[r.depositStatus ?? "pending"] ?? "bg-gray-50 text-gray-500"} border-0 text-[11px] font-medium`}>
                    {PAYMENT_STATUS_LABELS[r.depositStatus ?? "pending"] ?? r.depositStatus}
                </Badge>
            )}
            {r.depositStatus === "pending" && (
                r.depositPromise ? (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-purple-200 bg-purple-50 text-purple-700">
                        příslib zálohy
                    </span>
                ) : r.depositWontPay ? (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-slate-300 bg-slate-100 text-slate-700">
                        nebude platit zálohu
                    </span>
                ) : (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-700">
                        záloha nevyřešena
                    </span>
                )
            )}
            <span className="text-sm font-semibold text-slate-700 tabular-nums">
                {fmtCzk(r.depositAmount)}
            </span>
        </>
    );
}

function LifecycleBadge({ lifecycle }: { lifecycle: PaymentLifecycle }) {
    switch (lifecycle.kind) {
        case "not_yet": return <Badge className="bg-gray-100 text-gray-500 border-0 text-[11px] font-medium">Ještě není k placení</Badge>;
        case "send_prescription": return <Badge className="bg-orange-100 text-orange-700 border-0 text-[11px] font-medium">Odeslat předpis</Badge>;
        case "awaiting": return <Badge className="bg-blue-100 text-blue-700 border-0 text-[11px] font-medium">K zaplacení</Badge>;
        case "paid": return <Badge className="bg-green-100 text-green-700 border-0 text-[11px] font-medium">Zaplaceno</Badge>;
        case "underpaid": return <Badge className="bg-red-100 text-red-700 border-0 text-[11px] font-medium">Nedoplatek ({fmtCzk(lifecycle.diff)})</Badge>;
        case "overpaid": return <Badge className="bg-purple-100 text-purple-700 border-0 text-[11px] font-medium">Přeplatek ({fmtCzk(lifecycle.diff)})</Badge>;
    }
}

// ── Audit log dialog ──────────────────────────────────────────────────────────

function AuditLogDialog({ open, onOpenChange, eventId }: {
    open: boolean; onOpenChange: (v: boolean) => void; eventId: number;
}) {
    const [log, setLog] = useState<EventAuditEntry[]>([]);
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
    const [savingDate, setSavingDate] = useState(false);
    const [savingTime, setSavingTime] = useState(false);
    const [draftDate, setDraftDate] = useState(value ?? "");
    const [draftTime, setDraftTime] = useState(timeValue ?? "");
    const [acceptingGcal, setAcceptingGcal] = useState(false);
    const [pushingGcal, setPushingGcal] = useState(false);
    const [acceptingTimeGcal, setAcceptingTimeGcal] = useState(false);
    const [pushingTimeGcal, setPushingTimeGcal] = useState(false);

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
    const [text, setText] = useState(value ?? "");
    const [focused, setFocused] = useState(false);
    const [currentId, setCurrentId] = useState<number | null>(valueId);
    const [saving, setSaving] = useState(false);

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
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value ?? "");
    const [saving, setSaving] = useState(false);
    const [acceptingGcal, setAcceptingGcal] = useState(false);
    const [pushingGcal, setPushingGcal] = useState(false);

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
    const [msg, setMsg] = useState<string | null>(null);

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
    email: "E-mail",
    phone: "Telefon",
    firstName: "Jméno",
    lastName: "Příjmení",
    personsCount: "Počet osob",
    personsNames: "Účastníci",
    transportInfo: "Doprava / lodě",
    cancelledAt: "Zrušení přihlášky",
};

// ── Dialog: označit účastníka jako nejede ─────────────────────────────────────

const FORFEIT_POLICY_LABELS: Record<string, string> = {
    forfeit_to_expense: "Napočítat na náklad",
    forfeit_split: "Rozdělit na náklady",
    forfeit_to_club: "Propadne oddílu",
};

function CancelParticipantDialog({
    open,
    onOpenChange,
    participantId,
    participantName,
    eventId,
    depositAmount,
    depositStatus,
    personsCount,
    onCancelled,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    participantId: number;
    participantName: string;
    eventId: number;
    depositAmount: number | null;
    depositStatus: string | null;
    personsCount: number;
    onCancelled: () => void;
}) {
    const depositPerPerson = depositAmount != null && personsCount > 0
        ? Math.round(depositAmount / personsCount * 100) / 100
        : null;
    const hasDeposit = depositPerPerson != null && depositPerPerson > 0 && (depositStatus === "matched" || depositStatus === "paid");

    const [refundAmount, setRefundAmount] = useState("0");
    const [policy, setPolicy] = useState<"forfeit_to_expense" | "forfeit_split" | "forfeit_to_club">("forfeit_to_expense");
    const [expenseId, setExpenseId] = useState<number | null>(null);
    const [expenses, setExpenses] = useState<{ id: number; purposeText: string | null; amount: number }[]>([]);
    const [loadingExpenses, setLoadingExpenses] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setRefundAmount("0");
        setPolicy("forfeit_to_expense");
        setExpenseId(null);
        setError(null);
        if (hasDeposit) {
            setLoadingExpenses(true);
            getEventFinalExpenses(eventId)
                .then(list => { setExpenses(list); if (list.length > 0) setExpenseId(list[0].id); })
                .finally(() => setLoadingExpenses(false));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    async function handleSave() {
        setSaving(true);
        setError(null);
        const data: CancelParticipantData = {};
        if (hasDeposit) {
            const parsed = parseFloat(refundAmount.replace(",", "."));
            data.depositRefundAmount = isNaN(parsed) ? 0 : Math.min(parsed, depositPerPerson!);
            data.depositForfeitPolicy = policy;
            if (policy === "forfeit_to_expense") data.depositForfeitExpenseId = expenseId;
        }
        const res = await cancelParticipant(participantId, data);
        setSaving(false);
        if ("error" in res) { setError(res.error); return; }
        onOpenChange(false);
        onCancelled();
    }

    const refundParsed = parseFloat(refundAmount.replace(",", ".")) || 0;
    const forfeitAmount = depositPerPerson != null ? Math.max(0, depositPerPerson - Math.min(refundParsed, depositPerPerson)) : 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Označit jako nejede</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    <p className="text-sm text-gray-700">
                        <span className="font-medium">{participantName}</span> se akce nezúčastní.
                        Přihláška zůstane aktivní pro ostatní účastníky.
                    </p>

                    {hasDeposit && (
                        <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 space-y-3">
                            <div className="flex items-baseline justify-between">
                                <p className="text-xs font-medium text-amber-800">Záloha za tohoto účastníka</p>
                                <p className="text-sm font-semibold text-amber-900 tabular-nums">
                                    {new Intl.NumberFormat("cs-CZ").format(depositPerPerson!)} Kč
                                </p>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs text-gray-600">Vrátit (Kč)</label>
                                <Input
                                    type="number"
                                    min="0"
                                    max={depositPerPerson!}
                                    step="1"
                                    value={refundAmount}
                                    onChange={e => setRefundAmount(e.target.value)}
                                    className="h-8 text-sm"
                                />
                                {forfeitAmount > 0 && (
                                    <p className="text-xs text-gray-500">
                                        Propadne: <span className="font-medium text-red-600">{new Intl.NumberFormat("cs-CZ").format(forfeitAmount)} Kč</span>
                                    </p>
                                )}
                            </div>

                            {forfeitAmount > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-gray-600">Co se stane s propadlou zálohou</p>
                                    <div className="space-y-1.5">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" name="forfeitPolicy" value="forfeit_to_expense"
                                                checked={policy === "forfeit_to_expense"}
                                                onChange={() => setPolicy("forfeit_to_expense")}
                                                className="accent-[#327600]"
                                            />
                                            <span className="text-xs">Napočítat na náklad</span>
                                        </label>
                                        {policy === "forfeit_to_expense" && (
                                            <div className="ml-5">
                                                {loadingExpenses ? (
                                                    <span className="text-xs text-gray-400">Načítám náklady…</span>
                                                ) : expenses.length === 0 ? (
                                                    <span className="text-xs text-amber-600">Žádné finální náklady na akci</span>
                                                ) : (
                                                    <select
                                                        value={expenseId ?? ""}
                                                        onChange={e => setExpenseId(Number(e.target.value))}
                                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                                                    >
                                                        {expenses.map(exp => (
                                                            <option key={exp.id} value={exp.id}>
                                                                {exp.purposeText ?? "Bez názvu"} – {new Intl.NumberFormat("cs-CZ").format(exp.amount)} Kč
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                        )}
                                        <label className="flex items-center gap-2 cursor-not-allowed opacity-50">
                                            <input type="radio" disabled name="forfeitPolicy" value="forfeit_split" className="accent-[#327600]" />
                                            <span className="text-xs">Rozdělit na náklady <span className="text-gray-400">(bude doplněno)</span></span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-not-allowed opacity-50">
                                            <input type="radio" disabled name="forfeitPolicy" value="forfeit_to_club" className="accent-[#327600]" />
                                            <span className="text-xs">Propadne oddílu <span className="text-gray-400">(bude doplněno)</span></span>
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {!hasDeposit && depositPerPerson == null && (
                        <p className="text-xs text-gray-400">Přihláška nemá zálohu — žádné záložní nastavení není potřeba.</p>
                    )}
                    {!hasDeposit && depositPerPerson != null && (
                        <p className="text-xs text-amber-600">Záloha zatím nebyla přijata (není spárována) — propadnutí bude bez efektu na vyúčtování.</p>
                    )}

                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Zrušit</Button>
                    <Button size="sm" onClick={handleSave} disabled={saving || (policy === "forfeit_to_expense" && forfeitAmount > 0 && !expenseId)}>
                        {saving ? <><Loader2 size={13} className="animate-spin mr-1" /> Ukládám…</> : "Potvrdit"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function RegistrationHistory({ registrationId }: { registrationId: number }) {
    const [open, setOpen] = useState(false);
    const [log, setLog] = useState<RegistrationAuditEntry[] | null>(null);
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
                                        entry.action === "cancel" || entry.action === "cancel_participant"
                                            ? "bg-red-50 text-red-600 border-red-200"
                                            : entry.action === "restore" || entry.action === "restore_participant"
                                            ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                            : "bg-amber-50 text-amber-600 border-amber-200"
                                        }`}>
                                        {entry.action === "cancel" || entry.action === "cancel_participant" ? "odhlášení"
                                            : entry.action === "restore" || entry.action === "restore_participant" ? "obnovení"
                                            : "úprava"}
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

// ── Karta přihlášky ───────────────────────────────────────────────────────────

function buildPayliboUrl(amount: number, vs: string, bankAccount: string, eventName: string): string {
    const [accountNumber, bankCode] = bankAccount.split("/");
    const message = encodeURIComponent(`Platba za akci ${eventName}`);
    return (
        `https://api.paylibo.com/paylibo/generator/czech/image` +
        `?accountNumber=${accountNumber}` +
        `&bankCode=${bankCode}` +
        `&amount=${amount}` +
        `&currency=CZK` +
        `&vs=${vs}` +
        `&message=${message}` +
        `&size=200`
    );
}

function RegistrationCard({ r, onRefresh, isPrescribed, eventName, eventId }: { r: EventRegistrationAdminRow; onRefresh: () => void; isPrescribed: boolean; eventName: string; eventId: number }) {
    const [removingId, setRemovingId] = useState<number | null>(null);
    const [restoringParticipantId, setRestoringParticipantId] = useState<number | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [addParticipantOpen, setAddParticipantOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [linkTarget, setLinkTarget] = useState<Pick<SettlementParticipant, "id" | "fullName" | "memberId" | "memberName"> | null>(null);
    const [showQr, setShowQr] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
    const [cancelParticipantTarget, setCancelParticipantTarget] = useState<{ id: number; fullName: string } | null>(null);
    const [expanded, setExpanded] = useState(false);

    const hasPaymentDetails = !!r.paymentVariableSymbol && r.paymentAmount > 0 && !!r.paymentAccount;
    const lifecycle = computeRegistrationLifecycle(r, isPrescribed);

    async function handleSendEmail() {
        setSendingEmail(true);
        setEmailFeedback(null);
        const res = await sendSingleRegistrationEmail(r.registrationId);
        setSendingEmail(false);
        if ("error" in res) {
            setEmailFeedback(`Chyba: ${res.error}`);
        } else {
            setEmailFeedback("E-mail odeslán.");
            setTimeout(() => setEmailFeedback(null), 4000);
        }
    }

    const isCancelled = !!r.cancelledAt;
    const depositPaid = r.paymentStatus === "matched" || r.paymentStatus === "paid";
    const canCancel = !isCancelled && !depositPaid;
    const canEdit = !isCancelled && !isPrescribed;

    const participants = r.participants.length > 0
        ? r.participants
        : r.participantNames.map((name, i) => ({
            id: undefined as number | undefined,
            fullName: name,
            isPrimary: i === 0,
            participantOrder: i + 1,
            memberId: undefined as number | null | undefined,
            memberName: undefined as string | null | undefined,
            cancelledAt: null as Date | null,
            depositRefundAmount: null as number | null,
            depositForfeitPolicy: null as string | null,
            depositForfeitExpenseId: null as number | null,
        }));

    async function handleRemove(participantId: number, name: string) {
        if (!confirm(`Odebrat účastníka „${name}" z přihlášky?`)) return;
        setRemovingId(participantId);
        const res = await removeParticipantFromRegistration(participantId);
        if ("error" in res) alert(res.error);
        else onRefresh();
        setRemovingId(null);
    }

    async function handleRestoreParticipant(participantId: number, name: string) {
        if (!confirm(`Obnovit účastníka „${name}" (zrušit stav Nejede)?`)) return;
        setRestoringParticipantId(participantId);
        const res = await restoreParticipant(participantId);
        if ("error" in res) alert(res.error);
        else onRefresh();
        setRestoringParticipantId(null);
    }

    async function handleRestore() {
        if (!confirm(`Obnovit přihlášku ${r.firstName} ${r.lastName}?`)) return;
        setRestoring(true);
        const res = await restoreAdminRegistration(r.registrationId);
        if ("error" in res) alert(res.error);
        else onRefresh();
        setRestoring(false);
    }

    async function handleCancel() {
        if (!confirm(`Zrušit přihlášku ${r.firstName} ${r.lastName}? Tato akce nastaví přihlášku jako zrušenou.`)) return;
        setCancelling(true);
        const res = await cancelAdminRegistration(r.registrationId);
        if ("error" in res) alert(res.error);
        else onRefresh();
        setCancelling(false);
    }

    return (
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${isCancelled ? "border-red-100 bg-red-50/30 opacity-70" : "border-slate-200 bg-white"}`}>
            {/* ── Sbalený header — vždy viditelný, klik rozbalí/sbalí zbytek karty ── */}
            <button type="button" onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-slate-50/60 transition-colors">
                {expanded ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                <span className="font-semibold text-slate-900 text-sm shrink-0">{r.firstName} {r.lastName}</span>
                <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                    {r.personsCount} {r.personsCount === 1 ? "osoba" : r.personsCount < 5 ? "osoby" : "osob"}
                </span>
                <span className="flex-1" />
                {isCancelled ? (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-700 shrink-0">
                        Zrušeno
                    </span>
                ) : (
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wide">záloha</span>
                            <DepositStatusInline r={r} />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wide">doplatek</span>
                            {r.settlementAmount != null && r.settlementAmount > 0 && (
                                <span className="text-sm font-semibold text-slate-700 tabular-nums">{fmtCzk(r.settlementAmount)}</span>
                            )}
                            <LifecycleBadge lifecycle={lifecycle} />
                        </div>
                    </div>
                )}
            </button>

            {expanded && (
            <>
            <div className={`h-1 bg-gradient-to-r ${isCancelled ? "from-rose-300 via-rose-400 to-rose-500" : r.depositAmount == null ? "from-slate-200 via-slate-300 to-slate-400" : (PAYMENT_STATUS_BAR_COLORS[r.depositStatus ?? "pending"] ?? "from-slate-200 via-slate-300 to-slate-400")}`} />

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
                        {isCancelled ? (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-700">
                                Zrušeno
                            </span>
                        ) : (
                            <>
                                {r.matchedLedgerId && (
                                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                                        banka spárována
                                    </span>
                                )}
                                <DepositStatusInline r={r} />
                            </>
                        )}
                    </div>
                </div>

                {!isCancelled && (
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
                )}

                {r.transportInfo && (
                    <div className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Doprava a lodě</p>
                        <p className="mt-1 text-xs text-amber-900 whitespace-pre-wrap">{r.transportInfo}</p>
                    </div>
                )}

                {r.note && (
                    <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-sky-700">Poznámka</p>
                        <p className="mt-1 text-xs text-sky-900 whitespace-pre-wrap">{r.note}</p>
                    </div>
                )}

                {hasPaymentDetails && (
                    <div className="rounded-lg border border-slate-200">
                        <button
                            type="button"
                            onClick={() => setShowQr((prev: boolean) => !prev)}
                            className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors rounded-lg"
                        >
                            <span className="flex items-center gap-1.5 font-medium">
                                <QrCode size={12} /> Platební údaje
                            </span>
                            {showQr ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                        {showQr && (
                            <div className="px-3 pb-3 border-t border-slate-100">
                                <div className="flex flex-col sm:flex-row gap-4 items-start pt-3">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={buildPayliboUrl(r.paymentAmount, r.paymentVariableSymbol!, r.paymentAccount!, eventName)}
                                        alt="QR kód pro platbu"
                                        width={140}
                                        height={140}
                                        className="border border-gray-200 rounded-lg p-1.5 shrink-0 bg-white"
                                    />
                                    <div className="space-y-2 text-xs min-w-0">
                                        <div>
                                            <p className="text-slate-400">Číslo účtu</p>
                                            <p className="font-mono font-semibold text-slate-800">{r.paymentAccount}</p>
                                        </div>
                                        <div>
                                            <p className="text-slate-400">Variabilní symbol</p>
                                            <p className="font-mono font-semibold text-slate-800">{r.paymentVariableSymbol}</p>
                                        </div>
                                        <div>
                                            <p className="text-slate-400">Částka</p>
                                            <p className="font-semibold text-[#327600]">{new Intl.NumberFormat("cs-CZ").format(r.paymentAmount)} Kč</p>
                                        </div>
                                        {isPrescribed && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={handleSendEmail}
                                                    disabled={sendingEmail}
                                                    className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-40 transition-colors"
                                                >
                                                    {sendingEmail
                                                        ? <><Loader2 size={11} className="animate-spin" /> Odesílám…</>
                                                        : <><Mail size={11} /> Odeslat e-mail s předpisem</>
                                                    }
                                                </button>
                                                {emailFeedback && (
                                                    <p className="text-xs text-emerald-600">{emailFeedback}</p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-slate-500">Účastníci</p>
                        {!isCancelled && (() => {
                            const cancelledCount = participants.filter(p => p.cancelledAt).length;
                            return cancelledCount > 0 ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-orange-200 bg-orange-50 text-orange-700">
                                    {cancelledCount} {cancelledCount === 1 ? "nejede" : "nejedou"}
                                </span>
                            ) : null;
                        })()}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {participants.map(p => {
                            const isCancelledParticipant = !!p.cancelledAt;
                            return (
                                <div key={p.participantOrder}
                                    className={`inline-flex items-center gap-1.5 rounded-full border pl-2 pr-1.5 py-1 ${isCancelledParticipant ? "border-orange-200 bg-orange-50/60" : "border-slate-200 bg-slate-50"}`}>
                                    <span className="text-[11px] text-slate-400 tabular-nums">{p.participantOrder}.</span>
                                    <span className={`text-xs ${isCancelledParticipant ? "line-through text-slate-400" : "text-slate-700"}`}>{p.fullName}</span>
                                    {isCancelledParticipant && (
                                        <>
                                            <span className="text-[9px] font-semibold uppercase tracking-wide text-orange-600">nejede</span>
                                            {!isCancelled && !isPrescribed && p.id && (
                                                <button
                                                    onClick={() => handleRestoreParticipant(p.id!, p.fullName)}
                                                    disabled={restoringParticipantId === p.id}
                                                    title="Zrušit stav Nejede"
                                                    className="text-orange-300 hover:text-emerald-500 disabled:opacity-40 transition-colors">
                                                    <RotateCcw size={10} />
                                                </button>
                                            )}
                                        </>
                                    )}
                                    {!isCancelledParticipant && p.isPrimary && (
                                        <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                                            kontakt
                                        </span>
                                    )}
                                    {!isCancelledParticipant && !isPrescribed && (p.memberId ? (
                                        <button
                                            onClick={() => p.id && setLinkTarget({ id: p.id, fullName: p.fullName, memberId: p.memberId ?? null, memberName: p.memberName ?? null })}
                                            title={`Člen: ${p.memberName}`}
                                            className="text-emerald-500 hover:text-emerald-700 transition-colors">
                                            <UserCheck size={11} />
                                        </button>
                                    ) : p.id ? (
                                        <button
                                            onClick={() => setLinkTarget({ id: p.id!, fullName: p.fullName, memberId: null, memberName: null })}
                                            title="Spárovat s členem OVT"
                                            className="text-gray-300 hover:text-emerald-500 transition-colors">
                                            <UserCheck size={11} />
                                        </button>
                                    ) : null)}
                                    {!isCancelled && !isCancelledParticipant && !isPrescribed && p.id && (
                                        <>
                                            <button
                                                onClick={() => setCancelParticipantTarget({ id: p.id!, fullName: p.fullName })}
                                                title="Označit jako nejede"
                                                className="text-gray-300 hover:text-orange-500 transition-colors">
                                                <UserX size={10} />
                                            </button>
                                            <button
                                                onClick={() => handleRemove(p.id!, p.fullName)}
                                                disabled={removingId === p.id}
                                                title="Odebrat účastníka"
                                                className="text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors ml-0.5">
                                                <Trash2 size={10} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {/* Zobrazit forfeit info pro odhlášené účastníky */}
                    {participants.some(p => p.cancelledAt) && (
                        <div className="space-y-1 mt-1">
                            {participants.filter(p => p.cancelledAt).map(p => {
                                const depositPerPerson = r.depositAmount != null && r.personsCount > 0
                                    ? r.depositAmount / r.personsCount : null;
                                const forfeit = depositPerPerson != null && p.depositRefundAmount != null
                                    ? depositPerPerson - p.depositRefundAmount
                                    : depositPerPerson;
                                return (
                                    <div key={p.participantOrder} className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                                        <span className="text-orange-500">↳</span>
                                        <span className="font-medium">{p.fullName}:</span>
                                        {p.depositForfeitPolicy ? (
                                            <>
                                                {p.depositRefundAmount != null && p.depositRefundAmount > 0 && (
                                                    <span>vráceno {new Intl.NumberFormat("cs-CZ").format(p.depositRefundAmount)} Kč,</span>
                                                )}
                                                {forfeit != null && forfeit > 0 && (
                                                    <span>propadlo {new Intl.NumberFormat("cs-CZ").format(Math.round(forfeit))} Kč</span>
                                                )}
                                                <span className="text-gray-400">({FORFEIT_POLICY_LABELS[p.depositForfeitPolicy] ?? p.depositForfeitPolicy})</span>
                                            </>
                                        ) : (
                                            <span className="text-gray-400">záloha nevyřešena</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {!isCancelled && !isPrescribed && (
                        <button onClick={() => setAddParticipantOpen(true)}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 transition-colors mt-1">
                            <UserPlus size={12} /> Přidat účastníka
                        </button>
                    )}
                </div>

                {(canEdit || canCancel || isCancelled) && (
                    <div className="flex justify-between items-center pt-1">
                        <span>
                            {canEdit && (
                                <button onClick={() => setEditOpen(true)}
                                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
                                    <Pencil size={12} />
                                    Upravit
                                </button>
                            )}
                        </span>
                        <span>
                            {isCancelled ? (
                                <button onClick={handleRestore} disabled={restoring}
                                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-emerald-600 disabled:opacity-40 transition-colors">
                                    <RotateCcw size={12} />
                                    {restoring ? "Obnovuji…" : "Obnovit přihlášku"}
                                </button>
                            ) : canCancel && (
                                <button onClick={handleCancel} disabled={cancelling}
                                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors">
                                    <Ban size={12} />
                                    {cancelling ? "Ruším…" : "Zrušit přihlášku"}
                                </button>
                            )}
                        </span>
                    </div>
                )}
            </div>

            {cancelParticipantTarget && (
                <CancelParticipantDialog
                    open={!!cancelParticipantTarget}
                    onOpenChange={v => { if (!v) setCancelParticipantTarget(null); }}
                    participantId={cancelParticipantTarget.id}
                    participantName={cancelParticipantTarget.fullName}
                    eventId={eventId}
                    depositAmount={r.depositAmount}
                    depositStatus={r.depositStatus}
                    personsCount={r.personsCount}
                    onCancelled={onRefresh}
                />
            )}
            <RegistrationHistory registrationId={r.registrationId} />
            </>
            )}

            <EditRegistrationDialog
                registrationId={r.registrationId}
                initialEmail={r.email}
                initialPhone={r.phone ?? null}
                initialNote={r.note}
                participants={participants
                    .filter(p => p.id !== undefined)
                    .map(p => ({ id: p.id!, fullName: p.fullName, isPrimary: p.isPrimary, memberId: p.memberId ?? null }))}
                open={editOpen}
                onClose={() => setEditOpen(false)}
                onSaved={onRefresh}
            />
            <AddParticipantDialog
                registrationId={r.registrationId}
                open={addParticipantOpen}
                onClose={() => setAddParticipantOpen(false)}
                onAdded={onRefresh}
            />
            {linkTarget && (
                <LinkParticipantDialog
                    participant={linkTarget}
                    open={!!linkTarget}
                    onClose={() => setLinkTarget(null)}
                    onLinked={onRefresh}
                />
            )}
        </div>
    );
}

function RegistrationsTab({ eventId, billingStatus, eventName }: { eventId: number; billingStatus: string; eventName: string }) {
    const [rows, setRows] = useState<EventRegistrationAdminRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [showCancelled, setShowCancelled] = useState(false);

    function load() {
        setLoading(true);
        getEventRegistrationsForAdmin(eventId)
            .then(r => { setRows(r); setLoading(false); })
            .catch(e => { setError(e instanceof Error ? e.message : "Chyba"); setLoading(false); });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [eventId]);

    if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Načítám přihlášky…</p>;
    if (error) return <p className="text-sm text-red-500 py-4">{error}</p>;

    const isPrescribed = billingStatus === "prescribed";

    if (!rows || rows.length === 0) return (
        <div className="space-y-3">
            {!isPrescribed && (
                <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="text-xs h-8 gap-1.5">
                        + Přidat přihlášku
                    </Button>
                </div>
            )}
            <p className="text-sm text-gray-400 py-8 text-center">Žádné přihlášky</p>
            <AddRegistrationDialog eventId={eventId} open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} />
        </div>
    );

    const isReceived = (status: EventPaymentPrescriptionStatus | null) => status === "matched" || status === "paid";

    const activeRows = rows.filter(r => !r.cancelledAt);
    const cancelledRows = rows.filter(r => !!r.cancelledAt);
    // Záloha + doplatek zvlášť (ne COALESCE paymentAmount) — u admin přihlášky bez zálohy by
    // COALESCE sečetl celý doplatek místo zálohy a smíchal tak dvě různé veličiny do jednoho čísla.
    const totalAmount = activeRows.reduce((s, r) => s + (r.depositAmount ?? 0) + (r.settlementAmount ?? 0), 0);

    // Účastníci aktivních přihlášek: kdo jede vs. kdo se z přihlášky individuálně odhlásil ("nejede")
    const goingPersons = activeRows.reduce((s, r) => s + (r.personsCount - r.participants.filter(p => p.cancelledAt).length), 0);
    const notGoingPersons = activeRows.reduce((s, r) => s + r.participants.filter(p => p.cancelledAt).length, 0);

    const depositRows = activeRows.filter(r => r.depositAmount != null);
    const depositPaid = depositRows.filter(r => isReceived(r.depositStatus)).length;
    // Doplatky (settlement) mají smysl zobrazovat až po vygenerování předpisů — předtím můžou
    // existovat jen zastaralé řádky (admin přihláška bez zálohy, nebo dřívější odemčený billing).
    const settlementRows = isPrescribed ? activeRows.filter(r => r.settlementAmount != null) : [];
    const settlementPaid = settlementRows.filter(r => isReceived(r.settlementStatus)).length;

    // Čeká na vyřešení = jen zálohy bez rozhodnutí (ne zaplaceno, ne příslib, ne "nebude platit").
    const unresolvedCount = depositRows.filter(r =>
        r.depositStatus === "pending" && !r.depositPromise && !r.depositWontPay
    ).length;

    const summaryCards: { label: string; value: string | number; suffix: string; tone: string; subtext?: string }[] = [
        {
            label: "Přihlášky",
            value: activeRows.length,
            suffix: activeRows.length === 1 ? "záznam" : activeRows.length < 5 ? "záznamy" : "záznamů",
            tone: "text-slate-700 bg-white/80 border-slate-200",
            subtext: cancelledRows.length > 0 ? `${cancelledRows.length} zrušeno` : undefined,
        },
        {
            label: "Účastníci",
            value: goingPersons,
            suffix: goingPersons === 1 ? "jede" : "jedou",
            tone: "text-blue-700 bg-blue-50/80 border-blue-100",
            subtext: notGoingPersons > 0 ? `+${notGoingPersons} ${notGoingPersons === 1 ? "nejede" : "nejedou"} (zaplaceno)` : undefined,
        },
        {
            label: "Zálohy",
            value: `${depositPaid}/${depositRows.length}`,
            suffix: "zaplaceno",
            tone: "text-emerald-700 bg-emerald-50/90 border-emerald-100",
        },
        {
            label: "Doplatky",
            value: settlementRows.length > 0 ? `${settlementPaid}/${settlementRows.length}` : "—",
            suffix: settlementRows.length > 0 ? "zaplaceno" : "nevypsány",
            tone: settlementRows.length > 0 ? "text-sky-700 bg-sky-50/90 border-sky-100" : "text-slate-400 bg-slate-50/80 border-slate-200",
        },
        {
            label: "Čeká řešení",
            value: unresolvedCount,
            suffix: unresolvedCount === 1 ? "položka" : unresolvedCount < 5 ? "položky" : "položek",
            tone: "text-amber-700 bg-amber-50/90 border-amber-100",
        },
    ];

    return (
        <div className="space-y-4">
            {!isPrescribed && (
                <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="text-xs h-8 gap-1.5">
                        + Přidat přihlášku
                    </Button>
                </div>
            )}
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

                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                    {summaryCards.map(card => (
                        <div key={card.label} className={`rounded-xl border px-3 py-2.5 ${card.tone}`}>
                            <p className="text-[11px] uppercase tracking-wide opacity-80">{card.label}</p>
                            <p className="mt-1 text-lg font-semibold tabular-nums">
                                {card.value} <span className="text-xs font-medium opacity-80">{card.suffix}</span>
                            </p>
                            {"subtext" in card && card.subtext && (
                                <p className="text-[11px] opacity-50 mt-0.5">{card.subtext}</p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <AddRegistrationDialog eventId={eventId} open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} />

            <div className="space-y-3">
                {activeRows.map(r => (
                    <RegistrationCard key={r.registrationId} r={r} onRefresh={load} isPrescribed={isPrescribed} eventName={eventName} eventId={eventId} />
                ))}
            </div>

            {cancelledRows.length > 0 && (
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => setShowCancelled(prev => !prev)}
                        className="flex w-full items-center justify-between rounded-xl border border-red-100 bg-red-50/40 px-3.5 py-2.5 text-sm text-red-700 hover:bg-red-50/70 transition-colors"
                    >
                        <span className="font-medium">
                            Zrušené přihlášky ({cancelledRows.length})
                        </span>
                        {showCancelled ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {showCancelled && (
                        <div className="space-y-3">
                            {cancelledRows.map(r => (
                                <RegistrationCard key={r.registrationId} r={r} onRefresh={load} isPrescribed={isPrescribed} eventName={eventName} eventId={eventId} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function EventDetailClient({ event, isTreasurer }: Props) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<string>(() => {
        if (typeof window !== "undefined") {
            return sessionStorage.getItem(`event-${event.id}-tab`) ?? "detail";
        }
        return "detail";
    });
    const [activeField, setActiveField] = useState<string | null>(null);
    const [diff, setDiff] = useState<GcalDiffResult | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [auditOpen, setAuditOpen] = useState(false);
    const [deleting, startDeleteT] = useTransition();
    // Sdílený billing status — aktualizuje se z EventPaymentsTab a propaguje do EventSettlementTab
    const [billingStatus, setBillingStatus] = useState<"draft" | "prescribed">(
        (event.billingStatus as "draft" | "prescribed") ?? "draft"
    );

    // Members loaded lazily — not needed for initial render
    const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
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
        if (event.gcalEventId) getEventGcalDiff(event.id).then(setDiff).catch(() => { });
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
            <div>

                {/* ── Page header ── */}
                <div className="flex items-center gap-3 mb-5">
                    <Link href={`/dashboard/events?year=${event.year}`}
                        className="flex items-center gap-0.5 text-sm text-gray-500 hover:text-gray-900 transition-colors shrink-0">
                        <ChevronLeft size={16} />
                        <span>Kalendář {event.year}</span>
                    </Link>
                    <div className="flex-1" />
                    <Button asChild size="sm" variant="outline">
                        <a href={`/api/events/${event.id}/ucastnici`}>
                            <Download size={14} />
                            Seznam účastníků
                        </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                        <a href={`/api/events/${event.id}/pivnik`}>
                            <Download size={14} />
                            Pivník
                        </a>
                    </Button>
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
                <Tabs value={activeTab} onValueChange={tab => { setActiveTab(tab); sessionStorage.setItem(`event-${event.id}-tab`, tab); }} className="gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-emerald-50/60 p-1.5 shadow-sm">
                        <TabsList className="mb-0 !grid w-full !h-auto grid-cols-5 gap-1.5 bg-transparent p-0">
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
                            <TabsTrigger value="settlement"
                                className="h-auto min-h-[52px] rounded-xl border border-transparent px-3 py-2 data-[state=active]:bg-white data-[state=active]:border-emerald-200 data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-100/70">
                                <span className="inline-flex items-center gap-1.5">
                                    <Calculator size={14} />
                                    <span className="font-semibold">Vyúčtování</span>
                                </span>
                            </TabsTrigger>
                            <TabsTrigger value="payments"
                                className="h-auto min-h-[52px] rounded-xl border border-transparent px-3 py-2 data-[state=active]:bg-white data-[state=active]:border-emerald-200 data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-100/70">
                                <span className="inline-flex items-center gap-1.5">
                                    <Wallet size={14} />
                                    <span className="font-semibold">Platby</span>
                                </span>
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* ── Tab: Detail ── */}
                    <TabsContent value="detail" className="space-y-4 mt-0 max-w-2xl">
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
                        <RegistrationsTab eventId={event.id} billingStatus={event.billingStatus} eventName={event.name} />
                    </TabsContent>

                    {/* ── Tab: Náklady ── */}
                    <TabsContent value="expenses" className="mt-0">
                        <EventExpensesTab
                            eventId={event.id}
                            eventName={event.name}
                            leaderName={event.leaderName}
                            leaderCskNumber={event.leaderCskNumber}
                            billingStatus={event.billingStatus}
                            lockForReimbursement={event.lockForReimbursement}
                            treasurerApproved={event.treasurerApproved}
                            isTreasurer={isTreasurer}
                        />
                    </TabsContent>

                    {/* ── Tab: Vyúčtování ── */}
                    <TabsContent value="settlement" className="mt-0">
                        <EventSettlementTab eventId={event.id} billingStatus={billingStatus} />
                    </TabsContent>

                    {/* ── Tab: Platby ── */}
                    <TabsContent value="payments" className="mt-0">
                        <EventPaymentsTab
                            eventId={event.id}
                            billingStatus={billingStatus}
                            treasurerApproved={event.treasurerApproved}
                            onBillingStatusChange={setBillingStatus}
                        />
                    </TabsContent>
                </Tabs>

            </div>

            <AuditLogDialog open={auditOpen} onOpenChange={setAuditOpen} eventId={event.id} />
        </>
    );
}
