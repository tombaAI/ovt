"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// 2025 defaults: +10 % ceny vs. 2024, počty mírně pod 2024 (base scénář)
const BASE_REVENUE: RevenueRow[] = [
    { id: "zavod",        label: "Závod",                sublabel: "závodní čísla",  count: 215, price: 220 },
    { id: "spluti_vik",   label: "Splutí VIK",           sublabel: "pátek + neděle", count: 70,  price: 220 },
    { id: "spluti_so",    label: "Splutí SO",             sublabel: "sobota",         count: 120, price: 165 },
    { id: "permice_vik",  label: "Permice VIK",          sublabel: "víkend",         count: 100, price: 250 },
    { id: "permice_so",   label: "Permice SO",            sublabel: "sobota",         count: 210, price: 210 },
    { id: "kelimky",      label: "Kelímky / sponzoring",                              count: null, price: 5000 },
    { id: "dotace",       label: "Dotace ČSK",                                        count: null, price: 62000 },
];

const SCENARIO_OVERRIDES: Record<Exclude<Scenario, "custom">, Record<string, { count?: number; price?: number }>> = {
    pessimistic: {
        zavod:       { count: 190 },
        spluti_vik:  { count: 55 },
        spluti_so:   { count: 95 },
        permice_vik: { count: 80 },
        permice_so:  { count: 175 },
        dotace:      { price: 55000 },
    },
    base: {
        zavod:       { count: 215 },
        spluti_vik:  { count: 70 },
        spluti_so:   { count: 120 },
        permice_vik: { count: 100 },
        permice_so:  { count: 210 },
        dotace:      { price: 62000 },
    },
    optimistic: {
        zavod:       { count: 255 },
        spluti_vik:  { count: 95 },
        spluti_so:   { count: 150 },
        permice_vik: { count: 135 },
        permice_so:  { count: 265 },
        dotace:      { price: 68000 },
    },
};

// Náklady 2025: +7–10 % inflace vs. plán 2024
const DEFAULT_COSTS: CostRow[] = [
    { id: "bus",          label: "Bus Jan Kukla",              amount: 132000 },
    { id: "chatky",       label: "Ubytování chatky",           amount: 62700 },
    { id: "vodohospo",    label: "Vodohospodářství (rybáři)",  amount: 19000 },
    { id: "hrnky",        label: "Hrnky potisk",               amount: 7700 },
    { id: "permice_tisk", label: "Permice tisk",               amount: 6600 },
    { id: "pivo",         label: "Pivo Kamenice",              amount: 5000 },
    { id: "benzin",       label: "Benzín / obslužná vozidla",  amount: 6300 },
    { id: "priprava",     label: "Přípravné práce",            amount: 8000 },
    { id: "mistni",       label: "Místní poplatky",            amount: 5000 },
    { id: "material",     label: "Materiál (pytle, folie…)",   amount: 4700 },
    { id: "postovne",     label: "Poštovné",                   amount: 1100 },
    { id: "ostatni",      label: "Ostatní",                    amount: 5000 },
];

const HISTORY = [
    { rok: 2021, prijmy: 211180, naklady: 198600, zavornici: 256 },
    { rok: 2022, prijmy: 243860, naklady: 205500, zavornici: 274 },
    { rok: 2023, prijmy: 94075,  naklady: 169519, zavornici: null },
    { rok: 2024, prijmy: 218250, naklady: 237500, zavornici: 253 },
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
                if (!o) return r;
                return {
                    ...r,
                    ...(o.count !== undefined && r.count !== null ? { count: o.count } : {}),
                    ...(o.price !== undefined ? { price: o.price } : {}),
                };
            })
        );
    }

    function updateRevCount(id: string, val: number) {
        setScenario("custom");
        setRevenue(prev => prev.map(r => r.id === id ? { ...r, count: val } : r));
    }

    function updateRevPrice(id: string, val: number) {
        setScenario("custom");
        setRevenue(prev => prev.map(r => r.id === id ? { ...r, price: val } : r));
    }

    function updateCost(id: string, val: number) {
        setCosts(prev => prev.map(c => c.id === id ? { ...c, amount: val } : c));
    }

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
            {/* Hlavička */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Hamerák 2025 — Kalkulace plánu</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Interaktivní kalkulačka příjmů a nákladů · ceny +10 % vs. 2024
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Scénář:</span>
                    {(["pessimistic", "base", "optimistic"] as const).map(s => (
                        <Button
                            key={s}
                            size="sm"
                            variant={scenario === s ? "default" : "outline"}
                            onClick={() => applyScenario(s)}
                        >
                            {SCENARIO_LABELS[s]}
                        </Button>
                    ))}
                    {scenario === "custom" && (
                        <Badge variant="secondary">Vlastní</Badge>
                    )}
                </div>
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

            {/* Příjmy a náklady */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Příjmy */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Příjmy</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                                    <th className="text-left px-4 py-2 font-medium">Kategorie</th>
                                    <th className="text-center px-2 py-2 font-medium w-20">Počet</th>
                                    <th className="text-center px-2 py-2 font-medium w-24">Cena</th>
                                    <th className="text-right px-4 py-2 font-medium w-28">Příjem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {revenue.map(r => (
                                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-2">
                                            <div className="font-medium">{r.label}</div>
                                            {r.sublabel && (
                                                <div className="text-xs text-muted-foreground">{r.sublabel}</div>
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
                                        <td className="px-4 py-2 text-right font-semibold tabular-nums">
                                            {fmt(rowTotal(r))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 bg-muted/40">
                                    <td colSpan={3} className="px-4 py-3 font-semibold text-sm">Celkem příjmy</td>
                                    <td className="px-4 py-3 text-right font-bold text-green-700 tabular-nums">
                                        {fmt(totalRevenue)}
                                    </td>
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
                                    <th className="text-right px-2 py-2 font-medium w-36">Částka (Kč)</th>
                                    <th className="text-right px-4 py-2 font-medium w-12">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {costs.map(c => (
                                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-2">{c.label}</td>
                                        <td className="px-2 py-1.5">
                                            <Input
                                                type="number"
                                                value={c.amount}
                                                onChange={e => updateCost(c.id, parseNum(e.target.value))}
                                                className="h-7 w-28 text-right text-sm ml-auto"
                                                min={0}
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-right text-muted-foreground text-xs tabular-nums">
                                            {totalCosts > 0 ? Math.round((c.amount / totalCosts) * 100) : 0} %
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 bg-muted/40">
                                    <td colSpan={2} className="px-4 py-3 font-semibold text-sm">Celkem náklady</td>
                                    <td className="px-4 py-3 text-right font-bold text-red-600 tabular-nums text-sm">
                                        {fmt(totalCosts)}
                                    </td>
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
                                <td className="px-4 py-2 font-bold text-primary">2025 (plán)</td>
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
