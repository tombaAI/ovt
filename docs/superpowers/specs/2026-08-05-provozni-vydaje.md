---
status: navrh
---

# Zadání: Provozní výdaje — vyúčtování mimo akce

> **Stav: Návrh schválený v brainstormingu (2026-08-05).** Rozhodnutá varianta: provozní výdaj je technicky akce s novým typem `provozni`, navenek žije na samostatné stránce `/dashboard/provoz`. Čeká na implementační plán.

## Problém

Člen oddílu koupí věc pro provoz oddílu (např. materiál na opravu vleku) a oddíl mu ji chce proplatit přes TJ. Takový výdaj potřebuje **stejné vyúčtování jako akce** — doklad, kategorii, beneficienta, souhlas hospodáře, odeslání k proplacení, evidenci proplacení — ale **nemá účastníky**: nikdo se nepřihlašuje, nikomu se nic nerozpočítává ani nepředepisuje.

Dnes jediná cesta je založit fiktivní akci (na stagingu existuje akce id 48 „Oprava vleku", typ `other`, 0 přihlášek, 1 náklad). Funguje to — výpočet vyúčtování nulové účastníky ustojí (`computeUnitPrice` v `src/lib/settlement-calc.ts` vrací při nulové váze 0, nic se nerozpočítává) — ale:

- provozní výdaj je zamíchaný mezi skutečnými akcemi v `/dashboard/events`,
- detail nabízí nesmyslné záložky (Přihlášky, Platby) a pole (registrace, záloha, dotace na člena, GCal sync).

## Rozhodnutí z brainstormingu

| Otázka | Rozhodnutí |
|---|---|
| Četnost | **Pravidelná kategorie** hospodaření oddílu (loděnice, vlek, materiál, služby) — ne jednorázová výjimka. |
| Umístění v UI | **Samostatná stránka** — provozní výdaje se oddělí od seznamu akcí. |
| Granularita | **Případ s více doklady** — 1 záznam = 1 účel („Oprava vleku 2026"), pod ním libovolný počet nákladů/dokladů; vyúčtování a souhlas hospodáře nad celým případem najednou. |
| Technické řešení | **Varianta A** — nový typ akce `provozni`, žádné nové tabulky (viz alternativy níže). |

## Řešení (varianta A)

Celá výdajová mašinerie (náklady s doklady, Gemini analýza, zámky, souhlas hospodáře, proplacení od TJ, audit) visí na tabulce `events` přes `event_expenses.event_id`. Nový typ akce ji zdědí beze změn — samostatná stránka je jen jiný pohled na stejná data.

### 1. Datový model

- Do `eventTypeEnum` (`src/db/schema.ts`) přibude hodnota `provozni`.
- Migrace rozšíří CHECK constraint `event_type` (založen v `supabase/migrations/20260414_220000_events.sql`) o novou hodnotu. Žádné nové tabulky ani sloupce.

### 2. Nová stránka `/dashboard/provoz`

- Položka **„Provoz"** v hlavní navigaci admin layoutu.
- Seznam provozních výdajů po letech (stejný vzor `?year=X` jako akce): název, datum, odpovědná osoba, počet dokladů, suma nákladů, stav (rozpracováno / schváleno hospodářem / odesláno k proplacení).
- Tlačítko **„Nový provozní výdaj"** — formulář jen s poli: název, rok, datum, odpovědná osoba (`leader_id`), popis. Vytvoří `events` řádek s `event_type = 'provozni'`.

### 3. Seznam akcí `/dashboard/events`

- Dotaz seznamu (`getEvents` a spol. v `src/lib/actions/events.ts`) typ `provozni` vyfiltruje — provozní výdaje žijí jen na své stránce.
- Typ `provozni` se nenabízí při zakládání běžné akce (add-event-sheet).

### 4. Detail — recyklace stávajícího detailu akce

URL detailu zůstává `/dashboard/events/[id]` (jedna route, žádná duplikace komponent). Pro `event_type = 'provozni'` se detail přizpůsobí:

- **Skryté záložky**: Přihlášky, Platby.
- **Skrytá pole**: registrace od/do, záloha, dotace na člena, GCal sync, zámek pro účastníky (`lockForParticipants`).
- **Zůstává**: Detail (název, datum, odpovědná osoba, popis), Náklady (beze změn vč. Gemini analýzy), Vyúčtování — jen výdajová strana (souhrn dokladů, souhlas hospodáře, proplacení), Audit.
- **Zpětný odkaz / breadcrumb** vede na `/dashboard/provoz` místo na seznam akcí.
- Popisky v UI mluví o „provozním výdaji", ne o „akci" (název stránky, nadpisy, tlačítka).

### 5. Workflow vyúčtování — beze změn

Souhlas hospodáře (`treasurerApproved`), zámek dokladů pro proplacení (`lockForReimbursement`) i evidence odeslání k proplacení fungují nad náklady nezávisle na účastnících. Participantská větev (předpisy, rozpočítání, zálohy) se u provozního výdaje vůbec neuplatní — žádné přihlášky neexistují.

### 6. Guardraily

- Provozní výdaj nikdy nevzniká z GCal/kanoe RSS synchronizace (jen ručně).
- Veřejný registrační formulář se pro typ `provozni` nenabízí ani nesmí přijmout přihlášku.

### 7. Testy

- E2E smoke test stránky `/dashboard/provoz` (vykreslení, založení záznamu).
- Unit test filtru seznamu akcí (typ `provozni` se v seznamu akcí neobjeví).
- Výpočty ve `settlement-calc.ts` se nemění — stávající testy stačí.

### 8. Data — staging akce 48

Po nasazení se akci 48 „Oprava vleku" na stagingu přepne `event_type` na `provozni` (v UI detailu, případně jedním SQL updatem na staging DB) — zmizí ze seznamu akcí a objeví se v Provozu. V produkci žádná taková data zatím nejsou.

## Zamítnuté alternativy

- **B. Samostatná entita (nové tabulky)** — čistší doménový model, ale `event_expenses.event_id` je NOT NULL FK na `events`; musela by se duplikovat nebo polymorfizovat celá výdajová větev včetně zámků, schvalování a analýzy dokladů. Hodně práce za nulový funkční přínos.
- **C. Nechat jako běžnou akci typu `other`** — funguje už dnes, ale trvale míchá provozní výdaje mezi akce a nabízí nesmyslné UI; uživatelem zamítnuto volbou samostatné stránky.
