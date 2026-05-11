"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Loader2, Check, AlertCircle, X } from "lucide-react";
import {
    getEventSettlement,
    updateEventSubsidy,
    updateExpenseAllocationMethod,
    setExpenseRegistrationAllocations,
    sendEventSettlementEmails,
} from "@/lib/actions/event-settlement";
import type { EventSettlement, SettlementRegistrationRow } from "@/lib/actions/event-settlement";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCzk(amount: number) {
    return new Intl.NumberFormat("cs-CZ", { style: "decimal", maximumFractionDigits: 0 }).format(amount) + " Kč";
}

function StatusBadge({ status, matchedAmount }: { status: string; matchedAmount: number | null }) {
    if (status === "paid") return <Badge className="bg-green-100 text-green-700 border-0 text-xs">Zaplaceno</Badge>;
    if (status === "matched") return <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">Spárováno ({fmtCzk(matchedAmount ?? 0)})</Badge>;
    if (status === "cancelled") return <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Zrušeno</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Čeká na platbu</Badge>;
}

// ── Subsidy section ───────────────────────────────────────────────────────────

function SubsidyField({ eventId, value, totalMemberParticipants, onChange }: {
    eventId: number; value: number; totalMemberParticipants: number; onChange: (v: number) => void;
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
                <button onClick={() => { setDraft(String(value)); setEditing(true); }}
                    className="text-sm font-medium text-gray-900 hover:text-emerald-700 transition-colors">
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

// ── Expense allocation row ────────────────────────────────────────────────────

function ExpenseAllocationRow({
    expense,
    registrations,
    onAllocationsChanged,
}: {
    expense: EventSettlement["finalExpenses"][0];
    registrations: SettlementRegistrationRow[];
    onAllocationsChanged?: (expenseId: number, allocs: { registrationId: number; amount: number }[]) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [method, setMethod] = useState<"split_all" | "per_registration">(expense.allocationMethod);

    // Per-person výběr: klíč = "p{participantId}" nebo "r{regId}-{index}"
    const [checkedPersons, setCheckedPersons] = useState<Set<string>>(() => {
        const init = new Set<string>();
        const hasAnyAlloc = registrations.some(r => {
            const ex = r.expenses.find(e => e.expenseId === expense.id);
            return ex && ex.allocatedAmount > 0;
        });
        for (const reg of registrations) {
            const ex = reg.expenses.find(e => e.expenseId === expense.id);
            const regIncluded = !hasAnyAlloc || (ex && ex.allocatedAmount > 0);
            if (regIncluded) getPersonsForAlloc(reg).forEach(p => init.add(p.key));
        }
        return init;
    });

    const [saveError, setSaveError] = useState<string | null>(null);
    const [methodSaving, startMethodSave] = useTransition();
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

    function calcAmountsFor(cp: Set<string>): { registrationId: number; amount: number }[] {
        const totalChecked = registrations.reduce((s, reg) =>
            s + getPersonsForAlloc(reg).filter(p => cp.has(p.key)).length, 0);
        const ppCost = totalChecked > 0 ? Math.ceil(expense.amount / totalChecked) : 0;
        return registrations.map(reg => {
            const count = getPersonsForAlloc(reg).filter(p => cp.has(p.key)).length;
            return { registrationId: reg.registrationId, amount: count > 0 ? ppCost * count : 0 };
        });
    }

    function handleTogglePerson(key: string) {
        const newCp = new Set(checkedPersons);
        if (newCp.has(key)) newCp.delete(key); else newCp.add(key);
        setCheckedPersons(newCp);
        const newAllocs = calcAmountsFor(newCp);
        // Okamžitý přepočet přehledu plateb v parent komponentě
        onAllocationsChanged?.(expense.id, newAllocs);
        // Debounced save do DB
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            const res = await setExpenseRegistrationAllocations(expense.id, newAllocs);
            if ("error" in res) setSaveError(res.error); else setSaveError(null);
        }, 500);
    }

    function handleMethodChange(newMethod: "split_all" | "per_registration") {
        startMethodSave(async () => {
            const res = await updateExpenseAllocationMethod(expense.id, newMethod);
            if ("error" in res) { setSaveError(res.error); return; }
            setMethod(newMethod);
            setSaveError(null);
            if (newMethod === "per_registration") setExpanded(true);
        });
    }

    // Cena per osoba z aktuálního výběru
    const totalChecked = registrations.reduce((s, reg) =>
        s + getPersonsForAlloc(reg).filter(p => checkedPersons.has(p.key)).length, 0);
    const ppCost = totalChecked > 0 ? Math.ceil(expense.amount / totalChecked) : 0;

    return (
        <div className="border-b border-gray-100 last:border-0 py-3">
            <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{expense.purposeText ?? "—"}</p>
                </div>
                <div className="shrink-0 text-sm font-semibold text-gray-900 tabular-nums">{fmtCzk(expense.amount)}</div>
                <div className="shrink-0 flex items-center gap-1.5">
                    <button
                        onClick={() => handleMethodChange("split_all")}
                        disabled={methodSaving}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${method === "split_all" ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-medium" : "text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                        Rovnoměrně na každého
                    </button>
                    <button
                        onClick={() => handleMethodChange("per_registration")}
                        disabled={methodSaving}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${method === "per_registration" ? "bg-blue-50 text-blue-700 border-blue-200 font-medium" : "text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                        Jen někteří účastníci
                    </button>
                    {method === "per_registration" && (
                        <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 transition-colors">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {method === "per_registration" && expanded && (
                <div className="mt-3 ml-1 space-y-3">
                    {/* Souhrn výběru */}
                    <p className="text-xs text-gray-500 tabular-nums">
                        {totalChecked > 0
                            ? <>{totalChecked} {totalChecked === 1 ? "osoba" : totalChecked < 5 ? "osoby" : "osob"} · <span className="font-medium text-gray-700">{fmtCzk(ppCost)}/os.</span></>
                            : <span className="text-gray-400">Nikdo není vybrán</span>}
                    </p>

                    {registrations.map(reg => {
                        const persons = getPersonsForAlloc(reg);
                        return (
                            <div key={reg.registrationId} className="flex flex-wrap gap-1.5">
                                {persons.map(p => {
                                        const isIn = checkedPersons.has(p.key);
                                        return (
                                            <button
                                                key={p.key}
                                                type="button"
                                                onClick={() => handleTogglePerson(p.key)}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                                                    isIn
                                                        ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                                        : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
                                                }`}
                                            >
                                                {isIn
                                                    ? <Check size={11} strokeWidth={2.5} className="text-emerald-600 shrink-0" />
                                                    : <X size={11} strokeWidth={2.5} className="text-gray-300 shrink-0" />}
                                                {p.fullName}
                                            </button>
                                        );
                                    })}
                            </div>
                        );
                    })}
                    {saveError && <p className="text-xs text-red-500 pt-1">{saveError}</p>}
                </div>
            )}
            {saveError && method !== "per_registration" && <p className="text-xs text-red-500 mt-1">{saveError}</p>}
        </div>
    );
}

// ── Registration summary table ────────────────────────────────────────────────

function RegistrationSummaryTable({ rows, unitPrice, hasPerReg }: { rows: SettlementRegistrationRow[]; unitPrice: number; hasPerReg: boolean }) {
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
                                {reg.existingPrescription && (
                                    <p className="text-xs font-mono text-gray-500 mt-0.5">C{reg.existingPrescription.prescriptionCode}</p>
                                )}
                            </td>
                            <td className="py-2 pr-3 text-right text-gray-600 tabular-nums">
                                {reg.personsCount}
                                {reg.memberCount > 0 && <span className="text-xs text-emerald-600 ml-1">({reg.memberCount} čl.)</span>}
                            </td>
                            <td className="py-2 pr-3 text-right text-gray-600 tabular-nums">{fmtCzk(reg.expensesTotal)}</td>
                            <td className="py-2 pr-3 text-right text-emerald-600 tabular-nums">
                                {reg.subsidy > 0 ? `−${fmtCzk(reg.subsidy)}` : "—"}
                            </td>
                            <td className="py-2 pr-3 text-right font-semibold text-gray-900 tabular-nums">{fmtCzk(reg.totalAmount)}</td>
                            <td className="py-2 text-right">
                                {reg.existingPrescription ? (
                                    <StatusBadge
                                        status={reg.existingPrescription.status}
                                        matchedAmount={reg.existingPrescription.matchedAmount}
                                    />
                                ) : <span className="text-xs text-gray-400">—</span>}
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

export function EventSettlementTab({ eventId }: { eventId: number }) {
    const [settlement, setSettlement] = useState<EventSettlement | null>(null);
    const [loading, setLoading] = useState(true);
    const [subsidyTotal, setSubsidyTotal] = useState(0);
    const [sending, startSend] = useTransition();
    const [sendResult, setSendResult] = useState<{ sent: number; skipped: number; failed: { name: string; email: string; error: string }[] } | { error: string } | null>(null);

    function load() {
        setLoading(true);
        getEventSettlement(eventId)
            .then(s => { setSettlement(s); setSubsidyTotal(s.subsidyTotal); })
            .finally(() => setLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [eventId]);

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

function handleSendEmails() {
        startSend(async () => {
            setSendResult(null);
            const res = await sendEventSettlementEmails(eventId);
            setSendResult(res);
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

    // Varování: předpis pending nesedí s aktuálními daty → je potřeba přegenerovat
    const stalePending = settlement.registrations.some(r =>
        r.existingPrescription &&
        r.existingPrescription.status === "pending" &&
        Math.abs(r.existingPrescription.amount - r.totalAmount) > 0.01
    );
    // Informace (ne varování): zaplacený/spárovaný předpis se liší od výpočtu — historicky v pořádku
    const stalePaid = settlement.registrations.some(r =>
        r.existingPrescription &&
        (r.existingPrescription.status === "matched" || r.existingPrescription.status === "paid") &&
        Math.abs(r.existingPrescription.amount - r.totalAmount) > 0.01
    );

    return (
        <div className="space-y-5">

            {/* Varování: pending předpis nesedí → nutné přegenerovat */}
            {stalePending && (
                <div className="rounded-xl border-2 border-orange-400 bg-orange-50 px-4 py-3 space-y-1">
                    <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                        <AlertCircle size={16} /> Předpisy nesedí s aktuálními daty
                    </p>
                    <p className="text-xs text-orange-700">
                        Změnily se náklady nebo dotace. Je potřeba přegenerovat předpisy před dalším odesíláním e-mailů.
                        Kód předpisu (C{settlement.registrations.find(r => r.existingPrescription?.status === "pending")?.existingPrescription?.prescriptionCode ?? "nnn"}) zůstane zachován, změní se jen výše platby.
                    </p>
                </div>
            )}

            {/* Informace: zaplacené předpisy se lišily od výpočtu — historicky OK */}
            {!stalePending && stalePaid && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
                    Zaplacené předpisy se drobně liší od aktuálního výpočtu — platba proběhla za původní částku, vše je v pořádku.
                </div>
            )}

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
                    />
                )}
            </div>

            {/* Odeslání e-mailů — přepočítá a uzamkne částky, odešle e-maily s platebními údaji */}
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-4">
                <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">Odeslat e-maily s předpisy</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Přepočítá aktuální částky, přiřadí platební kódy a odešle každé přihlášce e-mail
                            s částkou k úhradě, platebními údaji a QR kódem.
                        </p>
                        {!hasRegistrations && (
                            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                <AlertCircle size={12} /> Žádné přihlášky — přidejte účastníky v záložce Přihlášky.
                            </p>
                        )}
                    </div>
                    <Button
                        onClick={handleSendEmails}
                        disabled={sending || !hasRegistrations}
                        variant="outline"
                        className="shrink-0">
                        {sending ? <><Loader2 size={14} className="animate-spin mr-1.5" />Odesílám…</> : "Odeslat e-maily"}
                    </Button>
                </div>
                {sendResult && (
                    <div className="mt-3 space-y-2">
                        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                            "error" in sendResult
                                ? "bg-red-50 text-red-600"
                                : sendResult.failed.length > 0
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-green-50 text-green-700"
                        }`}>
                            {"error" in sendResult
                                ? <><AlertCircle size={14} /> {sendResult.error}</>
                                : sendResult.failed.length > 0
                                    ? <><AlertCircle size={14} /> Odesláno: {sendResult.sent}{sendResult.skipped > 0 ? `, přeskočeno: ${sendResult.skipped}` : ""} — <strong>{sendResult.failed.length} se nepodařilo odeslat</strong></>
                                    : <><Check size={14} /> Odesláno: {sendResult.sent} e-mailů{sendResult.skipped > 0 ? `, přeskočeno: ${sendResult.skipped}` : ""}</>
                            }
                        </div>
                        {"failed" in sendResult && sendResult.failed.length > 0 && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs space-y-1">
                                <p className="font-semibold text-red-700">Neodeslané e-maily:</p>
                                {sendResult.failed.map((f, i) => (
                                    <p key={i} className="text-red-600">
                                        <span className="font-medium">{f.name}</span> ({f.email}) — {f.error}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

        </div>
    );
}
