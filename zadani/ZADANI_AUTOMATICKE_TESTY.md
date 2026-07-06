# Zadání: Automatické testy (unit + UI/E2E)

Cíl: po **každé úpravě kódu** automaticky ověřit, že aplikace funguje — algoritmicky (výpočty, data) i z pohledu UI (stránky se vykreslí, klíčové toky fungují). Dosud existovala jen statická kontrola (ESLint + `tsc --noEmit` v pre-commit) a ruční ověřování na stagingu; regrese typu issue #28 (dvojí započtení propadlé zálohy) se odhalily až v datech.

---

## Strategie: tři vrstvy

| Vrstva | Nástroj | Co chrání | Kdy běží |
|---|---|---|---|
| 1. Statická | ESLint + `tsc --noEmit` | typy, syntax, konvence | pre-commit + CI |
| 2. Unit (výpočty) | **Vitest** | algoritmy vyúčtování, kontroly shody částek, čisté utility | pre-commit + CI |
| 3. UI/E2E smoke | **Playwright** | stránky se vykreslí, auth funguje, data tečou z DB do UI | CI (staging push + PR do main) |

Princip pyramidy: co nejvíc logiky pokrýt rychlými unit testy čistých funkcí; E2E vrstva je tenká — ověřuje, že se aplikace „neslepila", ne každý detail chování.

### Proč Vitest (a ne Jest)

- Nativní TypeScript + ESM bez transformační konfigurace, sdílí resolver s Vite ekosystémem.
- Rychlý start (~1 s) → snese se v pre-commit hooku, kde už běží lint + tsc.
- API kompatibilní s Jest (`describe/it/expect`) — žádná nová kognitivní zátěž.

### Proč Playwright (a ne Cypress)

- Oficiální GHA podpora, headless Chromium v CI bez dalších služeb.
- `webServer` config umí sám postavit a spustit Next.js aplikaci.
- Auth se řeší jednorázově v setup projektu (storage state), testy pak běží přihlášené.

---

## Vrstva 2 — Unit testy výpočtů

### Pravidlo: výpočty patří do čistých modulů

Testovatelné jsou jen funkce **bez závislosti na DB/Next.js**. Server actions v `src/lib/actions/` data načtou, adaptují a **volají čisté funkce** z `src/lib/` — výpočet se nikdy neprovádí inline v akci. Tento pattern už kodifikoval `src/lib/settlement-calc.ts` (extrakce algoritmu z `ZADANI_VYPOCET_NAKLADU_AKCE.md`); tímto zadáním se stává závazným pro novou výpočetní logiku.

### Rozsah v1

1. **`settlement-calc.ts`** — kanonický algoritmus vyúčtování akce, kroky 1–8:
   - klíče účastníků (`p{id}` / `r{regId}-{idx}`, fallback dle `personsCount`, odhlášení)
   - váhy pro všechny tři `allocationMethod` včetně fallbacků (chybějící koeficient = 0, žádné alokace = rovnoměrně)
   - propadlá záloha (`forfeit_to_expense`, refund, nikdy pod nulu) — regrese issue #28
   - dotace: `Math.floor` na člena už v kroku 6 (regrese fixu 66ab632), nečlen bez dotace
   - **jediné zaokrouhlení nahoru** v kroku 7 (`ceilMoney`, tolerance 1e-9), doplatek přihlášky = součet už zaokrouhlených částek účastníků (krok 8)
   - efektivní záloha (matched/paid → `matchedAmount`, promise → `amount`, jinak 0)
2. **`expense-mismatch.ts`** — shoda částky nákladu s analyzovaným dokladem, gate při zamčeném vyúčtování.
3. Drobné utility průběžně (`boats-utils`, `content-disposition`, …) — přidávat test spolu s každou opravou chyby (regresní test je povinná součást bugfixu).

**Součást realizace v1:** `event-settlement.ts` se refaktoruje tak, aby čisté funkce ze `settlement-calc.ts` skutečně volal (dosud šlo o nezapojený duplikát, který už stihl driftovat — dotace floor). Jinak by testy hlídaly mrtvý kód.

### Mimo rozsah v1 (budoucí rozšíření)

- **Integrační testy server actions** proti testovací DB (Postgres v Dockeru + `drizzle-kit push` + seed) — hlídaly by adaptaci DB → čisté funkce, audit log a revalidace. Odloženo: vyžaduje lokální Docker.
- **Extrakce auto-matcheru** (`reconciliation.ts`, ~1000 řádků) do čistého modulu + testy párování VS/částek — samostatný úkol, refaktor kritického kódu.
- **Komponentové testy** (Testing Library + jsdom) — až pokud se objeví regrese v chování klientských komponent, které E2E smoke nechytí.

### Konvence

- Test soubor vedle testovaného modulu: `src/lib/foo.ts` → `src/lib/foo.test.ts`.
- Testy pojmenovávat česky podle chování („propadlá záloha se odečte jen jednou"), ne podle názvu funkce.
- Žádné mocky DB — pokud test potřebuje mock DB, patří logika do čistého modulu.

---

## Vrstva 3 — UI/E2E smoke testy

### Autentizace v testech

Aplikace má jen Google OAuth — v testech se **nepřihlašuje přes Google**. Auth.js v5 používá JWT session; setup projekt Playwrightu vygeneruje platný session token (`encode` z `next-auth/jwt` se stejným `AUTH_SECRET`, salt = název cookie `authjs.session-token`) a uloží ho jako storage state. Kontrola `admin_users` běží jen v `signIn` callbacku (při loginu), middleware i server actions pouze dekódují JWT — podvržená cookie tedy plně stačí. Testovací e-mail se přesto seeduje do `admin_users`, aby odpovídal realitě.

### Testovací databáze

E2E nikdy neběží proti staging/produkční DB. CI si zvedne **Postgres service container**, schéma postaví **přehráním všech migrací** ze `supabase/migrations/` (stejný mechanismus jako produkce — zároveň průběžně ověřuje, že migrace jdou aplikovat od nuly) a data vloží idempotentní seed (`e2e/seed.mjs`): admin user, členové, `contribution_periods` + předpisy. Lokálně totéž proti libovolnému disposable Postgresu (Docker/Neon branch) — postup v `e2e/README.md`.

### Rozsah v1 (smoke)

1. Nepřihlášený uživatel: `/dashboard` přesměruje na `/login`; login stránka se vykreslí.
2. Přihlášený: `/dashboard`, `/dashboard/members`, `/dashboard/contributions`, `/dashboard/payments`, `/dashboard/events`, `/dashboard/boats` se vykreslí bez chyby a ukážou seedovaná data (ne prázdný stav, ne error boundary).
3. Datový tok: otevření detailu člena (sheet) zobrazí seedované hodnoty.

Rozšiřovat o interakční testy (zápis) postupně — vždy když se v ruční kontrole na stagingu něco rozbije, přibude E2E test, který by to byl chytil.

---

## Spouštění

| Příkaz | Co dělá |
|---|---|
| `npm test` / `npm run test:unit` | Vitest, jednorázově |
| `npm run test:watch` | Vitest ve watch módu při vývoji |
| `npm run test:e2e` | Playwright (vyžaduje `DATABASE_URL` na testovací DB + `AUTH_SECRET`) |

- **Pre-commit** (husky): `lint && tsc --noEmit && test:unit` — každý commit má zelené typy i výpočty.
- **CI** (`.github/workflows/tests.yml`): na push do `staging` a PR do `main` běží job `unit` (lint + tsc + Vitest) a job `e2e` (Postgres service → přehrání migrací → seed → `next build` + `next start` → Playwright). PR do `main` se nemerguje s červenými testy.
- E2E v CI používá dummy env (`AUTH_GOOGLE_ID` apod.) — Google OAuth ani Resend se nevolají (`RESEND_API_KEY` nenastaven = mail disabled mód), `FIO_API_TOKEN` nenastaven = žádná banka.

## Definice hotovo pro budoucí úpravy

1. Nová výpočetní logika = čistý modul + unit testy (červené testy blokují commit).
2. Bugfix výpočtu = nejdřív regresní test, který chybu reprodukuje, pak fix.
3. Nová stránka/klíčový tok = smoke test do `e2e/`.
4. PR do `main` vyžaduje zelený `tests.yml`.
