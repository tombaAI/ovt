"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type VyuctovaniData,
  type VyuctovaniNaklady,
  type VyuctovaniPrijmy,
} from "@/lib/pdf/vyuctovani-template";

const NAKLADY_ROWS: Array<[keyof VyuctovaniNaklady, string]> = [
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

const PRIJMY_ROWS: Array<[keyof VyuctovaniPrijmy, string]> = [
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

const parseNumberInput = (value: string): number | undefined => {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

type TextField = "oddi" | "cisloZalohy" | "zaMesic" | "vyuctoval" | "schvalil" | "datum";

export function SettlementForm() {
  const [form, setForm] = useState<Partial<VyuctovaniData>>({
    naklady: {},
    prijmy: {},
  });
  const [downloading, setDownloading] = useState(false);

  const setTextField = (field: TextField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const setNakladyField = (field: keyof VyuctovaniNaklady, value: string) => {
    setForm((prev) => ({
      ...prev,
      naklady: {
        ...(prev.naklady ?? {}),
        [field]: parseNumberInput(value),
      },
    }));
  };

  const setPrijmyField = (field: keyof VyuctovaniPrijmy, value: string) => {
    setForm((prev) => ({
      ...prev,
      prijmy: {
        ...(prev.prijmy ?? {}),
        [field]: parseNumberInput(value),
      },
    }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDownloading(true);

    try {
      const response = await fetch("/api/pdf/vyuctovani", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          oddi: form.oddi?.trim(),
          naklady: form.naklady ?? {},
          prijmy: form.prijmy ?? {},
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Chyba při generování PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "vyuctovani.pdf";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Chyba při generování PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-semibold">Oddíl *</label>
          <Input
            required
            value={form.oddi ?? ""}
            onChange={(event) => setTextField("oddi", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Číslo zálohy</label>
          <Input
            value={form.cisloZalohy ?? ""}
            onChange={(event) => setTextField("cisloZalohy", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Za měsíc</label>
          <Input
            value={form.zaMesic ?? ""}
            onChange={(event) => setTextField("zaMesic", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Záloha ve výši</label>
          <Input
            type="number"
            step="0.01"
            value={form.veVysi ?? ""}
            onChange={(event) => {
              const parsed = parseNumberInput(event.target.value);
              setForm((prev) => ({ ...prev, veVysi: parsed }));
            }}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-base font-bold">Náklady</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {NAKLADY_ROWS.map(([field, label]) => (
            <div key={field} className="grid grid-cols-[1fr_10rem] items-center gap-2">
              <label className="text-sm">{label}</label>
              <Input
                type="number"
                step="0.01"
                value={form.naklady?.[field] ?? ""}
                onChange={(event) => setNakladyField(field, event.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-base font-bold">Příjmy</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {PRIJMY_ROWS.map(([field, label]) => (
            <div key={field} className="grid grid-cols-[1fr_10rem] items-center gap-2">
              <label className="text-sm">{label}</label>
              <Input
                type="number"
                step="0.01"
                value={form.prijmy?.[field] ?? ""}
                onChange={(event) => setPrijmyField(field, event.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-semibold">Vyúčtoval</label>
          <Input
            value={form.vyuctoval ?? ""}
            onChange={(event) => setTextField("vyuctoval", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Schválil</label>
          <Input
            value={form.schvalil ?? ""}
            onChange={(event) => setTextField("schvalil", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Datum</label>
          <Input
            value={form.datum ?? ""}
            onChange={(event) => setTextField("datum", event.target.value)}
          />
        </div>
      </div>

      <Button type="submit" disabled={downloading}>
        {downloading ? "Generuji PDF..." : "Stáhnout vyúčtování jako PDF"}
      </Button>
    </form>
  );
}
