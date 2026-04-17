# Rekonciliace plateb — revize konceptu a návrh architektury

Datum: 2026-04-10
Stav: **Pracovní dokument — v řešení**

---

## 0. Kde dnes jsme a co je pravda

| Tabulka | Zdroj dat | Autorita | Stav |
|---|---|---|---|
| `app.bank_transactions` | Import z Fio API | **Zdrojová pravda pro přijaté platby** | Produkční, zachovat |
| `app.contribution_periods` + `app.member_contributions` | Ruční správa, import | **Zdrojová pravda pro to, co je dluženo** | Produkční, zachovat |
| `app.payments` | Starší import nižší kvality + hotovost | Přechodná, neúplná | **Postupně vyřadit; nahradit novou architekturou** |

Příchozí platby z banky = co skutečně přišlo.
Předpisy (member_contributions.amount_total) = co bylo vyúčtováno.
Tabulka `payments` je dnes most mezi těmito dvěma pravdami, ale most z nekvalitních dat. Cíl: most přebudovat, starý po migraci zavřít.

---

## 1. Zdrojové kanály plateb (nová architektura)

### 1.1 Elektronické platby — import z bankovního výpisu
Dnešní kanál: Fio API (`bank_transactions`).
Budoucí rozšíření: import výpisu z libovolného účtu přes importní profil (viz sekce 3).

Klíčové vlastnosti:
- Idempotentní upsert přes `fio_id` (nebo ekvivalentní unikátní identifikátor pro jiné banky).
- Transakce nikdy nesmí být smazána ani editována; jsou read-only zdroj.
- Po importu je každá příchozí transakce ve stavu `unmatched`.

### 1.2 Hotovostní platba — ruční zadání
Případ: člen zaplatí hotově na schůzi, na akci apod.
Zásadní rozdíl oproti bankovní: neexistuje „zdrojová transakce" v bance — hotovostní platba je rovnou finální záznam.
Architektura: admin zadá hotovostní platbu přímo v šuplíku předpisu nebo v rekonciliačním rozhraní; nevzniká žádný staging záznam, rovnou se tvoří alokace k předmětu platby.

### 1.3 Platby z jiných zdrojů — budoucí
Příklad: eventové platby přes jinou platformu, platba převodem z jiného účtu BÚ.
Přístup: totožný profil jako bankovní import (viz sekce 3), ale s jiným formátem souboru nebo API.

---

## 2. Předmět platby — obecný koncept

Platba v novém modelu není vázána výhradně na příspěvkový předpis. Předmět platby (dále „závazkový řádek") je obecná entita:

| Druh | Příklad | Zdroj |
|---|---|---|
| Příspěvkový předpis | Roční příspěvek 2025 — Marek H. | `member_contributions` |
| Servisní platba / událost | Záloha na kroužek, vstupné | budoucí tabulka `service_charges` |
| Materiál / zboží | Větrkovka z hromadné objednávky | budoucí tabulka `material_charges` |

**V1** pracuje pouze s příspěvkovými předpisy (`member_contributions`). Architektura alokační vrstvy musí být ale navržena tak, aby závazkový řádek bylo možné adresovat z jiné tabulky bez přepisování párování.

Doporučení: závazkový řádek modelovat přes polymorfní referenci (`charge_type: 'contribution' | 'service' | 'material'`, `charge_id: int`), nebo přes sdílenou rodičovskou tabulku `app.charges` s jednotným `id`. Pro V1 je polymorfní reference jednodušší.

---

## 3. Import bankovního výpisu — profil pro více zdrojů

Vzor: existující mechanismus import profilů pro CSV členů je vhodný základ. Liší se v tomto:

| Aspekt | Člen CSV import | Bankovní výpis import |
|---|---|---|
| Cíl | Tabulka `members` | Tabulka `bank_transactions` (staging) |
| Klíč pro upsert | CSK číslo / jméno | Unikátní ID transakce ze souboru |
| Formát | Volný CSV | Strukturovaný (sloupce pevně daného výpisu) |
| Párování sloupců | Klíčové (různé zdroje, různé názvy) | Potřebné — různé banky mají různé výstupy |
| Sync profil | Ano | **Ano — pro pravidelný re-import a upsert** |

### Nová tabulka: `bank_import_profiles`
Sloupcová sada: název profilu, poznámka, formát souboru (csv/xlsx), kódování, oddělovač, index řádku s hlavičkou, mapování sloupců (JSONB), sloupec pro unikátní klíč transakce (pro upsert), sloupec pro datum transakce, sloupec pro částku, sloupec pro VS, volitelně protistrana / zpráva / typ pohybu.

Workflow importu bankovního výpisu:
1. Upload souboru → detekce kódování a parsování záhlaví.
2. Automatické mapování sloupců podle profilu (nebo manuální pro nový profil).
3. Preview: zobrazení prvních N řádků se zpracovanými hodnotami.
4. Uložit profil (nebo aktualizovat existující).
5. Spustit import → upsert do `bank_transactions` + záznam do `bank_import_history`.
6. Po importu spustit algoritmus návrhů párování (stejný jako pro Fio).

Fio API zůstává jako automatizovaný kanál (cron). Profil pro výpis je paralelní manuální kanál.

---

## 4. Datový model rekonciliační vrstvy

Základní idea: **importovaná bankovní transakce nikdy nepřechází na předpis přímo**. Přechod probíhá přes alokační záznam, který je explicitní, auditovatelný a reverzibilní.

### Entitní přehled

```
bank_transactions         (read-only po importu)
        │
        ▼
payment_allocations       (hlavní rekonciliační tabulka)
    │         │
    │    split_lines       (pokud je transakce rozdělena mezi více záv. řádků)
    │         │
    └─────────┤
              ▼
    contrib_id / charge_id (závazkový řádek)
```

### Tabulka `app.payment_allocations`

Nahrazuje `bank_transaction_matches` z původního návrhu, ale obecnější:

| Sloupec | Typ | Popis |
|---|---|---|
| `id` | serial PK | |
| `source_type` | text | `bank_tx` / `cash` / `other` |
| `bank_tx_id` | int FK nullable | vyplněno pro elektronické platby |
| `amount` | int not null | celková částka alokace (= tx.amount nebo dílčí část) |
| `currency` | text default 'CZK' | |
| `paid_at` | date not null | datum platby (z banky nebo zadané ručně) |
| `status` | text | viz stavový automat níže |
| `source_confirmed_by` | text | kdo potvrdil zdroj platby |
| `note` | text | volitelné |
| `created_by` | text not null | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### Tabulka `app.payment_allocation_lines`

Jeden záznam = jedna část platby → jeden závazkový řádek.

| Sloupec | Typ | Popis |
|---|---|---|
| `id` | serial PK | |
| `allocation_id` | int FK | |
| `charge_type` | text | `contribution` (dnes), rozšiřitelné |
| `charge_id` | int | ID z příslušné charge tabulky (dnes `member_contributions.id`) |
| `member_id` | int FK | denormalizace pro rychlé dotazy |
| `allocated_amount` | int not null | |
| `allocation_order` | smallint default 1 | pro zobrazení v UI |
| `created_by` | text | |
| `created_at` | timestamptz | |

### Invariant
`SUM(lines.allocated_amount) = allocation.amount` pro každou confirmedAlokaci.

### Vztah ke staré tabulce `payments`

Stávající `app.payments` zůstane do migrace dat. Po skončení migrace bude nahrazena kombinací `payment_allocations` + `payment_allocation_lines`. Stávající záznamy v `payments` se migrují takto:
- `payments` → `payment_allocations` (source_type='cash' pokud nemají bank_tx, jinak 'bank_tx')
- `payments.contribId` → `payment_allocation_lines` (charge_type='contribution', charge_id=contribId)

---

## 5. Stavy alokace — stavový automat

```
UNMATCHED ──→ SUGGESTED ──→ CONFIRMED ──→ (konečný stav)
    │              │
    │              └──→ REJECTED ──→ UNMATCHED (vrácení)
    │
    └──→ IGNORED (s povinnou poznámkou)
    │
    └──→ SPLIT [pracovní stav] ──→ CONFIRMED (po dokončení rozdělení)
```

| Stav | Kdo nastaví | Reverzibilní | Potvrzení akce |
|---|---|---|---|
| `unmatched` | systém po importu | — | ne |
| `suggested` | automatický matcher | ano → UNMATCHED | ne |
| `confirmed` | admin | **Ano, ale vždy s potvrzením** | potvrzení na DE-match |
| `ignored` | admin | ano → UNMATCHED | ne |
| `split` | admin (zahájení rozdělení) | ano → UNMATCHED (zruší split) | ne |

**Pravidlo potvrzení:** každá operace, která odebírá vazbu na závazkový řádek (odpárování, změna rozdělení, sloučení) = history-changing operation → vždy dialog potvrzení. Samotné navrhnutí párování nebo ignorování potvrzení nevyžaduje.

---

## 6. Operace nad alokací

### 6.1 Párovat (match)
Přiřadit alokaci k jednomu závazkový řádku (typicky `member_contributions`).
- Výsledek: jeden `payment_allocation_line`.
- Přechod stavu: UNMATCHED / SUGGESTED → CONFIRMED.
- Potvrzení: ne (párování je non-destructive).

### 6.2 Rozdělit (split)
Rozbít jednu alokaci na více dílčích částí, každou k jinému závazkový řádku nebo členu.
- Pracovní stav SPLIT: admin postupně přidává řádky se součty.
- Hard check: SUM(lines) = allocation.amount, jinak nelze uložit.
- Přechod stavu: UNMATCHED → SPLIT → CONFIRMED.
- Potvrzení: ne (split je non-destructive dokud není potvrzený).

Příklad: Marek Hořejší pošle 3 000 Kč VS=207101082. Správce split:
- 1 500 Kč → contribution 2025, Marek H.
- 800 Kč → contribution 2025, Marie H.
- 700 Kč → contribution 2025, Vašek H.

### 6.3 Změnit párování (re-match)
Odpárovat a znovu párovat jinak (jiný člen, jiný předpis, jiné dělení).
- Přechod stavu: CONFIRMED → **potvrzení → smazání lines → UNMATCHED → nové párování**.
- Dialog musí zobrazit existující párování a ptát se na potvrzení odpárování.

### 6.4 Sloučit rozdělení (un-split / merge)
Vrátit split zpět na jednu nerozdělnou alokaci.
- Ekvivalentní re-matchi → potvrzení, smazat všechny lines, UNMATCHED.

### 6.5 Ignorovat
Alokace platná, ale nesouvisí s předpisem (záloha na akci, chybný VS, vrácená platba vrátit přes separátní odchozí transakci apod.).
- Stav: IGNORED, povinná `note`.
- Reverzibilní bez potvrzení (ignorování není history-changing).

### 6.6 Vrátit stav (undo)
Kdykoli jde vrátit CONFIRMED nebo IGNORED na UNMATCHED, ale vždy přes potvrzení.

---

## 7. Automatické párování — algoritmus (doporučení best practices)

Standard v účetních systémech (SAP, Xero, QuickBooks) je staged matching:

### Stage 1 — Auto-exact (confidence 100, auto-confirm)
Podmínky:
- VS → přesně jeden člen v DB
- `amount` = `member_contributions.amount_total` pro daný rok transakce
- datum transakce ±0 dní od `paid_at` existující platby (nebo v rozmezí roku)
- žádná otevřená alokace na stejný závazkový řádek

Pokud jsou všechny splněny: auto-confirm bez zásahu admina.

### Stage 2 — Strong-year (confidence 85-95, propose only)
Podmínky jako stage 1 ale:
- datum v rozsahu roku (ne přesná shoda)
- nebo amount_total neznáme, ale existuje contribution record

Výsledek: stav SUGGESTED, admin potvrdí.

### Stage 3 — Split-candidate (confidence 50-80, propose split)
Heuristiky:
- `amount` > 2× median příspěvku pro rok
- zpráva nebo VS obsahuje typické rodinné separátory: `+`, ` a `, `,`, `/`
- VS patří členu, který má v DB příbuzné (sdílená příjmení, skupinoví členové)
- `amount` = součet 2 nebo více contributions v roce

Výsledek: stav SPLIT s navrženými lines, admin potvrdí každý řádek.

### Stage 4 — Unknown (confidence < 40, unmatched)
Bez VS, nebo VS neodpovídá žádnému členu.
Výsledek: unmatched, appears in exceptions tab.

**Best practice poznámka:** Xero a QuickBooks používají „bank rules" — admin si vytvoří pravidlo (např. „transakce kde zpráva obsahuje XY → ignorovat"), které se aplikuje automaticky. Toto je silné, ale V1 to nevyžaduje. Doporučuji jako V2 extension.

---

## 8. Import profil pro bankovní výpis — návrh UI workflow

Vzor: existující import profilů pro členy je vhodný základ.

Postup:
1. Upload souboru (CSV/XLSX)
2. Detekce kódování a záhlaví  
3. Mapování sloupců: každý sloupec z výpisu mapuji na normalizované pole (datum, částka, VS, popis, protistrana, unikátní ID). Pro každou banku jinak.
4. Preview 5 řádků s transformovanými hodnotami
5. Uložit / aktualizovat profil
6. Spustit import → upsert + trigger matching

Profil je pak opětovně použitelný. Import historického výpisu (řekněme jiné banky za 2019–2023) projde stejným profilem a upsertuje bez duplicit.

Profil pro Fio API bude "vestavěný" systémový profil bez nutnosti nahrávat soubor — synchronizace probíhá přes API, ale data sedí ve stejné normalizované tabulce.

---

## 9. Co se stane se stávající tabulkou `payments`

Přechodový plán:
1. Nová architektura nezapisuje do `payments` — nové záznamy jdou do `payment_allocations` + `payment_allocation_lines`.
2. Stávající záznamy v `payments` se ponechají read-only jako archiv; UI je bude zobrazovat se stavem `legacy`.
3. Backfill skript: pro každý záznam v `payments`:
   - vytvoří `payment_allocation` (source_type='cash' pokud `created_by != 'import'`, jinak 'bank_tx' s pokusy o napárování na bank_transactions)
   - vytvoří `payment_allocation_line` (charge_type='contribution', charge_id=contribId)
   - nastaví stav CONFIRMED pro ty, kde bank_tx match existuje; UNMATCHED pro ostatní
4. Po ověření správnosti ve stagingu a produkci: `payments` se označí jako deprecated, poté se migrace dokončí DROP-em.

---

## 10. Navrhované soubory k implementaci (revize)

### DB migrace
```
supabase/migrations/
  20260411_100000_bank_import_profiles.sql     nová tabulka bank_import_profiles
  20260411_110000_payment_allocations.sql      payment_allocations + lines
  20260411_120000_payments_legacy_flag.sql     přidat sloupec is_legacy do payments
```

### Schema (src/db/schema.ts)
Nové entity:
- `bankImportProfiles`
- `bankImportHistory`
- `paymentAllocations`
- `paymentAllocationLines`
Rozšíření:
- `payments` o `isLegacy: boolean`

### Server actions
```
src/lib/actions/
  bank-import-profiles.ts    CRUD pro profily + spuštění importu
  reconciliation.ts          stavové přechody, split, match, ignore
```

Matcher jako separátní modul (ne server action, volaný ze server action):
```
src/lib/reconciliation/
  matcher.ts      implementace stagí 1–4, vrací návrhy
  allocate.ts     zápis navrhnutých alokací, validace SUM invariantu
  undo.ts         bezpečné odpárování s audit záznamem
```

### UI stránky
```
src/app/(admin)/dashboard/
  imports/
    bank/           (vylepšit stávající o profil upload + status badge)
    bank-profiles/  (nová stránka: správa profilů)
  reconciliation/   (nová stránka: přehled alokací)
    page.tsx
    reconciliation-client.tsx
    allocation-detail-sheet.tsx   (split, párování v jednom draweru)
```

### Rozšíření stávajících stránek
- `contributions/payment-sheet.tsx`: zobrazit `payment_allocation_lines` místo `payments`; indikátor napárování na bank_tx
- `members/member-sheet.tsx`: souhrn alokací a nevyrovnání za rok

---

## 11. Best practices — shrnutí doporučení

**1. Immutabilita zdroje:** bankovní transakce nikdy nemaž, nikdy needituj. Vždy zachovej raw_data.

**2. Oddělení staging a settlement:** import = staging, alokace = settlement. Nikdy nespojuj do jednoho kroku.

**3. Sum-invariant pro split:** vždy validuj, že součet dílčích lines = celková částka. Technicky i v DB (check constraint nebo trigger).

**4. Potvrzení pro destruktivní operace:** Standardem v účetnictví (Xero, FreeAgent) je: párování je optimistické (lze odpárovat), ale odpárování po uzávěrce (settled period) vyžaduje privilegovanou roli. Doporučuji přidat `period_locked` flag na `contribution_periods` jako budoucí ochranu.

**5. Full audit trail:** každá změna stavu alokace → záznam do `audit_log` s `before`/`after` stavem.

**6. Idempotent import s unikátním klíčem:** každý zdroj musí poskytnout unikátní klíč transakce. Pro CSV výpisy kde klíč chybí: syntetický klíč = SHA256(datum + částka + VS + protistrana). Varování: duplikáty při manuálním exportu reálně nastávají, proto zobrazit preview duplicit před uložením.

**7. Nemazat, ale označit:** pro platby bez jasného páru — IGNORED s poznámkou. Nikdy DELETE z production.

**8. Bank rules (V2):** admin si definuje pravidlo (pattern ve zprávě → automaticky ignorovat / přiřadit konkrétnímu závazkový řádku). Zrychlí rekonciliaci pro opakující se typy plateb.
