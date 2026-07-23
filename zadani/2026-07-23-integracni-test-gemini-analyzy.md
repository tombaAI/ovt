---
status: navrh
---

# Zadání: Integrační test Gemini analýzy dokladů (vzorové JPG/PDF/XLS)

> **Stav: Návrh.** Zapsáno z rozhovoru o mezerách v testovací pyramidě po zavedení XLS/XLSX
> podpory (viz [`docs/superpowers/specs/2026-07-22-xlsx-invoice-support-design.md`](../docs/superpowers/specs/2026-07-22-xlsx-invoice-support-design.md)).
> Neprošlo grilováním, rozsah se ještě může měnit. Tohle zadání je zároveň první zkušební
> běh nového postupu vývoje přes samostatnou feature větev — viz `CLAUDE.md`, sekce
> „Superpowers vývoj (feature branch)".

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

## Rozsah (návrh)

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

## Otevřené otázky (k doladění při grilování)

- Konkrétní vzorové soubory a jejich očekávané hodnoty — dodá uživatel.
- Tolerance-based vs. exact-match styl assertů.
- Přesný trigger (`workflow_dispatch` vs. PR-do-staging gate vs. obojí).
- Kam v repu commitovat vzorové doklady a jestli neobsahují citlivá data (testovací vzorky
  by neměly, ale ověřit před commitem).

## Mimo rozsah

- Rozšíření o `BLOB_READ_WRITE_TOKEN`/upload flow — to zůstává ověřováno jen na staging
  preview, viz `CLAUDE.md`.
- Testování promptu/kategorizačních pravidel samotných (doména promptu v
  `expense-analysis.ts`, ne testovací infrastruktury).
