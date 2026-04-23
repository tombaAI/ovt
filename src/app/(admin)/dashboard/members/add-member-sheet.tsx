"use client";

import { useActionState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMember, type MemberFormState } from "@/lib/actions/members";

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdded: () => void;
}

export function AddMemberSheet({ open, onOpenChange, onAdded }: Props) {
    const [state, formAction, isPending] = useActionState<MemberFormState, FormData>(
        async (prev, data) => {
            const result = await saveMember(prev, data);
            if (result && "success" in result) { onAdded(); onOpenChange(false); }
            return result;
        },
        null
    );

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                className="w-full sm:max-w-lg overflow-y-auto px-5 pb-8"
                onOpenAutoFocus={e => e.preventDefault()}
            >
                <SheetHeader className="px-0 pt-5 pb-4 mb-4">
                    <SheetTitle>Přidat člena</SheetTitle>
                </SheetHeader>

                <form action={formAction} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="first_name">Jméno *</Label>
                            <Input id="first_name" name="first_name" required />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="last_name">Příjmení *</Label>
                            <Input id="last_name" name="last_name" required />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="user_login">Login</Label>
                            <Input id="user_login" name="user_login" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="phone">Telefon</Label>
                            <Input id="phone" name="phone" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="email">E-mail</Label>
                        <Input id="email" name="email" type="email" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="variable_symbol">Variabilní symbol</Label>
                            <Input id="variable_symbol" name="variable_symbol" inputMode="numeric" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="csk_number">Číslo ČSK</Label>
                            <Input id="csk_number" name="csk_number" inputMode="numeric" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="member_from">Člen od *</Label>
                        <Input id="member_from" name="member_from" type="date"
                            defaultValue={todayIso()} required />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="note">Poznámka</Label>
                        <Input id="note" name="note" />
                    </div>

                    {state && "error" in state && (
                        <p className="text-sm text-red-600">{state.error}</p>
                    )}

                    <div className="flex gap-2 pt-2">
                        <Button type="submit" disabled={isPending}
                            className="flex-1 bg-[#327600] hover:bg-[#2a6400]">
                            {isPending ? "Ukládám…" : "Přidat člena"}
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
