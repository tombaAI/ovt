"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type RevenueRow = {
    id: string;
    label: string;
    sublabel?: string;
    count: number | null;
    price: number;
};

type CostRow = {
    id: string;
    label: string;
    amount: number;
};

type Scenario = "pessimistic" | "base" | "optimistic" | "custom";

// Predikce 2026 z hamerak-predikce-client: lineární trend + bounce po zrušení 2025
// závodníci: trendFn(2026)=183 + bounce 30 = 213
// splutí NE roste (counter-trend, cestovky v neděli), VIK strmě klesá
const BASE_REVENUE: RevenueRow[] = [
    { id: "zavod",        label: "Závod",       sublabel: "závodní čísla",  count: 213, price: 220 },
    { id: "spluti_vik",   label: "Splutí VIK",  sublabel: "pátek + neděle", count: 35,  price: 220 },
    { id: "spluti_so",    label: "Splutí SO",   sublabel: "sobota",         count: 60,  price: 165 },
    { id: "spluti_ne",    label: "Splutí NE",   sublabel: "neděle",         count: 130, price: 165 },
    { id: "permice_vik",  label: "Permice VIK", sublabel: "víkend",         count: 100, price: 250 },
    { id: "permice_so",   label: "Permice SO",  sublabel: "sobota",         count: 110, price: 210 },
    { id: "permice_ne",   label: "Permice NE",  sublabel: "neděle",         count: 80,  price: 185 },
    { id: "kelimky",      label: "Kelímky",     sublabel: "prodej",         count: null, price: 5000 },
    { id: "sponzoring",   label: "Sponzoring",  sublabel: "sleva autobus",  count: null, price: 10000 },
    { id: "dotace",       label: "Dotace ČSK",                              count: null, price: 65000 },
];

// Scénáře ovlivňují pouze počty — ceny/fixní položky se nemění
// Odvozeno z predikce (lineární trend + CI + bounce po zrušení 2025)
const SCENARIO_OVERRIDES: Record<Exclude<Scenario, "custom">, Record<string, { count?: number }>> = {
    pessimistic: {
        zavod:       { count: 168 },  // trend+bounce-25(počasí)-10(28.9.) = 178, konzervativně
        spluti_vik:  { count: 20 },   // predikce CI min=18
        spluti_so:   { count: 40 },   // predikce CI min=38
        spluti_ne:   { count: 95 },   // predikce CI min=95 (roste, ale špatné počasí tlačí)
        permice_vik: { count: 72 },   // predikce CI min=60 + malý bounce
        permice_so:  { count: 100 },  // pod predikce stabilní hodnotou 111
        permice_ne:  { count: 60 },
    },
    base: {
        zavod:       { count: 213 },  // trend 183 + bounce 30
        spluti_vik:  { count: 35 },   // predikce 31 + malý bounce
        spluti_so:   { count: 60 },   // predikce 59
        spluti_ne:   { count: 130 },  // predikce 130 (roste, counter-trend)
        permice_vik: { count: 100 },  // predikce 83 + bounce ~15
        permice_so:  { count: 110 },  // predikce 111 (nejstabilnější)
        permice_ne:  { count: 80 },   // trend +7 %/2 roky z 78
    },
    optimistic: {
        zavod:       { count: 233 },  // trend+bounce+20(babí léto) = 233
        spluti_vik:  { count: 50 },   // predikce CI max=44 + bounce
        spluti_so:   { count: 80 },   // predikce CI max=80
        spluti_ne:   { count: 165 },  // predikce CI max=165
        permice_vik: { count: 120 },  // predikce CI max=106 + bounce
        permice_so:  { count: 125 },  // mírně nad stabilní hodnotu
        permice_ne:  { count: 100 },
    },
};

const DEFAULT_COSTS: CostRow[] = [
    { id: "bus",          label: "Bus Jan Kukla",             amount: 132000 },
    { id: "chatky",       label: "Ubytování chatky",          amount: 62700 },
    { id: "vodohospo",    label: "Vodohospodářství (rybáři)", amount: 19000 },
    { id: "hrnky",        label: "Hrnky potisk",              amount: 7700 },
    { id: "permice_tisk", label: "Permice tisk",              amount: 6600 },
    { id: "pivo",         label: "Pivo Kamenice",             amount: 5000 },
    { id: "benzin",       label: "Benzín / obslužná vozidla", amount: 6300 },
    { id: "priprava",     label: "Přípravné práce",           amount: 8000 },
    { id: "mistni",       label: "Místní poplatky",           amount: 5000 },
    { id: "material",     label: "Materiál (pytle, folie…)",  amount: 4700 },
    { id: "postovne",     label: "Poštovné",                  amount: 1100 },
    { id: "ostatni",      label: "Ostatní",                   amount: 5000 },
];

// Historické náklady po položkách — zdroj: Vyúčtování Hamerák 2022 + Rozpočet_H22 + Vyúčtování 2024
// Celkové součty skutečnost: 2022 = 219 221 Kč (vč. kelímků výroba 17 726!), 2024 = 210 212 Kč
// benzin    = obslužná vozidla + cesty příprava (cesťáky)
// mistni    = Boček hráz vstup + Hrázný Fučík + Feit louka Dvoreček
// material  = materiál náklady (pytle, folie) + materiál branky + materiál příprava
// priprava  = nelze jednoznačně oddělit od cesťáků v dostupných datech
// ostatni   = občerstvení (pivo je zvlášť); kelímky nákup 2022 (17 726) je jednorázový náklad mimo tuto tabulku
const COST_HISTORY: Record<string, { r2022: number | null; r2024: number | null }> = {
    bus:          { r2022: 102000, r2024: 100600 },
    chatky:       { r2022: 50100,  r2024: 45600  },
    vodohospo:    { r2022: 14520,  r2024: 18150  },
    hrnky:        { r2022: 6500,   r2024: 8442   },
    permice_tisk: { r2022: 6000,   r2024: 10000  },
    pivo:         { r2022: 4000,   r2024: 3000   },
    benzin:       { r2022: 4535,   r2024: 4265   },
    priprava:     { r2022: null,   r2024: null   },
    mistni:       { r2022: 4000,   r2024: 4200   },
    material:     { r2022: 3258,   r2024: 6980   },
    postovne:     { r2022: null,   r2024: 1020   },
    ostatni:      { r2022: 3005,   r2024: 6755   },
};

// Skutečné hodnoty ze 3 Excel souborů (H22_celkovy_vysledek + Rozpočet_H22 + Vyúčtování 2022)
// 2022 příjmy: vstupenky 153 170 + dotace ČSK 65 000 = 218 250 (původní 243 860 bylo chybně)
// 2024 náklady: skutečnost 210 212 (původní 237 500 byl plánovaný rozpočet, ne skutečnost)
const HISTORY = [
    { rok: 2021, prijmy: 211180, naklady: 198600, zavornici: 256 },
    { rok: 2022, prijmy: 218250, naklady: 219221, zavornici: 274 },
    { rok: 2023, prijmy: 94075,  naklady: 169519, zavornici: null },
    { rok: 2024, prijmy: 218250, naklady: 210212, zavornici: 253 },
];

const SCENARIO_LABELS: Record<Exclude<Scenario, "custom">, string> = {
    pessimistic: "Pesimistický",
    base:        "Základní",
    optimistic:  "Optimistický",
};

function fmt(n: number): string {
    return n.toLocaleString("cs-CZ") + " Kč";
}

function rowTotal(r: RevenueRow): number {
    return r.count !== null ? r.count * r.price : r.price;
}

function parseNum(val: string): number {
    return Math.max(0, parseInt(val, 10) || 0);
}

let uid = 0;
function nextId(prefix: string) {
    return `${prefix}_${++uid}_${Date.now()}`;
}

export function HamerakClient() {
    const [revenue, setRevenue] = useState<RevenueRow[]>(BASE_REVENUE);
    const [costs, setCosts] = useState<CostRow[]>(DEFAULT_COSTS);
    const [scenario, setScenario] = useState<Scenario>("base");

    const totalRevenue = revenue.reduce((sum, r) => sum + rowTotal(r), 0);
    const totalCosts = costs.reduce((sum, c) => sum + c.amount, 0);
    const balance = totalRevenue - totalCosts;
    const dotace = revenue.find(r => r.id === "dotace")?.price ?? 0;
    const revenueFromSales = totalRevenue - dotace;
    const neededFromSales = totalCosts - dotace;

    function applyScenario(s: Exclude<Scenario, "custom">) {
        setScenario(s);
        const overrides = SCENARIO_OVERRIDES[s];
        setRevenue(prev =>
            prev.map(r => {
                const o = overrides[r.id];
                if (!o || o.count === undefined || r.count === null) return r;
                return { ...r, count: o.count };
            })
        );
    }

    function updateRevLabel(id: string, val: string) {
        setScenario("custom");
        setRevenue(prev => prev.map(r => r.id === id ? { ...r, label: val } : r));
    }
    function updateRevCount(id: string, val: number) {
        setScenario("custom");
        setRevenue(prev => prev.map(r => r.id === id ? { ...r, count: val } : r));
    }
    function updateRevPrice(id: string, val: number) {
        setScenario("custom");
        setRevenue(prev => prev.map(r => r.id === id ? { ...r, price: val } : r));
    }
    function addRevRow() {
        setScenario("custom");
        setRevenue(prev => [...prev, { id: nextId("rev"), label: "Nová položka", count: 0, price: 0 }]);
    }
    function removeRevRow(id: string) {
        setScenario("custom");
        setRevenue(prev => prev.filter(r => r.id !== id));
    }

    function updateCostLabel(id: string, val: string) {
        setCosts(prev => prev.map(c => c.id === id ? { ...c, label: val } : c));
    }
    function updateCostAmount(id: string, val: number) {
        setCosts(prev => prev.map(c => c.id === id ? { ...c, amount: val } : c));
    }
    function addCostRow() {
        setCosts(prev => [...prev, { id: nextId("cost"), label: "Nová položka", amount: 0 }]);
    }
    function removeCostRow(id: string) {
        setCosts(prev => prev.filter(c => c.id !== id));
    }

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
            {/* Hlavička */}
            <div>
                <h1 className="text-2xl font-bold">Hamerák 2026 — Návrh rozpočtu</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Interaktivní kalkulačka příjmů a nákladů · plánovaný ročník 2026 · ceny +10 % vs. 2024 (2025 nebyl — sucho)
                </p>
            </div>

            {/* Souhrnná bilance */}
            <Card className={cn("border-2", balance >= 0 ? "border-green-500" : "border-red-400")}>
                <CardContent className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex gap-6 md:gap-12">
                            <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">Celkem příjmy</div>
                                <div className="text-xl font-bold text-green-700">{fmt(totalRevenue)}</div>
                                <div className="text-xs text-muted-foreground">z toho prodej: {fmt(revenueFromSales)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">Celkem náklady</div>
                                <div className="text-xl font-bold text-red-600">{fmt(totalCosts)}</div>
                                <div className={cn("text-xs", revenueFromSales >= neededFromSales ? "text-green-600" : "text-red-500")}>
                                    potřeba z prodeje: {fmt(neededFromSales)}
                                    {revenueFromSales < neededFromSales && (
                                        <span className="ml-1">(chybí {fmt(neededFromSales - revenueFromSales)})</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-muted-foreground uppercase tracking-wide">Bilance</div>
                            <div className={cn("text-3xl font-bold tabular-nums", balance >= 0 ? "text-green-600" : "text-red-600")}>
                                {balance >= 0 ? "+" : ""}{fmt(balance)}
                            </div>
                            <Badge variant={balance >= 0 ? "default" : "destructive"} className="mt-1">
                                {balance >= 0 ? "Přebytek" : "Deficit"}
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Příjmy a náklady — pod sebou, aby se vešly sloupce 2022/2024 */}
            <div className="space-y-5">
                {/* Příjmy */}
                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base">Příjmy</CardTitle>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-muted-foreground">Scénář počtů:</span>
                                {(["pessimistic", "base", "optimistic"] as const).map(s => (
                                    <Button
                                        key={s}
                                        size="sm"
                                        variant={scenario === s ? "default" : "outline"}
                                        onClick={() => applyScenario(s)}
                                        className="h-7 text-xs px-2"
                                    >
                                        {SCENARIO_LABELS[s]}
                                    </Button>
                                ))}
                                {scenario === "custom" && <Badge variant="secondary">Vlastní</Badge>}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                                    <th className="text-left px-4 py-2 font-medium">Kategorie</th>
                                    <th className="text-center px-2 py-2 font-medium w-20">Počet</th>
                                    <th className="text-center px-2 py-2 font-medium w-24">Cena</th>
                                    <th className="text-right px-4 py-2 font-medium w-28">Příjem</th>
                                    <th className="w-8" />
                                </tr>
                            </thead>
                            <tbody>
                                {revenue.map(r => (
                                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors group">
                                        <td className="px-2 py-1.5">
                                            <Input
                                                value={r.label}
                                                onChange={e => updateRevLabel(r.id, e.target.value)}
                                                className="h-7 text-sm border-transparent hover:border-input focus:border-input bg-transparent"
                                                placeholder="Název položky"
                                            />
                                            {r.sublabel && (
                                                <div className="text-xs text-muted-foreground px-3">{r.sublabel}</div>
                                            )}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                            {r.count !== null ? (
                                                <Input
                                                    type="number"
                                                    value={r.count}
                                                    onChange={e => updateRevCount(r.id, parseNum(e.target.value))}
                                                    className="h-7 w-16 text-center text-sm mx-auto"
                                                    min={0}
                                                />
                                            ) : (
                                                <span className="text-muted-foreground text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                            <Input
                                                type="number"
                                                value={r.price}
                                                onChange={e => updateRevPrice(r.id, parseNum(e.target.value))}
                                                className="h-7 w-24 text-center text-sm mx-auto"
                                                min={0}
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                                            {fmt(rowTotal(r))}
                                        </td>
                                        <td className="pr-2 py-1.5 text-center">
                                            <button
                                                onClick={() => removeRevRow(r.id)}
                                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5 rounded"
                                                title="Smazat řádek"
                                            >
                                                <X size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={5} className="px-4 py-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={addRevRow}
                                            className="h-7 text-xs text-muted-foreground hover:text-foreground w-full justify-start"
                                        >
                                            + Přidat řádek
                                        </Button>
                                    </td>
                                </tr>
                                <tr className="border-t-2 bg-muted/40">
                                    <td colSpan={3} className="px-4 py-3 font-semibold text-sm">Celkem příjmy</td>
                                    <td className="px-4 py-3 text-right font-bold text-green-700 tabular-nums">
                                        {fmt(totalRevenue)}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </CardContent>
                </Card>

                {/* Náklady */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Náklady</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                                    <th className="text-left px-4 py-2 font-medium">Položka</th>
                                    <th className="text-right px-3 py-2 font-medium w-28">2022</th>
                                    <th className="text-right px-3 py-2 font-medium w-28">2024</th>
                                    <th className="text-right px-2 py-2 font-medium w-36">2026 (plán)</th>
                                    <th className="text-right px-4 py-2 font-medium w-10">%</th>
                                    <th className="w-8" />
                                </tr>
                            </thead>
                            <tbody>
                                {costs.map(c => {
                                    const h = COST_HISTORY[c.id];
                                    return (
                                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors group">
                                            <td className="px-2 py-1.5">
                                                <Input
                                                    value={c.label}
                                                    onChange={e => updateCostLabel(c.id, e.target.value)}
                                                    className="h-7 text-sm border-transparent hover:border-input focus:border-input bg-transparent"
                                                    placeholder="Název položky"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                                                {h != null && h.r2022 != null ? fmt(h.r2022) : "—"}
                                            </td>
                                            <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                                                {h != null && h.r2024 != null ? fmt(h.r2024) : "—"}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <Input
                                                    type="number"
                                                    value={c.amount}
                                                    onChange={e => updateCostAmount(c.id, parseNum(e.target.value))}
                                                    className="h-7 w-28 text-right text-sm ml-auto"
                                                    min={0}
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right text-muted-foreground text-xs tabular-nums">
                                                {totalCosts > 0 ? Math.round((c.amount / totalCosts) * 100) : 0} %
                                            </td>
                                            <td className="pr-2 py-1.5 text-center">
                                                <button
                                                    onClick={() => removeCostRow(c.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5 rounded"
                                                    title="Smazat řádek"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={6} className="px-4 py-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={addCostRow}
                                            className="h-7 text-xs text-muted-foreground hover:text-foreground w-full justify-start"
                                        >
                                            + Přidat řádek
                                        </Button>
                                    </td>
                                </tr>
                                <tr className="border-t-2 bg-muted/40">
                                    <td className="px-4 py-3 font-semibold text-sm">Celkem náklady</td>
                                    <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">{fmt(219221)}</td>
                                    <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">{fmt(210212)}</td>
                                    <td className="px-2 py-3 text-right font-bold text-red-600 tabular-nums text-sm">{fmt(totalCosts)}</td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        </table>
                    </CardContent>
                </Card>
            </div>

            {/* Historické srovnání */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base text-muted-foreground">Historické srovnání</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                                <th className="text-left px-4 py-2 font-medium">Rok</th>
                                <th className="text-right px-4 py-2 font-medium">Příjmy</th>
                                <th className="text-right px-4 py-2 font-medium">Náklady</th>
                                <th className="text-right px-4 py-2 font-medium">Bilance</th>
                                <th className="text-right px-4 py-2 font-medium">Závodníci</th>
                            </tr>
                        </thead>
                        <tbody>
                            {HISTORY.map(h => {
                                const bil = h.prijmy - h.naklady;
                                return (
                                    <tr key={h.rok} className="border-b last:border-0 hover:bg-muted/20">
                                        <td className="px-4 py-2 font-medium">{h.rok}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{fmt(h.prijmy)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{fmt(h.naklady)}</td>
                                        <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", bil >= 0 ? "text-green-600" : "text-red-500")}>
                                            {bil >= 0 ? "+" : ""}{fmt(bil)}
                                        </td>
                                        <td className="px-4 py-2 text-right text-muted-foreground">
                                            {h.zavornici ?? "—"}
                                        </td>
                                    </tr>
                                );
                            })}
                            <tr className="border-t-2 bg-muted/20">
                                <td className="px-4 py-2 font-bold text-primary">2026 (plán)</td>
                                <td className="px-4 py-2 text-right font-semibold tabular-nums text-green-700">{fmt(totalRevenue)}</td>
                                <td className="px-4 py-2 text-right font-semibold tabular-nums text-red-600">{fmt(totalCosts)}</td>
                                <td className={cn("px-4 py-2 text-right font-bold tabular-nums", balance >= 0 ? "text-green-600" : "text-red-600")}>
                                    {balance >= 0 ? "+" : ""}{fmt(balance)}
                                </td>
                                <td className="px-4 py-2 text-right text-muted-foreground">
                                    {revenue.find(r => r.id === "zavod")?.count ?? "—"}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
