"use client";

import { useEffect, useState } from "react";
import { BusFront, CircleDollarSign, FileCheck2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  normalizeText,
  parseNumberInput,
} from "@/app/(admin)/dashboard/forms/form-helpers";
import {
  EXPENSE_CATEGORY_LABELS,
  expenseCategoryEnum,
  type ExpenseCategory,
} from "@/lib/expense-categories";
import { createExternalPerson, type PersonOption } from "@/lib/actions/people";
import type { CestneProhlaseniData } from "@/lib/pdf/cestne-prohlaseni-template";
import type { CestovniPrikazData } from "@/lib/pdf/cestovni-prikaz-template";

const EXPENSE_CATEGORIES = expenseCategoryEnum as readonly ExpenseCategory[];
const DEFAULT_EXPENSE_CATEGORY: ExpenseCategory = "518/009";

type ExpenseActionPanelProps = {
  eventId: number;
  eventName: string;
  leaderName: string | null;
  personOptions: PersonOption[];
  peopleLoaded: boolean;
  onPersonCreated: (person: PersonOption) => void;
  onExpenseCreated: () => void | Promise<void>;
};

type TravelFormState = {
  nazevAkce: string;
  id: string;
  nakladyNaDopravu: string;
  purposeText: string;
  purposeCategory: ExpenseCategory;
  reimbursementPersonId: string;
  jmenoPrijemce: string;
  cisloCskPrijemce: string;
  cisloUctuPrijemce: string;
  kodBanky: string;
  variabilniSymbol: string;
  poradatelAkce: string;
  cisloCskPoradatele: string;
};

type HonorFormState = {
  nazevAkce: string;
  id: string;
  ucel: string;
  castka: string;
  purposeText: string;
  purposeCategory: ExpenseCategory;
  reimbursementPersonId: string;
  jmenoPrijemce: string;
  cisloCskPrijemce: string;
  cisloUctuPrijemce: string;
  kodBanky: string;
  variabilniSymbol: string;
  poradatelAkce: string;
  cisloCskPoradatele: string;
};

function buildSuggestedVs(actionId: string, cskNumber: string): string {
  return `${normalizeText(actionId) ?? ""} ${cskNumber.replace(/\s+/g, " ").trim()}`.trim();
}

function personLabel(person: PersonOption): string {
  const name = person.nickname ? `${person.fullName} (${person.nickname})` : person.fullName;
  return person.kind === "external" ? `${name} · nečlen` : name;
}

function makePdfFileName(prefix: string, eventId: number, eventName: string): string {
  const slug = eventName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `akce-${eventId}`;

  return `${prefix}-${eventId}-${slug}.pdf`;
}

async function requestPdf(endpoint: string, payload: unknown): Promise<Blob> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Chyba při generování PDF");
  }

  return response.blob();
}

async function createManualExpense(input: {
  eventId: number;
  amount: number;
  purposeText: string;
  purposeCategory: ExpenseCategory;
  reimbursementPersonId: string;
  file: Blob;
  fileName: string;
}) {
  const formData = new FormData();
  formData.append("amount", String(input.amount));
  formData.append("purposeText", input.purposeText);
  formData.append("purposeCategory", input.purposeCategory);
  if (input.reimbursementPersonId) formData.append("reimbursementPersonId", input.reimbursementPersonId);
  formData.append("file", input.file, input.fileName);

  const response = await fetch(`/api/events/${input.eventId}/expenses`, {
    method: "POST",
    body: formData,
  });

  let payload: { error?: string } | null = null;
  try {
    payload = (await response.json()) as { error?: string };
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? "Chyba při ukládání nákladu");
  }
}

function createInitialTravelForm(eventId: number, eventName: string, leaderName: string | null): TravelFormState {
  return {
    nazevAkce: eventName,
    id: String(eventId),
    nakladyNaDopravu: "",
    purposeText: `Náklady na dopravu - ${eventName}`,
    purposeCategory: DEFAULT_EXPENSE_CATEGORY,
    reimbursementPersonId: "",
    jmenoPrijemce: "",
    cisloCskPrijemce: "",
    cisloUctuPrijemce: "",
    kodBanky: "",
    variabilniSymbol: "",
    poradatelAkce: leaderName ?? "",
    cisloCskPoradatele: "",
  };
}

function createInitialHonorForm(eventId: number, eventName: string, leaderName: string | null): HonorFormState {
  return {
    nazevAkce: eventName,
    id: String(eventId),
    ucel: "",
    castka: "",
    purposeText: `Čestné prohlášení - ${eventName}`,
    purposeCategory: DEFAULT_EXPENSE_CATEGORY,
    reimbursementPersonId: "",
    jmenoPrijemce: "",
    cisloCskPrijemce: "",
    cisloUctuPrijemce: "",
    kodBanky: "",
    variabilniSymbol: "",
    poradatelAkce: leaderName ?? "",
    cisloCskPoradatele: "",
  };
}

function ExpenseCategoryField({
  value,
  onChange,
}: {
  value: ExpenseCategory;
  onChange: (value: ExpenseCategory) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Účetní kód nákladu *</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ExpenseCategory)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {EXPENSE_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {category} · {EXPENSE_CATEGORY_LABELS[category]}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReimbursementPersonField({
  people,
  peopleLoaded,
  value,
  onChange,
  onPersonCreated,
}: {
  people: PersonOption[];
  peopleLoaded: boolean;
  value: string;
  onChange: (person: PersonOption | null) => void;
  onPersonCreated: (person: PersonOption) => void;
}) {
  const [addingExternal, setAddingExternal] = useState(false);
  const [externalName, setExternalName] = useState("");
  const [externalAccount, setExternalAccount] = useState("");
  const [externalBankCode, setExternalBankCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const selected = people.find((person) => String(person.id) === value) ?? null;
  const account = selected?.bankAccountNumber && selected?.bankCode
    ? `${selected.bankAccountNumber}/${selected.bankCode}`
    : null;

  async function handleCreateExternal() {
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createExternalPerson({
        fullName: externalName,
        bankAccountNumber: externalAccount,
        bankCode: externalBankCode,
      });
      if ("error" in result) {
        setCreateError(result.error);
        return;
      }
      onPersonCreated(result.person);
      onChange(result.person);
      setExternalName("");
      setExternalAccount("");
      setExternalBankCode("");
      setAddingExternal(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-1.5 md:col-span-2">
      <Label>Komu proplatit</Label>
      <select
        value={value}
        disabled={!peopleLoaded}
        onChange={(event) => {
          const person = people.find((item) => String(item.id) === event.target.value) ?? null;
          onChange(person);
        }}
        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      >
        <option value="">{peopleLoaded ? "Zatím neurčeno" : "Načítám osoby..."}</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>{personLabel(person)}</option>
        ))}
      </select>
      {selected && (
        <p className={`text-[11px] ${account ? "text-gray-400" : "text-amber-600"}`}>
          {account ? `Účet: ${account}` : "Účet zatím není vyplněný. Formulář lze vytvořit i bez něj."}
        </p>
      )}
      <button
        type="button"
        onClick={() => { setAddingExternal(v => !v); setCreateError(null); }}
        className="text-xs text-blue-600 hover:underline"
      >
        {addingExternal ? "Zavřít přidání nečlena" : "Přidat příjemce mimo členy"}
      </button>
      {addingExternal && (
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <Input value={externalName} onChange={(event) => setExternalName(event.target.value)} placeholder="Jméno a příjmení" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={externalAccount} onChange={(event) => setExternalAccount(event.target.value)} placeholder="Číslo účtu" />
            <Input value={externalBankCode} onChange={(event) => setExternalBankCode(event.target.value)} placeholder="Kód banky" />
          </div>
          {createError && <p className="text-xs text-red-500">{createError}</p>}
          <Button type="button" size="sm" variant="outline" onClick={handleCreateExternal} disabled={creating}>
            {creating ? "Ukládám…" : "Uložit nečlena"}
          </Button>
        </div>
      )}
    </div>
  );
}

function TravelExpenseDialog({
  open,
  onOpenChange,
  eventId,
  eventName,
  leaderName,
  personOptions,
  peopleLoaded,
  onPersonCreated,
  onExpenseCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: number;
  eventName: string;
  leaderName: string | null;
  personOptions: PersonOption[];
  peopleLoaded: boolean;
  onPersonCreated: (person: PersonOption) => void;
  onExpenseCreated: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<TravelFormState>(() =>
    createInitialTravelForm(eventId, eventName, leaderName),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(createInitialTravelForm(eventId, eventName, leaderName));
      setError(null);
    }
  }, [open, eventId, eventName, leaderName]);

  const suggestedVs = buildSuggestedVs(form.id, form.cisloCskPrijemce);

  const setField = <K extends keyof TravelFormState>(field: K, value: TravelFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  function setReimbursementPerson(person: PersonOption | null) {
    setForm((prev) => {
      if (!person) {
        return {
          ...prev,
          reimbursementPersonId: "",
          jmenoPrijemce: "",
          cisloCskPrijemce: "",
          cisloUctuPrijemce: "",
          kodBanky: "",
          variabilniSymbol: "",
        };
      }

      const cskNumber = person.cskNumber ?? "";
      return {
        ...prev,
        reimbursementPersonId: String(person.id),
        jmenoPrijemce: person.fullName,
        cisloCskPrijemce: cskNumber,
        cisloUctuPrijemce: person.bankAccountNumber ?? "",
        kodBanky: person.bankCode ?? "",
        variabilniSymbol: buildSuggestedVs(prev.id, cskNumber),
      };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const amount = parseNumberInput(form.nakladyNaDopravu);
      if (!amount || amount <= 0) throw new Error("Doplň platné náklady na dopravu");

      const purposeText = normalizeText(form.purposeText);
      if (!purposeText) throw new Error("Doplň popis pro náklady");

      const payload: CestovniPrikazData = {
        nazevAkce: normalizeText(form.nazevAkce) ?? "",
        id: normalizeText(form.id) ?? "",
        nakladyNaDopravu: amount,
        jmenoPrijemce: normalizeText(form.jmenoPrijemce) ?? "",
        cisloCskPrijemce: normalizeText(form.cisloCskPrijemce) ?? "",
        cisloUctuPrijemce: normalizeText(form.cisloUctuPrijemce) ?? "",
        kodBanky: normalizeText(form.kodBanky) ?? "",
        variabilniSymbol: normalizeText(form.variabilniSymbol) ?? suggestedVs,
        poradatelAkce: normalizeText(form.poradatelAkce) ?? "",
        cisloCskPoradatele: normalizeText(form.cisloCskPoradatele) ?? "",
      };

      const pdfBlob = await requestPdf("/api/pdf/cestovni-prikaz", payload);
      await createManualExpense({
        eventId,
        amount,
        purposeText,
        purposeCategory: form.purposeCategory,
        reimbursementPersonId: form.reimbursementPersonId,
        file: pdfBlob,
        fileName: makePdfFileName("cestovni-prikaz", eventId, eventName),
      });

      await onExpenseCreated();
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Chyba při zpracování formuláře");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BusFront className="size-4 text-indigo-600" />
            Cestovní příkaz a náklad na dopravu
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border bg-slate-50 p-3 text-xs text-gray-600">
            Vygeneruje PDF cestovního příkazu a uloží ho jako přiložený doklad samostatného nákladu v této akci.
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Název akce *</Label>
              <Input required value={form.nazevAkce} onChange={(event) => setField("nazevAkce", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ID akce *</Label>
              <Input required value={form.id} onChange={(event) => setField("id", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Náklady na dopravu *</Label>
              <Input
                required
                type="number"
                step="0.01"
                value={form.nakladyNaDopravu}
                onChange={(event) => setField("nakladyNaDopravu", event.target.value)}
              />
            </div>
            <ExpenseCategoryField value={form.purposeCategory} onChange={(value) => setField("purposeCategory", value)} />
            <div className="space-y-1.5 md:col-span-2">
              <Label>Popis do nákladů *</Label>
              <Textarea
                required
                rows={3}
                value={form.purposeText}
                onChange={(event) => setField("purposeText", event.target.value)}
              />
            </div>
            <ReimbursementPersonField
              people={personOptions}
              peopleLoaded={peopleLoaded}
              value={form.reimbursementPersonId}
              onChange={setReimbursementPerson}
              onPersonCreated={onPersonCreated}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Jméno příjemce</Label>
              <Input readOnly value={form.jmenoPrijemce} />
            </div>
            <div className="space-y-1.5">
              <Label>Číslo ČSK příjemce</Label>
              <Input readOnly value={form.cisloCskPrijemce} />
            </div>
            <div className="space-y-1.5">
              <Label>Číslo účtu příjemce</Label>
              <Input readOnly value={form.cisloUctuPrijemce} />
            </div>
            <div className="space-y-1.5">
              <Label>Kód banky</Label>
              <Input readOnly value={form.kodBanky} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Variabilní symbol *</Label>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={!suggestedVs}
                  onClick={() => setField("variabilniSymbol", suggestedVs)}
                >
                  Doplnit dle ID + ČSK
                </Button>
              </div>
              <Input required value={form.variabilniSymbol} onChange={(event) => setField("variabilniSymbol", event.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Pořadatel akce *</Label>
              <Input required value={form.poradatelAkce} onChange={(event) => setField("poradatelAkce", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Číslo ČSK pořadatele *</Label>
              <Input required value={form.cisloCskPoradatele} onChange={(event) => setField("cisloCskPoradatele", event.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Zrušit
            </Button>
            <Button type="submit" disabled={saving}>
              <FileCheck2 className="size-4" />
              {saving ? "Zpracovávám…" : "Vytvořit a přidat doklad"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HonorExpenseDialog({
  open,
  onOpenChange,
  eventId,
  eventName,
  leaderName,
  personOptions,
  peopleLoaded,
  onPersonCreated,
  onExpenseCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: number;
  eventName: string;
  leaderName: string | null;
  personOptions: PersonOption[];
  peopleLoaded: boolean;
  onPersonCreated: (person: PersonOption) => void;
  onExpenseCreated: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<HonorFormState>(() =>
    createInitialHonorForm(eventId, eventName, leaderName),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(createInitialHonorForm(eventId, eventName, leaderName));
      setError(null);
    }
  }, [open, eventId, eventName, leaderName]);

  const suggestedVs = buildSuggestedVs(form.id, form.cisloCskPrijemce);

  const setField = <K extends keyof HonorFormState>(field: K, value: HonorFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  function setReimbursementPerson(person: PersonOption | null) {
    setForm((prev) => {
      if (!person) {
        return {
          ...prev,
          reimbursementPersonId: "",
          jmenoPrijemce: "",
          cisloCskPrijemce: "",
          cisloUctuPrijemce: "",
          kodBanky: "",
          variabilniSymbol: "",
        };
      }

      const cskNumber = person.cskNumber ?? "";
      return {
        ...prev,
        reimbursementPersonId: String(person.id),
        jmenoPrijemce: person.fullName,
        cisloCskPrijemce: cskNumber,
        cisloUctuPrijemce: person.bankAccountNumber ?? "",
        kodBanky: person.bankCode ?? "",
        variabilniSymbol: buildSuggestedVs(prev.id, cskNumber),
      };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const amount = parseNumberInput(form.castka);
      if (!amount || amount <= 0) throw new Error("Doplň platnou částku");

      const purposeText = normalizeText(form.purposeText);
      if (!purposeText) throw new Error("Doplň popis pro náklady");

      const payload: CestneProhlaseniData = {
        nazevAkce: normalizeText(form.nazevAkce) ?? "",
        id: normalizeText(form.id) ?? "",
        ucel: normalizeText(form.ucel) ?? "",
        castka: amount,
        jmenoPrijemce: normalizeText(form.jmenoPrijemce) ?? "",
        cisloCskPrijemce: normalizeText(form.cisloCskPrijemce) ?? "",
        cisloUctuPrijemce: normalizeText(form.cisloUctuPrijemce) ?? "",
        kodBanky: normalizeText(form.kodBanky) ?? "",
        variabilniSymbol: normalizeText(form.variabilniSymbol) ?? suggestedVs,
        poradatelAkce: normalizeText(form.poradatelAkce) ?? "",
        cisloCskPoradatele: normalizeText(form.cisloCskPoradatele) ?? "",
      };

      const pdfBlob = await requestPdf("/api/pdf/cestne-prohlaseni", payload);
      await createManualExpense({
        eventId,
        amount,
        purposeText,
        purposeCategory: form.purposeCategory,
        reimbursementPersonId: form.reimbursementPersonId,
        file: pdfBlob,
        fileName: makePdfFileName("cestne-prohlaseni", eventId, eventName),
      });

      await onExpenseCreated();
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Chyba při zpracování formuláře");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="size-4 text-amber-600" />
            Čestné prohlášení a samostatný náklad
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border bg-slate-50 p-3 text-xs text-gray-600">
            Vygeneruje PDF čestného prohlášení a uloží ho jako přiložený doklad samostatného nákladu v této akci.
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Název akce *</Label>
              <Input required value={form.nazevAkce} onChange={(event) => setField("nazevAkce", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ID akce *</Label>
              <Input required value={form.id} onChange={(event) => setField("id", event.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Účel *</Label>
              <Input required value={form.ucel} onChange={(event) => setField("ucel", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Částka *</Label>
              <Input
                required
                type="number"
                step="0.01"
                value={form.castka}
                onChange={(event) => setField("castka", event.target.value)}
              />
            </div>
            <ExpenseCategoryField value={form.purposeCategory} onChange={(value) => setField("purposeCategory", value)} />
            <div className="space-y-1.5 md:col-span-2">
              <Label>Popis do nákladů *</Label>
              <Textarea
                required
                rows={3}
                value={form.purposeText}
                onChange={(event) => setField("purposeText", event.target.value)}
              />
            </div>
            <ReimbursementPersonField
              people={personOptions}
              peopleLoaded={peopleLoaded}
              value={form.reimbursementPersonId}
              onChange={setReimbursementPerson}
              onPersonCreated={onPersonCreated}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Jméno příjemce</Label>
              <Input readOnly value={form.jmenoPrijemce} />
            </div>
            <div className="space-y-1.5">
              <Label>Číslo ČSK příjemce</Label>
              <Input readOnly value={form.cisloCskPrijemce} />
            </div>
            <div className="space-y-1.5">
              <Label>Číslo účtu příjemce</Label>
              <Input readOnly value={form.cisloUctuPrijemce} />
            </div>
            <div className="space-y-1.5">
              <Label>Kód banky</Label>
              <Input readOnly value={form.kodBanky} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Variabilní symbol *</Label>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={!suggestedVs}
                  onClick={() => setField("variabilniSymbol", suggestedVs)}
                >
                  Doplnit dle ID + ČSK
                </Button>
              </div>
              <Input required value={form.variabilniSymbol} onChange={(event) => setField("variabilniSymbol", event.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Pořadatel akce *</Label>
              <Input required value={form.poradatelAkce} onChange={(event) => setField("poradatelAkce", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Číslo ČSK pořadatele *</Label>
              <Input required value={form.cisloCskPoradatele} onChange={(event) => setField("cisloCskPoradatele", event.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Zrušit
            </Button>
            <Button type="submit" disabled={saving}>
              <FileCheck2 className="size-4" />
              {saving ? "Zpracovávám…" : "Vytvořit a přidat doklad"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EventExpenseActions({
  eventId,
  eventName,
  leaderName,
  personOptions,
  peopleLoaded,
  onPersonCreated,
  onExpenseCreated,
}: ExpenseActionPanelProps) {
  const [travelOpen, setTravelOpen] = useState(false);
  const [honorOpen, setHonorOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleSendSettlement() {
    setSending(true);
    setSendMessage(null);
    setSendError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/send-vyuctovani`, { method: "POST" });
      const payload = await response.json() as {
        success?: true;
        error?: string;
        recipient?: string;
        attachmentCount?: number;
        warnings?: string[];
        missingExpensePayees?: Array<{ id: number; purposeText: string }>;
        missingBankAccounts?: Array<{ id: number; name: string }>;
      };

      if (!response.ok) {
        const missingExpenseText = payload.missingExpensePayees?.length
          ? `\nNáklady bez příjemce: ${payload.missingExpensePayees.map((item) => item.purposeText).join(", ")}.`
          : "";
        const missingAccountText = payload.missingBankAccounts?.length
          ? `\nČlenové bez účtu: ${payload.missingBankAccounts.map((item) => item.name).join(", ")}.`
          : "";
        throw new Error(`${payload.error ?? "Odeslání selhalo."}${missingExpenseText}${missingAccountText}`);
      }

      const warningText = payload.warnings?.length ? ` Upozornění: ${payload.warnings.join("; ")}.` : "";
      setSendMessage(`Vyúčtování bylo odesláno na ${payload.recipient} (${payload.attachmentCount ?? 0} příloh).${warningText}`);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Odeslání selhalo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border bg-gradient-to-r from-white via-slate-50 to-emerald-50/60 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Formuláře k nákladům akce</h3>
          <p className="mt-1 text-xs text-gray-500">
            Vyúčtování oddílu se stáhne rovnou. Cestovní příkaz a čestné prohlášení založí samostatný náklad a uloží PDF mezi doklady akce.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/events/${eventId}/vyuctovani`}>
              <CircleDollarSign className="size-4" />
              Vyúčtování oddílu
            </a>
          </Button>

          <Button size="sm" variant="outline" onClick={() => setTravelOpen(true)}>
            <BusFront className="size-4" />
            Náklady na dopravu
          </Button>

          <Button size="sm" variant="outline" onClick={() => setHonorOpen(true)}>
            <FileCheck2 className="size-4" />
            Čestné prohlášení o nákladech
          </Button>

          <Button size="sm" onClick={handleSendSettlement} disabled={sending}>
            <Send className="size-4" />
            {sending ? "Odesílám…" : "Odeslat vyúčtování"}
          </Button>
        </div>

        {sendMessage && <p className="text-xs text-green-700">{sendMessage}</p>}
        {sendError && (
          <p className="whitespace-pre-line text-xs text-red-600">
            {sendError}
          </p>
        )}
      </div>

      <TravelExpenseDialog
        open={travelOpen}
        onOpenChange={setTravelOpen}
        eventId={eventId}
        eventName={eventName}
        leaderName={leaderName}
        personOptions={personOptions}
        peopleLoaded={peopleLoaded}
        onPersonCreated={onPersonCreated}
        onExpenseCreated={onExpenseCreated}
      />

      <HonorExpenseDialog
        open={honorOpen}
        onOpenChange={setHonorOpen}
        eventId={eventId}
        eventName={eventName}
        leaderName={leaderName}
        personOptions={personOptions}
        peopleLoaded={peopleLoaded}
        onPersonCreated={onPersonCreated}
        onExpenseCreated={onExpenseCreated}
      />
    </>
  );
}