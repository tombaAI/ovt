---
status: produkce
---

# Zadání: Provozní výdaje — druhý oddíl (TOM)

> **Stav: Produkce (2026-09-02).** Smergováno do `main` přes PR #40. Ověřeno na staging — založení/uzamčení/odeslání provozního výdaje TOM, mail na TJ (barvy, texty, kopírovatelný seznam k platbě, zkrácená poznámka pro příjemce), superhospodář OVT, env proměnné potvrzené v Production, `admin_users` ověřeno přes Neon (`bohemians.tom@gmail.com` už existoval). Během UAT nalezeno a opraveno: chybějící department gate na odeslání vyúčtování, natvrdo zapsané OVT texty/barvy v HTML těle mailu (na rozdíl od PDF), TDZ chyba (`colors` deklarované za místem použití), Pohoda XML příloha odstraněna na žádost uživatele.

## Problém

Funkce "provozní výdaje mimo akci" (viz [`2026-08-05-provozni-vydaje.md`](2026-08-05-provozni-vydaje.md), schváleno a nasazeno) dnes počítá jen s **jedním** oddílem. Tři nezávislé konstanty to natvrdo předpokládají:

| Dnešní mechanismus | Účel | Kde |
|---|---|---|
| `TREASURER_EMAIL` (env) | jediný hospodář, gate na `/dashboard/provoz` i na citlivé akce u běžných akcí (neshoda dokladu, úprava vybíraných přihlášek) | `src/lib/treasurer.ts` |
| `DEFAULT_ODDIL = "207 Oddíl vodní turistiky"` (konstanta) | text "oddílu" na PDF vyúčtování a v mailu na TJ | `send-vyuctovani/route.tsx`, `vyuctovani/route.tsx` |
| `EMAIL_HOSPODAR_ODDILU_TJB` (env) | příjemce mailu s vyúčtováním na TJ | `send-vyuctovani/route.tsx` |

Druhý oddíl — **Turistický oddíl mládeže (TOM)**, kód oddílu **234**, hospodářka **Alžběta Poupětová** — potřebuje stejnou funkci (evidence nákladových dokladů mimo akci, uzamčení částek, odeslání vyúčtování na TJ), ale se **svým** hospodářem, **svým** kódem oddílu na dokladech a **svým** příjemcem mailu na TJ (ne centrální `EMAIL_HOSPODAR_ODDILU_TJB`).

Výsledovka / hospodaření oddílu (`src/lib/actions/finance-tj.ts`, `hospodareni-tab.tsx`, `TJ_ODDIL_ID`) je oddělený modul napojený na import účetních sestav TJ — **vědomě mimo rozsah**, TOM tuto agendu v appce zatím nemá.

## Rozhodnutí z brainstormingu

| Otázka | Rozhodnutí |
|---|---|
| Rozsah | **Jen provozní výdaje mimo akci.** Členové, příspěvky, běžné akce s účastníky, lodě, brigády zůstávají výhradně agendou OVT (oddíl 207) — nezdvojují se. |
| Kdo vidí sekci Provoz | **Jen hospodáři** — OVT i TOM. Ostatní admini ji nevidí vůbec, stejně jako dnes (sekce se pro ně v navigaci ani nezobrazí, přímý vstup na URL přesměruje na dashboard). |
| Rozsah viditelnosti hospodáře | Hospodář OVT i hospodář TOM vidí **oba** oddíly (plný přehled obou agend). Uzamknout částky / odeslat na TJ: **hospodář OVT je nad TOM "superhospodář"** — smí tyto akce dělat i za TOM (revize 2026-09-02: bez toho by ověření/testování TOM agendy záviselo na součinnosti druhé osoby při každé změně). Hospodář TOM smí tyto akce jen za **svůj** oddíl — asymetrie, opačným směrem přístup nemá. |
| Kdo zakládá výdaj a přidává doklady | **Založení nového výdaje**: hospodář vlastního oddílu, nebo hospodář OVT (superhospodář, viz řádek výše) pro libovolný oddíl — zpřísněno bezpečnostním nálezem 2026-09-02 z původního "kterýkoli hospodář, libovolný oddíl" a vzápětí doplněno o výjimku pro OVT. **Přidávání dokladů** k už existujícímu (neuzamčenému) výdaji zůstává otevřené komukoli, kdo výdaj vidí (viz řádek výše) — beze změny. |
| UI struktura | **Samostatné záložky per oddíl** na `/dashboard/provoz` (ne jeden seznam s filtrem) — blíže odděleným agendám. |
| Kód oddílu TOM | **234** (analogie k "207" u OVT), tiskne se na PDF vyúčtování a do mailu na TJ. |
| Hospodář TOM | **Alžběta Poupětová**, přihlašuje se sdíleným účtem `bohemians.tom@gmail.com` — ten je v `admin_users` (Google OAuth whitelist) už od dřívějška, žádný nový záznam netřeba. |
| Příjemce mailu na TJ | TOM má **vlastní** příjemce, ne centrální `EMAIL_HOSPODAR_ODDILU_TJB`. |
| Výsledovka/hospodaření | **Mimo rozsah**, beze změny — `finance-tj.ts` ani `TJ_ODDIL_ID` se tímto zadáním nedotýkají. |

## Řešení

Rozšiřuje se stejný mechanismus jako u prvního oddílu (`events` s `eventType = 'provozni'`), jen o rozlišení, **kterému** oddílu daný provozní výdaj patří. Žádná nová tabulka.

### 1. Datový model

- Nový enum `oddilEnum = ["ovt", "tom"] as const` v `src/db/schema.ts`.
- Nový sloupec `events.oddil` — `text("oddil", { enum: oddilEnum }).notNull().default("ovt")`.
- Migrace doplní CHECK constraint a zpětně vyplní všechny existující řádky na `'ovt'` (korektní — dnes je vše OVT).
- Sloupec se reálně využívá jen u `eventType = 'provozni'`. U běžných akcí zůstává na výchozí `'ovt'` a nikde v UI se pro ně nezobrazuje ani nenabízí — nulový dopad na formulář běžné akce.

### 2. Konfigurace kódů a hospodářů

Nový `src/lib/oddily-config.ts`, stejný vzor jako `src/lib/events-config.ts`:

```ts
export const ODDIL_LABELS: Record<Oddil, string> = { ovt: "OVT", tom: "TOM" };
export const ODDIL_NAZEV:  Record<Oddil, string> = {
    ovt: "Oddíl vodní turistiky",
    tom: "Turistický oddíl mládeže",
};
export const ODDIL_KOD: Record<Oddil, string> = { ovt: "207", tom: "234" };
```

Citlivé údaje (e-mail hospodáře, e-mail příjemce na TJ) zůstávají v env proměnných podle stávající konvence — přibydou:

```
TREASURER_EMAIL_TOM         # hospodářka TOM (Alžběta Poupětová)
EMAIL_HOSPODAR_ODDILU_TOM   # příjemce mailu s vyúčtováním TOM na TJ
```

Dnešní `TREASURER_EMAIL` a `EMAIL_HOSPODAR_ODDILU_TJB` zůstávají **beze změny** a nadále řídí OVT — a to i v částech aplikace, které s druhým oddílem vůbec nesouvisí (neshoda dokladu, úpravy vybíraných přihlášek u běžných akcí) — ty se nemění vůbec, protože běžné akce dělá jen OVT.

`src/lib/treasurer.ts` přibydou dvě funkce vedle stávající `isTreasurer()` (ta zůstává = "je hospodář OVT", beze změny významu):

```ts
const ODDIL_TREASURER_ENV: Record<Oddil, string> = {
    ovt: "TREASURER_EMAIL",
    tom: "TREASURER_EMAIL_TOM",
};

export function isTreasurerOfOddil(email: string | null | undefined, oddil: Oddil): boolean {
    if (isTreasurer(email)) return true; // hospodář OVT = superhospodář, viz revize 2026-09-02
    const treasurerEmail = process.env[ODDIL_TREASURER_ENV[oddil]]?.trim().toLowerCase();
    return !!treasurerEmail && !!email && email.toLowerCase() === treasurerEmail;
}

export function isAnyOddilTreasurer(email: string | null | undefined): boolean {
    return oddilEnum.some(o => isTreasurerOfOddil(email, o));
}
```

Třetí oddíl v budoucnu = jedna hodnota enumu + tři řádky configu + dva env vary — bez zásahu do gate logiky.

### 3. Přístup — gate sekce Provoz

Gate se **rozšiřuje z jednoho hospodáře na "kteréhokoli z hospodářů"**, chování je jinak stejné jako dnes:

- Nav položka "Provoz" (`(admin)/layout.tsx`): `showProvoz = isAnyOddilTreasurer(email)` (dřív `isTreasurer`).
- `/dashboard/provoz/page.tsx`: `if (!isAnyOddilTreasurer(...)) redirect("/dashboard")`.
- `/dashboard/events/[id]/page.tsx` pro `eventType === 'provozni'`: stejný redirect, `isAnyOddilTreasurer` místo `isTreasurer`.
- `getProvozniVydaje()` (`actions/events.ts`): gate `isAnyOddilTreasurer` — kdokoli z obou hospodářů vidí záznamy obou oddílů.
- `createProvozniVydaj()` (`actions/events.ts`): gate `isTreasurerOfOddil(email, data.oddil)` — založit smí jen hospodář oddílu, pro který se výdaj zakládá (revize po bezpečnostním nálezu, viz řádek "Kdo zakládá výdaj a přidává doklady" výše). Vstupní `data.oddil` se navíc validuje proti `ODDIL_VALUES`, než se vůbec zapíše do DB.

Ostatní admini (mimo obou hospodářů) nevidí sekci vůbec — shodné s dnešním chováním, jen rozšířené o druhou osobu.

### 4. UI `/dashboard/provoz` — záložky

- Nahoře záložky **OVT** / **TOM** (`?oddil=ovt|tom` v URL, obdoba dnešního `?year=` patternu na strankách Členové/Příspěvky), datově vygenerované z `oddilEnum` — třetí oddíl přidá záložku automaticky.
- Každá záložka = nezávislý seznam (dnešní tabulka název/datum/odpovědná osoba/doklady/částka/stav), filtrovaný podle `events.oddil`.
- Dialog "Nový provozní výdaj" dostane select **Oddíl** (default = aktivní záložka) — vytvoří `events` řádek s příslušným `oddil`. Select nabízí obě hodnoty bez ohledu na to, kterého oddílu je přihlášený uživatel hospodářem — pokus založit výdaj cizího oddílu server odmítne čistou chybovou hláškou (viz bod 3). Vyfiltrování selectu jen na vlastní oddíl je otevřený UX vylepšovák, ne požadavek tohoto zadání.

### 5. Detail akce — akce hospodáře zůstávají per-oddíl

Detail `/dashboard/events/[id]` je po vstupu (viz bod 3) přístupný oběma hospodářům pro oba oddíly. Uvnitř ale zůstává jemnější gate na **citlivé kroky** — ty smí jen hospodář toho **konkrétního** oddílu, ke kterému výdaj patří.

Protože `isTreasurerOfOddil(email, 'ovt')` je přesně dnešní `isTreasurer(email)`, stačí na `/dashboard/events/[id]/page.tsx` přepočítat jedinou hodnotu podle **skutečného oddílu té které akce** místo podle globálního hospodáře:

```ts
const isTreasurer = isTreasurerOfOddil(session?.user?.email, event.oddil); // u běžných akcí je oddil vždy 'ovt'
```

`EventDetailClient` i `event-expenses-tab.tsx` dostávají **stejnou prop `isTreasurer` jako dnes** a nemění se vůbec — jen její hodnota je teď spočtená podle oddílu dané akce místo podle jediného globálního hospodáře. U běžných akcí (`oddil` vždy `'ovt'`) vyjde identicky jako dnes; u provozního výdaje TOM vyjde `true` jen hospodářce TOM, jinak `false` (tlačítka Uzamknout/Odemknout zůstanou disabled stejným mechanismem jako dnešní "(pouze hospodář)" u `needs_confirmation`).

Stejně se upraví `lockBilling` / `unlockBilling` (`event-settlement.ts:671,742`) — načtou navíc `events.oddil` a nahradí `isTreasurer(session.user.email)` za `isTreasurerOfOddil(session.user.email, event.oddil)`. Řádek 753 (`unlockBilling` gate "akce už vybírá peníze") se týká jen skutečně vybírajících běžných akcí, kde `oddil` je vždy `'ovt'` — funkčně beze změny, při implementaci vhodné sjednotit na stejnou funkci kvůli konzistenci kódu.

### 6. PDF vyúčtování a mail na TJ

- `DEFAULT_ODDIL` konstanta (`send-vyuctovani/route.tsx`, `vyuctovani/route.tsx`) se nahradí výpočtem `` `${ODDIL_KOD[event.oddil]} ${ODDIL_NAZEV[event.oddil]}` `` — pro `event.oddil === 'ovt'` vyjde identický řetězec jako dnes ("207 Oddíl vodní turistiky"), pro `'tom'` vyjde "234 Turistický oddíl mládeže". Žádná změna chování pro existující OVT data.
- Příjemce mailu (`hospodarEmail` v `send-vyuctovani/route.tsx:217`) — pro `isProvozni` se vezme z env páru podle `event.oddil` (`EMAIL_HOSPODAR_ODDILU_TJB` / `EMAIL_HOSPODAR_ODDILU_TOM`) místo natvrdo `EMAIL_HOSPODAR_ODDILU_TJB`. Pro běžné (ne-provozní) akce se nic nemění — pořád jen OVT, pořád `EMAIL_HOSPODAR_ODDILU_TJB`.

### 7. Migrace

Jeden soubor `supabase/migrations/YYYYMMDD_HHMMSS_events_oddil.sql`:

```sql
ALTER TABLE app.events ADD COLUMN oddil text NOT NULL DEFAULT 'ovt';
ALTER TABLE app.events ADD CONSTRAINT events_oddil_check CHECK (oddil IN ('ovt', 'tom'));
```

Souběžná úprava `src/db/schema.ts` (enum + sloupec).

### 8. Testy

- Unit test `isTreasurerOfOddil` / `isAnyOddilTreasurer` (mock `process.env`).
- Rozšíření E2E smoke `/dashboard/provoz`:
  - hospodář OVT vidí obě záložky, hospodář TOM taky,
  - ne-hospodář (žádný z obou) je přesměrován na dashboard — beze změny oproti dnešku,
  - založení provozního výdaje pro TOM hospodářem OVT (a naopak) projde,
  - uzamčení/odeslání výdaje cizího oddílu je pro nesprávného hospodáře blokované (tlačítko disabled / server action vrátí chybu).
  - vyžaduje `TREASURER_EMAIL_TOM` v testovacím env vedle stávajícího `TREASURER_EMAIL` (`e2e/README.md`).

### 9. Provozní krok navíc (mimo kód)

`bohemians.tom@gmail.com` (přihlašovací účet hospodářky TOM, Alžběty Poupětové) je v `admin_users` na staging i produkci už dávno (přidáno 2026-04-16, nesouvisí s tímto zadáním) — žádný nový záznam netřeba. Zbývá jen nastavit `TREASURER_EMAIL_TOM` + `EMAIL_HOSPODAR_ODDILU_TOM` ve Vercel env (staging i produkce) — potvrzeno hotové 2026-09-02.

## Mimo rozsah (vědomě)

- **Výsledovka / hospodaření** (`finance-tj.ts`, `hospodareni-tab.tsx`, `TJ_ODDIL_ID`) — beze změny, TOM tuto agendu v appce zatím nemá.
- **Členové, příspěvky, běžné akce s účastníky, lodě, brigády** pro TOM — zůstávají mimo tuto appku, řeší je OVT jako dosud.
- **GCal / kanoe RSS synchronizace** provozních výdajů — beze změny, provozní výdaj nadále vzniká jen ručně.
- **Veřejný registrační formulář** — beze změny, typ `provozni` se nenabízí ani nepřijímá přihlášku.
- **Sdílení tlačítek/detailu mezi oddíly** (např. hromadné operace napříč oběma) — každý provozní výdaj patří jednomu oddílu, žádné cross-oddílové agregace se nezavádí.

## Zamítnuté alternativy

- **Sekce Provoz viditelná všem adminům, jen akce hospodáře oddílové** — zvažováno, ale zamítnuto: uživatel upřesnil, že ostatní admini mají vidět přesně to co dnes, tj. sekci vůbec ne. Zjednodušuje to gate na "rozšíření z jednoho hospodáře na dva", bez nutnosti řešit read-only zobrazení pro širší publikum.
- **Departments jako samostatná DB tabulka** (`oddily` s FK z `events`) — čistší pro neomezený počet oddílů, ale při dvou (klidně i třech) známých oddílech je to zbytečná vrstva navíc; zvolen stejný vzor jako `eventTypeEnum` + `events-config.ts`, který v kódu už existuje a dobře se rozšiřuje o další hodnotu.
- **Emaily/kódy oddílu v DB místo env proměnných** — zamítnuto kvůli konzistenci s dnešním vzorem (`TREASURER_EMAIL`, `EMAIL_HOSPODAR_ODDILU_TJB` jsou dnes env), a protože jde o citlivé/provozní údaje nastavované per prostředí (staging/produkce), ne data upravovaná v UI.
