# Vylepšení popisu a příjemce faktury podle analýzy dokladu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** V dialozích výměny přílohy (`AttachFileDialog`) a přeanalýzy (`ReanalyzeDialog`) existujícího nákladu zobrazit popis (`purposeText`) a příjemce faktury (`invoicePayeeName`) jako editovatelná pole vedle čerstvé Gemini analýzy, s možností je rovnou uložit v témže dialogu.

**Architecture:** Žádná změna Gemini analýzy ani `attach-file`/`reanalyze` API endpointů. Nová funkčnost jde přes existující `PATCH /api/events/[id]/expenses` (stejný endpoint, který dnes používá `ExpenseEditDialog`) — klient po úspěšném `attach-file` POSTu (nebo po dokončené re-analýze) volá navazující PATCH, jen když se popis/příjemce reálně liší od uložených hodnot. Nový sdílený UI komponent `PayeeComparison` mirror-uje existující `AmountComparison`.

**Tech Stack:** Next.js App Router (client component), existující shadcn `Input`/`Button`, `fetch` na existující API routy — beze změny stacku.

## Global Constraints

- Spec: `zadani/2026-07-23-vylepseni-popisu-prijemce.md` — dodržet přesně scope (jen `AttachFileDialog` + `ReanalyzeDialog`, žádná změna `AddExpenseForm` ani Gemini promptu/schématu).
- **Bez automatických testů** pro tuhle oblast — repo konvence (viz `docs/superpowers/specs/2026-07-04-invoice-attachment-replace-design.md`, sekce Testing): ověření je lint + `npx tsc --noEmit` + ruční průchod na stagingu. Pre-commit hook (`npm run lint && npx tsc --noEmit && npm run test:unit`) běží automaticky při každém commitu — žádný krok navíc není potřeba přidávat ručně, ale je potřeba mít commit čistý.
- `purposeText` musí zůstat vždy neprázdný (PATCH endpoint vrátí 400 `"Chybí účel"`, pokud přijde prázdný string) — klient validuje před odesláním, stejně jako `ExpenseEditDialog` dnes.
- `invoicePayeeName` se týká jen nákladů, kde `expense.isPaid === false` (faktura k proplacení) — u účtenek (`isPaid === true`) se pole vůbec nezobrazuje, stejně jako dnes v `ExpenseEditDialog`.
- `lockForReimbursement` blokuje PATCH endpoint (i `attach-file`/`reanalyze`) server-side beze změny — klient nemusí duplikovat kontrolu, jen zobrazit chybu z response.
- Soubor `src/app/(admin)/dashboard/events/[id]/event-expenses-tab.tsx` je jediný upravovaný soubor (kromě plánu/zadání) — je to velký soubor, ale všechny dialogy nákladů v něm už dnes žijí pohromadě (`AttachFileDialog`, `ReanalyzeDialog`, `AmountComparison`, `AnalysisCard` jsou už tam) — nerozdělovat ho, drží se existující konvence souboru.

---

## Před zahájením: založení feature větve

Podle `CLAUDE.md` (sekce "Superpowers vývoj") se práce vedená přes `brainstorming → writing-plans → subagent-driven-development` dělá na samostatné větvi ze `staging`, ne přímým commitem na `staging`. Před spuštěním Task 1 je potřeba s uživatelem potvrdit:
1. Název větve (návrh: `feat/2026-07-23-vylepseni-popisu-prijemce`).
2. Jestli se má založit samostatný git worktree, nebo stačí přepnout větev v současném adresáři.

---

### Task 1: `PayeeComparison` komponenta

**Files:**
- Modify: `src/app/(admin)/dashboard/events/[id]/event-expenses-tab.tsx` — vložit novou funkci hned za `AmountComparison` (aktuálně končí na řádku 1223, před komentářem `// ── Attach / swap file dialog ─────` na řádku 1225).

**Interfaces:**
- Produces: `PayeeComparison({ written, detected }: { written: string; detected: string | null }): JSX.Element | null` — použije Task 2 a Task 3.

- [ ] **Step 1: Vložit komponentu**

Vlož za `AmountComparison` (za řádek 1223, před `// ── Attach / swap file dialog ─────`):

```tsx
function PayeeComparison({ written, detected }: { written: string; detected: string | null }) {
    if (!detected) return null;
    const match = written.trim().toLowerCase() === detected.trim().toLowerCase();
    return (
        <div className={`rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-3 ${
            match ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"
        }`}>
            <span className="text-gray-600 truncate">
                Zapsáno: <span className="font-medium text-gray-900">{written || "—"}</span>
            </span>
            <span className={match ? "text-green-700" : "text-amber-700"}>
                Na faktuře: <span className="font-medium">{detected}</span>
            </span>
        </div>
    );
}
```

- [ ] **Step 2: Ověřit typy**

Run: `npx tsc --noEmit`
Expected: bez chyb (funkce zatím nikde není použitá — to je v pořádku, TypeScript nehlásí unused top-level function jako chybu; pokud by ESLint hlásil `no-unused-vars`, přeskoč na Task 2, kde se komponenta použije).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/dashboard/events/\[id\]/event-expenses-tab.tsx
git commit -m "feat(events): přidat PayeeComparison komponentu pro srovnání příjemce faktury"
```

---

### Task 2: `AttachFileDialog` — editovatelný popis a příjemce

**Files:**
- Modify: `src/app/(admin)/dashboard/events/[id]/event-expenses-tab.tsx` — funkce `AttachFileDialog` (aktuálně řádky 1227–1406).

**Interfaces:**
- Consumes: `PayeeComparison` (Task 1), existující `analyzedMatchesAmount` z `@/lib/expense-mismatch`, existující `PATCH /api/events/[id]/expenses` (tělo: `{ expenseId: number; purposeText?: string; invoicePayeeName?: string | null }`).
- Produces: beze změny veřejného rozhraní komponenty (props `AttachFileDialog` zůstávají stejné) — jen vnitřní chování.

- [ ] **Step 1: Nahradit celou funkci `AttachFileDialog`**

Nahraď celou funkci (řádky 1227–1406 — od `function AttachFileDialog({` po uzavírací `}` před komentářem `// ── Reanalyze dialog`) tímto kompletním novým zněním:

```tsx
function AttachFileDialog({
    expense,
    eventId,
    open,
    onOpenChange,
    onUpdated,
    lockedForParticipants = false,
    isTreasurer = false,
}: {
    expense: EventExpenseRow;
    eventId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdated: () => void;
    lockedForParticipants?: boolean;
    isTreasurer?: boolean;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
    const [amount, setAmount] = useState("");
    const [purposeText, setPurposeText] = useState("");
    const [invoicePayeeName, setInvoicePayeeName] = useState("");
    const [confirmChecked, setConfirmChecked] = useState(false);
    const [fileSaved, setFileSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasFile = expense.fileUrl != null;

    useEffect(() => {
        if (!open) return;
        setFile(null); setAnalysis(null); setError(null); setConfirmChecked(false); setSaving(false);
        setAmount(expense.amount ? expense.amount.replace(".", ",") : "");
        setPurposeText(expense.purposeText ?? "");
        setInvoicePayeeName(expense.invoicePayeeName ?? "");
        setFileSaved(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [open, expense]);

    // Částka pro porovnání: zamčeno → vždy z DB; odemčeno → z editovatelného pole
    const compareAmount = lockedForParticipants
        ? expense.amount
        : (amount.replace(",", ".").trim() || null);
    const detected = analysis ? analysis.total_amount : null;
    const match = analyzedMatchesAmount(compareAmount, detected);
    const mismatch = analysis != null && !match;

    async function handleFile(picked: File | undefined) {
        if (!picked) return;
        setFile(picked); setAnalyzing(true); setError(null); setAnalysis(null); setConfirmChecked(false);
        setFileSaved(false);
        try {
            const small = await prepareFileForGemini(picked);
            const fd = new FormData();
            fd.append("file", small);
            const res = await fetch("/api/expenses/analyze", { method: "POST", body: fd });
            const data: ExpenseAnalysis & { error?: string } = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Chyba analýzy");
            setAnalysis(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analýza selhala");
        } finally {
            setAnalyzing(false);
        }
    }

    async function handleSave() {
        if (!file) return;
        if (!purposeText.trim()) { setError("Doplň účel dokladu"); return; }
        setSaving(true); setError(null);
        try {
            if (!fileSaved) {
                const fd = new FormData();
                fd.append("file", file);
                fd.append("amount", amount.replace(",", "."));
                if (mismatch && isTreasurer && confirmChecked) fd.append("confirmMismatch", "true");
                const res = await fetch(
                    `/api/events/${eventId}/expenses/${expense.id}/attach-file`,
                    { method: "POST", body: fd },
                );
                const data = await res.json() as { error?: string };
                if (!res.ok) throw new Error(data.error ?? "Chyba nahrávání");
                setFileSaved(true);
            }

            const trimmedPurpose = purposeText.trim();
            const trimmedPayee = invoicePayeeName.trim();
            const purposeChanged = trimmedPurpose !== (expense.purposeText ?? "");
            const payeeChanged = !expense.isPaid && trimmedPayee !== (expense.invoicePayeeName ?? "");
            if (purposeChanged || payeeChanged) {
                const patchBody: Record<string, unknown> = { expenseId: expense.id };
                if (purposeChanged) patchBody.purposeText = trimmedPurpose;
                if (payeeChanged) patchBody.invoicePayeeName = trimmedPayee || null;
                const patchRes = await fetch(`/api/events/${eventId}/expenses`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patchBody),
                });
                if (!patchRes.ok) {
                    const patchData = await patchRes.json() as { error?: string };
                    throw new Error(patchData.error ?? "Doklad byl uložen, ale popis/příjemce se nepodařilo uložit — zkus to znovu.");
                }
            }

            onOpenChange(false);
            onUpdated();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chyba ukládání");
            if (fileSaved) onUpdated(); // soubor a částka se uložily i přes chybu v druhém kroku
        } finally {
            setSaving(false);
        }
    }

    const busy = analyzing || saving;
    // Kdy lze uložit
    const lockedBlockedByTreasurer = lockedForParticipants && mismatch && !isTreasurer;
    const needsConfirm = lockedForParticipants && mismatch && isTreasurer;
    const canSave = file != null && !busy && !lockedBlockedByTreasurer && (!needsConfirm || confirmChecked);

    return (
        <Dialog open={open} onOpenChange={open => { if (!busy) onOpenChange(open); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{hasFile ? "Vyměnit doklad" : "Přiložit doklad"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-1">
                    {expense.purposeText && (
                        <p className="text-sm text-gray-600">{expense.purposeText}</p>
                    )}

                    <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-5 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50 transition-colors ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                        <Paperclip size={20} className="text-amber-500" />
                        <span className="text-sm text-gray-700">
                            {analyzing ? "Analyzuji…" : file ? file.name : "Vybrat soubor dokladu"}
                        </span>
                        <span className="text-xs text-gray-400">PDF, Excel nebo fotka, max 10 MB</span>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,application/pdf,.xls,.xlsx"
                            className="sr-only"
                            onChange={e => { void handleFile(e.target.files?.[0]); }}
                            disabled={busy}
                        />
                    </label>

                    {analysis && (
                        <>
                            <AnalysisCard analysis={analysis} />
                            <AmountComparison written={compareAmount} detected={detected} />

                            {lockedForParticipants ? (
                                <div className="text-xs text-gray-500">
                                    Předpisy jsou uzamčené — částka <span className="font-medium tabular-nums">{fmtAmount(expense.amount)}</span> se nemění.
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-600">Zapsaná částka (Kč)</label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={amount}
                                            onChange={e => setAmount(e.target.value)}
                                            inputMode="decimal"
                                            className="tabular-nums"
                                            disabled={busy}
                                        />
                                        {detected != null && (
                                            <Button type="button" variant="outline" size="sm"
                                                onClick={() => setAmount(String(detected).replace(".", ","))}
                                                disabled={busy}>
                                                Použít zjištěnou
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {lockedBlockedByTreasurer && (
                                <p className="text-xs text-red-600 flex items-start gap-1.5">
                                    <TriangleAlert size={13} className="shrink-0 mt-0.5" />
                                    Dokud jsou předpisy uzamčené, výměnu s neshodující se částkou může provést jen hospodář.
                                </p>
                            )}
                            {needsConfirm && (
                                <label className="flex items-start gap-2 text-xs text-red-700 cursor-pointer">
                                    <input type="checkbox" checked={confirmChecked}
                                        onChange={e => setConfirmChecked(e.target.checked)}
                                        className="mt-0.5" disabled={busy} />
                                    <span>Rozumím, že se zjištěná částka neshoduje se zapsanou, přesto uložit.</span>
                                </label>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-gray-600">Popis / účel</label>
                                <Input
                                    value={purposeText}
                                    onChange={e => setPurposeText(e.target.value)}
                                    disabled={busy}
                                />
                            </div>

                            {!expense.isPaid && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-600">Příjemce faktury</label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={invoicePayeeName}
                                            onChange={e => setInvoicePayeeName(e.target.value)}
                                            disabled={busy}
                                        />
                                        {analysis.payee_name && (
                                            <Button type="button" variant="outline" size="sm"
                                                onClick={() => setInvoicePayeeName(analysis.payee_name ?? "")}
                                                disabled={busy}>
                                                Použít
                                            </Button>
                                        )}
                                    </div>
                                    <PayeeComparison written={invoicePayeeName} detected={analysis.payee_name} />
                                </div>
                            )}
                        </>
                    )}

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
                            Zrušit
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={!canSave}>
                            {saving ? "Ukládám…" : "Uložit"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
```

Klíčové změny oproti originálu: nový state `purposeText`/`invoicePayeeName`/`fileSaved`; `handleSave` teď po úspěšném `attach-file` POSTu navazuje PATCH jen při reálné změně; `fileSaved` flag umožní retry PATCHe bez opětovného nahrávání souboru, pokud PATCH selže; nová editovatelná pole popis/příjemce (s `PayeeComparison` a tlačítkem "Použít" u příjemce) se zobrazí ve stejném bloku jako `AnalysisCard`.

- [ ] **Step 2: Ověřit typy a lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: bez chyb.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/dashboard/events/\[id\]/event-expenses-tab.tsx
git commit -m "feat(events): editovatelný popis a příjemce ve výměně přílohy nákladu"
```

---

### Task 3: `ReanalyzeDialog` — editovatelný popis a příjemce

**Files:**
- Modify: `src/app/(admin)/dashboard/events/[id]/event-expenses-tab.tsx` — funkce `ReanalyzeDialog` (aktuálně řádky 1410–1516, po dokončení Task 1 a 2 se řádkové číslo posune — hledej podle názvu funkce, ne podle čísla řádku).

**Interfaces:**
- Consumes: `PayeeComparison` (Task 1), existující `PATCH /api/events/[id]/expenses` (stejné tělo jako v Task 2).
- Produces: beze změny veřejného rozhraní komponenty.

- [ ] **Step 1: Nahradit celou funkci `ReanalyzeDialog`**

Nahraď celou funkci (od `function ReanalyzeDialog({` po uzavírací `}` před komentářem `// ── Draft processing dialog`) tímto kompletním novým zněním:

```tsx
function ReanalyzeDialog({
    expense,
    eventId,
    open,
    onOpenChange,
    onUpdated,
    isTreasurer = false,
}: {
    expense: EventExpenseRow;
    eventId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdated: () => void;
    isTreasurer?: boolean;
}) {
    const [running, setRunning] = useState(false);
    const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
    const [code, setCode] = useState<"needs_treasurer" | "needs_confirmation" | null>(null);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [purposeText, setPurposeText] = useState("");
    const [invoicePayeeName, setInvoicePayeeName] = useState("");
    const [savingMetadata, setSavingMetadata] = useState(false);
    const [metadataSaved, setMetadataSaved] = useState(false);
    const [metadataError, setMetadataError] = useState<string | null>(null);

    const call = useCallback(async (confirmMismatch: boolean) => {
        setRunning(true); setError(null);
        try {
            const url = `/api/events/${eventId}/expenses/${expense.id}/reanalyze${confirmMismatch ? "?confirmMismatch=true" : ""}`;
            const res = await fetch(url, { method: "POST" });
            const data = await res.json() as { success?: true; error?: string; code?: "needs_treasurer" | "needs_confirmation"; analysis?: ExpenseAnalysis };
            if (res.ok) {
                setAnalysis(data.analysis ?? null); setCode(null); setDone(true);
                onUpdated();
                return;
            }
            if (res.status === 409 && data.code) {
                setAnalysis(data.analysis ?? null); setCode(data.code);
                return;
            }
            throw new Error(data.error ?? "Analýza selhala");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analýza selhala");
        } finally {
            setRunning(false);
        }
    }, [eventId, expense.id, onUpdated]);

    // Auto-spuštění při otevření
    useEffect(() => {
        if (!open) { setAnalysis(null); setCode(null); setDone(false); setError(null); return; }
        setPurposeText(expense.purposeText ?? "");
        setInvoicePayeeName(expense.invoicePayeeName ?? "");
        setMetadataSaved(false); setMetadataError(null);
        void call(false);
    }, [open, call, expense]);

    const detected = analysis ? analysis.total_amount : null;

    const metadataChanged = purposeText.trim() !== (expense.purposeText ?? "")
        || (!expense.isPaid && invoicePayeeName.trim() !== (expense.invoicePayeeName ?? ""));

    async function handleSaveMetadata() {
        const trimmedPurpose = purposeText.trim();
        if (!trimmedPurpose) { setMetadataError("Doplň účel dokladu"); return; }
        setSavingMetadata(true); setMetadataError(null);
        try {
            const patchBody: Record<string, unknown> = { expenseId: expense.id, purposeText: trimmedPurpose };
            if (!expense.isPaid) patchBody.invoicePayeeName = invoicePayeeName.trim() || null;
            const res = await fetch(`/api/events/${eventId}/expenses`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patchBody),
            });
            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error ?? "Uložení selhalo");
            setMetadataSaved(true);
            onUpdated();
        } catch (err) {
            setMetadataError(err instanceof Error ? err.message : "Uložení selhalo");
        } finally {
            setSavingMetadata(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={o => { if (!running) onOpenChange(o); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Přeanalyzovat přílohu</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-1">
                    {running && !analysis && (
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                            <RefreshCw size={14} className="animate-spin" /> Analyzuji přílohu…
                        </p>
                    )}

                    {analysis && (
                        <>
                            <AnalysisCard analysis={analysis} />
                            <AmountComparison written={expense.amount} detected={detected} />

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-gray-600">Popis / účel</label>
                                <Input
                                    value={purposeText}
                                    onChange={e => { setPurposeText(e.target.value); setMetadataSaved(false); }}
                                    disabled={savingMetadata}
                                />
                            </div>

                            {!expense.isPaid && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-600">Příjemce faktury</label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={invoicePayeeName}
                                            onChange={e => { setInvoicePayeeName(e.target.value); setMetadataSaved(false); }}
                                            disabled={savingMetadata}
                                        />
                                        {analysis.payee_name && (
                                            <Button type="button" variant="outline" size="sm"
                                                onClick={() => { setInvoicePayeeName(analysis.payee_name ?? ""); setMetadataSaved(false); }}
                                                disabled={savingMetadata}>
                                                Použít
                                            </Button>
                                        )}
                                    </div>
                                    <PayeeComparison written={invoicePayeeName} detected={analysis.payee_name} />
                                </div>
                            )}

                            {metadataSaved && (
                                <p className="text-xs text-green-700 flex items-center gap-1.5">
                                    <Check size={13} /> Popis/příjemce uloženy.
                                </p>
                            )}
                            {metadataError && <p className="text-xs text-red-500">{metadataError}</p>}
                        </>
                    )}

                    {done && (
                        <p className="text-sm text-green-700 flex items-center gap-1.5">
                            <Check size={14} /> Analýza uložena.
                        </p>
                    )}

                    {code === "needs_treasurer" && (
                        <p className="text-xs text-red-600 flex items-start gap-1.5">
                            <TriangleAlert size={13} className="shrink-0 mt-0.5" />
                            Zjištěná částka se neshoduje se zapsanou. Dokud jsou předpisy uzamčené, uložit to může jen hospodář.
                        </p>
                    )}
                    {code === "needs_confirmation" && (
                        <p className="text-xs text-red-700">
                            Zjištěná částka se neshoduje se zapsanou — potvrďte uložení.
                        </p>
                    )}

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={running}>
                            {done ? "Zavřít" : "Zrušit"}
                        </Button>
                        {analysis && metadataChanged && !metadataSaved && (
                            <Button variant="outline" size="sm" onClick={handleSaveMetadata} disabled={savingMetadata || running}>
                                {savingMetadata ? "Ukládám…" : "Uložit popis/příjemce"}
                            </Button>
                        )}
                        {code === "needs_confirmation" && isTreasurer && (
                            <Button size="sm" onClick={() => call(true)} disabled={running}>
                                {running ? "Ukládám…" : "Přesto uložit"}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
```

Klíčové změny oproti originálu: nový state pro popis/příjemce, inicializovaný při otevření dialogu ze stávajících hodnot nákladu; editovatelná pole se zobrazí hned s `AnalysisCard`/`AmountComparison` (ne až po `done`); samostatná akce `handleSaveMetadata` (PATCH) nezávislá na hlavní re-analyze logice; tlačítko "Uložit popis/příjemce" se zobrazí jen když se hodnota reálně liší a ještě nebyla uložena.

- [ ] **Step 2: Ověřit typy a lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: bez chyb.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/dashboard/events/\[id\]/event-expenses-tab.tsx
git commit -m "feat(events): editovatelný popis a příjemce v dialogu přeanalýzy nákladu"
```

---

### Task 4: Ruční ověření na stagingu

**Files:** žádné (jen ověření nasazené změny) — vyžaduje předchozí push feature větve a její nasazení/testování na staging preview (`GEMINI_API_KEY` a `BLOB_READ_WRITE_TOKEN` lokálně chybí, viz `CLAUDE.md`).

- [ ] **Step 1: Push feature větve a otevření staging preview**

Push proběhne v rámci finálního merge feature větve do `staging` (viz `superpowers:finishing-a-development-branch`) — po mergi ověřit na `ovt-git-staging-tombaais-projects.vercel.app`.

- [ ] **Step 2: Scénář 1 — výměna přílohy se sešuplým příjemcem/popisem**

Na akci najít existující náklad typu faktura (`isPaid = false`) se stroze zapsaným `purposeText`/`invoicePayeeName`. Otevřít "Vyměnit doklad", nahrát reálnou fakturu se čitelnou hlavičkou dodavatele.
Expected: po analýze se objeví `AnalysisCard`, pod ním editovatelné popis + příjemce, u příjemce srovnání a tlačítko "Použít" (zkopíruje `payee_name` do pole). Po "Uložit" se náklad v přehledu zobrazí s novým popisem/příjemcem.

- [ ] **Step 3: Scénář 2 — přeanalýza bez výměny souboru**

Na náklad s existující přílohou spustit "Přeanalyzovat". Po dokončení upravit popis, kliknout "Uložit popis/příjemce" odděleně od automatického uložení částky.
Expected: popis se uloží, zpráva "Popis/příjemce uloženy.", náklad v přehledu má nový popis.

- [ ] **Step 4: Scénář 3 — neměněná pole**

V obou dialozích otevřít existující náklad a nic needitovat, jen uložit (výměna přílohy) / nechat doběhnout re-analýzu bez úpravy polí.
Expected: žádný navazující PATCH se nevolá (ověřit v Network tabu prohlížeče), žádný nový záznam v audit logu pro `purposeText`/`invoicePayeeName`.

- [ ] **Step 5: Scénář 4 — zamčená akce (`lockForReimbursement`)**

Na akci se zapnutým výdajovým zámkem zkusit oba dialogy.
Expected: chování beze změny oproti dnešku — dialogy hlásí zámek, žádná nová cesta jak ho obejít přes popis/příjemce.

---

## Self-Review (proveď po dokončení plánu)

1. **Pokrytí zadání:** Task 1–3 pokrývají `AttachFileDialog` a `ReanalyzeDialog` beze změny API kontraktu, žádné nové pole v Gemini analýze — odpovídá bodům 1–4 zadání. Task 4 pokrývá všechny 4 scénáře ze sekce Testing zadání (+ zámek). Sekce "Mimo rozsah" zadání (AddExpenseForm, AI-generovaný popis) — v plánu se nic z toho nemění, v souladu se zadáním.
2. **Placeholder scan:** žádné TBD/TODO — všechny kroky obsahují kompletní kód.
3. **Konzistence typů:** `PayeeComparison({ written: string; detected: string | null })` použito identicky v Task 2 i Task 3; `patchBody` tvar `{ expenseId, purposeText?, invoicePayeeName? }` odpovídá existujícímu PATCH kontraktu (`src/app/api/events/[id]/expenses/route.ts:248-258`).
