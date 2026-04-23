# UX Redesign — Zadání

Stav: **Rozpracováno** — připravujeme zadání, nepřistupujeme ještě k implementaci.

---

## Motivace

Stávající aplikace je vizuálně pěkná, ale špatně použitelná:

- Detail vpravo (Sheet) nefunguje dobře pro entity s větším množstvím dat.
- Na mobilním zařízení jsou boční detaily (Sheet) prakticky nepoužitelné.
- Chybí jednotný navigační model — každá stránka si řeší navigaci po svém.
- Filtry nejsou persistentní — po přechodu na detail a zpět se filtr ztratí.
- Přecházení mezi provázanými entitami (člen → příspěvek → platba → loď) chybí.
- Různá tlačítka a akce jsou rozesetá po obrazovkách bez systému.
- Původní „PC-first" přístup — nutno přejít na „mobile-first".

---

## Cíl

Jasný, jednotný navigační a interakční model, který funguje dobře na PC i mobilu. Srozumitelný a konzistentní napříč všemi sekcemi systému.

---

## 1. Navigační model

### 1.1 Přehled — hlavní view i kontextový view

Každá sekce má **přehledovou stránku** (seznam). Přehled může být:

**a) Výchozím bodem navigace** — uživatel přišel přes tab bar. Zásobník je prázdný, žádný back prvek není.

**b) Kontextovým pohledem uprostřed navigace** — uživatel se na přehled dostal klikem z detailu (např. z detailu člena přejde na výpis jeho plateb = přehled plateb s předvyplněným filtrem). V tomto případě zásobník obsahuje předchozí detail a **zpět šipka smysl dává**.

Příklady přehledů:
- `/dashboard/members` — seznam členů
- `/dashboard/contributions` — seznam příspěvků
- `/dashboard/payments` — rekonciliace plateb
- `/dashboard/boats` — seznam lodí
- `/dashboard/brigades` — seznam brigád
- `/dashboard/events` — seznam akcí

### 1.2 Detail jako samostatná stránka

**Všechny entity mají svůj detail jako samostatnou plnohodnotnou stránku.** Sheet (boční panel) se ruší.

Příklady URL detailů:
- `/dashboard/members/[id]`
- `/dashboard/contributions/[id]`
- `/dashboard/payments/[id]`
- `/dashboard/boats/[id]`
- `/dashboard/brigades/[id]`
- `/dashboard/events/[id]`

Výhody:
- Funguje na mobilu (full screen).
- Lze sdílet URL.
- Prohlížeč spravuje historii (zpět funguje standardně).
- Přirozené místo pro „přímý přístup bez přehledu" (viz sekce 4 — přístupová práva).

### 1.3 Navigace zpět — back šipka

Vlevo nahoře je back prvek: **šipka doleva + text kam vede** (vždy právě jeden krok zpět).

Příklady textu: `← Přehled členů` nebo `← Jan Novák` nebo `← Přehled lodí: Jan Novák`.

Pokud je přehled filtrován na konkrétního člena, jméno člena je součástí textu zpět — je to důležitý kontext pro orientaci.

**Back prvek se zobrazí jen pokud zásobník není prázdný.** Pokud zásobník prázdný je (přímý přístup přes URL, záložka, příchod přes tab bar), back prvek se nezobrazí vůbec. Uživatel naviguje přes tab bar nebo funkční menu.

### 1.4 Persistentní filtr v URL

**Každý přehled ukládá svůj stav filtru do URL.** Příklady:

```
/dashboard/members?year=2026&filter=todo
/dashboard/contributions?year=2026&filter=unpaid&sort=lastname
/dashboard/boats?filter=active&storage=letiste
```

Díky tomu:
- Reload stránky zachová filtr.
- Sdílení URL = sdílení přesného pohledu.
- Po návratu z detailu = přesně stejný filtr (prohlížeč zpět, nebo back šipka z detailu).
- Z jiné části systému lze odkazovat na přehled s předvyplněným filtrem.

---

## 2. Filtrování

### 2.1 Struktura filtrů

Každý přehled má maximálně **3 výrazné one-click filtry** (badge/pill) pro nejčastěji používané stavy. Zbytek filtrů je dostupný přes **rozbalovací menu „Filtrovat"**.

**Řazení** je umístěno v **hlavičce stránky** (v záhlaví nad tabulkou), ne v rozbalovacím menu — je to přímá akce na pohled, ne filtr.

### 2.2 Filtr na člena — cross-entity

Řada přehledů umožňuje filtrovat podle konkrétního člena. Jedná se o **sdílený vzor** použitelný všude, kde je entita k členovi vázaná:

- Lodě (`/boats`) — zobrazit lodě konkrétního člena
- Příspěvky (`/contributions`) — příspěvky konkrétního člena
- Platby (`/payments`) — platby/transakce přiřazené konkrétnímu členovi
- Brigády (`/brigades`) — brigády, kde byl člen přítomen
- Akce (`/events`) — akce spojené s konkrétním členem
- Finance TJ (`/finance`) — transakce přiřazené členovi

Implementace filtru na člena: **autocomplete / combo box** — zadání jména zobrazí našeptávač. Vybraný člen se zobrazí jako odstraňovatelný chip vedle badge filtrů.

Tento vzor se navrhuje jako sdílená komponenta (`MemberFilterChip`), použitelná na všech přehledech.

### 2.3 Aktivní filtr

Pokud je aktivní jiný než výchozí filtr, je to jasně viditelné:
- Aktivní badge je vizuálně odlišena.
- U rozbalovacího filtru: pokud je vybrána **jedna hodnota**, zobrazí se přímo její název (ne číslo „1"). Pokud je vybraných **více hodnot**, zobrazí se jejich počet.
- Tlačítko „Zrušit filtry" resetuje vše na výchozí stav.

---

## 3. Provázanost entit

### 3.1 Odkazování z detailu na jiný detail

Na detailu jsou odkazované entity zobrazeny jako kliknutelné odkazy vedoucí na jejich detail.

Příklady:
- Detail člena → seznam jeho příspěvků → klik na příspěvek → detail příspěvku
- Detail příspěvku → klik na jméno člena → detail člena
- Detail brigády → klik na jméno účastníka → detail člena
- Detail platby → klik na příspěvek → detail příspěvku

### 3.2 Zachování kontextu při procházení

Navigační history je lineární zásobník. Příklad cesty:

```
Přehled členů (filtr: S úkolem)
  → Detail člena Jan Novák
    → Detail příspěvku 2026
      → Detail platby #123
        ← zpět: Detail příspěvku 2026
      ← zpět: Detail člena Jan Novák
    ← zpět: Přehled členů (filtr: S úkolem — zachován)
```

Zásobník je uložen v URL (search params nebo session storage — TBD).

---

## 4. Přístupová práva a přímý přístup

V budoucnu (ne nutně V1, ale architektura musí to umožnit):
- Uživatel bez přístupu na celý přehled dostane přímou URL na svůj detail.
- Příklad: člen dostane URL na detail své lodě, detaily svých příspěvků.
- Na takovém detailu nebude navigace zpět na přehled (nemá k němu přístup).
- Přehledové stránky mohou mít granulární oprávnění (admin / člen / host).

---

## 5. Akce na detailu — funkční menu vpravo nahoře

Na každém detailu vpravo nahoře je **jedno konzistentní místo pro akce**. Pravidla:

- Maximálně **3 vizuální prvky** celkem.
- Každý prvek je buď přímé tlačítko, nebo rozbalovací menu s více volbami.
- Kombinace je povolena — např. jedno přímé tlačítko + jedno rozbalovací menu.
- Konkrétní složení se určuje vždy pro daný detail — ne genericky.

Tím mizí akční tlačítka rozesetá po obsahu stránky. Výjimka: inline editing polí zůstává (viz sekce 7).

---

## 6. Mobile-first layout

### 6.1 Přehled (seznam)

- Na mobilu zobrazuje méně sloupců (jen klíčové informace).
- One-click badge filtry zůstávají — max 3, kratší labely.
- Rozbalovací filtr jako bottom sheet nebo modal.
- Řazení: jednoduché menu „Řadit podle…".

### 6.2 Detail entity

- Full screen, scrollovatelný.
- Sekce skládané pod sebou (ne side-by-side).
- Funkční menu (akce) vpravo nahoře: na mobilu ikonka `⋯` nebo FAB.
- Inline editace funguje na mobilu — tap pro aktivaci pole, potvrzení Enter nebo tlačítkem.

### 6.3 Navigace

- Zpět šipka vlevo nahoře vždy viditelná.
- Na velmi malých obrazovkách: breadcrumb zkrácen (jen bezprostřední předchůdce).

---

## 7. Inline editing — zachovat stávající princip

Stávající princip inline editace polí se **zachovává a rozšiřuje** na detail stránky:

- Klik na pole → aktivuje se editace (input / select / datepicker).
- Enter nebo klik mimo → uloží.
- Esc → zruší.
- Na mobilu: tap pro aktivaci, potvrzení tlačítkem pod polem (Enter nemusí fungovat spolehlivě).

Inline editing se vztahuje na textové hodnoty, data a jednoduché výběry. Složitější operace (přiřazení lodě, rodinné skupiny, split platby) zůstávají jako modální dialog nebo akce z funkčního menu.

---

## 8. Entity a jejich detaily — přehled

| Entita | Přehled URL | Detail URL | Klíčové akce |
|---|---|---|---|
| Člen | `/members` | `/members/[id]` | Editace polí, rok členství, sleva, úkol, email |
| Příspěvek | `/contributions` | `/contributions/[id]` | Přidat platbu, úkol, upomínka |
| Platba | `/payments` | `/payments/[id]` | Potvrdit, rozdělit, přesunout, zamítnout |
| Loď | `/boats` | `/boats/[id]` | Editace, poloha, vlastník |
| Brigáda | `/brigades` | `/brigades/[id]` | Přidat účastníka, uzavřít |
| Akce (event) | `/events` | `/events/[id]` | Editace, sync GCal, brigády |

Příspěvky (`/contributions`) zobrazují konkrétní předpisy příspěvků (`member_contributions`) pro zvolené období. Detail příspěvku = detail předpisu konkrétního člena za daný rok. ✅

---

## 9. Rozhodnutí

### A) Zásobník navigace — implementace ✅

`router.back()` závisí na browserové historii — pokud uživatel přijde přímo na URL (záložka, email, refresh po odhlášení), historie je prázdná nebo vede mimo aplikaci a `router.back()` by ho vyhodilo z appky.

**Rozhodnutí:**
- Zásobník uložen v **session storage** (JavaScript objekt, přežije navigaci v záložce, nepřežije zavření záložky — v pořádku).
- Hloubka zásobníku: **max 10 kroků**.
- Žádné kódování do URL — URL zůstávají čisté.
- **Zpět šipka se zobrazí jen pokud zásobník není prázdný.** Prázdný zásobník = žádný back prvek. Funguje vše ostatní (tab bar, funkční menu).
- Zásobník obsahuje: `{ url: string, label: string }[]` — label slouží pro text šipky (např. `← Přehled členů` nebo `← Jan Novák`).

### B) Navigace — redesign pro mobil ✅

Na desktopu horizontální tab bar funguje — zůstává beze změny.

Na mobilu se zavádí **bottom navigation bar + „···" drawer**:

```
Bottom bar (4 položky, vždy viditelný):
  Členové  |  Příspěvky  |  Platby  |  ···

··· otevře bottom drawer se zbytkem:
  Lodě / Brigády / Akce / Finance TJ / Importy
```

Top bar na mobilu se zjednodušuje: `OVT` logo + `YearSelector` + avatar (odhlásit). Hamburger ikona se nepoužívá — navigace je dole.

**Proč bottom bar (ne hamburger):** Back šipka bude vlevo nahoře — hamburger by kolidoval. Bottom bar tento konflikt nemá, a 3 nejpoužívanější sekce jsou dostupné jedním tapem palcem.

Aktivní sekce v bottom baru je vizuálně odlišena (aktivní barva, podtržení nebo tučné).

### C) Stránkování — není potřeba ✅

Byznys entity (členové, lodě, brigády…) nemají tak velký počet položek, aby stránkování bylo nutné. Načítá se vše. Platby mohou časem narůst, ale to se řeší až bude potřeba. Pro V1 bez stránkování.

### D) Prázdné stavy ✅

Jednoduchý prázdný stav — text „Žádné výsledky" (případně s tlačítkem „Zrušit filtry", pokud je aktivní filtr).

### E) Loading stavy ✅

Skeleton tam, kde to dává smysl (přehledové tabulky, detail entity). Spinner pro jednoduché akce (tlačítko submit). Konkrétní nasazení se doladí při implementaci.

---

## 10. Popis stránek — Členové

### 10.1 Přehled členů (`/dashboard/members`)

**Navigační titulek (back šipka z jiné stránky):** `← Seznam členů`

**URL parametry:** `?year=2026&filter=todo&sort=lastName&q=novák`

---

**Záhlaví + ovládací prvky** — na širší obrazovce na jednom řádku, na užší se zalomí:
```
Členové 2026   [🔍 Hledat…]   [Aktivní|47] [S úkolem|5] [Bez revize|3]   [Filtrovat ▾]   [Řadit: Příjmení ▾]   [Přidat člena]
```
- Rok pochází z globálního `YearSelector`; je i součástí URL
- Počet: pouze aktivní (`47 aktivních`), bez „z celkem"
- Textové hledání v jednom řádku spolu s filtry

**Filtry (badge pills — max 3):**
- `Aktivní` — výchozí, aktivní členové pro zvolený rok
- `S úkolem` — mají `todo_note`
- `Bez revize` — `membership_reviewed = false`

**Rozbalovací filtr „Filtrovat ▾":**
- **Stav** — radio: Aktivní / Neaktivní _(neaktivní je výjimečný případ)_
- **Sleva** — checkboxy: Výbor / Vedoucí TOM / Individuální
- **Brigáda** — toggle: Bez brigády
- **Členství** — toggle: Vstup / Ukončení (část roku)

_(TJ import není ve filtru — pouze vizuální badge na řádku v tabulce)_

**Řazení** — v záhlaví: `Příjmení` / `Jméno`

---

**Tabulka — desktop:**

| Jméno | ČSK | Info |
|---|---|---|
| Jan Novák (Johny) | 98765 | `Výbor` `TOM` `vstup 1. 3.` `změny z TJ` |
| Marie Hořejší | 12340 | `Sleva 200 Kč` `📋 úkol` |
| Petr Kolář | 11111 | `bez brigády` |

- **Jméno** = `{příjmení} {jméno}` + `({přezdívka})` pokud existuje
- **ČSK** = číslo CSK
- **Info** = barevné badges: Výbor, TOM, sleva s částkou, vstup/odchod s datem, bez brigády, úkol, změny z TJ
- Klik na řádek → `← Seznam členů` + detail člena

**Tabulka — mobil:**

| Jméno | ČSK | Stav |
|---|---|---|
| Jan Novák (Johny) | 98765 | ● |
| Marie Hořejší | 12340 | ● 📋 |

- Stav = barevná tečka příspěvku pro zvolený rok + ikona úkolu pokud existuje

---

**Architektonická poznámka — nečlenové (budoucnost):**

Časem bude potřeba evidovat i osoby, které nejsou členy oddílu, ale účastní se akcí (nečlenové na výpravách, děti, partneři, rodinné skupiny). Tyto osoby bude potřeba vyhledávat, propojovat s členy (rodinný vztah) a evidovat je na akci.

Návrh pro budoucí architekturu: `members` tabulka se rozšíří o příznak `is_member: boolean`. „Nečlen" je pak plnohodnotný záznam v `members` s `is_member = false`. Přehledy a filtry pak snadno rozlišují. Rodinné vztahy řeší separátní tabulka `member_relations (member_id, related_member_id, relation_type)`. Toto zatím **neimplementovat**, jen mít na paměti při navrhování schématu.

---

### 10.2 Detail člena (`/dashboard/members/[id]`)

**Navigační titulek (pro zásobník):** `Člen: Jan Novák`

**URL:** `/dashboard/members/123?year=2026`

---

**Horní lišta:**
```
[← Seznam členů]        Jan Novák        [Příspěvky]  [Lodě]  [▾ Brigády / Platby / Audit log / Ukončit členství]
```
- Back šipka jen pokud zásobník není prázdný
- Akce vpravo (max 3 vizuální prvky):
  - `Příspěvky` — přímé tlačítko → přehled příspěvků filtrovaný na člena, **bez roku** (všechny roky)
  - `Lodě` — přímé tlačítko → přehled lodí filtrovaný na člena, bez roku
  - `▾` rozbalovací menu: Brigády / Platby / Audit log / Ukončit členství

**Navigace „bez roku":** Přehledy příspěvků, lodí, brigád a plateb mají v URL filtru možnost `year=all` (nebo chybějící year param = všechny roky). Z detailu člena se vždy odkazuje bez roku — uživatel vidí kompletní historii a může si rok sám nastavit v přehledu. Tato možnost „všechny roky" je v přehledech dostupná, ale záměrně trochu schovaná (není v badge filtrech, je v rozbalovacím filtru).

---

**Pole na stránce** — inline editovatelná:

```
Příjmení        Novák           [edit]       ← TJ diff badge pokud existuje
Jméno           Jan             [edit]
Přezdívka       Johny           [edit]
E-mail          jan@example.com [edit]        ← GDPR: viditelné jen adminům
Telefon         +420 …          [edit]        ← GDPR
Adresa          Praha 4         [edit]        ← GDPR
Variabilní symbol  12345        [edit]
Číslo CSK       98765           [edit]
Člen od         2019            [edit]
Poznámka        —               [edit]
Úkol            —               [edit + Vyřešeno]
```

- GDPR údaje (email, telefon, adresa) jsou viditelné a editovatelné pouze adminům
- TJ diff badge se zobrazí inline u pole, kde existuje rozdíl (ne jako samostatná sekce)

---

**Členství [rok]** — sekce pro aktuálně zvolený rok (z YearSelector):

```
Stav členství:   aktivní                     ← nebo "do 26. 3. 2026" / "od 1. 3. 2026"
☑ Člen výboru
☐ Vedoucí TOM
Individuální sleva   —    [Nastavit]
☐ Zrevidováno                                ← dočasné, bude odstraněno po revizi dat
```

- Žádné konkrétní datumy — jen stav slovně vyjádřený
- Změna roku přes YearSelector v top baru aktualizuje tuto sekci

---

**Navigace z detailu (do zásobníku):**
- `Příspěvky` → `/dashboard/contributions?member=123` (bez roku), label: `← Člen: Jan Novák`
- `Lodě` → `/dashboard/boats?member=123` (bez roku), label: `← Člen: Jan Novák`
- `Brigády` → `/dashboard/brigades?member=123`, label: `← Člen: Jan Novák`
- `Platby` → `/dashboard/payments?member=123`, label: `← Člen: Jan Novák`
- `Audit log` → otevře modální overlay nebo novou stránku s kompletní historií změn pro tohoto člena

---

### 10.3 Rozhodnutí — Členové

- **Rok v URL detailu** ✅ — `?year=2026` součástí URL, sekce Členství se přepočítá
- **Stav příspěvku na přehledu** ✅ — pro zvolený rok
- **"Přidat člena"** — **wizard** (3 kroky): základní údaje → příspěvek pro rok → loď. Stránka `/dashboard/members/new` nebo vícekrokový modal — řeší se při implementaci.

---

## 11. Co není součástí tohoto zadání

- Změna datového modelu (to řeší separátní zadání pro V1 ledger, rekonciliaci apod.)
- Nové funkce (brigády, akce apod.) — UX model se na ně aplikuje, ale obsah jejich detailů řeší separátní zadání
- Auth a přístupová práva — architektura se musí počítat s nimi, implementace jako V2

---

## Postup

1. ~~Doplnit/odsouhlasit otevřené otázky~~ — ✅ hotovo (sekce 9)
2. **Detailní popis** pro každý typ stránky: přehled, detail, filtr panel — rozložení, komponenty, chování.
3. **Prioritizace** — které entity a stránky jako první (candidates: členové, příspěvky, platby).
4. **Technická analýza** — jak to ovlivní routing, session storage zásobník, mobilní layout, sdílené komponenty.
5. **Implementace po etapách** — nejdřív jedna entita jako vzor (design system pro detail stránku), pak ostatní.

---

*Dokument se průběžně doplňuje. Poslední aktualizace: 2026-04-23*

### Změnový log

| Datum | Co se změnilo |
|---|---|
| 2026-04-23 | Vznik dokumentu — základní struktura, navigační model, filtry, mobile-first, entity |
| 2026-04-23 | Rozhodnutí 9A–9E, cross-entity filtr na člena (sekce 2.2) |
| 2026-04-23 | Připomínky: přehled jako kontextový view, back jen s historií, řazení v hlavičce, aktivní filtr s názvem hodnoty, max 3 akční prvky, příspěvky = member_contributions |
| 2026-04-23 | 9B rozhodnuto: bottom bar (Členové/Příspěvky/Platby/···) + drawer pro zbytek; hamburger vyloučen kvůli kolizi s back šipkou |
| 2026-04-23 | Sekce 10: detailní popis stránek Členové (přehled + detail) |
| 2026-04-23 | Sekce 10 přepracována: záhlaví na 1 řádek, sloupce, GDPR pole, akcní menu, rok=all, nečlenové arch. poznámka |
