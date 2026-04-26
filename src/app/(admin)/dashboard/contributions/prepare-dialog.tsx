"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { preparePrescriptions, type PeriodFormData } from "@/lib/actions/contribution-periods";

// ── Pevné volby bankovního účtu ───────────────────────────────────────────────
const BANK_ACCOUNTS = [
    { value: "2701772934/2010", label: "Fio banka — 2701772934/2010" },
    { value: "1024298088/3030", label: "Air banka — 1024298088/3030" },
    { value: "351416278/0300",  label: "TJ Bohemians — 351416278/0300" },
];

// ── Číselný vstup ─────────────────────────────────────────────────────────────
function NumInput({
    label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
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
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    year: number;
    defaults: Partial<PeriodFormData>;
}

const DEFAULT_BANK = "2701772934/2010";

// ── Dialog ────────────────────────────────────────────────────────────────────
export function PrepareDialog({ open, onOpenChange, year, defaults }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError]   = useState<string | null>(null);
    const [result, setResult] = useState<{ generated: number; skipped: number } | null>(null);

    const [form, setForm] = useState<PeriodFormData>({
        year,
        amountBase:        defaults.amountBase        ?? 1000,
        amountBoat1:       defaults.amountBoat1       ?? 0,
        amountBoat2:       defaults.amountBoat2       ?? 0,
        amountBoat3:       defaults.amountBoat3       ?? 0,
        discountCommittee: defaults.discountCommittee ?? 0,
        discountTom:       defaults.discountTom       ?? 0,
        brigadeSurcharge:  defaults.brigadeSurcharge  ?? 0,
        dueDate:           defaults.dueDate           ?? null,
        bankAccount:       defaults.bankAccount       ?? DEFAULT_BANK,
    });

    // Aktualizovat formulář při změně defaults (např. při přepnutí roku)
    useEffect(() => {
        setForm({
            year,
            amountBase:        defaults.amountBase        ?? 1000,
            amountBoat1:       defaults.amountBoat1       ?? 0,
            amountBoat2:       defaults.amountBoat2       ?? 0,
            amountBoat3:       defaults.amountBoat3       ?? 0,
            discountCommittee: defaults.discountCommittee ?? 0,
            discountTom:       defaults.discountTom       ?? 0,
            brigadeSurcharge:  defaults.brigadeSurcharge  ?? 0,
            dueDate:           defaults.dueDate           ?? null,
            bankAccount:       defaults.bankAccount       ?? DEFAULT_BANK,
        });
    }, [year, defaults]);

    function setNum(key: keyof PeriodFormData, v: number) {
        setForm(prev => ({ ...prev, [key]: v }));
    }

    function handleSubmit() {
        setError(null);
        startTransition(async () => {
            const res = await preparePrescriptions(form);
            if ("error" in res) {
                setError(res.error);
            } else {
                setResult({ generated: res.generated, skipped: res.skipped });
                router.refresh();
            }
        });
    }

    function handleClose() {
        if (!isPending) {
            setResult(null);
            setError(null);
            onOpenChange(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Připravit předpisy příspěvků {year}</DialogTitle>
                </DialogHeader>

                {result ? (
                    /* ── Úspěch ── */
                    <div className="space-y-4 py-2">
                        <div className="rounded-lg bg-[#327600]/10 border border-[#327600]/20 p-4">
                            <p className="font-semibold text-[#327600]">Hotovo</p>
                            <p className="text-sm text-[#327600]/80 mt-1">
                                Vygenerováno <strong>{result.generated}</strong> nových předpisů.
                                {result.skipped > 0 && (
                                    <span className="text-gray-500"> ({result.skipped} předpisů již existovalo, přeskočeno)</span>
                                )}
                            </p>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleClose} className="bg-[#327600] hover:bg-[#327600]/90 text-white">
                                Zavřít
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    /* ── Formulář ── */
                    <>
                        <div className="space-y-5 py-1">
                            {/* Základní příspěvek */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Základní částka</p>
                                <NumInput label="Základní příspěvek (Kč)" value={form.amountBase}
                                    onChange={v => setNum("amountBase", v)} />
                            </div>

                            {/* Příplatky za lodě */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Příplatek za loď (Kč / loď)</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <NumInput label="1. loď" value={form.amountBoat1}
                                        onChange={v => setNum("amountBoat1", v)} />
                                    <NumInput label="2. a každá další loď" value={form.amountBoat2}
                                        onChange={v => setNum("amountBoat2", v)} />
                                </div>
                            </div>

                            {/* Slevy */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Slevy (Kč)</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <NumInput label="Člen výboru" value={form.discountCommittee}
                                        onChange={v => setNum("discountCommittee", v)} />
                                    <NumInput label="Vedoucí TOM" value={form.discountTom}
                                        onChange={v => setNum("discountTom", v)} />
                                </div>
                            </div>

                            {/* Penále + splatnost */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Brigáda a splatnost</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <NumInput label="Penále bez brigády (Kč)" value={form.brigadeSurcharge}
                                        onChange={v => setNum("brigadeSurcharge", v)} />
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-600">Datum splatnosti</Label>
                                        <Input
                                            type="date"
                                            value={form.dueDate ?? ""}
                                            onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value || null }))}
                                            className="h-8 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Bankovní účet */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bankovní účet pro platby</p>
                                <div className="space-y-1.5">
                                    {BANK_ACCOUNTS.map(acc => (
                                        <label key={acc.value}
                                            className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                                        >
                                            <input
                                                type="radio"
                                                name="bankAccount"
                                                value={acc.value}
                                                checked={form.bankAccount === acc.value}
                                                onChange={() => setForm(prev => ({ ...prev, bankAccount: acc.value }))}
                                                className="accent-[#327600]"
                                            />
                                            <span className="font-mono text-gray-700">{acc.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Info */}
                            <p className="text-xs text-gray-400 leading-relaxed">
                                Předpisy budou vygenerovány pro všechny aktivní členy v roce {year}.
                                Slevy výbor / TOM / individuální se přenáší z roku {year - 1}.
                                Penále za brigádu se uplatní u členů bez brigády z roku {year - 1}.
                                Již existující předpisy jsou přeskočeny.
                            </p>

                            {error && (
                                <p className="text-sm text-red-600 font-medium">{error}</p>
                            )}
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose} disabled={isPending}>
                                Zrušit
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={isPending}
                                className="bg-[#327600] hover:bg-[#327600]/90 text-white"
                            >
                                {isPending ? "Generuji…" : "Připravit předpisy"}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

// ── Prázdný stav: žádné období pro rok ───────────────────────────────────────
interface NoPeriodViewProps {
    year: number;
    defaults: Partial<PeriodFormData>;
}

export function NoPeriodView({ year, defaults }: NoPeriodViewProps) {
    const [open, setOpen] = useState(false);

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-semibold text-gray-900">Příspěvky {year}</h1>
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <p className="text-gray-500">Pro rok {year} zatím nejsou připravené příspěvky.</p>
                <Button
                    onClick={() => setOpen(true)}
                    className="bg-[#327600] hover:bg-[#327600]/90 text-white"
                >
                    Připravit předpisy
                </Button>
            </div>

            <PrepareDialog
                open={open}
                onOpenChange={setOpen}
                year={year}
                defaults={defaults}
            />
        </div>
    );
}
