"use client";

import { CheckCircle2, AlertTriangle, MinusCircle, Circle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StavUctuData, StavMilnik, StavSegment, StavTrailingSegment } from "@/lib/actions/finance-tj";

function formatDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
}

function fmtKc(n: number): string {
    return n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Kč";
}

// ── Řádek milníku ─────────────────────────────────────────────────────────────

function MilnikRow({ m }: { m: StavMilnik }) {
    const isNeg = m.balance < 0;
    const label = m.isYearEnd
        ? `Stav k 31.12.${m.date.substring(0, 4)}`
        : `Stav k ${formatDate(m.date)}`;

    return (
        <div className="flex items-start gap-3 py-3">
            {/* Ikona milníku */}
            <div className="flex flex-col items-center gap-0 shrink-0 mt-0.5">
                <Circle className={cn("h-4 w-4 fill-current", m.isYearEnd ? "text-gray-700" : "text-gray-400")} />
            </div>

            {/* Obsah */}
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                    <div>
                        <span className="text-xs text-gray-400 mr-2">{formatDate(m.date)}</span>
                        <span className={cn("font-medium text-sm", m.isYearEnd ? "text-gray-900" : "text-gray-700")}>
                            {label}
                        </span>
                    </div>
                    <span className={cn(
                        "font-mono tabular-nums font-semibold",
                        m.isYearEnd ? "text-base" : "text-sm",
                        isNeg ? "text-red-700" : "text-green-700"
                    )}>
                        {fmtKc(m.balance)}
                    </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                    {m.fileName ?? "výsledky hospodaření"}
                    {m.periodFrom && m.periodFrom !== m.date.substring(0, 4) + "-01-01"
                        ? ` · ${formatDate(m.periodFrom)} – ${formatDate(m.date)}`
                        : ""}
                </p>
            </div>
        </div>
    );
}

// ── Řádek segmentu (transakce mezi milníky) ───────────────────────────────────

function SegmentRow({ s }: { s: StavSegment }) {
    const noTx = s.txCount === 0;

    return (
        <div className="flex items-start gap-3 py-2 ml-0">
            {/* Svislá čára segmentu */}
            <div className="flex flex-col items-center shrink-0 w-4">
                <div className="w-px flex-1 bg-gray-200 min-h-[28px]" />
            </div>

            {/* Obsah segmentu */}
            <div className="flex-1 min-w-0 bg-gray-50 rounded-md px-3 py-2 text-xs border border-gray-100">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <span className="text-gray-500">
                            Transakce {formatDate(s.fromDate)} – {formatDate(s.toDate)}
                        </span>
                        {noTx ? (
                            <span className="ml-2 text-gray-400 flex items-center gap-0.5 inline-flex">
                                <MinusCircle className="h-3 w-3" /> bez dat z výsledovek
                            </span>
                        ) : (
                            <span className="ml-2 text-gray-500">· {s.txCount} položek</span>
                        )}
                    </div>

                    {!noTx && (
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            <span className={cn(
                                "font-mono tabular-nums font-medium",
                                s.txVysledek < 0 ? "text-red-700" : "text-green-700"
                            )}>
                                {s.txVysledek >= 0 ? "+" : ""}{fmtKc(s.txVysledek)}
                            </span>

                            {s.matches ? (
                                <span className="flex items-center gap-0.5 text-green-600 font-medium">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Sedí
                                </span>
                            ) : (
                                <span className="flex items-center gap-0.5 text-amber-600 font-medium">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Rozdíl {fmtKc(Math.abs(s.delta - s.txVysledek))}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Očekávaný pohyb (delta milníků) – zobrazit pokud nesedí */}
                {!noTx && !s.matches && (
                    <p className="text-gray-400 mt-1">
                        Očekávaný pohyb (z milníků): {s.delta >= 0 ? "+" : ""}{fmtKc(s.delta)}
                        {" — "}výsledovky pokrývají jen část období nebo chybí import
                    </p>
                )}
            </div>
        </div>
    );
}

// ── Trailing segment (transakce po posledním milníku) ─────────────────────────

function TrailingSegmentBlock({ s }: { s: StavTrailingSegment }) {
    const isNeg = s.estimatedBalance < 0;

    return (
        <div>
            {/* Segment čára + obsah */}
            <div className="flex items-start gap-3 py-2">
                <div className="flex flex-col items-center shrink-0 w-4">
                    <div className="w-px flex-1 bg-gray-200 min-h-[28px]" />
                </div>
                <div className="flex-1 min-w-0 bg-blue-50 rounded-md px-3 py-2 text-xs border border-blue-100">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <span className="text-gray-500">
                            Transakce {formatDate(s.fromDate)} – {s.latestTxDate ? formatDate(s.latestTxDate) : "dnes"}
                            <span className="ml-2 text-gray-400">· {s.txCount} položek</span>
                        </span>
                        <span className={cn(
                            "font-mono tabular-nums font-medium",
                            s.txVysledek < 0 ? "text-red-700" : "text-green-700"
                        )}>
                            {s.txVysledek >= 0 ? "+" : ""}{fmtKc(s.txVysledek)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Odhadovaný aktuální zůstatek */}
            <div className="flex items-start gap-3 py-3">
                <div className="flex flex-col items-center shrink-0 mt-0.5">
                    <TrendingUp className="h-4 w-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-4 flex-wrap">
                        <div>
                            <span className="text-xs text-gray-400 mr-2">{s.latestTxDate ? formatDate(s.latestTxDate) : "dnes"}</span>
                            <span className="font-medium text-sm text-gray-600">Odhadovaný aktuální zůstatek</span>
                        </div>
                        <span className={cn(
                            "font-mono tabular-nums font-semibold text-base",
                            isNeg ? "text-red-700" : "text-green-700"
                        )}>
                            {fmtKc(s.estimatedBalance)}
                        </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">bez dalšího výsledku hospodaření</p>
                </div>
            </div>
        </div>
    );
}

// ── Oddělovač roku ────────────────────────────────────────────────────────────

function YearDivider({ year, isCurrent }: { year: number; isCurrent: boolean }) {
    return (
        <div className="flex items-center gap-3 pt-4 pb-1">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-semibold text-gray-500 shrink-0">
                {year}{isCurrent && " (průběžné)"}
            </span>
            <div className="flex-1 h-px bg-gray-200" />
        </div>
    );
}

// ── Hlavní tab ────────────────────────────────────────────────────────────────

export function StavUctuTab({ data }: { data: StavUctuData }) {
    const { milestones, segments, trailingSegment } = data;

    if (milestones.length === 0) {
        return (
            <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
                <p className="text-sm">Zatím žádná data o stavu účtu.</p>
                <p className="text-xs mt-1">Nahrajte PDF &bdquo;výsledky hospodaření&ldquo; pomocí tlačítka vpravo nahoře.</p>
            </div>
        );
    }

    const currentYear = new Date().getFullYear();
    let lastYear = -1;

    return (
        <div className="rounded-lg border bg-white px-5 py-2">
            {/* Záhlaví: oddíl */}
            <p className="text-xs text-gray-400 pt-3 pb-1">
                Oddíl {process.env.NEXT_PUBLIC_TJ_ODDIL_ID ?? "207"} · {milestones[0]?.oddilName}
            </p>

            {/* Timeline */}
            <div>
                {milestones.map((m, i) => {
                    const year = parseInt(m.date.substring(0, 4));
                    const yearChanged = year !== lastYear;
                    if (yearChanged) lastYear = year;
                    const isCurrent = !m.isYearEnd || year === currentYear;
                    const segment = i > 0 ? segments[i - 1] : null;

                    return (
                        <div key={m.importId}>
                            {yearChanged && <YearDivider year={year} isCurrent={isCurrent && !m.isYearEnd} />}
                            {segment && <SegmentRow s={segment} />}
                            <MilnikRow m={m} />
                        </div>
                    );
                })}

                {/* Trailing: transakce po posledním milníku */}
                {trailingSegment && (
                    <TrailingSegmentBlock s={trailingSegment} />
                )}
            </div>
        </div>
    );
}
