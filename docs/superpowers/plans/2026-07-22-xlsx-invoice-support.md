# XLS/XLSX faktury jako příloha nákladu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umožnit nahrání faktury ve formátu XLS/XLSX jako přílohy nákladu akce, se stejnou plnou Gemini AI analýzou (částka, kategorie, IČO/DIČ) jako dnes u PDF/fotky.

**Architecture:** Nová větev v `analyzeExpenseFile()` — spreadsheet se rozparsuje knihovnou `xlsx` (SheetJS) na CSV text (po listech) a pošle se Gemini jako textový obsah místo image/file části. Sdílená validace MIME/přípony se vytáhne do jednoho modulu a použije v obou upload endpointech.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, `xlsx` (SheetJS) — nová závislost.

## Global Constraints

- Nová npm závislost: `xlsx@0.18.5` (poslední verze publikovaná na npm registru).
- Limit velikosti souboru zůstává 10 MB (`MAX_FILE_BYTES`), beze změny.
- Nové MIME typy: `application/vnd.ms-excel` (.xls), `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx).
- Validace souboru: MIME **nebo** přípona `.xls`/`.xlsx` jako záloha (prohlížeče hlásí pro Office soubory někdy nespolehlivé MIME).
- Extrahovaný CSV text pro Gemini se ořízne na max 50 000 znaků (pojistka proti nafouknutí token cost u obřích sešitů).
- Žádné nové e2e testy — Gemini volání (`analyzeExpenseFile`) se dnes netestuje ani pro PDF/obrázky (vyžaduje `GEMINI_API_KEY`, síť); tenhle vzorec zůstává.
- Pre-commit hook spouští `npm run lint && npx tsc --noEmit && npm run test:unit` — každý commit musí projít čistě.
- Komitovat na větev `staging` (výchozí pracovní větev repozitáře), push po každém tasku.
- Commit message styl repozitáře: `feat(events): <česky, věcně>`.
- Reference spec: `docs/superpowers/specs/2026-07-22-xlsx-invoice-support-design.md`.

---

### Task 1: `xlsx-extract.ts` — parsování sešitu na CSV text

**Files:**
- Create: `src/lib/xlsx-extract.ts`
- Test: `src/lib/xlsx-extract.test.ts`

**Interfaces:**
- Produces: `extractTextFromSpreadsheet(buffer: Buffer): string` — použije Task 3.

- [ ] **Step 1: Nainstalovat závislost**

Run: `npm install xlsx@0.18.5`

Expected: `package.json` a `package-lock.json` obsahují `xlsx` v `dependencies`.

- [ ] **Step 2: Napsat padající test**

Vytvoř `src/lib/xlsx-extract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { extractTextFromSpreadsheet } from "./xlsx-extract";

function buildWorkbookBuffer(sheets: Record<string, unknown[][]>): Buffer {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, name);
    }
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("extractTextFromSpreadsheet", () => {
    it("převede jeden list na CSV s hlavičkou názvu listu", () => {
        const buffer = buildWorkbookBuffer({
            Faktura: [["Dodavatel", "Firma s.r.o."], ["Částka", 1500]],
        });
        const text = extractTextFromSpreadsheet(buffer);
        expect(text).toContain("Faktura");
        expect(text).toContain("Dodavatel,Firma s.r.o.");
        expect(text).toContain("Částka,1500");
    });

    it("spojí víc listů v pořadí sešitu, každý prefixovaný názvem", () => {
        const buffer = buildWorkbookBuffer({
            List1: [["A", "B"]],
            List2: [["C", "D"]],
        });
        const text = extractTextFromSpreadsheet(buffer);
        const list1Index = text.indexOf("List1");
        const list2Index = text.indexOf("List2");
        expect(list1Index).toBeGreaterThanOrEqual(0);
        expect(list2Index).toBeGreaterThan(list1Index);
        expect(text).toContain("A,B");
        expect(text).toContain("C,D");
    });

    it("prázdný list nepadá, jen vrátí prázdné CSV tělo", () => {
        const buffer = buildWorkbookBuffer({ "Prázdný list": [] });
        const text = extractTextFromSpreadsheet(buffer);
        expect(text).toContain("Prázdný list");
    });

    it("ořízne extrémně dlouhý výstup na cca 50 000 znaků", () => {
        const rows = Array.from({ length: 5000 }, (_, i) => [`řádek-${i}`, "x".repeat(20)]);
        const buffer = buildWorkbookBuffer({ Velký: rows });
        const text = extractTextFromSpreadsheet(buffer);
        expect(text.length).toBeLessThanOrEqual(50_200);
    });
});
```

- [ ] **Step 3: Spustit test, ověřit pád**

Run: `npx vitest run src/lib/xlsx-extract.test.ts`
Expected: FAIL — `Cannot find module './xlsx-extract'` (soubor ještě neexistuje).

- [ ] **Step 4: Napsat implementaci**

Vytvoř `src/lib/xlsx-extract.ts`:

```ts
import * as XLSX from "xlsx";

const MAX_CHARS = 50_000;

/**
 * Převede všechny listy sešitu na CSV text pro textovou Gemini analýzu.
 * Víc listů odděleno prázdným řádkem, každý prefixován názvem listu.
 * Ořízne extrémně velký výstup, aby nenafoukl Gemini token cost.
 */
export function extractTextFromSpreadsheet(buffer: Buffer): string {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const parts = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        return `--- List: ${name} ---\n${csv}`;
    });

    const text = parts.join("\n\n");
    if (text.length <= MAX_CHARS) return text;
    return `${text.slice(0, MAX_CHARS)}\n...(obsah zkrácen, sešit je příliš velký)`;
}
```

- [ ] **Step 5: Spustit test, ověřit průchod**

Run: `npx vitest run src/lib/xlsx-extract.test.ts`
Expected: PASS — 4 testy.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/xlsx-extract.ts src/lib/xlsx-extract.test.ts
git commit -m "feat(events): parsování XLS/XLSX sešitu na CSV text pro Gemini analýzu"
git push origin staging
```

---

### Task 2: `expense-file-validation.ts` — sdílená validace MIME/přípony

**Files:**
- Create: `src/lib/expense-file-validation.ts`
- Test: `src/lib/expense-file-validation.test.ts`

**Interfaces:**
- Produces: `EXPENSE_ALLOWED_MIME: Set<string>`, `EXPENSE_SPREADSHEET_MIME: Set<string>`, `isAllowedExpenseFile(mime: string, fileName?: string | null): boolean`, `isSpreadsheetFile(mime: string, fileName?: string | null): boolean` — použijí Task 3, 4, 5.

- [ ] **Step 1: Napsat padající test**

Vytvoř `src/lib/expense-file-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isAllowedExpenseFile, isSpreadsheetFile } from "./expense-file-validation";

describe("isAllowedExpenseFile", () => {
    it("povolí známé MIME typy obrázků, PDF a Excelu", () => {
        expect(isAllowedExpenseFile("image/jpeg", "ucet.jpg")).toBe(true);
        expect(isAllowedExpenseFile("application/pdf", "faktura.pdf")).toBe(true);
        expect(isAllowedExpenseFile("application/vnd.ms-excel", "faktura.xls")).toBe(true);
        expect(
            isAllowedExpenseFile(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "faktura.xlsx",
            ),
        ).toBe(true);
    });

    it("povolí XLS/XLSX i s nespolehlivým MIME, pokud přípona sedí", () => {
        expect(isAllowedExpenseFile("application/octet-stream", "faktura.xlsx")).toBe(true);
        expect(isAllowedExpenseFile("application/octet-stream", "faktura.xls")).toBe(true);
    });

    it("zamítne nesouvisející typy bez správné přípony", () => {
        expect(isAllowedExpenseFile("application/octet-stream", "dokument.docx")).toBe(false);
        expect(isAllowedExpenseFile("text/plain", "poznamka.txt")).toBe(false);
    });
});

describe("isSpreadsheetFile", () => {
    it("rozpozná spreadsheet podle MIME i podle přípony", () => {
        expect(isSpreadsheetFile("application/vnd.ms-excel", null)).toBe(true);
        expect(isSpreadsheetFile("application/octet-stream", "faktura.xlsx")).toBe(true);
        expect(isSpreadsheetFile("application/pdf", "faktura.pdf")).toBe(false);
        expect(isSpreadsheetFile("image/jpeg", "ucet.jpg")).toBe(false);
    });
});
```

- [ ] **Step 2: Spustit test, ověřit pád**

Run: `npx vitest run src/lib/expense-file-validation.test.ts`
Expected: FAIL — `Cannot find module './expense-file-validation'`.

- [ ] **Step 3: Napsat implementaci**

Vytvoř `src/lib/expense-file-validation.ts`:

```ts
const IMAGE_PDF_MIME = new Set([
    "image/jpeg", "image/png", "image/webp", "image/heic",
    "application/pdf",
]);

export const EXPENSE_SPREADSHEET_MIME = new Set([
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const EXPENSE_ALLOWED_MIME = new Set([...IMAGE_PDF_MIME, ...EXPENSE_SPREADSHEET_MIME]);

function hasSpreadsheetExtension(fileName: string | null | undefined): boolean {
    return /\.(xlsx|xls)$/i.test(fileName ?? "");
}

/** Je to spreadsheet? MIME shoda, nebo (fallback) přípona .xls/.xlsx — browser MIME bývá u Office souborů nespolehlivé. */
export function isSpreadsheetFile(mime: string, fileName?: string | null): boolean {
    return EXPENSE_SPREADSHEET_MIME.has(mime) || hasSpreadsheetExtension(fileName);
}

/** Je typ souboru povolený jako příloha nákladu (obrázek, PDF, nebo spreadsheet)? */
export function isAllowedExpenseFile(mime: string, fileName?: string | null): boolean {
    return EXPENSE_ALLOWED_MIME.has(mime) || hasSpreadsheetExtension(fileName);
}
```

- [ ] **Step 4: Spustit test, ověřit průchod**

Run: `npx vitest run src/lib/expense-file-validation.test.ts`
Expected: PASS — 5 testů.

- [ ] **Step 5: Commit**

```bash
git add src/lib/expense-file-validation.ts src/lib/expense-file-validation.test.ts
git commit -m "feat(events): sdílená validace MIME/přípony pro přílohu nákladu (obrázek/PDF/XLS)"
git push origin staging
```

---

### Task 3: Integrace do `expense-analysis.ts`

**Files:**
- Modify: `src/lib/expense-analysis.ts:1-5` (importy), `src/lib/expense-analysis.ts:95-107` (sestavení `content` pro Gemini)

**Interfaces:**
- Consumes: `extractTextFromSpreadsheet(buffer: Buffer): string` (Task 1), `isSpreadsheetFile(mime: string, fileName?: string | null): boolean` (Task 2)
- Produces: beze změny navenek — `analyzeExpenseFile(file, context)` má stejnou signaturu, jen zvládne i spreadsheet vstup. Používají ho beze změny `attach-file/route.ts`, `reanalyze/route.ts`, `/api/expenses/analyze/route.ts`.

- [ ] **Step 1: Upravit importy**

V `src/lib/expense-analysis.ts` najdi řádky 1-5:

```ts
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { expenseCategoryEnum } from "@/lib/expense-categories";
import type { ExpenseCategory } from "@/lib/expense-categories";
```

Nahraď za:

```ts
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { expenseCategoryEnum } from "@/lib/expense-categories";
import type { ExpenseCategory } from "@/lib/expense-categories";
import { isSpreadsheetFile } from "@/lib/expense-file-validation";
import { extractTextFromSpreadsheet } from "@/lib/xlsx-extract";
```

- [ ] **Step 2: Přidat větev pro spreadsheet v sestavení `content`**

Najdi (řádky 95-107):

```ts
    const { object, usage } = await generateObject({
        model: google(modelId),
        schema: resultSchema,
        messages: [{
            role: "user",
            content: [
                file.type === "application/pdf"
                    ? { type: "file"  as const, data: buffer, mediaType: "application/pdf" as const }
                    : { type: "image" as const, image: buffer, mediaType: file.type },
                { type: "text" as const, text: prompt },
            ],
        }],
    });
```

Nahraď za:

```ts
    const content = isSpreadsheetFile(file.type, file.name)
        ? [{
            type: "text" as const,
            text: `${prompt}\n\nObsah tabulky (CSV export listů sešitu):\n${extractTextFromSpreadsheet(buffer)}`,
        }]
        : [
            file.type === "application/pdf"
                ? { type: "file"  as const, data: buffer, mediaType: "application/pdf" as const }
                : { type: "image" as const, image: buffer, mediaType: file.type },
            { type: "text" as const, text: prompt },
        ];

    const { object, usage } = await generateObject({
        model: google(modelId),
        schema: resultSchema,
        messages: [{ role: "user", content }],
    });
```

- [ ] **Step 3: Typecheck a spuštění celé unit test sady**

Run: `npx tsc --noEmit`
Expected: bez chyb.

Run: `npm run test:unit`
Expected: všechny testy PASS (žádný nový test pro `analyzeExpenseFile` — Gemini volání se dle konvence projektu netestuje, viz Global Constraints).

- [ ] **Step 4: Commit**

```bash
git add src/lib/expense-analysis.ts
git commit -m "feat(events): Gemini analýza XLS/XLSX faktur přes textovou extrakci sešitu"
git push origin staging
```

---

### Task 4: `expenses/route.ts` — použít sdílenou validaci

**Files:**
- Modify: `src/app/api/events/[id]/expenses/route.ts:1-25` (importy + konstanty), `src/app/api/events/[id]/expenses/route.ts:173-176` (validace)

**Interfaces:**
- Consumes: `isAllowedExpenseFile(mime: string, fileName?: string | null): boolean` (Task 2)

- [ ] **Step 1: Přidat import, odstranit lokální `ALLOWED_MIME`**

Najdi (řádky 1-8):

```ts
import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses, events, members, people, auditLog } from "@/db/schema";
import { expenseCategoryEnum } from "@/lib/expense-categories";
import { logBlockedAttempt } from "@/lib/audit";
import { eq } from "drizzle-orm";
```

Nahraď za:

```ts
import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses, events, members, people, auditLog } from "@/db/schema";
import { expenseCategoryEnum } from "@/lib/expense-categories";
import { logBlockedAttempt } from "@/lib/audit";
import { isAllowedExpenseFile } from "@/lib/expense-file-validation";
import { eq } from "drizzle-orm";
```

Najdi (řádky 21-25):

```ts
const ALLOWED_MIME = new Set([
    "image/jpeg", "image/png", "image/webp", "image/heic",
    "application/pdf",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
```

Nahraď za:

```ts
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
```

- [ ] **Step 2: Nahradit validaci**

Najdi (řádky 173-176):

```ts
        if (file && file.size > 0) {
            if (!ALLOWED_MIME.has(file.type)) {
                return NextResponse.json({ error: "Nepodporovaný typ souboru (povoleno: PDF, JPEG, PNG, WebP, HEIC)" }, { status: 400 });
            }
```

Nahraď za:

```ts
        if (file && file.size > 0) {
            if (!isAllowedExpenseFile(file.type, file.name)) {
                return NextResponse.json({ error: "Nepodporovaný typ souboru (povoleno: PDF, JPEG, PNG, WebP, HEIC, XLS, XLSX)" }, { status: 400 });
            }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: bez chyb (ověří, že `ALLOWED_MIME` už nikde v souboru nezůstal nepoužitý/odkazovaný).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/events/[id]/expenses/route.ts"
git commit -m "feat(events): povolit XLS/XLSX při zakládání nákladu s přílohou"
git push origin staging
```

---

### Task 5: `attach-file/route.ts` — použít sdílenou validaci

**Files:**
- Modify: `src/app/api/events/[id]/expenses/[expenseId]/attach-file/route.ts:1-18` (importy + konstanty), `src/app/api/events/[id]/expenses/[expenseId]/attach-file/route.ts:79-84` (validace)

**Interfaces:**
- Consumes: `isAllowedExpenseFile(mime: string, fileName?: string | null): boolean` (Task 2)

- [ ] **Step 1: Přidat import, odstranit lokální `ALLOWED_MIME`**

Najdi (řádky 1-18):

```ts
import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses, events, auditLog } from "@/db/schema";
import { analyzeExpenseFile, ExpenseAnalysisConfigError } from "@/lib/expense-analysis";
import { isTreasurer } from "@/lib/treasurer";
import { evaluateLockedMismatchGate, analyzedMatchesAmount } from "@/lib/expense-mismatch";
import { logBlockedAttempt } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set([
    "image/jpeg", "image/png", "image/webp", "image/heic",
    "application/pdf",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
```

Nahraď za:

```ts
import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses, events, auditLog } from "@/db/schema";
import { analyzeExpenseFile, ExpenseAnalysisConfigError } from "@/lib/expense-analysis";
import { isTreasurer } from "@/lib/treasurer";
import { evaluateLockedMismatchGate, analyzedMatchesAmount } from "@/lib/expense-mismatch";
import { logBlockedAttempt } from "@/lib/audit";
import { isAllowedExpenseFile } from "@/lib/expense-file-validation";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
```

- [ ] **Step 2: Nahradit validaci**

Najdi (řádky 79-84):

```ts
        if (!ALLOWED_MIME.has(file.type)) {
            return NextResponse.json(
                { error: "Nepodporovaný typ souboru (povoleno: PDF, JPEG, PNG, WebP, HEIC)" },
                { status: 400 },
            );
        }
```

Nahraď za:

```ts
        if (!isAllowedExpenseFile(file.type, file.name)) {
            return NextResponse.json(
                { error: "Nepodporovaný typ souboru (povoleno: PDF, JPEG, PNG, WebP, HEIC, XLS, XLSX)" },
                { status: 400 },
            );
        }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: bez chyb.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/events/[id]/expenses/[expenseId]/attach-file/route.ts"
git commit -m "feat(events): povolit XLS/XLSX při výměně přílohy nákladu"
git push origin staging
```

---

### Task 6: Frontend — accept atributy a nápověda

**Files:**
- Modify: `src/app/(admin)/dashboard/events/[id]/event-expenses-tab.tsx:1055`, `:1061`, `:1333`, `:1337`

**Interfaces:**
- Žádné nové exporty — čistě UI text/atribut.

- [ ] **Step 1: Upravit accept + nápovědu u "Přiložit doklad" (zakládání nákladu)**

Najdi (řádek 1055):

```tsx
                    <p className="text-xs text-gray-400 mt-0.5">PDF nebo fotka — Gemini automaticky vyčte částku a kategorii</p>
```

Nahraď za:

```tsx
                    <p className="text-xs text-gray-400 mt-0.5">PDF, Excel nebo fotka — Gemini automaticky vyčte částku a kategorii</p>
```

Najdi (řádek 1061):

```tsx
                        <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
```

Nahraď za:

```tsx
                        <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.xls,.xlsx"
```

- [ ] **Step 2: Upravit accept + nápovědu u "Vyměnit doklad" dialogu**

Najdi (řádek 1333):

```tsx
                        <span className="text-xs text-gray-400">PDF nebo fotka, max 10 MB</span>
```

Nahraď za:

```tsx
                        <span className="text-xs text-gray-400">PDF, Excel nebo fotka, max 10 MB</span>
```

Najdi (řádek 1337):

```tsx
                            accept="image/*,application/pdf"
```

Nahraď za:

```tsx
                            accept="image/*,application/pdf,.xls,.xlsx"
```

Poznámka: inputy pro kameru/ořez/rotaci (řádky ~1067, ~2535, ~2666, `accept="image/*"` u fotoúprav) se **nemění** — jsou to čistě foto-only funkce.

- [ ] **Step 3: Lint a typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: bez chyb.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/dashboard/events/[id]/event-expenses-tab.tsx"
git commit -m "feat(events): UI pro nahrání XLS/XLSX jako přílohy nákladu"
git push origin staging
```

---

### Task 7: Manuální ověření v prohlížeči

**Files:** žádné (jen ověření chování).

Tenhle task nelze automatizovat (Gemini analýza vyžaduje `GEMINI_API_KEY` a reálné síťové volání, e2e testy tuhle cestu z principu nepokrývají — viz Global Constraints).

- [ ] **Step 1: Připravit testovací XLSX**

V Excelu/Numbers/Google Sheets vytvoř jednoduchý sešit s fakturou (dodavatel, IČO, položky, celková částka) a ulož jako `.xlsx`. Volitelně i jako starý `.xls`.

- [ ] **Step 2: Spustit dev server**

Run: `npm run dev`

Ověř, že `GEMINI_API_KEY` je nastavený v `.env.local` (jinak analýza vrátí 503 „GEMINI_API_KEY není nastaven" — očekávané chování, ne bug).

- [ ] **Step 3: Otevřít akci s náklady, přiložit XLSX**

V prohlížeči otevři libovolnou akci → záložku Náklady → tlačítko „Přiložit doklad" (nebo „Vyměnit doklad" u existujícího nákladu) → vyber testovací `.xlsx` soubor.

Ověř:
- Dialog soubor přijme (accept atribut ho nezablokuje).
- Po nahrání proběhne analýza a zobrazí se vyčtená částka/kategorie/dodavatel.
- Náhled dokladu (kliknutí na řádek nákladu) zobrazí generický fallback („Otevřít soubor" odkaz), ne rozbitý `<img>`/`<iframe>`.

- [ ] **Step 4: Ověřit `.xls` (starý binární formát), pokud je k dispozici**

Zopakuj Step 3 se souborem `.xls` — SheetJS umí číst i legacy formát, ověř že projde stejně.

- [ ] **Step 5: Ověřit chybovou hlášku u nepodporovaného typu**

Zkus nahrát `.docx` nebo `.txt` soubor přes „Vybrat soubor" (přejmenuj/oklikni dialog výběru souboru v OS, aby nabídl i jiné typy, nebo dočasně uprav accept lokálně pro test) — API má vrátit 400 s hláškou „Nepodporovaný typ souboru (povoleno: PDF, JPEG, PNG, WebP, HEIC, XLS, XLSX)".

---

## Self-Review Checklist (pro toho, kdo plán spouští)

- **Pokrytí specu:** Task 1 = extrakce CSV (sekce 2 specu), Task 2 = validace (sekce 2), Task 3 = integrace do Gemini (sekce 1, 3), Task 4+5 = oba upload endpointy (sekce 3), Task 6 = frontend (sekce 3), Task 7 = manuální ověření (sekce 6 specu — Gemini flow bez e2e). Beze změny části specu (náhled, send-vyuctovani, detect-crop/rotation, expense-mismatch, reanalyze) se v plánu nedotýkají žádného souboru — správně, žádný task pro ně není potřeba.
- **Typová konzistence:** `isAllowedExpenseFile`/`isSpreadsheetFile` mají stejný signature `(mime: string, fileName?: string | null): boolean` napříč Task 2 (definice), Task 3, 4, 5 (použití). `extractTextFromSpreadsheet(buffer: Buffer): string` konzistentní mezi Task 1 a Task 3.
- **Žádné placeholdery** — všechny kroky obsahují konkrétní kód/diff/příkaz.
