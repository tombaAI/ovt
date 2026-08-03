---
status: navrh
---

# Zadání: Dotace převyšující náklad účastníka — nevyužitá část propadá

> **Stav: POZASTAVENO (2026-08-03).** Analýza problému a volba řešení (varianta B, water-filling) jsou hotové a platí. Realizace čeká na samostatné zadání [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md) — obecný mechanismus „návrh vs. platná částka" pro `eventPaymentPrescriptions`. Bez něj by nasazení opravy algoritmu tiše změnilo částku u přihlášek, které už mají vygenerovaný (byť nezaplacený) předpis — viz „Zpětná kompatibilita" níže, teď nahrazená obecným mechanismem místo speciálního pinningu.
>
> Navazuje na kanonický algoritmus [2026-06-24-vypocet-nakladu-akce.md](2026-06-24-vypocet-nakladu-akce.md) (kroky 6–7).
>
> **Rozhodnuto uživatelem (2026-07-09):** řešením je **varianta B (water-filling redistribuce)**.

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

## Zpětná kompatibilita — řeší obecný mechanismus, ne speciální pinning

Původní návrh tady řešil zpětnou kompatibilitu speciálním sloupcem `events.settlement_algo_version` (pinning verze algoritmu per akce, s migrací a backfillem). Při rozboru vyšlo najevo, že jde o **instanci obecnějšího problému**: libovolná budoucí příčina přepočtu (ne jen tahle oprava) může u už vygenerovaného předpisu dát jiné číslo. Řešení je proto přesunuté do samostatného zadání [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md) — mechanismus „návrh vs. platná částka" na úrovni `eventPaymentPrescriptions`, který funguje pro libovolnou příčinu přepočtu, nejen pro tuhle opravu.

**Důsledek pro nasazení této opravy:** až bude mechanismus návrh/potvrzení hotový, nasazení nového `computeSubsidyAmounts` (water-filling) u akcí s už vygenerovaným (i nezaplaceným) předpisem vytvoří `proposedAmount` místo tichého přepisu — hospodář ho pak potvrdí jednotlivě/hromadně/částečně stejně jako u jakékoli jiné budoucí změny. Žádný sloupec ani migrace specifické pro tuhle opravu už nejsou potřeba.

## Dotčená místa

| Místo | Změna |
|---|---|
| `src/lib/settlement-calc.ts` | nová čistá funkce (např. `computeSubsidyAmounts(subsidyTotal, membersWithCosts) → Map<key, number>`), nahradí prosté `computeSubsidyPerMember` + plošné přiznání |
| `src/lib/actions/event-settlement.ts` (`getEventSettlement`, ~ř. 387–410) | `subsidyAmount` per účastník místo konstanty; nasazení chráněno mechanismem z [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md), žádná vlastní schema změna zde |
| `2026-06-24-vypocet-nakladu-akce.md` | aktualizovat krok 6 (a poznámku ke kroku 7) po schválení |
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
7. **Nasazení u akcí s existujícím předpisem**: regresní test/scénář ověřující, že změna výsledné částky projde jako `proposedAmount` (mechanismus z navazujícího zadání), ne jako tichý přepis.

## Rozhodnuto (2026-07-09)

- **Varianta B (water-filling)** — vybráno uživatelem.
- **Žádná tichá změna výpočtu u akcí s vygenerovanými předpisy** — řešeno obecným mechanismem návrh/potvrzení, viz [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md) (nahrazuje dřívější nápad s `settlement_algo_version` pinningem).

## Otevřené otázky (ke grilování)

1. **Zaokrouhlení capu**: člen s `totalCost = 100,6` — dotace `floor(100,6) = 100` znamená doplatek `ceil(0,6) = 1 Kč` (drobná platba „za nic"), dotace `ceil(100,6) = 101` znamená přiznat o <1 Kč víc než náklad. Co je pro hospodáře přijatelnější? (Návrh: `ceil` u kapnutých členů — nikdo neplatí haléřové doplatky; invariant Σ ≤ subsidyTotal je třeba doložit/ošetřit.)
2. Má se v souhrnu akce zobrazovat trojice „dotace schválená / využitá / nevyužitá"?

## Vazby

- [2026-08-03-schvalovani-zmeny-castky-predpisu.md](2026-08-03-schvalovani-zmeny-castky-predpisu.md) — **prerekvizita nasazení**, obecný mechanismus návrh/potvrzení, na kterém tahle oprava závisí.
- [2026-06-24-vypocet-nakladu-akce.md](2026-06-24-vypocet-nakladu-akce.md) — kanonický algoritmus (kroky 6–7 se mění, ostatní beze změny).
- [2026-07-06-automaticke-testy.md](2026-07-06-automaticke-testy.md) — pravidlo „regresní test před fixem výpočtu".
- Fixture: akce „Zahraniční zájezd – Isel" (staging, event id 4) — pozor, žádný člen tam dnes nemá `totalCost < 263`, pro testy je třeba syntetický případ (unit test, ne staging data).
