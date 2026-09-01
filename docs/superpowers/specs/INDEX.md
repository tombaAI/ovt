# Index zadání

Přehled stavu všech zadávacích a design dokumentů, soustředěných v `docs/superpowers/specs/`. Udržuj aktuální při každé změně stavu — je to jediné místo, kde je vidět, co je hotovo, co běží a co čeká.

Historické setup/infra dokumenty a datové podklady (bez lifecycle stavu) zůstávají ve `zadani/` — viz poslední sekce tohoto indexu.

## Konvence pojmenování

Aktivní zadání mají název `YYYY-MM-DD-slug.md`, kde datum je den vzniku zadání (ne poslední úpravy — tu ukazuje `git log`). Nové zadání založ rovnou s datem v názvu.

## Životní cyklus zadání

| Stav (frontmatter) | Význam |
|---|---|
| `navrh` | Nápad zapsán, ještě neprošel grilováním. Může se ještě zásadně změnit. |
| `zgrilovano` | Prošlo grilling session (`superpowers:grilling`) — zadání je finální a kvalitní pro samostatný vývoj. |
| `implementace` | Vývoj běží, rozsah je hotový jen částečně. |
| `staging-uat` | Implementace hotová (celá nebo dohodnutý rozsah), nasazená na `staging`, čeká na ruční ověření a schválení uživatelem. |
| `schvaleno` | UAT prošlo, čeká se jen na merge `staging → main`. |
| `produkce` | Nasazeno v produkci (`main`). Případně `produkce (částečně)`, pokud je hotová jen část zadání — viz poznámka u konkrétního dokumentu. |

Každý dokument má stav ve frontmatteru (`status:`) a jednořádkové shrnutí v blockquote hned pod nadpisem — tenhle index je jen agregovaný pohled, důvěryhodný zdroj je vždy ten konkrétní soubor + git log.

## Aktivní zadání

| Soubor | Téma | Stav |
|---|---|---|
| [2026-04-10-rekonciliace-plateb-v1.md](2026-04-10-rekonciliace-plateb-v1.md) | Ledger V1 — párování plateb, auto-match, split | `produkce` |
| [2026-04-23-ux-redesign-v1.md](2026-04-23-ux-redesign-v1.md) | Detail stránky místo Sheetů, URL filtry, back-stack | `produkce (částečně)` — Členové/Předpisy/Platby hotovo, Lodě/Brigády/Akce nezahájeno |
| [2026-06-15-zivotni-cyklus-akce.md](2026-06-15-zivotni-cyklus-akce.md) | Zastřešující zadání životního cyklu akce | `produkce (částečně)` — rozpad viz níže, zbytek „Nová funkce" nezahájen |
| [2026-06-15-zivotni-cyklus-akce-technicke-poznamky.md](2026-06-15-zivotni-cyklus-akce-technicke-poznamky.md) | Technický rozpis k životnímu cyklu akce | technický podklad, částečně naplněný |
| [2026-06-15-zamknout-predpisy.md](2026-06-15-zamknout-predpisy.md) | Dva zámky nákladů (participants/reimbursement) | `produkce` |
| [2026-06-15-zapocitani-zalohy.md](2026-06-15-zapocitani-zalohy.md) | Příslib zálohy / nebude platit | `produkce` |
| [2026-06-15-faktura-bez-dokladu.md](2026-06-15-faktura-bez-dokladu.md) | Náklad bez souboru, dodatečné přiložení | `produkce` (rozšíření viz design dokument níže) |
| [2026-06-15-propadla-zaloha.md](2026-06-15-propadla-zaloha.md) | Propadlá záloha při odhlášení účastníka | `produkce` |
| [2026-06-24-vypocet-nakladu-akce.md](2026-06-24-vypocet-nakladu-akce.md) | Kanonický algoritmus výpočtu nákladů/doplatku | `produkce` |
| [2026-07-04-audit-akce-mezery.md](2026-07-04-audit-akce-mezery.md) | Doplnění chybějících audit-log zápisů | `produkce` — commit `f28f062`, viz ADR-0002 |
| [2026-07-04-automaticky-import-vysledovky.md](2026-07-04-automaticky-import-vysledovky.md) | Automatický import PDF výsledovky z Gmailu | `navrh` |
| [2026-07-06-automaticke-testy.md](2026-07-06-automaticke-testy.md) | Vitest unit + Playwright E2E smoke testy | `produkce` — commit `d222eba` |
| [2026-07-08-dotace-prevysujici-naklady.md](2026-07-08-dotace-prevysujici-naklady.md) | Dotace vyšší než náklad člena — nevyužitá část propadá | `navrh` — **pozastaveno**, čeká na prerekvizitu níže; rozhodnuto: varianta B (water-filling) |
| [2026-07-23-integracni-test-gemini-analyzy.md](2026-07-23-integracni-test-gemini-analyzy.md) | Integrační test Gemini analýzy dokladů (vzorové JPG/PDF/XLS) | `produkce` — PR #33 |
| [2026-07-23-vylepseni-popisu-prijemce.md](2026-07-23-vylepseni-popisu-prijemce.md) | Návrh lepšího popisu/příjemce faktury podle analýzy dokladu (výměna/re-analýza) | `produkce` — PR #32 |
| [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md) | Obecný mechanismus návrh/potvrzení pro změnu částky už vygenerovaného předpisu | `zgrilovano` — realizace na `feat/2026-08-03-schvalovani-zmeny-castky-predpisu`, prerekvizita pro dotaci výše |
| [2026-08-03-zaloha-nesedi-po-zmene-poctu-osob.md](2026-08-03-zaloha-nesedi-po-zmene-poctu-osob.md) | Záloha se nepřepočte při změně počtu osob na přihlášce po jejím vzniku | `navrh` — jen zapsáno, k dořešení |
| [2026-08-03-prihlasky-zavod-cpv.md](2026-08-03-prihlasky-zavod-cpv.md) | Online přihlašování na pořádaný závod ČPV (podzim 2026) — veřejný formulář, předpisy „H”, platby, změny, vratky | `navrh` — obohaceno o rešerši pravidel ČPV 2026, čeká na grilování + dekompozici |
| [2026-08-05-provozni-vydaje.md](2026-08-05-provozni-vydaje.md) | Provozní výdaje mimo akce (oprava vleku apod.) — typ akce `provozni` + samostatná stránka `/dashboard/provoz` jen pro hospodáře | `schvaleno` — ověřeno na staging, čeká na merge PR do `main` |
| [2026-08-31-provozni-vydaje-vice-oddilu.md](2026-08-31-provozni-vydaje-vice-oddilu.md) | Provozní výdaje pro druhý oddíl (TOM) — vlastní hospodář, kód oddílu, příjemce mailu na TJ | `implementace` — větev `feat/2026-08-31-provozni-vydaje-druhy-oddil` |

## Navazující design dokumenty (`docs/`)

Design dokumenty a ADR vznikají z grilling session nad zadáním a popisují finální technické řešení — nejsou duplicitou zadání, ale jeho dopracováním.

| Dokument | Navazuje na | Stav |
|---|---|---|
| [`2026-07-04-invoice-attachment-replace-design.md`](2026-07-04-invoice-attachment-replace-design.md) | [2026-06-15-faktura-bez-dokladu.md](2026-06-15-faktura-bez-dokladu.md) | `produkce` — výměna přílohy, kontrola shody částky, hospodářské potvrzení neshody (commity `44d8503`…`3c60af0`) |
| [`docs/adr/0001-analyzed-amount-historical-backfill.md`](../../adr/0001-analyzed-amount-historical-backfill.md) | invoice-attachment-replace-design | `superseded` — nahrazeno reálným re-analýza backfillem místo odhadu |
| [`docs/adr/0002-event-audit-log-scope-and-reconstructability.md`](../../adr/0002-event-audit-log-scope-and-reconstructability.md) | [2026-07-04-audit-akce-mezery.md](2026-07-04-audit-akce-mezery.md) | implementováno (`f28f062`), `produkce` |
| [`docs/TESTING.md`](../../TESTING.md) | [2026-07-06-automaticke-testy.md](2026-07-06-automaticke-testy.md) | průvodce realizací — jak testy spouštět, validovat a rozšiřovat (vč. receptu na E2E průchod akcí) |

## Roadmap — co je rozdělané

**Čeká na UAT/schválení a merge do produkce** (na stagingu, funkčně hotovo):

1. Provozní výdaje mimo akce (`2026-08-05-provozni-vydaje.md`) — ověřeno na staging, schváleno, PR `staging → main` otevřený

**V realizaci:**
2. Schvalování změny částky předpisu — obecný mechanismus (`2026-08-03-schvalovani-zmeny-castky-predpisu.md`), zgrilováno, vývoj na `feat/2026-08-03-schvalovani-zmeny-castky-predpisu`; **blokuje** položku 3 backlogu níže

**Backlog — návrh, implementace nezahájena:**
3. Dotace převyšující náklad člena (`2026-07-08-dotace-prevysujici-naklady.md`) — pozastaveno, čeká na položku 2 výše
4. Automatický import výsledovky z Gmailu (`2026-07-04-automaticky-import-vysledovky.md`)
5. UX redesign — Lodě, Brigády, Akce (zbytek `2026-04-23-ux-redesign-v1.md`)
6. Životní cyklus akce — konfigurátor otázek přihlášky, EUR náklady, ubytovací/pojistný přehled, pozvánka mailem, uzavření akce (zbytek `2026-06-15-zivotni-cyklus-akce.md`)
7. Ad-hoc TODO z `todo_next_steps.txt` (validace odeslání mailu bez dokladu, cc organizátorovi/hospodáři, odebrat generování čestného/dopravy)
8. Záloha nesedí po změně počtu osob na přihlášce (`2026-08-03-zaloha-nesedi-po-zmene-poctu-osob.md`) — jen zapsáno, k dořešení
9. Online přihlašování na závod ČPV podzim 2026 (`2026-08-03-prihlasky-zavod-cpv.md`) — velký celek (první veřejná část systému), čeká na grilování a dekompozici; termínově vázáno na závod (deadline změn 27. 9. 2026)

## Ostatní dokumenty — zůstávají ve `zadani/`

Nemají vlastní lifecycle stav (nejsou to funkční zadání ke sledování) — na rozdíl od
aktivních zadání a design dokumentů výše, tyhle **nebyly** přesunuty do
`docs/superpowers/specs/` a dál žijí v `zadani/` v kořeni repa:

- `zadani/popis_zadani_1.txt` — hlavní produktová specifikace, dávno realizována.
- `zadani/UCK01_zadani.txt`, `zadani/vyuctovani_akce_zadani.txt`, `zadani/todo_next_steps.txt` — starší ad-hoc poznámky a TODO, ne formální zadání.
- `zadani/prvni_deploy_web_databaze_bez_emailu.md`, `zadani/revize_prvni_etapy_rozpoctu_a_rls.md`, `zadani/setup_od_nuly_vercel_supabase_resend.md`, `zadani/technicka_oponentura_vercel_supabase_resend.md`, `zadani/zadavaci_dokumentace_ovt_web.md` — historické setup/infra dokumenty z počáteční fáze projektu, dávno hotovo.
- `zadani/*.xlsx`, `zadani/*.csv`, `zadani/loginy_a_pristupy.txt`, `zadani/ovtbohemians_dns.txt` — datové podklady, ne zadání.
