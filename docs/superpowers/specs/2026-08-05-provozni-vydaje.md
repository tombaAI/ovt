---
status: schvaleno
---

# Zadání: Provozní výdaje — vyúčtování mimo akce

> **Stav: Schváleno (2026-08-06).** Implementováno a ověřeno na staging (reálný test na akci „Oprava vleku" vč. odeslání vyúčtování e-mailem, wording mailu doladěn). Čeká na merge PR `staging → main`. Rozhodnutá varianta: provozní výdaj je technicky akce s novým typem `provozni`, navenek žije na samostatné stránce `/dashboard/provoz` viditelné **jen pro hospodáře**. Schvalovací krok odpadá (zamyká sám hospodář).

## Problém

Člen oddílu koupí věc pro provoz oddílu (např. materiál na opravu vleku) a oddíl mu ji chce proplatit přes TJ. Takový výdaj potřebuje **stejné vyúčtování jako akce** — doklad, kategorii, beneficienta, odeslání k proplacení, evidenci — ale **nemá účastníky**: nikdo se nepřihlašuje, nikomu se nic nerozpočítává ani nepředepisuje.

Dnes jediná cesta je založit fiktivní akci (na stagingu existuje akce id 48 „Oprava vleku", typ `other`, 0 přihlášek, 1 náklad). Funguje to — výpočet vyúčtování nulové účastníky ustojí (`computeUnitPrice` v `src/lib/settlement-calc.ts` vrací při nulové váze 0) a PDF vyúčtování se skládá čistě z nákladů (přihlášky vůbec nečte) — ale:

- provozní výdaj je zamíchaný mezi skutečnými akcemi v `/dashboard/events`,
- detail nabízí nesmyslné záložky (Přihlášky, Platby) a pole (registrace, záloha, dotace na člena, GCal sync).

## Rozhodnutí z brainstormingu a grilování

| Otázka | Rozhodnutí |
|---|---|
| Četnost | **Pravidelná kategorie** hospodaření oddílu (loděnice, vlek, materiál, služby). |
| Umístění v UI | **Samostatná stránka** `/dashboard/provoz` — oddělené od seznamu akcí. |
| Granularita | **Případ s více doklady** — 1 záznam = 1 účel („Oprava vleku 2026"), pod ním libovolný počet nákladů/dokladů. |
| Technické řešení | **Varianta A** — nový typ akce `provozni`, žádné nové tabulky (viz alternativy níže). |
| Přístup | **Jen hospodář** (`isTreasurer()`, env `TREASURER_EMAIL`) — pro ostatní adminy sekce úplně skrytá (nav, seznam i detail). |
| Workflow | **2 kroky: uzamknout částky → odeslat na TJ.** Souhlas hospodáře jako samostatný krok odpadá — nastaví se automaticky při zamčení. |
| Povinná pole | **Jen název.** Rok se doplní automaticky aktuální; datum, odpovědná osoba a popis volitelné. |
| Stav v seznamu | **Odvozený, 3 stavy**: rozpracováno → částky uzamčeny → odesláno na TJ. Pole `events.status` se pro provozní nepoužívá (zůstává výchozí `planned`). |

## Řešení

Celá výdajová mašinerie (náklady s doklady, Gemini analýza, zámky, odeslání na TJ, audit) visí na tabulce `events` přes `event_expenses.event_id`. Nový typ akce ji zdědí beze změn — samostatná stránka je jen jiný pohled na stejná data.

### 1. Datový model

- Do `eventTypeEnum` (`src/db/schema.ts`) přibude hodnota `provozni`.
- Migrace rozšíří CHECK constraint `event_type` (založen v `supabase/migrations/20260414_220000_events.sql`) o novou hodnotu. Žádné nové tabulky ani sloupce.

### 2. Nová stránka `/dashboard/provoz`

- Položka **„Provoz"** v hlavní navigaci — vykreslí se jen hospodáři; stránka i detail provozního výdaje ostatní adminy přesměrují na dashboard.
- Nadpis stránky „Provozní výdaje". **Jeden seznam bez záložek po letech** (objem bude malý, rok není pro členění relevantní), řazený od nejnovějšího: název, datum, odpovědná osoba, počet dokladů, suma nákladů, odvozený stav.
- Odvození stavu: `billingStatus = 'draft'` → **rozpracováno**; `'prescribed'` bez záznamu v `event_vyuctovani_sends` → **částky uzamčeny**; se záznamem → **odesláno na TJ**.
- Tlačítko **„Nový provozní výdaj"** — povinný jen název; rok se nastaví automaticky na aktuální; datum, odpovědná osoba (`leader_id`) a popis volitelné. Vytvoří `events` řádek s `event_type = 'provozni'`.

### 3. Seznam akcí `/dashboard/events` a dashboard

- Dotazy seznamu akcí (`getEvents` a spol. v `src/lib/actions/events.ts`) typ `provozni` vyfiltrují.
- Počty akcí na dashboard home (`src/app/(admin)/dashboard/page.tsx`) typ `provozni` také vynechají.
- Typ `provozni` se nenabízí při zakládání běžné akce (add-event-sheet).

### 4. Detail — recyklace stávajícího detailu akce

URL detailu zůstává `/dashboard/events/[id]` (jedna route, žádná duplikace komponent). Pro `event_type = 'provozni'` se detail přizpůsobí:

- **Přístup**: ne-hospodář je přesměrován na dashboard (stejný gate jako seznam).
- **Skryté záložky**: Přihlášky, Vyúčtování i Platby — záložka Vyúčtování je čistě participantská (rozpočítávání nákladů na účastníky) a tlačítka výdajové strany (zámek částek, PDF, odeslání na TJ) žijí v záložce Náklady.
- **Skrytá pole**: registrace od/do, záloha, dotace na člena, GCal sync, zámek pro účastníky, typ akce, stav akce.
- **Skryté participantské exporty**: pivník, seznam účastníků.
- **Zůstává**: Detail (název, datum, odpovědná osoba, popis), Náklady, Audit.
- **Zpětný odkaz / breadcrumb** vede na `/dashboard/provoz`; popisky mluví o „provozním výdaji", ne o „akci".

### 5. Workflow vyúčtování — 2 kroky

1. **„Uzamknout částky"** — stávající `lockBilling` (s 0 přihláškami projde: gate kontroluje jen nevyřešené zálohy a koeficienty, obojí prázdné; vygeneruje 0 předpisů, přepne `billingStatus` na `prescribed`). U typu `provozni` navíc **automaticky nastaví `treasurerApproved = true`** včetně zápisu do `event_treasurer_approval_log` — zamyká sám hospodář, samostatné schvalování je zbytečné. Mail i audit tak zůstanou konzistentní.
2. **„Odeslat vyúčtování na TJ"** — stávající route `POST /api/events/[id]/send-vyuctovani` **beze změny**: vyžaduje `prescribed` + `treasurerApproved` + ≥1 potvrzený doklad s vyplněnou částkou, účelem, příjemcem a bankovním účtem. Příjemce mailu: vedoucí (odpovědná osoba) a/nebo env `EMAIL_HOSPODAR_ODDILU_TJB` — stačí jeden z nich.

Tlačítka „Uzamknout částky"/„Odemknout částky" jsou v záložce Náklady (záložka Platby s původním zámkem je u provozního skrytá); odemčení automaticky odvolá souhlas hospodáře.

### 6. Guardraily

- Provozní výdaj nikdy nevzniká z GCal/kanoe RSS synchronizace (jen ručně).
- Veřejný registrační formulář se pro typ `provozni` nenabízí ani nesmí přijmout přihlášku.

### 7. Testy

- E2E smoke test stránky `/dashboard/provoz` (vykreslení, založení záznamu, gate pro ne-hospodáře) — vyžaduje nastavení `TREASURER_EMAIL` v testovacím prostředí.
- Filtr kalendáře pokrývá E2E asercí (DB dotaz nejde unit-testovat); unit test má čistý modul `deriveProvozniStav` (`src/lib/provoz-status.test.ts`).
- Výpočty ve `settlement-calc.ts` se nemění — stávající testy stačí.

### 8. Data — staging akce 48

Po nasazení se akci 48 „Oprava vleku" na stagingu přepne `event_type` na `provozni` (jedním SQL updatem na staging DB) — zmizí ze seznamu akcí a objeví se v Provozu. V produkci žádná taková data zatím nejsou.

## Mimo rozsah (vědomě)

- **Stav „proplaceno od TJ"** — v systému dnes neexistuje ani u akcí; případná vazba na import financí TJ je otevřená otázka lifecycle specu (`2026-06-15-zivotni-cyklus-akce.md`, otázka 5). Až vznikne, provozní výdaje ji zdědí zdarma.
- Oprávnění na úrovni server actions — gate je na úrovni stránek a navigace, admini jsou důvěryhodní (konzistentní se zbytkem aplikace).

## Zamítnuté alternativy

- **B. Samostatná entita (nové tabulky)** — čistší doménový model, ale `event_expenses.event_id` je NOT NULL FK na `events`; musela by se duplikovat nebo polymorfizovat celá výdajová větev včetně zámků a analýzy dokladů. Hodně práce za nulový funkční přínos.
- **C. Nechat jako běžnou akci typu `other`** — funguje už dnes, ale trvale míchá provozní výdaje mezi akce a nabízí nesmyslné UI.
- **Zkrácení workflow na 1 krok / vynechání zámku** — route odeslání by se musela měnit a ztratil by se explicitní okamžik „částky zmrazeny"; dva kroky hospodáře nezatíží.
- **Read-only viditelnost pro ostatní adminy** — zamítnuto, sekce je čistě hospodářská agenda.
