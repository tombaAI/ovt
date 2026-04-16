"use client";

import { useEffect, useState, useTransition, useActionState, useCallback } from "react";
import { Eye, EyeOff } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { InlineField } from "./inline-field";
import {
    updateMemberField, setIndividualDiscount,
    setContributionFlags, terminateMembership,
    getMemberHistory, getMemberAuditLog, saveMember, setMemberTodo,
    type MemberFormState, type AuditEntry, type MemberYearRecord,
} from "@/lib/actions/members";
import { getMemberTjDiffs, updateMemberFieldFromTj, type TjDiff } from "@/lib/actions/sync";
import { FIELD_LABELS } from "@/lib/member-fields";
import { CONTRIBUTION_YEAR } from "@/lib/constants";
import type { MemberWithFlags } from "./page";

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: Date) {
    return new Intl.DateTimeFormat("cs-CZ", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(d));
}

function fmtDateShort(iso: string | null) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

// ── Audit history ────────────────────────────────────────────────────────────
function AuditHistory({ memberId }: { memberId: number }) {
    const [log, setLog]         = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getMemberAuditLog(memberId).then(e => { setLog(e); setLoading(false); });
    }, [memberId]);

    if (loading) return <p className="text-xs text-gray-400">Načítám historii…</p>;
    if (log.length === 0) return <p className="text-xs text-gray-400">Žádné záznamy</p>;

    const isTjAction = (action: string) => action === "import_from_tj" || action === "update_from_tj";

    return (
        <div className="space-y-2">
            {log.map(entry => (
                <div key={entry.id} className="text-xs border rounded-lg p-2.5 bg-gray-50 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-gray-500">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium text-gray-700 truncate">{entry.changedBy}</span>
                            {isTjAction(entry.action) && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                                    import TJ Bohemians
                                </span>
                            )}
                        </div>
                        <span className="shrink-0">{formatDate(entry.changedAt)}</span>
                    </div>
                    {Object.entries(entry.changes)
                        .filter(([field]) => field !== "source")
                        .map(([field, diff]) => (
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

// ── TJ diffs section ─────────────────────────────────────────────────────────
function TjDiffsSection({ memberId, onApplied }: { memberId: number; onApplied: () => void }) {
    const [diffs, setDiffs]     = useState<TjDiff[] | null>(null);
    const [done, setDone]       = useState<Set<string>>(new Set());
    const [pending, startTrans] = useTransition();

    useEffect(() => {
        getMemberTjDiffs(memberId).then(setDiffs);
    }, [memberId]);

    if (diffs === null) return <p className="text-xs text-gray-400 mt-1">Načítám…</p>;

    const remaining = diffs.filter(d => !done.has(d.field));
    if (remaining.length === 0) return (
        <p className="text-xs text-[#327600] font-medium mt-1">Vše přijato.</p>
    );

    function apply(diff: TjDiff) {
        startTrans(async () => {
            const res = await updateMemberFieldFromTj(memberId, diff.field, diff.tjValue);
            if ("success" in res) {
                setDone(prev => new Set([...prev, diff.field]));
                onApplied();
            }
        });
    }

    return (
        <div className="border rounded-md overflow-hidden mt-2">
            <table className="w-full text-xs">
                <thead>
                    <tr className="bg-sky-50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-sky-800 w-28">Pole</th>
                        <th className="text-left px-3 py-2 font-medium text-sky-800">Naše data</th>
                        <th className="text-left px-3 py-2 font-medium text-sky-800">TJ Bohemians</th>
                        <th className="w-16" />
                    </tr>
                </thead>
                <tbody>
                    {remaining.map(diff => (
                        <tr key={diff.field} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-2 text-muted-foreground font-medium">{diff.label}</td>
                            <td className="px-3 py-2 text-foreground/50 line-through">{diff.ourValue ?? "—"}</td>
                            <td className="px-3 py-2 font-medium text-sky-700">{diff.tjValue ?? "—"}</td>
                            <td className="px-3 py-2 text-right">
                                <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                                    disabled={pending} onClick={() => apply(diff)}>
                                    ← Přijmout
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
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
                    <DialogTitle>Individuální sleva — {member.firstName} {member.lastName}</DialogTitle>
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

// ── Terminate membership dialog ───────────────────────────────────────────────
function TerminateDialog({
    open, onOpenChange, member, onDone,
}: {
    open: boolean; onOpenChange: (v: boolean) => void;
    member: MemberWithFlags; onDone: () => void;
}) {
    const [date, setDate]   = useState(todayIso);
    const [note, setNote]   = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        if (open) { setDate(todayIso()); setNote(""); setError(null); }
    }, [open]);

    function handleConfirm() {
        if (!note.trim()) { setError("Komentář je povinný"); return; }
        startTransition(async () => {
            const result = await terminateMembership(member.id, date, note);
            if ("error" in result) { setError(result.error); return; }
            onDone();
            onOpenChange(false);
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Ukončení členství — {member.firstName} {member.lastName}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 space-y-1">
                        <p className="font-semibold">Upozornění</p>
                        <p>Toto ukončuje členství pouze v této aplikaci. Neřeší odhlášení v TJ Bohemians ani v ČSK — to je nutno provést samostatně.</p>
                        <p>Příspěvky za aktuální rok je také nutno dořešit samostatně.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="term-date">Datum ukončení *</Label>
                        <Input id="term-date" type="date" value={date}
                            onChange={e => setDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="term-note">Komentář *</Label>
                        <Textarea id="term-note" rows={3}
                            placeholder="Důvod ukončení, nebo popis situace…"
                            value={note} onChange={e => { setNote(e.target.value); setError(null); }} />
                    </div>
                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
                    <Button onClick={handleConfirm} disabled={pending}
                        className="bg-red-600 hover:bg-red-700">
                        {pending ? "Ukládám…" : "Ukončit členství"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Todo section ─────────────────────────────────────────────────────────────
function TodoSection({ currentNote, onSave }: {
    currentNote: string | null;
    onSave: (note: string | null) => Promise<void>;
}) {
    const [text, setText]     = useState(currentNote ?? "");
    const [saving, setSaving] = useState(false);

    useEffect(() => { setText(currentNote ?? ""); }, [currentNote]);

    async function handleSave() {
        setSaving(true);
        await onSave(text.trim() || null);
        setSaving(false);
    }
    async function handleResolve() {
        setSaving(true);
        await onSave(null);
        setSaving(false);
    }

    return (
        <div className={[
            "rounded-xl border px-4 py-3 mb-4 space-y-2",
            currentNote ? "border-orange-200 bg-orange-50/40" : "",
        ].join(" ")}>
            <p className="text-sm font-semibold text-gray-700">Úkol k řešení</p>
            <Textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Popište co je potřeba udělat…"
                rows={3}
                className="text-sm resize-none"
            />
            <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving}
                    className="bg-[#327600] hover:bg-[#2a6400]">
                    {saving ? "Ukládám…" : "Uložit"}
                </Button>
                {currentNote && (
                    <Button size="sm" variant="outline" onClick={handleResolve} disabled={saving}>
                        ✓ Vyřešeno
                    </Button>
                )}
            </div>
        </div>
    );
}

// ── Contribution history ──────────────────────────────────────────────────────
function fmt(n: number | null) {
    if (n === null) return "—";
    return n.toLocaleString("cs-CZ") + " Kč";
}

function ContributionHistory({ memberId }: { memberId: number }) {
    const [rows, setRows] = useState<MemberYearRecord[] | null>(null);

    useEffect(() => {
        getMemberHistory(memberId).then(setRows);
    }, [memberId]);

    if (!rows) return <p className="text-xs text-gray-400 py-2">Načítám…</p>;
    if (rows.length === 0) return <p className="text-xs text-gray-400 py-2">Žádné záznamy</p>;

    return (
        <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[360px]">
                <thead>
                    <tr className="border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <th className="text-left pb-2 pr-3">Rok</th>
                        <th className="text-right pb-2 pr-3">Předpis</th>
                        <th className="text-right pb-2 pr-3">Zaplaceno</th>
                        <th className="text-right pb-2">Stav</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => {
                        const balance = r.hasContrib && r.amountTotal !== null
                            ? r.paidTotal - r.amountTotal
                            : null;
                        return (
                            <tr key={r.year} className="border-b last:border-0">
                                <td className="py-1.5 pr-3 font-semibold text-gray-800">{r.year}</td>
                                {r.hasContrib ? (
                                    <>
                                        <td className="py-1.5 pr-3 text-right font-mono text-xs text-gray-600">{fmt(r.amountTotal)}</td>
                                        <td className="py-1.5 pr-3 text-right font-mono text-xs text-gray-600">{fmt(r.paidTotal)}</td>
                                        <td className="py-1.5 text-right text-xs font-medium">
                                            {balance === null && <span className="text-gray-400">—</span>}
                                            {balance === 0   && <span className="text-green-600">OK</span>}
                                            {balance !== null && balance > 0 && (
                                                <span className="text-blue-600">+{balance.toLocaleString("cs-CZ")} Kč</span>
                                            )}
                                            {balance !== null && balance < 0 && (
                                                <span className="text-red-600">{balance.toLocaleString("cs-CZ")} Kč</span>
                                            )}
                                        </td>
                                    </>
                                ) : (
                                    <td colSpan={3} className="py-1.5 pl-2 text-xs font-medium text-amber-600">
                                        ⚠ Chybí předpis
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ── Sensitive data section ────────────────────────────────────────────────────
function SensitiveDataSection({ member }: { member: MemberWithFlags }) {
    const [visible, setVisible] = useState(false);
    const toggle = useCallback(() => setVisible(v => !v), []);

    return (
        <div className="rounded-xl border px-4 py-3 mb-4">
            <button
                onClick={toggle}
                className="flex items-center gap-2 w-full text-left"
                type="button"
            >
                <span className="text-sm font-semibold text-gray-700">Osobní údaje (GDPR)</span>
                <span className="ml-auto text-gray-400 hover:text-gray-700 transition-colors">
                    {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </span>
            </button>
            {visible && (
                <div className="mt-3 space-y-2 text-sm">
                    <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
                        <span className="text-gray-500 self-center">Datum narození</span>
                        <span className="font-medium">{fmtDateShort(member.birthDate) ?? "—"}</span>
                        <span className="text-gray-500 self-center">Rodné číslo</span>
                        <span className="font-medium font-mono">{member.birthNumber ?? "—"}</span>
                    </div>
                </div>
            )}
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

export function MemberSheet({ open, onOpenChange, member, periodId, currentYearDiscounts, onMemberUpdated }: Props) {
    const [showHistory, setShowHistory]               = useState(false);
    const [showContribHistory, setShowContribHistory] = useState(false);
    const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
    const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
    const [committeePending, startCommitteeTransition] = useTransition();
    const [tomPending, startTomTransition] = useTransition();
    const [toggleError, setToggleError] = useState<string | null>(null);
    const [optCommittee, setOptCommittee] = useState<boolean | null>(null);
    const [optTom, setOptTom]             = useState<boolean | null>(null);
    const [activeField, setActiveField] = useState<string | null>(null);
    const [tjDiffs, setTjDiffs]         = useState<Record<string, string | null>>({});

    // Reset optimistického stavu při přepnutí na jiného člena
    useEffect(() => { setOptCommittee(null); setOptTom(null); }, [member?.id]);

    const [state, formAction, isPending] = useActionState<MemberFormState, FormData>(saveMember, null);
    useEffect(() => {
        if (state && "success" in state) { onOpenChange(false); onMemberUpdated(); }
    }, [state, onOpenChange, onMemberUpdated]);

    useEffect(() => {
        setShowHistory(false);
        setShowContribHistory(false);
        setActiveField(null);
        setTjDiffs({});
        if (member?.hasTjDiffs) {
            getMemberTjDiffs(member.id).then(diffs => {
                setTjDiffs(Object.fromEntries(diffs.map(d => [d.field, d.tjValue])));
            });
        }
    }, [member?.id, member?.hasTjDiffs]);

    const isEdit = Boolean(member);

    function fieldSaver(field: Parameters<typeof updateMemberField>[1]) {
        return (value: string) => updateMemberField(member!.id, field, value).then(r => {
            if ("success" in r) onMemberUpdated();
            return r;
        });
    }

    function tjAcceptor(field: Parameters<typeof updateMemberFieldFromTj>[1]) {
        const tjVal = tjDiffs[field];
        if (tjVal === undefined) return undefined;
        return () => updateMemberFieldFromTj(member!.id, field, tjVal).then(r => {
            if ("success" in r) {
                setTjDiffs(prev => { const next = { ...prev }; delete next[field]; return next; });
                onMemberUpdated();
            }
            return r;
        });
    }

    async function toggleCommittee(checked: boolean) {
        if (!member) return;
        if (!periodId) { setToggleError("Chybí příspěvkové období pro tento rok"); return; }
        setToggleError(null);
        const r = await setContributionFlags(member.id, periodId, checked, optTom ?? member.isTom);
        if ("success" in r) onMemberUpdated();
        else { setOptCommittee(null); setToggleError(r.error); }
    }

    async function toggleTom(checked: boolean) {
        if (!member) return;
        if (!periodId) { setToggleError("Chybí příspěvkové období pro tento rok"); return; }
        setToggleError(null);
        const r = await setContributionFlags(member.id, periodId, optCommittee ?? member.isCommittee, checked);
        if ("success" in r) onMemberUpdated();
        else { setOptTom(null); setToggleError(r.error); }
    }

    const isTerminated = Boolean(member?.memberTo);

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent
                    className="w-full sm:max-w-3xl overflow-y-auto overflow-x-hidden px-5 pb-8"
                    onOpenAutoFocus={e => e.preventDefault()}
                >
                    {isEdit && member ? (
                        <>
                            <SheetHeader className="px-0 pt-5 pb-4 mb-2">
                                <div className="flex items-start justify-between gap-2">
                                    <SheetTitle className="text-lg leading-tight">{member.firstName} {member.lastName}</SheetTitle>
                                    {isTerminated && (
                                        <Badge className="bg-red-100 text-red-700 border-0 shrink-0">Ukončen</Badge>
                                    )}
                                </div>
                            </SheetHeader>

                            {/* Ukončení členství — info box */}
                            {isTerminated && (
                                <div className="rounded-xl border border-red-200 bg-red-50/40 px-4 py-3 mb-4 text-sm space-y-1">
                                    <p className="font-semibold text-red-700">Členství ukončeno</p>
                                    <p className="text-gray-600">Datum: <span className="font-medium">{fmtDateShort(member.memberTo)}</span></p>
                                    {member.memberToNote && <p className="text-gray-500 text-xs">{member.memberToNote}</p>}
                                </div>
                            )}

                            {/* Inline edit fields */}
                            <div className="rounded-xl border px-4 mb-4">
                                <InlineField label="Jméno"     value={member.firstName}                       fieldId="firstName"  activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("firstName")} tjValue={tjDiffs["firstName"]} onTjAccept={tjAcceptor("firstName")} />
                                <InlineField label="Příjmení"  value={member.lastName}                        fieldId="lastName"   activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("lastName")}  tjValue={tjDiffs["lastName"]}  onTjAccept={tjAcceptor("lastName")} />
                                <InlineField label="Přezdívka"   value={member.nickname}   placeholder="(žádná)"    fieldId="nickname"   activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("nickname")}   tjValue={tjDiffs["nickname"]}    onTjAccept={tjAcceptor("nickname")} />
                                <InlineField label="Login"       value={member.userLogin}  placeholder="(nezadáno)" fieldId="userLogin"  activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("userLogin")} />
                                <InlineField label="E-mail"      value={member.email}      type="email"             fieldId="email"      activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("email")}       tjValue={tjDiffs["email"]}       onTjAccept={tjAcceptor("email")} />
                                <InlineField label="Telefon"     value={member.phone}      type="tel"               fieldId="phone"      activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("phone")}       tjValue={tjDiffs["phone"]}       onTjAccept={tjAcceptor("phone")} />
                                <InlineField label="Pohlaví"     value={member.gender}     placeholder="(nezadáno)" fieldId="gender"     activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("gender")}      tjValue={tjDiffs["gender"]}      onTjAccept={tjAcceptor("gender")} />
                                <InlineField label="Adresa"      value={member.address}    placeholder="(nezadáno)" fieldId="address"    activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("address")}     tjValue={tjDiffs["address"]}     onTjAccept={tjAcceptor("address")} />
                                <InlineField label="Var. symbol" value={member.variableSymbol?.toString() ?? null} type="number" fieldId="variableSymbol" activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("variableSymbol")} />
                                <InlineField label="Číslo ČSK"   value={member.cskNumber ?? null}                  fieldId="cskNumber"  activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("cskNumber")}   tjValue={tjDiffs["cskNumber"]}   onTjAccept={tjAcceptor("cskNumber")} />
                                <InlineField label="Poznámka"    value={member.note}       placeholder="(žádná)"    fieldId="note"       activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("note")} />
                                <InlineField label="Člen od"     value={member.memberFrom} type="date"              fieldId="memberFrom" activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("memberFrom")} />
                            </div>

                            {/* Citlivé údaje — skryté za očíčkem */}
                            <SensitiveDataSection member={member} />

                            {/* Todo */}
                            <TodoSection
                                currentNote={member.todoNote}
                                onSave={async (note) => {
                                    const r = await setMemberTodo(member.id, note);
                                    if ("success" in r) onMemberUpdated();
                                }}
                            />

                            {/* Current year flags */}
                            {member.hasContrib && (
                                <div className="rounded-xl border px-4 py-3 mb-4 space-y-3">
                                    <p className="text-sm font-semibold text-gray-700">
                                        Příspěvky {CONTRIBUTION_YEAR}
                                    </p>

                                    <div className="flex items-center gap-2">
                                        <Checkbox id="chk-committee"
                                            checked={optCommittee ?? member.isCommittee}
                                            disabled={committeePending}
                                            onCheckedChange={v => { setOptCommittee(Boolean(v)); startCommitteeTransition(async () => { await toggleCommittee(Boolean(v)); }); }} />
                                        <Label htmlFor="chk-committee" className="cursor-pointer text-sm">
                                            Člen výboru
                                            {currentYearDiscounts && <span className="text-gray-400 font-normal ml-1">(−{currentYearDiscounts.committee} Kč)</span>}
                                        </Label>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Checkbox id="chk-tom"
                                            checked={optTom ?? member.isTom}
                                            disabled={tomPending}
                                            onCheckedChange={v => { setOptTom(Boolean(v)); startTomTransition(async () => { await toggleTom(Boolean(v)); }); }} />
                                        <Label htmlFor="chk-tom" className="cursor-pointer text-sm">
                                            Vedoucí TOM
                                            {currentYearDiscounts && <span className="text-gray-400 font-normal ml-1">(−{currentYearDiscounts.tom} Kč)</span>}
                                        </Label>
                                    </div>

                                    {toggleError && <p className="text-xs text-red-600">{toggleError}</p>}

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

                            {/* Příspěvky po rocích */}
                            <Separator className="mb-4" />
                            <div className="mb-4">
                                <button
                                    onClick={() => setShowContribHistory(v => !v)}
                                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium w-full text-left mb-2">
                                    <span>{showContribHistory ? "▾" : "▸"}</span>
                                    Příspěvky po rocích
                                </button>
                                {showContribHistory && <ContributionHistory memberId={member.id} />}
                            </div>

                            {/* Ukončit členství */}
                            {!isTerminated && (
                                <>
                                    <Separator className="mb-4" />
                                    <div className="mb-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setTerminateDialogOpen(true)}
                                            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
                                            Ukončit členství…
                                        </Button>
                                    </div>
                                </>
                            )}

                            {/* TJ diffs */}
                            {member.hasTjDiffs && (
                                <>
                                    <Separator className="mb-4" />
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-sky-700">Nepřijaté změny ze synchronizace TJ</p>
                                            <a href="/dashboard/imports/members-tj"
                                                className="text-xs text-sky-600 hover:underline">
                                                Otevřít import →
                                            </a>
                                        </div>
                                        <TjDiffsSection memberId={member.id} onApplied={onMemberUpdated} />
                                    </div>
                                </>
                            )}

                            {/* Audit history */}
                            <Separator className="mb-4" />
                            <button
                                onClick={() => setShowHistory(v => !v)}
                                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium w-full text-left">
                                <span>{showHistory ? "▾" : "▸"}</span>
                                Historie změn
                            </button>
                            {showHistory && <div className="mt-3"><AuditHistory memberId={member.id} /></div>}
                        </>
                    ) : (
                        /* ── Create new member ── */
                        <>
                            <SheetHeader className="px-0 pt-5 pb-4 mb-4">
                                <SheetTitle>Přidat člena</SheetTitle>
                            </SheetHeader>
                            <form action={formAction} className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5"><Label htmlFor="first_name">Jméno *</Label>
                                        <Input id="first_name" name="first_name" required />
                                    </div>
                                    <div className="space-y-1.5"><Label htmlFor="last_name">Příjmení *</Label>
                                        <Input id="last_name" name="last_name" required />
                                    </div>
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
                                <div className="space-y-1.5"><Label htmlFor="member_from">Člen od *</Label>
                                    <Input id="member_from" name="member_from" type="date"
                                        defaultValue={todayIso()} required />
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
                    <TerminateDialog
                        open={terminateDialogOpen}
                        onOpenChange={setTerminateDialogOpen}
                        member={member}
                        onDone={onMemberUpdated}
                    />
                </>
            )}
        </>
    );
}
