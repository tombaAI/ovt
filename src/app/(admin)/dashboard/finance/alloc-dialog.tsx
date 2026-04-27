"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Link2, AlertCircle } from "lucide-react";
import {
    getTjAllocations, createTjAllocation, deleteTjAllocation,
} from "@/lib/actions/finance-tj";
import type { TjAllocation, ContribOption, FinanceTjTransaction } from "@/lib/actions/finance-tj";

interface Props {
    tx:       FinanceTjTransaction;
    contribs: ContribOption[];          // všechny předpisy z page.tsx
    open:     boolean;
    onClose:  () => void;
}

function formatAmount(n: number | string): string {
    const v = typeof n === "string" ? parseFloat(n) : n;
    return v.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Kč";
}

// ── Automatické párování ───────────────────────────────────────────────────────

function normalize(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

interface SuggestionMatch {
    contrib:  ContribOption;
    reasons:  string[];   // ["VS 044", "jméno"]
}

function findSuggestions(tx: FinanceTjTransaction, contribs: ContribOption[]): SuggestionMatch[] {
    const desc    = normalize(tx.description);
    const txYear  = parseInt(tx.docDate.substring(0, 4));
    const txAmt   = parseFloat(tx.credit);
    const results: SuggestionMatch[] = [];

    for (const c of contribs) {
        if (c.year !== txYear) continue;
        if (c.amountTotal === null || Math.abs(c.amountTotal - txAmt) > 0.01) continue;

        const reasons: string[] = [];

        // Shoda VS: hledáme číslo (i s nulami vlevo) v popisu
        if (c.variableSymbol !== null) {
            const vs       = String(c.variableSymbol);
            const vsPadded = vs.padStart(3, "0");
            if (desc.includes(vs) || desc.includes(vsPadded)) {
                reasons.push(`VS ${vsPadded}`);
            }
        }

        // Shoda jménem: obě části jména musí být v popisu (bez diakritiky)
        const nameParts = normalize(c.memberName).split(" ").filter(Boolean);
        if (nameParts.length >= 2 && nameParts.every(p => desc.includes(p))) {
            if (!reasons.some(r => r === "jméno")) reasons.push("jméno");
        }

        if (reasons.length > 0) results.push({ contrib: c, reasons });
    }

    return results;
}

export function AllocDialog({ tx, contribs, open, onClose }: Props) {
    const credit = parseFloat(tx.credit);

    // ── Existující alokace ─────────────────────────────────────────────────────
    const [allocations, setAllocations] = useState<TjAllocation[] | null>(null);
    const [loadPending, startLoad]      = useTransition();
    const [savePending, startSave]      = useTransition();
    const [error, setError]             = useState<string | null>(null);

    // Lazy load alokací při otevření — useEffect, ne render (jinak spustí page transition)
    useEffect(() => {
        if (!open || allocations !== null) return;
        startLoad(async () => {
            try {
                setAllocations(await getTjAllocations(tx.id));
            } catch {
                setAllocations([]);
            }
        });
    }, [open, tx.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const allocatedTotal = allocations?.reduce((s, a) => s + parseFloat(a.amount), 0) ?? 0;
    const remaining      = credit - allocatedTotal;

    // ── Automatické návrhy ────────────────────────────────────────────────────
    const suggestions = useMemo(() => findSuggestions(tx, contribs), [tx, contribs]);

    function handleQuickAlloc(contrib: ContribOption) {
        setError(null);
        startSave(async () => {
            const res = await createTjAllocation({
                tjTransactionId: tx.id,
                contribId:       contrib.contribId,
                memberId:        contrib.memberId,
                amount:          parseFloat(tx.credit),
            });
            if ("error" in res) { setError(res.error); return; }
            try { setAllocations(await getTjAllocations(tx.id)); } catch { setAllocations([]); }
        });
    }

    // ── Formulář nové alokace ─────────────────────────────────────────────────
    const [memberFilter, setMemberFilter] = useState("");
    const [selectedContribId, setSelectedContribId] = useState<number | null>(null);
    const [amount, setAmount]             = useState(credit.toFixed(2));

    // Unikátní členové pro výběr
    const memberOptions = useMemo(() => {
        const seen = new Set<number>();
        return contribs
            .filter(c => {
                if (seen.has(c.memberId)) return false;
                seen.add(c.memberId);
                return true;
            })
            .sort((a, b) => a.memberName.localeCompare(b.memberName, "cs"));
    }, [contribs]);

    const filteredMembers = memberFilter.length >= 1
        ? memberOptions.filter(m => m.memberName.toLowerCase().includes(memberFilter.toLowerCase()))
        : memberOptions;

    const selectedContrib = contribs.find(c => c.contribId === selectedContribId);
    const selectedMemberId = selectedContrib?.memberId ?? null;

    // Předpisy vybraného člena (sestupně dle roku)
    const memberContribs = selectedMemberId
        ? contribs.filter(c => c.memberId === selectedMemberId).sort((a, b) => b.year - a.year)
        : [];

    function handleMemberSelect(memberId: number) {
        const memberName = memberOptions.find(m => m.memberId === memberId)?.memberName ?? "";
        setMemberFilter(memberName);
        // Automaticky vyber nejnovější předpis
        const latest = contribs
            .filter(c => c.memberId === memberId)
            .sort((a, b) => b.year - a.year)[0];
        if (latest) {
            setSelectedContribId(latest.contribId);
            setAmount(remaining > 0 ? Math.min(remaining, latest.amountTotal ?? remaining).toFixed(2) : (latest.amountTotal ?? 0).toFixed(2));
        }
    }

    function handleSave() {
        if (!selectedContribId || !selectedMemberId) return;
        const amt = parseFloat(amount);
        if (isNaN(amt) || amt <= 0) { setError("Zadejte platnou částku"); return; }
        setError(null);
        startSave(async () => {
            const res = await createTjAllocation({
                tjTransactionId: tx.id,
                contribId:       selectedContribId,
                memberId:        selectedMemberId,
                amount:          amt,
                note:            undefined,
            });
            if ("error" in res) { setError(res.error); return; }
            // Reload
            setAllocations(await getTjAllocations(tx.id));
            setSelectedContribId(null);
            setMemberFilter("");
        });
    }

    function handleDelete(allocationId: number) {
        startSave(async () => {
            await deleteTjAllocation(allocationId);
            setAllocations(await getTjAllocations(tx.id));
        });
    }

    function handleClose() {
        setAllocations(null);
        setSelectedContribId(null);
        setMemberFilter("");
        setError(null);
        onClose();
    }

    return (
        <Dialog open={open} onOpenChange={v => !v && handleClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Napárovat platbu na předpis příspěvků</DialogTitle>
                </DialogHeader>

                {/* Info o transakci */}
                <div className="rounded-md bg-gray-50 border px-3 py-2 text-sm space-y-1">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Doklad</span>
                        <span className="font-mono text-gray-700">{tx.docNumber}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Popis</span>
                        <span className="text-gray-800">{tx.description}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Celková částka</span>
                        <span className="text-green-700 font-semibold">{formatAmount(credit)}</span>
                    </div>
                    {allocatedTotal > 0 && (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Zbývá napárovat</span>
                            <span className={remaining > 0 ? "text-amber-700 font-medium" : "text-green-700"}>
                                {formatAmount(remaining)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Automatické návrhy — zobrazit pokud ještě nic není napárováno */}
                {suggestions.length > 0 && remaining > 0.005 && !loadPending && (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-[#327600] uppercase tracking-wide">Automatický návrh</p>
                        {suggestions.map(s => (
                            <div key={s.contrib.contribId}
                                className="flex items-center justify-between gap-3 rounded-md border border-[#327600]/30 bg-green-50/60 px-3 py-2">
                                <div className="text-sm min-w-0">
                                    <span className="font-medium text-gray-900">{s.contrib.memberName}</span>
                                    <span className="text-gray-400 mx-1.5">·</span>
                                    <span className="text-gray-600">{s.contrib.year}</span>
                                    {s.contrib.amountTotal && (
                                        <>
                                            <span className="text-gray-400 mx-1.5">·</span>
                                            <span className="text-green-700 font-medium">{formatAmount(s.contrib.amountTotal)}</span>
                                        </>
                                    )}
                                    <div className="text-xs text-gray-400 mt-0.5">
                                        Shoda: {s.reasons.join(", ")}
                                    </div>
                                </div>
                                <Button size="sm" className="shrink-0 h-7 text-xs gap-1 bg-[#327600] hover:bg-[#265c00]"
                                    disabled={savePending}
                                    onClick={() => handleQuickAlloc(s.contrib)}>
                                    {savePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                                    Napárovat
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Existující alokace */}
                {loadPending && <p className="text-sm text-gray-400 text-center py-2">Načítám…</p>}
                {allocations && allocations.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Napárováno</p>
                        {allocations.map(a => (
                            <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                                <div>
                                    <span className="font-medium text-gray-800">{a.memberName}</span>
                                    <span className="text-gray-400 ml-2">·</span>
                                    <span className="text-gray-500 ml-2">{a.year}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-green-700 font-medium tabular-nums">{formatAmount(a.amount)}</span>
                                    <button
                                        onClick={() => handleDelete(a.id)}
                                        disabled={savePending}
                                        className="text-gray-400 hover:text-red-600 transition-colors"
                                        title="Odebrat"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Nová alokace */}
                {remaining > 0.005 && (
                    <div className="space-y-3 border-t pt-3">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Přidat napárování</p>

                        {/* Výběr člena */}
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Člen</label>
                            <input
                                type="text"
                                value={memberFilter}
                                onChange={e => { setMemberFilter(e.target.value); setSelectedContribId(null); }}
                                placeholder="Hledat podle jména…"
                                className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#327600]/30"
                            />
                            {memberFilter.length >= 1 && !selectedMemberId && (
                                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-white shadow-sm">
                                    {filteredMembers.length === 0
                                        ? <p className="px-3 py-2 text-sm text-gray-400">Nic nenalezeno</p>
                                        : filteredMembers.map(m => (
                                            <button
                                                key={m.memberId}
                                                onClick={() => handleMemberSelect(m.memberId)}
                                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                                            >
                                                {m.memberName}
                                            </button>
                                        ))
                                    }
                                </div>
                            )}
                        </div>

                        {/* Výběr roku / předpisu */}
                        {memberContribs.length > 0 && (
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Předpis příspěvků</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {memberContribs.map(c => (
                                        <button
                                            key={c.contribId}
                                            onClick={() => setSelectedContribId(c.contribId)}
                                            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                                selectedContribId === c.contribId
                                                    ? "bg-[#327600] text-white border-[#327600]"
                                                    : "bg-white text-gray-600 border-gray-200 hover:border-[#327600]"
                                            }`}
                                        >
                                            {c.year}
                                            {c.amountTotal && <span className="ml-1 opacity-70">{formatAmount(c.amountTotal)}</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Částka */}
                        {selectedContribId && (
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Částka (Kč)</label>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    step="0.01"
                                    min="0.01"
                                    className="w-40 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#327600]/30"
                                />
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-1.5 text-sm text-red-700">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                {error}
                            </div>
                        )}

                        <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={!selectedContribId || savePending}
                            onClick={handleSave}
                        >
                            {savePending
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Link2 className="h-3.5 w-3.5" />
                            }
                            Napárovat
                        </Button>
                    </div>
                )}

                {allocations && allocations.length > 0 && remaining <= 0.005 && (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
                        <Badge className="bg-green-600 text-white text-xs">Plně napárováno</Badge>
                        Celá částka je přiřazena.
                    </div>
                )}

                <div className="flex justify-end pt-1">
                    <Button variant="ghost" size="sm" onClick={handleClose}>Zavřít</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
