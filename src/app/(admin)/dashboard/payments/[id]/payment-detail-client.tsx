"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { pushNavStack } from "@/lib/nav-stack";
import {
    confirmSingleAllocation,
    ignorePayment,
    loadMembersForMatch,
    retryAutoMatchPayment,
    unmatchPayment,
    type MemberMatchCandidate,
} from "@/lib/actions/reconciliation";
import { MatchModal } from "../match-modal";
import { SplitModal } from "../split-modal";
import type { PaymentAllocation, PaymentRow } from "../data";

const STATUS_LABELS = {
    unmatched: "Nespárováno",
    suggested: "Ke kontrole",
    confirmed: "Potvrzeno",
    ignored: "Ignorováno",
} as const;

const STATUS_BADGE = {
    unmatched: "bg-gray-100 text-gray-600 border-gray-200",
    suggested: "bg-blue-100 text-blue-700 border-blue-200",
    confirmed: "bg-green-100 text-green-800 border-green-200",
    ignored: "bg-amber-100 text-amber-700 border-amber-200",
} as const;

const SOURCE_LABELS: Record<string, string> = {
    fio_bank: "Fio banka",
    file_import: "Soubor",
    cash: "Hotovost",
};

function formatAmount(value: number): string {
    return new Intl.NumberFormat("cs-CZ", {
        style: "currency",
        currency: "CZK",
        maximumFractionDigits: 2,
    }).format(value);
}

function formatDate(value: string): string {
    const [year, month, day] = value.split("-");
    return `${Number(day)}. ${Number(month)}. ${year}`;
}

function formatDateTime(value: string): string {
    return new Date(value).toLocaleString("cs-CZ", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function sourceLabel(row: PaymentRow): string {
    if (row.sourceType === "file_import" && row.profileName) return row.profileName;
    return SOURCE_LABELS[row.sourceType] ?? row.sourceType;
}

interface Props {
    row: PaymentRow;
}

export function PaymentDetailClient({ row }: Props) {
    const router = useRouter();
    const paymentYear = Number(row.paidAt.slice(0, 4));
    const detailLabel = `Platba ${formatAmount(row.amount)}`;
    const primaryAllocation = row.allocations.length === 1 ? row.allocations[0] ?? null : null;
    const [candidates, setCandidates] = useState<MemberMatchCandidate[] | null>(null);
    const [matchOpen, setMatchOpen] = useState(false);
    const [splitOpen, setSplitOpen] = useState(false);
    const [ignoreOpen, setIgnoreOpen] = useState(false);
    const [ignoreNote, setIgnoreNote] = useState(row.note ?? "");
    const [error, setError] = useState<string | null>(null);
    const [pickerPending, startPicker] = useTransition();
    const [actionPending, startAction] = useTransition();

    function refresh() {
        router.refresh();
    }

    function navigateTo(url: string) {
        pushNavStack({
            url: `${window.location.pathname}${window.location.search}`,
            label: detailLabel,
        });
        router.push(url);
    }

    function openMember(memberId: number) {
        navigateTo(`/dashboard/members/${memberId}?year=${paymentYear}`);
    }

    function openContribution(allocation: PaymentAllocation) {
        navigateTo(`/dashboard/contributions/${allocation.contribId}?year=${allocation.periodYear ?? paymentYear}`);
    }

    function openHistory() {
        navigateTo("/dashboard/payments/history");
    }

    function openMatchDialog(mode: "match" | "split") {
        setError(null);
        startPicker(async () => {
            const nextCandidates = await loadMembersForMatch(paymentYear);
            setCandidates(nextCandidates);
            if (mode === "match") setMatchOpen(true);
            if (mode === "split") setSplitOpen(true);
        });
    }

    function handleConfirmSuggested() {
        const allocation = row.allocations[0];
        if (!allocation) return;

        setError(null);
        startAction(async () => {
            const result = await confirmSingleAllocation({
                ledgerId: row.id,
                contribId: allocation.contribId,
                memberId: allocation.memberId,
            });

            if ("error" in result) {
                setError(result.error);
                return;
            }

            refresh();
        });
    }

    function handleUnmatch() {
        if (!confirm("Opravdu odpárovat tuto platbu?")) return;

        setError(null);
        startAction(async () => {
            const result = await unmatchPayment(row.id);
            if ("error" in result) {
                setError(result.error);
                return;
            }
            refresh();
        });
    }

    function handleIgnore() {
        setError(null);
        startAction(async () => {
            const result = await ignorePayment(row.id, ignoreNote.trim() || null);
            if ("error" in result) {
                setError(result.error);
                return;
            }
            setIgnoreOpen(false);
            refresh();
        });
    }

    function handleAutoMatch() {
        setError(null);
        startAction(async () => {
            const result = await retryAutoMatchPayment(row.id);
            if ("error" in result) {
                setError(result.error);
                return;
            }
            refresh();
        });
    }

    return (
        <>
            <div className="mx-auto max-w-5xl space-y-6 pb-10">
                <div className="flex items-center gap-3 pt-1">
                    <BackButton />
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-xl font-semibold text-gray-900">Platba {formatAmount(row.amount)}</h1>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {row.reconciliationStatus === "unmatched" && (
                            <>
                                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openMatchDialog("match")}>
                                    Spárovat
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openMatchDialog("split")}>
                                    Rozdělit
                                </Button>
                            </>
                        )}

                        {row.reconciliationStatus === "suggested" && (
                            <>
                                <Button size="sm" className="h-8 bg-[#327600] px-3 text-xs text-white hover:bg-[#2a6400]" onClick={handleConfirmSuggested}>
                                    Potvrdit
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openMatchDialog("match")}>
                                    Jiný člen
                                </Button>
                            </>
                        )}

                        {row.reconciliationStatus === "confirmed" && primaryAllocation && (
                            <>
                                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openContribution(primaryAllocation)}>
                                    Příspěvek
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openMember(primaryAllocation.memberId)}>
                                    Člen
                                </Button>
                            </>
                        )}

                        {row.reconciliationStatus === "ignored" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleUnmatch}>
                                Obnovit
                            </Button>
                        )}

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                    <MoreHorizontal size={15} />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-56 space-y-0.5 p-1.5">
                                {row.reconciliationStatus === "unmatched" && (
                                    <button type="button" onClick={handleAutoMatch} className="w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-gray-50">
                                        Zkusit auto-match
                                    </button>
                                )}
                                {row.reconciliationStatus === "suggested" && (
                                    <button type="button" onClick={() => openMatchDialog("split")} className="w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-gray-50">
                                        Rozdělit
                                    </button>
                                )}
                                {row.reconciliationStatus !== "ignored" && row.reconciliationStatus !== "confirmed" && (
                                    <button type="button" onClick={() => setIgnoreOpen(true)} className="w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-gray-50">
                                        Ignorovat
                                    </button>
                                )}
                                {row.reconciliationStatus === "confirmed" && (
                                    <button type="button" onClick={handleUnmatch} className="w-full rounded px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">
                                        Odpárovat
                                    </button>
                                )}
                                {row.importRunId !== null && (
                                    <button type="button" onClick={openHistory} className="w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-gray-50">
                                        Historie importu
                                    </button>
                                )}
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <section className="rounded-xl border bg-white p-5">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-[160px_1fr] gap-2">
                                <span className="text-gray-500">Datum přijetí</span>
                                <span>{formatDate(row.paidAt)}</span>
                            </div>
                            <div className="grid grid-cols-[160px_1fr] gap-2">
                                <span className="text-gray-500">Částka</span>
                                <span className="font-semibold text-green-700">{formatAmount(row.amount)}</span>
                            </div>
                            <div className="grid grid-cols-[160px_1fr] gap-2">
                                <span className="text-gray-500">Stav</span>
                                <Badge className={`w-fit border text-xs font-normal ${STATUS_BADGE[row.reconciliationStatus]}`}>
                                    {STATUS_LABELS[row.reconciliationStatus]}
                                </Badge>
                            </div>
                            <div className="grid grid-cols-[160px_1fr] gap-2">
                                <span className="text-gray-500">Zdroj</span>
                                <span>{sourceLabel(row)}</span>
                            </div>
                            <div className="grid grid-cols-[160px_1fr] gap-2">
                                <span className="text-gray-500">Variabilní symbol</span>
                                <span className="font-mono">{row.variableSymbol ?? "—"}</span>
                            </div>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-[140px_1fr] gap-2">
                                <span className="text-gray-500">Protistrana</span>
                                <span>{row.counterpartyName ?? "—"}</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] gap-2">
                                <span className="text-gray-500">Číslo účtu</span>
                                <span className="font-mono">{row.counterpartyAccount ?? "—"}</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] gap-2">
                                <span className="text-gray-500">Zpráva</span>
                                <span>{row.message ?? "—"}</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] gap-2">
                                <span className="text-gray-500">Poznámka</span>
                                <span>{row.note ?? "—"}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border bg-white p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold text-gray-700">Párování / alokace</h2>
                        {row.allocations.length > 1 && <span className="text-xs text-gray-400">{row.allocations.length} alokace</span>}
                    </div>

                    {row.allocations.length === 0 ? (
                        <p className="text-sm text-gray-400">Platba zatím není spárovaná.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-xs text-gray-500">
                                        <th className="px-3 py-2 text-left font-medium">Člen</th>
                                        <th className="px-3 py-2 text-left font-medium">Příspěvek</th>
                                        <th className="px-3 py-2 text-right font-medium">Částka</th>
                                        <th className="px-3 py-2 text-left font-medium">Stav</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {row.allocations.map(allocation => (
                                        <tr key={allocation.id} className="border-b last:border-0">
                                            <td className="px-3 py-2">
                                                <button type="button" onClick={() => openMember(allocation.memberId)} className="font-medium text-[#327600] hover:underline">
                                                    {allocation.memberName}
                                                </button>
                                            </td>
                                            <td className="px-3 py-2">
                                                <button type="button" onClick={() => openContribution(allocation)} className="text-[#327600] hover:underline">
                                                    {allocation.periodYear ?? paymentYear}
                                                </button>
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">{formatAmount(allocation.amount)}</td>
                                            <td className="px-3 py-2">
                                                {allocation.isSuggested ? (
                                                    <Badge className="border-0 bg-blue-100 text-xs font-normal text-blue-700">auto-návrh</Badge>
                                                ) : (
                                                    <Badge className="border-0 bg-green-100 text-xs font-normal text-green-800">potvrzeno</Badge>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className="rounded-xl border bg-white p-5">
                    <h2 className="mb-4 text-sm font-semibold text-gray-700">Workflow</h2>

                    {row.reconciliationStatus === "unmatched" && (
                        <div className="space-y-3 text-sm">
                            <p className="text-gray-600">Platba zatím není spárovaná. Vyber člena ručně, rozděl částku, nebo zkus znovu auto-match.</p>
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={() => openMatchDialog("match")} className="bg-[#327600] hover:bg-[#2a6400]">Spárovat</Button>
                                <Button variant="outline" onClick={() => openMatchDialog("split")}>Rozdělit</Button>
                                <Button variant="outline" onClick={handleAutoMatch}>Zkusit auto-match</Button>
                                <Button variant="outline" onClick={() => setIgnoreOpen(true)} className="border-amber-200 text-amber-700 hover:bg-amber-50">Ignorovat</Button>
                            </div>
                        </div>
                    )}

                    {row.reconciliationStatus === "suggested" && (
                        <div className="space-y-3 text-sm">
                            <p className="text-gray-600">
                                Navrhované párování: {row.allocations[0]?.memberName ?? "neznámý člen"}
                                {row.allocations[0]?.periodYear ? ` — ${row.allocations[0]?.periodYear}` : ""}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={handleConfirmSuggested} className="bg-[#327600] hover:bg-[#2a6400]">Potvrdit</Button>
                                <Button variant="outline" onClick={() => openMatchDialog("match")}>Jiný člen</Button>
                                <Button variant="outline" onClick={() => openMatchDialog("split")}>Rozdělit</Button>
                                <Button variant="outline" onClick={() => setIgnoreOpen(true)} className="border-amber-200 text-amber-700 hover:bg-amber-50">Ignorovat</Button>
                            </div>
                        </div>
                    )}

                    {row.reconciliationStatus === "confirmed" && (
                        <div className="space-y-3 text-sm">
                            <p className="text-gray-600">Platba je potvrzeně spárovaná. V případě potřeby ji můžeš odpárovat a zpracovat znovu.</p>
                            <div className="flex flex-wrap gap-2">
                                {primaryAllocation && (
                                    <>
                                        <Button variant="outline" onClick={() => openContribution(primaryAllocation)}>Příspěvek</Button>
                                        <Button variant="outline" onClick={() => openMember(primaryAllocation.memberId)}>Člen</Button>
                                    </>
                                )}
                                <Button variant="outline" onClick={handleUnmatch} className="border-red-200 text-red-600 hover:bg-red-50">Odpárovat</Button>
                            </div>
                        </div>
                    )}

                    {row.reconciliationStatus === "ignored" && (
                        <div className="space-y-3 text-sm">
                            <p className="text-gray-600">Důvod ignorace: {row.note ?? "neuveden"}</p>
                            <div>
                                <Button variant="outline" onClick={handleUnmatch}>Obnovit</Button>
                            </div>
                        </div>
                    )}

                    {(pickerPending || actionPending) && <p className="text-xs text-gray-400">Probíhá…</p>}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </section>

                {(row.importRunId !== null || row.fioBankTxId !== null) && (
                    <section className="rounded-xl border bg-white p-5">
                        <h2 className="mb-4 text-sm font-semibold text-gray-700">Importní kontext</h2>

                        {row.importRunId !== null && (
                            <div className="grid gap-3 text-sm md:grid-cols-2">
                                <div>
                                    <p className="text-xs text-gray-400">Importní běh</p>
                                    <p className="font-medium text-gray-800">{row.importImportedAt ? formatDateTime(row.importImportedAt) : "—"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400">Profil</p>
                                    <p className="font-medium text-gray-800">{row.profileName ?? "—"}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <p className="text-xs text-gray-400">Zdrojový soubor</p>
                                    <p className="font-medium text-gray-800">{row.importFilename ?? "—"}</p>
                                </div>
                            </div>
                        )}

                        {row.sourceType === "fio_bank" && row.fioBankTxId !== null && (
                            <div className="text-sm">
                                <p className="text-xs text-gray-400">Fio transakce</p>
                                <p className="font-medium text-gray-800">#{row.fioBankTxId}</p>
                            </div>
                        )}

                        {row.importRunId !== null && (
                            <div className="mt-4">
                                <Button variant="outline" onClick={openHistory}>Otevřít historii importů</Button>
                            </div>
                        )}
                    </section>
                )}
            </div>

            <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Spárovat platbu</DialogTitle>
                    </DialogHeader>
                    {candidates ? (
                        <MatchModal
                            ledgerId={row.id}
                            amount={row.amount}
                            candidates={candidates}
                            onSuccess={() => {
                                setMatchOpen(false);
                                refresh();
                            }}
                            onCancel={() => setMatchOpen(false)}
                        />
                    ) : (
                        <p className="text-sm text-gray-400">Načítám členy…</p>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
                <DialogContent className="sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Rozdělit platbu</DialogTitle>
                    </DialogHeader>
                    {candidates ? (
                        <SplitModal
                            ledgerId={row.id}
                            total={row.amount}
                            candidates={candidates}
                            onSuccess={() => {
                                setSplitOpen(false);
                                refresh();
                            }}
                            onCancel={() => setSplitOpen(false)}
                        />
                    ) : (
                        <p className="text-sm text-gray-400">Načítám členy…</p>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={ignoreOpen} onOpenChange={setIgnoreOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Ignorovat platbu</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="ignore-note">Důvod ignorace</Label>
                            <Textarea
                                id="ignore-note"
                                rows={4}
                                value={ignoreNote}
                                onChange={event => setIgnoreNote(event.target.value)}
                                placeholder="Vratka, nečlenská platba, test…"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleIgnore} className="bg-amber-600 text-white hover:bg-amber-700">Ignorovat</Button>
                            <Button variant="outline" onClick={() => setIgnoreOpen(false)}>Zrušit</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}