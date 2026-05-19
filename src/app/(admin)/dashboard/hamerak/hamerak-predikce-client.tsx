"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComposedChart, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Droplets, AlertTriangle, ExternalLink, Calendar, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// ===== REGRESE (scipy linregress, data 2016–2024, n=6) =====
const SLOPE     = -21.37;
const INTERCEPT = 43479;
const R2        = 0.847;
const trendFn   = (rok: number) => Math.round(SLOPE * rok + INTERCEPT);

// Model: závodníci ≈ trendFn(rok) + korekce_pocasi + korekce_bounce
// Korekce z residuálů 2016–2024:
//   počasí:   dobré=+20, průměrné=0, špatné=−25
//   bounce:   po zrušení=+30, jinak=0
const TREND_2026 = trendFn(2026);       // 183
const BOUNCE     = 30;                  // po zrušení 2025
const BASE_2026  = TREND_2026 + BOUNCE; // 213

// ===== TIMELINE ROČNÍKŮ =====
const rocniky = [
    { rok: 2016, status: "ok",     zavod: 405, pocasi: "neznámé",           trend: trendFn(2016), pozn: "28.9.=středa (+3d do Hameráku)" },
    { rok: 2017, status: "ok",     zavod: 404, pocasi: "neznámé",           trend: trendFn(2017), pozn: "28.9.=čtvrtek ⚡ MOST (+8d) — MOST daleko od Hameráku" },
    { rok: 2018, status: "zrusen", zavod: null, pocasi: "sucho",            trend: null,           pozn: "ZRUŠEN — kritický nedostatek vody; Úhlava taky chybí v datech" },
    { rok: 2019, status: "ok",     zavod: 300, pocasi: "deštivo/studeno",   trend: trendFn(2019), pozn: "špatné počasí; Vavřinecký ZRUŠEN (voda)" },
    { rok: 2020, status: "zrusen", zavod: null, pocasi: "—",                trend: null,           pozn: "ZRUŠEN — COVID-19" },
    { rok: 2021, status: "ok",     zavod: 256, pocasi: "dobré (babí léto)", trend: trendFn(2021), pozn: "28.9.=úterý ⚡ MOST (+4d) — blízkost mostu negativní" },
    { rok: 2022, status: "ok",     zavod: 274, pocasi: "teplo/sucho",       trend: trendFn(2022), pozn: "nejlepší v éře poklesu; dobré počasí" },
    { rok: 2023, status: "zrusen", zavod: null, pocasi: "—",                trend: null,           pozn: "ZRUŠEN — rekonstrukce Vajgaru; 28.9.=čtvrtek ⚡ MOST" },
    { rok: 2024, status: "ok",     zavod: 253, pocasi: "studeno/mrholí",    trend: trendFn(2024), pozn: "bounce +27 (po zrušení 2023 + Teplá 14.9. zrušena)" },
    { rok: 2025, status: "zrusen", zavod: null, pocasi: "sucho",            trend: null,           pozn: "ZRUŠEN — kritický nedostatek vody v rybnících" },
];

// ===== ČPV SEZÓNA — RELEVANTNÍ AKCE =====
// Relevantní konkurenti = REKREAČNÍ rezervoárové ČPV akce, ne závodní sjezd/slalom
const cpvSezony = [
    { rok: 2016, uhlava: "září OK",    tepla: "?",           hamr: "1.10.",    vavrinec: "říjen OK",        res: +8 },
    { rok: 2017, uhlava: "září OK",    tepla: "?",           hamr: "6.10.",    vavrinec: "říjen OK",        res: +28 },
    { rok: 2019, uhlava: "září OK",    tepla: "?",           hamr: "5.10.",    vavrinec: "ZRUŠEN (voda)",   res: -33 },
    { rok: 2021, uhlava: "září OK",    tepla: "?",           hamr: "2.10.",    vavrinec: "15.10. OK",       res: -34 },
    { rok: 2022, uhlava: "září OK",    tepla: "?",           hamr: "1.10.",    vavrinec: "11-12.10. OK",    res: +5 },
    { rok: 2024, uhlava: "7.9. OK",    tepla: "ZRUŠENA ↑",  hamr: "5-6.10.", vavrinec: "12.10. OK",       res: +27 },
];

// ===== REVENUE DATA PO DNE (ze skutečných prodejů) =====
// Penetrace autobusů = permice / (závod + splutí); NE = permNE/splNE (nejčistší)
// VIK = permVIK / (splVIK + závod)  — zahrnuje závodníky jako jmenovatel
const penetraceData = [
    { rok: "2019", celkova: 62, ne: 59, vik: 49 },
    { rok: "2021", celkova: 58, ne: 54, vik: 52 },
    { rok: "2022", celkova: 60, ne: 64, vik: 41 },
    { rok: "2024", celkova: 63, ne: 62, vik: 39 },
];

// Počty lidí po kategoriích (ze SUMA sekce Excelu)
const poctyLineData = [
    { rok: "2019", splVIK: 142, splSO: 90,  splNE: 226, permVIK: 216, permSO: 120, permNE: 133 },
    { rok: "2021", splVIK: 138, splSO: 143, splNE: 138, permVIK: 205, permSO: 112, permNE:  74 },
    { rok: "2022", splVIK:  86, splSO:  81, splNE: 114, permVIK: 147, permSO: 111, permNE:  73 },
    { rok: "2024", splVIK:  64, splSO:  62, splNE: 125, permVIK: 124, permSO: 116, permNE:  78 },
];

// Příjmy = počet × cena (Kč). Ceny: 2019→120/80/80/120/80/100, 2021→150/100/120/200/150/150,
// 2022→160/120/140/220/160/160, 2024→200/150/150/230/170/170
const revLineData = [
    { rok: "2019", splVIK: 17040, splSO:  7200, splNE: 18080, permVIK: 25920, permSO:  9600, permNE: 13300 },
    { rok: "2021", splVIK: 20700, splSO: 14300, splNE: 16560, permVIK: 41000, permSO: 16800, permNE: 11100 },
    { rok: "2022", splVIK: 13760, splSO:  9720, splNE: 15960, permVIK: 32340, permSO: 17760, permNE: 11680 },
    { rok: "2024", splVIK: 12800, splSO:  9300, splNE: 18750, permVIK: 28520, permSO: 19720, permNE: 13260 },
];

const predikce2026 = [
    { kat: "Závod",       sk22: 274, sk24: 253, pred: 183, ciMin: 161, ciMax: 205, slope: -21.4, r2: 0.85, stabilita: "klesá" },
    { kat: "Splutí VIK",  sk22:  86, sk24:  64, pred:  31, ciMin:  18, ciMax:  44, slope: -17.0, r2: 0.84, stabilita: "klesá" },
    { kat: "Splutí SO",   sk22:  81, sk24:  62, pred:  59, ciMin:  38, ciMax:  80, slope:  -7.8, r2: 0.22, stabilita: "nestabilní" },
    { kat: "Splutí NE",   sk22: 114, sk24: 125, pred: 130, ciMin:  95, ciMax: 165, slope:  +5.5, r2: 0.07, stabilita: "nestabilní" },
    { kat: "Permice VIK", sk22: 147, sk24: 124, pred:  83, ciMin:  60, ciMax: 106, slope: -19.9, r2: 0.87, stabilita: "klesá" },
    { kat: "Permice SO",  sk22: 111, sk24: 116, pred: 111, ciMin: 104, ciMax: 118, slope:  -0.8, r2: 0.17, stabilita: "stagnuje" },
];

const faktory = [
    { nazev: "Rok (lineární trend)",        dostupnost: "vlastní data",    d: 5, pozn: "R²=0.85, dominantní — −21 záv./rok" },
    { nazev: "Vodní stav Oldříš (srp/zář)", dostupnost: "ČHMÚ/hladiny.cz", d: 5, pozn: "Primární riziko zrušení — threshold neznáme" },
    { nazev: "Post-cancellation bounce",    dostupnost: "vlastní data",    d: 4, pozn: "2024: +27 po zrušení 2023; 2026: +~30 očekáváno" },
    { nazev: "Počasí v den akce",           dostupnost: "předpověď 10d",   d: 4, pozn: "Hlavně splutí/permice; závodníci jedou vždy" },
    { nazev: "Srp/zář srážkový deficit",    dostupnost: "ČHMÚ historická", d: 4, pozn: "Leading indicator vodního stavu; sucho léto = riziko" },
    { nazev: "28.9. MOST + vzdálenost",     dostupnost: "kalendář",        d: 3, pozn: "Vliv jen pokud Hamerák ≤5 dní po; 2021 (4d): −34; 2017 (8d): +28" },
    { nazev: "ČPV události před Hamerákem", dostupnost: "kanoe.cz",        d: 3, pozn: "Teplá 2024 zrušena → +27 na Hameráku (substituce)" },
    { nazev: "Cena závodu",                 dostupnost: "vlastní data",    d: 3, pozn: "r=−0.82; ale koreluje s rokem (confounding)" },
    { nazev: "Úhlava (konala/nekonala se)", dostupnost: "kanoe.cz",        d: 2, pozn: "2018: Úhlava chybí v datech = sucho ten rok" },
    { nazev: "CSK registrovaní závodníci",  dostupnost: "kontaktovat ČSK", d: 3, pozn: "Demografický trend sportu — není veřejně dostupné" },
    { nazev: "Vavřinecký potok (termín)",   dostupnost: "padler.cz",       d: 2, pozn: "NÁSLEDUJE Hamerák o 7-10 dní; může odvádět VIK lidi" },
    { nazev: "Letní NAO/ENSO index",        dostupnost: "NOAA",            d: 1, pozn: "Slabý signal pro říjnové počasí v ČR" },
];

// ===== CHART CONFIGS =====
const zavodConfig = {
    actual: { label: "Skutečnost",     color: "hsl(142 60% 38%)" },
    trend:  { label: "Lineární trend", color: "hsl(220 15% 65%)" },
} satisfies ChartConfig;

const penetraceConfig = {
    celkova: { label: "Celková penetrace",  color: "hsl(220 70% 45%)" },
    ne:      { label: "NE penetrace",       color: "hsl(199 80% 38%)" },
    vik:     { label: "VIK penetrace",      color: "hsl(142 55% 40%)" },
} satisfies ChartConfig;

// Splutí = solid, Permice (autobus) = dashed — vizuálně odlišeno strokeDasharray
const lineConfig = {
    splNE:   { label: "Splutí NE (cestovky)",      color: "hsl(199 90% 35%)" },
    splSO:   { label: "Splutí SO",                  color: "hsl(199 65% 50%)" },
    splVIK:  { label: "Splutí VIK",                 color: "hsl(199 45% 65%)" },
    permNE:  { label: "Permice NE (autobus NE)",    color: "hsl(142 65% 32%)" },
    permSO:  { label: "Permice SO (autobus SO)",    color: "hsl(142 50% 45%)" },
    permVIK: { label: "Permice VIK (autobus VIK)",  color: "hsl(142 38% 57%)" },
} satisfies ChartConfig;

const zavodData = [
    { rok: "2016", actual: 405, trend: trendFn(2016) },
    { rok: "2017", actual: 404, trend: trendFn(2017) },
    { rok: "2019", actual: 300, trend: trendFn(2019) },
    { rok: "2021", actual: 256, trend: trendFn(2021) },
    { rok: "2022", actual: 274, trend: trendFn(2022) },
    { rok: "2024", actual: 253, trend: trendFn(2024) },
];

function Stars({ n }: { n: number }) {
    return <span className="text-yellow-500 text-xs">{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;
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

            <div>
                <h1 className="text-2xl font-bold">Hamerák — Predikce počtů a faktory</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Analýza 2016–2024 · R²=0.85 · Multi-faktor model · Predikce pro 2026
                </p>
            </div>

            {/* Metriky */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Trend (R²=0.85)</div>
                    <div className="text-2xl font-bold text-red-600">−21</div>
                    <div className="text-xs text-muted-foreground">závodníků ročně</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Predikce 2026</div>
                    <div className="text-2xl font-bold">{BASE_2026}</div>
                    <div className="text-xs text-muted-foreground">trend {TREND_2026} + bounce +{BOUNCE}</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Pokles 2016→2024</div>
                    <div className="text-2xl font-bold text-orange-600">−37 %</div>
                    <div className="text-xs text-muted-foreground">405 → 253 závodníků</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Zrušeno ročníků</div>
                    <div className="text-2xl font-bold text-red-600">4×</div>
                    <div className="text-xs text-muted-foreground">2018, 2020, 2023, 2025</div>
                </CardContent></Card>
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
                    <p className="text-sm">Sledovat od <strong>července</strong>, kritické od <strong>srpna</strong>. Rozhodnutí o zrušení padá v srpnu.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <a href="https://data.hladiny.cz/chmi/index.php?ca=6&cs=1260" target="_blank" rel="noopener"
                           className="flex items-start gap-3 p-3 rounded border hover:bg-blue-50 transition-colors">
                            <Droplets size={18} className="text-blue-500 mt-0.5 shrink-0" />
                            <div>
                                <div className="font-semibold text-sm flex items-center gap-1">
                                    Oldříš / Hamerský potok <ExternalLink size={11} className="text-muted-foreground" />
                                </div>
                                <div className="text-xs text-muted-foreground">data.hladiny.cz — hladina v cm, 10min</div>
                                <div className="text-xs text-blue-700 font-medium mt-0.5">Primární: přímo na trase</div>
                            </div>
                        </a>
                        <a href="https://hydro.chmi.cz/hppsoldv/hpps_prfdyn.php?seq=307238" target="_blank" rel="noopener"
                           className="flex items-start gap-3 p-3 rounded border hover:bg-blue-50 transition-colors">
                            <Droplets size={18} className="text-blue-400 mt-0.5 shrink-0" />
                            <div>
                                <div className="font-semibold text-sm flex items-center gap-1">
                                    Hamr / Nežárka (ČHMÚ) <ExternalLink size={11} className="text-muted-foreground" />
                                </div>
                                <div className="text-xs text-muted-foreground">hydro.chmi.cz — průtok m³/s</div>
                                <div className="text-xs text-blue-600 mt-0.5">Sekundární: downstream od ústí</div>
                            </div>
                        </a>
                    </div>
                    <div className="rounded bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-700">
                        <strong>Chybí threshold:</strong> Nevíme, jaká hladina na Oldříši v srpnu 2018/2025 předcházela zrušení.
                        Z ČHMÚ historických dat (chmi.cz/historicka-data/hydrologie) lze zjistit a pak říct &quot;pod X cm = riziko&quot;.
                    </div>
                </CardContent>
            </Card>

            {/* ===== ČPV SEZÓNA ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Calendar size={15} className="text-orange-500" />
                        ČPV sezóna — relevantní kontext termínovky
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Hamerák soutěží s <strong>rekreačními rezervoárovými ČPV akcemi</strong> (stejný typ: voda z přehrady, podobné publikum),
                        ne se závodním sjezdem/slalomem (jiná komunita).
                    </p>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="text-xs rounded bg-muted/30 p-3 font-mono">
                        <span className="text-green-700 font-semibold">Úhlava</span> (1. září) →
                        <span className="text-orange-600 font-semibold ml-2">28.9. svátek</span> →
                        <span className="text-primary font-semibold ml-2">Hamerák</span> (1. říjen) →
                        <span className="text-blue-600 font-semibold ml-2">Vavřinecký</span> (11-12. říjen)
                    </div>
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b bg-muted/40 text-muted-foreground">
                                <th className="text-left px-3 py-1.5">Rok</th>
                                <th className="text-left px-2 py-1.5">Úhlava (září)</th>
                                <th className="text-left px-2 py-1.5">Teplá (polovina září)</th>
                                <th className="text-left px-2 py-1.5">Hamerák</th>
                                <th className="text-left px-2 py-1.5">Vavřinecký (říjen)</th>
                                <th className="text-right px-3 py-1.5">Residuál</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cpvSezony.map(r => (
                                <tr key={r.rok} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="px-3 py-1.5 font-medium">{r.rok}</td>
                                    <td className="px-2 py-1.5 text-green-700">{r.uhlava}</td>
                                    <td className={cn("px-2 py-1.5", r.tepla.includes("ZRUŠENA") ? "text-orange-600 font-medium" : "text-muted-foreground")}>{r.tepla}</td>
                                    <td className="px-2 py-1.5 font-medium">{r.hamr}</td>
                                    <td className={cn("px-2 py-1.5", r.vavrinec.includes("ZRUŠEN") ? "text-red-600" : "text-blue-600")}>{r.vavrinec}</td>
                                    <td className={cn("px-3 py-1.5 text-right font-semibold tabular-nums", r.res > 0 ? "text-green-600" : "text-red-500")}>
                                        {r.res > 0 ? "+" : ""}{r.res}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                        <div className="rounded border border-green-200 bg-green-50 p-2">
                            <div className="font-semibold text-green-800">Úhlava (předchází)</div>
                            <p className="text-green-700 mt-0.5">Vždy proběhla v sledovaných letech. Připravuje &quot;sezónní chuť&quot;. 2018 chybí v datech = sucho.</p>
                        </div>
                        <div className="rounded border border-orange-200 bg-orange-50 p-2">
                            <div className="font-semibold text-orange-800">Teplá zrušena 2024 → +27</div>
                            <p className="text-orange-700 mt-0.5">Když ČPV akce PŘED Hamerákem vypadnou → lidé hladoví po paddlingu → přijdou na Hamerák (substituce).</p>
                        </div>
                        <div className="rounded border border-blue-200 bg-blue-50 p-2">
                            <div className="font-semibold text-blue-800">Vavřinecký (následuje)</div>
                            <p className="text-blue-700 mt-0.5">7-10 dní po. VIK lidi mohou volit: Hamerák nebo Vavřinecký. 2019 Vavřinecký ZRUŠEN = shodně špatný rok.</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ===== 28.9. + POČASÍ ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Calendar size={14} className="text-yellow-600" />
                            28.9. — vliv závisí na vzdálenosti od Hameráku
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <p>Prodloužený víkend (MOST) nemá vliv sám o sobě — záleží, jak daleko od Hameráku je.</p>
                        <div className="text-xs space-y-1 rounded border p-2 bg-muted/30 font-mono">
                            <div>2017: MOST + Hamerák <strong>+8 dní</strong> → residuál <span className="text-green-600">+28</span> ✓ bez dopadu</div>
                            <div>2021: MOST + Hamerák <strong>+4 dny</strong> → residuál <span className="text-red-600">−34</span> ✗ silný negativní efekt</div>
                            <div className="border-t mt-1 pt-1">2026: 28.9.=pondělí, Hamerák 3.10. → <strong>+5 dní</strong> → mírný rizik</div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Mechanismus: prodloužený víkend = lidi jedou na paddling tehdy. Pokud je Hamerák
                            těsně po, už &quot;mají svou dávku&quot; a nepotřebují jet znovu — zejména VIK kategorie.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            <strong>2026:</strong> 28.9.=pondělí, víkend 26–28.9., Hamerák 3.10. (+5 dní).
                            Střední riziko — mírně blíže než bezpečných 8 dní z 2017.
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <AlertTriangle size={14} className="text-gray-500" />
                            Počasí — prediktabilita
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <table className="w-full text-xs">
                            <tbody>
                                {[
                                    ["Nyní (5 měs.)",    "~10 %",  "klimatické normály (říjen JČ: ~9°C, 45mm)"],
                                    ["Srpen",             "~35 %",  "ČHMÚ 3M: pravděpodobně teplejší/sušší?"],
                                    ["2 týdny před",      "~65 %",  "ECMWF — první reálný signal"],
                                    ["7 dní před",        "~80 %",  "závodníci rozhodují"],
                                    ["3 dny před",        ">90 %",  "last-minute splutí/permice"],
                                ].map(([h, acc, co]) => (
                                    <tr key={h} className="border-b last:border-0">
                                        <td className="py-1.5 font-medium pr-2 whitespace-nowrap">{h}</td>
                                        <td className="py-1.5 pr-3 text-muted-foreground">{acc}</td>
                                        <td className="py-1.5 text-muted-foreground">{co}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="text-xs text-muted-foreground mt-2">
                            <strong>Leading indicator:</strong> horké suché léto → nízká voda + pravděpodobně sušší říjen.
                            Dostupné od srpna.
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* ===== TREND CHART ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Závodníci + trend + predikce 2026</CardTitle>
                    <p className="text-xs text-muted-foreground">slope={SLOPE}/rok, R²={R2}. Predikce 2026: {TREND_2026} (trend) + {BOUNCE} (bounce) = <strong>{BASE_2026}</strong>.</p>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={zavodConfig} className="h-52">
                        <ComposedChart data={zavodData} margin={{ top: 8, right: 90, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="rok" tick={{ fontSize: 12 }} />
                            <YAxis domain={[150, 450]} tick={{ fontSize: 12 }} width={36} />
                            <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => [`${v} lidí`, n === "actual" ? "Skutečnost" : "Trend"]} />} />
                            <ReferenceLine x="2021" stroke="hsl(38 80% 50%)" strokeDasharray="4 4"
                                label={{ value: "⚡MOST+4d", position: "top", fontSize: 9 }} />
                            <ReferenceLine x="2022" stroke="hsl(48 90% 55%)" strokeDasharray="4 4"
                                label={{ value: "☀ dobré", position: "insideTopRight", fontSize: 9 }} />
                            <Line type="monotone" dataKey="actual" stroke="var(--color-actual)" strokeWidth={2.5}
                                dot={{ r: 5, fill: "var(--color-actual)" }} activeDot={{ r: 7 }} />
                            <Line type="linear" dataKey="trend" stroke="var(--color-trend)" strokeWidth={1.5}
                                strokeDasharray="6 3" dot={false} />
                        </ComposedChart>
                    </ChartContainer>
                    <p className="text-xs text-right text-muted-foreground mt-1">
                        → 2026: trend {TREND_2026} + bounce = <strong className="text-primary">{BASE_2026}</strong> závodníků
                    </p>
                </CardContent>
            </Card>

            {/* ===== TRENDY KATEGORIÍ ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Users size={15} className="text-primary" />
                        Trendy kategorií — počty lidí a příjmy
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Plné čáry = Splutí (dolů řekou). Přerušované = Permice = <strong>autobus k startu</strong>.
                        Závodník má splutí VIK zahrnuté ve startovném — není třeba brát zvlášť.
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Dva grafy vedle sebe */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Počty */}
                        <div>
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                                Počty (osoby)
                            </div>
                            <ChartContainer config={lineConfig} className="h-52">
                                <LineChart data={poctyLineData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="rok" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} width={32} />
                                    <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => [`${v} osob`, n as string]} />} />
                                    <Legend wrapperStyle={{ fontSize: 10 }} />
                                    <Line type="monotone" dataKey="splNE"   name="Splutí NE"  stroke="var(--color-splNE)"   strokeWidth={2.5} dot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="splSO"   name="Splutí SO"  stroke="var(--color-splSO)"   strokeWidth={2} dot={{ r: 3 }} />
                                    <Line type="monotone" dataKey="splVIK"  name="Splutí VIK" stroke="var(--color-splVIK)"  strokeWidth={2} dot={{ r: 3 }} />
                                    <Line type="monotone" dataKey="permNE"  name="Permice NE" stroke="var(--color-permNE)"  strokeWidth={2.5} dot={{ r: 4 }} strokeDasharray="5 3" />
                                    <Line type="monotone" dataKey="permSO"  name="Permice SO" stroke="var(--color-permSO)"  strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
                                    <Line type="monotone" dataKey="permVIK" name="Permice VIK" stroke="var(--color-permVIK)" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
                                </LineChart>
                            </ChartContainer>
                        </div>
                        {/* Příjmy */}
                        <div>
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                                Příjmy (Kč = počet × cena)
                            </div>
                            <ChartContainer config={lineConfig} className="h-52">
                                <LineChart data={revLineData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="rok" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} width={40}
                                        tickFormatter={v => `${Math.round(v / 1000)}k`} />
                                    <ChartTooltip content={<ChartTooltipContent
                                        formatter={(v, n) => [
                                            `${Number(v).toLocaleString("cs-CZ")} Kč`,
                                            n as string,
                                        ]} />} />
                                    <Legend wrapperStyle={{ fontSize: 10 }} />
                                    <Line type="monotone" dataKey="splNE"   name="Splutí NE"  stroke="var(--color-splNE)"   strokeWidth={2.5} dot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="splSO"   name="Splutí SO"  stroke="var(--color-splSO)"   strokeWidth={2} dot={{ r: 3 }} />
                                    <Line type="monotone" dataKey="splVIK"  name="Splutí VIK" stroke="var(--color-splVIK)"  strokeWidth={2} dot={{ r: 3 }} />
                                    <Line type="monotone" dataKey="permNE"  name="Permice NE" stroke="var(--color-permNE)"  strokeWidth={2.5} dot={{ r: 4 }} strokeDasharray="5 3" />
                                    <Line type="monotone" dataKey="permSO"  name="Permice SO" stroke="var(--color-permSO)"  strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
                                    <Line type="monotone" dataKey="permVIK" name="Permice VIK" stroke="var(--color-permVIK)" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
                                </LineChart>
                            </ChartContainer>
                        </div>
                    </div>

                    {/* Penetrace autobusů */}
                    <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                            Penetrace autobusů — permice / vodáci (%)
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ChartContainer config={penetraceConfig} className="h-40">
                                <LineChart data={penetraceData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="rok" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} width={32} domain={[30, 80]}
                                        tickFormatter={v => `${v}%`} />
                                    <ChartTooltip content={<ChartTooltipContent
                                        formatter={(v, n) => [`${v} %`, n as string]} />} />
                                    <Legend wrapperStyle={{ fontSize: 10 }} />
                                    <Line type="monotone" dataKey="celkova" name="Celková" stroke="var(--color-celkova)" strokeWidth={2} dot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="ne"      name="NE (čistá)"  stroke="var(--color-ne)"      strokeWidth={2} dot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="vik"     name="VIK (závod+spl)" stroke="var(--color-vik)" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 3" />
                                </LineChart>
                            </ChartContainer>
                            <div className="text-xs space-y-2 self-center">
                                <div className="font-semibold">Interpretace penetrace</div>
                                <ul className="space-y-1.5 text-muted-foreground">
                                    <li><strong className="text-blue-600">Celková penetrace roste</strong> (62→63 %): lidi bez vlastní dopravy tvoří větší podíl — ti s oddílovým busem ubývají rychleji.</li>
                                    <li><strong className="text-blue-500">NE penetrace roste</strong> (59→62 %): nedělní návštěvníci (cestovky, individuálové) jsou bez auta → bus berou víc.</li>
                                    <li><strong className="text-green-600">VIK penetrace klesá</strong> (49→39 %): víkendoví přijíždějí čím dál tím víc vlastní dopravou (oddíly s busem). Počet autobusů klesá.</li>
                                    <li className="text-muted-foreground italic">Nevíme: jedou cestovky s naším busem, nebo vlastním? Pokud vlastním = jejich lidi se v penetraci neprojeví.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Vysvětlení kategorií + závěry */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="rounded border p-3 space-y-1.5">
                            <div className="font-semibold">Jak fungují kategorie</div>
                            <ul className="space-y-1 text-muted-foreground">
                                <li><strong>Splutí / Závod</strong> = jízda dolů řekou.</li>
                                <li><strong>Permice = autobus nahoru k startu.</strong> Závodník má závod = jízda dolů; autobus zpět k autu musí koupit zvlášť → závodníci typicky permici berou.</li>
                                <li><strong>Výjimka:</strong> oddíl s vlastním busem → členové nepotřebují naší permici, jen splutí/závod → permice VIK klesá rychleji než počet vodáků.</li>
                            </ul>
                        </div>
                        <div className="rounded border p-3 space-y-1.5">
                            <div className="font-semibold">Klíčové trendy pro plánování 2026</div>
                            <ul className="space-y-1 text-muted-foreground">
                                <li><strong className="text-green-700">Splutí NE roste</strong> (+10 % 2022→2024): přijíždí cestovky — plánovat ~130.</li>
                                <li><strong className="text-green-700">Permice SO stabilní</strong> (±3 % za 5 let): jistý základ ~112.</li>
                                <li><strong className="text-red-600">Splutí VIK klesá</strong> −55 % za 5 let: plánovat konzervativně ~50.</li>
                                <li><strong className="text-orange-600">Permice VIK klesá</strong> −16 %: oddíly jedou vlastním busem. S bounce 2026: ~100.</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ===== MULTI-FAKTOR MODEL ===== */}
            <Card className="border-primary/30">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Upravený model: trend + faktory</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="rounded border p-3 space-y-1">
                            <div className="font-semibold text-xs text-muted-foreground uppercase">Počasí</div>
                            <div className="flex justify-between"><span>Dobré</span><span className="font-bold text-green-600">+20</span></div>
                            <div className="flex justify-between"><span>Průměrné</span><span>0</span></div>
                            <div className="flex justify-between"><span>Špatné</span><span className="font-bold text-red-600">−25</span></div>
                        </div>
                        <div className="rounded border p-3 space-y-1">
                            <div className="font-semibold text-xs text-muted-foreground uppercase">Bounce + substituce</div>
                            <div className="flex justify-between"><span>Po zrušení + Teplá zrušena</span><span className="font-bold text-green-600">+30</span></div>
                            <div className="flex justify-between"><span>Normálně</span><span>0</span></div>
                        </div>
                        <div className="rounded border p-3 space-y-1">
                            <div className="font-semibold text-xs text-muted-foreground uppercase">28.9. MOST efekt</div>
                            <div className="flex justify-between"><span>MOST + ≤5 dní do Hameráku</span><span className="font-bold text-orange-600">−15</span></div>
                            <div className="flex justify-between"><span>MOST + 6–8+ dní</span><span>0</span></div>
                            <div className="flex justify-between"><span>Bez mostu</span><span>0</span></div>
                        </div>
                    </div>
                    <div className="rounded bg-primary/5 border border-primary/20 p-3">
                        <div className="text-sm font-semibold mb-2">Výpočet 2026 — základní scénář:</div>
                        <div className="font-mono text-sm space-y-0.5">
                            <div>Trend 2026:       {TREND_2026}</div>
                            <div>+ Bounce/subst.:  +{BOUNCE}  <span className="text-muted-foreground text-xs">(po zrušení 2025)</span></div>
                            <div>+ Počasí:          0   <span className="text-muted-foreground text-xs">(neznámé)</span></div>
                            <div>+ 28.9. (5 dní):  −10  <span className="text-muted-foreground text-xs">(mírný efekt, Hamerák 3.10.)</span></div>
                            <div className="border-t mt-1 pt-1 font-bold">= <span className="text-primary">{TREND_2026 + BOUNCE - 10}</span> závodníků (základní)</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ===== FAKTORY ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Všechny faktory — dostupnost a důležitost</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b bg-muted/40 text-muted-foreground">
                                <th className="text-left px-4 py-2">Faktor</th>
                                <th className="text-center px-3 py-2">Důl.</th>
                                <th className="text-left px-3 py-2">Dostupnost</th>
                                <th className="text-left px-4 py-2 hidden md:table-cell">Poznámka</th>
                            </tr>
                        </thead>
                        <tbody>
                            {faktory.map(f => (
                                <tr key={f.nazev} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="px-4 py-1.5 font-medium">{f.nazev}</td>
                                    <td className="px-3 py-1.5 text-center"><Stars n={f.d} /></td>
                                    <td className="px-3 py-1.5 text-muted-foreground">{f.dostupnost}</td>
                                    <td className="px-4 py-1.5 text-muted-foreground hidden md:table-cell">{f.pozn}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* ===== PREDIKCE 2026 TABULKA ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Predikce 2026 po kategoriích (lineární trend)</CardTitle>
                    <p className="text-xs text-muted-foreground">Splutí NE: slope z dat 2022→2024 je +5.5 — pozor, trend krátkodobý, s velkou nejistotou. Přidat +~30 bounce na Závod.</p>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                                <th className="text-left px-4 py-2">Kategorie</th>
                                <th className="text-right px-3 py-2">2022</th>
                                <th className="text-right px-3 py-2">2024</th>
                                <th className="text-right px-4 py-2">Predikce 2026</th>
                                <th className="text-right px-3 py-2">Trend/rok</th>
                                <th className="text-right px-3 py-2">R²</th>
                                <th className="text-center px-3 py-2">Stabilita</th>
                            </tr>
                        </thead>
                        <tbody>
                            {predikce2026.map(r => (
                                <tr key={r.kat} className={cn("border-b last:border-0 hover:bg-muted/20",
                                    r.slope > 0 ? "bg-green-50/30" : "")}>
                                    <td className="px-4 py-2 font-medium">{r.kat}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.sk22}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{r.sk24}</td>
                                    <td className="px-4 py-2 text-right font-bold tabular-nums">
                                        {r.pred}
                                        <span className="text-xs font-normal text-muted-foreground ml-1">[{r.ciMin}–{r.ciMax}]</span>
                                    </td>
                                    <td className={cn("px-3 py-2 text-right tabular-nums text-xs",
                                        r.slope > 0 ? "text-green-600" : r.slope < -10 ? "text-red-600" : "text-orange-600")}>
                                        {r.slope > 0 ? "+" : ""}{r.slope.toFixed(1)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">{r.r2.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-center"><StabilitaBadge s={r.stabilita} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* ===== TIMELINE + SCÉNÁŘE ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Přehled všech ročníků</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b bg-muted/40 text-muted-foreground">
                                    <th className="text-left px-3 py-1.5">Rok</th>
                                    <th className="text-center px-2 py-1.5">Status</th>
                                    <th className="text-right px-2 py-1.5">Záv.</th>
                                    <th className="text-right px-2 py-1.5">Res.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rocniky.map(r => {
                                    const res = r.zavod && r.trend ? r.zavod - r.trend : null;
                                    return (
                                        <tr key={r.rok} className={cn("border-b last:border-0",
                                            r.status === "zrusen" ? "bg-red-50" : "hover:bg-muted/20")}>
                                            <td className="px-3 py-1 font-medium">{r.rok}</td>
                                            <td className="px-2 py-1 text-center">
                                                {r.status === "ok"
                                                    ? <Badge variant="outline" className="text-[10px] px-1 border-green-600 text-green-700">ok</Badge>
                                                    : <Badge variant="destructive" className="text-[10px] px-1">zrušen</Badge>}
                                            </td>
                                            <td className="px-2 py-1 text-right tabular-nums">{r.zavod ?? "—"}</td>
                                            <td className={cn("px-2 py-1 text-right font-semibold tabular-nums",
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
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Scénáře 2026</CardTitle>
                        <p className="text-xs text-muted-foreground">Předpoklad: voda je (Oldříš nad threshold).</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="rounded border border-blue-200 bg-blue-50 p-3">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold text-sm">Pesimistický</span>
                                <Badge variant="destructive" className="text-xs">špatné počasí</Badge>
                            </div>
                            <div className="text-2xl font-bold text-blue-700">~168</div>
                            <div className="text-xs font-mono text-muted-foreground">{TREND_2026}+{BOUNCE}−25(počasí)−10(28.9.)={TREND_2026+BOUNCE-25-10}</div>
                        </div>
                        <div className="rounded border-2 border-primary bg-primary/5 p-3">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold text-sm">Základní</span>
                                <Badge className="text-xs">průměrné podmínky</Badge>
                            </div>
                            <div className="text-2xl font-bold text-primary">{TREND_2026 + BOUNCE - 10}</div>
                            <div className="text-xs font-mono text-muted-foreground">{TREND_2026}+{BOUNCE}+0−10(28.9.)={TREND_2026+BOUNCE-10}</div>
                        </div>
                        <div className="rounded border border-yellow-200 bg-yellow-50 p-3">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold text-sm">Optimistický</span>
                                <Badge variant="outline" className="text-xs border-yellow-600 text-yellow-700">babí léto</Badge>
                            </div>
                            <div className="text-2xl font-bold text-yellow-700">{TREND_2026 + BOUNCE + 20}</div>
                            <div className="text-xs font-mono text-muted-foreground">{TREND_2026}+{BOUNCE}+20(počasí)+0={TREND_2026+BOUNCE+20}</div>
                        </div>
                        <div className="rounded bg-red-50 border border-red-200 p-2 text-xs text-red-700">
                            <strong>Nulový:</strong> Málo vody → zrušení. Sledovat Oldříš od července.
                        </div>
                    </CardContent>
                </Card>
            </div>

            <p className="text-xs text-muted-foreground">
                <strong>Zdroje:</strong> Excel OVT · kanoe.cz (ČPV sezóna 2024) · padler.cz · data.hladiny.cz · hydro.chmi.cz · scipy linregress.
                Korekce jsou expert estimates z residuálů 2016–2024 (n=6), ne statisticky validované.
            </p>
        </div>
    );
}
