"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileCheck2, RotateCcw, WandSparkles } from "lucide-react";
import { type CestneProhlaseniData } from "@/lib/pdf/cestne-prohlaseni-template";
import { downloadBlob, formatCzk, normalizeText, parseNumberInput } from "./form-helpers";

type TextField = Exclude<keyof CestneProhlaseniData, "castka">;

export function HonorDeclarationForm() {
  const [form, setForm] = useState<Partial<CestneProhlaseniData>>({});
  const [downloading, setDownloading] = useState(false);

  const suggestedVs = `${normalizeText(form.id) ?? ""} ${(form.cisloCskPrijemce ?? "")
    .replace(/\s+/g, "")
    .trim()}`.trim();
  const canSubmit = Boolean(normalizeText(form.nazevAkce) && normalizeText(form.id));

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
          nazevAkce: normalizeText(form.nazevAkce),
          id: normalizeText(form.id),
          ucel: normalizeText(form.ucel),
          castka: form.castka,
          jmenoPrijemce: normalizeText(form.jmenoPrijemce),
          cisloCskPrijemce: normalizeText(form.cisloCskPrijemce),
          cisloUctuPrijemce: normalizeText(form.cisloUctuPrijemce),
          kodBanky: normalizeText(form.kodBanky),
          variabilniSymbol: normalizeText(form.variabilniSymbol) ?? suggestedVs,
          poradatelAkce: normalizeText(form.poradatelAkce),
          cisloCskPoradatele: normalizeText(form.cisloCskPoradatele),
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Chyba při generování PDF");
      }

      const blob = await response.blob();
      downloadBlob(blob, "cestne-prohlaseni.pdf");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Chyba při generování PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="overflow-hidden border-none py-0 ring-1 ring-amber-100">
      <CardHeader className="border-b bg-gradient-to-r from-amber-50 via-white to-amber-50 py-5">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileCheck2 className="size-5 text-amber-700" />
          Čestné prohlášení
        </CardTitle>
      </CardHeader>

      <form onSubmit={submit}>
        <CardContent className="space-y-6 py-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-xs text-muted-foreground">Účel</div>
              <div className="mt-1 text-lg font-semibold">{form.ucel || "-"}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-xs text-muted-foreground">Částka</div>
              <div className="mt-1 text-lg font-semibold">{formatCzk(form.castka ?? 0)}</div>
            </div>
            <div className="rounded-xl border bg-amber-50 p-3">
              <div className="text-xs text-muted-foreground">Doporučený VS</div>
              <div className="mt-1 text-lg font-semibold text-amber-700">{suggestedVs || "-"}</div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Akce a deklarovaný náklad</h3>
              <Badge variant="outline">Povinné: Název akce, ID</Badge>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Název akce *</Label>
                <Input
                  required
                  placeholder="Např. Kamenice 2026"
                  value={form.nazevAkce ?? ""}
                  onChange={(event) => setTextField("nazevAkce", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ID akce *</Label>
                <Input
                  required
                  placeholder="Např. 001"
                  value={form.id ?? ""}
                  onChange={(event) => setTextField("id", event.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Účel *</Label>
                <Input
                  required
                  placeholder="Např. vlak na místě"
                  value={form.ucel ?? ""}
                  onChange={(event) => setTextField("ucel", event.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-1">
                <Label>Částka *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0"
                  value={form.castka ?? ""}
                  onChange={(event) => {
                    const parsed = parseNumberInput(event.target.value);
                    setForm((prev) => ({ ...prev, castka: parsed }));
                  }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <h3 className="mb-3 text-sm font-semibold">Příjemce a bankovní údaje</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Jméno příjemce *</Label>
                <Input
                  required
                  value={form.jmenoPrijemce ?? ""}
                  onChange={(event) => setTextField("jmenoPrijemce", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Číslo ČSK příjemce *</Label>
                <Input
                  required
                  value={form.cisloCskPrijemce ?? ""}
                  onChange={(event) => setTextField("cisloCskPrijemce", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Číslo účtu příjemce *</Label>
                <Input
                  required
                  placeholder="Např. 123456789"
                  value={form.cisloUctuPrijemce ?? ""}
                  onChange={(event) => setTextField("cisloUctuPrijemce", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kód banky *</Label>
                <Input
                  required
                  placeholder="Např. 3030"
                  value={form.kodBanky ?? ""}
                  onChange={(event) => setTextField("kodBanky", event.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Variabilní symbol *</Label>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={!suggestedVs}
                    onClick={() => setTextField("variabilniSymbol", suggestedVs)}
                  >
                    <WandSparkles className="size-3" />
                    Doplnit dle ID + ČSK
                  </Button>
                </div>
                <Input
                  required
                  placeholder="Např. 001 556072"
                  value={form.variabilniSymbol ?? ""}
                  onChange={(event) => setTextField("variabilniSymbol", event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <h3 className="mb-3 text-sm font-semibold">Pořadatel</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pořadatel akce *</Label>
                <Input
                  required
                  value={form.poradatelAkce ?? ""}
                  onChange={(event) => setTextField("poradatelAkce", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Číslo ČSK pořadatele *</Label>
                <Input
                  required
                  value={form.cisloCskPoradatele ?? ""}
                  onChange={(event) => setTextField("cisloCskPoradatele", event.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Dokument je připraven pro ruční podpisy příjemce i pořadatele.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setForm({})}>
              <RotateCcw className="size-4" />
              Vyčistit
            </Button>
            <Button type="submit" disabled={downloading || !canSubmit}>
              <Download className="size-4" />
              {downloading ? "Generuji PDF..." : "Stáhnout čestné prohlášení"}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
