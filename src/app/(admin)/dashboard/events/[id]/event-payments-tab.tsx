"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Check, Info, Mail, ChevronDown, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    getEventSettlement,
    updateEventSubsidy,
    lockBilling,
    unlockBilling,
    sendEventSettlementEmails,
    sendSingleRegistrationEmail,
    getEventSettlementEmailLog,
    setDepositPromise,
    setDepositWontPay,
} from "@/lib/actions/event-settlement";
import type { EventSettlement, SettlementRegistrationRow, SettlementParticipant, PrescriptionInfo, EmailSendLogEntry } from "@/lib/actions/event-settlement";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCzk(amount: number) {
    return new Intl.NumberFormat("cs-CZ", { style: "decimal", maximumFractionDigits: 0 }).format(amount) + " Kč";
}

function fmtDateTime(d: Date) {
    return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

const FORFEIT_POLICY_LABELS: Record<string, string> = {
    forfeit_to_expense: "napočítáno na náklad",
    forfeit_split: "rozděleno na náklady",
    forfeit_to_club: "propadlo oddílu",
};

// ── Stav platby přihlášky (krok navíc nad samotným doplatkem/zálohou) ────────
// "Cena akce / Dotace / K zaplacení" se nemění — toto je jen odvozený životní cyklus
// plateb pro zobrazení, nepoužívá se nikde ve výpočtu doplatku.

type PaymentLifecycle =
    | { kind: "not_yet" }
    | { kind: "send_prescription" }
    | { kind: "awaiting" }
    | { kind: "paid" }
    | { kind: "underpaid"; diff: number }
    | { kind: "overpaid"; diff: number };

function paidAmountOf(p: PrescriptionInfo | null): number {
    if (!p) return 0;
    if (p.status === "matched" || p.status === "paid") return p.matchedAmount ?? p.amount;
    return 0;
}

function computeLifecycle(reg: SettlementRegistrationRow, isPrescribed: boolean): PaymentLifecycle {
    if (!isPrescribed) return { kind: "not_yet" };
    const owedTotal = reg.totalAmount;
    const paidTotal = paidAmountOf(reg.depositPrescription) + paidAmountOf(reg.settlementPrescription);
    const diff = paidTotal - owedTotal;
    if (Math.abs(diff) < 0.5) return { kind: "paid" };
    if (diff > 0) return { kind: "overpaid", diff };
    if (!reg.settlementPrescription?.emailSentAt) return { kind: "send_prescription" };
    const settlementHasMatch = reg.settlementPrescription.status === "matched" || reg.settlementPrescription.status === "paid";
    if (settlementHasMatch) return { kind: "underpaid", diff: -diff };
    return { kind: "awaiting" };
}

function LifecycleBadge({ lifecycle }: { lifecycle: PaymentLifecycle }) {
    switch (lifecycle.kind) {
        case "not_yet": return <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Ještě není k placení</Badge>;
        case "send_prescription": return <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">Odeslat předpis</Badge>;
        case "awaiting": return <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">K zaplacení</Badge>;
        case "paid": return <Badge className="bg-green-100 text-green-700 border-0 text-xs">Zaplaceno</Badge>;
        case "underpaid": return <Badge className="bg-red-100 text-red-700 border-0 text-xs">Nedoplatek ({fmtCzk(lifecycle.diff)})</Badge>;
        case "overpaid": return <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">Přeplatek ({fmtCzk(lifecycle.diff)})</Badge>;
    }
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, matchedAmount, compact }: { status: string; matchedAmount: number | null; compact?: boolean }) {
    if (status === "paid") return <Badge className="bg-green-100 text-green-700 border-0 text-xs">Zaplaceno</Badge>;
    if (status === "matched") return <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">Spárováno{!compact && ` (${fmtCzk(matchedAmount ?? 0)})`}</Badge>;
    if (status === "cancelled") return <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Zrušeno</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Čeká na platbu</Badge>;
}

// ── Vyřešení zálohy: příslib / nebude platit ──────────────────────────────────
// Před vygenerováním doplatku musí mít každá záloha jedno ze 3 rozhodnutí: zaplaceno
// (automaticky, spárování s bankou), příslib (počítá se jako zaplaceno), nebo "nebude platit"
// (celá částka jde do doplatku). Nevyřešená záloha generování blokuje (event-settlement.ts).

function DepositResolutionDialog({ open, title, description, currentNote, confirmLabel, accentClass, onSave, onClose, saving }: {
    open: boolean;
    title: string;
    description: string;
    currentNote: string | null;
    confirmLabel: string;
    accentClass: string;
    onSave: (note: string) => void;
    onClose: () => void;
    saving: boolean;
}) {
    const [note, setNote] = useState(currentNote ?? "");
    useEffect(() => { if (open) setNote(currentNote ?? ""); }, [open, currentNote]);
    return (
        <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
                <p className="text-sm text-gray-500 -mt-1">{description}</p>
                <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-700">Poznámka <span className="text-gray-400 font-normal">(volitelné)</span></p>
                    <Textarea
                        placeholder="Např. účastník zaslal potvrzení platby…"
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        rows={3}
                        className="resize-none text-sm"
                        disabled={saving}
                    />
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={saving} className="text-gray-500">Zrušit</Button>
                    <Button size="sm" onClick={() => onSave(note)} disabled={saving} className={accentClass}>
                        {saving ? <><Loader2 size={13} className="animate-spin mr-1.5" />Ukládám…</> : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DepositStatusCell({ dep, locked, onPromiseChange, onWontPayChange }: {
    dep: PrescriptionInfo;
    locked: boolean;
    onPromiseChange: (prescriptionId: number, promise: boolean, note: string) => void;
    onWontPayChange: (prescriptionId: number, wontPay: boolean, note: string) => void;
}) {
    const [promiseDialogOpen, setPromiseDialogOpen] = useState(false);
    const [wontPayDialogOpen, setWontPayDialogOpen] = useState(false);
    const [revoking, startRevoke] = useTransition();

    if (dep.status !== "pending") {
        return <StatusBadge status={dep.status} matchedAmount={dep.matchedAmount} compact />;
    }

    if (dep.depositPromise) {
        return (
            <div className="flex flex-col items-end gap-0.5">
                <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">Příslib zálohy</Badge>
                {!locked && (
                    <button
                        onClick={() => { startRevoke(async () => onPromiseChange(dep.id, false, "")); }}
                        disabled={revoking}
                        className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">
                        {revoking ? "…" : "odvolat"}
                    </button>
                )}
            </div>
        );
    }

    if (dep.depositWontPay) {
        return (
            <div className="flex flex-col items-end gap-0.5">
                <Badge className="bg-slate-200 text-slate-700 border-0 text-xs">Nebude platit zálohu</Badge>
                {!locked && (
                    <button
                        onClick={() => { startRevoke(async () => onWontPayChange(dep.id, false, "")); }}
                        disabled={revoking}
                        className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">
                        {revoking ? "…" : "odvolat"}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-end gap-0.5">
            <Badge className="bg-red-100 text-red-700 border-0 text-xs">Nevyřešeno</Badge>
            {!locked && (
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setPromiseDialogOpen(true)}
                        className="text-[10px] text-gray-400 hover:text-purple-600 transition-colors whitespace-nowrap">
                        příslib
                    </button>
                    <span className="text-[10px] text-gray-300">·</span>
                    <button
                        onClick={() => setWontPayDialogOpen(true)}
                        className="text-[10px] text-gray-400 hover:text-slate-700 transition-colors whitespace-nowrap">
                        nebude platit
                    </button>
                </div>
            )}
            <DepositResolutionDialog
                open={promiseDialogOpen}
                title="Příslib zálohy"
                description="Záloha zatím nebyla spárována, ale je na cestě. Příslib se zohlední při výpočtu doplatku jako zaplaceno."
                currentNote={dep.depositPromiseNote}
                confirmLabel="Uložit příslib"
                accentClass="bg-purple-600 hover:bg-purple-700 text-white"
                onSave={note => { setPromiseDialogOpen(false); onPromiseChange(dep.id, true, note); }}
                onClose={() => setPromiseDialogOpen(false)}
                saving={false}
            />
            <DepositResolutionDialog
                open={wontPayDialogOpen}
                title="Záloha se nebude vybírat"
                description="Záloha se nebude požadovat samostatně — celá částka přejde do doplatku."
                currentNote={dep.depositWontPayNote}
                confirmLabel="Uložit rozhodnutí"
                accentClass="bg-slate-700 hover:bg-slate-800 text-white"
                onSave={note => { setWontPayDialogOpen(false); onWontPayChange(dep.id, true, note); }}
                onClose={() => setWontPayDialogOpen(false)}
                saving={false}
            />
        </div>
    );
}

// ── Dotace ────────────────────────────────────────────────────────────────────

function SubsidyField({ eventId, value, totalMemberParticipants, onChange, disabled }: {
    eventId: number; value: number; totalMemberParticipants: number; onChange: (v: number) => void; disabled?: boolean;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value));
    const [saving, startSave] = useTransition();
    const [msg, setMsg] = useState<string | null>(null);

    function handleSave() {
        const parsed = parseFloat(draft.replace(",", ".")) || 0;
        startSave(async () => {
            const res = await updateEventSubsidy(eventId, parsed || null);
            if ("error" in res) { setMsg(res.error); } else { onChange(parsed); setEditing(false); setMsg(null); }
        });
    }

    if (!editing) {
        return (
            <div>
                <button onClick={() => { if (!disabled) { setDraft(String(value)); setEditing(true); } }}
                    disabled={disabled}
                    className={["text-sm font-medium transition-colors", disabled ? "text-gray-400 cursor-not-allowed" : "text-gray-900 hover:text-emerald-700"].join(" ")}>
                    {value > 0 ? fmtCzk(value) : <span className="text-gray-400 italic">Nezadána</span>}
                </button>
                {value > 0 && totalMemberParticipants > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">= {fmtCzk(Math.floor(value / totalMemberParticipants))}/člen ({totalMemberParticipants} členů)</p>
                )}
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2">
            <Input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
                className="h-7 w-28 text-sm" autoFocus />
            <span className="text-sm text-gray-500">Kč</span>
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>{saving ? "…" : "Uložit"}</Button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">Zrušit</button>
            {msg && <span className="text-xs text-red-500">{msg}</span>}
        </div>
    );
}

// ── Email modal ───────────────────────────────────────────────────────────────

function SendEmailModal({ open, title, description, onSend, onSkip, onClose, sending }: {
    open: boolean; title: string; description?: string;
    onSend: (message: string) => void; onSkip?: () => void; onClose: () => void; sending: boolean;
}) {
    const [message, setMessage] = useState("");
    return (
        <Dialog open={open} onOpenChange={v => { if (!v && !sending) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
                {description && <p className="text-sm text-gray-500 -mt-1">{description}</p>}
                <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Zpráva přihlášeným <span className="text-gray-400 font-normal">(volitelné)</span></p>
                    <Textarea placeholder="Např. platbu prosím do konce května, díky…" value={message}
                        onChange={e => setMessage(e.target.value)} rows={4} className="resize-none text-sm" disabled={sending} />
                    <p className="text-xs text-gray-400">Zpráva se zobrazí v e-mailu před platebními údaji.</p>
                </div>
                <DialogFooter className="gap-2">
                    {onSkip && <Button variant="ghost" size="sm" onClick={onSkip} disabled={sending} className="text-gray-500">Přeskočit</Button>}
                    <Button size="sm" onClick={() => onSend(message)} disabled={sending} className="bg-[#327600] hover:bg-[#2a6400] text-white">
                        {sending ? <><Loader2 size={13} className="animate-spin mr-1.5" />Odesílám…</> : "Odeslat e-maily"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Detail účastníků přihlášky (po rozbalení řádku) ───────────────────────────
// Stejné sloupce jako řádek přihlášky. Záloha je záznam na celé přihlášce (jedna
// platba za všechny osoby), proto se pro zobrazení rozpočítává rovným dílem mezi
// aktivní účastníky — sečteno přes všechny účastníky to přesně sedí na Zálohu
// i K zaplacení z řádku přihlášky (depositSharePerPerson × count = effectiveDeposit,
// Σ(finalAmount − depositSharePerPerson) = settlementAmount).

function ParticipantRow({ p, depositSharePerPerson }: { p: SettlementParticipant; depositSharePerPerson: number }) {
    if (p.cancelledAt) {
        const forfeit = p.depositForfeitPolicy ? FORFEIT_POLICY_LABELS[p.depositForfeitPolicy] ?? p.depositForfeitPolicy : null;
        return (
            <tr className="border-b border-gray-100 last:border-0 bg-gray-50/40">
                <td />
                <td className="py-1.5 pr-3">
                    <p className="text-xs text-gray-400 line-through">{p.fullName}</p>
                    <p className="text-[11px] text-gray-400">
                        {p.depositRefundAmount != null && p.depositRefundAmount > 0 && <>vráceno {fmtCzk(p.depositRefundAmount)} · </>}
                        {forfeit ?? "záloha nevyřešena"}
                    </p>
                </td>
                <td className="py-1.5 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-orange-600">nejede</td>
                <td className="py-1.5 pr-3 text-right text-xs text-gray-300">—</td>
                <td className="py-1.5 pr-3 text-right text-xs text-gray-300">—</td>
                <td className="py-1.5 pr-3 text-right text-xs text-gray-300">—</td>
                <td className="py-1.5 pr-3 text-right text-xs text-gray-300">—</td>
                <td />
            </tr>
        );
    }
    return (
        <tr className="border-b border-gray-100 last:border-0 bg-gray-50/40">
            <td />
            <td className="py-1.5 pr-3 text-xs text-gray-700">{p.fullName}</td>
            <td className="py-1.5 pr-3 text-right text-[11px]">
                {p.memberId !== null
                    ? <span className="font-medium uppercase tracking-wide text-emerald-600">člen</span>
                    : <span className="text-gray-400">nečlen</span>}
            </td>
            <td className="py-1.5 pr-3 text-right text-xs text-gray-600 tabular-nums">{fmtCzk(p.finalAmount + p.subsidyAmount)}</td>
            <td className="py-1.5 pr-3 text-right text-xs text-emerald-600 tabular-nums">{p.subsidyAmount > 0 ? `−${fmtCzk(p.subsidyAmount)}` : "—"}</td>
            <td className="py-1.5 pr-3 text-right text-xs text-gray-600 tabular-nums">{fmtCzk(depositSharePerPerson)}</td>
            <td className="py-1.5 pr-3 text-right text-xs font-medium text-gray-800 tabular-nums">{fmtCzk(p.finalAmount - depositSharePerPerson)}</td>
            <td />
        </tr>
    );
}

// ── Registration summary table ────────────────────────────────────────────────

function RegistrationRow({ reg, hasPerReg, isPrescribed, treasurerApproved, onSendEmail, onDepositPromiseChange, onDepositWontPayChange }: {
    reg: SettlementRegistrationRow; hasPerReg: boolean;
    isPrescribed: boolean; treasurerApproved: boolean;
    onSendEmail: (registrationId: number, name: string) => void;
    onDepositPromiseChange: (prescriptionId: number, promise: boolean, note: string) => void;
    onDepositWontPayChange: (prescriptionId: number, wontPay: boolean, note: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const lifecycle = computeLifecycle(reg, isPrescribed);
    const canSend = isPrescribed && treasurerApproved && !!reg.settlementPrescription && reg.settlementPrescription.status !== "cancelled";

    return (
        <>
            <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60 cursor-pointer" onClick={() => setExpanded(v => !v)}>
                <td className="py-2 pl-1 pr-1 text-gray-300">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </td>
                <td className="py-2 pr-3">
                    <p className="font-medium text-gray-800">{reg.firstName} {reg.lastName}</p>
                    <p className="text-xs text-gray-400">{reg.email}</p>
                    {reg.depositPrescription && <p className="text-xs font-mono text-gray-400 mt-0.5">záloha C{reg.depositPrescription.prescriptionCode}</p>}
                    {reg.settlementPrescription && <p className="text-xs font-mono text-gray-500 mt-0">doplatek C{reg.settlementPrescription.prescriptionCode}</p>}
                </td>
                <td className="py-2 pr-3 text-right text-gray-600 tabular-nums">
                    {reg.personsCount}
                    {reg.memberCount > 0 && <span className="text-xs text-emerald-600 ml-1">({reg.memberCount} čl.)</span>}
                </td>
                <td className="py-2 pr-3 text-right text-gray-600 tabular-nums">
                    <div className="inline-flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {fmtCzk(reg.totalAmount + reg.subsidy)}
                        {(hasPerReg || reg.expenses.length > 1) && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button className="text-gray-300 hover:text-gray-500 transition-colors shrink-0"><Info size={13} /></button>
                                </PopoverTrigger>
                                <PopoverContent side="left" align="start" className="w-64 p-3 text-xs space-y-2">
                                    <p className="font-semibold text-gray-700">Rozpad ceny akce</p>
                                    {reg.expenses.filter(e => e.allocatedAmount > 0).map(e => {
                                        const up = e.allocationMethod === "split_all" && reg.personsCount > 1 ? e.allocatedAmount / reg.personsCount : null;
                                        return (
                                            <div key={e.expenseId} className="space-y-0.5">
                                                <div className="flex justify-between gap-3 text-gray-700">
                                                    <span className="truncate font-medium">{e.purposeText ?? "—"}</span>
                                                    <span className="tabular-nums shrink-0">{fmtCzk(e.allocatedAmount)}</span>
                                                </div>
                                                {up !== null && <p className="text-gray-400 tabular-nums">{fmtCzk(up)}/os. × {reg.personsCount} os.</p>}
                                            </div>
                                        );
                                    })}
                                    <div className="border-t pt-1.5 flex justify-between font-semibold text-gray-800">
                                        <span>Celkem</span><span className="tabular-nums">{fmtCzk(reg.totalAmount + reg.subsidy)}</span>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                </td>
                <td className="py-2 pr-3 text-right text-emerald-600 tabular-nums">
                    {reg.subsidy > 0 ? `−${fmtCzk(reg.subsidy)}` : "—"}
                </td>
                <td className="py-2 pr-3 text-right text-gray-700 tabular-nums" onClick={e => e.stopPropagation()}>
                    <div className="flex flex-col items-end gap-0.5">
                        <span>{fmtCzk(reg.effectiveDepositForSettlement)}</span>
                        {reg.depositPrescription && (
                            <DepositStatusCell dep={reg.depositPrescription} locked={isPrescribed} onPromiseChange={onDepositPromiseChange} onWontPayChange={onDepositWontPayChange} />
                        )}
                    </div>
                </td>
                <td className="py-2 pr-3 text-right font-semibold text-gray-900 tabular-nums">{fmtCzk(reg.settlementAmount)}</td>
                <td className="py-2 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                        <LifecycleBadge lifecycle={lifecycle} />
                        {canSend && (
                            <button onClick={() => onSendEmail(reg.registrationId, `${reg.firstName} ${reg.lastName}`)}
                                title="Odeslat/přeposlat předpis e-mailem"
                                className="text-gray-300 hover:text-[#327600] transition-colors shrink-0">
                                <Mail size={13} />
                            </button>
                        )}
                    </div>
                </td>
            </tr>
            {expanded && reg.participants.length > 0 && reg.participants.map(p => (
                <ParticipantRow key={p.id > 0 ? p.id : p.fullName} p={p}
                    depositSharePerPerson={reg.activePersonsCount > 0 ? reg.effectiveDepositForSettlement / reg.activePersonsCount : 0} />
            ))}
            {expanded && reg.participants.length === 0 && (
                <tr className="border-b border-gray-100 last:border-0 bg-gray-50/40">
                    <td />
                    <td colSpan={7} className="py-2.5 pr-3 text-xs text-gray-400">Bez detailu účastníků.</td>
                </tr>
            )}
        </>
    );
}

function RegistrationSummaryTable({ rows, unitPrice, hasPerReg, isPrescribed, treasurerApproved, onSendEmail, onDepositPromiseChange, onDepositWontPayChange }: {
    rows: SettlementRegistrationRow[]; unitPrice: number; hasPerReg: boolean;
    isPrescribed: boolean; treasurerApproved: boolean;
    onSendEmail: (registrationId: number, name: string) => void;
    onDepositPromiseChange: (prescriptionId: number, promise: boolean, note: string) => void;
    onDepositWontPayChange: (prescriptionId: number, wontPay: boolean, note: string) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-gray-200">
                        <th className="w-5" />
                        <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 font-normal">Přihláška</th>
                        <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 font-normal">Osoby</th>
                        <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 font-normal">
                            Cena akce
                            {unitPrice > 0 && !hasPerReg && <span className="block text-gray-400 font-normal">{fmtCzk(unitPrice)}/os.</span>}
                        </th>
                        <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 font-normal">Dotace</th>
                        <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 font-normal">Záloha</th>
                        <th className="text-right py-2 pr-3 text-xs font-semibold text-gray-800">K zaplacení</th>
                        <th className="text-right py-2 text-xs font-medium text-gray-500 font-normal">Stav</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(reg => (
                        <RegistrationRow key={reg.registrationId} reg={reg} hasPerReg={hasPerReg}
                            isPrescribed={isPrescribed} treasurerApproved={treasurerApproved}
                            onSendEmail={onSendEmail} onDepositPromiseChange={onDepositPromiseChange} onDepositWontPayChange={onDepositWontPayChange} />
                    ))}
                </tbody>
                <tfoot>
                    <tr className="border-t border-gray-300">
                        <td />
                        <td className="pt-2 text-xs font-medium text-gray-500">Celkem</td>
                        <td className="pt-2 pr-3 text-right text-xs text-gray-600 tabular-nums">{rows.reduce((s, r) => s + r.personsCount, 0)} os.</td>
                        <td className="pt-2 pr-3 text-right text-xs text-gray-600 tabular-nums">{fmtCzk(rows.reduce((s, r) => s + r.totalAmount + r.subsidy, 0))}</td>
                        <td className="pt-2 pr-3 text-right text-xs text-emerald-600 tabular-nums">−{fmtCzk(rows.reduce((s, r) => s + r.subsidy, 0))}</td>
                        <td className="pt-2 pr-3 text-right text-xs text-gray-600 tabular-nums">{fmtCzk(rows.reduce((s, r) => s + r.effectiveDepositForSettlement, 0))}</td>
                        <td className="pt-2 pr-3 text-right text-sm font-bold text-gray-900 tabular-nums">{fmtCzk(rows.reduce((s, r) => s + r.settlementAmount, 0))}</td>
                        <td />
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function EventPaymentsTab({ eventId, billingStatus: initialBillingStatus, treasurerApproved: initialTreasurerApproved, onBillingStatusChange }: {
    eventId: number;
    billingStatus: "draft" | "prescribed";
    treasurerApproved: boolean;
    onBillingStatusChange: (s: "draft" | "prescribed") => void;
}) {
    const [settlement, setSettlement] = useState<EventSettlement | null>(null);
    const [loading, setLoading] = useState(true);
    const [subsidyTotal, setSubsidyTotal] = useState(0);
    const [billingStatus, setBillingStatus] = useState(initialBillingStatus);
    const [treasurerApproved] = useState(initialTreasurerApproved);
    const [locking, startLock] = useTransition();
    const [unlocking, startUnlock] = useTransition();
    const [sending, startSend] = useTransition();
    const [lockError, setLockError] = useState<string | null>(null);
    const [unlockInfo, setUnlockInfo] = useState<string | null>(null);
    const [emailLog, setEmailLog] = useState<EmailSendLogEntry[]>([]);
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [individualTarget, setIndividualTarget] = useState<{ registrationId: number; name: string } | null>(null);
    const [sendFeedback, setSendFeedback] = useState<string | null>(null);

    function load() {
        setLoading(true);
        getEventSettlement(eventId)
            .then(s => { setSettlement(s); setSubsidyTotal(s.subsidyTotal); })
            .finally(() => setLoading(false));
    }

    function silentReload() {
        getEventSettlement(eventId).then(s => { setSettlement(s); setSubsidyTotal(s.subsidyTotal); });
    }

    function loadLog() { getEventSettlementEmailLog(eventId).then(setEmailLog); }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); loadLog(); }, [eventId]);

    function handleSubsidyChange(newSubsidy: number) {
        // Dotace se rozpočítává per člen a zaokrouhluje per účastník na serveru (getEventSettlement) —
        // klient čísla neaproximuje, jen po uložení tiše dotáhne čerstvá data.
        setSubsidyTotal(newSubsidy);
        silentReload();
    }

    function handleLock() {
        setLockError(null);
        startLock(async () => {
            const res = await lockBilling(eventId);
            if ("error" in res) { setLockError(res.error); return; }
            setBillingStatus("prescribed");
            onBillingStatusChange("prescribed");
            load();
            setBatchModalOpen(true);
        });
    }

    function handleUnlock() {
        setUnlockInfo(null);
        startUnlock(async () => {
            const res = await unlockBilling(eventId);
            if ("error" in res) { setLockError(res.error); return; }
            setBillingStatus("draft");
            onBillingStatusChange("draft");
            setUnlockInfo("Odemčeno. Předpisy plateb zůstaly zachovány.");
            load();
        });
    }

    function handleSendBatch(message: string) {
        startSend(async () => {
            setSendFeedback(null);
            const res = await sendEventSettlementEmails(eventId, { message: message || undefined });
            setBatchModalOpen(false);
            if ("error" in res) {
                setSendFeedback(`Chyba: ${res.error}`);
            } else {
                setSendFeedback(`Odesláno ${res.sent} e-mailů${res.skipped > 0 ? `, přeskočeno ${res.skipped}` : ""}${res.failed.length > 0 ? `, ${res.failed.length} selhalo` : ""}.`);
                loadLog();
            }
        });
    }

    function handleDepositPromiseChange(prescriptionId: number, promise: boolean, note: string) {
        setDepositPromise(prescriptionId, promise, note).then(res => {
            if ("error" in res) setSendFeedback(`Chyba: ${res.error}`);
            else load();
        });
    }

    function handleDepositWontPayChange(prescriptionId: number, wontPay: boolean, note: string) {
        setDepositWontPay(prescriptionId, wontPay, note).then(res => {
            if ("error" in res) setSendFeedback(`Chyba: ${res.error}`);
            else load();
        });
    }

    function handleSendIndividual(message: string) {
        if (!individualTarget) return;
        const { registrationId, name } = individualTarget;
        startSend(async () => {
            setSendFeedback(null);
            const res = await sendSingleRegistrationEmail(registrationId, { message: message || undefined });
            setIndividualTarget(null);
            if ("error" in res) {
                setSendFeedback(`Chyba (${name}): ${res.error}`);
            } else {
                setSendFeedback(`E-mail odeslán: ${name}.`);
                loadLog();
            }
        });
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Načítám platby…</span>
            </div>
        );
    }

    if (!settlement) {
        return <div className="py-8 text-center text-sm text-gray-400">Nepodařilo se načíst data.</div>;
    }

    const hasExpenses = settlement.finalExpenses.length > 0;
    const hasRegistrations = settlement.registrations.length > 0;
    const isPrescribed = billingStatus === "prescribed";

    return (
        <div className="space-y-5">

            {/* Stavová hlavička + lock/unlock */}
            <div className={["rounded-xl border px-4 py-3", isPrescribed ? "border-[#327600]/30 bg-[#327600]/5" : "border-blue-200 bg-blue-50/50"].join(" ")}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        {isPrescribed ? (
                            <>
                                <p className="text-sm font-semibold text-[#327600] flex items-center gap-1.5">
                                    <Check size={15} /> Náklady uzamčeny — předpisy vygenerovány
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">Dotaci není možné měnit. Pro úpravu nákladů nejdřív odemkněte.</p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm font-semibold text-blue-700">Příprava vyúčtování</p>
                                <p className="text-xs text-gray-500 mt-0.5">Nastavte dotaci a rozúčtování v záložce Vyúčtování. Až bude vše hotovo, vygenerujte předpisy.</p>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {unlockInfo && <p className="text-xs text-gray-500">{unlockInfo}</p>}
                        {isPrescribed ? (
                            <>
                                <Button size="sm" variant="outline" onClick={handleUnlock} disabled={unlocking}
                                    className="border-gray-300 text-gray-600 hover:bg-gray-100">
                                    {unlocking ? <><Loader2 size={13} className="animate-spin mr-1" />Odemykám…</> : "🔓 Odemknout a upravit"}
                                </Button>
                                <Button size="sm" variant="outline"
                                    onClick={() => { setSendFeedback(null); setBatchModalOpen(true); }}
                                    disabled={!hasRegistrations || !treasurerApproved}
                                    className="border-[#327600]/40 text-[#327600] hover:bg-[#327600]/5 gap-1.5">
                                    <Mail size={13} /> Rozeslat maily
                                </Button>
                            </>
                        ) : (
                            <Button size="sm" onClick={handleLock} disabled={locking || !hasRegistrations || !hasExpenses}
                                className="bg-[#327600] hover:bg-[#2a6400] text-white">
                                {locking ? <><Loader2 size={13} className="animate-spin mr-1" />Generuji…</> : "Vygenerovat předpisy →"}
                            </Button>
                        )}
                    </div>
                </div>
                {isPrescribed && !treasurerApproved && (
                    <p className="mt-2 text-xs text-red-600">Předpisy nelze odeslat — hospodář ještě neudělil souhlas s vyúčtováním.</p>
                )}
                {lockError && (
                    <p className="mt-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-1.5 border border-red-100">{lockError}</p>
                )}
                {sendFeedback && (
                    <p className="mt-2 text-xs text-gray-600 bg-white/70 rounded-lg px-3 py-1.5 border border-gray-100">{sendFeedback}</p>
                )}
                {isPrescribed && emailLog.length > 0 && (
                    <div className="mt-3 border-t border-[#327600]/10 pt-3 space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Historie odeslaných e-mailů</p>
                        {emailLog.map(entry => (
                            <div key={entry.id} className="flex items-start gap-2 text-xs text-gray-500">
                                <Mail size={11} className="mt-0.5 shrink-0 text-gray-300" />
                                <span>
                                    <span className="text-gray-700 font-medium">
                                        {entry.registrationId ? entry.registrationName ?? "Individuální" : `${entry.sentCount} přihlášek`}
                                    </span>
                                    {" · "}{fmtDateTime(entry.sentAt)}{" · "}{entry.sentBy}
                                    {entry.failedCount > 0 && <span className="text-red-500 ml-1">({entry.failedCount} selhalo)</span>}
                                    {entry.testTo && <span className="text-amber-600 ml-1">· TEST → {entry.testTo}</span>}
                                    {entry.message && (
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <button className="text-gray-400 hover:text-gray-600 ml-1 italic underline decoration-dotted transition-colors">· zpráva</button>
                                            </PopoverTrigger>
                                            <PopoverContent side="top" align="start" className="w-72 p-3 text-xs text-gray-700 whitespace-pre-wrap">
                                                {entry.message}
                                            </PopoverContent>
                                        </Popover>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Dotace */}
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs text-gray-500 mb-0.5">Celková dotace akce pro členy OVT</p>
                        <SubsidyField eventId={eventId} value={subsidyTotal}
                            totalMemberParticipants={settlement.totalMemberParticipants}
                            onChange={handleSubsidyChange} disabled={isPrescribed} />
                    </div>
                    {subsidyTotal > 0 && (
                        <p className="text-xs text-gray-400 text-right">
                            celková sleva −{fmtCzk(settlement.registrations.reduce((s, r) => s + r.subsidy, 0))}
                        </p>
                    )}
                </div>
            </div>

            {/* Přehled plateb */}
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                    Přehled plateb
                    <span className="text-xs font-normal text-gray-400 ml-2">
                        ({settlement.totalParticipants} účastníků, {settlement.registrations.length} přihlášek)
                    </span>
                </h3>
                {!hasRegistrations ? (
                    <p className="text-sm text-gray-400 py-4 text-center">Žádné přihlášky na akci.</p>
                ) : (
                    <RegistrationSummaryTable
                        rows={settlement.registrations}
                        unitPrice={settlement.unitPrice}
                        hasPerReg={settlement.finalExpenses.some(e => e.allocationMethod === "per_registration" || e.allocationMethod === "with_coefficients")}
                        isPrescribed={isPrescribed}
                        treasurerApproved={treasurerApproved}
                        onSendEmail={(id, name) => { setSendFeedback(null); setIndividualTarget({ registrationId: id, name }); }}
                        onDepositPromiseChange={handleDepositPromiseChange}
                        onDepositWontPayChange={handleDepositWontPayChange}
                    />
                )}
            </div>

            <SendEmailModal open={batchModalOpen} title="Rozeslat e-maily s předpisy"
                description={`Odešle e-mail každé přihlášce (${settlement.registrations.length} přihlášek).`}
                onSend={handleSendBatch} onSkip={() => setBatchModalOpen(false)}
                onClose={() => setBatchModalOpen(false)} sending={sending} />
            <SendEmailModal open={!!individualTarget} title={`Odeslat předpis: ${individualTarget?.name ?? ""}`}
                onSend={handleSendIndividual} onClose={() => setIndividualTarget(null)} sending={sending} />
        </div>
    );
}
