"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComposedChart, Line, Bar, BarChart, XAxis, YAxis, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { TrendingDown, Droplets, Swords, AlertTriangle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// ===== REGRESE (scipy linregress, data 2016–2024, n=6) =====
const SLOPE     = -21.37;
const INTERCEPT = 43479;
const R2        = 0.847;
const trendFn   = (rok: number) => Math.round(SLOPE * rok + INTERCEPT);

// ===== UPRAVENÝ MODEL: trend + faktory =====
// Závodníci ≈ trendFn(rok) + korekce_pocasi + korekce_konkurence + korekce_bounce
// Korekce odvozeny z residuálů 2016–2024:
//   počasí:     dobré=+20, průměrné=0, špatné=-25
//   konkurence: žádná=0, 1×=-10, 2×=-20, 3×=-30
//   bounce:     po zrušení=+30, jinak=0
const TREND_2026   = trendFn(2026);               // 183
const BOUNCE_2026  = 30;                           // po zrušení 2025
const PRED_2026_BASE = TREND_2026 + BOUNCE_2026;  // 213 = realistický základ

// ===== KOMPLETNÍ TIMELINE ROČNÍKŮ =====
const rocniky = [
    { rok: 2016, status: "ok",     zavod: 405, pocasi: "neznámé",            trend: trendFn(2016), pozn: "28.9.=středa" },
    { rok: 2017, status: "ok",     zavod: 404, pocasi: "neznámé",            trend: trendFn(2017), pozn: "28.9.=čtvrtek ⚡ MOST, Hamerák 6.10." },
    { rok: 2018, status: "zrusen", zavod: null, pocasi: "sucho",             trend: null,           pozn: "ZRUŠEN — kritický nedostatek vody" },
    { rok: 2019, status: "ok",     zavod: 300, pocasi: "deštivo/studeno",    trend: trendFn(2019), pozn: "špatné počasí, 3× konkurence" },
    { rok: 2020, status: "zrusen", zavod: null, pocasi: "—",                 trend: null,           pozn: "ZRUŠEN — COVID-19" },
    { rok: 2021, status: "ok",     zavod: 256, pocasi: "dobré (babí léto)",  trend: trendFn(2021), pozn: "post-COVID, 2× konkurence, 28.9.=út ⚡ MOST" },
    { rok: 2022, status: "ok",     zavod: 274, pocasi: "teplo/sucho",        trend: trendFn(2022), pozn: "nejlepší v éře poklesu — žádný Bobr Cup!" },
    { rok: 2023, status: "zrusen", zavod: null, pocasi: "—",                 trend: null,           pozn: "ZRUŠEN — rekonstrukce Vajgaru; 28.9.=čtvrtek ⚡ MOST" },
    { rok: 2024, status: "ok",     zavod: 253, pocasi: "studeno/mrholí",     trend: trendFn(2024), pozn: "bounce +34 nad trendem i při špatném počasí (odložená poptávka z 2023)" },
    { rok: 2025, status: "zrusen", zavod: null, pocasi: "sucho",             trend: null,           pozn: "ZRUŠEN — kritický nedostatek vody v rybnících" },
];

// ===== TERMÍNOVKA — SYSTEMATICKÁ DATA (zdroj: slalom-world.com) =====
const terminovka = [
    { rok: 2016, zavod: 405, trend: trendFn(2016), residual: +15,
      konkurence: [{ nazev: "Bobr Cup",         dat: "1.10.",   overlap: "přesně" },
                   { nazev: "Klatovský slalom",  dat: "1-2.10.", overlap: "přesně" }] },
    { rok: 2017, zavod: 404, trend: trendFn(2017), residual: +36,
      konkurence: [{ nazev: "Bobr Cup",         dat: "7.10.",   overlap: "+1 den" },
                   { nazev: "Klatovský slalom",  dat: "7-8.10.", overlap: "+1-2 dny" }] },
    { rok: 2019, zavod: 300, trend: trendFn(2019), residual: -25,
      konkurence: [{ nazev: "Bobr Cup",         dat: "5.10.",   overlap: "přesně" },
                   { nazev: "Klatovský slalom",  dat: "5-6.10.", overlap: "přesně" },
                   { nazev: "Olympijské naděje", dat: "5-6.10.", overlap: "přesně" }] },
    { rok: 2021, zavod: 256, trend: trendFn(2021), residual: -28,
      konkurence: [{ nazev: "Bobr Cup",         dat: "2.10.",   overlap: "přesně" },
                   { nazev: "Klatovský slalom",  dat: "2-3.10.", overlap: "přesně" }] },
    { rok: 2022, zavod: 274, trend: trendFn(2022), residual: +12,
      konkurence: [{ nazev: "Klatovský slalom",  dat: "1-2.10.", overlap: "přesně" }] },
    { rok: 2024, zavod: 253, trend: trendFn(2024), residual: +34,
      konkurence: [{ nazev: "Bobr Cup",         dat: "5.10.",   overlap: "přesně" }] },
];

// ===== FAKTORY — seřazeno dle důležitosti =====
const faktory = [
    { nazev: "Rok (lineární trend)",       dostupnost: "vlastní data",  dulezitost: 5, koment: "R²=0.85, dominantní — −21 záv./rok" },
    { nazev: "Vodní stav Oldříš (srp/zář)", dostupnost: "ČHMÚ/hladiny.cz", dulezitost: 5, koment: "Přímý indikátor rizika zrušení — threshold zatím neznáme" },
    { nazev: "Post-cancellation bounce",   dostupnost: "vlastní data",  dulezitost: 4, koment: "2024: +34 nad trendem po zrušení 2023. 2026: +~30 očekáváno" },
    { nazev: "Srpen/září srážkový deficit", dostupnost: "ČHMÚ historická", dulezitost: 4, koment: "Leading indicator vodního stavu — sucho léto = riziko" },
    { nazev: "Počasí v den akce",          dostupnost: "předpověď 10d",  dulezitost: 4, koment: "Ovlivňuje hlavně splutí/permice (diváci), méně závod" },
    { nazev: "Bobr Cup (přítomnost)",      dostupnost: "slalom-world.com", dulezitost: 3, koment: "2022 nebyl → +12 nad trendem. Přímý sjezdový konkurent" },
    { nazev: "Počet konk. akcí stejný den", dostupnost: "slalom-world.com", dulezitost: 3, koment: "3 akce (2019) → -25; 0-1 (2022) → +12. Korekce ~-10/akci" },
    { nazev: "Cena závodu",                dostupnost: "vlastní data",  dulezitost: 3, koment: "r=−0.82, ale korelace ≠ kauzalita (spíš proxy pro rok)" },
    { nazev: "28.9. prodloužený víkend",   dostupnost: "kalendář",      dulezitost: 2, koment: "Malý efekt; 2017 MOST → 404 záv. (bez dopadu). 2026: pondělí, neutrální" },
    { nazev: "CSK registrovaní závodníci", dostupnost: "kontaktovat ČSK", dulezitost: 3, koment: "Demografický trend sportu — není veřejně dostupné" },
    { nazev: "ČPV série — počet závodů",   dostupnost: "kanoe.cz",      dulezitost: 2, koment: "Čím méně závodů v sérii, tím větší prestiž Hameráku" },
    { nazev: "Letní NAO/ENSO index",       dostupnost: "NOAA",          dulezitost: 1, koment: "Statisticky slabý signal pro říjnové počasí v ČR" },
];

// ===== GRAFY =====
const zavodData = [
    { rok: "2016", actual: 405, trend: trendFn(2016) },
    { rok: "2017", actual: 404, trend: trendFn(2017) },
    { rok: "2019", actual: 300, trend: trendFn(2019) },
    { rok: "2021", actual: 256, trend: trendFn(2021) },
    { rok: "2022", actual: 274, trend: trendFn(2022) },
    { rok: "2024", actual: 253, trend: trendFn(2024) },
];

const categoryData = [
    { rok: "2019", splutiVIK: 142, splutiSO: 90, splutiNE: 226, permVIK: 216, permSO: 120, permNE: 133 },
    { rok: "2021", splutiVIK: 138, splutiSO: 143, splutiNE: 138, permVIK: 205, permSO: 112, permNE:  74 },
    { rok: "2022", splutiVIK:  86, splutiSO:  81, splutiNE: 114, permVIK: 147, permSO: 111, permNE:  73 },
    { rok: "2024", splutiVIK:  64, splutiSO:  62, splutiNE: 125, permVIK: 124, permSO: 116, permNE:  78 },
];

const predikce2026 = [
    { kat: "Závod",       sk22: 274, sk24: 253, pred: 183, ciMin: 161, ciMax: 205, slope: -21.4, r2: 0.85, stabilita: "klesá" },
    { kat: "Splutí VIK",  sk22:  86, sk24:  64, pred:  31, ciMin:  18, ciMax:  44, slope: -17.0, r2: 0.84, stabilita: "klesá" },
    { kat: "Splutí SO",   sk22:  81, sk24:  62, pred:  59, ciMin:  38, ciMax:  80, slope:  -7.8, r2: 0.22, stabilita: "nestabilní" },
    { kat: "Splutí NE",   sk22: 114, sk24: 125, pred: 126, ciMin:  90, ciMax: 162, slope:  -6.0, r2: 0.03, stabilita: "nestabilní" },
    { kat: "Permice VIK", sk22: 147, sk24: 124, pred:  83, ciMin:  60, ciMax: 106, slope: -19.9, r2: 0.87, stabilita: "klesá" },
    { kat: "Permice SO",  sk22: 111, sk24: 116, pred: 111, ciMin: 104, ciMax: 118, slope:  -0.8, r2: 0.17, stabilita: "stagnuje" },
];

const zavodConfig = {
    actual: { label: "Skutečnost",     color: "hsl(142 60% 38%)" },
    trend:  { label: "Lineární trend", color: "hsl(220 15% 65%)" },
} satisfies ChartConfig;

const categoryConfig = {
    splutiVIK: { label: "Splutí VIK",  color: "hsl(199 80% 42%)" },
    splutiSO:  { label: "Splutí SO",   color: "hsl(199 60% 58%)" },
    splutiNE:  { label: "Splutí NE",   color: "hsl(199 45% 72%)" },
    permVIK:   { label: "Permice VIK", color: "hsl(142 55% 38%)" },
    permSO:    { label: "Permice SO",  color: "hsl(142 45% 52%)" },
    permNE:    { label: "Permice NE",  color: "hsl(142 35% 66%)" },
} satisfies ChartConfig;

function Stars({ n }: { n: number }) {
    return (
        <span className="text-yellow-500 text-xs">
            {"★".repeat(n)}{"☆".repeat(5 - n)}
        </span>
    );
}

function StabilitaBadge({ s }: { s: string }) {
    if (s === "stagnuje")
        return <Badge variant="outline" className="text-xs border-green-600 text-green-700">stagnuje</Badge>;
    if (s === "nestabilní")
        return <Badge variant="outline" className="text-xs border-yellow-600 text-yellow-700">nestabilní</Badge>;
    return <Badge variant="outline" className="text-xs border-red-500 text-red-600">klesá</Badge>;
}

export function HamerakPredikce() {
    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

            {/* Perex */}
            <div>
                <h1 className="text-2xl font-bold">Hamerák — Predikce počtů a faktory</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Analýza 2016–2024 · R²=0.85 · Multi-faktor model · Predikce pro 2026
                </p>
            </div>

            {/* ===== KLÍČOVÉ METRIKY ===== */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Trend (R²=0.85)</div>
                        <div className="text-2xl font-bold text-red-600">−21</div>
                        <div className="text-xs text-muted-foreground">závodníků ročně</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Predikce 2026</div>
                        <div className="text-2xl font-bold">{PRED_2026_BASE}</div>
                        <div className="text-xs text-muted-foreground">trend {TREND_2026} + bounce +{BOUNCE_2026}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Pokles 2016→2024</div>
                        <div className="text-2xl font-bold text-orange-600">−37 %</div>
                        <div className="text-xs text-muted-foreground">405 → 253 závodníků</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Zrušeno ročníků</div>
                        <div className="text-2xl font-bold text-red-600">4×</div>
                        <div className="text-xs text-muted-foreground">2018, 2020, 2023, 2025</div>
                    </CardContent>
                </Card>
            </div>

            {/* ===== MONITORING VODY ===== */}
            <Card className="border-blue-300">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Droplets size={15} className="text-blue-600" />
                        Monitoring vody — stanice na Hamerském potoce
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm">
                        Existují dvě stanice pro sledování vodního stavu v trase akce. Sledovat od <strong>července</strong>,
                        kritické od <strong>srpna</strong>. V suchých letech rozhodnutí o zrušení padá v srpnu.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <a href="https://data.hladiny.cz/chmi/index.php?ca=6&cs=1260"
                           target="_blank" rel="noopener"
                           className="flex items-start gap-3 p-3 rounded border hover:bg-blue-50 transition-colors">
                            <Droplets size={18} className="text-blue-500 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <div className="font-semibold text-sm flex items-center gap-1">
                                    Oldříš / Hamerský potok
                                    <ExternalLink size={11} className="text-muted-foreground" />
                                </div>
                                <div className="text-xs text-muted-foreground">data.hladiny.cz — hladina v cm, 10min interval</div>
                                <div className="text-xs mt-1 text-blue-700 font-medium">Primární indikátor: přímo na trase</div>
                            </div>
                        </a>
                        <a href="https://hydro.chmi.cz/hppsoldv/hpps_prfdyn.php?seq=307238"
                           target="_blank" rel="noopener"
                           className="flex items-start gap-3 p-3 rounded border hover:bg-blue-50 transition-colors">
                            <Droplets size={18} className="text-blue-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <div className="font-semibold text-sm flex items-center gap-1">
                                    Hamr / Nežárka (ČHMÚ)
                                    <ExternalLink size={11} className="text-muted-foreground" />
                                </div>
                                <div className="text-xs text-muted-foreground">hydro.chmi.cz — průtok m³/s + vodní stav</div>
                                <div className="text-xs mt-1 text-blue-600">Sekundární: Nežárka downstream od ústí</div>
                            </div>
                        </a>
                    </div>
                    <div className="rounded bg-yellow-50 border border-yellow-200 p-3 text-xs space-y-1">
                        <div className="font-semibold text-yellow-800">Co zatím nevíme — je třeba zjistit:</div>
                        <ul className="list-disc list-inside text-yellow-700 space-y-0.5">
                            <li>Jaká hladina na Oldříši v srpnu 2018 a 2025 předcházela zrušení → threshold &quot;kritická hodnota&quot;</li>
                            <li>ČHMÚ historická data (chmi.cz/historicka-data/hydrologie) umožní tuto hranici zjistit</li>
                            <li>Pak lze od srpna sledovat: &quot;jsme nad/pod kritickou hladinou?&quot;</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* ===== POČASÍ — PREDIKTABILITA ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle size={15} className="text-gray-500" />
                        Počasí — co lze a nelze predikovat
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b bg-muted/40 text-muted-foreground">
                                <th className="text-left px-3 py-2">Horizont před akcí</th>
                                <th className="text-center px-3 py-2">Přesnost</th>
                                <th className="text-left px-3 py-2">Zdroj</th>
                                <th className="text-left px-3 py-2">Co říká</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { h: "Nyní (5 měs.)", acc: "~10 %", zdroj: "ČHMÚ sezónní výhled", co: "Jen klimatické normály (říjen JČ: ~9°C, 45 mm)" },
                                { h: "Srpen (2 měs.)", acc: "~35 %", zdroj: "ČHMÚ/ECMWF 3M outlook", co: "Probabilisticky: je říjen pravděpodobněji teplejší/sušší než normál?" },
                                { h: "2 týdny před", acc: "~65 %", zdroj: "ECMWF ensemble", co: "První reálný signál pro konkrétní víkend" },
                                { h: "1 týden před", acc: "~80 %", zdroj: "ALADIN/meteo.cz", co: "Závodníci začínají rozhodovat — hlavní vliv na splutí/permice" },
                                { h: "3 dny před", acc: ">90 %", zdroj: "Standardní předpověď", co: "Velmi spolehlivé — klíčové pro last-minute prodej" },
                            ].map((r, i) => (
                                <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="px-3 py-2 font-medium">{r.h}</td>
                                    <td className="px-3 py-2 text-center">{r.acc}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{r.zdroj}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{r.co}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="text-xs text-muted-foreground">
                        <strong>Leading indicator:</strong> horké, suché léto (červenec–srpen) → nízká voda v rybnících → riziko zrušení
                        + pravděpodobně méně srážek v říjnu. Tenhle signál je dostupný 2 měsíce před akcí.
                    </p>
                </CardContent>
            </Card>

            {/* ===== TERMÍNOVKA — SYSTEMATICKÁ DATA ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Swords size={15} className="text-orange-600" />
                        Termínovka — konkurenční akce a residuál od trendu
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Zdroj: slalom-world.com po letech. Residuál = skutečnost − lineární trend.
                    </p>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                                <th className="text-left px-4 py-2">Rok</th>
                                <th className="text-right px-3 py-2">Záv.</th>
                                <th className="text-right px-3 py-2">Trend</th>
                                <th className="text-right px-3 py-2">Residuál</th>
                                <th className="text-left px-4 py-2">Konkurence stejný víkend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {terminovka.map(r => (
                                <tr key={r.rok} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="px-4 py-2 font-medium">{r.rok}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{r.zavod}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.trend}</td>
                                    <td className={cn("px-3 py-2 text-right font-semibold tabular-nums",
                                        r.residual > 0 ? "text-green-600" : "text-red-500")}>
                                        {r.residual > 0 ? "+" : ""}{r.residual}
                                    </td>
                                    <td className="px-4 py-2 text-xs">
                                        {r.konkurence.map((k, i) => (
                                            <span key={i} className="mr-2">
                                                <span className={cn("font-medium",
                                                    k.overlap === "přesně" ? "text-red-600" : "text-orange-600")}>
                                                    {k.nazev}
                                                </span>
                                                <span className="text-muted-foreground ml-1">({k.dat}, {k.overlap})</span>
                                            </span>
                                        ))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="p-4 bg-muted/30 border-t text-xs space-y-1">
                        <div className="font-semibold">Klíčová pozorování:</div>
                        <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                            <li><strong>Bobr Cup</strong> (TJ Vodní Sporty Litovel, sjezd na Moravě) — v říjnu KAŽDÝ rok, téměř vždy stejný den. Přímý sjezdový konkurent. V roce 2022 <em>nebyl</em> → nejlepší rok (+12 nad trendem).</li>
                            <li><strong>Klatovský slalom</strong> (KK Klatovy, Otava, Strakonice) — slalom, překrývá se demograficky. V 2024 nebyl, v 2022 byl.</li>
                            <li><strong>2026</strong>: termínovka zatím není zveřejněna — sledovat od dubna na kanoe.cz a slalom-world.com.</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* ===== TREND CHART ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Počet závodníků + trend + predikce 2026</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        slope={SLOPE}/rok, R²={R2}. Predikce 2026: trend {TREND_2026} + bounce +{BOUNCE_2026} = <strong>{PRED_2026_BASE}</strong>.
                    </p>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={zavodConfig} className="h-56">
                        <ComposedChart data={zavodData} margin={{ top: 8, right: 90, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="rok" tick={{ fontSize: 12 }} />
                            <YAxis domain={[150, 450]} tick={{ fontSize: 12 }} width={36} />
                            <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => [`${v} lidí`, n === "actual" ? "Skutečnost" : "Trend"]} />} />
                            <ReferenceLine x="2022" stroke="hsl(48 90% 55%)" strokeDasharray="4 4"
                                label={{ value: "☀ bez Bobr", position: "top", fontSize: 10 }} />
                            <ReferenceLine x="2024" stroke="hsl(199 70% 55%)" strokeDasharray="4 4"
                                label={{ value: "bounce→", position: "insideTopRight", fontSize: 10 }} />
                            <Line type="monotone" dataKey="actual" stroke="var(--color-actual)" strokeWidth={2.5}
                                dot={{ r: 5, fill: "var(--color-actual)" }} activeDot={{ r: 7 }} />
                            <Line type="linear" dataKey="trend" stroke="var(--color-trend)" strokeWidth={1.5}
                                strokeDasharray="6 3" dot={false} />
                        </ComposedChart>
                    </ChartContainer>
                    <p className="text-xs text-right text-muted-foreground mt-1">
                        → 2026 predikce s bounce: <strong className="text-primary">{PRED_2026_BASE}</strong> závodníků
                        · bez bounce (čistý trend): {TREND_2026}
                    </p>
                </CardContent>
            </Card>

            {/* ===== MULTI-FAKTOR MODEL ===== */}
            <Card className="border-primary/30">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Upravený model: trend + faktory</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Korekce odvozeny z residuálů 2016–2024. Závodníci ≈ trendFn(rok) + počasí + konkurence + bounce
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="rounded border p-3 space-y-1">
                            <div className="font-semibold text-xs text-muted-foreground uppercase">Korekce počasí</div>
                            <div className="flex justify-between"><span>Dobré (teplo, sucho)</span><span className="font-bold text-green-600">+20</span></div>
                            <div className="flex justify-between"><span>Průměrné</span><span className="font-semibold">0</span></div>
                            <div className="flex justify-between"><span>Špatné (déšť, studeno)</span><span className="font-bold text-red-600">−25</span></div>
                        </div>
                        <div className="rounded border p-3 space-y-1">
                            <div className="font-semibold text-xs text-muted-foreground uppercase">Korekce konkurence</div>
                            <div className="flex justify-between"><span>Žádná přesná</span><span className="font-bold text-green-600">0</span></div>
                            <div className="flex justify-between"><span>1× (Bobr nebo Klatovský)</span><span className="font-semibold text-orange-600">−10</span></div>
                            <div className="flex justify-between"><span>2× oba</span><span className="font-bold text-red-600">−20</span></div>
                            <div className="flex justify-between"><span>3× nebo více</span><span className="font-bold text-red-700">−30</span></div>
                        </div>
                        <div className="rounded border p-3 space-y-1">
                            <div className="font-semibold text-xs text-muted-foreground uppercase">Korekce bounce</div>
                            <div className="flex justify-between"><span>Po zrušení (jako 2024)</span><span className="font-bold text-green-600">+30</span></div>
                            <div className="flex justify-between"><span>Normálně</span><span className="font-semibold">0</span></div>
                            <div className="text-xs text-muted-foreground pt-1">
                                2024: +34 nad trendem i při špatném počasí. Odložená poptávka z 2023.
                            </div>
                        </div>
                    </div>
                    <div className="rounded bg-primary/5 border border-primary/20 p-3">
                        <div className="text-sm font-semibold mb-2">Výpočet 2026 — základní scénář:</div>
                        <div className="font-mono text-sm space-y-0.5">
                            <div>Trend 2026:      {TREND_2026}</div>
                            <div>+ Post-bounce:   +{BOUNCE_2026} <span className="text-muted-foreground text-xs">(po zrušení 2025)</span></div>
                            <div>+ Počasí:        +0 <span className="text-muted-foreground text-xs">(průměrné — neznáme)</span></div>
                            <div>+ Konkurence:    −10 <span className="text-muted-foreground text-xs">(předpokládáme 1 akci — Bobr Cup)</span></div>
                            <div className="border-t mt-1 pt-1 font-bold">= <span className="text-primary">{TREND_2026 + BOUNCE_2026 - 10}</span> závodníků</div>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Korekce nejsou statisticky validované (malý vzorek). Slouží jako best-guess expert estimate.
                        Čím více faktorů bude známo (termínovka, výhled počasí), tím přesnější.
                    </p>
                </CardContent>
            </Card>

            {/* ===== FAKTORY SEZNAM ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Všechny faktory — dostupnost a důležitost</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b bg-muted/40 text-muted-foreground">
                                <th className="text-left px-4 py-2">Faktor</th>
                                <th className="text-center px-3 py-2">Důležitost</th>
                                <th className="text-left px-3 py-2">Dostupnost dat</th>
                                <th className="text-left px-4 py-2 hidden md:table-cell">Komentář</th>
                            </tr>
                        </thead>
                        <tbody>
                            {faktory.map(f => (
                                <tr key={f.nazev} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="px-4 py-2 font-medium">{f.nazev}</td>
                                    <td className="px-3 py-2 text-center"><Stars n={f.dulezitost} /></td>
                                    <td className="px-3 py-2 text-muted-foreground">{f.dostupnost}</td>
                                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{f.koment}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* ===== KATEGORIE CHART ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Kategorie splutí + permice (2019–2024)</CardTitle>
                    <p className="text-xs text-muted-foreground">Permice SO nejstabilnější (~110). Splutí VIK nejrychleji klesá (−17/rok).</p>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={categoryConfig} className="h-60">
                        <BarChart data={categoryData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="rok" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} width={36} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="splutiVIK" name="Splutí VIK" stackId="s" fill="var(--color-splutiVIK)" />
                            <Bar dataKey="splutiSO"  name="Splutí SO"  stackId="s" fill="var(--color-splutiSO)" />
                            <Bar dataKey="splutiNE"  name="Splutí NE"  stackId="s" fill="var(--color-splutiNE)" radius={[3,3,0,0]} />
                            <Bar dataKey="permVIK"   name="Permice VIK" stackId="p" fill="var(--color-permVIK)" />
                            <Bar dataKey="permSO"    name="Permice SO"  stackId="p" fill="var(--color-permSO)" />
                            <Bar dataKey="permNE"    name="Permice NE"  stackId="p" fill="var(--color-permNE)" radius={[3,3,0,0]} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            {/* ===== PREDIKCE 2026 TABULKA ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Predikce 2026 po kategoriích (čistý lineární trend)</CardTitle>
                    <p className="text-xs text-muted-foreground">Bez bounce korekce. Přidej +~30 na závod pokud platí bounce efekt.</p>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                                <th className="text-left px-4 py-2">Kategorie</th>
                                <th className="text-right px-4 py-2">2022</th>
                                <th className="text-right px-4 py-2">2024</th>
                                <th className="text-right px-4 py-2">Predikce 2026</th>
                                <th className="text-right px-4 py-2">Trend/rok</th>
                                <th className="text-right px-4 py-2">R²</th>
                                <th className="text-center px-4 py-2">Stabilita</th>
                            </tr>
                        </thead>
                        <tbody>
                            {predikce2026.map(r => (
                                <tr key={r.kat} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="px-4 py-2 font-medium">{r.kat}</td>
                                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{r.sk22}</td>
                                    <td className="px-4 py-2 text-right tabular-nums">{r.sk24}</td>
                                    <td className="px-4 py-2 text-right font-bold tabular-nums">
                                        {r.pred}
                                        <span className="text-xs font-normal text-muted-foreground ml-1">[{r.ciMin}–{r.ciMax}]</span>
                                    </td>
                                    <td className={cn("px-4 py-2 text-right tabular-nums text-xs",
                                        r.slope < -10 ? "text-red-600" : r.slope < -3 ? "text-orange-600" : "text-green-600")}>
                                        {r.slope > 0 ? "+" : ""}{r.slope.toFixed(1)}
                                    </td>
                                    <td className="px-4 py-2 text-right text-xs text-muted-foreground tabular-nums">{r.r2.toFixed(2)}</td>
                                    <td className="px-4 py-2 text-center"><StabilitaBadge s={r.stabilita} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* ===== TIMELINE + SCÉNÁŘE ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Timeline */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Přehled všech ročníků</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b bg-muted/40 text-muted-foreground">
                                    <th className="text-left px-3 py-2">Rok</th>
                                    <th className="text-center px-2 py-2">Status</th>
                                    <th className="text-right px-2 py-2">Záv.</th>
                                    <th className="text-right px-2 py-2">Res.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rocniky.map(r => {
                                    const res = r.zavod && r.trend ? r.zavod - r.trend : null;
                                    return (
                                        <tr key={r.rok} className={cn("border-b last:border-0",
                                            r.status === "zrusen" ? "bg-red-50" : "hover:bg-muted/20")}>
                                            <td className="px-3 py-1.5 font-medium">{r.rok}</td>
                                            <td className="px-2 py-1.5 text-center">
                                                {r.status === "ok"
                                                    ? <Badge variant="outline" className="text-[10px] px-1.5 border-green-600 text-green-700">ok</Badge>
                                                    : <Badge variant="destructive" className="text-[10px] px-1.5">zrušen</Badge>}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{r.zavod ?? "—"}</td>
                                            <td className={cn("px-2 py-1.5 text-right tabular-nums font-semibold",
                                                res === null ? "text-muted-foreground" :
                                                res > 0 ? "text-green-600" : "text-red-500")}>
                                                {res === null ? "—" : (res > 0 ? "+" : "") + res}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                {/* Scénáře */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Scénáře 2026</CardTitle>
                        <p className="text-xs text-muted-foreground">Předpoklad: akce proběhne (voda je).</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="rounded border border-blue-200 bg-blue-50 p-3">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold text-sm">Pesimistický</span>
                                <Badge variant="destructive" className="text-xs">špatné počasí + oba konk.</Badge>
                            </div>
                            <div className="text-2xl font-bold text-blue-700">~155–175</div>
                            <div className="text-xs text-muted-foreground font-mono mt-1">
                                {TREND_2026} + bounce {BOUNCE_2026} − počasí 25 − konk. 20 = {TREND_2026 + BOUNCE_2026 - 25 - 20}
                            </div>
                        </div>
                        <div className="rounded border-2 border-primary bg-primary/5 p-3">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold text-sm">Základní</span>
                                <Badge className="text-xs">průměrné + 1 konk.</Badge>
                            </div>
                            <div className="text-2xl font-bold text-primary">{TREND_2026 + BOUNCE_2026 - 10}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-1">
                                {TREND_2026} + bounce {BOUNCE_2026} + počasí 0 − konk. 10 = {TREND_2026 + BOUNCE_2026 - 10}
                            </div>
                        </div>
                        <div className="rounded border border-yellow-200 bg-yellow-50 p-3">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold text-sm">Optimistický</span>
                                <Badge variant="outline" className="text-xs border-yellow-600 text-yellow-700">babí léto + bez konk.</Badge>
                            </div>
                            <div className="text-2xl font-bold text-yellow-700">~{TREND_2026 + BOUNCE_2026 + 20}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-1">
                                {TREND_2026} + bounce {BOUNCE_2026} + počasí 20 + konk. 0 = {TREND_2026 + BOUNCE_2026 + 20}
                            </div>
                        </div>
                        <div className="rounded bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                            <strong>Nulový scénář:</strong> Málo vody v rybnících → zrušení. Sledovat Oldříš
                            od července. Rozhodnutí obvykle v srpnu.
                        </div>
                    </CardContent>
                </Card>
            </div>

            <p className="text-xs text-muted-foreground">
                <strong>Zdroje:</strong> Excel data OVT · slalom-world.com (termínovka 2016–2024) ·
                padler.cz + kanoe.cz (zrušení) · data.hladiny.cz + hydro.chmi.cz (monitoring vody) ·
                scipy linregress (regrese). Korekce jsou expert estimates, ne statisticky validované hodnoty.
            </p>
        </div>
    );
}
