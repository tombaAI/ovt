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
import type { MemberOption } from "@/lib/actions/events";
import type { CestneProhlaseniData } from "@/lib/pdf/cestne-prohlaseni-template";
import type { CestovniPrikazData } from "@/lib/pdf/cestovni-prikaz-template";

const EXPENSE_CATEGORIES = expenseCategoryEnum as readonly ExpenseCategory[];
const DEFAULT_EXPENSE_CATEGORY: ExpenseCategory = "518/009";

type ExpenseActionPanelProps = {
  eventId: number;
  eventName: string;
  leaderName: string | null;
  memberOptions: MemberOption[];
  membersLoaded: boolean;
  onExpenseCreated: () => void | Promise<void>;
};

type TravelFormState = {
  nazevAkce: string;
  id: string;
  nakladyNaDopravu: string;
  purposeText: string;
  purposeCategory: ExpenseCategory;
  reimbursementMemberId: string;
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
  reimbursementMemberId: string;
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

function memberLabel(member: MemberOption): string {
  return member.nickname ? `${member.fullName} (${member.nickname})` : member.fullName;
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
  reimbursementMemberId: string;
  file: Blob;
  fileName: string;
}) {
  const formData = new FormData();
  formData.append("amount", String(input.amount));
  formData.append("purposeText", input.purposeText);
  formData.append("purposeCategory", input.purposeCategory);
  formData.append("reimbursementMemberId", input.reimbursementMemberId);
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
    reimbursementMemberId: "",
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
    reimbursementMemberId: "",
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

function ReimbursementMemberField({
  members,
  membersLoaded,
  value,
  onChange,
}: {
  members: MemberOption[];
  membersLoaded: boolean;
  value: string;
  onChange: (member: MemberOption | null) => void;
}) {
  const selected = members.find((member) => String(member.id) === value) ?? null;
  const account = selected?.bankAccountNumber && selected?.bankCode
    ? `${selected.bankAccountNumber}/${selected.bankCode}`
    : null;

  return (
    <div className="space-y-1.5 md:col-span-2">
      <Label>Komu proplatit *</Label>
      <select
        required
        value={value}
        disabled={!membersLoaded}
        onChange={(event) => {
          const member = members.find((item) => String(item.id) === event.target.value) ?? null;
          onChange(member);
        }}
        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      >
        <option value="">{membersLoaded ? "Vyber člena" : "Načítám členy..."}</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>{memberLabel(member)}</option>
        ))}
      </select>
      {selected && (
        <p className={`text-[11px] ${account ? "text-gray-400" : "text-amber-600"}`}>
          {account ? `Účet: ${account}` : "Člen nemá vyplněný bankovní účet. Doplň ho v detailu člena."}
        </p>
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
  memberOptions,
  membersLoaded,
  onExpenseCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: number;
  eventName: string;
  leaderName: string | null;
  memberOptions: MemberOption[];
  membersLoaded: boolean;
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

  function setReimbursementMember(member: MemberOption | null) {
    setForm((prev) => {
      if (!member) {
        return {
          ...prev,
          reimbursementMemberId: "",
          jmenoPrijemce: "",
          cisloCskPrijemce: "",
          cisloUctuPrijemce: "",
          kodBanky: "",
          variabilniSymbol: "",
        };
      }

      const cskNumber = member.cskNumber ?? "";
      return {
        ...prev,
        reimbursementMemberId: String(member.id),
        jmenoPrijemce: member.fullName,
        cisloCskPrijemce: cskNumber,
        cisloUctuPrijemce: member.bankAccountNumber ?? "",
        kodBanky: member.bankCode ?? "",
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
      if (!form.reimbursementMemberId) throw new Error("Vyber člena, kterému se má doklad proplatit");
      if (!normalizeText(form.cisloUctuPrijemce) || !normalizeText(form.kodBanky)) {
        throw new Error("Vybraný člen nemá vyplněný bankovní účet. Doplň ho v detailu člena a formulář vytvoř znovu.");
      }

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
        reimbursementMemberId: form.reimbursementMemberId,
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
            <ReimbursementMemberField
              members={memberOptions}
              membersLoaded={membersLoaded}
              value={form.reimbursementMemberId}
              onChange={setReimbursementMember}
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
  memberOptions,
  membersLoaded,
  onExpenseCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: number;
  eventName: string;
  leaderName: string | null;
  memberOptions: MemberOption[];
  membersLoaded: boolean;
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

  function setReimbursementMember(member: MemberOption | null) {
    setForm((prev) => {
      if (!member) {
        return {
          ...prev,
          reimbursementMemberId: "",
          jmenoPrijemce: "",
          cisloCskPrijemce: "",
          cisloUctuPrijemce: "",
          kodBanky: "",
          variabilniSymbol: "",
        };
      }

      const cskNumber = member.cskNumber ?? "";
      return {
        ...prev,
        reimbursementMemberId: String(member.id),
        jmenoPrijemce: member.fullName,
        cisloCskPrijemce: cskNumber,
        cisloUctuPrijemce: member.bankAccountNumber ?? "",
        kodBanky: member.bankCode ?? "",
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
      if (!form.reimbursementMemberId) throw new Error("Vyber člena, kterému se má doklad proplatit");
      if (!normalizeText(form.cisloUctuPrijemce) || !normalizeText(form.kodBanky)) {
        throw new Error("Vybraný člen nemá vyplněný bankovní účet. Doplň ho v detailu člena a formulář vytvoř znovu.");
      }

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
        reimbursementMemberId: form.reimbursementMemberId,
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
            <ReimbursementMemberField
              members={memberOptions}
              membersLoaded={membersLoaded}
              value={form.reimbursementMemberId}
              onChange={setReimbursementMember}
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
  memberOptions,
  membersLoaded,
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

      setSendMessage(`Vyúčtování bylo odesláno na ${payload.recipient} (${payload.attachmentCount ?? 0} příloh).`);
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
        memberOptions={memberOptions}
        membersLoaded={membersLoaded}
        onExpenseCreated={onExpenseCreated}
      />

      <HonorExpenseDialog
        open={honorOpen}
        onOpenChange={setHonorOpen}
        eventId={eventId}
        eventName={eventName}
        leaderName={leaderName}
        memberOptions={memberOptions}
        membersLoaded={membersLoaded}
        onExpenseCreated={onExpenseCreated}
      />
    </>
  );
}