"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Download } from "lucide-react";
import { syncBankTransactionsLast } from "@/lib/actions/bank";
import { useRouter } from "next/navigation";
import type { BankTransactionRow } from "@/lib/actions/bank";

interface Props {
    transactions: BankTransactionRow[];
}

// Default: posledních 12 měsíců
function defaultFrom(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().substring(0, 10);
}
function defaultTo(): string {
    return new Date().toISOString().substring(0, 10);
}

// Kolik 90denních chunků pokryje rozsah (pro varování o době trvání)
function countChunks(from: string, to: string): number {
    const ms = new Date(to).getTime() - new Date(from).getTime();
    return Math.ceil(ms / (90 * 86400_000));
}

function formatAmount(amount: number) {
    return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(amount);
}

export function BankImportClient({ transactions }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Resync form state
    const [resyncFrom, setResyncFrom] = useState(defaultFrom);
    const [resyncTo,   setResyncTo]   = useState(defaultTo);
    const [resyncMsg,  setResyncMsg]  = useState<string | null>(null);
    const [resyncPending, startResync] = useTransition();

    function handleSyncLast() {
        startTransition(async () => {
            try {
                const result = await syncBankTransactionsLast();
                router.refresh();
                console.log("Sync hotov:", result);
            } catch (err) {
                console.error("Sync selhal:", err);
            }
        });
    }

    function handleResync() {
        setResyncMsg(null);
        startResync(async () => {
            try {
                const res = await fetch("/api/bank/resync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ from: resyncFrom, to: resyncTo }),
                });
                const data = await res.json();
                if (data.ok) {
                    setResyncMsg(`Hotovo — celkem ${data.total}, nových ${data.inserted}, přeskočeno ${data.skipped}`);
                    router.refresh();
                } else {
                    setResyncMsg(`Chyba: ${data.error}`);
                }
            } catch (err) {
                setResyncMsg(`Chyba: ${String(err)}`);
            }
        });
    }

    return (
        <div className="space-y-6">
            {/* Ovládací panel */}
            <div className="flex flex-wrap gap-6 items-end">
                {/* Inkrementální sync */}
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSyncLast}
                        disabled={isPending}
                    >
                        <RefreshCw size={14} className={isPending ? "animate-spin mr-1.5" : "mr-1.5"} />
                        Sync nových plateb
                    </Button>
                    <span className="text-xs text-muted-foreground">Od posledního stažení</span>
                </div>

                {/* Resync za období */}
                <div className="flex items-end gap-2 border rounded-lg px-3 py-2 bg-gray-50">
                    <div className="space-y-1">
                        <Label className="text-xs">Od</Label>
                        <Input
                            type="date"
                            value={resyncFrom}
                            onChange={e => setResyncFrom(e.target.value)}
                            className="h-7 text-xs w-36"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Do</Label>
                        <Input
                            type="date"
                            value={resyncTo}
                            onChange={e => setResyncTo(e.target.value)}
                            className="h-7 text-xs w-36"
                        />
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleResync}
                        disabled={resyncPending}
                    >
                        <Download size={14} className={resyncPending ? "animate-spin mr-1.5" : "mr-1.5"} />
                        {resyncPending ? "Načítám…" : "Resync za období"}
                    </Button>
                    {!resyncPending && countChunks(resyncFrom, resyncTo) > 1 && (
                        <span className="text-xs text-amber-600">
                            Více chunků ({countChunks(resyncFrom, resyncTo)} × 90 dní) — bude trvat ~{countChunks(resyncFrom, resyncTo) * 35}s
                        </span>
                    )}
                    {resyncMsg && (
                        <span className="text-xs text-muted-foreground max-w-xs">{resyncMsg}</span>
                    )}
                </div>
            </div>

            {/* Tabulka transakcí */}
            <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-gray-50 text-xs text-muted-foreground">
                            <th className="text-left px-3 py-2 font-medium">Datum</th>
                            <th className="text-right px-3 py-2 font-medium">Částka</th>
                            <th className="text-left px-3 py-2 font-medium">VS</th>
                            <th className="text-left px-3 py-2 font-medium">Protistrana</th>
                            <th className="text-left px-3 py-2 font-medium">Zpráva / Typ</th>
                            <th className="text-left px-3 py-2 font-medium">Člen (párování)</th>
                            <th className="text-left px-3 py-2 font-medium">Platba v DB</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {transactions.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground text-sm">
                                    Žádné transakce. Spusťte synchronizaci.
                                </td>
                            </tr>
                        )}
                        {transactions.map(tx => (
                            <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                                    {tx.date}
                                </td>
                                <td className={`px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap ${tx.amount >= 0 ? "text-green-700" : "text-red-600"}`}>
                                    {formatAmount(tx.amount)}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                    {tx.variableSymbol ?? <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                    <div>{tx.counterpartyName ?? <span className="text-muted-foreground">—</span>}</div>
                                    {tx.counterpartyAccount && (
                                        <div className="text-muted-foreground font-mono">{tx.counterpartyAccount}</div>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-xs max-w-[200px]">
                                    <div className="truncate">{tx.message ?? tx.type ?? <span className="text-muted-foreground">—</span>}</div>
                                </td>
                                <td className="px-3 py-2 text-xs">
                                    {tx.matchedMemberName
                                        ? <Badge variant="outline" className="text-xs font-normal">{tx.matchedMemberName}</Badge>
                                        : <span className="text-muted-foreground">—</span>
                                    }
                                </td>
                                <td className="px-3 py-2 text-xs">
                                    {tx.matchedPaymentId
                                        ? <Badge className="text-xs bg-green-100 text-green-800 border-green-200 font-normal">
                                            {tx.matchedPaymentAmount != null ? formatAmount(tx.matchedPaymentAmount) : `#${tx.matchedPaymentId}`}
                                          </Badge>
                                        : <span className="text-muted-foreground">—</span>
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {transactions.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    Zobrazeno {transactions.length} transakcí. Párování přes variabilní symbol → člen → platba.
                </p>
            )}
        </div>
    );
}
