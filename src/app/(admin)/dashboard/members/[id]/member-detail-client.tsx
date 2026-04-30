"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, MoreHorizontal, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InlineField } from "../inline-field";
import { BackButton } from "@/components/back-button";
import { pushNavStack } from "@/lib/nav-stack";
import {
    updateMemberField, setContributionFlags,
    terminateMembership, getMemberAuditLog,
    setMemberTodo, setMemberReviewed,
    type AuditEntry,
} from "@/lib/actions/members";
import { getMemberTjDiffs, updateMemberFieldFromTj } from "@/lib/actions/sync";
import { FIELD_LABELS } from "@/lib/member-fields";
import type { MemberWithFlags } from "../page";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateShort(iso: string | null): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}


// ── Membership status label ───────────────────────────────────────────────────

function membershipStatusLabel(member: MemberWithFlags, year: number): string {
    if (member.memberTo) {
        const d = member.memberTo as string;
        if (d.startsWith(`${year}`)) return `do ${fmtDateShort(d)}`;
        if (d < `${year}-01-01`) return "ukončeno";
    }
    if (member.fromDate) return `od ${fmtDateShort(member.fromDate)}`;
    return "aktivní";
}

// ── Audit history ─────────────────────────────────────────────────────────────

function AuditHistory({ memberId }: { memberId: number }) {
    const [log, setLog]         = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getMemberAuditLog(memberId).then(e => { setLog(e); setLoading(false); });
    }, [memberId]);

    if (loading) return <p className="text-sm text-gray-400 py-4">Načítám historii…</p>;
    if (log.length === 0) return <p className="text-sm text-gray-400 py-4">Žádné záznamy</p>;

    const isTjAction = (action: string) => action === "import_from_tj" || action === "update_from_tj";

    return (
        <div className="space-y-2 max-h-96 overflow-y-auto">
            {log.map(entry => (
                <div key={entry.id} className="text-xs border rounded-lg p-2.5 bg-gray-50 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-gray-500 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-700">{entry.changedBy}</span>
                            {isTjAction(entry.action) && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                                    import TJ
                                </span>
                            )}
                        </div>
                        <span>{new Intl.DateTimeFormat("cs-CZ", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                        }).format(new Date(entry.changedAt))}</span>
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
    const [pending, startT] = useTransition();

    useEffect(() => {
        if (open) { setDate(todayIso()); setNote(""); setError(null); }
    }, [open]);

    function handleConfirm() {
        if (!note.trim()) { setError("Komentář je povinný"); return; }
        startT(async () => {
            const result = await terminateMembership(member.id, date, note);
            if ("error" in result) { setError(result.error); return; }
            onDone(); onOpenChange(false);
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
                        <p>Toto ukončuje členství pouze v této aplikaci. Neřeší odhlášení v TJ Bohemians ani v ČSK.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="term-date">Datum ukončení *</Label>
                        <Input id="term-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="term-note">Komentář *</Label>
                        <Textarea id="term-note" rows={3} placeholder="Důvod ukončení…"
                            value={note} onChange={e => { setNote(e.target.value); setError(null); }} />
                    </div>
                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
                    <Button onClick={handleConfirm} disabled={pending} className="bg-red-600 hover:bg-red-700">
                        {pending ? "Ukládám…" : "Ukončit členství"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Audit log dialog ──────────────────────────────────────────────────────────

function AuditLogDialog({ open, onOpenChange, member }: {
    open: boolean; onOpenChange: (v: boolean) => void; member: MemberWithFlags;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Audit log — {member.firstName} {member.lastName}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto">
                    <AuditHistory memberId={member.id} />
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── GDPR section — two separate rows, each with its own eye toggle ───────────

function GdprRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="border-b py-3 flex flex-col sm:flex-row sm:items-center sm:gap-4">
            <p className="text-sm font-medium text-gray-500 sm:w-28 shrink-0 mb-0.5 sm:mb-0">{label}</p>
            <div className="flex items-center gap-2 flex-1">
                {visible
                    ? <span className={`text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
                    : <span className="text-sm text-gray-300 select-none">{"•".repeat(8)}</span>
                }
                <button
                    type="button"
                    onClick={() => setVisible(v => !v)}
                    className="ml-1 text-gray-300 hover:text-gray-600 transition-colors"
                    title={visible ? "Skrýt" : "Zobrazit"}
                >
                    {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
            </div>
        </div>
    );
}

function GdprSection({ member }: { member: MemberWithFlags }) {
    return (
        <>
            <GdprRow label="Datum narození" value={fmtDateShort(member.birthDate)} />
            <GdprRow label="Rodné číslo"    value={member.birthNumber} mono />
        </>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    member: MemberWithFlags;
    selectedYear: number;
    periodId: number | null;
    // Inline mode (render z cache v přehledu):
    onBack?: () => void;          // back šipka zavolá toto místo BackButton
    onNavigatedAway?: () => void; // volá se při navigaci na jinou stránku (Příspěvky, Lodě…)
}

export function MemberDetailClient({ member: initialMember, selectedYear, periodId, onBack, onNavigatedAway }: Props) {
    const router = useRouter();
    const member = initialMember;
    const [activeField, setActiveField]               = useState<string | null>(null);
    const [tjDiffs, setTjDiffs]                       = useState<Record<string, string | null>>({});
    const [terminateOpen, setTerminateOpen]           = useState(false);
    const [auditOpen, setAuditOpen]                   = useState(false);
    const [committeePending, startCommitteeT]         = useTransition();
    const [tomPending, startTomT]                     = useTransition();
    const [reviewedPending, startReviewedT]           = useTransition();
    const [todoSaving, setTodoSaving]                 = useState(false);
    const [toggleError, setToggleError]               = useState<string | null>(null);
    const [optCommittee, setOptCommittee]             = useState<boolean | null>(null);
    const [optTom, setOptTom]                         = useState<boolean | null>(null);

    useEffect(() => {
        setOptCommittee(null); setOptTom(null);
    }, [member.id]);

    useEffect(() => {
        if (member.hasTjDiffs) {
            getMemberTjDiffs(member.id).then(diffs => {
                setTjDiffs(Object.fromEntries(diffs.map(d => [d.field, d.tjValue])));
            });
        }
    }, [member.id, member.hasTjDiffs]);

    function refresh() { router.refresh(); }

    function fieldSaver(field: Parameters<typeof updateMemberField>[1]) {
        return (value: string) => updateMemberField(member.id, field, value).then(r => {
            if ("success" in r) refresh();
            return r;
        });
    }

    function tjAcceptor(field: Parameters<typeof updateMemberFieldFromTj>[1]) {
        const tjVal = tjDiffs[field];
        if (tjVal === undefined) return undefined;
        return () => updateMemberFieldFromTj(member.id, field, tjVal).then(r => {
            if ("success" in r) {
                setTjDiffs(prev => { const next = { ...prev }; delete next[field]; return next; });
                refresh();
            }
            return r;
        });
    }

    async function toggleCommittee(checked: boolean) {
        if (!periodId) { setToggleError("Chybí příspěvkové období pro tento rok"); return; }
        setToggleError(null);
        const r = await setContributionFlags(member.id, periodId, checked, optTom ?? member.isTom);
        if ("success" in r) refresh(); else { setOptCommittee(null); setToggleError(r.error); }
    }

    async function toggleTom(checked: boolean) {
        if (!periodId) { setToggleError("Chybí příspěvkové období pro tento rok"); return; }
        setToggleError(null);
        const r = await setContributionFlags(member.id, periodId, optCommittee ?? member.isCommittee, checked);
        if ("success" in r) refresh(); else { setOptTom(null); setToggleError(r.error); }
    }

    async function saveTodo(note: string | null) {
        setTodoSaving(true);
        const r = await setMemberTodo(member.id, note);
        if ("success" in r) refresh();
        setTodoSaving(false);
    }

    function navigateTo(url: string, label?: string) {
        // Při přechodu z inline módu nejdřív uvolnit inline stav
        onNavigatedAway?.();
        pushNavStack({ url: `/dashboard/members/${member.id}`, label: label ?? `Člen: ${member.firstName} ${member.lastName}` });
        router.push(url);
    }

    const isTerminated = Boolean(member.memberTo);
    const memberLabel = `Člen: ${member.firstName} ${member.lastName}`;

    return (
        <>
            <div className="max-w-2xl mx-auto space-y-0">
                {/* ── Page header ── */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="shrink-0">
                        {onBack ? (
                            <button onClick={onBack}
                                className="flex items-center gap-0.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
                                <ChevronLeft size={16} className="shrink-0" />
                                <span>Seznam členů</span>
                            </button>
                        ) : (
                            <BackButton />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-semibold text-gray-900 leading-tight">
                            {member.firstName} {member.lastName}
                            {member.nickname && (
                                <span className="text-gray-400 font-normal ml-1.5 text-base">({member.nickname})</span>
                            )}
                        </h1>
                        {isTerminated && (
                            <Badge className="mt-1 bg-red-100 text-red-700 border-0 text-xs">Ukončen</Badge>
                        )}
                    </div>

                    {/* Action buttons — max 3 visual elements */}
                    <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => navigateTo(`/dashboard/contributions?member=${member.id}&year=all`, memberLabel)}>
                            Příspěvky
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => navigateTo(`/dashboard/boats?member=${member.id}`, memberLabel)}>
                            Lodě
                        </Button>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                    <MoreHorizontal size={15} />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-44 p-1.5 space-y-0.5">
                                {(["Brigády", "Platby"] as const).map(label => (
                                    <button key={label}
                                        onClick={() => navigateTo(
                                            `/dashboard/${label === "Brigády" ? "brigades" : "payments"}?member=${member.id}${label === "Platby" ? "&year=all" : ""}`,
                                            memberLabel
                                        )}
                                        className="w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-gray-50 transition-colors">
                                        {label}
                                    </button>
                                ))}
                                <Separator className="my-1" />
                                <button onClick={() => setAuditOpen(true)}
                                    className="w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-gray-50 transition-colors">
                                    Audit log
                                </button>
                                {!isTerminated && (
                                    <button onClick={() => setTerminateOpen(true)}
                                        className="w-full text-left px-2.5 py-1.5 rounded text-sm text-red-600 hover:bg-red-50 transition-colors">
                                        Ukončit členství
                                    </button>
                                )}
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* Ukončení info */}
                {isTerminated && (
                    <div className="rounded-xl border border-red-200 bg-red-50/40 px-4 py-3 mb-4 text-sm space-y-1">
                        <p className="font-semibold text-red-700">Členství ukončeno</p>
                        <p className="text-gray-600">Datum: <span className="font-medium">{fmtDateShort(member.memberTo)}</span></p>
                        {member.memberToNote && <p className="text-gray-500 text-xs">{member.memberToNote}</p>}
                    </div>
                )}

                {/* ── Fields ── */}
                <div className="rounded-xl border px-4 mb-4">
                    <InlineField label="Příjmení"    value={member.lastName}   fieldId="lastName"        activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("lastName")}         tjValue={tjDiffs["lastName"]}  onTjAccept={tjAcceptor("lastName")} />
                    <InlineField label="Jméno"       value={member.firstName}  fieldId="firstName"       activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("firstName")}        tjValue={tjDiffs["firstName"]} onTjAccept={tjAcceptor("firstName")} />
                    <InlineField label="Přezdívka"   value={member.nickname}   fieldId="nickname"        activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("nickname")}         tjValue={tjDiffs["nickname"]}  onTjAccept={tjAcceptor("nickname")} placeholder="(žádná)" />
                    <GdprSection member={member} />
                    <InlineField label="E-mail"      value={member.email}      fieldId="email"           activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("email")}            tjValue={tjDiffs["email"]}     onTjAccept={tjAcceptor("email")} type="email" />
                    <InlineField label="Telefon"     value={member.phone}      fieldId="phone"           activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("phone")}            tjValue={tjDiffs["phone"]}     onTjAccept={tjAcceptor("phone")} type="tel" />
                    <InlineField label="Adresa"      value={member.address}    fieldId="address"         activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("address")}          tjValue={tjDiffs["address"]}   onTjAccept={tjAcceptor("address")} placeholder="(nezadáno)" />
                    <InlineField label="Číslo účtu"  value={member.bankAccountNumber} fieldId="bankAccountNumber" activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("bankAccountNumber")} placeholder="(nezadáno)" />
                    <InlineField label="Kód banky"   value={member.bankCode}   fieldId="bankCode"        activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("bankCode")} placeholder="(nezadáno)" />
                    <InlineField label="Var. symbol" value={member.variableSymbol?.toString() ?? null} fieldId="variableSymbol" activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("variableSymbol")} type="number" />
                    <InlineField label="Číslo ČSK"  value={member.cskNumber}  fieldId="cskNumber"       activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("cskNumber")}        tjValue={tjDiffs["cskNumber"]} onTjAccept={tjAcceptor("cskNumber")} />
                    <InlineField label="Člen od"     value={member.memberFrom} fieldId="memberFrom"      activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("memberFrom")} type="date" />
                    <InlineField label="Pohlaví"     value={member.gender}     fieldId="gender"          activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("gender")}           tjValue={tjDiffs["gender"]}    onTjAccept={tjAcceptor("gender")} placeholder="(nezadáno)" />
                    <InlineField label="Poznámka"    value={member.note}       fieldId="note"            activeField={activeField} onActiveFieldChange={setActiveField} onSave={fieldSaver("note")} placeholder="(žádná)" />
                </div>

                {/* ── Úkol ── */}
                <div className={[
                    "rounded-xl border px-4 py-3 mb-4",
                    member.todoNote ? "border-orange-200 bg-orange-50/40" : "",
                ].join(" ")}>
                    <p className="text-sm font-semibold text-gray-700 mb-2">Úkol k řešení</p>
                    <TodoEditor
                        currentNote={member.todoNote}
                        saving={todoSaving}
                        onSave={saveTodo}
                    />
                </div>

                {/* ── Členství [rok] ── */}
                <div className="rounded-xl border px-4 py-3 mb-4 space-y-3">
                    <p className="text-sm font-semibold text-gray-700">Členství {selectedYear}</p>

                    <div className="text-sm">
                        <span className="text-gray-500 mr-2">Stav:</span>
                        <span className="font-medium">{membershipStatusLabel(member, selectedYear)}</span>
                    </div>

                    {member.hasContrib && (
                        <>
                            <div className="flex items-center gap-2">
                                <Checkbox id="chk-committee"
                                    checked={optCommittee ?? member.isCommittee}
                                    disabled={committeePending}
                                    onCheckedChange={v => {
                                        setOptCommittee(Boolean(v));
                                        startCommitteeT(() => toggleCommittee(Boolean(v)));
                                    }} />
                                <Label htmlFor="chk-committee" className="cursor-pointer text-sm">
                                    Člen výboru
                                </Label>
                            </div>

                            <div className="flex items-center gap-2">
                                <Checkbox id="chk-tom"
                                    checked={optTom ?? member.isTom}
                                    disabled={tomPending}
                                    onCheckedChange={v => {
                                        setOptTom(Boolean(v));
                                        startTomT(() => toggleTom(Boolean(v)));
                                    }} />
                                <Label htmlFor="chk-tom" className="cursor-pointer text-sm">
                                    Vedoucí TOM
                                </Label>
                            </div>

                            {toggleError && <p className="text-xs text-red-600">{toggleError}</p>}
                        </>
                    )}

                    {!member.hasContrib && (
                        <p className="text-xs text-amber-600">⚠ Pro tento rok chybí příspěvkový předpis</p>
                    )}

                    <Separator />

                    <div className="flex items-center gap-2">
                        <Checkbox id="chk-reviewed"
                            checked={member.membershipReviewed}
                            disabled={reviewedPending}
                            onCheckedChange={v => {
                                startReviewedT(async () => {
                                    const r = await setMemberReviewed(member.id, Boolean(v));
                                    if ("success" in r) refresh();
                                });
                            }} />
                        <Label htmlFor="chk-reviewed" className="cursor-pointer text-sm text-gray-600">
                            Provedena revize
                        </Label>
                    </div>
                </div>

            </div>

            {/* Dialogs */}
            <TerminateDialog
                open={terminateOpen}
                onOpenChange={setTerminateOpen}
                member={member}
                onDone={refresh}
            />
            <AuditLogDialog
                open={auditOpen}
                onOpenChange={setAuditOpen}
                member={member}
            />
        </>
    );
}

// ── Todo editor ───────────────────────────────────────────────────────────────

function TodoEditor({ currentNote, saving, onSave }: {
    currentNote: string | null;
    saving: boolean;
    onSave: (note: string | null) => Promise<void>;
}) {
    const [text, setText] = useState(currentNote ?? "");
    useEffect(() => { setText(currentNote ?? ""); }, [currentNote]);

    return (
        <div className="space-y-2">
            <Textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Popište co je potřeba udělat…"
                rows={3}
                className="text-sm resize-none"
            />
            <div className="flex gap-2">
                <Button size="sm" onClick={() => onSave(text.trim() || null)} disabled={saving}
                    className="bg-[#327600] hover:bg-[#2a6400]">
                    {saving ? "Ukládám…" : "Uložit"}
                </Button>
                {currentNote && (
                    <Button size="sm" variant="outline" onClick={() => onSave(null)} disabled={saving}>
                        ✓ Vyřešeno
                    </Button>
                )}
            </div>
        </div>
    );
}
