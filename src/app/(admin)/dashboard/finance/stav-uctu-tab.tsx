"use client";

import { CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StavUctuData, StavRok } from "@/lib/actions/finance-tj";

function formatDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
}

function fmtKc(n: number): string {
    return n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Kč";
}

// ── Jeden řádek karty ─────────────────────────────────────────────────────────

function Radek({ label, value, sub, bold, colorClass }: {
    label: string; value: number; sub?: string; bold?: boolean; colorClass?: string;
}) {
    const isZero = value === 0;
    return (
        <div className={cn(
            "flex justify-between items-baseline gap-4",
            bold && "pt-1.5 mt-1 border-t border-gray-200"
        )}>
            <span className={cn("text-sm", bold ? "font-semibold text-gray-900" : "text-gray-500")}>
                {label}
                {sub && <span className="text-xs text-gray-400 ml-1.5">({sub})</span>}
            </span>
            <span className={cn(
                "font-mono tabular-nums shrink-0",
                bold ? "font-bold text-base" : "text-sm",
                isZero ? "text-gray-300" : (colorClass ?? (value < 0 ? "text-red-700" : "text-green-700")),
            )}>
                {isZero ? "—" : fmtKc(value)}
            </span>
        </div>
    );
}

// ── Karta jednoho roku ────────────────────────────────────────────────────────

function RokKarta({ rok }: { rok: StavRok }) {
    const { year, startBalance, endBalance, naklady, vynosy, txVysledek,
            txCount, isComplete, matches, snapshot, latestTxDate } = rok;

    // Pro neuzavřený rok: odhadovaný zůstatek = startBalance + txVysledek
    const estimatedBalance = startBalance !== null ? startBalance + txVysledek : null;

    return (
        <div className={cn(
            "rounded-lg border overflow-hidden",
            isComplete ? "bg-white" : "bg-blue-50/40 border-blue-200"
        )}>
            {/* Záhlaví */}
            <div className={cn(
                "px-4 py-2 border-b flex items-center gap-2",
                isComplete ? "bg-gray-50 border-gray-200" : "bg-blue-50 border-blue-100"
            )}>
                {!isComplete && <TrendingUp className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                <span className="font-semibold text-gray-900">{year}</span>
                <span className="text-xs text-gray-400">
                    {isComplete ? "roční výsledek" : "průběžné · bez uzavřené tabulky"}
                </span>
            </div>

            {/* Tělo */}
            <div className="px-4 py-3 space-y-1.5">
                {startBalance !== null && (
                    <Radek
                        label="Počáteční zůstatek"
                        sub={`k 31.12.${year - 1}`}
                        value={startBalance}
                        colorClass={startBalance < 0 ? "text-red-700" : "text-gray-700"}
                    />
                )}
                <Radek label="Náklady" value={naklady} colorClass="text-red-700" />
                <Radek label="Výnosy"  value={vynosy}  colorClass="text-green-700" />

                {isComplete ? (
                    <>
                        <Radek
                            label="Konečný zůstatek"
                            sub={`k 31.12.${year}`}
                            value={endBalance!}
                            bold
                        />
                        <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                            <span className="text-gray-400">Rekonciliace ({txCount} položek)</span>
                            {matches === true ? (
                                <span className="flex items-center gap-0.5 text-green-600 font-medium">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Sedí
                                </span>
                            ) : matches === false ? (
                                <span className="flex items-center gap-0.5 text-amber-600 font-medium">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Rozdíl {fmtKc(Math.abs((endBalance! - startBalance!) - txVysledek))}
                                </span>
                            ) : (
                                <span className="text-gray-400">nelze ověřit</span>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        {estimatedBalance !== null && (
                            <Radek
                                label="Odhadovaný zůstatek"
                                sub={latestTxDate ? `k ${formatDate(latestTxDate)}` : "aktuální"}
                                value={estimatedBalance}
                                bold
                            />
                        )}
                        {/* Průběžná tabulka jako ověřovací bod */}
                        {snapshot && (
                            <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                                <span className="text-gray-400">
                                    Tabulka k {formatDate(snapshot.date)}: {fmtKc(snapshot.balance)}
                                </span>
                                {estimatedBalance !== null && (() => {
                                    // Ověř snapshot vůči startBalance + tx do data snapshotu
                                    return null; // jednoduše zobrazíme hodnotu bez extra checkboxu
                                })()}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ── Hlavní tab ────────────────────────────────────────────────────────────────

export function StavUctuTab({ data }: { data: StavUctuData }) {
    const { years, oddilName } = data;

    if (years.length === 0) {
        return (
            <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
                <p className="text-sm">Zatím žádná data o stavu účtu.</p>
                <p className="text-xs mt-1">Nahrajte PDF &bdquo;výsledky hospodaření&ldquo; pomocí tlačítka vpravo nahoře.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {oddilName && (
                <p className="text-xs text-gray-400 px-0.5">{oddilName}</p>
            )}
            {years.map(rok => (
                <RokKarta key={rok.year} rok={rok} />
            ))}
        </div>
    );
}
