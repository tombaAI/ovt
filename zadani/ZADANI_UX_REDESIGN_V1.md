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
- Speciální hodnota `year=all` je jen lokální temporary režim daného přehledu a nemění globální `YearSelector` vpravo nahoře.

---

## 2. Filtrování

### 2.1 Struktura filtrů

Každý přehled má maximálně **3 výrazné one-click filtry** (badge/pill) pro nejčastěji používané stavy. Zbytek filtrů je dostupný přes **rozbalovací menu „Filtrovat"**.

Řazení je v záhlaví sloupce tabulky — viz sekce 2.4.

### 2.4 Řazení v přehledech

Řazení se ovládá kliknutím na záhlaví sloupce tabulky. Platí tyto obecné principy:

**Záhlaví sloupce:** Název sloupce (nebo jeho část) je klikatelné. U vícehodnotových sloupců (např. „Jméno Příjmení (přezdívka)") je každá hodnota klikatelná samostatně.

**Šipka:** Aktivní třídící pole má bezprostředně za sebou šipku označující směr (`↑` vzestupně, `↓` sestupně). Ostatní pole šipku nemají.

**Chování při kliknutí:**
- Klik na pole, podle kterého se **nyní neřadí** → řazení podle tohoto pole, směr ASC.
- Klik na pole, podle kterého se **nyní řadí** → přepnutí směru (ASC ↔ DESC).

**Výchozí stav:** Každý přehled má definované výchozí pole a směr. U přehledu členů je výchozí řazení podle Příjmení ASC.

**Null hodnoty:** Položky bez hodnoty řazeného pole jsou vždy na konci (bez ohledu na směr).

**Sekundární řazení:** Pokud si jsou dvě položky podle hlavního pole rovny, sekundárně se řadí podle Příjmení ASC (nebo jiného definovaného sekundárního klíče přehledu).

**URL persistance:** Aktuální řazení je součástí URL (`?sort=cskNumber&dir=desc`). Výchozí hodnoty (výchozí pole + ASC) se do URL nezapisují.

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
| Platba | `/payments` | `/payments/[id]` | Spárovat, potvrdit, rozdělit, ignorovat |
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

- **Jméno** = `{jméno} {příjmení}` + `({přezdívka})` pokud existuje — stejný formát jako záhlaví sloupce
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
  - `Příspěvky` — přímé tlačítko → přehled příspěvků filtrovaný na člena s `year=all`; globální `YearSelector` se tím nemění
  - `Lodě` — přímé tlačítko → přehled lodí filtrovaný na člena, bez roku
  - `▾` rozbalovací menu: Brigády / Platby / Audit log / Ukončit členství

**Navigace na kompletní historii:** Přehledy příspěvků, brigád a plateb mají v URL filtru explicitní režim `year=all`. Z detailu člena se na ně v tomto případě odkazuje s `year=all` — uživatel vidí kompletní historii, ale globální `YearSelector` zůstává na naposledy zvoleném konkrétním roce. Volba „všechny roky" je v přehledech dostupná, ale záměrně trochu schovaná (není v badge filtrech, je v rozbalovacím filtru).

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
- `Příspěvky` → `/dashboard/contributions?member=123&year=all`, label: `← Člen: Jan Novák`
- `Lodě` → `/dashboard/boats?member=123` (bez roku), label: `← Člen: Jan Novák`
- `Brigády` → `/dashboard/brigades?member=123`, label: `← Člen: Jan Novák`
- `Platby` → `/dashboard/payments?member=123&year=all`, label: `← Člen: Jan Novák`
- `Audit log` → otevře modální overlay nebo novou stránku s kompletní historií změn pro tohoto člena

---

### 10.3 Rozhodnutí — Členové

- **Rok v URL detailu** ✅ — `?year=2026` součástí URL, sekce Členství se přepočítá
- **Stav příspěvku na přehledu** ✅ — pro zvolený rok
- **"Přidat člena"** — **wizard** (3 kroky): základní údaje → příspěvek pro rok → loď. Stránka `/dashboard/members/new` nebo vícekrokový modal — řeší se při implementaci.

---

## 11. Popis stránek — Příspěvky

### 11.1 Přehled příspěvků (`/dashboard/contributions`)

**Navigační titulek (back šipka z jiné stránky):** `← Přehled příspěvků`

**URL parametry:** `?year=2026&filter=issues&member=123&q=novák&sort=lastName&dir=asc`

---

**Horní pracovní řádek** — vše mezi nadpisem stránky a hlavičkou tabulky je na desktopu jeden souvislý řádek; na mobilu zůstává jako jeden horizontálně scrollovatelný pás, ne jako několik samostatných bloků pod sebou.

Tento řádek obsahuje:
- **Pracovní ovládání**: lokální titulek (`Příspěvky 2026` nebo `Příspěvky — všechny roky`), `Hledat`, tři hlavní badge filtry, případný `MemberFilterChip`, `Filtrovat ▾` a podle potřeby servisní akci `Připravit předpisy`
- **Rozpad roční konfigurace příspěvků**: `Člen 1 500 Kč`, `Loď 1 200 Kč / 800 Kč`, `Brigáda +400 Kč`, `Sleva výbor −500 Kč`, `Sleva TOM −500 Kč`, `Splatnost 2026-05-29`, `Účet 2701772934/2010`
- **Souhrnné boxy** v tomto přesném pořadí: `Vybráno / očekáváno`, `Potvrzený předpis`, `Problematické k řešení`, `Platby k párování`

- Rok pochází z globálního `YearSelector`; při `year=all` jde jen o lokální temporary režim tohoto přehledu a globální rok vpravo nahoře se nemění
- Pokud je aktivní filtr na člena, vybraný člen je zobrazen jako odstraňovatelný chip vedle badge filtrů
- Textové hledání je v jednom řádku s filtry; hledá minimálně jméno, příjmení, přezdívku a částku
- V záhlaví není žádný badge ani jiný prvek pro `stav období`

**Souhrnné boxy — přesný obsah a pořadí:**
- `Vybráno / očekáváno` — hlavní hodnota `0 Kč`, pod ní druhý řádek `z 113 110 Kč`
- `Potvrzený předpis` — hlavní hodnota `109 210 Kč`, pod ní druhý řádek `Rozdíl: 3 900 Kč`
- `Problematické k řešení` — počet předpisů, kde je něco zaplaceno, ale jinak, než očekáváme
- `Platby k párování` — počet plateb, které jsou kandidáti na párování; zatím bude tato hodnota v návrhu fixně `0`

**Filtry (badge pills — max 3):**
- `Problémy` — výchozí; vše kromě přesně zaplacených předpisů
- `Nezaplaceno` — `paidTotal = 0`
- `S úkolem` — mají `todo_note`

**Rozbalovací filtr „Filtrovat ▾":**
- **Stav platby** — radio: Nezaplaceno / Nedoplatek / Přeplatek / Zaplaceno
- **Stav zpracování** — radio: Nový / Zkontrolováno / Odeslán mail
- **Člen** — shared autocomplete + chip (`MemberFilterChip`)
- **Rok** — aktuální rok / všechny roky; `year=all` je jen lokální override přehledu a nemění globální `YearSelector`

**Řazení** — v záhlaví: `Jméno` / `Příjmení` / `Přezdívka` / `Datum` / `Stav`
- `Jméno`, `Příjmení` a `Přezdívka` se řadí úplně stejně jako na members
- `Datum` = datum poslední potvrzené platby; pokud ještě žádná není, zobrazuje se `—`
- `Stav` = hlavní stav předpisu (`Nezaplaceno` / `Méně` / `Více` / `V pořádku`)
- Výchozí řazení pro roční pracovní pohled: `Příjmení ASC`

---

**Tabulka — desktop (roční pracovní pohled):**

| Člen | Badges | Předpis | Zaplaceno | Rozdíl | Datum | Stav |
|---|---|---|---|---|---|---|
| Jan Novák (Johny) | `Loď` `Výbor` | 3 200 Kč | 0 Kč | -3 200 Kč | — | `Nezaplaceno` |
| Marie Hořejší | `📋 úkol` | 1 000 Kč | 1 000 Kč | 0 Kč | 20. 3. 2026 | `V pořádku` |
| Petr Kolář | `Bez brigády` | 1 500 Kč | 2 000 Kč | +500 Kč | 1. 3. 2026 | `Více` |

- V ročním přehledu má každý člen právě jeden řádek
- **Člen** = `{jméno} {příjmení}` + `({přezdívka})` pokud existuje; stejné klikatelné části slouží i pro řazení jako na members
- **Badges** mají vlastní samostatný sloupec a nesmí být vmáčknuté pod jméno člena
- **Předpis** = `amount_total`
- **Zaplaceno** = součet potvrzených alokací
- **Rozdíl** = `paidTotal - amountTotal`; záporná hodnota = nedoplatek, kladná = přeplatek
- **Datum** = datum poslední potvrzené platby; pokud ještě žádná není, `—`
- **Stav** = hlavní stav předpisu
- Klik na řádek → detail příspěvku; back label zachová kontext (`← Příspěvky 2026` nebo `← Příspěvky: Jan Novák`)

**Tabulka — mobil:**

| Člen | Stav | Kontext |
|---|---|---|
| Jan Novák (Johny) | `Nezaplaceno` | Předpis 3 200 Kč · Zaplaceno 0 Kč |
| Marie Hořejší | `V pořádku` | Předpis 1 000 Kč · Datum 20. 3. 2026 |

- Každý člen má v ročním pohledu jednu kartu
- Badges zůstávají na samostatném řádku karty, nelepí se do názvu člena
- Kontextový řádek zobrazuje minimálně `Předpis`, `Zaplaceno`, `Rozdíl` nebo `Datum` podle toho, co je pro řádek nejdůležitější

**Prázdné stavy:**
- Pokud filtr vrátí 0 řádků: `Žádné výsledky` + `Zrušit filtry`
- Pokud pro zvolený rok neexistují připravené příspěvky: jednoduchý stav `Pro rok 2026 zatím nejsou připravené příspěvky.` + CTA `Připravit předpisy`

---

**Architektonická poznámka — hranice contributions vs. payments:**

Přehled příspěvků zobrazuje **předpisy a jejich krytí platbami**, nikoli frontu bankovní rekonciliace. Nevyřešené, navržené nebo rozdělované bankovní transakce patří na `/dashboard/payments`; do contributions se propisuje až jejich výsledek vůči konkrétnímu předpisu.

---

### 11.2 Detail příspěvku (`/dashboard/contributions/[id]`)

**Navigační titulek (pro zásobník):** `Příspěvky 2026: Jan Novák`

**URL:** `/dashboard/contributions/456?year=2026`

---

**Horní lišta:**
```
[← Příspěvky 2026]        Příspěvky 2026: Jan Novák        [Člen]  [Přidat platbu]  [▾ Odeslat email / Platby / Audit log / Přepočítat / Smazat předpis]
```
- Back šipka jen pokud zásobník není prázdný
- Akce vpravo (max 3 vizuální prvky):
  - `Člen` — přímé tlačítko → detail člena pro stejný rok
  - `Přidat platbu` — přímé tlačítko → skok na sekci plateb / otevření formuláře pro novou platbu
  - `▾` rozbalovací menu: Odeslat email / Platby / Audit log / Přepočítat předpis / Smazat předpis

---

**Souhrn příspěvku** — horní sekce stránky:

```
Člen              Jan Novák        [otevřít detail člena]
Rok               2026
Stav platby       nezaplaceno / méně / více / v pořádku
Stav zpracování   nový / zkontrolováno / mail odeslán
Datum splatnosti  31. 3. 2026
```

- Jméno člena je klikatelné a vede na detail člena
- Stav platby je hlavní stav detailu; stav zpracování je sekundární metadata

**Předpis** — rozpad částek:

```
Základní příspěvek      1 000 Kč
Loď 1                   1 200 Kč
Loď 2                     800 Kč
Penále bez brigády        500 Kč
Sleva výbor              −200 Kč
Sleva TOM                  —
Individuální sleva       −300 Kč   [upravit]
Předpis celkem          3 000 Kč
```

- Většina řádků je odvozená z pravidel roku a z dat člena; přímo editovatelná zůstává hlavně individuální sleva
- Manuální zásah do výpočtu nebo přepočet předpisu je akce z funkčního menu, ne rozesetá tlačítka uvnitř obsahu

**Platby** — samostatná sekce na stránce:

| Datum | Částka | Zdroj | Poznámka |
|---|---|---|---|
| 15. 2. 2026 | 1 000 Kč | Banka / hotově | — |
| 20. 3. 2026 | 2 000 Kč | Banka / hotově | doplatek |

- Každá platba je kliknutelná a vede na detail platby
- Pod seznamem je souhrn `Zaplaceno celkem` + `Nedoplatek/Přeplatek`
- Přidání platby je součástí stejné sekce; na mobilu může být formulář sbalený pod CTA `Přidat platbu`

**Úkol a komunikace:**

```
Úkol                — [edit + Vyřešeno]
☐ Zrevidováno
Poslední email      12. 2. 2026 14:20 — Upomínka
```

- Úkol zůstává inline editovatelný stejně jako na members
- Revize je jednoduchý checkbox v detailu příspěvku
- Historie emailů je na stránce viditelná jako seznam, audit log může být samostatná stránka nebo overlay z menu

**Platební údaje:**

```
Číslo účtu          2701772934/2010
Variabilní symbol   207 101 123
Částka              3 000 Kč
QR platba           [QR]
```

- Sekce se zobrazuje jen pokud má předpis nenulovou částku
- QR a platební údaje slouží jako podklad pro email/reminder i pro ruční sdílení

---

**Navigace z detailu (do zásobníku):**
- `Člen` → `/dashboard/members/123?year=2026`, label: `← Příspěvky 2026: Jan Novák`
- `Platby` → `/dashboard/payments?member=123&year=2026`, label: `← Příspěvky 2026: Jan Novák`
- konkrétní platba v seznamu → `/dashboard/payments/[id]`, label: `← Příspěvky 2026: Jan Novák`

---

### 11.3 Rozhodnutí — Příspěvky

- **`year=all` v přehledu** ✅ — ano; je to explicitní lokální temporary režim přehledu a nemění globální `YearSelector`
- **Stav období rušíme** ✅ — pryč z UI i z databáze včetně sloupce a navázané funkčnosti; zůstává jen roční konfigurace příspěvků a procesní akce nad předpisy
- **Detail příspěvku** ✅ — ano; samostatná stránka jako page varianta dnešního `PaymentSheetu`
- **Rekonciliace banky zůstává v Payments** ✅ — ano; contributions pracují s předpisem a jeho krytím, nikoli s frontou nevyřešených bankovních transakcí
- **Bez připravených příspěvků pro rok** ✅ — co nejjednodušší prázdný stav + jedno CTA `Připravit předpisy`; další workflow teď neřešíme

---

## 12. Popis stránek — Platby

### 12.1 Přehled plateb (`/dashboard/payments`)

**Navigační titulek (back šipka z jiné stránky):** `← Platební ledger`

**URL parametry:** `?year=2026&status=open&member=123&source=fio_bank&q=123456&sort=paidAt&dir=desc`

---

**Záhlaví + ovládací prvky** — na širší obrazovce na jednom řádku, na užší se zalomí:
```
Platby 2026   [🔍 Hledat…]   [K řešení|9] [Nespárováno|5] [Ke kontrole|4] [Jan Novák ✕]   [Filtrovat ▾]   [Historie importů]
```
- Stránka reprezentuje **ledger příchozích plateb**, ne seznam ručně evidovaných plateb člena
- Rok pochází z globálního `YearSelector`; je i součástí URL
- Přehled musí podporovat i `year=all`; tato volba je primárně pro příchod z detailu člena a z detailu příspěvku na kompletní historii plateb
- Textové hledání hledá minimálně variabilní symbol, jméno člena, protistranu a zprávu pro příjemce
- Pokud je aktivní filtr na člena, vybraný člen je zobrazen jako odstraňovatelný chip vedle badge filtrů

**Filtry (badge pills — max 3):**
- `K řešení` — výchozí; sjednocuje `Nespárováno` + `Ke kontrole`
- `Nespárováno` — ledger položky bez alokace
- `Ke kontrole` — auto-match návrhy čekající na potvrzení adminem

**Rozbalovací filtr „Filtrovat ▾":**
- **Stav** — radio: Nespárováno / Ke kontrole / Potvrzeno / Ignorováno
- **Zdroj** — radio nebo grouped choices: Fio banka / konkrétní profil bankovního souboru / Hotovost
- **Člen** — shared autocomplete + chip (`MemberFilterChip`)
- **Rok** — aktuální rok / všechny roky
- **Další** — toggle: Bez VS

**Řazení** — v záhlaví: `Datum` / `Částka` / `Stav` / `Zdroj`
- Výchozí řazení: `Datum DESC`
- Sekundární řazení: `Částka DESC`, pak `ID DESC`

---

**Tabulka — desktop:**

| Datum | Částka | VS | Protistrana / Zpráva | Zdroj | Stav | Párování |
|---|---|---|---|---|---|---|
| 15. 2. 2026 | 1 000 Kč | 12345 | Jan Novák / členský příspěvek | `Fio` | `Nespárováno` | — |
| 20. 2. 2026 | 3 000 Kč | 12345 | Jan Novák | `Air Bank` | `Ke kontrole` | `Jan Novák — 2026` |
| 1. 3. 2026 | 2 000 Kč | 54321 | Marie Hořejší | `Hotovost` | `Potvrzeno` | `Marie Hořejší — 2026` |

- **Datum** = datum přijetí platby
- **Částka** = částka ledger položky, ne částka jednotlivé alokace
- **VS** = variabilní symbol; při chybějícím VS se zobrazí `—`
- **Protistrana / Zpráva** = jméno účtu protistrany, číslo účtu a zpráva; dlouhé texty se krátí
- **Zdroj** = Fio banka / bankovní soubor podle profilu / hotovost
- **Stav** = `Nespárováno` / `Ke kontrole` / `Potvrzeno` / `Ignorováno`
- **Párování** = jméno člena nebo seznam alokací; při splitu se zobrazí více řádků nebo badge položky
- Klik na řádek → detail platby; back label zachová kontext (`← Platby 2026`, `← Platby: Jan Novák`, `← Platby k příspěvku 2026`)

**Tabulka — mobil:**

| Částka | Stav | Kontext |
|---|---|---|
| 1 000 Kč | `Nespárováno` | 15. 2. 2026 · VS 12345 |
| 3 000 Kč | `Ke kontrole` | Air Bank · Jan Novák |

- Karta zobrazuje částku a stav v prvním řádku, datum/VS/zdroj ve druhém a případné párování ve třetím
- U potvrzených nebo navržených plateb se na kartě ukazuje jméno člena; u splitu počet alokačních řádků (`2 alokace`)

**Prázdné stavy:**
- Pokud filtr vrátí 0 řádků: `Žádné výsledky` + `Zrušit filtry`
- Pokud ve zvoleném roce nejsou žádné ledger položky: `Pro rok 2026 zatím nejsou evidované žádné platby.`
- Pokud nejsou žádné importy bankovních výpisů: CTA na nahrání výpisu z importů

---

**Kontextová stránka — historie importů:**

`/dashboard/payments/history` je **kontextový přehled** navázaný na payments, ne samostatná byznys entita. Zobrazuje importní běhy bankovních souborů, jejich profil, soubor a stav spárování. Zpět vede vždy do přehledu payments.

---

### 12.2 Detail platby (`/dashboard/payments/[id]`)

**Navigační titulek (pro zásobník):** `Platba 1 000 Kč — 15. 2. 2026`

**URL:** `/dashboard/payments/123?year=2026`

---

**Horní lišta:**

**Varianta A — nespárovaná platba:**
```
[← Platby 2026]        Platba 1 000 Kč        [Spárovat]  [Rozdělit]  [▾ Zkusit auto-match / Ignorovat / Historie importu]
```

**Varianta B — navržené párování:**
```
[← Platby 2026]        Platba 3 000 Kč        [Potvrdit]  [Jiný člen]  [▾ Rozdělit / Ignorovat / Historie importu]
```

**Varianta C — potvrzená platba:**
```
[← Platby 2026]        Platba 3 000 Kč        [Příspěvek]  [Člen]  [▾ Odpárovat / Historie importu]
```

- Back šipka jen pokud zásobník není prázdný
- Složení akční lišty je **stavové**; vždy max 3 vizuální prvky vpravo
- U splitu může být `Příspěvek` nahrazen rozbalovacím menu `Otevřít alokaci…`

---

**Souhrn platby** — horní sekce stránky:

```
Datum přijetí         15. 2. 2026
Částka               1 000 Kč
Stav                 nespárováno / ke kontrole / potvrzeno / ignorováno
Zdroj                Fio banka / Air Bank / hotovost
Variabilní symbol    12345
Protistrana          Jan Novák
Číslo účtu           123456789/2010
Zpráva               členský příspěvek
Poznámka             —
```

- Zdroj u bankovního souboru zobrazuje i název importního profilu
- U `ignored` stavu se zobrazuje důvod ignorace jako součást souhrnu

**Párování / alokace** — klíčová sekce detailu:

| Člen | Příspěvek | Částka | Stav |
|---|---|---|---|
| Jan Novák | 2026 | 1 000 Kč | `auto-návrh` |
| Marie Hořejší | 2026 | 2 000 Kč | `potvrzeno` |

- Každý řádek je kliknutelný: jméno člena vede na detail člena, předpis vede na detail příspěvku
- Jedna platba může mít 0, 1 nebo více alokací
- U `Ke kontrole` je zřetelně odlišené, že jde o návrh, ne potvrzené spárování

**Workflow sekce** — podle stavu platby:

**Nespárováno:**
```
[autocomplete člen / VS]
Vybraný člen: Jan Novák — zbývá 1 000 Kč
[Potvrdit párování]

[Rozdělit platbu]
část 1 → Jan Novák → 1 000 Kč
část 2 → Marie Hořejší → 2 000 Kč
```

**Ke kontrole:**
```
Navrhované párování: Jan Novák — 2026
[Potvrdit] [Jiný člen] [Rozdělit]
```

**Ignorováno:**
```
Důvod ignorace: vratka / nečlenská platba / test
[Obnovit]
```

- Složitější operace `Spárovat`, `Rozdělit`, `Jiný člen` zůstávají modální workflow i na detail stránce, jen se nespouštějí ze sheetu
- Split musí průběžně ukazovat součet částí a rozdíl vůči celé částce

**Importní kontext:**

```
Importní běh         10. 4. 2026 14:44
Profil              Air Bank
Zdrojový soubor     airbank_1024298088_2026-04-10_14-44.csv
[Otevřít historii importů]
```

- Sekce se zobrazuje jen u plateb pocházejících z bankovního souboru
- U Fio transakcí může být místo toho zobrazen identifikátor bankovní transakce

---

**Navigace z detailu (do zásobníku):**
- `Člen` → `/dashboard/members/123?year=2026`, label: `← Platba 1 000 Kč`
- `Příspěvek` → `/dashboard/contributions/456?year=2026`, label: `← Platba 1 000 Kč`
- `Historie importu` → `/dashboard/payments/history`, label: `← Platba 1 000 Kč`

---

### 12.3 Rozhodnutí — Platby

- **Payments = ledger příchozích plateb** ✅ — tato sekce neřeší předpisy, ale příchozí transakce a jejich alokaci na předpisy
- **Split je first-class scénář** ✅ — jedna platba může krýt více předpisů; detail i přehled to musí umět zobrazit bez „hacků"
- **Výchozí filtr = `K řešení`** ✅ — operational view je prioritně o nevyřešených položkách (`Nespárováno` + `Ke kontrole`)
- **Zdrojový filtr patří do `Filtrovat`** ✅ — kvůli více import profilům se nevejde do sady 3 hlavních badge filtrů
- **`year=all` musí fungovat i zde** ✅ — nutné pro příchod z detailu člena a z detailu příspěvku na kompletní historii plateb
- **Historie importů je kontextový view** ✅ — není to detail entity, ale servisní přehled dostupný z payments
- **Detail platby = page varianta dnešního `PaymentSheetu`** ✅ — převzít současné workflow `match / split / ignore / unmatch`, ale přesunout ho do samostatné detail stránky

---

## 13. Co není součástí tohoto zadání

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

*Dokument se průběžně doplňuje. Poslední aktualizace: 2026-04-26*

### Změnový log

| Datum | Co se změnilo |
|---|---|
| 2026-04-23 | Vznik dokumentu — základní struktura, navigační model, filtry, mobile-first, entity |
| 2026-04-23 | Rozhodnutí 9A–9E, cross-entity filtr na člena (sekce 2.2) |
| 2026-04-23 | Připomínky: přehled jako kontextový view, back jen s historií, řazení v hlavičce, aktivní filtr s názvem hodnoty, max 3 akční prvky, příspěvky = member_contributions |
| 2026-04-23 | 9B rozhodnuto: bottom bar (Členové/Příspěvky/Platby/···) + drawer pro zbytek; hamburger vyloučen kvůli kolizi s back šipkou |
| 2026-04-23 | Sekce 10: detailní popis stránek Členové (přehled + detail) |
| 2026-04-23 | Sekce 10 přepracována: záhlaví na 1 řádek, sloupce, GDPR pole, akcní menu, rok=all, nečlenové arch. poznámka |
| 2026-04-23 | Sekce 2.4: obecné principy řazení (klik na záhlaví, ASC/DESC toggle, null na konci, sekundární klíč, URL) |
| 2026-04-26 | Sekce 11: detailní popis stránek Příspěvky (přehled + detail), `year=all`, hranice vůči Payments, dva typy stavů a prázdný stav bez období |
| 2026-04-26 | Sekce 11 upravena: `year=all` jako lokální temporary filtr, horní pracovní pás v jednom řádku včetně rozpisu sazeb a KPI boxů, jeden řádek na člena a zrušení `stavu období` |
| 2026-04-26 | Sekce 12: detailní popis stránek Platby (ledger overview + detail), stavové akce, split jako first-class scénář, `K řešení` jako výchozí filtr a historie importů jako kontextový view |
