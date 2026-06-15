"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Loader2, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    getEventSettlement,
    updateExpenseAllocationMethod,
    setExpenseParticipantCoefficients,
} from "@/lib/actions/event-settlement";
import type { EventSettlement, SettlementRegistrationRow, FinalExpenseRow } from "@/lib/actions/event-settlement";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCzk(amount: number) {
    return new Intl.NumberFormat("cs-CZ", { style: "decimal", maximumFractionDigits: 0 }).format(amount) + " Kč";
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
                {/* Vlastní hodnota nahoře */}
                <div className="flex items-center gap-1.5 pb-1 border-b border-gray-100">
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
                {/* Velká tlačítka: 0× a 1× dole (po ruce) */}
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
            </PopoverContent>
        </Popover>
    );
}

// ── Expense allocation row ────────────────────────────────────────────────────

function ExpenseAllocationRow({
    expense,
    registrations,
    onAllocationsChanged,
    onReload,
    disabled,
}: {
    expense: FinalExpenseRow;
    registrations: SettlementRegistrationRow[];
    onAllocationsChanged?: (expenseId: number, allocs: { registrationId: number; amount: number }[], newMethod?: "with_coefficients" | "per_registration") => void;
    onReload?: () => void;
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
    const [methodSaving, setMethodSaving] = useState(false);
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
        if (disabled) return;
        const prevMethod = method;
        // Okamžitá UI aktualizace
        setMethod("split_all");
        setExpanded(false);
        setSaveError(null);
        // Uložení v pozadí
        setMethodSaving(true);
        updateExpenseAllocationMethod(expense.id, "split_all")
            .then(res => {
                if ("error" in res) { setSaveError(res.error); setMethod(prevMethod); setExpanded(prevMethod !== "split_all"); }
                else { onReload?.(); }
            })
            .finally(() => setMethodSaving(false));
    }

    function handleSetWithCoefficients() {
        if (disabled) return;
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
        // Okamžitá UI aktualizace včetně přepočtu spodní tabulky
        const prevMethod = method;
        setMethod("with_coefficients");
        setExpanded(true);
        setSaveError(null);
        onAllocationsChanged?.(expense.id, calcAllocsFromCoefs(coefs), "with_coefficients");
        // Uložení v pozadí
        setMethodSaving(true);
        setExpenseParticipantCoefficients(expense.id, coefs)
            .then(res => {
                if ("error" in res) { setSaveError(res.error); setMethod(prevMethod); setExpanded(false); }
            })
            .finally(() => setMethodSaving(false));
    }

    function handleCoefChange(key: string, val: number) {
        if (disabled) return;
        const newCoefs = { ...coefficients, [key]: val };
        setCoefficients(newCoefs);
        const newAllocs = calcAllocsFromCoefs(newCoefs);
        onAllocationsChanged?.(expense.id, newAllocs, "with_coefficients");
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

    // Celková váha a cena na podíl (pro zobrazení) — z efektivní částky
    const allKeys = registrations.flatMap(r => getPersonsForAlloc(r).map(p => p.key));
    const totalWeight = allKeys.reduce((s, k) => s + (coefficients[k] ?? 0), 0);
    const pricePerUnit = totalWeight > 0 ? Math.round(expense.effectiveAmount / totalWeight) : 0;

    // Cena na osobu pro split_all — aktivní účastníci, efektivní částka
    const totalActiveParticipants = registrations.reduce((s, r) => s + r.activePersonsCount, 0);
    const ppCostSplitAll = totalActiveParticipants > 0 ? Math.ceil(expense.effectiveAmount / totalActiveParticipants) : 0;

    return (
        <div className="border-b border-gray-100 last:border-0 py-3">
            <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
                {/* Řádek 1: částka celkem + název */}
                <div className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap text-right">
                    {fmtCzk(expense.amount)}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-800">{expense.purposeText ?? "—"}</p>
                    {expense.totalForfeit > 0 && (
                        <span
                            title={`Záloha propadlá na tento náklad: −${fmtCzk(expense.totalForfeit)}. Efektivní částka: ${fmtCzk(expense.effectiveAmount)}`}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-700 whitespace-nowrap cursor-help"
                        >
                            −{fmtCzk(expense.totalForfeit)} storno záloha
                        </span>
                    )}
                </div>

                {/* Řádek 2: per osoba/podíl + metoda tlačítka */}
                <div className="text-xs text-gray-400 tabular-nums whitespace-nowrap text-right">
                    {method === "split_all" && totalActiveParticipants > 0
                        ? <>{fmtCzk(ppCostSplitAll)}/os. · {totalActiveParticipants}&nbsp;os.</>
                        : isCustom && totalWeight > 0
                            ? <>{fmtCzk(pricePerUnit)}/podíl · {totalWeight}&nbsp;p.</>
                            : "—"}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        onClick={handleSetSplitAll}
                        disabled={disabled}
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
                        disabled={disabled}
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

// ── Main tab — jen rozúčtování nákladů ───────────────────────────────────────

export function EventSettlementTab({ eventId, billingStatus }: { eventId: number; billingStatus: "draft" | "prescribed" }) {
    const [settlement, setSettlement] = useState<EventSettlement | null>(null);
    const [loading, setLoading] = useState(true);
    const isPrescribed = billingStatus === "prescribed";

    function load() {
        setLoading(true);
        getEventSettlement(eventId)
            .then(s => setSettlement(s))
            .finally(() => setLoading(false));
    }

    function silentReload() {
        getEventSettlement(eventId).then(s => setSettlement(s));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [eventId]);

    function handleAllocationsChanged(
        expenseId: number,
        newAllocs: { registrationId: number; amount: number }[],
        newMethod?: "with_coefficients" | "per_registration",
    ) {
        setSettlement(prev => {
            if (!prev) return prev;
            const allocMap = new Map(newAllocs.map(a => [a.registrationId, a.amount]));
            const newRegs = prev.registrations.map(reg => {
                const newExpenses = reg.expenses.map(e =>
                    e.expenseId === expenseId
                        ? { ...e, allocatedAmount: allocMap.get(reg.registrationId) ?? 0, ...(newMethod ? { allocationMethod: newMethod } : {}) }
                        : e
                );
                const perRegPart = newExpenses
                    .filter(e => e.allocationMethod === "per_registration" || e.allocationMethod === "with_coefficients")
                    .reduce((s, e) => s + e.allocatedAmount, 0);
                const expensesTotal = prev.unitPrice * reg.activePersonsCount + perRegPart;
                const subsidy = prev.totalMemberParticipants > 0
                    ? Math.round(prev.subsidyTotal * reg.memberCount / prev.totalMemberParticipants)
                    : 0;
                return { ...reg, expenses: newExpenses, expensesTotal, subsidy, totalAmount: Math.max(0, expensesTotal - subsidy) };
            });
            return { ...prev, registrations: newRegs, grandTotal: newRegs.reduce((s, r) => s + r.totalAmount, 0) };
        });
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Načítám…</span>
            </div>
        );
    }

    if (!settlement) {
        return <div className="py-8 text-center text-sm text-gray-400">Nepodařilo se načíst data.</div>;
    }

    const hasExpenses = settlement.finalExpenses.length > 0;

    return (
        <div className="space-y-4">
            {isPrescribed && (
                <div className="rounded-xl border border-[#327600]/20 bg-[#327600]/5 px-4 py-2.5 flex items-center gap-2">
                    <Check size={13} className="text-[#327600] shrink-0" />
                    <p className="text-xs text-[#327600]">Náklady jsou uzamčeny. Pro úpravy přejděte na záložku <strong>Platby</strong> a odemkněte.</p>
                </div>
            )}

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
                            onReload={silentReload}
                            disabled={isPrescribed}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
