"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Link2, AlertCircle, Calendar } from "lucide-react";
import {
    getTjAllocations, createTjAllocation, deleteTjAllocation,
    createTjEventAllocation, getEventPrescriptionsForAllocation,
} from "@/lib/actions/finance-tj";
import type {
    TjAllocation, ContribOption, FinanceTjTransaction, EventPrescriptionOption,
} from "@/lib/actions/finance-tj";

interface Props {
    tx:       FinanceTjTransaction;
    contribs: ContribOption[];
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

// VS musí být jako samostatné číslo — nesmí být součástí delšího čísla
function vsMatchesDesc(vs: number, desc: string): boolean {
    const vsStr = String(vs);
    return new RegExp(`(?:^|[^0-9])0*${vsStr}(?:$|[^0-9])`).test(desc);
}

type ContribSuggestion = { kind: "contrib"; contrib: ContribOption; reasons: string[]; score: number };
type EventSuggestion   = { kind: "event";  presc: EventPrescriptionOption; confidence: number; amountMatch: boolean };


function findContribSuggestions(tx: FinanceTjTransaction, contribs: ContribOption[]): ContribSuggestion[] {
    const desc    = normalize(tx.description);
    const txYear  = parseInt(tx.docDate.substring(0, 4));
    const txAmt   = parseFloat(tx.credit);
    const results: ContribSuggestion[] = [];

    for (const c of contribs) {
        if (c.year !== txYear) continue;
        if (c.amountTotal === null || Math.abs(c.amountTotal - txAmt) > 0.01) continue;
        if (c.allocatedAmount >= c.amountTotal - 0.01) continue;

        const vsMatch   = c.variableSymbol !== null && vsMatchesDesc(c.variableSymbol, desc);
        const nameParts = normalize(c.memberName).split(" ").filter(Boolean);
        const nameMatch = nameParts.length >= 2 && nameParts.every(p => desc.includes(p));

        if (!vsMatch && !nameMatch) continue;
        const reasons: string[] = [];
        if (vsMatch)   reasons.push(`VS ${String(c.variableSymbol).padStart(3, "0")}`);
        if (nameMatch) reasons.push("jméno");
        const score = (vsMatch ? 1 : 0) + (nameMatch ? 2 : 0);
        results.push({ kind: "contrib", contrib: c, reasons, score });
    }
    if (results.length === 0) return [];
    const maxScore = Math.max(...results.map(r => r.score));
    return results.filter(r => r.score === maxScore);
}

function findEventSuggestions(tx: FinanceTjTransaction, prescs: EventPrescriptionOption[]): EventSuggestion[] {
    const desc  = normalize(tx.description);
    const txAmt = parseFloat(tx.credit);

    // 100% shoda: "207XXC[code]" — celý pattern TJ oddílu
    const fullMatch  = /207\d{2}[a-z](\d+)/i.exec(desc);
    const codeFromFull  = fullMatch  ? parseInt(fullMatch[1])  : null;
    // 95% shoda: "C[code]" jako samostatný token
    const shortMatch = /(?:^|[^0-9a-z])c(\d+)(?:$|[^0-9])/i.exec(desc);
    const codeFromShort = shortMatch ? parseInt(shortMatch[1]) : null;

    const results: EventSuggestion[] = [];
    for (const p of prescs) {
        if (p.status === "paid" || p.status === "cancelled") continue;
        const fullHit  = codeFromFull  !== null && p.prescriptionCode === codeFromFull;
        const shortHit = !fullHit && codeFromShort !== null && p.prescriptionCode === codeFromShort;
        if (!fullHit && !shortHit) continue;
        const amountMatch = Math.abs(parseFloat(p.amount) - txAmt) < 0.01;
        results.push({ kind: "event", presc: p, confidence: fullHit ? 100 : 95, amountMatch });
    }
    return results;
}

// ── Zobrazení existující alokace ──────────────────────────────────────────────

function AllocationRow({ a, onDelete, disabled }: { a: TjAllocation; onDelete: () => void; disabled: boolean }) {
    const label = a.contribId
        ? `${a.memberName} · ${a.year}`
        : `${a.registrantName} — ${a.eventName} (kód ${a.prescriptionCode})`;
    const icon  = a.contribId ? null : <Calendar className="h-3 w-3 inline mr-1 text-blue-500" />;
    return (
        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
            <div className="min-w-0">
                <span className="font-medium text-gray-800">{icon}{label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-green-700 font-medium tabular-nums">{formatAmount(a.amount)}</span>
                <button onClick={onDelete} disabled={disabled}
                    className="text-gray-400 hover:text-red-600 transition-colors" title="Odebrat">
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}

// ── Hlavní dialog ─────────────────────────────────────────────────────────────

export function AllocDialog({ tx, contribs, open, onClose }: Props) {
    const credit = parseFloat(tx.credit);

    const [allocations, setAllocations] = useState<TjAllocation[] | null>(null);
    const [eventPrescs, setEventPrescs] = useState<EventPrescriptionOption[] | null>(null);
    const [loadPending, startLoad]      = useTransition();
    const [savePending, startSave]      = useTransition();
    const [error, setError]             = useState<string | null>(null);

    // Lazy load při otevření
    useEffect(() => {
        if (!open) return;
        if (allocations === null) {
            startLoad(async () => {
                try { setAllocations(await getTjAllocations(tx.id)); } catch { setAllocations([]); }
            });
        }
        if (eventPrescs === null) {
            startLoad(async () => {
                try { setEventPrescs(await getEventPrescriptionsForAllocation()); } catch { setEventPrescs([]); }
            });
        }
    }, [open, tx.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const allocatedTotal = allocations?.reduce((s, a) => s + parseFloat(a.amount), 0) ?? 0;
    const remaining      = credit - allocatedTotal;

    // ── Automatické návrhy ────────────────────────────────────────────────────
    const contribSuggestions = useMemo(() => findContribSuggestions(tx, contribs), [tx, contribs]);
    const eventSuggestions   = useMemo(
        () => eventPrescs ? findEventSuggestions(tx, eventPrescs) : [],
        [tx, eventPrescs]
    );
    const hasSuggestions = (contribSuggestions.length > 0 || eventSuggestions.length > 0) && remaining > 0.005;

    function handleQuickAlloc(contrib: ContribOption) {
        setError(null);
        startSave(async () => {
            const res = await createTjAllocation({ tjTransactionId: tx.id, contribId: contrib.contribId, memberId: contrib.memberId, amount: parseFloat(tx.credit), sendEmail });
            if ("error" in res) { setError(res.error); return; }
            try { setAllocations(await getTjAllocations(tx.id)); } catch { setAllocations([]); }
        });
    }

    function handleQuickEventAlloc(presc: EventPrescriptionOption) {
        setError(null);
        startSave(async () => {
            const res = await createTjEventAllocation({ tjTransactionId: tx.id, prescriptionId: presc.prescriptionId, amount: parseFloat(tx.credit), sendEmail });
            if ("error" in res) { setError(res.error); return; }
            try {
                const [a, e] = await Promise.all([getTjAllocations(tx.id), getEventPrescriptionsForAllocation()]);
                setAllocations(a); setEventPrescs(e);
            } catch { setAllocations([]); }
        });
    }

    function handleDelete(allocationId: number) {
        setError(null);
        startSave(async () => {
            const res = await deleteTjAllocation(allocationId);
            if ("error" in res) { setError(res.error); return; }
            try {
                const [a, e] = await Promise.all([getTjAllocations(tx.id), getEventPrescriptionsForAllocation()]);
                setAllocations(a); setEventPrescs(e);
            } catch { setAllocations([]); }
        });
    }

    // ── E-mail opt-out ────────────────────────────────────────────────────────
    const [sendEmail, setSendEmail] = useState(true);

    // ── Manuální formulář ─────────────────────────────────────────────────────
    const [mode, setMode] = useState<"contrib" | "event">("contrib");

    // Příspěvky
    const [memberFilter, setMemberFilter]           = useState("");
    const [selectedMemberId, setSelectedMemberId]   = useState<number | null>(null);
    const [selectedContribId, setSelectedContribId] = useState<number | null>(null);
    const [amount, setAmount]                       = useState(credit.toFixed(2));

    // Akce
    const [eventFilter, setEventFilter]               = useState("");
    const [selectedPrescId, setSelectedPrescId]       = useState<number | null>(null);
    const [eventAmount, setEventAmount]               = useState(credit.toFixed(2));

    const memberOptions = useMemo(() => {
        const seen = new Set<number>();
        return contribs.filter(c => { if (seen.has(c.memberId)) return false; seen.add(c.memberId); return true; })
            .sort((a, b) => a.memberName.localeCompare(b.memberName, "cs"));
    }, [contribs]);

    const filteredMembers = memberFilter.length >= 1
        ? memberOptions.filter(m => m.memberName.toLowerCase().includes(memberFilter.toLowerCase()))
        : memberOptions;

    const memberContribs = selectedMemberId
        ? contribs.filter(c => c.memberId === selectedMemberId)
            .filter(c => c.amountTotal === null || c.allocatedAmount < c.amountTotal - 0.01)
            .sort((a, b) => b.year - a.year)
        : [];
    const memberFullyPaid = selectedMemberId !== null && memberContribs.length === 0;

    function handleMemberSelect(memberId: number) {
        const memberName = memberOptions.find(m => m.memberId === memberId)?.memberName ?? "";
        setMemberFilter(memberName);
        setSelectedMemberId(memberId);
        setSelectedContribId(null);
        const latest = contribs.filter(c => c.memberId === memberId)
            .filter(c => c.amountTotal === null || c.allocatedAmount < c.amountTotal - 0.01)
            .sort((a, b) => b.year - a.year)[0];
        if (latest) {
            setSelectedContribId(latest.contribId);
            setAmount(remaining > 0 ? Math.min(remaining, latest.amountTotal ?? remaining).toFixed(2) : (latest.amountTotal ?? 0).toFixed(2));
        }
    }

    // Akce filtr
    const filteredPrescs = useMemo(() => {
        if (!eventPrescs) return [];
        const q = eventFilter.toLowerCase();
        return eventPrescs.filter(p =>
            p.status !== "paid" && p.status !== "cancelled" &&
            (q.length === 0 || p.registrantName.toLowerCase().includes(q) || p.eventName.toLowerCase().includes(q) || String(p.prescriptionCode).includes(q))
        );
    }, [eventPrescs, eventFilter]);

    function handleSaveContrib() {
        if (!selectedContribId || !selectedMemberId) return;
        const amt = parseFloat(amount);
        if (isNaN(amt) || amt <= 0) { setError("Zadejte platnou částku"); return; }
        setError(null);
        startSave(async () => {
            const res = await createTjAllocation({ tjTransactionId: tx.id, contribId: selectedContribId, memberId: selectedMemberId, amount: amt, sendEmail });
            if ("error" in res) { setError(res.error); return; }
            try { setAllocations(await getTjAllocations(tx.id)); } catch { setAllocations([]); }
            setSelectedContribId(null); setMemberFilter(""); setSelectedMemberId(null);
        });
    }

    function handleSaveEvent() {
        if (!selectedPrescId) return;
        const amt = parseFloat(eventAmount);
        if (isNaN(amt) || amt <= 0) { setError("Zadejte platnou částku"); return; }
        setError(null);
        startSave(async () => {
            const res = await createTjEventAllocation({ tjTransactionId: tx.id, prescriptionId: selectedPrescId, amount: amt, sendEmail });
            if ("error" in res) { setError(res.error); return; }
            try {
                const [a, e] = await Promise.all([getTjAllocations(tx.id), getEventPrescriptionsForAllocation()]);
                setAllocations(a); setEventPrescs(e);
            } catch { setAllocations([]); }
            setSelectedPrescId(null); setEventFilter("");
        });
    }

    function handleClose() {
        setAllocations(null); setEventPrescs(null);
        setSelectedContribId(null); setSelectedMemberId(null); setMemberFilter("");
        setSelectedPrescId(null); setEventFilter("");
        setError(null); onClose();
    }

    return (
        <Dialog open={open} onOpenChange={v => !v && handleClose()}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Napárovat platbu na předpis příspěvků</DialogTitle>
                </DialogHeader>

                {/* Info o transakci */}
                <div className="rounded-md bg-gray-50 border px-3 py-2 text-sm space-y-1">
                    <div className="flex justify-between gap-2">
                        <span className="text-gray-500">Doklad</span>
                        <span className="font-mono text-gray-700">{tx.docNumber}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                        <span className="text-gray-500">Popis</span>
                        <span className="text-gray-800 text-right max-w-[280px]">{tx.description}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                        <span className="text-gray-500">Celková částka</span>
                        <span className="text-green-700 font-semibold">{formatAmount(credit)}</span>
                    </div>
                    {allocatedTotal > 0 && (
                        <div className="flex justify-between gap-2">
                            <span className="text-gray-500">Zbývá napárovat</span>
                            <span className={remaining > 0 ? "text-amber-700 font-medium" : "text-green-700"}>
                                {formatAmount(remaining)}
                            </span>
                        </div>
                    )}
                </div>

                {/* E-mail opt-out — globální, nad všemi akcemi */}
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={sendEmail}
                        onChange={e => setSendEmail(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-[#327600] focus:ring-[#327600]/30"
                    />
                    Odeslat potvrzovací e-mail po napárování
                </label>

                {/* Automatické návrhy */}
                {hasSuggestions && !loadPending && (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-[#327600] uppercase tracking-wide">Automatický návrh</p>

                        {contribSuggestions.map(s => (
                            <div key={s.contrib.contribId}
                                className="flex items-center justify-between gap-3 rounded-md border border-[#327600]/30 bg-green-50/60 px-3 py-2">
                                <div className="text-sm min-w-0">
                                    <span className="font-medium text-gray-900">{s.contrib.memberName}</span>
                                    <span className="text-gray-400 mx-1.5">·</span>
                                    <span className="text-gray-600">{s.contrib.year}</span>
                                    {s.contrib.amountTotal && (
                                        <><span className="text-gray-400 mx-1.5">·</span>
                                        <span className="text-green-700 font-medium">{formatAmount(s.contrib.amountTotal)}</span></>
                                    )}
                                    <div className="text-xs text-gray-400 mt-0.5">Příspěvek · Shoda: {s.reasons.join(", ")}</div>
                                </div>
                                <Button size="sm" className="shrink-0 h-7 text-xs gap-1 bg-[#327600] hover:bg-[#265c00]"
                                    disabled={savePending} onClick={() => handleQuickAlloc(s.contrib)}>
                                    {savePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                                    Napárovat
                                </Button>
                            </div>
                        ))}

                        {eventSuggestions.map(s => (
                            <div key={s.presc.prescriptionId}
                                className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2">
                                <div className="text-sm min-w-0">
                                    <span className="font-medium text-gray-900">{s.presc.registrantName}</span>
                                    <span className="text-gray-400 mx-1.5">—</span>
                                    <span className="text-gray-700">{s.presc.eventName}</span>
                                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                                        <span>Záloha/platba za akci · kód {s.presc.prescriptionCode} ({s.confidence}%)</span>
                                        {!s.amountMatch && <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-normal">Různá částka</Badge>}
                                    </div>
                                </div>
                                <Button size="sm" className="shrink-0 h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700"
                                    disabled={savePending} onClick={() => handleQuickEventAlloc(s.presc)}>
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
                            <AllocationRow key={a.id} a={a} disabled={savePending} onDelete={() => handleDelete(a.id)} />
                        ))}
                    </div>
                )}

                {/* Manuální párování */}
                {remaining > 0.005 && (
                    <div className="space-y-3 border-t pt-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Přidat napárování</p>
                            <div className="flex rounded-md border overflow-hidden text-xs">
                                <button onClick={() => { setMode("contrib"); setError(null); }}
                                    className={`px-3 py-1 ${mode === "contrib" ? "bg-[#327600] text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                                    Příspěvek
                                </button>
                                <button onClick={() => { setMode("event"); setError(null); }}
                                    className={`px-3 py-1 border-l ${mode === "event" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                                    Akce
                                </button>
                            </div>
                        </div>

                        {mode === "contrib" && (
                            <>
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">Člen</label>
                                    <input type="text" value={memberFilter}
                                        onChange={e => { setMemberFilter(e.target.value); setSelectedContribId(null); setSelectedMemberId(null); }}
                                        placeholder="Hledat podle jména…"
                                        className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#327600]/30" />
                                    {memberFilter.length >= 1 && !selectedMemberId && (
                                        <div className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-white shadow-sm">
                                            {filteredMembers.length === 0
                                                ? <p className="px-3 py-2 text-sm text-gray-400">Nic nenalezeno</p>
                                                : filteredMembers.map(m => (
                                                    <button key={m.memberId} onClick={() => handleMemberSelect(m.memberId)}
                                                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">
                                                        {m.memberName}
                                                    </button>
                                                ))
                                            }
                                        </div>
                                    )}
                                </div>

                                {memberFullyPaid && (
                                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                        Tomuto členovi jsou všechny předpisy příspěvků za rok s touto částkou již napárovány.
                                        Nelze přidat další platbu — součet by neseděl.
                                    </p>
                                )}

                                {memberContribs.length > 0 && (
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1 block">Předpis příspěvků</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {memberContribs.map(c => (
                                                <button key={c.contribId} onClick={() => setSelectedContribId(c.contribId)}
                                                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${selectedContribId === c.contribId ? "bg-[#327600] text-white border-[#327600]" : "bg-white text-gray-600 border-gray-200 hover:border-[#327600]"}`}>
                                                    {c.year}
                                                    {c.amountTotal && <span className="ml-1 opacity-70">{formatAmount(c.amountTotal)}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedContribId && (
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1 block">Částka (Kč)</label>
                                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                                            step="0.01" min="0.01"
                                            className="w-40 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#327600]/30" />
                                    </div>
                                )}

                                {!memberFullyPaid && (
                                    <Button size="sm" className="gap-1.5" disabled={!selectedContribId || savePending} onClick={handleSaveContrib}>
                                        {savePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                                        Napárovat
                                    </Button>
                                )}
                            </>
                        )}

                        {mode === "event" && (
                            <>
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">Hledat předpis platby za akci</label>
                                    <input type="text" value={eventFilter}
                                        onChange={e => { setEventFilter(e.target.value); setSelectedPrescId(null); }}
                                        placeholder="Jméno přihlášeného, název akce nebo kód…"
                                        className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                                    {eventFilter.length >= 1 && !selectedPrescId && (
                                        <div className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-white shadow-sm">
                                            {filteredPrescs.length === 0
                                                ? <p className="px-3 py-2 text-sm text-gray-400">Nic nenalezeno</p>
                                                : filteredPrescs.map(p => (
                                                    <button key={p.prescriptionId}
                                                        onClick={() => { setSelectedPrescId(p.prescriptionId); setEventAmount(parseFloat(p.amount).toFixed(2)); setEventFilter(p.registrantName); }}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0">
                                                        <div className="font-medium">{p.registrantName}</div>
                                                        <div className="text-xs text-gray-500">{p.eventName} · kód {p.prescriptionCode} · {formatAmount(p.amount)}</div>
                                                    </button>
                                                ))
                                            }
                                        </div>
                                    )}
                                </div>

                                {selectedPrescId && (() => {
                                    const p = eventPrescs?.find(x => x.prescriptionId === selectedPrescId);
                                    return p ? (
                                        <>
                                            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm">
                                                <div className="font-medium text-gray-900">{p.registrantName}</div>
                                                <div className="text-xs text-gray-600">{p.eventName} · kód {p.prescriptionCode}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">Předpis: {formatAmount(p.amount)}</div>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">Částka (Kč)</label>
                                                <input type="number" value={eventAmount} onChange={e => setEventAmount(e.target.value)}
                                                    step="0.01" min="0.01"
                                                    className="w-40 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                                            </div>
                                        </>
                                    ) : null;
                                })()}

                                <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                                    disabled={!selectedPrescId || savePending} onClick={handleSaveEvent}>
                                    {savePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                                    Napárovat
                                </Button>
                            </>
                        )}

                        {error && (
                            <div className="flex items-center gap-1.5 text-sm text-red-700">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                {error}
                            </div>
                        )}
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
