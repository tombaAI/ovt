"use client";

import { useTransition } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { recalcContribForMember, type RecalcProposed } from "@/lib/actions/contribution-periods";
import type { ContribRow } from "./page";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null): string {
    if (n === null || n === 0) return "—";
    return n.toLocaleString("cs-CZ") + " Kč";
}

// ── Srovnávací řádek ──────────────────────────────────────────────────────────

function DiffRow({
    label,
    current,
    proposed,
}: { label: string; current: number | null; proposed: number | null }) {
    const changed = current !== proposed;
    return (
        <tr className={changed ? "bg-amber-50" : ""}>
            <td className="py-1.5 pr-3 text-sm text-gray-500 whitespace-nowrap">{label}</td>
            <td className="py-1.5 pr-6 text-sm text-right font-mono text-gray-700">{fmt(current)}</td>
            <td className="py-1.5 text-sm text-right font-mono font-semibold">
                {changed ? (
                    <span className="text-amber-700">{fmt(proposed)}</span>
                ) : (
                    <span className="text-gray-400">{fmt(proposed)}</span>
                )}
            </td>
        </tr>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
    open:         boolean;
    onOpenChange: (open: boolean) => void;
    row:          ContribRow;
    proposed:     RecalcProposed;
    onSaved:      () => void;
}

// ── Dialog ────────────────────────────────────────────────────────────────────

export function RecalcConfirmDialog({ open, onOpenChange, row, proposed, onSaved }: Props) {
    const [isPending, startTransition] = useTransition();

    // Zjistit, zda jsou nějaké změny
    const hasChanges =
        row.amountBase         !== proposed.amountBase         ||
        (row.amountBoat1 ?? null) !== proposed.amountBoat1     ||
        (row.amountBoat2 ?? null) !== proposed.amountBoat2     ||
        (row.amountBoat3 ?? null) !== proposed.amountBoat3     ||
        row.discountCommittee  !== proposed.discountCommittee  ||
        row.discountTom        !== proposed.discountTom        ||
        row.brigadeSurcharge   !== proposed.brigadeSurcharge   ||
        row.amountTotal        !== proposed.amountTotal;

    function handleConfirm() {
        startTransition(async () => {
            const r = await recalcContribForMember(row.contribId);
            if ("success" in r) {
                onOpenChange(false);
                onSaved();
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={v => { if (!isPending) onOpenChange(v); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        Přepočítat předpis — {row.firstName} {row.lastName}
                    </DialogTitle>
                </DialogHeader>

                <div className="py-1 space-y-4">
                    <p className="text-sm text-gray-500">
                        Přepočítáno podle aktuálního stavu (lodě, brigáda, výbor/TOM).
                        Individuální sleva zůstává beze změny.
                    </p>

                    {/* Srovnávací tabulka */}
                    <div className="rounded-lg border overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    <th className="text-left py-2 px-3">Položka</th>
                                    <th className="text-right py-2 px-3">Nyní</th>
                                    <th className="text-right py-2 px-3">Nově</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 px-3">
                                <tr><td colSpan={3} className="px-3">
                                    <DiffRow label="Základ"            current={row.amountBase}       proposed={proposed.amountBase} />
                                    <DiffRow label="Loď 1"             current={row.amountBoat1}      proposed={proposed.amountBoat1} />
                                    <DiffRow label="Loď 2"             current={row.amountBoat2}      proposed={proposed.amountBoat2} />
                                    <DiffRow label="Loď 3"             current={row.amountBoat3}      proposed={proposed.amountBoat3} />
                                    <DiffRow label="Brigáda"           current={row.brigadeSurcharge} proposed={proposed.brigadeSurcharge} />
                                    <DiffRow label="Sleva výbor"       current={row.discountCommittee} proposed={proposed.discountCommittee} />
                                    <DiffRow label="Sleva TOM"         current={row.discountTom}      proposed={proposed.discountTom} />
                                    <DiffRow label="Individuální sleva" current={row.discountIndividual} proposed={proposed.discountIndividual} />
                                </td></tr>
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-200 bg-gray-50">
                                    <td className="py-2 px-3 text-sm font-semibold text-gray-700">Celkem</td>
                                    <td className="py-2 px-3 text-sm text-right font-mono font-semibold text-gray-700">
                                        {fmt(row.amountTotal)}
                                    </td>
                                    <td className={`py-2 px-3 text-sm text-right font-mono font-bold ${
                                        hasChanges ? "text-[#327600]" : "text-gray-400"
                                    }`}>
                                        {fmt(proposed.amountTotal)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {!hasChanges && (
                        <p className="text-sm text-gray-400 text-center">
                            Žádné změny — předpis je aktuální.
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Zrušit
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={isPending}
                        className="bg-[#327600] hover:bg-[#327600]/90 text-white"
                    >
                        {isPending ? "Ukládám…" : hasChanges ? "Uložit změny" : "Potvrdit (bez změn)"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
