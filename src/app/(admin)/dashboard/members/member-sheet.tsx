"use client";

import { useEffect, useActionState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { saveMember, type MemberFormState } from "@/lib/actions/members";
import type { MemberWithFlags } from "./page";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: MemberWithFlags | null;   // null = create new
    currentYearDiscounts: { committee: number; tom: number } | null;
}

export function MemberSheet({ open, onOpenChange, member, currentYearDiscounts }: Props) {
    const [state, formAction, isPending] = useActionState<MemberFormState, FormData>(saveMember, null);

    useEffect(() => {
        if (state && "success" in state) {
            onOpenChange(false);
        }
    }, [state, onOpenChange]);

    const isEdit = Boolean(member);
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

                    {/* 2026 specific flags — only for members with existing contribution */}
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
                        <Button type="submit" disabled={isPending} className="flex-1 bg-[#327600] hover:bg-[#2a6400]">
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
