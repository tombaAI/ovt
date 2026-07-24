---
status: zgrilovano
---

# Zadání: Integrační test Gemini analýzy dokladů (vzorové JPG/PDF/XLS)

> **Stav: Zgrilováno.** Zapsáno z rozhovoru o mezerách v testovací pyramidě po zavedení
> XLS/XLSX podpory (viz [`docs/superpowers/specs/2026-07-22-xlsx-invoice-support-design.md`](../docs/superpowers/specs/2026-07-22-xlsx-invoice-support-design.md)).
> Grilling dokončen 2026-07-23 včetně dohledání a stažení 5 reálných vzorových dokladů.
> Tohle zadání je zároveň první zkušební běh nového postupu vývoje přes samostatnou
> feature větev — viz `CLAUDE.md`, sekce „Superpowers vývoj (feature branch)".

## Cíl

`analyzeExpenseFile()` (jádro Gemini analýzy dokladů — vyčítá částku, kategorii, dodavatele
z účtenky/faktury) nemá dnes žádné automatické pokrytí, protože volá reálné externí API a
dosavadní testovací filosofie (viz [`2026-07-06-automaticke-testy.md`](2026-07-06-automaticke-testy.md))
pokrývá jen čisté funkce bez síťových volání. Cíl: přidat nízkonákladovou, záměrně
oddělenou vrstvu testů, která nad malou sadou vzorových dokladů (JPG, PDF, XLS/XLSX) ověří,
že Gemini analýza reálně vrátí smysluplný výsledek — chrání to celý pipeline včetně nové
XLSX větve (CSV extrakce → textový prompt), ne jen validaci/parsing bez volání AI.

## Kontext

- Existující Vitest vrstva testuje jen čisté výpočty (`settlement-calc.ts`,
  `expense-mismatch.ts`, `xlsx-extract.ts`, `expense-file-validation.ts`) — žádný dosavadní
  test reálně nezavolal Gemini.
- Lokálně nemá smysl mít `GEMINI_API_KEY` nastavený — chybí plné prostupy/setup pro reálné
  ověřování, staging prostředí je pro tohle vyladěné a funkční.
- Reálné volání AI stojí (byť nízkou) cenu a je to jiná kategorie testu než dosavadní rychlý
  Vitest/Playwright smoke — nemá jít do stejného pre-commit/každý-push cyklu.

## Rozsah

1. Malá sada vzorových dokladů — JPG, PDF, XLS/XLSX — **ne triviální/uměle jednoduché**,
   ale reálně reprezentativní (faktura s více položkami, různé kategorie apod.). Soubory
   vybere/dodá uživatel; umístění např. `e2e/fixtures/gemini-samples/`.
2. Pro každý vzorek zavolat `analyzeExpenseFile()` a ověřit rozumný výsledek — buď
   tolerance-based kontrola (`total_amount` není `null`, `account_code` je z číselníku), nebo
   pokud uživatel ke vzorku dodá i očekávanou správnou hodnotu, přímé porovnání.
3. Trigger: **ne** na každý push/PR (síťové volání + cena). Kandidáti k rozhodnutí při
   grilování: `workflow_dispatch` (ruční spuštění), nebo gate jen na PR **do `staging`**
   (viz bod 5), podmíněné existencí `GEMINI_API_KEY` v GH Actions secrets.
4. `GEMINI_API_KEY` jako GitHub Actions secret (repo/environment) — **jen pro tuhle úlohu**,
   nepřidávat do `.env.local`.
5. Vedlejší úkol v rámci realizace: rozšířit `.github/workflows/tests.yml` o
   `pull_request: branches: [staging]` — dnes CI běží jen na push do `staging` a PR do
   `main`, takže PR ze samostatné feature větve do `staging` by dnes vůbec nespustilo CI.

## Rozhodnuto při grillingu (2026-07-23)

1. **Test runner:** samostatný `vitest.gemini.config.ts` (kopie `vitest.config.ts` s jiným
   `include`) + nový npm script `test:gemini`. Testovací soubor mimo `src/` (`e2e/gemini/
   expense-analysis.integration.test.ts`), takže ho `npm run test:unit`/pre-commit hook
   nikdy nenajde a nespustí. Vitest řeší TS + `@/lib/...` aliasy zdarma přes existující
   `vite-tsconfig-paths` plugin — `analyzeExpenseFile()` se importuje a volá přímo, žádný
   běžící Next server (na rozdíl od `scripts/pdf-smoke-test.mjs`, který testuje HTTP
   endpointy).
2. **Trigger:** **ne** jen `workflow_dispatch` — uživatel chce reálný gate na **každý PR**
   (feature→staging i staging→main). Samostatný nový workflow soubor
   `.github/workflows/gemini-integration-test.yml`, oddělený od `tests.yml` (jiná kategorie
   testu — síťové volání, cena, potenciální AI nekonzistence — nemá sdílet status check
   s lint/unit/e2e). `on: pull_request: branches: [staging, main]` + `workflow_dispatch`
   pro ruční spuštění.
3. **Chybějící/nefunkční `GEMINI_API_KEY`:** vždy blokující (fail), žádné tiché
   přeskočení checku. Vědomé rozhodnutí uživatele — jednodušší pravidlo než "skip pokud
   chybí secret", i za cenu rizika že výpadek/expirace klíče zablokuje merge, dokud to
   někdo neopraví.
4. **Assert styl:** u každého vzorku **povinný** sidecar `<soubor>.expected.json` s
   `{ total_amount, account_code, approvedAmount, amountTolerance? }` (žádný "jen
   tolerance-based" fallback). `account_code`: přesná shoda. `total_amount`: výchozí
   tolerance **0 Kč** (přesná shoda) — Gemini má z tištěného dokladu vyčíst přesnou
   částku tak, jak je na něm napsaná (ne po měnovém přepočtu), neshoda i o pár korun je
   reálná regrese. Volitelné pole `amountTolerance` v konkrétním `expected.json`, pokud
   je u vzorku znám důvod k odchylce.
   `approvedAmount` = schválená/zapsaná částka nákladu (`event_expenses.amount`) — test
   navíc volá čistou funkci `hasAmountMismatch(approvedAmount, result.total_amount)` z
   `expense-mismatch.ts` a ověří, že vyjde `true`/`false` přesně podle toho, jestli se
   `approvedAmount` liší od `expected.total_amount` v sidecaru. Díky tomu test neověřuje
   jen syrový výstup Gemini analýzy, ale i navazující identifikaci rozporu — reálný
   scénář zahraniční akce, kde doklad je v cizí měně a schválená částka je po přepočtu
   (viz vzorek "Kemp" níže), musí projít jako **očekávaný, ne jako chyba testu**.
5. **Dynamické vyhledávání vzorků:** test **negenerativně** prochází (glob) všechny páry
   `soubor` + `soubor.expected.json` v `e2e/fixtures/gemini-samples/` — žádný hardcoded
   seznam v testovacím kódu. Přidání nového vzorku (edge-case) = jen 2 nové soubory do
   složky, bez úpravy test souboru.
6. **`tests.yml` (vedlejší úkol, bod 5 rozsahu):** přidat `pull_request: branches:
   [staging]` vedle stávajícího `push: branches: [staging]` a `pull_request: branches:
   [main]` — beze změny jobů `unit`/`e2e`. Nutné, aby PR z feature větve do `staging`
   (nový dev flow z CLAUDE.md) vůbec spustilo lint/tsc/Vitest/Playwright.
7. **Struktura složek:**
   ```
   e2e/fixtures/gemini-samples/    # vzorové doklady + <name>.expected.json
   e2e/gemini/                     # samotný Vitest test
   vitest.gemini.config.ts
   ```
   Kontrolu citlivých dat na vzorcích (jméno/adresa člena na dokladu) provádí uživatel
   před commitem — mimo rozsah automatizace.
8. **Konkrétní vzorové doklady (dohledáno přes Neon MCP, staging DB, 2026-07-23):** 5
   reálných `event_expenses` záznamů, `status: final` (lidská revize = důvěryhodná ground
   truth), pokrývající 2 účetní kategorie a všechny 3 typy souborů:

   | Soubor | Akce / doklad | `account_code` | Poznámka |
   |---|---|---|---|
   | `zahranicni-zajezd-isel-bus.xls` | *Zahraniční zájezd - Isel* — "Bus" | 518/009 | |
   | `zahranicni-zajezd-isel-kemp.jpg` | *Zahraniční zájezd - Isel* — "Kemp" | 518/009 | **záměrný mismatch** — viz níže |
   | `berounka-platba-za-kemp.jpg` | *Berounka* — "Platba za kemp" | 518/009 | |
   | `berounka-preprava-batohu.jpg` | *Berounka* — "Přeprava batohů Praha-Skryje, Roztoky a zpět, os. autem s vlekem" | 518/009 | |
   | `roztoky-u-krivoklatu-pronajem-usd.pdf` | *Roztoky u Křivoklátu* — "Pronájem USD" | 518/001 | 5. vzorek doplněný při grillingu za chybějící PDF |

   Akce u prvních dvou dokladů byla v původním zadání uvedená jako *Zahraniční voda* —
   ten záznam v `event_expenses` ale žádné náklady nemá; doklady "Bus"/"Kemp" reálně
   patří k akci *Zahraniční zájezd - Isel* (opraveno v tabulce výše).

   **Doklad "Kemp" je záměrně vybraný jako testovací případ na neshodu částky:** jde o
   zahraniční akci, doklad je v cizí měně, Gemini z něj vždy vyčte částku tak, jak je
   napsaná na dokladu (950,40), zatímco `event_expenses.amount` (23670,66) je až lidský
   přepočet do CZK. Tenhle rozdíl je hospodářem odsouhlasený
   (`mismatch_acknowledged_by/at`), ne bug. `expected.json` proto obsahuje
   `total_amount: 950.40` (co má Gemini reálně vrátit) + `approvedAmount: 23670.66`, a
   test musí ověřit, že `hasAmountMismatch()` na týhle dvojici vrátí `true` — cíleně
   testuje reálný flow identifikace rozporu, ne jen "šťastnou cestu" shody.

   Soubory stažené a uložené do `e2e/fixtures/gemini-samples/` jako binární fixtures
   (committnuté do repa) — `file_url` ve Vercel Blob je **privátní**
   (`*.private.blob.vercel-storage.com`, přímý přístup 403 bez tokenu), stažení proběhlo
   přes existující autentizovaný proxy route `/api/blob-file?url=...`
   (`src/app/api/blob-file/route.ts`) na staging URL, přihlášený v prohlížeči. Tohle je
   jednorázová operace při tvorbě fixtures, ne součást CI běhu testu — CI čte soubory
   přímo z repa, žádný přístup k blob storage za běhu nepotřebuje.

## Mimo rozsah

- Rozšíření o `BLOB_READ_WRITE_TOKEN`/upload flow — to zůstává ověřováno jen na staging
  preview, viz `CLAUDE.md`.
- Testování promptu/kategorizačních pravidel samotných (doména promptu v
  `expense-analysis.ts`, ne testovací infrastruktury).
