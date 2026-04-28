"use client";
import { useState } from "react";
import { CestovniPrikazData } from "@/lib/pdf/cestovni-prikaz-template";
import { Button } from "@/components/ui/button";

export function CestovniPrikazForm() {
  const [form, setForm] = useState<Partial<CestovniPrikazData>>({});
  const [downloading, setDownloading] = useState(false);

  function handleChange(field: keyof CestovniPrikazData, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDownloading(true);
    const res = await fetch("/api/pdf/cestovni-prikaz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cestovni-prikaz.pdf";
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
          <label className="block font-semibold mb-1">Název akce *</label>
          <input type="text" required className="input" value={form.nazevAkce ?? ""} onChange={e => handleChange("nazevAkce", e.target.value)} />
        </div>
        <div>
          <label className="block font-semibold mb-1">ID akce *</label>
          <input type="text" required className="input" value={form.id ?? ""} onChange={e => handleChange("id", e.target.value)} />
        </div>
        <div>
          <label className="block font-semibold mb-1">Náklady na dopravu *</label>
          <input type="number" required step="1" className="input" value={form.nakladyNaDopravu ?? ""} onChange={e => handleChange("nakladyNaDopravu", e.target.value)} />
        </div>
        <div>
          <label className="block font-semibold mb-1">Jméno příjemce *</label>
          <input type="text" required className="input" value={form.jmenoPrijemce ?? ""} onChange={e => handleChange("jmenoPrijemce", e.target.value)} />
        </div>
        <div>
          <label className="block font-semibold mb-1">Číslo ČSK příjemce *</label>
          <input type="text" required className="input" value={form.cisloCskPrijemce ?? ""} onChange={e => handleChange("cisloCskPrijemce", e.target.value)} />
        </div>
        <div>
          <label className="block font-semibold mb-1">Číslo účtu příjemce *</label>
          <input type="text" required className="input" value={form.cisloUctuPrijemce ?? ""} onChange={e => handleChange("cisloUctuPrijemce", e.target.value)} />
        </div>
        <div>
          <label className="block font-semibold mb-1">Kód banky *</label>
          <input type="text" required className="input" value={form.kodBanky ?? ""} onChange={e => handleChange("kodBanky", e.target.value)} />
        </div>
        <div>
          <label className="block font-semibold mb-1">Variabilní symbol *</label>
          <input type="text" required className="input" value={form.variabilniSymbol ?? ""} onChange={e => handleChange("variabilniSymbol", e.target.value)} />
        </div>
        <div>
          <label className="block font-semibold mb-1">Pořadatel akce *</label>
          <input type="text" required className="input" value={form.poradatelAkce ?? ""} onChange={e => handleChange("poradatelAkce", e.target.value)} />
        </div>
        <div>
          <label className="block font-semibold mb-1">Číslo ČSK pořadatele *</label>
          <input type="text" required className="input" value={form.cisloCskPoradatele ?? ""} onChange={e => handleChange("cisloCskPoradatele", e.target.value)} />
        </div>
      </div>
      <Button type="submit" disabled={downloading} className="mt-4">
        {downloading ? "Generuji PDF..." : "Stáhnout cestovní příkaz jako PDF"}
      </Button>
    </form>
  );
}
