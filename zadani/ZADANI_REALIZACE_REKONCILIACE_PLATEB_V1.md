# Zadání realizace: Rekonciliace přijatých plateb V1

Datum: 2026-04-10
Verze: 1.1
Stav: upřesněno po architekturní oponentuře 2026-04-13

---

## 1. Cíl a kontext

Cílem je zavést jednotný, auditovatelný a provozně použitelný proces zpracování přijatých plateb tak, aby bylo možné:

1. importovat bankovní platby opakovatelně a bez duplicit,
2. zadávat hotovostní platby dvěma praktickými způsoby,
3. párovat platby na předmět platby (dnes typicky předpis příspěvku),
4. podporovat split jedné platby na více osob/předpisů (rodinné platby),
5. kdykoli dohledat historii všech přijatých plateb v jednom souhrnném pohledu,
6. nahradit stávající přechodovou tabulku plateb.

Poznámka ke scope: V1 řeší pouze přijaté platby. Odchozí platby z banky jsou mimo scope a budou řešeny později.

---

## 2. Ujišťovací odpověď

Ano, bankovní i hotovostní platby budou dohledatelné v jednom společném ledgeru plateb.
Tento ledger bude zdroj pro stránku historie plateb, kde bude vidět vše v jednotném seznamu s filtrem podle zdroje (fio/file_import/cash), stavu párování a období.

Požadavek je závazný:

1. žádná přijatá platba nesmí „zmizet",
2. každá platba musí mít stav zpracování,
3. každá změna stavu musí být auditovatelná,
4. stránka historie musí umět zobrazit celou cestu platby od zdroje po párování.

---

## 3. Rozsah V1

### 3.1 In scope

1. Příchozí bankovní platby z Fio synchronizace.
2. Příchozí bankovní platby z importovaných souborů přes profil (včetně Air Bank).
3. Hotovostní platby, obě varianty zadání:
   1. rychlý příjem s poznámkou,
   2. přímé zadání nad konkrétním závazkem.
4. Párování plateb na předmět platby.
5. Split a re-split plateb (atomická operace).
6. Odpárování s potvrzením.
7. Ignorace bez mazání.
8. Jednotná historie plateb v jednom přehledu.
9. Nahrazení stávající funkce "Přidat platbu" v PaymentSheet hotovostním vkladem.
10. Legacy payments: ponechány jako izolovaná tabulka mimo GUI do manuálního dočištění.

### 3.2 Out of scope

1. Odchozí platby a jejich účetní workflow.
2. Pokročilé pravidlové automaty — scoring pro split podle popisu platby nebo rodinných vazeb (V2).
3. Finální automatické párování bez lidské validace u nejednoznačných případů.
4. UI editor pro správu profilů za běhu importu (pouze create/view/delete).

---

## 4. Architektura systému

### 4.1 Dvouúrovňový model

Systém je navržen ve dvou úrovních:

**Úroveň 1 — vstupní staging (per kanál)**

Každý vstupní kanál má vlastní tabulku pro staging importovaných dat s idempotentním unikátním klíčem:

| Kanál | Staging tabulka | Unikátní klíč |
|---|---|---|
| Fio API sync | `bank_transactions` (existující) | `fio_id` |
| File import (CSV/XLS) | `bank_import_transactions` (nová) | `external_key` dle profilu |
| Hotovost | přímo do ledgeru | není (žádný re-import) |

**Úroveň 2 — jednotný platební ledger**

Tabulka `payment_ledger` je kanonický zdroj pravdy pro všechny přijaté platby bez ohledu na kanál. Každý záznam v ledgeru odkazuje zpět na svůj staging záznam pomocí nullable FK.

### 4.2 Zdroje plateb (source_type)

| Hodnota | Popis | Staging |
|---|---|---|
| `fio` | Synchronizace z Fio API | `bank_transactions.id` |
| `file_import` | Ruční import CSV/XLS přes profil | `bank_import_transactions.id` |
| `cash` | Hotovostní vklad zadaný adminerm | — |

### 4.3 Alokace (vazba platba → předpis)

Alokace jsou záznamy v tabulce `payment_allocations`, která nahrazuje stávající `payments`.

Jeden záznam v ledgeru může mít více alokačních řádků (split). Součet alokovaných částek musí při potvrzení splitu rovnat celkové částce v ledgeru.

Vazba na předpis příspěvku:

- `contrib_id NULLABLE REFERENCES member_contributions(id)` — klasický FK, ne polymorfní.
- `member_id REFERENCES members(id)` — denormalizace pro rychlý lookup.

Polymorfní přístup se nepoužívá v V1. Pokud přibyde nový typ předpisu (service/material), přidá se nový nullable FK sloupec nebo se provede refactor v V2.

---

## 5. Návrh databázového schématu

### 5.1 `bank_import_transactions` (nová)

Staging tabulka pro file-based importy (Air Bank atd.):

```
id                   serial PK
import_run_id        integer REFERENCES import_history(id)
profile_id           integer REFERENCES import_profiles(id)
external_key         text NOT NULL          -- unikátní klíč dle profilu
paid_at              date
amount               integer                -- v haléřích
currency             text DEFAULT 'CZK'
variable_symbol      text
counterparty_account text
counterparty_name    text
message              text
raw_data             jsonb                  -- původní řádek souboru
ledger_id            integer REFERENCES payment_ledger(id)  -- NULL do zpracování
created_at           timestamp tz

UNIQUE(profile_id, external_key)           -- idempotentní import
```

### 5.2 `payment_ledger` (nová)

Kanonický platební ledger:

```
id                   serial PK
source_type          text NOT NULL  -- 'fio' | 'file_import' | 'cash'
bank_tx_id           integer REFERENCES bank_transactions(id)       -- nullable, pouze fio
bank_import_tx_id    integer REFERENCES bank_import_transactions(id) -- nullable, pouze file_import
import_run_id        integer REFERENCES import_history(id)          -- nullable, pro bank a file_import

paid_at              date NOT NULL
amount               integer NOT NULL    -- v haléřích, vždy kladné pro příchozí
currency             text NOT NULL DEFAULT 'CZK'
variable_symbol      text
counterparty_account text
counterparty_name    text
message              text
note                 text

reconciliation_status text NOT NULL DEFAULT 'unmatched'
  -- 'unmatched' | 'suggested' | 'confirmed' | 'ignored'

created_by           text NOT NULL
created_at           timestamp tz NOT NULL
updated_at           timestamp tz NOT NULL

INDEX(paid_at)
INDEX(variable_symbol)
INDEX(reconciliation_status)
```

Poznámka: souhrn alokací (`paidTotal`, `balance`) se vždy počítá z `payment_allocations`, nikdy se neukládá.

### 5.3 `payment_allocations` (nová, nahrazuje `payments`)

Alokační řádky — vazba platba z ledgeru na předpis příspěvku:

```
id                   serial PK
ledger_id            integer NOT NULL REFERENCES payment_ledger(id)
contrib_id           integer NOT NULL REFERENCES member_contributions(id)
member_id            integer NOT NULL REFERENCES members(id)
amount               integer NOT NULL    -- alokovaná částka (může být část splitu)
note                 text
is_suggested         boolean NOT NULL DEFAULT false
confirmed_by         text                -- NULL = dosud nepotvrzeno
confirmed_at         timestamp tz
created_by           text NOT NULL
created_at           timestamp tz NOT NULL

INDEX(ledger_id)
INDEX(contrib_id)
INDEX(member_id)
```

### 5.4 Legacy `payments` (existující)

Tabulka zůstává v DB beze změny jako izolovaná. Není odstraněna, ale:

- Nové záznamy do ní nevznikají.
- Aplikace ji nečte (API ani GUI).
- Dočištění probíhá mimo V1 v samostatném kroku (porovnání s Fio + Air Bank importy, zbytek do hotovosti).

---

## 6. Uživatelské role a oprávnění

1. Admin: plná práce s párováním, split, ignore, import profily, import běhy.
2. Super admin (volitelné V1.1): může provádět zásahy do uzavřených období.

Pravidlo bezpečnosti:

1. mazání zdrojových bankovních transakcí je zakázané,
2. rušení existujícího párování vždy s potvrzením,
3. každá změna je v auditní historii.

---

## 7. Uživatelské scénáře

### 7.1 Bankovní import a párování

1. Admin spustí import/sync.
2. Nové transakce se vloží do staging tabulky, poté do ledgeru jako `unmatched`.
3. Auto-matcher okamžitě vyhodnotí každou novou položku:
   - VS odpovídá jednoznačně jednomu členu + částka sedí na předpis → `confirmed` automaticky.
   - VS odpovídá, ale částka nesedí (přeplatek/nedoplatek) nebo VS chybí → `suggested`.
   - Jinak → `unmatched`.
4. Admin zkontroluje `suggested` a `unmatched`, potvrzuje nebo přeřazuje ručně.

### 7.2 Rychlý příjem hotovosti

1. Admin na schůzi přijme hotovost.
2. Otevře rychlý formulář "Přijmout hotovost".
3. Vyplní částku, datum, poznámku (např. "Kukla příspěvky za 25 a 26").
4. Uloží bez okamžitého cílového párování.
5. Záznam svítí v rekonciliaci jako `unmatched`.

### 7.3 Přímá hotovost nad závazkem

1. Admin je na detailu konkrétního závazku (PaymentSheet nahrazuje staré "Přidat platbu").
2. Zvolí "Přijmout hotovost na tento závazek".
3. Vyplní částku, datum, poznámku.
4. Záznam se vytvoří v ledgeru a okamžitě se vytvoří alokace na daný závazek → stav `confirmed`.

### 7.4 Rodinná platba (split)

1. Přišla jedna platba za více osob (stav `unmatched` nebo `suggested`).
2. Admin klikne "Rozdělit".
3. Modal zobrazí celkovou částku a umožní přidat řádky: vybrat člena/předpis + částku.
4. Systém průběžně kontroluje, že součet částí = celková částka (invariant).
5. Admin potvrdí — vše se uloží atomicky v jedné DB transakci: ledger → `confirmed` + všechny alokační řádky.
6. Nelze uložit, pokud součet nesedí.

### 7.5 Re-párování a re-split

1. Admin otevře potvrzenou položku.
2. Zvolí "Změnit párování".
3. Systém zobrazí potvrzovací dialog s přehledem dopadů.
4. Po potvrzení: alokační řádky smazány, ledger → `unmatched`, řeší se znovu.

---

## 8. Stavový model

Stavy položky v ledgeru:

```
unmatched   — bez alokací, čeká na zpracování
suggested   — systém navrhl alokaci (is_suggested=true), čeká na potvrzení adminem
confirmed   — alokace potvrzena (ručně nebo auto-matcherem), součet = celková částka
ignored     — záměrně bez alokace (nepatří do systému, vrácená platba apod.)
```

Přechody:

```
import → unmatched
auto-matcher → suggested (VS match, ale nesedí částka nebo nejednoznačný)
auto-matcher → confirmed (VS + částka match, jednoznačný)
unmatched/suggested → confirmed (admin páruje ručně nebo potvrzuje split)
unmatched/suggested/confirmed → ignored (s poznámkou)
confirmed/ignored → unmatched (pouze po potvrzení adminem)
```

Poznámka: `split_draft` NENÍ DB stav. Rozpracovaný split existuje pouze v UI (modal). Uložení je atomické nebo se nekoná.

---

## 9. Pravidla párování

### 9.1 Auto-confirm (V1)

Podmínky pro automatické potvrzení při importu:

1. VS odpovídá právě jednomu členu v tabulce `members.variable_symbol`.
2. Daný člen má předpis příspěvku pro rok odpovídající datu platby.
3. Alokovaná částka = `member_contributions.amount_total` − součet existujících confirmed alokací pro daný předpis.
4. Podmínky jsou splněny pro jediný kandidát.

Pokud jsou splněny → stav `confirmed` + `payment_allocations` záznam se vytvoří automaticky.

### 9.2 Auto-suggested (V1)

Položka přejde do `suggested` místo `confirmed`, pokud:

1. VS odpovídá členu, ale zbývající částka k zaplacení se neshoduje (přeplatek nebo nedoplatek).
2. VS odpovídá více než jednomu předpisu (různé roky).
3. VS chybí, ale systém najde kandidáta podle částky nebo protistrany (heuristika, ne auto-confirm).

### 9.3 Heuristiky pro split (V2)

Automatické rozdělení plateb dle popisu, jmen nebo rodinných vazeb je mimo scope V1.

### 9.4 Konflikty

1. Jeden staging záznam nesmí být potvrzen dvakrát (unikátní constraint na `bank_tx_id` nebo `bank_import_tx_id` v `payment_allocations` není nutný — stačí stav `confirmed` na ledgeru, nový import nepřepíše existující).
2. Pokud je více kandidátů se stejnou prioritou, položka zůstane `suggested` nebo `unmatched`.

---

## 10. Import profily pro více bank

### 10.1 Obecné požadavky

1. Import přes profil je jediný podporovaný kanál pro opakované file importy.
2. Profil musí obsahovat mapování sloupců a transformace.
3. Import musí být idempotentní (upsert podle `external_key`).
4. Každý běh importu musí mít záznam v `import_history`.

### 10.2 Unikátní klíč transakce

1. Pokud existuje jednoznačný sloupec, použije se přímo.
2. Pokud neexistuje, profil musí umět definovat kombinaci sloupců pro kompozitní klíč.
3. Systém musí explicitně varovat, když je klíč slabý.

### 10.3 Air Bank profil

Air Bank ukázka potvrzuje:

1. delimiter je `;`,
2. datum je `dd/MM/yyyy`,
3. částka je s desetinnou čárkou,
4. referenční číslo ("Referenční číslo") je vhodný kandidát unikátního klíče,
5. import se filtruje na `Směr úhrady = Příchozí`.

### 10.4 UI pro správu profilů

- Zobrazení seznamu profilů.
- Vytvoření nového profilu (formulář s definicí mappingu a klíče).
- Smazání profilu (s potvrzením, pokud existují import_history záznamy).
- Žádný live editor sloupců během importu.

---

## 11. Historie plateb v jednom souhrnu

### 11.1 Cíl stránky

Jedna stránka, kde je vidět:

1. bankovní (Fio i file import) i hotovostní přijaté platby,
2. stav párování,
3. vazba na předmět platby,
4. audit změn.

### 11.2 Minimální filtry

1. období od/do,
2. source_type (fio/file_import/cash),
3. reconciliation_status,
4. člen / plátce,
5. částka od/do,
6. has_vs ano/ne,
7. pouze konfliktní položky (suggested + unmatched).

### 11.3 Minimální sloupce

1. datum,
2. částka,
3. zdroj,
4. VS,
5. plátce,
6. zpráva/poznámka,
7. stav párování,
8. alokační souhrn (kdo / jaký předpis),
9. poslední změna a uživatel.

### 11.4 Drill-down

Po rozkliknutí položky:

1. detail zdroje (staging data),
2. historie stavů (audit_log),
3. alokační řádky s částkami,
4. akce: párovat, rozdělit, ignorovat, odpárovat.

---

## 12. Legacy payments přechod

### 12.1 Strategie

Stávající tabulka `payments` zůstává v DB jako **izolovaná legacy tabulka** — aplikace ji nečte ani nezapisuje.

Dočištění probíhá jako samostatná operace mimo V1 timeline:

1. Porovnat `payments` s Fio importy — shodné záznamy jsou již v ledgeru jako `fio`, lze smazat.
2. Porovnat zbytek s Air Bank importy po prvním importu.
3. Zbývající záznamy převést do ledgeru jako `cash` (source_type=cash, bez staging reference).
4. Až po snapshotu a schválení výsledku.

### 12.2 Provozní pravidlo

Mazat až po snapshotu a po schválení výsledku. `payments` tabulka se nesmaže dřív, než je dočištění ověřeno.

---

## 13. UX požadavky

### 13.1 Hotovostní vstup nahrazuje staré "Přidat platbu"

PaymentSheet (detail závazku) již nebude mít staré tlačítko "Přidat platbu".
Místo toho bude "Přijmout hotovost na tento závazek" → vytvoří ledger + alokaci atomicky.

Rychlý příjem hotovosti bez vazby na konkrétní závazek zůstává jako samostatný formulář.

### 13.2 Potvrzovací UX

1. Odpárování: vždy modal s přehledem dopadů.
2. Změna splitu u confirmed: vždy modal.
3. Párování a split potvrzení (dokončení) bez extra potvrzení, pokud nejde o rušení historie.

### 13.3 Viditelnost stavu

Každý řádek má viditelný badge stavu:

1. `unmatched` — šedá,
2. `suggested` — oranžová,
3. `confirmed` — zelená,
4. `ignored` — fialová.

---

## 14. Audit a dohledatelnost

Každá relevantní akce musí mít audit stopu v `audit_log`:

1. import transakce (vytvoření ledger záznamu),
2. změna reconciliation_status,
3. vytvoření / smazání alokačního řádku,
4. split (jedna akce = N alokačních řádků),
5. ignore,
6. undo (odpárování).

Audit záznam musí obsahovat: kdo, kdy, co se měnilo, before/after.

---

## 15. Nefunkční požadavky

1. Idempotentní import (upsert dle external_key nebo fio_id).
2. Deterministické párovací skóre.
3. Žádná ztráta dat při opakovaném importu.
4. Stránka historie použitelna na více tisíc položkách (standardní stránkování + indexy).
5. Každá destruktivní akce potvrzena.
6. Split je atomická DB transakce — buď celý nebo nic.

---

## 16. Akceptační kritéria V1

1. Systém umí importovat příchozí bankovní platby z Fio API i z file profilu (Air Bank).
2. Systém umí zadat hotovost rychle i přímo nad závazkem.
3. Všechny přijaté platby jsou viditelné v jednom společném přehledu (`payment_ledger`).
4. Lze platbu napárovat, rozdělit, změnit, odpárovat a ignorovat.
5. Odpárování a změna historie vyžadují potvrzení.
6. Lze zobrazit historii změn každé položky (audit_log).
7. Auto-match potvrdí jednoznačné VS + částka shody automaticky.
8. Hotovostní vstup nahrazuje starou funkci "Přidat platbu" v PaymentSheet.

---

## 17. Realizační etapy

### Etapa A: Schéma a vstupní vrstva

1. Nové tabulky: `bank_import_transactions`, `payment_ledger`, `payment_allocations`.
2. Migrace schématu (bez dat — legacy `payments` zůstává nedotčena).
3. Napojení Fio sync → ledger (doplnit zpracování existujících `bank_transactions` do ledgeru).
4. File import přes profil → `bank_import_transactions` → ledger.
5. Air Bank profil jako referenční implementace.

### Etapa B: Rekonciliační workflow

1. Auto-matcher (VS + částka → auto-confirm nebo suggested).
2. Ruční párování (unmatched/suggested → confirmed).
3. Atomický split.
4. Ignore.
5. Potvrzovací flow pro odpárování.

### Etapa C: UI — Historie plateb

1. Souhrnná stránka `/dashboard/payments`.
2. Filtry a drill-down.
3. Stav badges.
4. Auditní detail.

### Etapa D: Hotovostní vstup

1. Rychlý příjem hotovosti (globální formulář).
2. Přímý příjem nad závazkem (v PaymentSheet nahrazuje staré "Přidat platbu").

### Etapa E: Legacy cleanup (mimo hlavní timeline)

1. Snapshot legacy `payments`.
2. Porovnání s Fio importy → smazat potvrzené duplicity.
3. Porovnání s Air Bank importy po prvním importu.
4. Zbývající → `cash` v ledgeru.
5. Kontrolní report po zásahu, smazání tabulky `payments`.

---

## 18. Rizika a mitigace

1. Riziko: chybějící VS u historických dat.
   Mitigace: fallback na `suggested` + manuální workflow.
2. Riziko: falešně pozitivní auto-match.
   Mitigace: auto-confirm jen u jednoznačných případů (VS + částka).
3. Riziko: ztráta kontextu při splitu.
   Mitigace: atomická operace s invariantem součtu.
4. Riziko: agresivní cleanup legacy payments.
   Mitigace: strict pravidla + snapshot + dry-run.
5. Riziko: duplikace plateb (file import + legacy payments).
   Mitigace: porovnání probíhá v Etapě E, ne dřív.

---

## 19. Ukázkové scénáře

### Scénář A: Jednoznačná bankovní platba

1. Import přivede bankovní transakci 1000 CZK, VS odpovídá jednomu členu a částka sedí na předpis.
2. Auto-matcher nastaví `confirmed`, vytvoří alokaci automaticky.
3. Admin vidí v historii `confirmed` s vazbou na předpis.

### Scénář B: Rodinná platba 3000 CZK

1. Import přivede platbu 3000 CZK, VS chybí nebo nejednoznačný → `unmatched`.
2. Admin klikne "Rozdělit".
3. V modalu zadá 1500 + 800 + 700 na tři předpisy.
4. Systém ověří součet = 3000 CZK.
5. Admin potvrdí → atomicky: ledger `confirmed` + 3 alokační řádky.

### Scénář C: Rychlá hotovost

1. Admin přijme hotově 2500 CZK, zapíše poznámku "Kukla příspěvky za 25 a 26".
2. Ledger záznam: source_type=cash, status=`unmatched`.
3. Později admin rozdělí mezi dva závazky a potvrdí.

### Scénář D: Oprava chybného párování

1. Confirmed položka je při revizi špatně napárovaná.
2. Admin zvolí odpárovat.
3. Systém vyžádá potvrzení s přehledem dopadů.
4. Alokace smazány, ledger → `unmatched`, znovu se napáruje správně.

---

## 20. Závěrečná architekturní rozhodnutí (verze 1.1)

| Téma | Rozhodnutí |
|---|---|
| Architektura | Dvouúrovňová: vstupní staging per kanál + jednotný `payment_ledger` |
| Kanály | `fio` (existující `bank_transactions`), `file_import` (nová `bank_import_transactions`), `cash` (přímo do ledgeru) |
| Alokace → předpis | Klasický `contrib_id NULLABLE FK`, ne polymorfní — polymorfismus V2 |
| Auto-match | Auto-confirm na VS + částka match; jinak `suggested`; scoring heuristiky V2 |
| Split | Atomická DB transakce v modalu, žádný `split_draft` DB stav |
| Import profily | Profilový mechanismus zachován; UI pouze create/view/delete |
| Hotovostní vstup | Nahrazuje stávající "Přidat platbu" v PaymentSheet |
| Legacy `payments` | Izolovaná tabulka mimo GUI, dočistí se v Etapě E |
