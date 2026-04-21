"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { setContributionTodo } from "@/lib/actions/contributions";
import { createCashPaymentOnContrib, deleteContribAllocation } from "@/lib/actions/reconciliation";
import { getContribEmailHistory, type ContribMailEvent } from "@/lib/actions/contrib-emails";
import { SendEmailDialog } from "./send-email-dialog";
import type { ContribRow, Payment } from "./page";

// ── Todo section ──────────────────────────────────────────────────────────────
function TodoSection({ currentNote, onSave }: {
    currentNote: string | null;
    onSave: (note: string | null) => Promise<void>;
}) {
    const [text, setText]     = useState(currentNote ?? "");
    const [saving, setSaving] = useState(false);

    useEffect(() => { setText(currentNote ?? ""); }, [currentNote]);

    async function handleSave()    { setSaving(true); await onSave(text.trim() || null); setSaving(false); }
    async function handleResolve() { setSaving(true); await onSave(null);                setSaving(false); }

    return (
        <div className={["rounded-xl border px-4 py-3 space-y-2", currentNote ? "border-orange-200 bg-orange-50/40" : ""].join(" ")}>
            <p className="text-sm font-semibold text-gray-700">Úkol k řešení</p>
            <Textarea value={text} onChange={e => setText(e.target.value)}
                placeholder="Popište co je potřeba udělat…" rows={3} className="text-sm resize-none" />
            <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[#327600] hover:bg-[#2a6400]">
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
    return n.toLocaleString("cs-CZ") + " Kč";
}

function fmtDate(iso: string) {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

const EMAIL_TYPE_LABEL: Record<string, string> = {
    prescription: "Předpis příspěvků",
    reminder:     "Upomínka",
    other:        "Email",
};

// ── Main sheet ────────────────────────────────────────────────────────────────
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    row: ContribRow | null;
    onPaymentUpdated: () => void;
}

export function PaymentSheet({ open, onOpenChange, row, onPaymentUpdated }: Props) {
    const [amount, setAmount] = useState("");
    const [paidAt, setPaidAt] = useState("");
    const [note, setNote]     = useState("");
    const [addError, setAddError]   = useState<string | null>(null);
    const [addPending, startAdd]    = useTransition();
    const [delPending, startDel]    = useTransition();
    const [mailHistory, setMailHistory]   = useState<ContribMailEvent[]>([]);
    const [sendEmailOpen, setSendEmailOpen] = useState(false);

    useEffect(() => {
        if (open) { setAmount(""); setPaidAt(""); setNote(""); setAddError(null); }
    }, [open]);

    useEffect(() => {
        if (!open || !row) { setMailHistory([]); return; }
        getContribEmailHistory(row.contribId).then(setMailHistory);
    }, [open, row]);

    if (!row) return null;
    // Capture non-null ref for use in async closures
    const safeRow = row;

    const breakdown = [
        row.amountBase     ? `Základ ${fmt(row.amountBase)}`                    : null,
        row.amountBoat1    ? `Loď 1 ${fmt(row.amountBoat1)}`                    : null,
        row.amountBoat2    ? `Loď 2 ${fmt(row.amountBoat2)}`                    : null,
        row.amountBoat3    ? `Loď 3 ${fmt(row.amountBoat3)}`                    : null,
        row.brigadeSurcharge && row.brigadeSurcharge > 0 ? `Brigáda ${fmt(row.brigadeSurcharge)}` : null,
        row.discountCommittee  ? `Výbor ${fmt(row.discountCommittee)}`           : null,
        row.discountTom        ? `TOM ${fmt(row.discountTom)}`                  : null,
        row.discountIndividual ? `Individuální ${fmt(row.discountIndividual)}`   : null,
    ].filter(Boolean) as string[];

    const balance = row.amountTotal !== null ? row.paidTotal - row.amountTotal : null;

    function handleAdd() {
        const amt = Number(amount);
        if (!amt || amt <= 0) { setAddError("Zadejte platnou částku"); return; }
        if (!paidAt) { setAddError("Zadejte datum platby"); return; }
        setAddError(null);
        startAdd(async () => {
            const r = await createCashPaymentOnContrib({
                contribId: safeRow.contribId,
                memberId:  safeRow.memberId,
                amount:    amt,
                paidAt,
                note:      note.trim() || null,
            });
            if ("error" in r) { setAddError(r.error); return; }
            setAmount(""); setPaidAt(""); setNote("");
            onPaymentUpdated();
        });
    }

    function handleDelete(allocationId: number) {
        startDel(async () => {
            const r = await deleteContribAllocation(allocationId, safeRow.memberId);
            if ("success" in r) onPaymentUpdated();
        });
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-3xl overflow-y-auto overflow-x-hidden px-5 pb-8">
                <SheetHeader className="px-0 pt-5 pb-4 mb-2">
                    <SheetTitle>{row.firstName} {row.lastName}</SheetTitle>
                </SheetHeader>

                {/* Prescription breakdown */}
                {breakdown.length > 0 && (
                    <div className="rounded-xl border px-4 py-3 mb-4 text-sm space-y-1">
                        {breakdown.map((b, i) => <p key={i} className="text-gray-600">{b}</p>)}
                        <Separator className="my-2" />
                        <p className="font-semibold text-gray-900">Předpis celkem: {fmt(row.amountTotal ?? 0)}</p>
                    </div>
                )}

                {/* Payments list */}
                <div className="rounded-xl border px-4 py-3 mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Platby</p>
                    {row.payments.length === 0 ? (
                        <p className="text-sm text-gray-400 pb-1">Žádné platby</p>
                    ) : (
                        <div className="space-y-2">
                            {row.payments.map(p => (
                                <PaymentRow
                                    key={p.allocationId}
                                    payment={p}
                                    onDelete={() => handleDelete(p.allocationId)}
                                    delPending={delPending}
                                />
                            ))}
                        </div>
                    )}
                    <Separator className="my-3" />
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">Zaplaceno celkem</span>
                        <span className={[
                            "font-semibold",
                            balance === null ? "text-gray-900"
                                : balance === 0 ? "text-[#327600]"
                                : balance > 0   ? "text-orange-600"
                                :                 "text-red-600",
                        ].join(" ")}>
                            {fmt(row.paidTotal)}
                            {balance !== null && balance !== 0 && (
                                <span className="ml-2 text-xs font-normal text-gray-400">
                                    ({balance > 0 ? "přeplatek" : "nedoplatek"} {Math.abs(balance).toLocaleString("cs-CZ")} Kč)
                                </span>
                            )}
                        </span>
                    </div>
                </div>

                {/* Add payment form */}
                <div className="rounded-xl border px-4 py-3 mb-4 space-y-3">
                    <p className="text-sm font-semibold text-gray-700">Přidat platbu</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="pay-amount">Částka (Kč)</Label>
                            <Input id="pay-amount" inputMode="numeric"
                                value={amount}
                                onChange={e => { setAmount(e.target.value); setAddError(null); }}
                                placeholder="0"
                                onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="pay-at">Datum</Label>
                            <Input id="pay-at" type="date" value={paidAt}
                                onChange={e => setPaidAt(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="pay-note">Poznámka</Label>
                        <Input id="pay-note" value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="(volitelné)" />
                    </div>
                    {addError && <p className="text-xs text-red-600">{addError}</p>}
                    <Button onClick={handleAdd} disabled={addPending}
                        className="bg-[#327600] hover:bg-[#2a6400]">
                        {addPending ? "Přidávám…" : "Přidat platbu"}
                    </Button>
                </div>

                {/* Todo */}
                <TodoSection
                    currentNote={row.todoNote}
                    onSave={async (note) => {
                        const r = await setContributionTodo(row.contribId, note);
                        if (r && "success" in r) onPaymentUpdated();
                    }}
                />

                {/* Email history */}
                <div className="rounded-xl border px-4 py-3 mt-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                            <p className="text-sm font-semibold text-gray-700">Historie emailů</p>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSendEmailOpen(true)}
                            className="h-7 px-2.5 text-xs text-[#327600] border-[#327600]/30 hover:bg-[#327600]/5"
                        >
                            <Mail className="w-3 h-3 mr-1" />
                            Odeslat email
                        </Button>
                    </div>
                    {mailHistory.length === 0 ? (
                        <p className="text-sm text-gray-400">Žádné odeslané emaily</p>
                    ) : (
                        <div className="space-y-2">
                            {mailHistory.map(m => (
                                <div key={m.id} className="flex items-start gap-2 text-xs text-gray-600">
                                    <span className="text-gray-400 shrink-0 mt-0.5">
                                        {new Date(m.sentAt).toLocaleString("cs-CZ", {
                                            day: "numeric", month: "numeric", year: "numeric",
                                            hour: "2-digit", minute: "2-digit",
                                        })}
                                    </span>
                                    <div className="min-w-0">
                                        <span className="font-medium">{EMAIL_TYPE_LABEL[m.emailType ?? ""] ?? m.emailType ?? "Email"}</span>
                                        {m.toEmail && (
                                            <span className="text-gray-400 ml-1 truncate block">{m.toEmail}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <SendEmailDialog
                    open={sendEmailOpen}
                    onOpenChange={setSendEmailOpen}
                    rows={row ? [row] : []}
                    onSent={() => {
                        if (row) getContribEmailHistory(row.contribId).then(setMailHistory);
                        onPaymentUpdated();
                    }}
                />
            </SheetContent>
        </Sheet>
    );
}

// ── PaymentRow — jeden řádek platby s odznakem zdroje ────────────────────────

const SOURCE_BADGE: Record<string, string> = {
    fio_bank:    "bg-violet-100 text-violet-700 border-violet-200",
    file_import: "bg-sky-100 text-sky-700 border-sky-200",
    cash:        "bg-orange-100 text-orange-700 border-orange-200",
};
const SOURCE_LABEL: Record<string, string> = {
    fio_bank:    "Fio",
    file_import: "Banka",
    cash:        "Hotovost",
};

function PaymentRow({ payment, onDelete, delPending }: {
    payment:    Payment;
    onDelete:   () => void;
    delPending: boolean;
}) {
    const p = payment;
    return (
        <div className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="font-semibold text-gray-900 shrink-0">{fmt(p.amount)}</span>
                {p.paidAt && <span className="text-gray-500 shrink-0">{fmtDate(p.paidAt)}</span>}
                <Badge className={`text-xs font-normal border shrink-0 ${SOURCE_BADGE[p.sourceType] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                    {SOURCE_LABEL[p.sourceType] ?? p.sourceType}
                </Badge>
                {p.note && <span className="text-gray-400 text-xs truncate">{p.note}</span>}
            </div>
            <button
                onClick={onDelete}
                disabled={delPending}
                className="text-gray-300 hover:text-red-500 transition-colors shrink-0 text-base leading-none"
                title="Smazat platbu">
                ✕
            </button>
        </div>
    );
}
