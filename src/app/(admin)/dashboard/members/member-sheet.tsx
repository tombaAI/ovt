"use client";

import { useEffect, useState, useTransition, useActionState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
    updateMemberField, setIndividualDiscount,
    setContributionFlags, setMembershipDates,
    getMemberHistory, saveMembershipHistory,
    getMemberAuditLog, saveMember,
    type MemberFormState, type AuditEntry, type MemberYearRecord,
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

// ── Membership history review ─────────────────────────────────────────────────
type YearRowState = {
    year: number;
    isMember: boolean;
    fromDate: string;
    toDate: string;
    amountTotal: number | null;
    paidAmount: number | null;
    isPaid: boolean | null;
};

function fmt(n: number | null) {
    if (n === null) return "—";
    return n.toLocaleString("cs-CZ") + " Kč";
}

function MembershipHistoryReview({ memberId, memberReviewed, onDone }: {
    memberId: number;
    memberReviewed: boolean;
    onDone: () => void;
}) {
    const [rows, setRows]             = useState<YearRowState[] | null>(null);
    const [markReviewed, setMark]     = useState(false);
    const [saving, setSaving]         = useState(false);
    const [error, setError]           = useState<string | null>(null);

    useEffect(() => {
        getMemberHistory(memberId).then((data: MemberYearRecord[]) => {
            setRows([...data].reverse().map(d => ({
                year:        d.year,
                isMember:    d.isMember,
                fromDate:    d.fromDate ?? "",
                toDate:      d.toDate   ?? "",
                amountTotal: d.amountTotal,
                paidAmount:  d.paidAmount,
                isPaid:      d.isPaid,
            })));
        });
    }, [memberId]);

    function toggle(year: number) {
        setRows(prev => prev?.map(r => r.year === year ? { ...r, isMember: !r.isMember } : r) ?? null);
    }
    function setDate(year: number, field: "fromDate" | "toDate", val: string) {
        setRows(prev => prev?.map(r => r.year === year ? { ...r, [field]: val } : r) ?? null);
    }

    async function handleSave() {
        if (!rows) return;
        setSaving(true);
        const result = await saveMembershipHistory(
            memberId,
            rows.map(r => ({ year: r.year, isMember: r.isMember, fromDate: r.fromDate || null, toDate: r.toDate || null })),
            markReviewed,
        );
        setSaving(false);
        if ("error" in result) { setError(result.error); return; }
        onDone();
    }

    if (!rows) return <p className="text-xs text-gray-400 py-2">Načítám…</p>;

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm min-w-[480px]">
                    <thead>
                        <tr className="border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <th className="text-left pb-2 pr-3">Rok</th>
                            <th className="text-right pb-2 pr-3">Předpis</th>
                            <th className="text-right pb-2 pr-3">Zaplaceno</th>
                            <th className="text-center pb-2 pr-3">Člen</th>
                            <th className="text-left pb-2 pr-2">Od</th>
                            <th className="text-left pb-2">Do</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.year} className="border-b last:border-0">
                                <td className="py-2 pr-3 font-semibold text-gray-800">{r.year}</td>
                                <td className="py-2 pr-3 text-right font-mono text-gray-600 text-xs">{fmt(r.amountTotal)}</td>
                                <td className={[
                                    "py-2 pr-3 text-right font-mono text-xs",
                                    r.isPaid ? "text-[#327600]" : r.paidAmount ? "text-orange-600" : "text-gray-400",
                                ].join(" ")}>{fmt(r.paidAmount)}</td>
                                <td className="py-2 pr-3 text-center">
                                    <Checkbox checked={r.isMember} onCheckedChange={() => toggle(r.year)} />
                                </td>
                                <td className="py-2 pr-2">
                                    {r.isMember && (
                                        <input type="date" value={r.fromDate}
                                            onChange={e => setDate(r.year, "fromDate", e.target.value)}
                                            className="border border-gray-300 rounded px-1.5 py-1 text-xs w-34 focus:outline-none focus:ring-1 focus:ring-[#327600]/40" />
                                    )}
                                </td>
                                <td className="py-2">
                                    {r.isMember && (
                                        <input type="date" value={r.toDate}
                                            onChange={e => setDate(r.year, "toDate", e.target.value)}
                                            className="border border-gray-300 rounded px-1.5 py-1 text-xs w-34 focus:outline-none focus:ring-1 focus:ring-[#327600]/40" />
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {!memberReviewed && (
                <div className="flex items-center gap-2 pt-1">
                    <Checkbox id="mark-reviewed" checked={markReviewed}
                        onCheckedChange={v => setMark(Boolean(v))} />
                    <Label htmlFor="mark-reviewed" className="text-sm cursor-pointer">
                        Označit jako zkontrolovaného
                    </Label>
                </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <Button onClick={handleSave} disabled={saving} size="sm"
                className="bg-[#327600] hover:bg-[#2a6400]">
                {saving ? "Ukládám…" : "Uložit historii"}
            </Button>
        </div>
    );
}

// ── Main detail sheet ─────────────────────────────────────────────────────────
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: MemberWithFlags | null;
    selectedYear: number;
    periodId: number | null;
    currentYearDiscounts: { committee: number; tom: number } | null;
    onMemberUpdated: () => void;
}

export function MemberSheet({ open, onOpenChange, member, selectedYear, periodId, currentYearDiscounts, onMemberUpdated }: Props) {
    const [showHistory, setShowHistory] = useState(false);
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
                                <SheetTitle className="leading-tight">{member.fullName}</SheetTitle>
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
                                        value={member.fromDate}
                                        type="date"
                                        placeholder="(od začátku roku)"
                                        fieldId="fromDate"
                                        activeField={activeField}
                                        onActiveFieldChange={setActiveField}
                                        onSave={v => setMembershipDates(member.id, selectedYear, v || null, member.toDate).then(r => {
                                            if ("success" in r) onMemberUpdated();
                                            return r;
                                        })}
                                    />
                                    <InlineField
                                        label="Ukončení v roku"
                                        value={member.toDate}
                                        type="date"
                                        placeholder="(do konce roku)"
                                        fieldId="toDate"
                                        activeField={activeField}
                                        onActiveFieldChange={setActiveField}
                                        onSave={v => setMembershipDates(member.id, selectedYear, member.fromDate, v || null).then(r => {
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

                            {/* Membership history review */}
                            <Separator className="mb-4" />
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                        Historie členství
                                    </p>
                                    {member.membershipReviewed
                                        ? <span className="text-xs text-[#327600] font-medium">✓ Zkontrolováno</span>
                                        : <span className="text-xs text-yellow-600 font-medium">Ke kontrole</span>
                                    }
                                </div>
                                <MembershipHistoryReview
                                    memberId={member.id}
                                    memberReviewed={member.membershipReviewed}
                                    onDone={onMemberUpdated}
                                />
                            </div>

                            {/* Audit history */}
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
