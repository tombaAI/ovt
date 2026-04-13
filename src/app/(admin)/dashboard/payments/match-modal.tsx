"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmSingleAllocation } from "@/lib/actions/reconciliation";
import type { MemberMatchCandidate } from "@/lib/actions/reconciliation";

function formatAmount(amount: number) {
    return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 2 }).format(amount);
}

interface Props {
    ledgerId:   number;
    amount:     number;
    candidates: MemberMatchCandidate[];
    onSuccess:  () => void;
    onCancel:   () => void;
}

export function MatchModal({ ledgerId, amount, candidates, onSuccess, onCancel }: Props) {
    const [search,   setSearch]   = useState("");
    const [selected, setSelected] = useState<MemberMatchCandidate | null>(null);
    const [error,    setError]    = useState<string | null>(null);
    const [pending,  startTransition] = useTransition();

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return candidates;
        return candidates.filter(c =>
            c.fullName.toLowerCase().includes(q) ||
            String(c.variableSymbol ?? "").includes(q)
        );
    }, [search, candidates]);

    function handleConfirm() {
        if (!selected?.contribId) return;
        setError(null);
        startTransition(async () => {
            const res = await confirmSingleAllocation({
                ledgerId,
                contribId: selected.contribId!,
                memberId:  selected.memberId,
            });
            if ("error" in res) { setError(res.error); return; }
            onSuccess();
        });
    }

    return (
        <div className="space-y-4">
            {/* Vyhledávání */}
            <Input
                autoFocus
                placeholder="Hledat jméno nebo variabilní symbol…"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null); }}
            />

            {/* Seznam kandidátů */}
            <div className="max-h-72 overflow-y-auto rounded-xl border divide-y">
                {filtered.length === 0 && (
                    <p className="px-4 py-6 text-sm text-center text-muted-foreground">
                        Žádný člen nenalezen.
                    </p>
                )}
                {filtered.map(c => {
                    const isSelected = selected?.memberId === c.memberId;
                    const noContrib  = c.contribId === null;
                    return (
                        <button key={c.memberId}
                            onClick={() => !noContrib && setSelected(c)}
                            disabled={noContrib}
                            className={[
                                "w-full text-left px-4 py-3 transition-colors",
                                isSelected ? "bg-[#327600]/10" : "hover:bg-gray-50",
                                noContrib ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                            ].join(" ")}>
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <span className="font-medium text-sm">{c.fullName}</span>
                                    {c.variableSymbol && (
                                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                                            VS: {c.variableSymbol}
                                        </span>
                                    )}
                                </div>
                                <div className="text-right text-xs shrink-0">
                                    {noContrib ? (
                                        <span className="text-muted-foreground">bez předpisu</span>
                                    ) : (
                                        <>
                                            <p className="font-medium">
                                                zbývá {formatAmount(c.remaining ?? 0)}
                                            </p>
                                            <p className="text-muted-foreground">
                                                z {formatAmount(c.amountTotal ?? 0)}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Vybraný člen — shrnutí */}
            {selected && (
                <div className="rounded-xl border bg-[#327600]/5 border-[#327600]/20 px-4 py-3 text-sm">
                    <p className="font-medium">{selected.fullName}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                        Platba {formatAmount(amount)} →{" "}
                        předpis {formatAmount(selected.amountTotal ?? 0)},
                        zbývá {formatAmount(selected.remaining ?? 0)}
                    </p>
                    {amount > (selected.remaining ?? 0) && (
                        <p className="text-amber-600 text-xs mt-1">
                            Platba je vyšší než zbývající částka — bude přeplatek.
                        </p>
                    )}
                </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
                <Button
                    onClick={handleConfirm}
                    disabled={!selected?.contribId || pending}
                    className="bg-[#327600] hover:bg-[#2a6400]"
                >
                    {pending ? "Páruji…" : "Potvrdit párování"}
                </Button>
                <Button variant="outline" onClick={onCancel} disabled={pending}>
                    Zrušit
                </Button>
            </div>
        </div>
    );
}
