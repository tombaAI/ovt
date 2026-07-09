---
status: navrh
---

# Zadání: Dotace převyšující náklad účastníka — nevyužitá část propadá

> **Stav: Návrh.** Analýza problému a návrh řešení; čeká na grilování. Navazuje na kanonický algoritmus [2026-06-24-vypocet-nakladu-akce.md](2026-06-24-vypocet-nakladu-akce.md) (kroky 6–7).
>
> **Rozhodnuto uživatelem (2026-07-09):** řešením je **varianta B (water-filling redistribuce)**. Závazné omezení: **u akcí, kde už jsou předpisy vygenerované, se výpočet nesmí změnit** — viz sekce „Zpětná kompatibilita".

## Problém (jak ho vnímá uživatel)

Když je na akci člen oddílu s **malými nebo nulovými náklady** (typicky organizátor/řidič s koeficientem 0, nebo účastník jen části akce), vyúčtování mu přizná plnou dotaci na člena, která je **vyšší než jeho skutečný náklad**. Dva důsledky:

1. **Náklady se mu v zobrazení uměle navýší na výši dotace** — aby se nedostal do záporu (klub mu nesmí za účast platit), jeho „Cena akce" se v UI i v e-mailu ukáže jako částka dotace, ne jako skutečný (malý/nulový) náklad.
2. **Nevyužitá část dotace de-facto propadne** — nesnížila nikomu platbu, nezůstala ani explicitně klubu ve vykazování. Schválená dotace se tváří jako plně rozdaná, ale část z ní reálně nic nekryla.

## Analýza příčiny (kde v kódu k tomu dochází)

Kanonický algoritmus (`src/lib/settlement-calc.ts` + `getEventSettlement` v `src/lib/actions/event-settlement.ts`):

- **Krok 6** — `computeSubsidyPerMember`: `subsidyPerMember = floor(subsidyTotal / totalMemberParticipants)`. Rovný podíl pro **každého** aktivního člena, **bez ohledu na jeho skutečný náklad** (`event-settlement.ts:408`: `subsidyAmount = k.memberId !== null ? subsidyPerMember : 0`).
- **Krok 7** — `computeParticipantFinalAmount`: `finalAmount = ceil(max(0, totalCost − subsidyAmount))`. Clamp `max(0, …)` správně zabrání záporné platbě, ale **přebytek dotace nad nákladem tiše zahodí**.
- **Zobrazení** — pravidlo „Cena akce − Dotace = K zaplacení musí přesně sedět" odvozuje hrubou cenu zpětně: `displayGrossCost = finalAmount + subsidyAmount`. U člena s `totalCost < subsidyAmount` je `finalAmount = 0`, takže se zobrazí `0 + subsidyAmount` — **to je to „umělé navýšení nákladů na výši dotace"**. Stejný vzorec je i v e-mailu s předpisem (`event-settlement.ts:1439`).

### Číselný příklad (fixture „Zahraniční zájezd – Isel", event id 4)

`subsidyTotal = 5 000`, 19 aktivních členů → `subsidyPerMember = floor(5000/19) = 263 Kč`.

Hypotetický člen-organizátor s koeficientem 0 na všech nákladech (obdoba Štěpána Klepače, který je ale ve fixture nečlen):

| | dnes | správně (intuice) |
|---|---|---|
| skutečný náklad (`totalCost`) | 0 Kč | 0 Kč |
| přiznaná dotace (`subsidyAmount`) | 263 Kč | 0 Kč |
| k zaplacení (`finalAmount`) | 0 Kč | 0 Kč |
| zobrazená „Cena akce" | **263 Kč** (umělá) | 0 Kč |
| využití dotace | 263 Kč **propadne** | 263 Kč k dispozici ostatním členům (nebo explicitně zůstane klubu) |

Totéž s částečným nákladem: člen s `totalCost = 100` dnes dostane dotaci 263, platí 0, zobrazí se cena 263 (reálná je 100) a 163 Kč propadne.

### Dopad na kontrolní součet akce

V sekci „Issue: dvojí započtení propadlé zálohy" spec dokumentu se „Dotace (skutečně přiznaná)" počítá jako `subsidyPerMember × totalMemberParticipants`. Pokud část dotace nic nekryla, je tahle položka **nadhodnocená o nevyužitou část** — kontrolní bilance akce (zálohy + doplatky + dotace = náklady) pak vychází jen proto, že se chyba schová do zdánlivě vyšší dotace. Vykazování hospodáři je tím zkreslené.

## Navrhované řešení

### Varianta B — redistribuce nevyužité dotace mezi ostatní členy (VYBRÁNO)

Dotace je schválená částka určená členům; nevyužitý podíl jednoho člena se má rozdělit mezi členy, kterým náklad dotaci stále převyšuje. Klasický „water-filling" — nikdo nedostane víc než svůj skutečný náklad, schválený celek se využije maximálně možně:

```
zbývá = subsidyTotal
M = aktivní členové (memberId != null)
opakuj (konverguje ≤ |M| iterací):
    podíl = zbývá / |M|                       // plná přesnost
    L = { p ∈ M : totalCost(p) < podíl }
    pokud L je prázdná:
        každému p ∈ M: přiznáno(p) = podíl
        konec
    jinak:
        každému p ∈ L: přiznáno(p) = totalCost(p)   // dotace = přesně jeho náklad
        zbývá −= Σ přiznáno(L);  M = M − L

na závěr: subsidyAmount(p) = floor(přiznáno(p))     // zaokrouhlení DOLŮ zachováno (princip kroku 6)
```

- Krok 7 zůstává beze změny (`ceil(max(0, totalCost − subsidyAmount))`) — clamp se stane pojistkou, která už reálně nezasahuje.
- Zobrazovací pravidlo `displayGrossCost = finalAmount + subsidyAmount` zůstává v platnosti a **začne ukazovat skutečnou cenu** (u kapnutého člena `0 + ~totalCost`), pravidlo „Cena − Dotace = K zaplacení" dál sedí přesně.
- Invarianty: `Σ subsidyAmount ≤ subsidyTotal` (floor na závěr), `subsidyAmount(p) ≤ ceil(totalCost(p))`, `finalAmount(p) ≥ 0`, žádný člen neplatí víc než podle dnešního algoritmu (redistribuce platby jen snižuje).
- Příklad výše: organizátor dostane 0, zbylých 18 členů si dělí celých 5 000 → `floor(5000/18) = 277 Kč` místo 263 Kč.

### Varianta A — jen cap dotace na skutečný náklad (zamítnuto — ponecháno pro kontext)

`subsidyAmount(p) = min(subsidyPerMember, totalCost(p))` (se zaokrouhlením, viz otevřené otázky). Opraví umělé navýšení ceny i zkreslené vykazování — nevyužitá část dotace **explicitně zůstává klubu** (viditelně v souhrnu: „dotace schválená / využitá / nevyužitá"). Neredistribuuje. Jednodušší, ale „propadnutí" řeší jen průhledností, ne využitím.

### Varianta C — nechat výpočet, opravit jen zobrazení (zamítnuto)

Ukázat skutečný `totalCost` a rozlišit „dotace využitá / nevyužitá". Neřeší podstatu, jen zprůhledňuje — uvedena pro úplnost.

**Rozhodnutí (2026-07-09): Varianta B.** Cap z varianty A je v ní obsažen inherentně a naplňuje záměr dotace (podpora členů, ne papírové číslo).

## Zpětná kompatibilita — akce s vygenerovanými předpisy se NEsmí přepočítat (závazné)

`getEventSettlement` počítá vždy živě, takže změna algoritmu by okamžitě změnila zobrazená čísla i u akcí, kde už byly předpisy vygenerované (a případně rozeslané e-maily / spárované platby). To je nepřijatelné — **jednou vygenerované předpisy musí navždy odpovídat algoritmu, kterým vznikly**. Pozor: gate podle aktuálního `billing_status` nestačí, protože `unlockBilling` vrací akci do `draft` (předpisy se nemažou) — akce „kdysi prescribed, teď draft" by tiše přeskočila na nový algoritmus.

**Řešení: verze algoritmu uložená na akci (pinning).**

- Nový sloupec `events.settlement_algo_version` (`integer NOT NULL`): `1` = plošná dotace (dnešní krok 6), `2` = water-filling (varianta B).
- **Migrace (backfill):** existující akce, u kterých kdy proběhlo generování předpisů, dostanou `1`; ostatní `2`. Kritérium „kdy proběhlo generování": `billing_status = 'prescribed'` **NEBO** existuje settlement předpis s `amount > 0` **NEBO** jakýkoli předpis akce s `email_sent_at IS NOT NULL` / `status IN ('matched','paid')` (pokrývá i akce po `unlockBilling`). Default sloupce pro nové akce: `2`.
- `getEventSettlement` čte verzi z akce a podle ní volá starý (`computeSubsidyPerMember` plošně) nebo nový (`computeSubsidyAmounts`) výpočet dotace. Zbytek algoritmu (kroky 1–5, 7–8) je pro obě verze společný.
- Verze se **nikdy automaticky nemění** — ani při `unlockBilling` + `regeneratePrescriptions` staré akce. Případný explicitní admin přechod staré akce na v2 je otevřená otázka (viz níže), default je žádný.
- Starý kód kroku 6 se tedy neodstraňuje — zůstává jako verze 1 vedle verze 2, obojí kryté unit testy.

## Dotčená místa

| Místo | Změna |
|---|---|
| `src/lib/settlement-calc.ts` | nová čistá funkce (např. `computeSubsidyAmounts(subsidyTotal, membersWithCosts) → Map<key, number>`), nahradí prosté `computeSubsidyPerMember` + plošné přiznání |
| `src/lib/actions/event-settlement.ts` (`getEventSettlement`, ~ř. 387–410) | volat výpočet dle `settlement_algo_version` akce; `subsidyAmount` per účastník místo konstanty |
| `src/db/schema.ts` + migrace `supabase/migrations/` | sloupec `events.settlement_algo_version` (default `2`) + backfill `1` pro akce s kdy vygenerovanými předpisy |
| `zadani/2026-06-24-vypocet-nakladu-akce.md` | aktualizovat krok 6 (a poznámku ke kroku 7) po schválení |
| UI Náklady/Platby + e-mail s předpisem | beze změny vzorců (`finalAmount + subsidyAmount` dál platí); zvážit řádek „dotace nevyužitá — zůstává klubu" v souhrnu akce |
| unit testy (`settlement-calc.test.ts`) | testy nové funkce — viz níže |

## Testy (závazné dle 2026-07-06-automaticke-testy.md)

Nejdřív **regresní test reprodukující dnešní chování** (člen s `totalCost < subsidyPerMember` → umělá cena, propadlá dotace), pak implementace. Minimální sada pro `computeSubsidyAmounts`:

1. Všichni členové s nákladem ≥ podíl → shodné s dnešním `floor(subsidyTotal / n)` (regrese stávajících čísel fixture: 263 Kč, doplatky 1815/4315/3893/…).
2. Jeden člen s nákladem 0 → dostane 0, ostatní `floor(subsidyTotal / (n−1))`.
3. Člen s částečným nákladem (0 < cost < podíl) → dostane přesně svůj náklad, zbytek se přerozdělí.
4. Σ nákladů všech členů < subsidyTotal → každý dostane svůj náklad, zbytek explicitně nevyužit (`Σ subsidyAmount < subsidyTotal`).
5. `totalMemberParticipants = 0` → prázdný výsledek (dnešní chování zachováno).
6. Invarianty na náhodných vstupech: `Σ ≤ subsidyTotal`, žádné záporné, `finalAmount ≥ 0`.
7. **Pinning verze**: akce s `settlement_algo_version = 1` dává přesně dnešní čísla (regrese fixture beze změny); verze `2` water-filling. Backfill migrace ověřit na staging DB (akce „Isel" má být `1`).

## Rozhodnuto (2026-07-09)

- **Varianta B (water-filling)** — vybráno uživatelem.
- **Žádná změna výpočtu u akcí s vygenerovanými předpisy** — řešeno pinningem `settlement_algo_version` (viz „Zpětná kompatibilita").

## Otevřené otázky (ke grilování)

1. **Zaokrouhlení capu**: člen s `totalCost = 100,6` — dotace `floor(100,6) = 100` znamená doplatek `ceil(0,6) = 1 Kč` (drobná platba „za nic"), dotace `ceil(100,6) = 101` znamená přiznat o <1 Kč víc než náklad. Co je pro hospodáře přijatelnější? (Návrh: `ceil` u kapnutých členů — nikdo neplatí haléřové doplatky; invariant Σ ≤ subsidyTotal je třeba doložit/ošetřit.)
2. Má se v souhrnu akce zobrazovat trojice „dotace schválená / využitá / nevyužitá"?
3. Má mít admin možnost **explicitně** převést starou akci (verze 1) na water-filling (verze 2) — např. při vědomém odemčení a přegenerování předpisů? Default návrhu: ne, verze je neměnná.

## Vazby

- [2026-06-24-vypocet-nakladu-akce.md](2026-06-24-vypocet-nakladu-akce.md) — kanonický algoritmus (kroky 6–7 se mění, ostatní beze změny).
- [2026-07-06-automaticke-testy.md](2026-07-06-automaticke-testy.md) — pravidlo „regresní test před fixem výpočtu".
- Fixture: akce „Zahraniční zájezd – Isel" (staging, event id 4) — pozor, žádný člen tam dnes nemá `totalCost < 263`, pro testy je třeba syntetický případ (unit test, ne staging data).
