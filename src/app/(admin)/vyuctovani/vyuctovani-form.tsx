"use client";
import { useState } from "react";
import { VyuctovaniData, VyuctovaniNaklady, VyuctovaniPrijmy } from "@/lib/pdf/vyuctovani-template";
import { Button } from "@/components/ui/button";

const NAKLADY_ROWS: [keyof VyuctovaniNaklady, string][] = [
    ["501/004", "Kanc. potřeby, ostatní materiál"],
    ["501/006", "Spotřeba sportovního materiálu"],
    ["511/002", "Oprava sportovních potřeb"],
    ["518/001", "Nájem tělocvičen, bazénů"],
    ["518/003", "Spoje"],
    ["518/004", "Poštovné"],
    ["518/008", "Startovné, registrace"],
    ["518/009", "Soutěže, ubytování, doprava"],
    ["518/010", "Služby - náklady na přípravu"],
    ["518/011", "Služby - náklady na soustředění"],
    ["518/012", "Služby - mezinárodní činnost"],
    ["518/014", "Přestupy, hostování"],
    ["549/004", "Odměny rozhodčím"],
];

const PRIJMY_ROWS: [keyof VyuctovaniPrijmy, string][] = [
    ["602/61", "Příjmy - příprava"],
    ["602/62", "Příjmy - soutěže"],
    ["602/63", "Příjmy - mezinárodní činnost"],
    ["602/64", "Příjmy - soustředění, platby účastníků"],
    ["602/65", "Příjmy - ostatní tělových. činnost"],
    ["602/66", "Ostatní příjmy"],
    ["602/67", "Přestupy, hostování"],
    ["602/23", "Reklamy - plochy"],
    ["602/24", "Reklamy - zajištění"],
    ["682/63", "Dary, sponzoři"],
];

export function VyuctovaniForm() {
    const [form, setForm] = useState<Partial<VyuctovaniData>>({
        naklady: {},
        prijmy: {},
    });
    const [downloading, setDownloading] = useState(false);

    function handleChange(field: string, value: string) {
        setForm(f => ({ ...f, [field]: value }));
    }
    function handleNakladyChange(key: keyof VyuctovaniNaklady, value: string) {
        setForm(f => ({ ...f, naklady: { ...f.naklady, [key]: value ? Number(value) : undefined } }));
    }
    function handlePrijmyChange(key: keyof VyuctovaniPrijmy, value: string) {
        setForm(f => ({ ...f, prijmy: { ...f.prijmy, [key]: value ? Number(value) : undefined } }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setDownloading(true);
        const res = await fetch("/api/pdf/vyuctovani", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
        });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "vyuctovani.pdf";
            a.click();
            window.URL.revokeObjectURL(url);
        } else {
            alert("Chyba při generování PDF");
        }
        setDownloading(false);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block font-semibold mb-1">Oddíl *</label>
                    <input type="text" required className="input" value={form.oddi ?? ""} onChange={e => handleChange("oddi", e.target.value)} />
                </div>
                <div>
                    <label className="block font-semibold mb-1">Číslo zálohy</label>
                    <input type="text" className="input" value={form.cisloZalohy ?? ""} onChange={e => handleChange("cisloZalohy", e.target.value)} />
                </div>
                <div>
                    <label className="block font-semibold mb-1">Za měsíc</label>
                    <input type="text" className="input" value={form.zaMesic ?? ""} onChange={e => handleChange("zaMesic", e.target.value)} />
                </div>
                <div>
                    <label className="block font-semibold mb-1">Záloha ve výši</label>
                    <input type="number" step="0.01" className="input" value={form.veVysi ?? ""} onChange={e => handleChange("veVysi", e.target.value)} />
                </div>
            </div>

            <div>
                <h2 className="font-bold mb-2 mt-4">Náklady</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {NAKLADY_ROWS.map(([key, label]) => (
                        <div key={key} className="flex items-center gap-2">
                            <label className="w-48">{label}</label>
                            <input type="number" step="0.01" className="input flex-1" value={form.naklady?.[key] ?? ""} onChange={e => handleNakladyChange(key, e.target.value)} />
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h2 className="font-bold mb-2 mt-4">Příjmy</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {PRIJMY_ROWS.map(([key, label]) => (
                        <div key={key} className="flex items-center gap-2">
                            <label className="w-48">{label}</label>
                            <input type="number" step="0.01" className="input flex-1" value={form.prijmy?.[key] ?? ""} onChange={e => handlePrijmyChange(key, e.target.value)} />
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block font-semibold mb-1">Vyúčtoval</label>
                    <input type="text" className="input" value={form.vyuctoval ?? ""} onChange={e => handleChange("vyuctoval", e.target.value)} />
                </div>
                <div>
                    <label className="block font-semibold mb-1">Schválil</label>
                    <input type="text" className="input" value={form.schvalil ?? ""} onChange={e => handleChange("schvalil", e.target.value)} />
                </div>
                <div>
                    <label className="block font-semibold mb-1">Datum</label>
                    <input type="text" className="input" value={form.datum ?? ""} onChange={e => handleChange("datum", e.target.value)} />
                </div>
            </div>

            <Button type="submit" disabled={downloading} className="mt-4">
                {downloading ? "Generuji PDF..." : "Stáhnout vyúčtování jako PDF"}
            </Button>
        </form>
    );
}
