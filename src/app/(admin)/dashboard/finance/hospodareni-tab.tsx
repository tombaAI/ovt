"use client";

import { CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HospodareniWithReconciliation } from "@/lib/actions/finance-tj";

function formatDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
}

function fmtNum(n: number): string {
    if (n === 0) return "—";
    return n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Kč";
}

// ── Karta jednoho importu hospodaření ─────────────────────────────────────────

function HospodareniCard({ item }: { item: HospodareniWithReconciliation }) {
    const { imp, oddilRow, txVysledek, txFrom, txTo } = item;

    const hasTx        = txFrom !== null;
    const diff         = oddilRow ? oddilRow.vysledek - txVysledek : 0;
    const matched      = hasTx && Math.abs(diff) < 0.01;
    // Pokud položky nepokrývají celé období → rozdíl může být způsoben chybějícími importy
    const partialCover = hasTx && (txFrom! > imp.periodFrom || (txTo ?? "") < imp.periodTo);

    return (
        <div className="rounded-lg border bg-white overflow-hidden">
            {/* Záhlaví */}
            <div className="px-5 py-3 bg-gray-50 border-b flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-medium text-gray-900 text-sm">
                        {oddilRow
                            ? `Oddíl ${oddilRow.oddilId} · ${oddilRow.oddilName}`
                            : `Oddíl ${process.env.NEXT_PUBLIC_TJ_ODDIL_ID ?? "207"} – nenalezen v importu`}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(imp.periodFrom)} – {formatDate(imp.periodTo)}
                        {imp.prevodYear && ` · přenos z roku ${imp.prevodYear}`}
                        {imp.fileName && ` · ${imp.fileName}`}
                    </p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                    importováno {imp.importedAt.toLocaleDateString("cs-CZ")}
                </span>
            </div>

            {!oddilRow ? (
                <div className="px-5 py-4 text-sm text-gray-400">Data oddílu v tomto importu nejsou dostupná.</div>
            ) : (
                <div className="px-5 py-4 space-y-3 text-sm">

                    {/* Náklady / výnosy */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Náklady</span>
                            <span className={cn("font-mono tabular-nums", oddilRow.naklady > 0 ? "text-red-700" : "text-gray-400")}>
                                {fmtNum(oddilRow.naklady)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Výnosy</span>
                            <span className={cn("font-mono tabular-nums", oddilRow.vynosy > 0 ? "text-green-700" : "text-gray-400")}>
                                {fmtNum(oddilRow.vynosy)}
                            </span>
                        </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Hospodářský výsledek + rekonciliace */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500">Hospodářský výsledek (tabulka)</span>
                            <span className={cn("font-mono tabular-nums font-medium", oddilRow.vysledek < 0 ? "text-red-700" : "text-green-700")}>
                                {fmtNum(oddilRow.vysledek)}
                            </span>
                        </div>

                        <div className="flex justify-between items-center">
                            <span className="text-gray-500">Hospodářský výsledek (z položek)</span>
                            {!hasTx ? (
                                <span className="flex items-center gap-1 text-xs text-gray-400">
                                    <MinusCircle className="h-3.5 w-3.5" />
                                    Bez dat z výsledovek
                                </span>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className={cn("font-mono tabular-nums font-medium", txVysledek < 0 ? "text-red-700" : "text-green-700")}>
                                        {fmtNum(txVysledek)}
                                    </span>
                                    {matched ? (
                                        <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Sedí
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
                                            <AlertTriangle className="h-3.5 w-3.5" /> Rozdíl {fmtNum(Math.abs(diff))}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {partialCover && !matched && (
                            <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1.5">
                                Výsledovky pokrývají jen část období ({formatDate(txFrom!)} – {formatDate(txTo!)}).
                                Rozdíl může být způsoben chybějícími importy výsledovek.
                            </p>
                        )}
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Zůstatek */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500">
                                Přenos {imp.prevodYear ? `z roku ${imp.prevodYear}` : "z předchozího roku"}
                            </span>
                            <span className={cn("font-mono tabular-nums", oddilRow.prevod < 0 ? "text-red-700" : "text-gray-700")}>
                                {fmtNum(oddilRow.prevod)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-700 font-semibold">Zůstatek na podúčtu</span>
                            <span className={cn("font-mono tabular-nums font-bold text-base", oddilRow.celkem < 0 ? "text-red-700" : "text-green-700")}>
                                {fmtNum(oddilRow.celkem)}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Export ────────────────────────────────────────────────────────────────────

export function HospodareniTab({ data }: { data: HospodareniWithReconciliation[] }) {
    if (data.length === 0) {
        return (
            <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
                <p className="text-sm">Zatím žádné importy výsledků hospodaření.</p>
                <p className="text-xs mt-1">Nahrajte PDF pomocí tlačítka &bdquo;Import tabulka stavů&ldquo;.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {data.map(item => (
                <HospodareniCard key={item.imp.id} item={item} />
            ))}
        </div>
    );
}
