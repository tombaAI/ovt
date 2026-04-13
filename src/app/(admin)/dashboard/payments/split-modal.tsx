"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { splitPayment } from "@/lib/actions/reconciliation";
import type { MemberMatchCandidate } from "@/lib/actions/reconciliation";

function formatAmount(amount: number) {
    return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 2 }).format(amount);
}

interface SplitRow {
    id:         number;
    candidate:  MemberMatchCandidate | null;
    amount:     string;
    search:     string;
    showPicker: boolean;
}

interface Props {
    ledgerId:   number;
    total:      number;
    candidates: MemberMatchCandidate[];
    onSuccess:  () => void;
    onCancel:   () => void;
}

let nextId = 1;

export function SplitModal({ ledgerId, total, candidates, onSuccess, onCancel }: Props) {
    const [rows, setRows] = useState<SplitRow[]>([
        { id: nextId++, candidate: null, amount: "", search: "", showPicker: false },
        { id: nextId++, candidate: null, amount: "", search: "", showPicker: false },
    ]);
    const [error,   setError]   = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const partsTotal = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const diff       = Math.abs(partsTotal - total);
    const isValid    = diff <= 0.001 && rows.every(r => r.candidate?.contribId && parseFloat(r.amount) > 0);

    function updateRow(id: number, patch: Partial<SplitRow>) {
        setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    }

    function addRow() {
        setRows(prev => [...prev, { id: nextId++, candidate: null, amount: "", search: "", showPicker: false }]);
    }

    function removeRow(id: number) {
        setRows(prev => prev.filter(r => r.id !== id));
    }

    function handleSubmit() {
        setError(null);
        const parts = rows.map(r => ({
            contribId: r.candidate!.contribId!,
            memberId:  r.candidate!.memberId,
            amount:    parseFloat(r.amount),
        }));
        startTransition(async () => {
            const res = await splitPayment({ ledgerId, parts });
            if ("error" in res) { setError(res.error); return; }
            onSuccess();
        });
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Celková částka: <strong>{formatAmount(total)}</strong>. Rozdělte ji na části.
            </p>

            <div className="space-y-3">
                {rows.map((row, idx) => (
                    <div key={row.id} className="rounded-xl border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">Část {idx + 1}</span>
                            {rows.length > 2 && (
                                <button onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-600">
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>

                        {/* Výběr člena */}
                        {row.candidate ? (
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-[#327600]/5 border border-[#327600]/20 px-3 py-2">
                                <span className="text-sm font-medium">{row.candidate.fullName}</span>
                                <button
                                    onClick={() => updateRow(row.id, { candidate: null, search: "", showPicker: false })}
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                    změnit
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <Input
                                    placeholder="Hledat člena…"
                                    value={row.search}
                                    onChange={e => updateRow(row.id, { search: e.target.value, showPicker: true })}
                                    onFocus={() => updateRow(row.id, { showPicker: true })}
                                    className="h-8 text-sm"
                                />
                                {row.showPicker && row.search && (
                                    <CandidatePicker
                                        search={row.search}
                                        candidates={candidates}
                                        onSelect={c => updateRow(row.id, { candidate: c, showPicker: false })}
                                    />
                                )}
                            </div>
                        )}

                        {/* Částka */}
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Částka (Kč)"
                                value={row.amount}
                                onChange={e => updateRow(row.id, { amount: e.target.value })}
                                className="h-8 text-sm w-40"
                            />
                            {row.candidate?.remaining != null && (
                                <button
                                    onClick={() => updateRow(row.id, { amount: String(row.candidate!.remaining) })}
                                    className="text-xs text-[#327600] hover:underline"
                                >
                                    zbývá {formatAmount(row.candidate.remaining)}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-[#327600] hover:underline">
                <Plus size={14} /> Přidat část
            </button>

            {/* Součet */}
            <div className={`rounded-xl border px-4 py-2 text-sm flex items-center justify-between ${diff <= 0.001 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                <span className="text-muted-foreground">Součet částí</span>
                <span className={`font-semibold ${diff <= 0.001 ? "text-green-700" : "text-amber-600"}`}>
                    {formatAmount(partsTotal)}
                    {diff > 0.001 && ` (rozdíl ${formatAmount(diff)})`}
                </span>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
                <Button
                    onClick={handleSubmit}
                    disabled={!isValid || pending}
                    className="bg-[#327600] hover:bg-[#2a6400]"
                >
                    {pending ? "Ukládám…" : "Potvrdit rozdělení"}
                </Button>
                <Button variant="outline" onClick={onCancel} disabled={pending}>
                    Zrušit
                </Button>
            </div>
        </div>
    );
}

function CandidatePicker({ search, candidates, onSelect }: {
    search:     string;
    candidates: MemberMatchCandidate[];
    onSelect:   (c: MemberMatchCandidate) => void;
}) {
    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return candidates
            .filter(c => c.contribId !== null &&
                (c.fullName.toLowerCase().includes(q) || String(c.variableSymbol ?? "").includes(q)))
            .slice(0, 8);
    }, [search, candidates]);

    if (filtered.length === 0) return (
        <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">Žádný výsledek</div>
    );

    return (
        <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
            {filtered.map(c => (
                <button key={c.memberId}
                    onMouseDown={() => onSelect(c)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2">
                    <span className="text-sm">{c.fullName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                        zbývá {formatAmount(c.remaining ?? 0)}
                    </span>
                </button>
            ))}
        </div>
    );
}
