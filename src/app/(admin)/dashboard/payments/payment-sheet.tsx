"use client";

import { useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    confirmSingleAllocation,
    unmatchPayment,
    ignorePayment,
    runAutoMatchAll,
    loadMembersForMatch,
} from "@/lib/actions/reconciliation";
import { MatchModal } from "./match-modal";
import { SplitModal } from "./split-modal";
import type { LedgerRow, MemberMatchCandidate } from "@/lib/actions/reconciliation";

const STATUS_LABELS: Record<string, string> = {
    unmatched: "Nespárováno",
    suggested: "Ke kontrole",
    confirmed: "Potvrzeno",
    ignored:   "Ignorováno",
};

const STATUS_BADGE: Record<string, string> = {
    unmatched: "bg-gray-100 text-gray-600",
    suggested: "bg-blue-100 text-blue-700",
    confirmed: "bg-green-100 text-green-800",
    ignored:   "bg-amber-100 text-amber-700",
};

const SOURCE_LABELS: Record<string, string> = {
    fio_bank:    "Fio banka",
    file_import: "Bankovní soubor",
    cash:        "Hotovost",
};

function formatAmount(amount: number) {
    return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 2 }).format(amount);
}

type PanelMode = "detail" | "match" | "split" | "ignore";

interface Props {
    row:       LedgerRow;
    year:      number;
    onClose:   () => void;
    onUpdated: () => void;
}

export function PaymentSheet({ row, year, onClose, onUpdated }: Props) {
    const [mode,       setMode]       = useState<PanelMode>("detail");
    const [candidates, setCandidates] = useState<MemberMatchCandidate[] | null>(null);
    const [ignoreNote, setIgnoreNote] = useState("");
    const [error,      setError]      = useState<string | null>(null);
    const [pending,    startTransition] = useTransition();

    const status = row.reconciliationStatus;

    function loadCandidatesAndOpen(nextMode: "match" | "split") {
        setError(null);
        startTransition(async () => {
            const list = await loadMembersForMatch(year);
            setCandidates(list);
            setMode(nextMode);
        });
    }

    function handleConfirmSuggested() {
        const alloc = row.allocations[0];
        if (!alloc) return;
        setError(null);
        startTransition(async () => {
            const res = await confirmSingleAllocation({
                ledgerId:  row.id,
                contribId: alloc.contribId,
                memberId:  alloc.memberId,
            });
            if ("error" in res) { setError(res.error); return; }
            onUpdated();
        });
    }

    function handleUnmatch() {
        if (!confirm("Opravdu odpárovat tuto platbu? Alokace budou smazány.")) return;
        setError(null);
        startTransition(async () => {
            const res = await unmatchPayment(row.id);
            if ("error" in res) { setError(res.error); return; }
            onUpdated();
        });
    }

    function handleIgnore() {
        setError(null);
        startTransition(async () => {
            const res = await ignorePayment(row.id, ignoreNote.trim() || null);
            if ("error" in res) { setError(res.error); return; }
            onUpdated();
        });
    }

    function handleAutoMatch() {
        setError(null);
        startTransition(async () => {
            await runAutoMatchAll();
            onUpdated();
        });
    }

    return (
        <Sheet open onOpenChange={open => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto px-5 pb-8">
                <SheetHeader className="px-0 pt-5 pb-4">
                    <SheetTitle className="flex items-center gap-2">
                        Platba {formatAmount(row.amount)}
                        <Badge className={`text-xs font-normal ${STATUS_BADGE[status]}`}>
                            {STATUS_LABELS[status]}
                        </Badge>
                    </SheetTitle>
                </SheetHeader>

                {mode === "detail" && (
                    <DetailPanel
                        row={row}
                        year={year}
                        error={error}
                        pending={pending}
                        ignoreNote={ignoreNote}
                        setIgnoreNote={setIgnoreNote}
                        onMatch={() => loadCandidatesAndOpen("match")}
                        onSplit={() => loadCandidatesAndOpen("split")}
                        onConfirmSuggested={handleConfirmSuggested}
                        onUnmatch={handleUnmatch}
                        onIgnoreOpen={() => setMode("ignore")}
                        onAutoMatch={handleAutoMatch}
                    />
                )}

                {mode === "ignore" && (
                    <div className="space-y-4">
                        <p className="text-sm">Platba bude označena jako ignorovaná. Bude viditelná v historii.</p>
                        <div className="space-y-1.5">
                            <Label>Poznámka (volitelné)</Label>
                            <Textarea
                                rows={3}
                                value={ignoreNote}
                                onChange={e => setIgnoreNote(e.target.value)}
                                placeholder="Proč se tato platba ignoruje…"
                            />
                        </div>
                        {error && <p className="text-sm text-red-600">{error}</p>}
                        <div className="flex gap-3">
                            <Button onClick={handleIgnore} disabled={pending} variant="destructive">
                                {pending ? "Ukládám…" : "Ignorovat platbu"}
                            </Button>
                            <Button variant="outline" onClick={() => setMode("detail")}>Zpět</Button>
                        </div>
                    </div>
                )}

                {mode === "match" && candidates && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Vybrat člena pro párování</p>
                            <button onClick={() => setMode("detail")} className="text-xs text-muted-foreground hover:text-foreground">
                                ← Zpět
                            </button>
                        </div>
                        <MatchModal
                            ledgerId={row.id}
                            amount={row.amount}
                            candidates={candidates}
                            onSuccess={onUpdated}
                            onCancel={() => setMode("detail")}
                        />
                    </div>
                )}

                {mode === "split" && candidates && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Rozdělit platbu na více předpisů</p>
                            <button onClick={() => setMode("detail")} className="text-xs text-muted-foreground hover:text-foreground">
                                ← Zpět
                            </button>
                        </div>
                        <SplitModal
                            ledgerId={row.id}
                            total={row.amount}
                            candidates={candidates}
                            onSuccess={onUpdated}
                            onCancel={() => setMode("detail")}
                        />
                    </div>
                )}

                {pending && mode === "detail" && (
                    <p className="text-xs text-muted-foreground mt-2">Probíhá…</p>
                )}
            </SheetContent>
        </Sheet>
    );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ row, year, error, pending, ignoreNote, setIgnoreNote,
    onMatch, onSplit, onConfirmSuggested, onUnmatch, onIgnoreOpen, onAutoMatch,
}: {
    row:               LedgerRow;
    year:              number;
    error:             string | null;
    pending:           boolean;
    ignoreNote:        string;
    setIgnoreNote:     (v: string) => void;
    onMatch:           () => void;
    onSplit:           () => void;
    onConfirmSuggested:() => void;
    onUnmatch:         () => void;
    onIgnoreOpen:      () => void;
    onAutoMatch:       () => void;
}) {
    const status = row.reconciliationStatus;
    void year; void ignoreNote; void setIgnoreNote;

    return (
        <div className="space-y-5">
            {/* Základní info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                    <p className="text-xs text-muted-foreground">Datum</p>
                    <p className="font-medium">{row.paidAt}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Částka</p>
                    <p className="font-semibold text-green-700">{formatAmount(row.amount)}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Variabilní symbol</p>
                    <p className="font-mono">{row.variableSymbol ?? "—"}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Zdroj</p>
                    <p>{SOURCE_LABELS[row.sourceType] ?? row.sourceType}</p>
                </div>
                {row.counterpartyName && (
                    <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Protistrana</p>
                        <p>{row.counterpartyName}</p>
                        {row.counterpartyAccount && (
                            <p className="text-xs text-muted-foreground font-mono">{row.counterpartyAccount}</p>
                        )}
                    </div>
                )}
                {row.message && (
                    <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Zpráva</p>
                        <p className="text-sm">{row.message}</p>
                    </div>
                )}
                {row.note && (
                    <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Poznámka</p>
                        <p className="text-sm italic">{row.note}</p>
                    </div>
                )}
            </div>

            {/* Alokace */}
            {row.allocations.length > 0 && (
                <div>
                    <p className="text-sm font-semibold mb-2">
                        {status === "suggested" ? "Navrhované párování" : "Párování"}
                    </p>
                    <div className="rounded-xl border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b text-xs text-muted-foreground">
                                    <th className="text-left px-3 py-1.5 font-medium">Člen</th>
                                    <th className="text-right px-3 py-1.5 font-medium">Částka</th>
                                    <th className="text-left px-3 py-1.5 font-medium">Potvrdil</th>
                                </tr>
                            </thead>
                            <tbody>
                                {row.allocations.map(a => (
                                    <tr key={a.id} className="border-b last:border-0">
                                        <td className="px-3 py-2 font-medium">{a.memberName}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatAmount(a.amount)}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground">
                                            {a.isSuggested ? (
                                                <Badge className="bg-blue-100 text-blue-700 border-0 text-xs font-normal">
                                                    auto-návrh
                                                </Badge>
                                            ) : (
                                                a.confirmedBy ?? "—"
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* Akce podle stavu */}
            <div className="border-t pt-4 space-y-3">
                {status === "unmatched" && (
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={onMatch} disabled={pending} className="bg-[#327600] hover:bg-[#2a6400]">
                            Spárovat ručně
                        </Button>
                        <Button onClick={onSplit} disabled={pending} variant="outline">
                            Rozdělit
                        </Button>
                        <Button onClick={onAutoMatch} disabled={pending} variant="outline" size="sm">
                            {pending ? "Hledám…" : "Zkusit auto-match"}
                        </Button>
                        <Button onClick={onIgnoreOpen} disabled={pending} variant="outline" size="sm"
                            className="text-amber-600 border-amber-200 hover:bg-amber-50">
                            Ignorovat
                        </Button>
                    </div>
                )}

                {status === "suggested" && (
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={onConfirmSuggested} disabled={pending} className="bg-[#327600] hover:bg-[#2a6400]">
                            {pending ? "Potvrzuji…" : "Potvrdit párování"}
                        </Button>
                        <Button onClick={onMatch} disabled={pending} variant="outline">
                            Jiný člen…
                        </Button>
                        <Button onClick={onSplit} disabled={pending} variant="outline">
                            Rozdělit
                        </Button>
                        <Button onClick={onIgnoreOpen} disabled={pending} variant="outline" size="sm"
                            className="text-amber-600 border-amber-200 hover:bg-amber-50">
                            Ignorovat
                        </Button>
                    </div>
                )}

                {status === "confirmed" && (
                    <Button onClick={onUnmatch} disabled={pending} variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50">
                        {pending ? "Odpárovávám…" : "Odpárovat"}
                    </Button>
                )}

                {status === "ignored" && (
                    <Button onClick={onUnmatch} disabled={pending} variant="outline">
                        {pending ? "Obnovuji…" : "Obnovit (zrušit ignoraci)"}
                    </Button>
                )}
            </div>
        </div>
    );
}
