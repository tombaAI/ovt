"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { getMemberAuditLog, type AuditEntry } from "@/lib/actions/members";
import { FIELD_LABELS } from "@/lib/member-fields";
import { popNavStack, pushNavStack } from "@/lib/nav-stack";
import { setContributionTodo, setContribReviewed } from "@/lib/actions/contributions";
import { createCashPaymentOnContrib, deleteContribAllocation } from "@/lib/actions/reconciliation";
import { getContribEmailHistory, type ContribMailEvent } from "@/lib/actions/contrib-emails";
import {
    deleteContribPrescription,
    previewRecalcContrib,
    setContribIndividualDiscount,
    type IndividualDiscountData,
    type RecalcProposed,
} from "@/lib/actions/contribution-periods";
import { RecalcConfirmDialog } from "../recalc-confirm-dialog";
import { SendEmailDialog } from "../send-email-dialog";
import type { ContribRow, Payment, PeriodDetail } from "../data";

const STATUS_LABEL: Record<ContribRow["status"], string> = {
    paid: "v pořádku",
    overpaid: "více",
    underpaid: "méně",
    unpaid: "nezaplaceno",
};

const STATUS_BADGE: Record<ContribRow["status"], string> = {
    paid: "bg-[#327600]/10 text-[#327600] border-0",
    overpaid: "bg-orange-100 text-orange-700 border-0",
    underpaid: "bg-red-100 text-red-700 border-0",
    unpaid: "bg-red-50 text-red-600 border border-red-200",
};

const SOURCE_BADGE: Record<string, string> = {
    fio_bank: "bg-violet-100 text-violet-700 border-violet-200",
    file_import: "bg-sky-100 text-sky-700 border-sky-200",
    cash: "bg-orange-100 text-orange-700 border-orange-200",
};

const SOURCE_LABEL: Record<string, string> = {
    fio_bank: "Fio",
    file_import: "Banka",
    cash: "Hotovost",
};

const EMAIL_TYPE_LABEL: Record<string, string> = {
    prescription: "Předpis příspěvků",
    reminder: "Upomínka",
    other: "Email",
};

function fmtAmount(value: number | null): string {
    if (value === null) return "—";
    return `${value.toLocaleString("cs-CZ")} Kč`;
}

function fmtDate(value: string | null): string {
    if (!value) return "—";
    const [year, month, day] = value.split("-");
    return `${Number(day)}. ${Number(month)}. ${year}`;
}

function buildFullVS(vs: number): number {
    if (vs >= 100_000_000) return vs;
    return 207_101_000 + (vs % 1000);
}

function buildPayliboUrl(amount: number, vs: number, bankAccount: string, year: number): string {
    const [accountNumber, bankCode] = bankAccount.split("/");
    const message = encodeURIComponent(`Příspěvky OVT Bohemians ${year}`);
    return (
        `https://api.paylibo.com/paylibo/generator/czech/image` +
        `?accountNumber=${accountNumber}` +
        `&bankCode=${bankCode}` +
        `&amount=${amount}` +
        `&currency=CZK` +
        `&vs=${buildFullVS(vs)}` +
        `&message=${message}` +
        `&size=220`
    );
}

function processState(row: ContribRow): string {
    if (row.emailSent) return "mail odeslán";
    if (row.reviewed) return "zkontrolováno";
    return "nový";
}

function contributionBreakdown(row: ContribRow) {
    return [
        row.amountBase ? { label: "Základní příspěvek", value: row.amountBase } : null,
        row.amountBoat1 ? { label: "Loď 1", value: row.amountBoat1 } : null,
        row.amountBoat2 ? { label: "Loď 2", value: row.amountBoat2 } : null,
        row.amountBoat3 ? { label: "Loď 3", value: row.amountBoat3 } : null,
        row.brigadeSurcharge && row.brigadeSurcharge > 0 ? { label: "Penále bez brigády", value: row.brigadeSurcharge } : null,
        row.discountCommittee ? { label: "Sleva výbor", value: row.discountCommittee } : null,
        row.discountTom ? { label: "Sleva TOM", value: row.discountTom } : null,
        row.discountIndividual ? { label: "Individuální sleva", value: row.discountIndividual } : null,
    ].filter(Boolean) as Array<{ label: string; value: number }>;
}

function AuditHistory({ memberId }: { memberId: number }) {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getMemberAuditLog(memberId).then(result => {
            setEntries(result);
            setLoading(false);
        });
    }, [memberId]);

    if (loading) return <p className="py-4 text-sm text-gray-400">Načítám historii…</p>;
    if (entries.length === 0) return <p className="py-4 text-sm text-gray-400">Žádné záznamy</p>;

    return (
        <div className="max-h-96 space-y-2 overflow-y-auto">
            {entries.map(entry => (
                <div key={entry.id} className="space-y-1.5 rounded-lg border bg-gray-50 p-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-gray-500">
                        <span className="font-medium text-gray-700">{entry.changedBy}</span>
                        <span>{new Intl.DateTimeFormat("cs-CZ", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                        }).format(new Date(entry.changedAt))}</span>
                    </div>
                    {Object.entries(entry.changes).map(([field, diff]) => (
                        <div key={field} className="flex flex-wrap gap-1">
                            <span className="text-gray-500">{FIELD_LABELS[field] ?? field}:</span>
                            {diff.old !== null && <span className="text-red-400 line-through">{diff.old}</span>}
                            {diff.old !== null && diff.new !== null && <span className="text-gray-400">→</span>}
                            {diff.new !== null ? (
                                <span className="text-green-600">{diff.new}</span>
                            ) : (
                                <span className="text-gray-400">(odstraněno)</span>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

function AuditDialog({ open, onOpenChange, memberId, memberName }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    memberId: number;
    memberName: string;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Audit log — {memberName}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto">
                    <AuditHistory memberId={memberId} />
                </div>
            </DialogContent>
        </Dialog>
    );
}

function TodoSection({ currentNote, onSave }: {
    currentNote: string | null;
    onSave: (note: string | null) => Promise<void>;
}) {
    const [text, setText] = useState(currentNote ?? "");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setText(currentNote ?? "");
    }, [currentNote]);

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
        <div className={["space-y-2 rounded-xl border px-4 py-3", currentNote ? "border-orange-200 bg-orange-50/40" : ""].join(" ")}>
            <p className="text-sm font-semibold text-gray-700">Úkol</p>
            <Textarea
                value={text}
                onChange={event => setText(event.target.value)}
                placeholder="Popište, co je potřeba udělat…"
                rows={3}
                className="resize-none text-sm"
            />
            <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[#327600] hover:bg-[#2a6400]">
                    {saving ? "Ukládám…" : "Uložit"}
                </Button>
                {currentNote && (
                    <Button size="sm" variant="outline" onClick={handleResolve} disabled={saving}>
                        Vyřešeno
                    </Button>
                )}
            </div>
        </div>
    );
}

function PaymentRow({ payment, onDelete, onOpenPayment, deleting }: {
    payment: Payment;
    onDelete: () => void;
    onOpenPayment: () => void;
    deleting: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <button type="button" onClick={onOpenPayment} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="shrink-0 font-semibold text-gray-900">{fmtAmount(payment.amount)}</span>
                <span className="shrink-0 text-gray-500">{fmtDate(payment.paidAt)}</span>
                <Badge className={`border text-xs font-normal ${SOURCE_BADGE[payment.sourceType] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                    {SOURCE_LABEL[payment.sourceType] ?? payment.sourceType}
                </Badge>
                {payment.note && <span className="truncate text-xs text-gray-400">{payment.note}</span>}
            </button>
            <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="text-base leading-none text-gray-300 transition-colors hover:text-red-500"
                title="Smazat platbu"
            >
                ✕
            </button>
        </div>
    );
}

interface Props {
    row: ContribRow;
    period: PeriodDetail;
}

export function ContributionDetailClient({ row, period }: Props) {
    const router = useRouter();
    const [amount, setAmount] = useState("");
    const [paidAt, setPaidAt] = useState("");
    const [note, setNote] = useState("");
    const [addError, setAddError] = useState<string | null>(null);
    const [addPending, startAdd] = useTransition();
    const [deletePending, startDelete] = useTransition();
    const [reviewedPending, startReviewed] = useTransition();
    const [delPending, startDel] = useTransition();
    const [recalcPending, startRecalc] = useTransition();
    const [recalcError, setRecalcError] = useState<string | null>(null);
    const [recalcProposed, setRecalcProposed] = useState<RecalcProposed | null>(null);
    const [recalcDialogOpen, setRecalcDialogOpen] = useState(false);
    const [discPending, startDisc] = useTransition();
    const [discError, setDiscError] = useState<string | null>(null);
    const [discAmount, setDiscAmount] = useState("");
    const [discNote, setDiscNote] = useState("");
    const [discUntil, setDiscUntil] = useState("");
    const [sendEmailOpen, setSendEmailOpen] = useState(false);
    const [mailHistory, setMailHistory] = useState<ContribMailEvent[]>([]);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [auditOpen, setAuditOpen] = useState(false);

    useEffect(() => {
        const absAmount = row.discountIndividual ? Math.abs(row.discountIndividual) : 0;
        setDiscAmount(absAmount > 0 ? String(absAmount) : "");
        setDiscNote(row.discountIndividualNote ?? "");
        setDiscUntil(row.discountIndividualValidUntil ? String(row.discountIndividualValidUntil) : "");
    }, [row.discountIndividual, row.discountIndividualNote, row.discountIndividualValidUntil]);

    useEffect(() => {
        getContribEmailHistory(row.contribId).then(setMailHistory);
    }, [row.contribId]);

    const memberName = `${row.firstName} ${row.lastName}`;
    const detailLabel = `Příspěvky ${period.year}: ${memberName}`;
    const balance = row.amountTotal === null ? null : row.paidTotal - row.amountTotal;
    const breakdown = contributionBreakdown(row);

    function refresh() {
        router.refresh();
    }

    function navigateTo(url: string) {
        pushNavStack({ url: `/dashboard/contributions/${row.contribId}?year=${period.year}`, label: detailLabel });
        router.push(url);
    }

    function scrollToAddPayment() {
        document.getElementById("add-payment")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function scrollToDelete() {
        setDeleteConfirm(true);
        document.getElementById("delete-prescription")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function openPaymentsOverview(ledgerId?: number) {
        const suffix = ledgerId ? `&focus=${ledgerId}` : "";
        navigateTo(`/dashboard/payments?member=${row.memberId}&year=${period.year}${suffix}`);
    }

    function openPaymentDetail(ledgerId: number) {
        navigateTo(`/dashboard/payments/${ledgerId}?year=${period.year}`);
    }

    function handleAddPayment() {
        const numericAmount = Number(amount);
        if (!numericAmount || numericAmount <= 0) {
            setAddError("Zadejte platnou částku");
            return;
        }
        if (!paidAt) {
            setAddError("Zadejte datum platby");
            return;
        }

        setAddError(null);
        startAdd(async () => {
            const result = await createCashPaymentOnContrib({
                contribId: row.contribId,
                memberId: row.memberId,
                amount: numericAmount,
                paidAt,
                note: note.trim() || null,
            });

            if ("error" in result) {
                setAddError(result.error);
                return;
            }

            setAmount("");
            setPaidAt("");
            setNote("");
            refresh();
        });
    }

    function handleDeleteAllocation(allocationId: number) {
        startDel(async () => {
            const result = await deleteContribAllocation(allocationId, row.memberId);
            if ("success" in result) refresh();
        });
    }

    function handleSaveDiscount() {
        setDiscError(null);
        const numericAmount = Math.max(0, Number(discAmount) || 0);
        const validUntil = discUntil ? Number(discUntil) : null;
        const payload: IndividualDiscountData = {
            amount: numericAmount,
            note: discNote.trim() || null,
            validUntil: numericAmount > 0 ? validUntil : null,
        };

        startDisc(async () => {
            const result = await setContribIndividualDiscount(row.contribId, payload);
            if ("error" in result) {
                setDiscError(result.error);
                return;
            }
            refresh();
        });
    }

    function handleClearDiscount() {
        setDiscError(null);
        startDisc(async () => {
            const result = await setContribIndividualDiscount(row.contribId, { amount: 0, note: null, validUntil: null });
            if ("error" in result) {
                setDiscError(result.error);
                return;
            }
            setDiscAmount("");
            setDiscNote("");
            setDiscUntil("");
            refresh();
        });
    }

    function handleRecalc() {
        setRecalcError(null);
        startRecalc(async () => {
            const result = await previewRecalcContrib(row.contribId);
            if ("error" in result) {
                setRecalcError(result.error);
                return;
            }
            setRecalcProposed(result.proposed);
            setRecalcDialogOpen(true);
        });
    }

    function handleDeletePrescription() {
        startDelete(async () => {
            const result = await deleteContribPrescription(row.contribId);
            if ("error" in result) return;

            const previous = popNavStack();
            if (previous) {
                router.push(previous.url);
                return;
            }

            router.push(`/dashboard/contributions?year=${period.year}`);
        });
    }

    return (
        <>
            <div className="mx-auto max-w-4xl space-y-6 pb-10">
                <div className="flex items-center gap-3 pt-1">
                    <BackButton />
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-xl font-semibold text-gray-900">Příspěvky {period.year}: {memberName}</h1>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigateTo(`/dashboard/members/${row.memberId}?year=${period.year}`)}>
                            Člen
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={scrollToAddPayment}>
                            Přidat platbu
                        </Button>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                    <MoreHorizontal size={15} />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-48 space-y-0.5 p-1.5">
                                <button type="button" onClick={() => setSendEmailOpen(true)} className="w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-gray-50">
                                    Odeslat email
                                </button>
                                <button type="button" onClick={() => openPaymentsOverview()} className="w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-gray-50">
                                    Platby
                                </button>
                                <button type="button" onClick={() => setAuditOpen(true)} className="w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-gray-50">
                                    Audit log
                                </button>
                                <button type="button" onClick={handleRecalc} className="w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-gray-50">
                                    Přepočítat předpis
                                </button>
                                <button type="button" onClick={scrollToDelete} className="w-full rounded px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">
                                    Smazat předpis
                                </button>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <section className="rounded-xl border bg-white p-5">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-[140px_1fr] gap-2">
                                <span className="text-gray-500">Člen</span>
                                <button type="button" onClick={() => navigateTo(`/dashboard/members/${row.memberId}?year=${period.year}`)} className="w-fit text-left font-medium text-[#327600] hover:underline">
                                    {memberName}
                                </button>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] gap-2">
                                <span className="text-gray-500">Rok</span>
                                <span>{period.year}</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] gap-2">
                                <span className="text-gray-500">Stav platby</span>
                                <Badge className={`${STATUS_BADGE[row.status]} w-fit text-xs font-normal`}>{STATUS_LABEL[row.status]}</Badge>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] gap-2">
                                <span className="text-gray-500">Stav zpracování</span>
                                <span>{processState(row)}</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] gap-2">
                                <span className="text-gray-500">Datum splatnosti</span>
                                <span>{fmtDate(period.dueDate)}</span>
                            </div>
                        </div>

                        <div className="space-y-3 rounded-xl border bg-gray-50 p-4 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-500">Předpis celkem</span>
                                <span className="font-semibold text-gray-900">{fmtAmount(row.amountTotal)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-500">Zaplaceno</span>
                                <span className="font-semibold text-[#327600]">{fmtAmount(row.paidTotal)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-500">Rozdíl</span>
                                <span className={balance === null || balance === 0 ? "font-semibold text-gray-900" : balance > 0 ? "font-semibold text-orange-600" : "font-semibold text-red-600"}>
                                    {balance === null ? "—" : `${balance > 0 ? "+" : ""}${balance.toLocaleString("cs-CZ")} Kč`}
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border bg-white p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold text-gray-700">Předpis</h2>
                        <button
                            type="button"
                            onClick={handleRecalc}
                            disabled={recalcPending}
                            className="inline-flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-[#327600] disabled:opacity-40"
                        >
                            <RefreshCw className={`h-3 w-3 ${recalcPending ? "animate-spin" : ""}`} />
                            Přepočítat
                        </button>
                    </div>
                    <div className="space-y-2 text-sm">
                        {breakdown.map(item => (
                            <div key={item.label} className="flex items-center justify-between gap-4">
                                <span className="text-gray-500">{item.label}</span>
                                <span className="font-medium text-gray-900">{fmtAmount(item.value)}</span>
                            </div>
                        ))}
                    </div>
                    {recalcError && <p className="mt-2 text-xs text-red-600">{recalcError}</p>}
                    <Separator className="my-4" />

                    <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-700">Individuální sleva</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label className="text-xs text-gray-600">Sleva (Kč)</Label>
                                <Input type="number" min={0} value={discAmount} onChange={event => setDiscAmount(event.target.value)} className="h-8 text-sm" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-gray-600">Platí do roku</Label>
                                <Input type="number" min={2024} max={2099} value={discUntil} onChange={event => setDiscUntil(event.target.value)} className="h-8 text-sm" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs text-gray-600">Poznámka</Label>
                            <Input value={discNote} onChange={event => setDiscNote(event.target.value)} className="h-8 text-sm" placeholder="Důvod slevy…" />
                        </div>
                        {discError && <p className="text-xs text-red-600">{discError}</p>}
                        <div className="flex gap-2">
                            <Button size="sm" onClick={handleSaveDiscount} disabled={discPending} className="bg-[#327600] hover:bg-[#2a6400]">
                                {discPending ? "Ukládám…" : "Uložit slevu"}
                            </Button>
                            {row.discountIndividual && (
                                <Button size="sm" variant="outline" onClick={handleClearDiscount} disabled={discPending}>
                                    Zrušit slevu
                                </Button>
                            )}
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border bg-white p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold text-gray-700">Platby</h2>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openPaymentsOverview()}>
                            Otevřít v platbách
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {row.payments.length === 0 ? (
                            <p className="text-sm text-gray-400">Žádné platby</p>
                        ) : (
                            row.payments.map(payment => (
                                <PaymentRow
                                    key={payment.allocationId}
                                    payment={payment}
                                    onDelete={() => handleDeleteAllocation(payment.allocationId)}
                                    onOpenPayment={() => openPaymentDetail(payment.ledgerId)}
                                    deleting={delPending}
                                />
                            ))
                        )}
                    </div>

                    <Separator className="my-4" />
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">Zaplaceno celkem</span>
                        <span className={balance === null ? "font-semibold text-gray-900" : balance === 0 ? "font-semibold text-[#327600]" : balance > 0 ? "font-semibold text-orange-600" : "font-semibold text-red-600"}>
                            {fmtAmount(row.paidTotal)}
                            {balance !== null && balance !== 0 && (
                                <span className="ml-2 text-xs font-normal text-gray-400">
                                    ({balance > 0 ? "přeplatek" : "nedoplatek"} {Math.abs(balance).toLocaleString("cs-CZ")} Kč)
                                </span>
                            )}
                        </span>
                    </div>
                </section>

                <section id="add-payment" className="rounded-xl border bg-white p-5">
                    <h2 className="mb-4 text-sm font-semibold text-gray-700">Přidat platbu</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="pay-amount">Částka (Kč)</Label>
                            <Input id="pay-amount" inputMode="numeric" value={amount} onChange={event => { setAmount(event.target.value); setAddError(null); }} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="pay-date">Datum</Label>
                            <Input id="pay-date" type="date" value={paidAt} onChange={event => setPaidAt(event.target.value)} />
                        </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                        <Label htmlFor="pay-note">Poznámka</Label>
                        <Input id="pay-note" value={note} onChange={event => setNote(event.target.value)} placeholder="(volitelné)" />
                    </div>
                    {addError && <p className="mt-2 text-xs text-red-600">{addError}</p>}
                    <div className="mt-3">
                        <Button onClick={handleAddPayment} disabled={addPending} className="bg-[#327600] hover:bg-[#2a6400]">
                            {addPending ? "Přidávám…" : "Přidat platbu"}
                        </Button>
                    </div>
                </section>

                <TodoSection
                    currentNote={row.todoNote}
                    onSave={async nextNote => {
                        const result = await setContributionTodo(row.contribId, nextNote);
                        if ("success" in result) refresh();
                    }}
                />

                <section className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3">
                    <Checkbox
                        id="chk-contrib-reviewed"
                        checked={row.reviewed}
                        disabled={reviewedPending || (row.reviewed && row.emailSent)}
                        onCheckedChange={value => {
                            startReviewed(async () => {
                                const result = await setContribReviewed(row.contribId, Boolean(value));
                                if ("success" in result) refresh();
                            });
                        }}
                    />
                    <Label htmlFor="chk-contrib-reviewed" className={`text-sm font-medium ${row.reviewed && row.emailSent ? "cursor-not-allowed text-gray-400" : "cursor-pointer"}`}>
                        Zrevidováno
                    </Label>
                    {row.emailSent && <span className="ml-auto text-xs font-medium text-violet-600">Odeslán mail</span>}
                </section>

                {row.amountTotal && row.amountTotal > 0 && row.variableSymbol && (
                    <section className="rounded-xl border bg-white p-5">
                        <h2 className="mb-4 text-sm font-semibold text-gray-700">Platební údaje</h2>
                        <div className="flex flex-col items-start gap-4 sm:flex-row">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={buildPayliboUrl(row.amountTotal, row.variableSymbol, period.bankAccount, period.year)}
                                alt="QR kód pro platbu"
                                width={180}
                                height={180}
                                className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5"
                            />
                            <div className="grid gap-3 text-sm sm:grid-cols-2">
                                <div>
                                    <p className="text-xs text-gray-400">Číslo účtu</p>
                                    <p className="font-mono font-semibold text-gray-800">{period.bankAccount}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400">Variabilní symbol</p>
                                    <p className="font-mono font-semibold text-gray-800">{String(buildFullVS(row.variableSymbol)).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400">Částka</p>
                                    <p className="font-semibold text-[#327600]">{fmtAmount(row.amountTotal)}</p>
                                </div>
                                {period.dueDate && (
                                    <div>
                                        <p className="text-xs text-gray-400">Datum splatnosti</p>
                                        <p className="font-semibold text-gray-800">{fmtDate(period.dueDate)}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                )}

                <section className="rounded-xl border bg-white p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-gray-400" />
                            <h2 className="text-sm font-semibold text-gray-700">Historie emailů</h2>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setSendEmailOpen(true)} className="h-7 px-2.5 text-xs text-[#327600] border-[#327600]/30 hover:bg-[#327600]/5">
                            <Mail className="mr-1 h-3 w-3" />
                            Odeslat email
                        </Button>
                    </div>

                    {mailHistory.length === 0 ? (
                        <p className="text-sm text-gray-400">Žádné odeslané emaily</p>
                    ) : (
                        <div className="space-y-2">
                            {mailHistory.map(item => (
                                <div key={item.id} className="flex items-start gap-2 text-xs text-gray-600">
                                    <span className="mt-0.5 shrink-0 text-gray-400">
                                        {new Date(item.sentAt).toLocaleString("cs-CZ", {
                                            day: "numeric",
                                            month: "numeric",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                    <div className="min-w-0">
                                        <span className="font-medium">{EMAIL_TYPE_LABEL[item.emailType ?? ""] ?? item.emailType ?? "Email"}</span>
                                        {item.toEmail && <span className="ml-1 block truncate text-gray-400">{item.toEmail}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section id="delete-prescription" className="rounded-xl border border-red-100 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold text-gray-700">Smazat předpis</p>
                            <p className="mt-0.5 text-xs text-gray-400">Použij v případě, že člen ukončil členství nebo předpis vznikl omylem.</p>
                        </div>
                        {!deleteConfirm ? (
                            <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(true)} className="shrink-0 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                Smazat
                            </Button>
                        ) : (
                            <div className="ml-4 flex shrink-0 items-center gap-2">
                                <span className="text-xs font-medium text-red-600">Opravdu smazat?</span>
                                <Button size="sm" onClick={handleDeletePrescription} disabled={deletePending} className="h-7 bg-red-600 px-2.5 text-xs text-white hover:bg-red-700">
                                    {deletePending ? "Mažu…" : "Ano, smazat"}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(false)} disabled={deletePending} className="h-7 px-2.5 text-xs">
                                    Zrušit
                                </Button>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <SendEmailDialog
                open={sendEmailOpen}
                onOpenChange={setSendEmailOpen}
                rows={[row]}
                onSent={() => {
                    getContribEmailHistory(row.contribId).then(setMailHistory);
                    refresh();
                }}
            />

            <AuditDialog
                open={auditOpen}
                onOpenChange={setAuditOpen}
                memberId={row.memberId}
                memberName={memberName}
            />

            {recalcProposed && (
                <RecalcConfirmDialog
                    open={recalcDialogOpen}
                    onOpenChange={value => {
                        setRecalcDialogOpen(value);
                        if (!value) setRecalcProposed(null);
                    }}
                    row={row}
                    proposed={recalcProposed}
                    onSaved={() => {
                        setRecalcProposed(null);
                        refresh();
                    }}
                />
            )}
        </>
    );
}