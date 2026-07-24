# Integrační test Gemini analýzy dokladů — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat samostatnou integrační testovou vrstvu, která nad 5 reálnými vzorovými doklady (JPG/PDF/XLS) zavolá skutečné Gemini API přes `analyzeExpenseFile()` a ověří, že vrací správnou částku, účetní kód a správně identifikuje i známý rozpor (cizí měna vs. schválená CZK částka) — bez zásahu do dosavadní rychlé Vitest/Playwright vrstvy.

**Architecture:** Samostatný Vitest runner (`vitest.gemini.config.ts`) mimo `src/**`, který dynamicky projde (glob) páry `soubor` + `soubor.expected.json` v `e2e/fixtures/gemini-samples/`, zavolá `analyzeExpenseFile()` přímo (žádný běžící Next server) a porovná výsledek s `expected.json` — včetně cross-checku přes existující čistou funkci `hasAmountMismatch()`. Samostatný GitHub Actions workflow (`gemini-integration-test.yml`), oddělený od `tests.yml`, spouštěný na PR (feature→staging i staging→main) + `workflow_dispatch`.

**Tech Stack:** Next.js 15, TypeScript, Vitest (druhá konfigurace), GitHub Actions.

## Global Constraints

- Testovací soubor **mimo `src/`** (`e2e/gemini/expense-analysis.integration.test.ts`) — nesmí ho zachytit `vitest.config.ts` (`include: ["src/**/*.test.ts"]`), tedy ani pre-commit hook (`npm run test:unit`).
- **Nesmí ho zachytit ani Playwright** — `playwright.config.ts` má `testDir: "./e2e"` a Playwright výchozí `testMatch` (`**/*.@(spec|test).?(c|m)[jt]s?(x)`) matchuje i `*.test.ts`, takže bez explicitního `testIgnore` by se pokusil spustit i tenhle Vitest soubor a rozbil `npm run test:e2e`.
- Chybějící/nefunkční `GEMINI_API_KEY` = test **musí spadnout** (ne tiše přeskočit) — `analyzeExpenseFile()` už dnes vyhazuje `ExpenseAnalysisConfigError`, když klíč chybí, takže žádná speciální guard logika v testu není potřeba.
- `total_amount` výchozí tolerance **0 Kč** (přesná shoda), volitelné `amountTolerance` v konkrétním `expected.json`. `account_code` vždy přesná shoda.
- Sidecar `expected.json` obsahuje i `approvedAmount` — test musí přes `hasAmountMismatch()` (z `src/lib/expense-mismatch.ts`, beze změny) ověřit, že se identifikace rozporu shoduje s tím, co plyne z `approvedAmount` vs. `total_amount` v sidecaru.
- Sidecar smí obsahovat **volitelné** pole `payee_name` (`string | null`) — exact-match assert, jen pokud je v `expected.json` přítomné (`"payee_name" in expected`), jinak se nekontroluje. Doplněno 2026-07-24: po nasazení `feat/2026-07-23-vylepseni-popisu-prijemce` na staging přestal být `analysis.payee_name` jen tiché interní pole a je aktivně zobrazený v UI (`PayeeComparison`), viz spec.
- Žádný hardcoded seznam vzorků v testovacím kódu — vždy dynamický glob adresáře.
- `GEMINI_API_KEY` jako GitHub Actions **repo secret** — nepřidávat do `.env.local`.
- Nový workflow `gemini-integration-test.yml` je **oddělený** od `tests.yml` (jiný status check, jiná kategorie testu).
- Pre-commit hook (`npm run lint && npx tsc --noEmit && npm run test:unit`) musí zůstat zelený po každém tasku — `tsc --noEmit` type-checkuje **celý projekt** včetně `e2e/**` (`tsconfig.json` má `include: ["**/*.ts", ...]`), takže i nový testovací soubor musí projít strict-mode typovou kontrolou.
- Komitovat na větev `feat/2026-07-23-integracni-test-gemini-analyzy` (feature větev ze `staging`, ne přímo na `staging`), push po každém tasku.
- Commit message styl repozitáře: `feat(gemini-test): <česky, věcně>` / `ci(gemini-test): <česky, věcně>`.
- Reference spec: `docs/superpowers/specs/2026-07-23-integracni-test-gemini-analyzy.md`.
- Fixtures (5 souborů + `expected.json`) už existují v `e2e/fixtures/gemini-samples/` (commitnuty v `b2efcff` na feature větvi) — tenhle plán je nevytváří, jen nad nimi staví testovací infrastrukturu.

---

### Task 1: Gemini integrační test — runner, config, fixture loader

**Files:**
- Create: `vitest.gemini.config.ts`
- Modify: `package.json` (přidat script `test:gemini`)
- Create: `e2e/gemini/expense-analysis.integration.test.ts`
- Modify: `playwright.config.ts` (vyloučit `e2e/gemini/**` z Playwright collection)

**Interfaces:**
- Consumes: `analyzeExpenseFile(file: File, context?: { user?: string | null; source?: string }): Promise<ExpenseAnalysis>` z `src/lib/expense-analysis.ts` (existuje, beze změny). `ExpenseAnalysis.total_amount: number | null`, `.account_code: ExpenseCategory | null`. `hasAmountMismatch(amount, analyzedAmount): boolean` z `src/lib/expense-mismatch.ts` (existuje, beze změny). `ExpenseCategory` type z `src/lib/expense-categories.ts` (existuje, beze změny).
- Produces: npm script `test:gemini` (spouští `vitest.gemini.config.ts`) — použije Task 2 (GH Actions workflow).

- [ ] **Step 1: Vytvořit `vitest.gemini.config.ts`**

```ts
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Integrační test Gemini analýzy dokladů — reálné síťové volání (Gemini API), cena,
// samostatný běh oddělený od pre-commit/unit vrstvy. Nikdy nespouštět jako součást
// npm run test:unit. Viz docs/superpowers/specs/2026-07-23-integracni-test-gemini-analyzy.md.
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: "node",
        include: ["e2e/gemini/**/*.test.ts"],
        testTimeout: 60_000,
    },
});
```

- [ ] **Step 2: Přidat npm script**

V `package.json` v sekci `scripts`, hned za `"test:e2e": "playwright test",`:

```json
    "test:e2e": "playwright test",
    "test:gemini": "vitest run --config vitest.gemini.config.ts",
```

- [ ] **Step 3: Vyloučit `e2e/gemini/**` z Playwright collection**

V `playwright.config.ts` přidat `testIgnore` do `defineConfig({...})`, hned za `testDir: "./e2e",`:

```ts
export default defineConfig({
    testDir: "./e2e",
    // Vitest integrační test (ne Playwright) — Playwright výchozí testMatch matchuje
    // i *.test.ts, bez týhle výjimky by se ho pokusil spustit a spadl by.
    testIgnore: "**/gemini/**",
    fullyParallel: true,
```

- [ ] **Step 4: Vytvořit `e2e/gemini/expense-analysis.integration.test.ts`**

```ts
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeExpenseFile } from "@/lib/expense-analysis";
import { hasAmountMismatch } from "@/lib/expense-mismatch";
import type { ExpenseCategory } from "@/lib/expense-categories";

// Integrační test nad reálnými vzorovými doklady — volá skutečné Gemini API.
// Viz docs/superpowers/specs/2026-07-23-integracni-test-gemini-analyzy.md.
//
// Chybějící GEMINI_API_KEY se NEpřeskakuje potichu: analyzeExpenseFile() sama vyhodí
// ExpenseAnalysisConfigError, test tedy spadne se srozumitelnou chybou — to je záměr.

const FIXTURES_DIR = join(__dirname, "..", "fixtures", "gemini-samples");

const MIME_BY_EXTENSION: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

type ExpectedSample = {
    total_amount: number;
    account_code: ExpenseCategory;
    approvedAmount: number;
    amountTolerance?: number;
    // Volitelné — jen když je v sidecaru přítomné (`"payee_name" in expected.json`).
    // Vynechané u vzorků, kde je hlavička/patička dokladu nejednoznačná (víc věrohodných
    // variant názvu dodavatele) — viz vzorek "Kemp" v e2e/fixtures/gemini-samples/.
    payee_name?: string | null;
};

type Sample = {
    fileName: string;
    filePath: string;
    mime: string;
    expected: ExpectedSample;
};

function loadSamples(): Sample[] {
    const entries = readdirSync(FIXTURES_DIR);
    const sampleFileNames = entries.filter((name) => !name.endsWith(".expected.json"));

    return sampleFileNames.map((fileName) => {
        const filePath = join(FIXTURES_DIR, fileName);
        const expectedPath = `${filePath}.expected.json`;
        const expected = JSON.parse(readFileSync(expectedPath, "utf-8")) as ExpectedSample;

        const ext = extname(fileName).toLowerCase();
        const mime = MIME_BY_EXTENSION[ext];
        if (!mime) {
            throw new Error(`Neznámá přípona vzorku "${fileName}" — doplň MIME_BY_EXTENSION v testu.`);
        }

        return { fileName, filePath, mime, expected };
    });
}

describe("Gemini analýza reálných vzorových dokladů", () => {
    const samples = loadSamples();

    it("najde alespoň jeden pár vzorek + expected.json", () => {
        expect(samples.length).toBeGreaterThan(0);
    });

    it.each(samples)("$fileName", async ({ fileName, filePath, mime, expected }) => {
        const buffer = readFileSync(filePath);
        const file = new File([buffer], fileName, { type: mime });

        const result = await analyzeExpenseFile(file, { source: "integration-test" });

        expect(result.account_code).toBe(expected.account_code);

        if (result.total_amount === null) {
            throw new Error(`Gemini nevrátil total_amount pro ${fileName}`);
        }
        const tolerance = expected.amountTolerance ?? 0;
        expect(Math.abs(result.total_amount - expected.total_amount)).toBeLessThanOrEqual(tolerance);

        // Cross-check identifikace rozporu: co plyne z approvedAmount vs. total_amount
        // v sidecaru, musí odpovídat tomu, co hasAmountMismatch() vrátí nad reálným
        // výsledkem Gemini analýzy (viz vzorek "Kemp" — vědomý mismatch kvůli cizí měně).
        const expectMismatch = hasAmountMismatch(expected.approvedAmount, expected.total_amount);
        expect(hasAmountMismatch(expected.approvedAmount, result.total_amount)).toBe(expectMismatch);

        // payee_name je volitelný — jen když je v sidecaru výslovně přítomný (i jako
        // null, viz vzorky "účtenka"/"čestné prohlášení" — Gemini tam podle promptu
        // musí vrátit null, ne si vymyslet jméno z merchant pole).
        if (expected.payee_name !== undefined) {
            expect(result.payee_name).toBe(expected.payee_name);
        }
    });
});
```

- [ ] **Step 5: Spustit lokálně a ověřit očekávané (loud) selhání bez `GEMINI_API_KEY`**

Run: `npm run test:gemini`

Expected: 5 testů (`$fileName` pro každý vzorek) **FAIL**, každý s chybou `GEMINI_API_KEY není nastaven` (`ExpenseAnalysisConfigError`) — ne "file not found", ne timeout, ne chyba importu. Test `"najde alespoň jeden pár vzorek + expected.json"` **PASS** (potvrzuje, že glob najde všech 5 fixtures správně). Tohle je očekávaný stav bez API klíče (viz Global Constraints) — potvrzuje, že se soubory správně načetly, aliasy (`@/lib/...`) fungují a `analyzeExpenseFile()` se opravdu zavolal.

- [ ] **Step 6: Ověřit, že Playwright soubor ignoruje**

Run: `npx playwright test --list`

Expected: ve výpisu je `smoke.spec.ts` (a `auth.setup.ts`), **žádná zmínka o `gemini`** ani o `expense-analysis.integration.test.ts`.

- [ ] **Step 7: Typová kontrola celého projektu**

Run: `npx tsc --noEmit`

Expected: bez chyb (nový testovací soubor je ve strict módu, `tsconfig.json` ho zahrnuje přes `include: ["**/*.ts", ...]`).

- [ ] **Step 8: Lint**

Run: `npm run lint`

Expected: `No ESLint warnings or errors`.

- [ ] **Step 9: Commit**

```bash
git add vitest.gemini.config.ts package.json playwright.config.ts e2e/gemini/expense-analysis.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(gemini-test): přidat integrační test Gemini analýzy nad vzorovými doklady

Samostatný Vitest runner (vitest.gemini.config.ts, npm run test:gemini) mimo
src/**, dynamicky prochází e2e/fixtures/gemini-samples/ a volá analyzeExpenseFile()
přímo. Playwright testIgnore přidán, ať nezkouší spustit tenhle Vitest soubor.
EOF
)"
git push
```

---

### Task 2: `tests.yml` — spustit CI i na PR feature větev → `staging`

**Files:**
- Modify: `.github/workflows/tests.yml`

**Interfaces:**
- Consumes: nic z Task 1.
- Produces: nic, co by další task konzumoval — samostatná infra změna.

- [ ] **Step 1: Přidat `pull_request: branches: [staging]`**

V `.github/workflows/tests.yml` nahradit blok `on:`:

```yaml
on:
  push:
    branches: [staging]
  pull_request:
    branches: [main]
```

za:

```yaml
on:
  push:
    branches: [staging]
  pull_request:
    branches: [staging, main]
```

- [ ] **Step 2: Validovat YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/tests.yml'))" && echo OK`

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/tests.yml
git commit -m "$(cat <<'EOF'
ci(gemini-test): spustit Tests workflow i na PR feature větev → staging

Dosud běžel jen na push do staging a PR do main — PR ze samostatné feature
větve (nový dev flow, viz CLAUDE.md) by CI vůbec nespustilo.
EOF
)"
git push
```

---

### Task 3: Nový workflow `gemini-integration-test.yml`

**Files:**
- Create: `.github/workflows/gemini-integration-test.yml`

**Interfaces:**
- Consumes: npm script `test:gemini` z Task 1.
- Produces: nic, co by další task konzumoval.

- [ ] **Step 1: Vytvořit workflow soubor**

```yaml
# Integrační test Gemini analýzy dokladů — reálné volání AI nad vzorovými soubory
# z e2e/fixtures/gemini-samples/. Oddělený od tests.yml: síťové volání, cena,
# potenciální AI nekonzistence — nesdílí status check s lint/unit/e2e.
# Chybějící/nefunkční GEMINI_API_KEY = fail, žádné tiché přeskočení (viz
# docs/superpowers/specs/2026-07-23-integracni-test-gemini-analyzy.md).
name: Gemini integration test

on:
  pull_request:
    branches: [staging, main]
  workflow_dispatch:

jobs:
  gemini:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test:gemini
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

- [ ] **Step 2: Validovat YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/gemini-integration-test.yml'))" && echo OK`

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/gemini-integration-test.yml
git commit -m "$(cat <<'EOF'
ci(gemini-test): přidat samostatný workflow pro Gemini integrační test

Trigger: PR do staging i main + workflow_dispatch. Oddělený od tests.yml —
jiná kategorie testu (síťové volání, cena), nesdílí status check.
EOF
)"
git push
```

- [ ] **Step 4: (Ruční krok mimo agenta) Přidat `GEMINI_API_KEY` jako GitHub repo secret**

V GitHub repu **Settings → Secrets and variables → Actions → New repository secret**,
název `GEMINI_API_KEY`, hodnota = platný Gemini API klíč. Tohle musí provést uživatel
s admin právy na repu — agent nemá přístup ke GitHub Secrets UI ani `gh secret set`
právům bez explicitního svolení.

- [ ] **Step 5: (Ruční krok mimo agenta) Ověřit reálný zelený běh**

Po přidání secretu spustit workflow ručně (GitHub UI → Actions → "Gemini integration
test" → "Run workflow", nebo `gh workflow run gemini-integration-test.yml`) a potvrdit,
že všech 5 testů projde **PASS** proti reálnému Gemini API — teprve tohle je důkaz, že
`expected.json` hodnoty (vč. vzorku "Kemp" s očekávaným mismatchem) sedí na živé API,
ne jen že se test spustí. Bez tohohle kroku zůstává první reálný běh na první ostré PR.

---

### Task 4: Dokumentace — `docs/TESTING.md` a `CLAUDE.md`

**Files:**
- Modify: `docs/TESTING.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nic (čistě dokumentační task).
- Produces: nic.

- [ ] **Step 1: `docs/TESTING.md` — rozšířit mapu souborů (§2)**

Za blok `.github/workflows/tests.yml    # CI: job unit + job e2e` přidat:

```
vitest.gemini.config.ts        # konfigurace Gemini integračního testu (samostatný include)
e2e/
  gemini/
    expense-analysis.integration.test.ts   # volá analyzeExpenseFile() nad reálnými vzorky
  fixtures/gemini-samples/     # vzorové doklady (JPG/PDF/XLS) + <soubor>.expected.json
.github/workflows/gemini-integration-test.yml   # CI: PR do staging/main + workflow_dispatch
```

- [ ] **Step 2: `docs/TESTING.md` — rozšířit tabulku spouštění (§3)**

Za řádek `| npx playwright test --ui | E2E s interaktivním UI (debugování) | totéž |` přidat:

```
| `npm run test:gemini` | Integrační test Gemini analýzy nad reálnými doklady | `GEMINI_API_KEY` (bez něj vždy FAIL, ne skip) |
```

- [ ] **Step 3: `docs/TESTING.md` — nová recepce §6.6**

Za sekci `### 6.5 Další vrstvy (roadmapa, zatím nezahájeno)` přidat:

```markdown
### 6.6 Gemini integrační test — přidání nového vzorku

Zadání: `docs/superpowers/specs/2026-07-23-integracni-test-gemini-analyzy.md`.

Přidání nového vzorového dokladu (edge-case, nová kategorie apod.) = 2 nové soubory
do `e2e/fixtures/gemini-samples/`, **bez úpravy testovacího kódu** (dynamický glob):

1. Soubor dokladu (JPG/PNG/PDF/XLS/XLSX) — reálný, ne uměle jednoduchý.
2. `<soubor>.expected.json`:
   ```json
   { "total_amount": 1234.50, "account_code": "518/009", "approvedAmount": 1234.50 }
   ```
   `approvedAmount` != `total_amount` jen když je vzorek záměrně vybraný na testování
   rozporu (např. zahraniční doklad v cizí měně) — jinak stejná hodnota jako
   `total_amount`. Volitelné `amountTolerance`, pokud je u vzorku znám důvod k odchylce
   od přesné shody.

Kontrola citlivých dat (jméno/adresa člena na dokladu) před commitem je na tom, kdo
vzorek přidává — mimo rozsah automatizace.

Lokální běh bez `GEMINI_API_KEY` vždy selže (`ExpenseAnalysisConfigError`) — to je
očekávané, ne bug; reálné ověření běží v CI (`gemini-integration-test.yml`) s
nastaveným secretem.
```

- [ ] **Step 4: `CLAUDE.md` — přidat příkaz do sekce Commands**

Za řádek `npm run test:e2e     # Playwright smoke testy (vyžaduje testovací DB — viz e2e/README.md)` přidat:

```
npm run test:gemini  # integrační test Gemini analýzy dokladů (vyžaduje GEMINI_API_KEY, jinak vždy FAIL)
```

- [ ] **Step 5: `CLAUDE.md` — přidat řádek do tabulky GitHub Actions workflows**

Upravit řádek `tests.yml` a přidat nový řádek pro `gemini-integration-test.yml`:

```markdown
| Workflow | Trigger | Co dělá |
|---|---|---|
| `tests.yml` | Push do `staging`, PR do `staging`/`main` | Unit (lint + tsc + Vitest) a E2E (Playwright + Postgres service) |
| `gemini-integration-test.yml` | PR do `staging`/`main` + manuálně | Integrační test Gemini analýzy nad vzorovými doklady (`test:gemini`), vyžaduje `GEMINI_API_KEY` secret |
| `db-backup.yml` | Každý den 02:00 UTC + manuálně | `pg_dump` → GitHub Artifact, retence 90 dní |
| `db-migrate.yml` | Push do `main` (jen pokud přibyly `.sql` soubory) | Spustí nové migrace z `supabase/migrations/` přes `psql` |
| `import-members-tj.yml` | `repository_dispatch` | Webhook pro import členů TJ |
```

- [ ] **Step 6: Commit**

```bash
git add docs/TESTING.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(gemini-test): zdokumentovat integrační test v TESTING.md a CLAUDE.md

Mapa souborů, příkaz test:gemini, recept na přidání nového vzorku, nový
workflow v tabulce GitHub Actions.
EOF
)"
git push
```

---

## Self-Review

**Pokrytí zadání** (`docs/superpowers/specs/2026-07-23-integracni-test-gemini-analyzy.md`):
- Bod 1 (test runner, umístění mimo `src/`, žádný Next server): Task 1 ✅
- Bod 2 (trigger PR na staging+main, samostatný workflow): Task 3 ✅
- Bod 3 (chybějící klíč = fail): Task 1 Step 5 ověřuje ✅ (žádný extra kód potřeba)
- Bod 4 (assert styl vč. `approvedAmount` + `hasAmountMismatch`, volitelný `payee_name`): Task 1 Step 4 ✅
- Bod 5 (dynamický glob, žádný hardcoded seznam): Task 1 Step 4 (`loadSamples()`) ✅
- Bod 6 (`tests.yml` PR do staging): Task 2 ✅
- Bod 7 (struktura složek): Task 1 vytváří přesně tuhle strukturu ✅
- Bod 8 (5 konkrétních vzorků + `payee_name` u 4 z nich): fixtures už existují v repu (commit `b2efcff`, `payee_name` doplněn 2026-07-24 po vizuální kontrole obsahu dokladů), plán je nevytváří znovu — poznámka v Global Constraints ✅

**Riziko navíc odhalené při psaní plánu** (nebylo v zadání): Playwright výchozí `testMatch` by bez `testIgnore` zkusil spustit nový Vitest soubor a rozbil `npm run test:e2e` — ošetřeno v Task 1 Step 3+6.

**Dodatek 2026-07-24** (po nasazení `feat/2026-07-23-vylepseni-popisu-prijemce` na
staging): `payee_name` doplněn do 4 z 5 `expected.json` na základě přímé vizuální
kontroly obsahu dokladu (ne odhadu z názvu souboru) — `null` u samo-označených
"účtenka"/"čestné prohlášení" dokladů, konkrétní jméno jen u `zahranicni-zajezd-isel-bus.xls`
(jednoznačný jednořádkový dodavatel v hlavičce faktury). Vzorek "Kemp" (Isel) zůstává
bez `payee_name` — je to sice taky faktura (RECHNUNG), ale hlavička/patička nabízí dvě
věrohodné varianty názvu dodavatele, exact-match by tam byl křehký na hádání, ne na
reálné regresi.
