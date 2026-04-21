"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sendContributionEmails, type SendEmailResult } from "@/lib/actions/contrib-emails";
import type { ContribRow } from "./page";

interface Props {
    open:         boolean;
    onOpenChange: (open: boolean) => void;
    rows:         ContribRow[];   // příjemci (1 nebo více)
    onSent?:      () => void;
}

export function SendEmailDialog({ open, onOpenChange, rows, onSent }: Props) {
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<SendEmailResult | null>(null);
    const [error, setError]   = useState<string | null>(null);

    const withEmail    = rows.filter(r => r.email);
    const withoutEmail = rows.filter(r => !r.email);

    function handleClose() {
        if (isPending) return;
        setResult(null);
        setError(null);
        onOpenChange(false);
    }

    function handleSend() {
        setError(null);
        startTransition(async () => {
            const res = await sendContributionEmails(
                rows.map(r => r.contribId),
                "prescription",
            );
            if ("error" in res) {
                setError(res.error);
            } else {
                setResult({ sent: res.sent, failed: res.failed, noEmail: res.noEmail, errors: res.errors });
                onSent?.();
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[#327600]" />
                        {result
                            ? "Email odeslán"
                            : rows.length === 1
                                ? `Odeslat email — ${rows[0].firstName} ${rows[0].lastName}`
                                : `Odeslat emaily — ${rows.length} členů`
                        }
                    </DialogTitle>
                </DialogHeader>

                {result ? (
                    /* ── Výsledek ── */
                    <div className="space-y-3 py-1">
                        <div className="rounded-lg border border-[#327600]/20 bg-[#327600]/5 px-4 py-3 space-y-1 text-sm">
                            {result.sent > 0 && (
                                <p className="text-[#327600] font-medium">✓ Odesláno: {result.sent}</p>
                            )}
                            {result.noEmail > 0 && (
                                <p className="text-gray-500">⊘ Bez emailu (přeskočeno): {result.noEmail}</p>
                            )}
                            {result.failed > 0 && (
                                <p className="text-red-600">✕ Chyba při odesílání: {result.failed}</p>
                            )}
                        </div>
                        {result.errors.length > 0 && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-1">
                                {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                            </div>
                        )}
                        <DialogFooter>
                            <Button onClick={handleClose} className="bg-[#327600] hover:bg-[#327600]/90 text-white">
                                Zavřít
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    /* ── Potvrzení ── */
                    <div className="space-y-4 py-1">
                        {/* Příjemci */}
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                Příjemci ({withEmail.length})
                            </p>
                            <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
                                {withEmail.map(r => (
                                    <div key={r.contribId} className="flex items-center justify-between px-3 py-2 text-sm">
                                        <span className="font-medium text-gray-800">{r.firstName} {r.lastName}</span>
                                        <span className="text-gray-400 text-xs truncate max-w-[200px]">{r.email}</span>
                                    </div>
                                ))}
                                {withEmail.length === 0 && (
                                    <p className="px-3 py-4 text-sm text-gray-400 text-center">Žádný příjemce</p>
                                )}
                            </div>
                        </div>

                        {/* Varování — bez emailu */}
                        {withoutEmail.length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                <p className="font-semibold mb-1">Bez emailové adresy ({withoutEmail.length} — přeskočeni):</p>
                                {withoutEmail.map(r => (
                                    <p key={r.contribId}>{r.firstName} {r.lastName}</p>
                                ))}
                            </div>
                        )}

                        {/* Typ emailu */}
                        <p className="text-xs text-gray-400 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                            Bude odeslán email s předpisem příspěvků vč. rozpisuslužek a QR kódu pro platbu.
                        </p>

                        {error && <p className="text-sm text-red-600">{error}</p>}

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose} disabled={isPending}>
                                Zrušit
                            </Button>
                            <Button
                                onClick={handleSend}
                                disabled={isPending || withEmail.length === 0}
                                className="bg-[#327600] hover:bg-[#327600]/90 text-white"
                            >
                                {isPending
                                    ? "Odesílám…"
                                    : withEmail.length === 1
                                        ? "Odeslat email"
                                        : `Odeslat ${withEmail.length} emailů`
                                }
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
