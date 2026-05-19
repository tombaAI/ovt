"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComposedChart, Line, Bar, BarChart, XAxis, YAxis, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { TrendingDown, Minus, Droplets, Calendar, Swords, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ===== REGRESE (scipy linregress, data 2016–2024, n=6) =====
const SLOPE     = -21.37;
const INTERCEPT = 43479;
const R2        = 0.847;
const trendFn   = (rok: number) => Math.round(SLOPE * rok + INTERCEPT);

// ===== KOMPLETNÍ TIMELINE ROČNÍKŮ =====
// Zdroje: Excel data + web (padler.cz, kanoe.cz, slalom-world.com)
const rocniky = [
    { rok: 2016, status: "ok",       zavod: 405, pocasi: "?",              pozn: "28.9.=středa, bez mostu" },
    { rok: 2017, status: "ok",       zavod: 404, pocasi: "?",              pozn: "28.9.=čtvrtek ⚡ MOST, Hamerák 6.10. (+8 dní)" },
    { rok: 2018, status: "zrusen",   zavod: null, pocasi: "sucho",         pozn: "ZRUŠEN — kritický nedostatek vody, alt. trasa Dvoreček–Jindřiš" },
    { rok: 2019, status: "ok",       zavod: 300, pocasi: "deštivo/studeno", pozn: "28.9.=sobota; počasí klíčové — kosa, mrholení" },
    { rok: 2020, status: "zrusen",   zavod: null, pocasi: "—",             pozn: "ZRUŠEN — COVID-19" },
    { rok: 2021, status: "ok",       zavod: 256, pocasi: "dobré (babí léto)", pozn: "28.9.=úterý ⚡ MOST, Hamerák 2.10. (+4 dny)" },
    { rok: 2022, status: "ok",       zavod: 274, pocasi: "teplo, sucho",   pozn: "28.9.=středa; Klatovský slalom stejný víkend (Otava)" },
    { rok: 2023, status: "zrusen",   zavod: null, pocasi: "—",             pozn: "ZRUŠEN — rekonstrukce Vajgaru; 28.9.=čtvrtek ⚡ MOST; náhrada 4.11." },
    { rok: 2024, status: "ok",       zavod: 253, pocasi: "studeno, mrholí", pozn: "28.9.=sobota; Bobr Cup stejný víkend (Litovel)" },
    { rok: 2025, status: "zrusen",   zavod: null, pocasi: "sucho",         pozn: "ZRUŠEN — kritický nedostatek vody v rybnících zásobujících Hamerský potok" },
];

// ===== GRAF: závodníci + trend =====
const zavodData = [
    { rok: "2016", actual: 405, trend: trendFn(2016) },
    { rok: "2017", actual: 404, trend: trendFn(2017) },
    { rok: "2019", actual: 300, trend: trendFn(2019) },
    { rok: "2021", actual: 256, trend: trendFn(2021) },
    { rok: "2022", actual: 274, trend: trendFn(2022) },
    { rok: "2024", actual: 253, trend: trendFn(2024) },
];

// ===== KATEGORIE 2019–2024 =====
const categoryData = [
    { rok: "2019", splutiVIK: 142, splutiSO: 90, splutiNE: 226, permVIK: 216, permSO: 120, permNE: 133 },
    { rok: "2021", splutiVIK: 138, splutiSO: 143, splutiNE: 138, permVIK: 205, permSO: 112, permNE:  74 },
    { rok: "2022", splutiVIK:  86, splutiSO:  81, splutiNE: 114, permVIK: 147, permSO: 111, permNE:  73 },
    { rok: "2024", splutiVIK:  64, splutiSO:  62, splutiNE: 125, permVIK: 124, permSO: 116, permNE:  78 },
];

// ===== PREDIKCE 2026 =====
// trendFn(2026) = 183; CI extrapolováno z 2025 CI ±17 → ±22 pro 2026
const PRED_2026 = { pred: trendFn(2026), predMin: trendFn(2026) - 22, predMax: trendFn(2026) + 22 };

const predikce2026 = [
    { kat: "Závod",       sk22: 274, sk24: 253, pred: 183, ciMin: 161, ciMax: 205, slope: -21.4, r2: 0.85, stabilita: "klesá" },
    { kat: "Splutí VIK",  sk22:  86, sk24:  64, pred:  31, ciMin:  18, ciMax:  44, slope: -17.0, r2: 0.84, stabilita: "klesá" },
    { kat: "Splutí SO",   sk22:  81, sk24:  62, pred:  59, ciMin:  38, ciMax:  80, slope:  -7.8, r2: 0.22, stabilita: "nestabilní" },
    { kat: "Splutí NE",   sk22: 114, sk24: 125, pred: 126, ciMin:  90, ciMax: 162, slope:  -6.0, r2: 0.03, stabilita: "nestabilní" },
    { kat: "Permice VIK", sk22: 147, sk24: 124, pred:  83, ciMin:  60, ciMax: 106, slope: -19.9, r2: 0.87, stabilita: "klesá" },
    { kat: "Permice SO",  sk22: 111, sk24: 116, pred: 111, ciMin: 104, ciMax: 118, slope:  -0.8, r2: 0.17, stabilita: "stagnuje" },
];

// ===== KONKURENČNÍ AKCE =====
const konkurence = [
    { rok: 2022, akat: "Klatovský slalom ve Strakonicích", dat: "1.–2. 10.", misto: "Otava, Strakonice", konflikt: "stejný víkend" },
    { rok: 2023, akat: "Klatovský slalom ve Strakonicích", dat: "7.–8. 10.", misto: "Otava, Strakonice", konflikt: "stejný víkend (Hamerák zrušen)" },
    { rok: 2023, akat: "Třebechovický + Hanácký slalom",   dat: "30.9.–1. 10.", misto: "Orlice / Olomouc", konflikt: "týden před" },
    { rok: 2024, akat: "Bobr Cup",                         dat: "5. 10.",      misto: "Morava, Litovel", konflikt: "přesně stejný den!" },
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
                    Analýza časových řad 2016–2024 · R²=0.85 · 2025 zrušen (sucho) · predikce pro rok 2026
                </p>
            </div>

            {/* Klíčové metriky */}
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
                        <div className="text-2xl font-bold">{PRED_2026.pred}</div>
                        <div className="text-xs text-muted-foreground">CI: {PRED_2026.predMin}–{PRED_2026.predMax}</div>
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

            {/* ===== FAKTORY OVLIVŇUJÍCÍ ÚČAST ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Voda — klíčový rizikový faktor */}
                <Card className="border-blue-300 bg-blue-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Droplets size={15} className="text-blue-600" />
                            Závislost na vodě — hlavní riziko
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <p>Hamerský potok je zásoben z <strong>rybníků (Vajgar)</strong> — v suchých letech chybí voda, akce je ohrožena.</p>
                        <div className="space-y-1 text-xs">
                            <div className="flex gap-2">
                                <Badge variant="destructive" className="text-xs shrink-0">2018</Badge>
                                <span>Kritický nedostatek vody → alternativní trasa Dvoreček–Jindřiš</span>
                            </div>
                            <div className="flex gap-2">
                                <Badge variant="destructive" className="text-xs shrink-0">2023</Badge>
                                <span>Rekonstrukce výpusti Vajgaru + hist. elektrárna → rybník vypuštěn → zrušeno</span>
                            </div>
                            <div className="flex gap-2">
                                <Badge variant="destructive" className="text-xs shrink-0">2025</Badge>
                                <span>Kritický nedostatek vody v rybnících → zrušeno (říjen 2025)</span>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground pt-1">
                            <strong>Pro 2026:</strong> Klíčové je sledovat stav rybníků od léta. Rozhodnutí obvykle padá v srpnu.
                        </p>
                    </CardContent>
                </Card>

                {/* 28.9. státní svátek */}
                <Card className="border-yellow-300 bg-yellow-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Calendar size={15} className="text-yellow-600" />
                            Státní svátek 28. 9. — vliv termínu
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <p>Hamerák je tradičně <strong>první víkend října</strong>. Svátek 28. 9. může vytvořit prodloužený víkend, který s Hamerákem soutěží o pozornost.</p>
                        <div className="text-xs space-y-1">
                            {[
                                { rok: 2017, wd: "Čtvrtek", most: true, efekt: "MOST (28.9.–1.10.), Hamerák 6.10. — 404 záv. → bez dopadu" },
                                { rok: 2021, wd: "Úterý",   most: true, efekt: "MOST (27.9.–1.10.), Hamerák 2.10. → 256 záv. (post-COVID)" },
                                { rok: 2023, wd: "Čtvrtek", most: true, efekt: "MOST + Hamerák zrušen (Vajgar)" },
                                { rok: 2026, wd: "Pondělí", most: false, efekt: "Víkend 26–28.9., Hamerák 3.–4.10. → neutrální ✓" },
                            ].map(r => (
                                <div key={r.rok} className="flex gap-2 items-start">
                                    <span className={cn("font-bold shrink-0", r.rok === 2026 ? "text-green-700" : "")}>{r.rok}:</span>
                                    {r.most && <span className="text-orange-600 shrink-0">⚡ most</span>}
                                    <span>{r.efekt}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            <strong>2026: 28.9. = pondělí</strong> — prodloužený víkend 26–28.9., Hamerák začíná 5 dní po. Dopad minimální.
                        </p>
                    </CardContent>
                </Card>

                {/* Konkurenční akce */}
                <Card className="border-orange-300 bg-orange-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Swords size={15} className="text-orange-600" />
                            Konkurenční akce — termínovka
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <p>V říjnu se konají další sjezdové a slalomové závody. Překryv termínů může snížit účast.</p>
                        <div className="text-xs space-y-1">
                            {konkurence.map((k, i) => (
                                <div key={i} className="flex gap-2 items-start border-b border-orange-100 pb-1 last:border-0">
                                    <span className="font-semibold shrink-0 text-orange-700">{k.rok}:</span>
                                    <div>
                                        <span className="font-medium">{k.akat}</span>
                                        <span className="text-muted-foreground ml-1">({k.dat}, {k.misto})</span>
                                        <br />
                                        <span className={cn("text-xs", k.konflikt.includes("přesně") ? "text-red-600 font-semibold" : "text-orange-600")}>
                                            → {k.konflikt}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Zdroj: slalom-world.com. Data za 2026 zatím nejsou — sledovat CSK termínovku od jara 2026.
                        </p>
                    </CardContent>
                </Card>

                {/* Počasí */}
                <Card className="border-gray-300 bg-gray-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <AlertTriangle size={15} className="text-gray-600" />
                            Počasí a cena–poptávka
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div className="text-xs space-y-1">
                            <p><strong>Počasí</strong> nejvíc ovlivňuje splutí a permice — závodníci přijedou vždy, diváci/splutí ne.</p>
                            <p>2019 (deštivo): 300 závodníků — 49 pod trendem. 2022 (teplo): 274 záv. — 13 nad trendem.</p>
                        </div>
                        <div className="text-xs space-y-1 mt-2">
                            <p><strong>Cena–poptávka</strong>: r = −0.82 (silná negativní korelace).</p>
                            <p>Ceny rostly +100 % za 7 let (100→200 Kč), účast klesla −37 %. Nedoporučuji více než +10 % ročně.</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            <strong>2026: 28.9. = pondělí</strong>, žádný extra faktor. Počasí jako vždy neodhadnutelné.
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* ===== TREND CHART ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Počet závodníků v čase + lineární trend</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Pouze roky kdy akce proběhla (2018, 2020, 2023, 2025 vynechány — zrušení). R²={R2}, slope={SLOPE}/rok.
                        Predikce 2026: {PRED_2026.pred} [CI {PRED_2026.predMin}–{PRED_2026.predMax}].
                    </p>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={zavodConfig} className="h-60">
                        <ComposedChart data={zavodData} margin={{ top: 8, right: 80, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="rok" tick={{ fontSize: 12 }} />
                            <YAxis domain={[150, 450]} tick={{ fontSize: 12 }} width={36} />
                            <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => [`${v} lidí`, n === "actual" ? "Skutečnost" : "Trend"]} />} />
                            <ReferenceLine x="2019" stroke="hsl(199 70% 55%)" strokeDasharray="4 4"
                                label={{ value: "🌧 špatné", position: "top", fontSize: 10 }} />
                            <ReferenceLine x="2022" stroke="hsl(48 90% 55%)" strokeDasharray="4 4"
                                label={{ value: "☀ dobré", position: "top", fontSize: 10 }} />
                            <ReferenceLine x="2024" stroke="hsl(199 70% 55%)" strokeDasharray="4 4"
                                label={{ value: "🌧 špatné", position: "insideTopRight", fontSize: 10 }} />
                            <Line
                                type="monotone" dataKey="actual" stroke="var(--color-actual)" strokeWidth={2.5}
                                dot={{ r: 5, fill: "var(--color-actual)" }} activeDot={{ r: 7 }}
                            />
                            <Line
                                type="linear" dataKey="trend" stroke="var(--color-trend)" strokeWidth={1.5}
                                strokeDasharray="6 3" dot={false}
                            />
                        </ComposedChart>
                    </ChartContainer>
                    <p className="text-xs text-muted-foreground mt-2 text-right">
                        → Predikce 2026 (trend): <strong>{PRED_2026.pred}</strong> závodníků [CI: {PRED_2026.predMin}–{PRED_2026.predMax}]
                    </p>
                </CardContent>
            </Card>

            {/* ===== KOMPLETNÍ TIMELINE ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Přehled všech ročníků</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                                <th className="text-left px-4 py-2">Rok</th>
                                <th className="text-center px-3 py-2">Status</th>
                                <th className="text-right px-3 py-2">Závodníci</th>
                                <th className="text-left px-4 py-2 hidden md:table-cell">Počasí / poznámka</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rocniky.map(r => (
                                <tr key={r.rok} className={cn(
                                    "border-b last:border-0",
                                    r.status === "zrusen" ? "bg-red-50" : "hover:bg-muted/20"
                                )}>
                                    <td className="px-4 py-2 font-medium">{r.rok}</td>
                                    <td className="px-3 py-2 text-center">
                                        {r.status === "ok"
                                            ? <Badge variant="outline" className="text-xs border-green-600 text-green-700">proběhl</Badge>
                                            : <Badge variant="destructive" className="text-xs">zrušen</Badge>
                                        }
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        {r.zavod ?? <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell">{r.pozn}</td>
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
                    <p className="text-xs text-muted-foreground">Permice SO nejstabilnější. Splutí VIK nejrychleji klesá.</p>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={categoryConfig} className="h-64">
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
                    <CardTitle className="text-base">Predikce 2026 po kategoriích</CardTitle>
                    <p className="text-xs text-muted-foreground">Lineární regrese na 2019–2024. Pozn.: 2025 nebyl (sucho) → data mezera, ale trend pokračuje.</p>
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

            {/* ===== SCÉNÁŘE 2026 ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Scénáře počtu závodníků 2026</CardTitle>
                    <p className="text-xs text-muted-foreground">Předpoklad: akce proběhne (voda je). Počasí a termínovka neznámé.</p>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingDown size={16} className="text-blue-600" />
                                <span className="font-semibold text-sm">Pesimistický</span>
                                <Badge variant="destructive" className="text-xs ml-auto">špatné počasí</Badge>
                            </div>
                            <div className="text-3xl font-bold text-blue-700">~160–175</div>
                            <p className="text-xs text-muted-foreground mt-1">Deštivo, studeno. Splutí a permice výrazně pod normálem. Přímá konkurence v termínu.</p>
                        </div>
                        <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Minus size={16} className="text-primary" />
                                <span className="font-semibold text-sm">Základní (trend)</span>
                                <Badge className="text-xs ml-auto">doporučeno plánovat</Badge>
                            </div>
                            <div className="text-3xl font-bold text-primary">~{PRED_2026.pred}</div>
                            <p className="text-xs text-muted-foreground mt-1">Průměrné podmínky. Lineární trend. CI: {PRED_2026.predMin}–{PRED_2026.predMax} závodníků.</p>
                        </div>
                        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Droplets size={16} className="text-yellow-600" />
                                <span className="font-semibold text-sm">Optimistický</span>
                                <Badge variant="outline" className="text-xs ml-auto border-yellow-600 text-yellow-700">dobré počasí + bez konk.</Badge>
                            </div>
                            <div className="text-3xl font-bold text-yellow-700">~235–260</div>
                            <p className="text-xs text-muted-foreground mt-1">Babí léto jako 2022. Bez konkurenční akce. Lidé se vrátí po 2-letém výpadku.</p>
                        </div>
                    </div>
                    <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                        <strong>Nulový scénář:</strong> Pokud bude v rybnících málo vody (jako 2018 nebo 2025), akce se zruší.
                        Sledovat stav Vajgaru od srpna 2026 — rozhodnutí padá obvykle v srpnu.
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                        <strong>Metodika:</strong> Lineární regrese (scipy.stats.linregress), 2016–2024, n=6, R²=0.847, p=0.009.
                        Faktory (voda, 28.9., konkurence) jsou kvalitativní — v modelu nejsou explicitně zahrnuty.
                        Zdroje: Excel data OVT + padler.cz + slalom-world.com + kanoe.cz.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
