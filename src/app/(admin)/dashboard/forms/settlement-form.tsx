"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CircleDollarSign, Download, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import {
  type VyuctovaniData,
  type VyuctovaniNaklady,
  type VyuctovaniPrijmy,
} from "@/lib/pdf/vyuctovani-template";
import {
  downloadBlob,
  formatCzk,
  normalizeText,
  parseNumberInput,
  sumNumericValues,
} from "./form-helpers";

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

type TextField = "oddi" | "cisloZalohy" | "zaMesic" | "vyuctoval" | "schvalil" | "datum";

export function SettlementForm() {
  const [form, setForm] = useState<Partial<VyuctovaniData>>({
    naklady: {},
    prijmy: {},
  });
  const [downloading, setDownloading] = useState(false);

  const nakladyCelkem = sumNumericValues(form.naklady ?? {});
  const prijmyCelkem = sumNumericValues(form.prijmy ?? {});
  const vysledek = prijmyCelkem - nakladyCelkem;
  const vracenyPrebytek = vysledek > 0 ? vysledek : 0;
  const pozadovanyNedoplatek = vysledek < 0 ? Math.abs(vysledek) : 0;
  const canSubmit = Boolean(normalizeText(form.oddi));

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
          oddi: normalizeText(form.oddi),
          cisloZalohy: normalizeText(form.cisloZalohy),
          zaMesic: normalizeText(form.zaMesic),
          vyuctoval: normalizeText(form.vyuctoval),
          schvalil: normalizeText(form.schvalil),
          datum: normalizeText(form.datum),
          naklady: form.naklady ?? {},
          prijmy: form.prijmy ?? {},
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Chyba při generování PDF");
      }

      const blob = await response.blob();
      downloadBlob(blob, "vyuctovani.pdf");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Chyba při generování PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="overflow-hidden border-none py-0 ring-1 ring-emerald-100">
      <CardHeader className="border-b bg-gradient-to-r from-emerald-50 via-white to-emerald-50 py-5">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CircleDollarSign className="size-5 text-emerald-700" />
          Vyúčtování oddílu
        </CardTitle>
      </CardHeader>

      <form onSubmit={submit}>
        <CardContent className="space-y-6 py-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-xs text-muted-foreground">Náklady celkem</div>
              <div className="mt-1 text-lg font-semibold">{formatCzk(nakladyCelkem)}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-xs text-muted-foreground">Příjmy celkem</div>
              <div className="mt-1 text-lg font-semibold">{formatCzk(prijmyCelkem)}</div>
            </div>
            <div className="rounded-xl border bg-emerald-50 p-3">
              <div className="text-xs text-muted-foreground">Vrácený přebytek</div>
              <div className="mt-1 text-lg font-semibold text-emerald-700">
                {formatCzk(vracenyPrebytek)}
              </div>
            </div>
            <div className="rounded-xl border bg-amber-50 p-3">
              <div className="text-xs text-muted-foreground">Požadovaný nedoplatek</div>
              <div className="mt-1 text-lg font-semibold text-amber-700">
                {formatCzk(pozadovanyNedoplatek)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Hlavička dokumentu</h3>
              <Badge variant="outline">Povinné pole: Oddíl</Badge>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Oddíl *</Label>
                <Input
                  required
                  placeholder="Např. OVT Bohemians"
                  value={form.oddi ?? ""}
                  onChange={(event) => setTextField("oddi", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Číslo zálohy</Label>
                <Input
                  placeholder="Např. 2026-004"
                  value={form.cisloZalohy ?? ""}
                  onChange={(event) => setTextField("cisloZalohy", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Za měsíc</Label>
                <Input
                  placeholder="Např. 4/2026"
                  value={form.zaMesic ?? ""}
                  onChange={(event) => setTextField("zaMesic", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Záloha ve výši</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={form.veVysi ?? ""}
                  onChange={(event) => {
                    const parsed = parseNumberInput(event.target.value);
                    setForm((prev) => ({ ...prev, veVysi: parsed }));
                  }}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <TrendingDown className="size-4 text-rose-600" />
                Náklady
              </div>
              <div className="space-y-2">
                {NAKLADY_ROWS.map(([field, label]) => (
                  <div key={field} className="grid grid-cols-[1fr_9rem] items-center gap-2">
                    <Label className="text-xs leading-tight">{label}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={form.naklady?.[field] ?? ""}
                      onChange={(event) => setNakladyField(field, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="size-4 text-emerald-600" />
                Příjmy
              </div>
              <div className="space-y-2">
                {PRIJMY_ROWS.map(([field, label]) => (
                  <div key={field} className="grid grid-cols-[1fr_9rem] items-center gap-2">
                    <Label className="text-xs leading-tight">{label}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={form.prijmy?.[field] ?? ""}
                      onChange={(event) => setPrijmyField(field, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <h3 className="mb-3 text-sm font-semibold">Podpisy</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Vyúčtoval</Label>
                <Input
                  value={form.vyuctoval ?? ""}
                  onChange={(event) => setTextField("vyuctoval", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Schválil</Label>
                <Input
                  value={form.schvalil ?? ""}
                  onChange={(event) => setTextField("schvalil", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Datum</Label>
                <Input
                  placeholder="Např. 28. 4. 2026"
                  value={form.datum ?? ""}
                  onChange={(event) => setTextField("datum", event.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Výsledek: <strong>{formatCzk(vysledek)}</strong>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setForm({
                  naklady: {},
                  prijmy: {},
                })
              }
            >
              <RotateCcw className="size-4" />
              Vyčistit
            </Button>
            <Button type="submit" disabled={downloading || !canSubmit}>
              <Download className="size-4" />
              {downloading ? "Generuji PDF..." : "Stáhnout vyúčtování"}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
