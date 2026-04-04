"use client";

import { useEffect, useState, useActionState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { saveMember, getMemberAuditLog, type MemberFormState, type AuditEntry } from "@/lib/actions/members";
import { FIELD_LABELS } from "@/lib/member-fields";
import type { MemberWithFlags } from "./page";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: MemberWithFlags | null;
    currentYearDiscounts: { committee: number; tom: number } | null;
}

function formatDate(d: Date) {
    return new Intl.DateTimeFormat("cs-CZ", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(d));
}

function AuditHistory({ memberId }: { memberId: number }) {
    const [log, setLog]       = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getMemberAuditLog(memberId).then(entries => {
            setLog(entries);
            setLoading(false);
        });
    }, [memberId]);

    if (loading) return <p className="text-xs text-gray-400">Načítám historii…</p>;
    if (log.length === 0) return <p className="text-xs text-gray-400">Žádné záznamy</p>;

    return (
        <div className="space-y-3">
            {log.map(entry => (
                <div key={entry.id} className="text-xs border rounded-md p-2.5 space-y-1.5 bg-gray-50">
                    <div className="flex items-center justify-between gap-2 text-gray-500">
                        <span className="font-medium text-gray-700 truncate">{entry.changedBy}</span>
                        <span className="shrink-0">{formatDate(entry.changedAt)}</span>
                    </div>
                    {Object.entries(entry.changes).map(([field, diff]) => (
                        <div key={field} className="flex gap-1 flex-wrap">
                            <span className="text-gray-500">{FIELD_LABELS[field] ?? field}:</span>
                            {diff.old !== null && (
                                <span className="line-through text-red-400">{diff.old}</span>
                            )}
                            {diff.old !== null && diff.new !== null && <span className="text-gray-400">→</span>}
                            {diff.new !== null && (
                                <span className="text-green-600">{diff.new}</span>
                            )}
                            {diff.new === null && <span className="text-gray-400">(odstraněno)</span>}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

export function MemberSheet({ open, onOpenChange, member, currentYearDiscounts }: Props) {
    const [state, formAction, isPending] = useActionState<MemberFormState, FormData>(saveMember, null);
    const [showHistory, setShowHistory]  = useState(false);

    useEffect(() => {
        if (state && "success" in state) {
            onOpenChange(false);
        }
    }, [state, onOpenChange]);

    // Reset history visibility when member changes
    useEffect(() => {
        setShowHistory(false);
    }, [member?.id]);

    const isEdit    = Boolean(member);
    const hasContrib = Boolean(member?.hasContrib2026);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader className="mb-6">
                    <SheetTitle>{isEdit ? "Upravit člena" : "Přidat člena"}</SheetTitle>
                </SheetHeader>

                <form action={formAction} className="space-y-4">
                    {member && <input type="hidden" name="id" value={member.id} />}

                    <div className="space-y-1.5">
                        <Label htmlFor="full_name">Jméno *</Label>
                        <Input id="full_name" name="full_name" required
                            defaultValue={member?.fullName ?? ""} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="user_login">Login</Label>
                            <Input id="user_login" name="user_login"
                                defaultValue={member?.userLogin ?? ""} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="phone">Telefon</Label>
                            <Input id="phone" name="phone"
                                defaultValue={member?.phone ?? ""} />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="email">E-mail</Label>
                        <Input id="email" name="email" type="email"
                            defaultValue={member?.email ?? ""} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="variable_symbol">Variabilní symbol</Label>
                            <Input id="variable_symbol" name="variable_symbol" inputMode="numeric"
                                defaultValue={member?.variableSymbol ?? ""} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="csk_number">Číslo ČSK</Label>
                            <Input id="csk_number" name="csk_number" inputMode="numeric"
                                defaultValue={member?.cskNumber ?? ""} />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="note">Poznámka</Label>
                        <Input id="note" name="note"
                            defaultValue={member?.note ?? ""} />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <Checkbox id="is_active" name="is_active"
                            defaultChecked={member ? member.isActive : true} />
                        <Label htmlFor="is_active" className="cursor-pointer">Aktivní člen</Label>
                    </div>

                    {isEdit && hasContrib && (
                        <>
                            <Separator />
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                                Nastavení roku 2026
                            </p>

                            <div className="flex items-center gap-2">
                                <Checkbox id="is_committee" name="is_committee"
                                    defaultChecked={Boolean(member?.isCommittee)} />
                                <Label htmlFor="is_committee" className="cursor-pointer">
                                    Člen výboru
                                    {currentYearDiscounts && (
                                        <span className="text-gray-400 font-normal ml-1">
                                            (sleva {currentYearDiscounts.committee} Kč)
                                        </span>
                                    )}
                                </Label>
                            </div>

                            <div className="flex items-center gap-2">
                                <Checkbox id="is_tom" name="is_tom"
                                    defaultChecked={Boolean(member?.isTom)} />
                                <Label htmlFor="is_tom" className="cursor-pointer">
                                    Vedoucí TOM
                                    {currentYearDiscounts && (
                                        <span className="text-gray-400 font-normal ml-1">
                                            (sleva {currentYearDiscounts.tom} Kč)
                                        </span>
                                    )}
                                </Label>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="individual_discount">Individuální sleva (Kč)</Label>
                                <Input
                                    id="individual_discount"
                                    name="individual_discount"
                                    inputMode="numeric"
                                    placeholder="0 = bez slevy"
                                    defaultValue={
                                        member?.discountIndividual
                                            ? Math.abs(member.discountIndividual)
                                            : ""
                                    }
                                />
                            </div>
                        </>
                    )}

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

                {/* Audit history — only for existing members */}
                {isEdit && member && (
                    <>
                        <Separator className="my-6" />
                        <button
                            type="button"
                            onClick={() => setShowHistory(v => !v)}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 font-medium uppercase tracking-wide w-full text-left"
                        >
                            <span>{showHistory ? "▾" : "▸"}</span>
                            Historie změn
                        </button>
                        {showHistory && (
                            <div className="mt-3">
                                <AuditHistory memberId={member.id} />
                            </div>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
