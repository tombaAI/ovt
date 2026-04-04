"use client";

import { useEffect, useState, useTransition, useActionState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { InlineField } from "./inline-field";
import {
    updateMemberField, changeMemberStatus, setIndividualDiscount,
    setContributionFlags, setMembershipDates, getMemberAuditLog, saveMember,
    type MemberFormState, type AuditEntry,
} from "@/lib/actions/members";
import { FIELD_LABELS } from "@/lib/member-fields";
import { CONTRIBUTION_YEAR } from "@/lib/constants";
import type { MemberWithFlags } from "./page";

// ── Audit history ────────────────────────────────────────────────────────────
function formatDate(d: Date) {
    return new Intl.DateTimeFormat("cs-CZ", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(d));
}

function AuditHistory({ memberId }: { memberId: number }) {
    const [log, setLog]         = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getMemberAuditLog(memberId).then(e => { setLog(e); setLoading(false); });
    }, [memberId]);

    if (loading) return <p className="text-xs text-gray-400">Načítám historii…</p>;
    if (log.length === 0) return <p className="text-xs text-gray-400">Žádné záznamy</p>;

    return (
        <div className="space-y-2">
            {log.map(entry => (
                <div key={entry.id} className="text-xs border rounded-lg p-2.5 bg-gray-50 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-gray-500">
                        <span className="font-medium text-gray-700 truncate">{entry.changedBy}</span>
                        <span className="shrink-0">{formatDate(entry.changedAt)}</span>
                    </div>
                    {Object.entries(entry.changes).map(([field, diff]) => (
                        <div key={field} className="flex gap-1 flex-wrap">
                            <span className="text-gray-500">{FIELD_LABELS[field] ?? field}:</span>
                            {diff.old !== null && <span className="line-through text-red-400">{diff.old}</span>}
                            {diff.old !== null && diff.new !== null && <span className="text-gray-400">→</span>}
                            {diff.new !== null
                                ? <span className="text-green-600">{diff.new}</span>
                                : <span className="text-gray-400">(odstraněno)</span>
                            }
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

// ── Status change dialog ─────────────────────────────────────────────────────
function StatusDialog({
    open, onOpenChange, member, onDone,
}: {
    open: boolean; onOpenChange: (v: boolean) => void;
    member: MemberWithFlags; onDone: () => void;
}) {
    const [note, setNote]       = useState("");
    const [error, setError]     = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const newStatus = !member.isActive;

    function handleConfirm() {
        if (!note.trim()) { setError("Poznámka je povinná"); return; }
        startTransition(async () => {
            const result = await changeMemberStatus(member.id, newStatus, note);
            if ("error" in result) { setError(result.error); return; }
            onDone();
            onOpenChange(false);
            setNote("");
            setError(null);
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Změna stavu člena</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <p className="text-sm text-gray-600">
                        <strong>{member.fullName}</strong> bude označen jako{" "}
                        <strong>{newStatus ? "aktivní" : "neaktivní"}</strong>.
                    </p>
                    {!newStatus && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                            Deaktivace může mít dopad na příspěvky. Zkontroluj stav plateb.
                        </p>
                    )}
                    <div className="space-y-1.5">
                        <Label htmlFor="status-note">Důvod / poznámka *</Label>
                        <Textarea
                            id="status-note"
                            placeholder="Proč se mění stav?"
                            value={note}
                            onChange={e => { setNote(e.target.value); setError(null); }}
                            rows={3}
                        />
                        {error && <p className="text-xs text-red-600">{error}</p>}
                    </div>
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
                    <Button onClick={handleConfirm} disabled={pending}
                        className="bg-[#327600] hover:bg-[#2a6400]">
                        {pending ? "Ukládám…" : "Potvrdit"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Individual discount dialog ────────────────────────────────────────────────
function DiscountDialog({
    open, onOpenChange, member, periodId, currentDiscount, currentNote, currentValidUntil, onDone,
}: {
    open: boolean; onOpenChange: (v: boolean) => void;
    member: MemberWithFlags; periodId: number | null;
    currentDiscount: number | null; currentNote: string | null;
    currentValidUntil: number | null; onDone: () => void;
}) {
    const [amount, setAmount]     = useState(currentDiscount ? Math.abs(currentDiscount) : 0);
    const [note, setNote]         = useState(currentNote ?? "");
    const [validUntil, setValid]  = useState<number>(currentValidUntil ?? CONTRIBUTION_YEAR);
    const [remove, setRemove]     = useState(false);
    const [error, setError]       = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        if (open) {
            setAmount(currentDiscount ? Math.abs(currentDiscount) : 0);
            setNote(currentNote ?? "");
            setValid(currentValidUntil ?? CONTRIBUTION_YEAR);
            setRemove(false);
            setError(null);
        }
    }, [open, currentDiscount, currentNote, currentValidUntil]);

    function handleConfirm() {
        if (!periodId) { setError("Příspěvkový záznam nenalezen"); return; }
        if (!remove && !note.trim()) { setError("Poznámka je povinná"); return; }
        if (!remove && amount <= 0) { setError("Částka musí být větší než 0"); return; }
        startTransition(async () => {
            const result = await setIndividualDiscount(
                member.id, periodId,
                remove ? null : amount,
                note,
                remove ? null : validUntil
            );
            if ("error" in result) { setError(result.error); return; }
            onDone();
            onOpenChange(false);
        });
    }

    const years = [CONTRIBUTION_YEAR, CONTRIBUTION_YEAR + 1, CONTRIBUTION_YEAR + 2];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Individuální sleva — {member.fullName}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    {currentDiscount && (
                        <div className="flex items-center gap-2">
                            <Checkbox id="remove-discount" checked={remove}
                                onCheckedChange={v => setRemove(Boolean(v))} />
                            <Label htmlFor="remove-discount" className="cursor-pointer text-red-600">
                                Zrušit slevu
                            </Label>
                        </div>
                    )}
                    {!remove && (
                        <>
                            <div className="space-y-1.5">
                                <Label htmlFor="disc-amount">Částka slevy (Kč) *</Label>
                                <Input id="disc-amount" type="number" min={1}
                                    value={amount || ""} placeholder="0"
                                    onChange={e => setAmount(Number(e.target.value))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="disc-note">Důvod *</Label>
                                <Textarea id="disc-note" rows={2} placeholder="Proč tato sleva?"
                                    value={note} onChange={e => { setNote(e.target.value); setError(null); }} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="disc-valid">Platí do roku</Label>
                                <select id="disc-valid" value={validUntil}
                                    onChange={e => setValid(Number(e.target.value))}
                                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                    <option value={9999}>Neurčito</option>
                                </select>
                            </div>
                        </>
                    )}
                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
                    <Button onClick={handleConfirm} disabled={pending}
                        className={remove ? "bg-red-600 hover:bg-red-700" : "bg-[#327600] hover:bg-[#2a6400]"}>
                        {pending ? "Ukládám…" : remove ? "Zrušit slevu" : "Uložit"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Main detail sheet ─────────────────────────────────────────────────────────
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: MemberWithFlags | null;
    periodId: number | null;
    currentYearDiscounts: { committee: number; tom: number } | null;
    onMemberUpdated: () => void;
}

export function MemberSheet({ open, onOpenChange, member, periodId, currentYearDiscounts, onMemberUpdated }: Props) {
    const [showHistory, setShowHistory] = useState(false);
    const [statusDialogOpen, setStatusDialogOpen] = useState(false);
    const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
    const [committeePending, startCommitteeTransition] = useTransition();
    const [tomPending, startTomTransition] = useTransition();
    const [activeField, setActiveField] = useState<string | null>(null);

    // New member form (create only)
    const [state, formAction, isPending] = useActionState<MemberFormState, FormData>(saveMember, null);
    useEffect(() => {
        if (state && "success" in state) { onOpenChange(false); onMemberUpdated(); }
    }, [state, onOpenChange, onMemberUpdated]);

    useEffect(() => { setShowHistory(false); setActiveField(null); }, [member?.id]);

    const isEdit = Boolean(member);

    // ── Helpers for inline field save ──
    function fieldSaver(field: Parameters<typeof updateMemberField>[1]) {
        return (value: string) => updateMemberField(member!.id, field, value).then(r => {
            if ("success" in r) onMemberUpdated();
            return r;
        });
    }

    async function toggleCommittee(checked: boolean) {
        if (!member || !periodId) return;
        const r = await setContributionFlags(member.id, periodId, checked, member.isTom);
        if ("success" in r) onMemberUpdated();
    }

    async function toggleTom(checked: boolean) {
        if (!member || !periodId) return;
        const r = await setContributionFlags(member.id, periodId, member.isCommittee, checked);
        if ("success" in r) onMemberUpdated();
    }

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent
                    className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"
                    onOpenAutoFocus={e => e.preventDefault()}
                >
                    {isEdit && member ? (
                        <>
                            <SheetHeader className="mb-4">
                                <div className="flex items-start justify-between gap-3">
                                    <SheetTitle className="leading-tight">{member.fullName}</SheetTitle>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        {member.isActive
                                            ? <Badge className="bg-[#327600]/10 text-[#327600] border-0 text-xs">Aktivní</Badge>
                                            : <Badge variant="secondary" className="text-xs">Neaktivní</Badge>
                                        }
                                        <button
                                            onClick={() => setStatusDialogOpen(true)}
                                            className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2">
                                            Změnit stav
                                        </button>
                                    </div>
                                </div>
                            </SheetHeader>

                            {/* Inline edit fields */}
                            <div className="bg-white rounded-xl border px-4 mb-4">
                                <InlineField label="Jméno"       value={member.fullName}                        fieldId="fullName"       activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("fullName")} />
                                <InlineField label="Login"       value={member.userLogin}  placeholder="(nezadáno)" fieldId="userLogin"  activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("userLogin")} />
                                <InlineField label="E-mail"      value={member.email}      type="email"             fieldId="email"      activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("email")} />
                                <InlineField label="Telefon"     value={member.phone}      type="tel"               fieldId="phone"      activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("phone")} />
                                <InlineField label="Var. symbol" value={member.variableSymbol?.toString() ?? null} type="number" fieldId="variableSymbol" activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("variableSymbol")} />
                                <InlineField label="Číslo ČSK"   value={member.cskNumber?.toString() ?? null}     type="number" fieldId="cskNumber"      activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("cskNumber")} />
                                <InlineField label="Poznámka"    value={member.note}       placeholder="(žádná)"    fieldId="note"       activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("note")} />
                            </div>

                            {/* Current year flags */}
                            {member.hasContrib && (
                                <div className="bg-white rounded-xl border px-4 py-3 mb-4 space-y-3">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                        Příspěvky {CONTRIBUTION_YEAR}
                                    </p>

                                    <div className="flex items-center gap-2">
                                        <Checkbox id="chk-committee"
                                            checked={member.isCommittee}
                                            disabled={committeePending || activeField !== null}
                                            onCheckedChange={v => startCommitteeTransition(() => toggleCommittee(Boolean(v)))} />
                                        <Label htmlFor="chk-committee" className="cursor-pointer text-sm">
                                            Člen výboru
                                            {currentYearDiscounts && <span className="text-gray-400 font-normal ml-1">(−{currentYearDiscounts.committee} Kč)</span>}
                                        </Label>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Checkbox id="chk-tom"
                                            checked={member.isTom}
                                            disabled={tomPending || activeField !== null}
                                            onCheckedChange={v => startTomTransition(() => toggleTom(Boolean(v)))} />
                                        <Label htmlFor="chk-tom" className="cursor-pointer text-sm">
                                            Vedoucí TOM
                                            {currentYearDiscounts && <span className="text-gray-400 font-normal ml-1">(−{currentYearDiscounts.tom} Kč)</span>}
                                        </Label>
                                    </div>

                                    <Separator />

                                    {/* Membership dates for this year */}
                                    <InlineField
                                        label="Vstup do roku"
                                        value={member.joinedAt}
                                        type="date"
                                        placeholder="(od začátku roku)"
                                        fieldId="joinedAt"
                                        activeField={activeField}
                                        onActiveFieldChange={setActiveField}
                                        onSave={v => setMembershipDates(member.id, periodId!, v || null, member.leftAt).then(r => {
                                            if ("success" in r) onMemberUpdated();
                                            return r;
                                        })}
                                    />
                                    <InlineField
                                        label="Ukončení v roku"
                                        value={member.leftAt}
                                        type="date"
                                        placeholder="(do konce roku)"
                                        fieldId="leftAt"
                                        activeField={activeField}
                                        onActiveFieldChange={setActiveField}
                                        onSave={v => setMembershipDates(member.id, periodId!, member.joinedAt, v || null).then(r => {
                                            if ("success" in r) onMemberUpdated();
                                            return r;
                                        })}
                                    />

                                    <Separator />

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm">Individuální sleva</p>
                                            {member.discountIndividual
                                                ? <p className="text-sm font-semibold text-purple-700">
                                                    −{Math.abs(member.discountIndividual)} Kč
                                                  </p>
                                                : <p className="text-sm text-gray-400">Žádná</p>
                                            }
                                        </div>
                                        <button
                                            onClick={() => setDiscountDialogOpen(true)}
                                            className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2">
                                            {member.discountIndividual ? "Upravit" : "Nastavit"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* History */}
                            <Separator className="mb-4" />
                            <button
                                onClick={() => setShowHistory(v => !v)}
                                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 font-semibold uppercase tracking-wide w-full text-left">
                                <span>{showHistory ? "▾" : "▸"}</span>
                                Historie změn
                            </button>
                            {showHistory && <div className="mt-3"><AuditHistory memberId={member.id} /></div>}
                        </>
                    ) : (
                        /* ── Create new member ── */
                        <>
                            <SheetHeader className="mb-6">
                                <SheetTitle>Přidat člena</SheetTitle>
                            </SheetHeader>
                            <form action={formAction} className="space-y-4">
                                <div className="space-y-1.5"><Label htmlFor="full_name">Jméno *</Label>
                                    <Input id="full_name" name="full_name" required />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5"><Label htmlFor="user_login">Login</Label>
                                        <Input id="user_login" name="user_login" />
                                    </div>
                                    <div className="space-y-1.5"><Label htmlFor="phone">Telefon</Label>
                                        <Input id="phone" name="phone" />
                                    </div>
                                </div>
                                <div className="space-y-1.5"><Label htmlFor="email">E-mail</Label>
                                    <Input id="email" name="email" type="email" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5"><Label htmlFor="variable_symbol">Variabilní symbol</Label>
                                        <Input id="variable_symbol" name="variable_symbol" inputMode="numeric" />
                                    </div>
                                    <div className="space-y-1.5"><Label htmlFor="csk_number">Číslo ČSK</Label>
                                        <Input id="csk_number" name="csk_number" inputMode="numeric" />
                                    </div>
                                </div>
                                <div className="space-y-1.5"><Label htmlFor="note">Poznámka</Label>
                                    <Input id="note" name="note" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox id="is_active" name="is_active" defaultChecked />
                                    <Label htmlFor="is_active" className="cursor-pointer">Aktivní člen</Label>
                                </div>
                                {state && "error" in state && <p className="text-sm text-red-600">{state.error}</p>}
                                <div className="flex gap-2 pt-2">
                                    <Button type="submit" disabled={isPending} className="flex-1 bg-[#327600] hover:bg-[#2a6400]">
                                        {isPending ? "Ukládám…" : "Přidat člena"}
                                    </Button>
                                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
                                </div>
                            </form>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {member && (
                <>
                    <StatusDialog
                        open={statusDialogOpen}
                        onOpenChange={setStatusDialogOpen}
                        member={member}
                        onDone={onMemberUpdated}
                    />
                    <DiscountDialog
                        open={discountDialogOpen}
                        onOpenChange={setDiscountDialogOpen}
                        member={member}
                        periodId={periodId}
                        currentDiscount={member.discountIndividual}
                        currentNote={null}
                        currentValidUntil={null}
                        onDone={onMemberUpdated}
                    />
                </>
            )}
        </>
    );
}
