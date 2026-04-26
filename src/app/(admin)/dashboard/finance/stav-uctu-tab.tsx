"use client";

import { CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StavUctuData, StavMilnik, StavBridge, StavTrailingSegment } from "@/lib/actions/finance-tj";

function formatDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
}

function fmtKc(n: number): string {
    return n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Kč";
}

// ── Jeden řádek v kartě ───────────────────────────────────────────────────────

function KartaRadek({
    label, value, sub, bold, colorClass,
}: {
    label: string;
    value: number;
    sub?: string;
    bold?: boolean;
    colorClass?: string;
}) {
    const isZero = value === 0;
    const defaultColor = value < 0 ? "text-red-700" : "text-green-700";
    return (
        <div className={cn("flex justify-between items-baseline gap-4", bold && "pt-1 mt-1 border-t border-gray-200")}>
            <span className={cn("text-sm", bold ? "font-semibold text-gray-900" : "text-gray-500")}>
                {label}
                {sub && <span className="text-xs text-gray-400 ml-1">({sub})</span>}
            </span>
            <span className={cn(
                "font-mono tabular-nums shrink-0",
                bold ? "font-bold text-base" : "text-sm",
                isZero ? "text-gray-300" : (colorClass ?? defaultColor),
            )}>
                {isZero ? "—" : fmtKc(value)}
            </span>
        </div>
    );
}

// ── Karta jednoho milníku ─────────────────────────────────────────────────────

function MilnikKarta({ m }: { m: StavMilnik }) {
    const year    = parseInt(m.date.substring(0, 4));
    const partial = !m.isYearEnd;

    return (
        <div className="rounded-lg border bg-white overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b flex items-baseline justify-between gap-3 flex-wrap">
                <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-gray-900">{year}</span>
                    {partial
                        ? <span className="text-xs text-gray-400">průběžný · {formatDate(m.periodFrom)} – {formatDate(m.date)}</span>
                        : <span className="text-xs text-gray-400">roční výsledek</span>
                    }
                </div>
                {m.fileName && (
                    <span className="text-xs text-gray-300 truncate max-w-[260px]" title={m.fileName}>{m.fileName}</span>
                )}
            </div>

            <div className="px-4 py-3 space-y-1.5">
                <KartaRadek
                    label="Počáteční zůstatek"
                    sub={m.prevodYear ? `přenos z roku ${m.prevodYear}` : `k ${formatDate(m.periodFrom)}`}
                    value={m.prevod}
                    colorClass={m.prevod < 0 ? "text-red-700" : "text-gray-700"}
                />
                <KartaRadek label="Náklady" value={m.naklady} colorClass="text-red-700" />
                <KartaRadek label="Výnosy"  value={m.vynosy}  colorClass="text-green-700" />
                <KartaRadek
                    label={partial ? `Zůstatek k ${formatDate(m.date)}` : "Konečný zůstatek"}
                    sub={partial ? undefined : `k ${formatDate(m.date)}`}
                    value={m.balance}
                    bold
                />
                <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                    <span className="text-gray-400">Rekonciliace z výsledovek ({m.txCount} položek)</span>
                    {m.matches ? (
                        <span className="flex items-center gap-0.5 text-green-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Sedí
                        </span>
                    ) : (
                        <span className="flex items-center gap-0.5 text-amber-600 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {m.txCount === 0 ? "Bez dat z výsledovek" : `Rozdíl ${fmtKc(Math.abs((m.vynosy - m.naklady) - m.txVysledek))}`}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Karta mezery (bridge) ─────────────────────────────────────────────────────

function BridgeKarta({ b }: { b: StavBridge }) {
    const fromYear = parseInt(b.fromDate.substring(0, 4));
    const toYear   = parseInt(b.toDate.substring(0, 4));
    const yearLabel = fromYear === toYear ? `${fromYear}` : `${fromYear}–${toYear}`;

    return (
        <div className="rounded-lg border border-gray-200 bg-gray-50/60 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-200 flex items-baseline justify-between gap-3 flex-wrap">
                <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-gray-700">{yearLabel}</span>
                    <span className="text-xs text-gray-400">
                        bez tabulky · {formatDate(b.fromDate)} – {formatDate(b.toDate)}
                    </span>
                </div>
            </div>
            <div className="px-4 py-3 space-y-1.5">
                <KartaRadek
                    label="Počáteční stav"
                    sub={`k ${formatDate(b.fromDate)}`}
                    value={b.fromBalance}
                    colorClass={b.fromBalance < 0 ? "text-red-700" : "text-gray-700"}
                />
                <KartaRadek
                    label="Pohyb z výsledovek"
                    sub={`${b.txCount} položek`}
                    value={b.txVysledek}
                />
                <KartaRadek
                    label="Stav k 31.12."
                    sub="z přenosu následujícího roku"
                    value={b.impliedToBalance}
                    bold
                />
                <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                    <span className="text-gray-400">Rekonciliace ({b.txCount} položek)</span>
                    {b.matches ? (
                        <span className="flex items-center gap-0.5 text-green-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Sedí
                        </span>
                    ) : (
                        <span className="flex items-center gap-0.5 text-amber-600 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {b.txCount === 0 ? "Bez dat z výsledovek" : `Rozdíl ${fmtKc(Math.abs(b.delta - b.txVysledek))}`}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Karta trailing segmentu ───────────────────────────────────────────────────

function TrailingKarta({ s }: { s: StavTrailingSegment }) {
    return (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 overflow-hidden">
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
                    <span className="font-medium text-sm text-gray-700">
                        Odhadovaný stav
                    </span>
                </div>
                <span className="text-xs text-gray-400">
                    od {formatDate(s.fromDate)} · {s.txCount} položek · bez tabulky stavů
                </span>
            </div>

            <div className="px-4 py-3 space-y-1.5">
                <KartaRadek
                    label="Počáteční stav"
                    sub={`k ${formatDate(s.fromDate)}`}
                    value={s.fromBalance}
                    colorClass={s.fromBalance < 0 ? "text-red-700" : "text-gray-700"}
                />
                <KartaRadek
                    label="Pohyb z výsledovek"
                    sub={s.latestTxDate ? `do ${formatDate(s.latestTxDate)}` : undefined}
                    value={s.txVysledek}
                />
                <KartaRadek
                    label="Odhadovaný zůstatek"
                    sub={s.latestTxDate ? `k ${formatDate(s.latestTxDate)}` : "aktuální"}
                    value={s.estimatedBalance}
                    bold
                />
            </div>
        </div>
    );
}

// ── Hlavní tab ────────────────────────────────────────────────────────────────

export function StavUctuTab({ data }: { data: StavUctuData }) {
    const { milestones, bridges, trailingSegment } = data;

    if (milestones.length === 0 && !trailingSegment) {
        return (
            <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
                <p className="text-sm">Zatím žádná data o stavu účtu.</p>
                <p className="text-xs mt-1">Nahrajte PDF &bdquo;výsledky hospodaření&ldquo; pomocí tlačítka vpravo nahoře.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {milestones.length > 0 && (
                <p className="text-xs text-gray-400 px-0.5">
                    Oddíl {milestones[0].oddilName}
                </p>
            )}
            {milestones.map((m, i) => (
                <div key={m.importId}>
                    <MilnikKarta m={m} />
                    {bridges[i] && <BridgeKarta b={bridges[i]!} />}
                </div>
            ))}
            {trailingSegment && (
                <TrailingKarta s={trailingSegment} />
            )}
        </div>
    );
}
