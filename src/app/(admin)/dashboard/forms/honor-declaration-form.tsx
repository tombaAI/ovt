"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CestneProhlaseniData } from "@/lib/pdf/cestne-prohlaseni-template";

type TextField = Exclude<keyof CestneProhlaseniData, "castka">;

const parseNumberInput = (value: string): number | undefined => {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function HonorDeclarationForm() {
  const [form, setForm] = useState<Partial<CestneProhlaseniData>>({});
  const [downloading, setDownloading] = useState(false);

  const setTextField = (field: TextField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDownloading(true);

    try {
      const response = await fetch("/api/pdf/cestne-prohlaseni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          castka: form.castka,
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
      link.download = "cestne-prohlaseni.pdf";
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
          <label className="mb-1 block text-sm font-semibold">Název akce *</label>
          <Input
            required
            value={form.nazevAkce ?? ""}
            onChange={(event) => setTextField("nazevAkce", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">ID akce *</label>
          <Input
            required
            value={form.id ?? ""}
            onChange={(event) => setTextField("id", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Účel *</label>
          <Input
            required
            value={form.ucel ?? ""}
            onChange={(event) => setTextField("ucel", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Částka *</label>
          <Input
            type="number"
            step="0.01"
            required
            value={form.castka ?? ""}
            onChange={(event) => {
              const parsed = parseNumberInput(event.target.value);
              setForm((prev) => ({ ...prev, castka: parsed }));
            }}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Jméno příjemce *</label>
          <Input
            required
            value={form.jmenoPrijemce ?? ""}
            onChange={(event) => setTextField("jmenoPrijemce", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Číslo ČSK příjemce *</label>
          <Input
            required
            value={form.cisloCskPrijemce ?? ""}
            onChange={(event) => setTextField("cisloCskPrijemce", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Číslo účtu příjemce *</label>
          <Input
            required
            value={form.cisloUctuPrijemce ?? ""}
            onChange={(event) => setTextField("cisloUctuPrijemce", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Kód banky *</label>
          <Input
            required
            value={form.kodBanky ?? ""}
            onChange={(event) => setTextField("kodBanky", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Variabilní symbol *</label>
          <Input
            required
            value={form.variabilniSymbol ?? ""}
            onChange={(event) => setTextField("variabilniSymbol", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Pořadatel akce *</label>
          <Input
            required
            value={form.poradatelAkce ?? ""}
            onChange={(event) => setTextField("poradatelAkce", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Číslo ČSK pořadatele *</label>
          <Input
            required
            value={form.cisloCskPoradatele ?? ""}
            onChange={(event) => setTextField("cisloCskPoradatele", event.target.value)}
          />
        </div>
      </div>

      <Button type="submit" disabled={downloading}>
        {downloading ? "Generuji PDF..." : "Stáhnout čestné prohlášení jako PDF"}
      </Button>
    </form>
  );
}
