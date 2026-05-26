"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Loader2, Check, Info, Mail } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    getEventSettlement,
    updateEventSubsidy,
    updateExpenseAllocationMethod,
    setExpenseParticipantCoefficients,
    sendEventSettlementEmails,
    sendSingleRegistrationEmail,
    lockBilling,
    unlockBilling,
    getEventSettlementEmailLog,
} from "@/lib/actions/event-settlement";
import type { EventSettlement, SettlementRegistrationRow, EmailSendLogEntry } from "@/lib/actions/event-settlement";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCzk(amount: number) {
    return new Intl.NumberFormat("cs-CZ", { style: "decimal", maximumFractionDigits: 0 }).format(amount) + " Kč";
}

function fmtDateTime(d: Date) {
    return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

function StatusBadge({ status, matchedAmount }: { status: string; matchedAmount: number | null }) {
    if (status === "paid") return <Badge className="bg-green-100 text-green-700 border-0 text-xs">Zaplaceno</Badge>;
    if (status === "matched") return <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">Spárováno ({fmtCzk(matchedAmount ?? 0)})</Badge>;
    if (status === "cancelled") return <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Zrušeno</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Čeká na platbu</Badge>;
}

// ── Modal pro odeslání mailů ──────────────────────────────────────────────────

function SendEmailModal({ open, title, description, onSend, onSkip, onClose, sending }: {
    open: boolean;
    title: string;
    description?: string;
    onSend: (message: string) => void;
    onSkip?: () => void;
    onClose: () => void;
    sending: boolean;
}) {
    const [message, setMessage] = useState("");
    return (
        <Dialog open={open} onOpenChange={v => { if (!v && !sending) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                {description && <p className="text-sm text-gray-500 -mt-1">{description}</p>}
                <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Zpráva přihlášeným <span className="text-gray-400 font-normal">(volitelné)</span></p>
                    <Textarea
                        placeholder="Např. platbu prosím do konce května, díky…"
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        rows={4}
                        className="resize-none text-sm"
                        disabled={sending}
                    />
                    <p className="text-xs text-gray-400">Zpráva se zobrazí v e-mailu před platebními údaji.</p>
                </div>
                <DialogFooter className="gap-2">
                    {onSkip && (
                        <Button variant="ghost" size="sm" onClick={onSkip} disabled={sending} className="text-gray-500">
                            Přeskočit
                        </Button>
                    )}
                    <Button size="sm" onClick={() => onSend(message)} disabled={sending} className="bg-[#327600] hover:bg-[#2a6400] text-white">
                        {sending ? <><Loader2 size={13} className="animate-spin mr-1.5" />Odesílám…</> : "Odeslat e-maily"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Subsidy section ───────────────────────────────────────────────────────────

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
                    <p className="text-xs text-gray-400 mt-0.5">
                        = {fmtCzk(Math.round(value / totalMemberParticipants))}/člen ({totalMemberParticipants} členů)
                    </p>
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

// ── Per-person allocation helpers ─────────────────────────────────────────────

type AllocPerson = { key: string; fullName: string };

function getPersonsForAlloc(reg: SettlementRegistrationRow): AllocPerson[] {
    if (reg.participants.length > 0) {
        return reg.participants.map((p, i) => ({
            key: p.id > 0 ? `p${p.id}` : `r${reg.registrationId}-${i}`,
            fullName: p.fullName,
        }));
    }
    // Fallback — registrace bez zaznamenaných účastníků
    return Array.from({ length: reg.personsCount }, (_, i) => ({
        key: `r${reg.registrationId}-${i}`,
        fullName: i === 0 ? `${reg.firstName} ${reg.lastName}` : `Účastník ${i + 1}`,
    }));
}

// ── Koeficientový chip (jméno + koef, klik = popover) ────────────────────────

// Velká tlačítka (řádek 1), malá tlačítka (řádek 2)
const COEF_LARGE = [{ label: "0×", value: 0 }, { label: "1×", value: 1 }];
const COEF_SMALL = [{ label: "½", value: 0.5 }, { label: "2×", value: 2 }];

function coefLabel(v: number): string {
    if (v === 0) return "0×";
    if (v === 0.5) return "½";
    if (v === 1) return "1×";
    if (v === 2) return "2×";
    return `${v}×`;
}

function CoefChip({ personKey, fullName, value, onChange, disabled }: {
    personKey: string;
    fullName: string;
    value: number;
    onChange: (key: string, val: number) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(String(value));

    useEffect(() => {
        if (!open) setDraft(String(value));
    }, [value, open]);

    function applyPreset(v: number) {
        onChange(personKey, v);
        setOpen(false);
    }

    function commitDraft() {
        const parsed = parseFloat(draft.replace(",", "."));
        if (!isNaN(parsed) && parsed >= 0) onChange(personKey, parsed);
        else setDraft(String(value));
    }

    const isExcluded = value === 0;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    className={[
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                        isExcluded
                            ? "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
                        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                    ].join(" ")}
                >
                    <span className={isExcluded ? "line-through" : ""}>{fullName}</span>
                    <span className={[
                        "font-mono text-[10px]",
                        isExcluded ? "text-gray-300" : value === 1 ? "text-emerald-400" : "text-emerald-600 font-semibold",
                    ].join(" ")}>
                        {coefLabel(value)}
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="center" className="w-40 p-2.5 space-y-1.5">
                <p className="text-[11px] text-gray-400 truncate pb-0.5">{fullName}</p>
                {/* Velká tlačítka: 0× a 1× */}
                <div className="flex gap-1.5">
                    {COEF_LARGE.map(p => (
                        <button
                            key={p.label}
                            type="button"
                            onClick={() => applyPreset(p.value)}
                            className={[
                                "flex-1 py-2 text-sm font-semibold rounded-lg border transition-colors",
                                Math.abs(value - p.value) < 0.001
                                    ? p.value === 0
                                        ? "bg-gray-100 border-gray-300 text-gray-700"
                                        : "bg-emerald-50 border-emerald-300 text-emerald-700"
                                    : "border-gray-200 text-gray-600 hover:bg-gray-50",
                            ].join(" ")}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                {/* Malá tlačítka: ½ a 2× */}
                <div className="flex gap-1.5">
                    {COEF_SMALL.map(p => (
                        <button
                            key={p.label}
                            type="button"
                            onClick={() => applyPreset(p.value)}
                            className={[
                                "flex-1 py-1 rounded border transition-colors",
                                p.value === 0.5 ? "text-base leading-none" : "text-xs font-mono",
                                Math.abs(value - p.value) < 0.001
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-medium"
                                    : "border-gray-200 text-gray-500 hover:bg-gray-50",
                            ].join(" ")}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                {/* Vlastní hodnota */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
                    <Input
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commitDraft}
                        onKeyDown={e => {
                            if (e.key === "Enter") { commitDraft(); setOpen(false); }
                            if (e.key === "Escape") { setDraft(String(value)); setOpen(false); }
                        }}
                        className="flex-1 h-7 text-sm text-right font-mono"
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        autoFocus
                        placeholder="vlastní"
                    />
                    <span className="text-sm text-gray-400 shrink-0">×</span>
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ── Expense allocation row ────────────────────────────────────────────────────

function ExpenseAllocationRow({
    expense,
    registrations,
    onAllocationsChanged,
    disabled,
}: {
    expense: EventSettlement["finalExpenses"][0];
    registrations: SettlementRegistrationRow[];
    onAllocationsChanged?: (expenseId: number, allocs: { registrationId: number; amount: number }[]) => void;
    disabled?: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [method, setMethod] = useState<"split_all" | "per_registration" | "with_coefficients">(expense.allocationMethod);

    // Koeficienty per osoba — inicializujeme z uložených dat nebo odvozeně z alokací
    const [coefficients, setCoefficients] = useState<Record<string, number>>(() => {
        if (expense.participantCoefficients) return expense.participantCoefficients;
        // Odvodit z alokací: přihlášky s amount>0 → osoby dostávají 1, ostatní 0
        const hasAnyAlloc = registrations.some(r => {
            const ex = r.expenses.find(e => e.expenseId === expense.id);
            return ex && ex.allocatedAmount > 0;
        });
        const coefs: Record<string, number> = {};
        for (const reg of registrations) {
            const ex = reg.expenses.find(e => e.expenseId === expense.id);
            const regIncluded = !hasAnyAlloc || (ex && ex.allocatedAmount > 0);
            for (const p of getPersonsForAlloc(reg)) {
                coefs[p.key] = regIncluded ? 1 : 0;
            }
        }
        return coefs;
    });

    const [saveError, setSaveError] = useState<string | null>(null);
    const [methodSaving, startMethodSave] = useTransition();
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

    // Přepočet alokací per přihláška z koeficientů
    function calcAllocsFromCoefs(coefs: Record<string, number>): { registrationId: number; amount: number }[] {
        const allKeys = registrations.flatMap(r => getPersonsForAlloc(r).map(p => p.key));
        const totalWeight = allKeys.reduce((s, k) => s + (coefs[k] ?? 0), 0);
        if (totalWeight === 0) return registrations.map(r => ({ registrationId: r.registrationId, amount: 0 }));
        return registrations.map(reg => {
            const regWeight = getPersonsForAlloc(reg).reduce((s, p) => s + (coefs[p.key] ?? 0), 0);
            return { registrationId: reg.registrationId, amount: Math.ceil(expense.amount * regWeight / totalWeight) };
        });
    }

    function handleSetSplitAll() {
        if (disabled || methodSaving) return;
        startMethodSave(async () => {
            const res = await updateExpenseAllocationMethod(expense.id, "split_all");
            if ("error" in res) { setSaveError(res.error); return; }
            setMethod("split_all");
            setExpanded(false);
            setSaveError(null);
        });
    }

    function handleSetWithCoefficients() {
        if (disabled || methodSaving) return;
        if (method === "with_coefficients" || method === "per_registration") {
            setExpanded(v => !v);
            return;
        }
        // Použijeme zachované koeficienty ze split_all módu, nebo inicializujeme na 1
        const hasSaved = Object.keys(coefficients).length > 0;
        let coefs = coefficients;
        if (!hasSaved) {
            coefs = {};
            for (const reg of registrations) {
                for (const p of getPersonsForAlloc(reg)) coefs[p.key] = 1;
            }
            setCoefficients(coefs);
        }
        startMethodSave(async () => {
            const res = await setExpenseParticipantCoefficients(expense.id, coefs);
            if ("error" in res) { setSaveError(res.error); return; }
            setMethod("with_coefficients");
            onAllocationsChanged?.(expense.id, calcAllocsFromCoefs(coefs));
            setExpanded(true);
            setSaveError(null);
        });
    }

    function handleCoefChange(key: string, val: number) {
        if (disabled) return;
        const newCoefs = { ...coefficients, [key]: val };
        setCoefficients(newCoefs);
        const newAllocs = calcAllocsFromCoefs(newCoefs);
        onAllocationsChanged?.(expense.id, newAllocs);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            const res = await setExpenseParticipantCoefficients(expense.id, newCoefs);
            if ("error" in res) setSaveError(res.error); else setSaveError(null);
        }, 800);
    }

    const isCustom = method === "with_coefficients" || method === "per_registration";
    // Má zachované nestandardní koeficienty (při split_all = indikátor "nastavení uloženo")
    const hasSavedCoefs = method === "split_all" &&
        Object.keys(coefficients).length > 0 &&
        Object.values(coefficients).some(v => Math.abs(v - 1) > 0.001 || v === 0);

    // Celková váha a cena na podíl (pro zobrazení)
    const allKeys = registrations.flatMap(r => getPersonsForAlloc(r).map(p => p.key));
    const totalWeight = allKeys.reduce((s, k) => s + (coefficients[k] ?? 0), 0);
    const pricePerUnit = totalWeight > 0 ? Math.round(expense.amount / totalWeight) : 0;

    // Cena na osobu pro split_all (pro zobrazení v řádku 2)
    const totalParticipants = registrations.reduce((s, r) => s + r.personsCount, 0);
    const ppCostSplitAll = totalParticipants > 0 ? Math.ceil(expense.amount / totalParticipants) : 0;

    return (
        <div className="border-b border-gray-100 last:border-0 py-3">
            <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
                {/* Řádek 1: částka celkem + název */}
                <div className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap text-right">
                    {fmtCzk(expense.amount)}
                </div>
                <p className="text-sm font-medium text-gray-800">{expense.purposeText ?? "—"}</p>

                {/* Řádek 2: per osoba/podíl + metoda tlačítka */}
                <div className="text-xs text-gray-400 tabular-nums whitespace-nowrap text-right">
                    {method === "split_all" && totalParticipants > 0
                        ? <>{fmtCzk(ppCostSplitAll)}/os. · {totalParticipants}&nbsp;os.</>
                        : isCustom && totalWeight > 0
                            ? <>{fmtCzk(pricePerUnit)}/podíl · {totalWeight}&nbsp;p.</>
                            : "—"}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        onClick={handleSetSplitAll}
                        disabled={methodSaving || disabled}
                        className={[
                            "text-xs px-2 py-0.5 rounded border transition-colors",
                            method === "split_all" ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-medium" : "text-gray-500 border-gray-200 hover:border-gray-300",
                            disabled ? "opacity-50 cursor-not-allowed" : "",
                        ].join(" ")}>
                        <span className="sm:hidden">Rovnoměrně</span>
                        <span className="hidden sm:inline">Rovnoměrně na každého</span>
                    </button>
                    <button
                        onClick={handleSetWithCoefficients}
                        disabled={methodSaving || disabled}
                        className={[
                            "text-xs px-2 py-0.5 rounded border transition-colors inline-flex items-center gap-1",
                            isCustom ? "bg-blue-50 text-blue-700 border-blue-200 font-medium" : "text-gray-500 border-gray-200 hover:border-gray-300",
                            disabled ? "opacity-50 cursor-not-allowed" : "",
                        ].join(" ")}>
                        <span>Vlastní podíly</span>
                        {hasSavedCoefs && (
                            <span title="Koeficienty jsou zachovány" className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block shrink-0" />
                        )}
                    </button>
                    {isCustom && (
                        <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 transition-colors">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                    {methodSaving && <Loader2 size={13} className="animate-spin text-gray-400" />}
                </div>
            </div>

            {isCustom && expanded && (
                <div className="grid grid-cols-[auto_1fr] gap-x-4 mt-2">
                    <div />
                    <div className="space-y-2">
                        <p className="text-xs text-gray-400 tabular-nums">
                            {totalWeight > 0
                                ? <>{totalWeight} podílů · <span className="font-medium text-gray-600">{fmtCzk(pricePerUnit)}/podíl</span></>
                                : <span className="text-amber-600">Součet koeficientů je nula</span>}
                        </p>
                        {registrations.map(reg => (
                            <div key={reg.registrationId} className="flex flex-wrap gap-1.5">
                                {getPersonsForAlloc(reg).map(p => (
                                    <CoefChip
                                        key={p.key}
                                        personKey={p.key}
                                        fullName={p.fullName}
                                        value={coefficients[p.key] ?? 1}
                                        onChange={handleCoefChange}
                                        disabled={disabled}
                                    />
                                ))}
                            </div>
                        ))}
                        {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                    </div>
                </div>
            )}
            {saveError && !expanded && <p className="text-xs text-red-500 mt-1">{saveError}</p>}
        </div>
    );
}

// ── Registration summary table ────────────────────────────────────────────────

function RegistrationSummaryTable({ rows, unitPrice, hasPerReg, isPrescribed, treasurerApproved, onSendEmail }: {
    rows: SettlementRegistrationRow[];
    unitPrice: number;
    hasPerReg: boolean;
    isPrescribed: boolean;
    treasurerApproved: boolean;
    onSendEmail: (registrationId: number, name: string) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-gray-200">
                        <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 font-normal">Přihláška</th>
                        <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 font-normal">Osoby</th>
                        <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 font-normal">
                            Cena akce
                            {unitPrice > 0 && !hasPerReg && <span className="block text-gray-400 font-normal">{fmtCzk(unitPrice)}/os.</span>}
                        </th>
                        <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 font-normal">Dotace</th>
                        <th className="text-right py-2 pr-3 text-xs font-semibold text-gray-800">K zaplacení</th>
                        <th className="text-right py-2 text-xs font-medium text-gray-500 font-normal">Stav</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(reg => (
                        <tr key={reg.registrationId} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 pr-3">
                                <p className="font-medium text-gray-800">{reg.firstName} {reg.lastName}</p>
                                <p className="text-xs text-gray-400">{reg.email}</p>
                                {reg.depositPrescription && (
                                    <p className="text-xs font-mono text-gray-400 mt-0.5">záloha C{reg.depositPrescription.prescriptionCode}</p>
                                )}
                                {reg.settlementPrescription && (
                                    <p className="text-xs font-mono text-gray-500 mt-0">doplatek C{reg.settlementPrescription.prescriptionCode}</p>
                                )}
                            </td>
                            <td className="py-2 pr-3 text-right text-gray-600 tabular-nums">
                                {reg.personsCount}
                                {reg.memberCount > 0 && <span className="text-xs text-emerald-600 ml-1">({reg.memberCount} čl.)</span>}
                            </td>
                            <td className="py-2 pr-3 text-right text-gray-600 tabular-nums">
                                <div className="inline-flex items-center justify-end gap-1">
                                    {fmtCzk(reg.expensesTotal)}
                                    {(hasPerReg || reg.expenses.length > 1) && (
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <button className="text-gray-300 hover:text-gray-500 transition-colors shrink-0">
                                                    <Info size={13} />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent side="left" align="start" className="w-64 p-3 text-xs space-y-2">
                                                <p className="font-semibold text-gray-700">Rozpad ceny akce</p>
                                                {reg.expenses.filter(e => e.allocatedAmount > 0).map(e => {
                                                    const unitPrice = e.allocationMethod === "split_all" && reg.personsCount > 1
                                                        ? e.allocatedAmount / reg.personsCount
                                                        : null;
                                                    return (
                                                        <div key={e.expenseId} className="space-y-0.5">
                                                            <div className="flex justify-between gap-3 text-gray-700">
                                                                <span className="truncate font-medium">{e.purposeText ?? "—"}</span>
                                                                <span className="tabular-nums shrink-0">{fmtCzk(e.allocatedAmount)}</span>
                                                            </div>
                                                            {unitPrice !== null && (
                                                                <p className="text-gray-400 tabular-nums">
                                                                    {fmtCzk(unitPrice)}/os. × {reg.personsCount} os.
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                <div className="border-t pt-1.5 flex justify-between font-semibold text-gray-800">
                                                    <span>Celkem</span>
                                                    <span className="tabular-nums">{fmtCzk(reg.expensesTotal)}</span>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    )}
                                </div>
                            </td>
                            <td className="py-2 pr-3 text-right text-emerald-600 tabular-nums">
                                {reg.subsidy > 0 ? `−${fmtCzk(reg.subsidy)}` : "—"}
                            </td>
                            <td className="py-2 pr-3 text-right font-semibold text-gray-900 tabular-nums">{fmtCzk(reg.totalAmount)}</td>
                            <td className="py-2 text-right">
                                <div className="flex flex-col items-end gap-1">
                                    {reg.depositPrescription && (
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs text-gray-400">záloha</span>
                                            <StatusBadge status={reg.depositPrescription.status} matchedAmount={reg.depositPrescription.matchedAmount} />
                                        </div>
                                    )}
                                    <div className="inline-flex items-center gap-1">
                                        {(reg.depositPrescription || reg.settlementPrescription) && (
                                            <span className="text-xs text-gray-400">doplatek</span>
                                        )}
                                        {reg.settlementPrescription ? (
                                            <StatusBadge status={reg.settlementPrescription.status} matchedAmount={reg.settlementPrescription.matchedAmount} />
                                        ) : (
                                            <span className="text-xs text-gray-400">—</span>
                                        )}
                                        {isPrescribed && treasurerApproved && reg.settlementPrescription && reg.settlementPrescription.status !== "cancelled" && (
                                            <button
                                                onClick={() => onSendEmail(reg.registrationId, `${reg.firstName} ${reg.lastName}`)}
                                                title="Odeslat doplatek e-mailem"
                                                className="text-gray-300 hover:text-[#327600] transition-colors shrink-0">
                                                <Mail size={13} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="border-t border-gray-300">
                        <td className="pt-2 text-xs font-medium text-gray-500">Celkem</td>
                        <td className="pt-2 pr-3 text-right text-xs text-gray-600 tabular-nums">
                            {rows.reduce((s, r) => s + r.personsCount, 0)} os.
                        </td>
                        <td className="pt-2 pr-3 text-right text-xs text-gray-600 tabular-nums">
                            {fmtCzk(rows.reduce((s, r) => s + r.expensesTotal, 0))}
                        </td>
                        <td className="pt-2 pr-3 text-right text-xs text-emerald-600 tabular-nums">
                            −{fmtCzk(rows.reduce((s, r) => s + r.subsidy, 0))}
                        </td>
                        <td className="pt-2 pr-3 text-right text-sm font-bold text-gray-900 tabular-nums">
                            {fmtCzk(rows.reduce((s, r) => s + r.totalAmount, 0))}
                        </td>
                        <td />
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

// ── Lokální přepočet po změně dotace (bez server roundtrip) ──────────────────

function recomputeSettlement(s: EventSettlement, newSubsidyTotal: number): EventSettlement {
    const newRegs = s.registrations.map(reg => {
        const subsidy = s.totalMemberParticipants > 0
            ? Math.round(newSubsidyTotal * reg.memberCount / s.totalMemberParticipants)
            : 0;
        const totalAmount = Math.max(0, reg.expensesTotal - subsidy);
        return { ...reg, subsidy, totalAmount };
    });
    return {
        ...s,
        subsidyTotal: newSubsidyTotal,
        registrations: newRegs,
        grandTotal: newRegs.reduce((sum, r) => sum + r.totalAmount, 0),
    };
}

// ── Main tab component ────────────────────────────────────────────────────────

export function EventSettlementTab({ eventId, billingStatus: initialBillingStatus, treasurerApproved: initialTreasurerApproved }: { eventId: number; billingStatus: "draft" | "prescribed"; treasurerApproved: boolean }) {
    const [settlement, setSettlement] = useState<EventSettlement | null>(null);
    const [loading, setLoading] = useState(true);
    const [subsidyTotal, setSubsidyTotal] = useState(0);
    const [billingStatus, setBillingStatus] = useState(initialBillingStatus);
    const [treasurerApproved] = useState(initialTreasurerApproved);
    const [locking, startLock]     = useTransition();
    const [unlocking, startUnlock] = useTransition();
    const [sending, startSend]     = useTransition();
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

    function loadLog() {
        getEventSettlementEmailLog(eventId).then(setEmailLog);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); loadLog(); }, [eventId]);

    function handleSubsidyChange(newSubsidy: number) {
        setSubsidyTotal(newSubsidy);
        setSettlement(s => s ? recomputeSettlement(s, newSubsidy) : null);
    }

    function handleAllocationsChanged(expenseId: number, newAllocs: { registrationId: number; amount: number }[]) {
        setSettlement(prev => {
            if (!prev) return prev;
            const allocMap = new Map(newAllocs.map(a => [a.registrationId, a.amount]));
            const newRegs = prev.registrations.map(reg => {
                const newExpenses = reg.expenses.map(e =>
                    e.expenseId === expenseId ? { ...e, allocatedAmount: allocMap.get(reg.registrationId) ?? 0 } : e
                );
                const perRegPart = newExpenses
                    .filter(e => e.allocationMethod === "per_registration")
                    .reduce((s, e) => s + e.allocatedAmount, 0);
                const expensesTotal = prev.unitPrice * reg.personsCount + perRegPart;
                const subsidy = prev.totalMemberParticipants > 0
                    ? Math.round(prev.subsidyTotal * reg.memberCount / prev.totalMemberParticipants)
                    : 0;
                const totalAmount = Math.max(0, expensesTotal - subsidy);
                return { ...reg, expenses: newExpenses, expensesTotal, subsidy, totalAmount };
            });
            return { ...prev, registrations: newRegs, grandTotal: newRegs.reduce((s, r) => s + r.totalAmount, 0) };
        });
    }

    function handleLock() {
        setLockError(null);
        startLock(async () => {
            const res = await lockBilling(eventId);
            if ("error" in res) { setLockError(res.error); return; }
            setBillingStatus("prescribed");
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
                <span className="text-sm">Počítám vyúčtování…</span>
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

            {/* ── Stavová hlavička ── */}
            <div className={[
                "rounded-xl border px-4 py-3",
                isPrescribed ? "border-[#327600]/30 bg-[#327600]/5" : "border-blue-200 bg-blue-50/50",
            ].join(" ")}>
                {/* Řádek: stav + tlačítka */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        {isPrescribed ? (
                            <>
                                <p className="text-sm font-semibold text-[#327600] flex items-center gap-1.5">
                                    <Check size={15} /> Náklady uzamčeny — předpisy vygenerovány
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Náklady ani dotaci není možné měnit. Pro úpravu nejdřív odemkněte.
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm font-semibold text-blue-700">Příprava vyúčtování</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Upravte náklady a dotaci. Až bude vše připraveno, vygenerujte předpisy — náklady se pak uzamknou.
                                </p>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {lockError && <p className="text-xs text-red-600">{lockError}</p>}
                        {unlockInfo && <p className="text-xs text-gray-500">{unlockInfo}</p>}
                        {isPrescribed ? (
                            <>
                                <Button size="sm" variant="outline"
                                    onClick={handleUnlock} disabled={unlocking}
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
                            <Button size="sm"
                                onClick={handleLock} disabled={locking || !hasRegistrations || !hasExpenses}
                                className="bg-[#327600] hover:bg-[#2a6400] text-white">
                                {locking ? <><Loader2 size={13} className="animate-spin mr-1" />Generuji…</> : "Vygenerovat předpisy →"}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Blokující hláška bez souhlasu hospodáře */}
                {isPrescribed && !treasurerApproved && (
                    <p className="mt-2 text-xs text-red-600">Předpisy nelze odeslat — hospodář ještě neudělil souhlas s vyúčtováním.</p>
                )}

                {/* Feedback po odeslání */}
                {sendFeedback && (
                    <p className="mt-2 text-xs text-gray-600 bg-white/70 rounded-lg px-3 py-1.5 border border-gray-100">{sendFeedback}</p>
                )}

                {/* Log odeslaných mailů */}
                {isPrescribed && emailLog.length > 0 && (
                    <div className="mt-3 border-t border-[#327600]/10 pt-3 space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Historie odeslaných e-mailů</p>
                        {emailLog.map(entry => (
                            <div key={entry.id} className="flex items-start gap-2 text-xs text-gray-500">
                                <Mail size={11} className="mt-0.5 shrink-0 text-gray-300" />
                                <span>
                                    <span className="text-gray-700 font-medium">
                                        {entry.registrationId
                                            ? entry.registrationName ?? "Individuální"
                                            : `${entry.sentCount} přihlášek`}
                                    </span>
                                    {" · "}{fmtDateTime(entry.sentAt)}
                                    {" · "}{entry.sentBy}
                                    {entry.failedCount > 0 && <span className="text-red-500 ml-1">({entry.failedCount} selhalo)</span>}
                                    {entry.testTo && <span className="text-amber-600 ml-1" title={`Testovací odesílání → ${entry.testTo}`}>· TEST → {entry.testTo}</span>}
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
                        <SubsidyField
                            eventId={eventId}
                            value={subsidyTotal}
                            totalMemberParticipants={settlement.totalMemberParticipants}
                            onChange={handleSubsidyChange}
                            disabled={isPrescribed}
                        />
                    </div>
                    {subsidyTotal > 0 && (
                        <p className="text-xs text-gray-400 text-right">
                            celková sleva −{fmtCzk(settlement.registrations.reduce((s, r) => s + r.subsidy, 0))}
                        </p>
                    )}
                </div>
            </div>

            {/* Náklady */}
            <div className="rounded-xl border border-gray-200 bg-white px-4 pt-3 pb-1">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-800">
                        Náklady k rozúčtování
                        <span className="text-xs font-normal text-gray-400 ml-2">
                            ({settlement.finalExpenses.length} položek, celkem {fmtCzk(settlement.expensesSum)})
                        </span>
                    </h3>
                </div>
                {!hasExpenses ? (
                    <p className="text-sm text-gray-400 py-4 text-center">Žádné finální náklady u akce.</p>
                ) : (
                    settlement.finalExpenses.map(exp => (
                        <ExpenseAllocationRow
                            key={exp.id}
                            expense={exp}
                            registrations={settlement.registrations}
                            onAllocationsChanged={handleAllocationsChanged}
                            disabled={isPrescribed}
                        />
                    ))
                )}
            </div>

            {/* Přehled per přihláška */}
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
                        hasPerReg={settlement.finalExpenses.some(e => e.allocationMethod === "per_registration")}
                        isPrescribed={isPrescribed}
                        treasurerApproved={treasurerApproved}
                        onSendEmail={(id, name) => { setSendFeedback(null); setIndividualTarget({ registrationId: id, name }); }}
                    />
                )}
            </div>

            {/* Modaly pro odesílání mailů */}
            <SendEmailModal
                open={batchModalOpen}
                title="Rozeslat e-maily s předpisy"
                description={`Odešle e-mail každé přihlášce (${settlement.registrations.length} přihlášek).`}
                onSend={handleSendBatch}
                onSkip={() => setBatchModalOpen(false)}
                onClose={() => setBatchModalOpen(false)}
                sending={sending}
            />
            <SendEmailModal
                open={!!individualTarget}
                title={`Odeslat předpis: ${individualTarget?.name ?? ""}`}
                onSend={handleSendIndividual}
                onClose={() => setIndividualTarget(null)}
                sending={sending}
            />

        </div>
    );
}
