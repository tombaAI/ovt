"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Loader2, Check, AlertCircle } from "lucide-react";
import {
    getEventSettlement,
    updateEventSubsidy,
    updateExpenseAllocationMethod,
    setExpenseRegistrationAllocations,
    generateEventPrescriptions,
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

// ── Expense allocation row ────────────────────────────────────────────────────

function ExpenseAllocationRow({
    expense,
    registrations,
    onChanged,
}: {
    expense: EventSettlement["finalExpenses"][0];
    registrations: SettlementRegistrationRow[];
    onChanged: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [method, setMethod] = useState<"split_all" | "per_registration">(expense.allocationMethod);
    const [checked, setChecked] = useState<Set<number>>(() => {
        const init = new Set<number>();
        const hasAnyAlloc = registrations.some(r => {
            const ex = r.expenses.find(e => e.expenseId === expense.id);
            return ex && ex.allocatedAmount > 0;
        });
        for (const reg of registrations) {
            const ex = reg.expenses.find(e => e.expenseId === expense.id);
            // žádné alokace ještě → default všichni; jinak jen ti s > 0
            if (!hasAnyAlloc || (ex && ex.allocatedAmount > 0)) {
                init.add(reg.registrationId);
            }
        }
        return init;
    });
    const [saving, startSave] = useTransition();
    const [msg, setMsg] = useState<string | null>(null);

    function calcAmounts(newChecked: Set<number>): { registrationId: number; amount: number }[] {
        const totalPersons = registrations
            .filter(r => newChecked.has(r.registrationId))
            .reduce((s, r) => s + r.personsCount, 0);
        const ppCost = totalPersons > 0 ? Math.ceil(expense.amount / totalPersons) : 0;
        return registrations.map(r => ({
            registrationId: r.registrationId,
            amount: newChecked.has(r.registrationId) ? ppCost * r.personsCount : 0,
        }));
    }

    function handleToggle(regId: number) {
        const newChecked = new Set(checked);
        if (newChecked.has(regId)) newChecked.delete(regId); else newChecked.add(regId);
        setChecked(newChecked);
        const allocs = calcAmounts(newChecked);
        startSave(async () => {
            const res = await setExpenseRegistrationAllocations(expense.id, allocs);
            if ("error" in res) setMsg(res.error); else { setMsg(null); onChanged(); }
        });
    }

    function handleMethodChange(newMethod: "split_all" | "per_registration") {
        startSave(async () => {
            const res = await updateExpenseAllocationMethod(expense.id, newMethod);
            if ("error" in res) { setMsg(res.error); } else { setMethod(newMethod); setMsg(null); if (newMethod === "per_registration") setExpanded(true); onChanged(); }
        });
    }

    // Zobrazené částky dle aktuálního stavu checkboxů
    const totalCheckedPersons = registrations.filter(r => checked.has(r.registrationId)).reduce((s, r) => s + r.personsCount, 0);
    const ppCost = totalCheckedPersons > 0 ? Math.ceil(expense.amount / totalCheckedPersons) : 0;

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
                        disabled={saving}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${method === "split_all" ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-medium" : "text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                        Rovnoměrně
                    </button>
                    <button
                        onClick={() => { handleMethodChange("per_registration"); }}
                        disabled={saving}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${method === "per_registration" ? "bg-blue-50 text-blue-700 border-blue-200 font-medium" : "text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                        Dle přihlášek
                    </button>
                    {method === "per_registration" && (
                        <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 transition-colors">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {method === "per_registration" && expanded && (
                <div className="mt-2 ml-1 divide-y divide-gray-50">
                    {registrations.map(reg => {
                        const isChecked = checked.has(reg.registrationId);
                        return (
                            <button
                                key={reg.registrationId}
                                onClick={() => handleToggle(reg.registrationId)}
                                disabled={saving}
                                className="w-full flex items-center gap-3 py-2 text-left hover:bg-gray-50 rounded transition-colors disabled:opacity-50"
                            >
                                <span className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${isChecked ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}>
                                    {isChecked && <Check size={10} className="text-white" strokeWidth={3} />}
                                </span>
                                <span className="flex-1 text-xs text-gray-700 truncate">{reg.firstName} {reg.lastName}</span>
                                <span className="text-xs tabular-nums text-right w-20 shrink-0">
                                    {isChecked
                                        ? <span className="font-medium text-gray-800">{fmtCzk(ppCost * reg.personsCount)}</span>
                                        : <span className="text-gray-300">—</span>}
                                </span>
                            </button>
                        );
                    })}
                    {saving && <p className="text-xs text-gray-400 pt-1 pb-0.5">Ukládám…</p>}
                    {msg && <p className="text-xs text-red-500 pt-1">{msg}</p>}
                </div>
            )}
            {msg && method !== "per_registration" && <p className="text-xs text-red-500 mt-1">{msg}</p>}
        </div>
    );
}

// ── Registration summary table ────────────────────────────────────────────────

function RegistrationSummaryTable({ rows, unitPrice }: { rows: SettlementRegistrationRow[]; unitPrice: number }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-gray-200">
                        <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 font-normal">Přihláška</th>
                        <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 font-normal">Osoby</th>
                        <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 font-normal">
                            Cena akce
                            {unitPrice > 0 && <span className="block text-gray-400 font-normal">{fmtCzk(unitPrice)}/os.</span>}
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

// ── Main tab component ────────────────────────────────────────────────────────

export function EventSettlementTab({ eventId }: { eventId: number }) {
    const [settlement, setSettlement] = useState<EventSettlement | null>(null);
    const [loading, setLoading] = useState(true);
    const [subsidyTotal, setSubsidyTotal] = useState(0);
    const [generating, startGenerate] = useTransition();
    const [genResult, setGenResult] = useState<{ created: number; updated: number } | { error: string } | null>(null);
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

    function handleGenerate() {
        startGenerate(async () => {
            setGenResult(null);
            const res = await generateEventPrescriptions(eventId);
            setGenResult(res);
            if (!("error" in res)) load();
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

    const perRegExpenses = settlement.finalExpenses.filter(e => e.allocationMethod === "per_registration");
    const allPerRegConfigured = perRegExpenses.every(exp => {
        const sum = settlement.registrations.reduce((s, r) => {
            const row = r.expenses.find(e => e.expenseId === exp.id);
            return s + (row?.allocatedAmount ?? 0);
        }, 0);
        return Math.abs(sum - exp.amount) < 0.01;
    });
    const canGenerate = hasExpenses && hasRegistrations && (perRegExpenses.length === 0 || allPerRegConfigured);

    // Varování: předpisy nesedí s aktuálními daty
    const prescriptionsStale = settlement.registrations.some(r =>
        r.existingPrescription &&
        r.existingPrescription.status !== "cancelled" &&
        Math.abs(r.existingPrescription.amount - r.totalAmount) > 0.01
    );
    const hasPaidOrMatched = settlement.registrations.some(r =>
        r.existingPrescription &&
        (r.existingPrescription.status === "matched" || r.existingPrescription.status === "paid")
    );

    return (
        <div className="space-y-5">

            {/* Varování o zastaralých předpisech */}
            {prescriptionsStale && (
                <div className="rounded-xl border-2 border-orange-400 bg-orange-50 px-4 py-3 space-y-1">
                    <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                        <AlertCircle size={16} /> Předpisy nesedí s aktuálními daty
                    </p>
                    <p className="text-xs text-orange-700">
                        Změnily se náklady nebo dotace. Je potřeba přegenerovat předpisy před dalším odesíláním e-mailů.
                        Kód předpisu (C{settlement.registrations.find(r => r.existingPrescription)?.existingPrescription?.prescriptionCode ?? "nnn"}) zůstane zachován, změní se jen výše platby.
                    </p>
                    {hasPaidOrMatched && (
                        <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                            <AlertCircle size={12} /> Pozor: u některých předpisů již proběhla nebo je spárována platba — zkontrolujte ručně.
                        </p>
                    )}
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
                            onChange={v => { setSubsidyTotal(v); load(); }}
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
                            onChanged={load}
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
                    <RegistrationSummaryTable rows={settlement.registrations} unitPrice={settlement.unitPrice} />
                )}
            </div>

            {/* Generování předpisů */}
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-4">
                <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">Vygenerovat předpisy plateb</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Vytvoří nebo přepíše předpisy pro všechny přihlášky. Splatnost: 7 dní. Účet: 351416278/0300.
                            Existující kód předpisu (Cnnn) zůstane zachován — změní se jen výše platby.
                        </p>
                        {!canGenerate && hasExpenses && perRegExpenses.length > 0 && !allPerRegConfigured && (
                            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                <AlertCircle size={12} /> Nejprve nakonfigurujte rozdělení pro všechny náklady Dle přihlášek.
                            </p>
                        )}
                        {!hasRegistrations && (
                            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                <AlertCircle size={12} /> Žádné přihlášky — přidejte účastníky v záložce Přihlášky.
                            </p>
                        )}
                    </div>
                    <Button
                        onClick={handleGenerate}
                        disabled={generating || !canGenerate}
                        className="shrink-0">
                        {generating ? <><Loader2 size={14} className="animate-spin mr-1.5" />Generuji…</> : "Vygenerovat předpisy"}
                    </Button>
                </div>
                {genResult && (
                    <div className={`mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                        "error" in genResult ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
                    }`}>
                        {"error" in genResult
                            ? <><AlertCircle size={14} /> {genResult.error}</>
                            : <><Check size={14} /> Hotovo — vytvořeno: {genResult.created}, aktualizováno: {genResult.updated}</>
                        }
                    </div>
                )}
            </div>

            {/* Odeslání e-mailů */}
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-4">
                <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">Odeslat e-maily s předpisy</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Odešle každé přihlášce e-mail s částkou k úhradě, platebními údaji a QR kódem.
                            Přihlášky bez předpisu nebo se stavem Zrušeno jsou přeskočeny.
                        </p>
                        {!settlement.registrations.some(r => r.existingPrescription) && (
                            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                <AlertCircle size={12} /> Nejprve vygenerujte předpisy plateb.
                            </p>
                        )}
                    </div>
                    <Button
                        onClick={handleSendEmails}
                        disabled={sending || !settlement.registrations.some(r => r.existingPrescription)}
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
