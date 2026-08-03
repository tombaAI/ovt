---
status: zgrilovano
---

# Zadání: Schvalování změny částky vyúčtování po vygenerování předpisu

> **Stav: Zgrilováno (2026-08-03).** Všechny otevřené otázky vyřešené (viz sekce „Otevřené otázky"), připraveno k realizaci na feature větvi `feat/2026-08-03-schvalovani-zmeny-castky-predpisu`. Vzniklo jako obecná nadstavba nad [2026-07-08-dotace-prevysujici-naklady.md](2026-07-08-dotace-prevysujici-naklady.md) — ten dokument zůstává **pozastavený**, dokud tenhle mechanismus nebude implementovaný.

## Problém (obecně, ne jen dotace)

Jakákoli budoucí příčina přepočtu vyúčtování akce — oprava algoritmu dotace, změna koeficientů nákladu, přidaný/odebraný účastník, editace nákladu, cokoli — může po tom, co už byl settlement předpis (doplatek) **vygenerovaný**, dát jiné číslo než to, které už bylo zobrazené hospodáři/členovi, případně odeslané e-mailem. Dnešní kód (`upsertPrescriptionAmounts`, `event-settlement.ts:1091-1132`, volaná z `lockBilling` i `regeneratePrescriptions`) se s tím vypořádává jen částečně a nekonzistentně:

| Stav předpisu | Dnešní chování při přepočtu |
|---|---|
| `status = 'pending'` (ještě nezaplaceno) | **Potichu přepíše** `amount` na nově spočtenou hodnotu — bez ohledu na to, jestli byl předpis už dřív vygenerovaný, zobrazený nebo odeslaný e-mailem. |
| `status IN ('matched', 'paid')` | Úplně přeskočeno (`continue`, komentář „Pojistka... viz no-regen-after-payments") — částka se nezmění, ale **taky se nikde neukáže**, že by nový výpočet dal jiné číslo. Hospodář nemá šanci to ani zjistit, natož řešit případný nedoplatek/přeplatek. |

V obou případech chybí to, co je potřeba: **viditelnost rozdílu** (co platilo dřív vs. co by platilo nově) a **výslovné rozhodnutí**, jestli se má změna přijmout — u jedné přihlášky, u všech najednou, nebo jen u vybrané podmnožiny (typicky: kdo ještě nezaplatil).

## Princip řešení

**Jednou vygenerovaná částka se nikdy nepřepíše potichu.** Místo přímého zápisu do `amount` se při přepočtu, který by hodnotu změnil, zapíše **návrh** vedle stávající platné částky. Platná zůstává platná (a to, co se od účastníka reálně vybírá / co ukazuje e-mail), dokud ji admin výslovně nepotvrdí.

**Výjimka — první generování je vždy přímé, bez návrhu.** Přihláška dostává settlement předpis hned při vzniku s `amount = 0` (`addAdminEventRegistration`, `event-settlement.ts:1192`) — dokud `amount` nikdy nebyl reálně nastavený (nic nebylo „vygenerované" ve smyslu, který má smysl chránit), není co porovnávat a přímý zápis je v pořádku. Chrání se až druhé a další přepočtení.

### Existující precedens v kódu — stejný vzor, jiná doména

Přesně tenhle vzor („systém navrhne, člověk potvrdí, s auditní stopou") už v kódu je u párování plateb:

- `payment_ledger.reconciliation_status`: `unmatched | suggested | confirmed | ignored`
- `payment_allocations.is_suggested` + `confirmed_by` + `confirmed_at`

Návrh níže je záměrně jednodušší (KISS — jen `proposedAmount`/`proposedAt`, bez stavového enumu jako `reconciliation_status`), ale princip „návrh vedle platné hodnoty, potvrzení jako explicitní krok" je stejný.

## Navrhovaný datový model

Rozšíření `eventPaymentPrescriptions` (jen pro `type = 'settlement'` — zálohy mimo rozsah, viz otevřené otázky):

```
proposedAmount: numeric(10,2), nullable   // návrh — null = žádný známý nesoulad
proposedAt:     timestamp, nullable        // kdy byl návrh naposledy vytvořen/aktualizován
```

Žádný stavový příznak navíc — **KISS, jen dvě pole.** Žádné „zamítnutí" se zatím neřeší (může přibýt později, pokud se ukáže jako potřebné); dokud `proposedAmount` existuje a liší se od `amount`, prostě se nabízí k potvrzení.

`confirmedBy`/`confirmedAt` navíc nepotřebujeme — přijetí návrhu je mutace `amount`, kryje ji standardní `audit_log` (`{ amount: { old, new } }`, `changedBy` ze session) podle konvence server actions.

## Navrhovaný tok

### Zápis (uvnitř `upsertPrescriptionAmounts`)

Pro každou settlement položku po přepočtu `newAmount`:

1. `currentAmount == 0` (nikdy reálně vygenerováno) → zapiš přímo `amount = newAmount` (beze změny dnešního chování pro nové přihlášky).
2. `currentAmount == newAmount` → žádný nesoulad. Pokud tam nějaký `proposedAmount` z minula visel (např. vstupy se vrátily do stavu, kdy zase sedí) → vyčisti (`proposedAmount = null`, `proposedAt = null`).
3. `currentAmount != newAmount` (bez ohledu na `status`, tedy i `matched`/`paid`) → zapiš `proposedAmount = newAmount`, `proposedAt = now()`. **`amount` se nemění.** Přepíše i předchozí nepotvrzený návrh — každé přegenerování je čerstvé posouzení, žádná paměť (viz otázka 3).

### Rozhodnutí (nové server actions)

- `confirmProposedAmount(prescriptionId)` — `amount = proposedAmount`, `proposedAmount = null`, `proposedAt = null`, audit log (`{ amount: { old, new } }`).
- `confirmProposedAmounts(eventId, prescriptionIds?: number[])` — hromadná varianta: bez parametru potvrdí všechny nevyřízené návrhy akce, s parametrem jen vybranou podmnožinu. Pokrývá přesně scénář „část lidí už zaplatila / u nich změnu nechci, zbytek přepočítám".
- Žádná `reject` akce zatím neexistuje — admin návrh jednoduše nechá viset (nepotvrdí), dokud se buď nesoulad nevyřeší sám (další přegenerování dá stejné číslo jako `amount` → návrh zmizí), nebo ho nepotvrdí.

### UI (záložka Platby, případně Náklady)

- Řádek přihlášky s nevyřízeným návrhem: badge „Návrh: {stará} → {nová} Kč ({rozdíl})" + tlačítko Potvrdit.
- Souhrnná lišta nad tabulkou: „N přihlášek má navržený přepočet" s hromadným „Potvrdit vybrané" / „Potvrdit vše".
- Zvýrazněné varování u přihlášek se `status IN ('matched','paid')`, které mají návrh — přijetí tam znamená reálný doplatek nebo vratku, ne jen úpravu čísla na papíře.

## Vztah k dnešní pojistce „no-regen-after-payments"

Tenhle mechanismus ji nahrazuje a rozšiřuje: `matched`/`paid` přestává znamenat „úplně zamrzlé a neviditelné", stává se z něj „zamrzlé, ale s viditelným návrhem k ručnímu posouzení". `pending` přestává znamenat „přepiš potichu", dostává stejné chování jako `matched`/`paid` — jediný rozdíl mezi stavy je závažnost důsledku přijetí návrhu, ne to, jestli se návrh vůbec ukáže.

## Otázky vyřešené grilováním (2026-08-03)

1. ~~**Kdy se návrh generuje**~~ — **rozhodnuto:** živé volání `getEventSettlement()` (Náklady tab apod.) smí spočtenou hodnotu jen **ukázat jako náhled** ("kdyby se teď přegenerovalo, vyšlo by..."), nikdy nezapisuje do DB. `proposedAmount`/`proposedAt` se zapisují výhradně uvnitř `upsertPrescriptionAmounts`, tedy jen při explicitní akci `lockBilling`/`regeneratePrescriptions`.
2. ~~**Rozsah**~~ — **rozhodnuto:** jen `type = 'settlement'`. Ověřeno: `addParticipantToRegistration`/`removeParticipantFromRegistration` (`event-settlement.ts:1611-1727`) mění `personsCount`, ale nic nepřepisuje `amount` existující zálohy — riziko tichého přepsání, které tenhle mechanismus řeší u settlementu, u zálohy dnes v kódu neexistuje (není co přepisovat). Zjištěn ale **jiný, samostatný problém** téhož okolí — záloha po změně `personsCount` neodpovídá skutečnosti — zapsáno jako [2026-08-03-zaloha-nesedi-po-zmene-poctu-osob.md](2026-08-03-zaloha-nesedi-po-zmene-poctu-osob.md), k dořešení mimo tohle zadání.
3. ~~**TTL/expirace**~~ — **rozhodnuto:** žádné TTL. Každé další `regeneratePrescriptions` počítá znovu vůči platné `amount` (ne vůči starému nepotvrzenému návrhu) a `proposedAmount`/`proposedAt` prostě přepíše nejčerstvější hodnotou — starý nevyřízený návrh tím padá sám, žádný zvláštní úklid/expirace není potřeba.
4. ~~**Zamítnutí návrhu**~~ — **rozhodnuto (KISS):** žádná `reject` akce, žádný stavový příznak, žádná paměť. Po jakékoli změně, pokud se přepočet liší od platné `amount`, se `proposedAmount` prostě nabízí k potvrzení — vždy stejně, bez ohledu na to, jestli podobný návrh už dřív „padl pod stůl". Pokud se v budoucnu ukáže potřeba explicitního zamítnutí, doplní se jako samostatné rozšíření.

## Vazby

- Blokuje realizaci [2026-07-08-dotace-prevysujici-naklady.md](2026-07-08-dotace-prevysujici-naklady.md) — oprava algoritmu dotace se nasadí až po tomhle mechanismu, jinak by u již vygenerovaných (byť `pending`) předpisů potichu změnila částku.
- [2026-08-03-zaloha-nesedi-po-zmene-poctu-osob.md](2026-08-03-zaloha-nesedi-po-zmene-poctu-osob.md) — samostatný nález ze stejného grilování, mimo rozsah tohoto zadání.
- `src/lib/actions/event-settlement.ts` — `upsertPrescriptionAmounts` (~ř. 1091-1132), `regeneratePrescriptions` (~ř. 1057), `lockBilling` (~ř. 659).
- `src/db/schema.ts` — `eventPaymentPrescriptions` (~ř. 496-537), precedens `paymentLedger.reconciliationStatus` (~ř. 305-307) a `paymentAllocations.isSuggested/confirmedBy/confirmedAt` (~ř. 334-336).
