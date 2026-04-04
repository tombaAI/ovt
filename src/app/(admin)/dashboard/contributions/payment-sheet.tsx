"use client";

import { useEffect, useActionState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { savePayment, type ContribFormState } from "@/lib/actions/contributions";
import type { ContribRow } from "./page";
import { CONTRIBUTION_YEAR } from "@/lib/constants";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    row: ContribRow | null;
}

const FIELD_LABELS: Record<string, string> = {
    isPaid: "Zaplaceno", paidAmount: "Částka (Kč)", paidAt: "Datum platby", note: "Poznámka",
};

function fmt(n: number | null) {
    if (n === null) return "—";
    return n.toLocaleString("cs-CZ") + " Kč";
}

export function PaymentSheet({ open, onOpenChange, row }: Props) {
    const [state, formAction, isPending] = useActionState<ContribFormState, FormData>(savePayment, null);

    useEffect(() => {
        if (state && "success" in state) onOpenChange(false);
    }, [state, onOpenChange]);

    if (!row) return null;

    const breakdown = [
        row.amountBase     ? `Základ ${fmt(row.amountBase)}` : null,
        row.amountBoat1    ? `Loď 1 ${fmt(row.amountBoat1)}` : null,
        row.amountBoat2    ? `Loď 2 ${fmt(row.amountBoat2)}` : null,
        row.amountBoat3    ? `Loď 3 ${fmt(row.amountBoat3)}` : null,
        row.brigadeSurcharge && row.brigadeSurcharge > 0 ? `Brigáda ${fmt(row.brigadeSurcharge)}` : null,
        row.discountCommittee ? `Výbor ${fmt(row.discountCommittee)}` : null,
        row.discountTom       ? `TOM ${fmt(row.discountTom)}` : null,
        row.discountIndividual ? `Individuální ${fmt(row.discountIndividual)}` : null,
    ].filter(Boolean);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader className="mb-5">
                    <SheetTitle>{row.fullName}</SheetTitle>
                    <p className="text-sm text-gray-500">Příspěvky {CONTRIBUTION_YEAR}</p>
                </SheetHeader>

                {/* Breakdown */}
                {breakdown.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-0.5 mb-5">
                        {breakdown.map((b, i) => <p key={i} className="text-gray-600">{b}</p>)}
                        <Separator className="my-1.5" />
                        <p className="font-semibold text-gray-900">
                            Celkem: {fmt(row.amountTotal)}
                        </p>
                    </div>
                )}

                <form action={formAction} className="space-y-4">
                    <input type="hidden" name="contrib_id" value={row.contribId} />

                    <div className="space-y-1.5">
                        <Label htmlFor="paid_amount">Zaplacená částka (Kč)</Label>
                        <Input id="paid_amount" name="paid_amount" inputMode="numeric"
                            defaultValue={row.paidAmount ?? ""} placeholder="0" />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="paid_at">Datum platby</Label>
                        <Input id="paid_at" name="paid_at" type="date"
                            defaultValue={row.paidAt ?? ""} />
                    </div>

                    <div className="flex items-center gap-2">
                        <Checkbox id="is_paid" name="is_paid" defaultChecked={Boolean(row.isPaid)} />
                        <Label htmlFor="is_paid" className="cursor-pointer">Označit jako zaplaceno</Label>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="note">Poznámka</Label>
                        <Input id="note" name="note" defaultValue={row.note ?? ""} />
                    </div>

                    {state && "error" in state && (
                        <p className="text-sm text-red-600">{state.error}</p>
                    )}

                    <div className="flex gap-2 pt-2">
                        <Button type="submit" disabled={isPending}
                            className="flex-1 bg-[#327600] hover:bg-[#2a6400]">
                            {isPending ? "Ukládám…" : "Uložit"}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Zrušit
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    );
}
