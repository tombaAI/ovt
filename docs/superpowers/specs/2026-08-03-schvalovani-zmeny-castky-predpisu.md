---
status: navrh
---

# Zadání: Schvalování změny částky vyúčtování po vygenerování předpisu

> **Stav: Návrh.** Čeká na grilování. Vzniklo jako obecná nadstavba nad [2026-07-08-dotace-prevysujici-naklady.md](2026-07-08-dotace-prevysujici-naklady.md) — ten dokument je **pozastavený**, dokud tenhle mechanismus nebude zgrilovaný a implementovaný (viz jeho aktualizovaná poznámka o stavu).

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

Návrh níže recykluje stejný slovník a tvar dat pro `event_payment_prescriptions`.

## Navrhovaný datový model

Rozšíření `eventPaymentPrescriptions` (jen pro `type = 'settlement'` — zálohy mimo rozsah, viz otevřené otázky):

```
proposedAmount: numeric(10,2), nullable   // návrh — null = žádný nevyřízený návrh
proposedAt:     timestamp, nullable        // kdy byl návrh naposledy vytvořen/aktualizován
```

`confirmedBy`/`confirmedAt` navíc nepotřebujeme — přijetí návrhu je mutace `amount`, kryje ji standardní `audit_log` (`{ amount: { old, new } }`, `changedBy` ze session) podle konvence server actions.

## Navrhovaný tok

### Zápis (uvnitř `upsertPrescriptionAmounts`)

Pro každou settlement položku po přepočtu `newAmount`:

1. `currentAmount == 0` (nikdy reálně vygenerováno) → zapiš přímo `amount = newAmount` (beze změny dnešního chování pro nové přihlášky).
2. `currentAmount == newAmount` → žádná akce (není co navrhovat).
3. `currentAmount != newAmount` (bez ohledu na `status`, tedy i `matched`/`paid`) → zapiš `proposedAmount = newAmount`, `proposedAt = now()`. **`amount` se nemění.**

### Rozhodnutí (nové server actions)

- `confirmProposedAmount(prescriptionId)` — `amount = proposedAmount`, `proposedAmount = null`, `proposedAt = null`, audit log (`{ amount: { old, new } }`).
- `rejectProposedAmount(prescriptionId)` — `proposedAmount = null`, `proposedAt = null`, `amount` beze změny. Audit log i pro zamítnutí (ať je v historii vidět, že návrh byl posouzen, ne že jen zmizel).
- `confirmProposedAmounts(eventId, prescriptionIds?: number[])` — hromadná varianta: bez parametru potvrdí všechny nevyřízené návrhy akce, s parametrem jen vybranou podmnožinu. Pokrývá přesně scénář „část lidí už zaplatila / u nich změnu nechci, zbytek přepočítám".

### UI (záložka Platby, případně Náklady)

- Řádek přihlášky s nevyřízeným návrhem: badge „Návrh: {stará} → {nová} Kč ({rozdíl})" + tlačítka Potvrdit/Zamítnout.
- Souhrnná lišta nad tabulkou: „N přihlášek má navržený přepočet" s hromadným „Potvrdit vybrané" / „Potvrdit vše".
- Zvýrazněné varování u přihlášek se `status IN ('matched','paid')`, které mají návrh — přijetí tam znamená reálný doplatek nebo vratku, ne jen úpravu čísla na papíře.

## Vztah k dnešní pojistce „no-regen-after-payments"

Tenhle mechanismus ji nahrazuje a rozšiřuje: `matched`/`paid` přestává znamenat „úplně zamrzlé a neviditelné", stává se z něj „zamrzlé, ale s viditelným návrhem k ručnímu posouzení". `pending` přestává znamenat „přepiš potichu", dostává stejné chování jako `matched`/`paid` — jediný rozdíl mezi stavy je závažnost důsledku přijetí návrhu, ne to, jestli se návrh vůbec ukáže.

## Otevřené otázky (ke grilování)

1. **Kdy se návrh generuje** — při každém živém volání `getEventSettlement()` (tedy i při pouhém prohlížení stránky), nebo jen při explicitní akci (`lockBilling`/`regeneratePrescriptions`)? Návrh: jen explicitní akcí — jinak by se `proposedAmount` zapisoval do DB při každém otevření stránky a „návrh" by se tiše měnil pod rukama jen tím, že si někdo něco prohlíží.
2. **Rozsah** — týká se jen `type = 'settlement'`, nebo i `type = 'deposit'`? Zálohy jsou dnes fixní sazba × `personsCount`, neprochází stejným přepočtem — návrh: mimo rozsah, ale ověřit, jestli přidání/odebrání účastníka přihlášky nemění `personsCount` a tím nepřímo i zálohu.
3. Má existovat **expirace/TTL** nevyřízeného návrhu, nebo zůstává viset, dokud ho někdo neřeší?
4. Zamítnutí návrhu — má systém **zapamatovat, že tahle konkrétní hodnota byla zamítnutá**, aby se stejný návrh hned znovu neobjevil při příštím přepočtu se stejnými vstupy? Nebo je to na admin, aby si to pohlídal (další přepočet= další příležitost návrh znovu posoudit)?

## Vazby

- Blokuje realizaci [2026-07-08-dotace-prevysujici-naklady.md](2026-07-08-dotace-prevysujici-naklady.md) — oprava algoritmu dotace se nasadí až po tomhle mechanismu, jinak by u již vygenerovaných (byť `pending`) předpisů potichu změnila částku.
- `src/lib/actions/event-settlement.ts` — `upsertPrescriptionAmounts` (~ř. 1091-1132), `regeneratePrescriptions` (~ř. 1057), `lockBilling` (~ř. 659).
- `src/db/schema.ts` — `eventPaymentPrescriptions` (~ř. 496-537), precedens `paymentLedger.reconciliationStatus` (~ř. 305-307) a `paymentAllocations.isSuggested/confirmedBy/confirmedAt` (~ř. 334-336).
