"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
    updatePrescriptionAmounts,
    type PrescriptionAmounts,
} from "@/lib/actions/contribution-periods";
import type { ContribRow } from "./page";

// ── Číselný vstup ─────────────────────────────────────────────────────────────
function AmtInput({
    label, value, onChange, note,
}: { label: string; value: number; onChange: (v: number) => void; note?: string }) {
    return (
        <div className="space-y-1">
            <Label className="text-xs text-gray-600">{label}</Label>
            <Input
                type="number"
                min={0}
                value={value}
                onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 text-sm"
            />
            {note && <p className="text-[11px] text-gray-400">{note}</p>}
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    row: ContribRow | null;
}

// ── Dialog ────────────────────────────────────────────────────────────────────
export function EditPrescriptionDialog({ open, onOpenChange, row }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState<PrescriptionAmounts>({
        amountBase:        0,
        amountBoat1:       0,
        amountBoat2:       0,
        amountBoat3:       0,
        discountCommittee: 0,
        discountTom:       0,
        discountIndividual: 0,
        brigadeSurcharge:  0,
    });

    // Předvyplnit z řádku při otevření
    useEffect(() => {
        if (!row) return;
        setError(null);
        setForm({
            amountBase:        row.amountBase        ?? 0,
            amountBoat1:       row.amountBoat1        ?? 0,
            amountBoat2:       row.amountBoat2        ?? 0,
            amountBoat3:       row.amountBoat3        ?? 0,
            // Slevy jsou v DB záporné → zobrazit jako kladné
            discountCommittee:  row.discountCommittee  ? Math.abs(row.discountCommittee)  : 0,
            discountTom:        row.discountTom        ? Math.abs(row.discountTom)        : 0,
            discountIndividual: row.discountIndividual ? Math.abs(row.discountIndividual) : 0,
            brigadeSurcharge:   row.brigadeSurcharge   ?? 0,
        });
    }, [row, open]);

    function set(key: keyof PrescriptionAmounts, v: number) {
        setForm(prev => ({ ...prev, [key]: v }));
    }

    // Průběžný výpočet celkové částky — sleva výbor má přednost, TOM se neuplatní současně
    const effectiveTom = form.discountCommittee > 0 ? 0 : form.discountTom;
    const totalPreview =
        form.amountBase +
        form.amountBoat1 + form.amountBoat2 + form.amountBoat3 -
        form.discountCommittee - effectiveTom - form.discountIndividual +
        form.brigadeSurcharge;

    function handleSave() {
        if (!row) return;
        setError(null);
        startTransition(async () => {
            const res = await updatePrescriptionAmounts(row.contribId, form);
            if ("error" in res) {
                setError(res.error);
            } else {
                router.refresh();
                onOpenChange(false);
            }
        });
    }

    if (!row) return null;

    return (
        <Dialog open={open} onOpenChange={open => { if (!isPending) onOpenChange(open); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        Upravit předpis — {row.firstName} {row.lastName}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    {/* Základní příspěvek */}
                    <AmtInput
                        label="Základní příspěvek (Kč)"
                        value={form.amountBase}
                        onChange={v => set("amountBase", v)}
                    />

                    {/* Lodě */}
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Příplatek za lodě (Kč)
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            <AmtInput label="1. loď" value={form.amountBoat1} onChange={v => set("amountBoat1", v)} />
                            <AmtInput label="2. loď" value={form.amountBoat2} onChange={v => set("amountBoat2", v)} />
                            <AmtInput label="3. loď" value={form.amountBoat3} onChange={v => set("amountBoat3", v)} />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">2. a každá další loď mají zpravidla stejnou cenu</p>
                    </div>

                    {/* Slevy */}
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Slevy (Kč) — zadej kladně
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            <AmtInput label="Výbor"       value={form.discountCommittee}  onChange={v => set("discountCommittee", v)} />
                            <AmtInput label="TOM"         value={form.discountTom}         onChange={v => set("discountTom", v)} />
                            <AmtInput label="Individuální" value={form.discountIndividual} onChange={v => set("discountIndividual", v)} />
                        </div>
                        {form.discountCommittee > 0 && form.discountTom > 0 && (
                            <p className="text-[11px] text-amber-600 mt-1">
                                Sleva výbor má přednost — sleva TOM se do celkové částky nezapočítá.
                            </p>
                        )}
                    </div>

                    {/* Penále brigáda */}
                    <AmtInput
                        label="Penále za brigádu (Kč)"
                        value={form.brigadeSurcharge}
                        onChange={v => set("brigadeSurcharge", v)}
                        note="0 = brigáda splněna"
                    />

                    <Separator />

                    {/* Celkem — živý náhled */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Celkem k úhradě</span>
                        <span className="text-lg font-semibold text-gray-900">
                            {totalPreview.toLocaleString("cs-CZ")} Kč
                        </span>
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Zrušit
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isPending}
                        className="bg-[#327600] hover:bg-[#327600]/90 text-white"
                    >
                        {isPending ? "Ukládám…" : "Uložit"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
