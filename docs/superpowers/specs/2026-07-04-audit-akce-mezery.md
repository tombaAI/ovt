---
status: produkce
---

# Zadání: Doplnit chybějící audit u akcí a vyúčtování

> **Stav: Produkce.** Zgrilováno a implementováno (commit `f28f062`), nasazeno v produkci. Viz [INDEX.md](INDEX.md).
>
> **Návrh prošel grilling session — finální podoba viz [ADR-0002](../docs/adr/0002-event-audit-log-scope-and-reconstructability.md).**
> Sekce níže jsou aktualizované podle výsledku (byly upraveny oproti prvnímu návrhu — hlavně `entityType`
> u položek vázaných na jednu přihlášku/náklad, nový scope `event_expense`, doplněný `reanalyze_expense`,
> a `blocked` log i pro dosud netknuté zámky). Otevřené otázky z prvního návrhu jsou vyřešené, viz konec dokumentu.

## Byznys případ

Hospodář (a admin obecně) potřebuje u každé akce vidět kompletní historii toho, kdo a kdy s ní něco udělal — nejen editace polí, ale i souhlas/odvolání vyúčtování, odeslání mailů účastníkům, zamykání dokladů, změny nákladů. Dnes existuje jednotný pohled `getEventFullAuditLog()`, ale řada mutací do něj vůbec nepropisuje — buď píší do vlastní vedlejší tabulky, kterou tento pohled nečte, nebo nepíšou nikam.

Zjištěno při ruční kontrole: potvrzení/odvolání vyúčtování hospodářem a odeslání mailů se v auditu akce nezobrazují, přestože se něco reálně stalo. Tato analýza jde dál a hledá **všechny** podobné mezery v okruhu akcí a vyúčtování.

---

## Aktuální stav

### Jednotný audit

- Tabulka `app.audit_log` (`src/db/schema.ts`) — `entityType`, `entityId`, `action`, `changes` (JSONB diff), `metadata`, `changedBy`, `changedAt`.
- [`getEventAuditLog`](src/lib/actions/events.ts#L633) — jednoduchý pohled, jen pole akce (`entityType = "event"`).
- [`getEventFullAuditLog`](src/lib/actions/event-registrations.ts#L1359) — "forenzní" pohled jen pro hospodáře (`TREASURER_EMAIL`), dnes sjednocuje `entityType IN ("event", "event_registration")`. **Toto je jediné místo, kde by měla být vidět kompletní historie akce — a právě sem se nedostává několik kategorií mutací (viz níže).** Po tomhle zadání přibude třetí scope, `event_expense` (viz bod 4).

### Mutace, které JIŽ nějaký log mají, ale mimo `audit_log`

Tři samostatné tabulky, z nichž žádná není čtena v `getEventFullAuditLog`:

| Tabulka | Píše ji | Data |
|---|---|---|
| `event_treasurer_approval_log` | [`setTreasurerApproval`](src/lib/actions/events.ts#L757) | `action` (approved/revoked), `changedBy`, `changedAt` |
| `event_settlement_email_sends` | [`sendEventSettlementEmails`](src/lib/actions/event-settlement.ts#L1432), [`sendSingleRegistrationEmail`](src/lib/actions/event-settlement.ts#L1501) | počty sent/skipped/failed, `message`, `registrationId`, `testTo` |
| `event_vyuctovani_sends` | [`logVyuctovaniSend`](src/lib/actions/events.ts#L822), volané z [`/api/events/[id]/send-vyuctovani`](src/app/api/events/[id]/send-vyuctovani/route.tsx) (legacy PDF/účetní export pro TJ) | `recipients[]`, `sentBy`, `testTo` |

Existuje i pomocná funkce [`getVyuctovaniActivityLog`](src/lib/actions/events.ts#L792), která první dvě tabulky sjednocuje pro zobrazení — ale je to samostatný pohled, ne součást `getEventFullAuditLog`.

### Mutace v `event-settlement.ts` úplně BEZ logu (ani vlastní tabulka)

| Funkce | Co dělá |
|---|---|
| [`lockForReimbursement` / `unlockForReimbursement`](src/lib/actions/event-settlement.ts#L837-L864) | zamknutí/odemknutí dokladů k proplacení |
| [`updateEventSubsidy`](src/lib/actions/event-settlement.ts#L868-L881) | změna dotace na člena |
| [`updateExpenseAllocationMethod`](src/lib/actions/event-settlement.ts#L885-L910) | přepnutí způsobu rozdělení nákladu (`split_all` / `per_registration`) |
| [`setExpenseRegistrationAllocations`](src/lib/actions/event-settlement.ts#L914-L949) | ruční alokace nákladu na přihlášky |
| [`setExpenseParticipantCoefficients`](src/lib/actions/event-settlement.ts#L962-L1029) | koeficienty účastníků pro rozpočet nákladu |
| [`setDepositPromise` / `setDepositWontPay`](src/lib/actions/event-settlement.ts#L2068-L2157) | příslib zálohy / "nebude platit" — ukládá se jen `...By`/`...At` sloupec na předpisu, přepisuje se při každé další změně; žádná historie |

`lockBilling` a `unlockBilling` audit mají (řádky 619, 757 v souboru) — ty jsou v pořádku.

### Nejzávažnější mezera — náklady akce (`event_expenses`) přes API routy

Na rozdíl od zbytku vyúčtování se CRUD nákladů neřeší server actions, ale API routami, a **nezapisuje se tam vůbec nic** — ani do `audit_log`, ani do žádné vlastní tabulky:

| Route | Co dělá |
|---|---|
| `POST /api/events/[id]/expenses` | vytvoření nákladu |
| `PATCH /api/events/[id]/expenses` | editace (částka, účel, kategorie, plátce, `isPaid`, `invoicePayeeName`...) |
| `DELETE /api/events/[id]/expenses` | smazání nákladu |
| `POST /api/events/[id]/expenses/[expenseId]/attach-file` | nahrání přílohy (účtenka/faktura) |
| `POST /api/events/[id]/expenses/[expenseId]/send-invoice-payment` | označení faktury jako odeslané k platbě |

Smazání nákladu nebo změna částky dnes nezanechá žádnou stopu — kdo, kdy, jaká byla hodnota předtím.

---

## Co se má změnit

Princip napříč vším níže — **rekonstruovatelnost**: z `audit_log` má jít složit zpět kompletní flow akce. Skalární pole (částka, stav, boolean) stačí jako diff `changes: {pole: {old, new}}`. Mapová/vícehodnotová pole a destruktivní vedlejší efekty (mazání řádků) navíc dostávají plný snapshot v `metadata` — diff samotný je křehký (jeden vynechaný záznam znehodnotí rekonstrukci od toho bodu dál). Detailní zdůvodnění viz [ADR-0002](../docs/adr/0002-event-audit-log-scope-and-reconstructability.md).

### 1. Sjednotit zápis existujících logů do `audit_log`

U tří míst, které už logují (jen jinam), přidat vedle zápisu do vlastní tabulky i řádek do `audit_log`:

- `setTreasurerApproval` → `entityType: "event"`, `action: "treasurer_approve"` / `"treasurer_revoke"`
- `sendEventSettlementEmails` → `entityType: "event"`, `action: "send_settlement_emails"`, `metadata: { sent, skipped, failed }`
- `sendSingleRegistrationEmail` → **`entityType: "event_registration"`, `entityId: registrationId`** (ne `"event"` — je to e-mail jedné konkrétní přihlášce), `action: "send_settlement_email_single"`
- `logVyuctovaniSend` → `entityType: "event"`, `action: "send_vyuctovani_tj"`, `metadata: { recipients }` — **potvrzeno: tohle NENÍ legacy/na vyřazení**, je to aktivně používané tlačítko "Odeslat vyúčtování" (finální předání účetnictví TJ), viz otevřená otázka 2 níže

Vlastní tabulky (`event_treasurer_approval_log`, `event_settlement_email_sends`, `event_vyuctovani_sends`) zůstávají beze změny — mají specifický tvar dat (příjemci, počty) potřebný pro jiná zobrazení. Jde jen o přidání paralelního záznamu do jednotného auditu; ten u nich neduplikuje detail, jen dává časovou osu.

### 2. Doplnit audit u settlement akcí, které nemají žádný log

Do každé z těchto funkcí přidat `db.insert(auditLog)` při úspěchu. **U 6 z 8** (všechny kromě `lockForReimbursement`/`unlockForReimbursement` — ty dnes žádnou `lockForParticipants` bránu nemají, jen kontrolu "akce existuje") přidat i `logBlockedAttempt` (viz bod 5) při odmítnutí zámkem — dosud žádná z nich blocked log neměla:

- `lockForReimbursement` / `unlockForReimbursement` → `entityType: "event"`, `action: "lock_reimbursement"` / `"unlock_reimbursement"` (bez `blocked` varianty — není co blokovat)
- `updateEventSubsidy` → `entityType: "event"`, `action: "update_subsidy"`, `changes: { subsidyPerMember: { old, new } }`
- `updateExpenseAllocationMethod` → **`entityType: "event_expense"`, `entityId: expenseId`** (subjekt je náklad, ne akce), `action: "update_expense_allocation_method"`, `changes: { allocationMethod: { old, new } }`, **plus `metadata.deletedAllocations`** = snapshot smazaných řádků `eventExpenseAllocations`, pokud přepnutí na `split_all` nějaké smazalo
- `setExpenseRegistrationAllocations` → **`entityType: "event_expense"`**, `action: "set_expense_registration_allocations"`, `changes` = diff alokované částky per `registrationId`, **plus `metadata.allocationsAfter`** = plný snapshot všech alokací nákladu po uložení
- `setExpenseParticipantCoefficients` → **`entityType: "event_expense"`**, `action: "set_expense_coefficients"`, `changes` = diff jen změněných klíčů (`{ [personKey]: {old, new} }`), **plus `metadata.coefficientsAfter`** = plná mapa koeficientů po uložení
- `setDepositPromise` / `setDepositWontPay` → **`entityType: "event_registration"`, `entityId: registrationId`** (ne `"event"` — váže se na jednu přihlášku), `action: "set_deposit_promise"` / `"set_deposit_wont_pay"`, `metadata: { prescriptionId }`, `changes: { value: { old, new }, note: { old, new } }`

### 3. Doplnit audit v API routách pro náklady akce

V `src/app/api/events/[id]/expenses/route.ts` (POST/PATCH/DELETE), `attach-file/route.ts`, `send-invoice-payment/route.ts` **a `reanalyze/route.ts`** (viz níže) přidat `db.insert(auditLog)` po úspěšné mutaci. Všechny s `entityType: "event_expense"`, `entityId: expenseId`. **U 5 z 6** (všechny kromě `send-invoice-payment` — ten dnes nemá žádnou `lockForParticipants`/`lockForReimbursement` bránu, jen vstupní validace typu "faktura už zaplacená"/"chybí soubor") přidat i `logBlockedAttempt` při 409:

- POST → `action: "create_expense"`, `metadata` = plný snapshot počátečního stavu založeného řádku (ne jen `expenseId`) — slouží jako kotva pro rekonstrukci, viz UPDATE/DELETE níže
- PATCH → `action: "update_expense"`, `changes` s reálně změněnými poli (částka, kategorie, účel, plátce, `isPaid`, `invoicePayeeName`, příjemce proplacení...)
- DELETE → `action: "delete_expense"`, `changes` s klíčovými poli smazaného řádku (čitelnost v UI), `metadata` s **celým** smazaným řádkem (forenzní snapshot, po smazání už nejde dohledat)
- attach-file → `action: "attach_expense_file"`, `changes: { amount, analyzedAmount, fileUrl, fileName }` (`amount` jen když se v odemčeném stavu měnilo), `metadata: { replaced: boolean, mismatchOverridden: boolean }` (`replaced` = příloha už existovala; `mismatchOverridden` = hospodář přebil neshodu na zamčeném nákladu)
- **reanalyze** (`POST /api/events/[id]/expenses/[expenseId]/reanalyze/route.ts`) → **doplněno dodatečně, nebylo v prvním návrhu zadání** (routa vznikla až po jeho sepsání) — `action: "reanalyze_expense"`, `changes: { analyzedAmount: { old, new } }`
- send-invoice-payment → `action: "send_invoice_payment"`, `changes: { invoicePaymentSentAt: { old: null, new: <timestamp> } }`

Tyto routy zatím `auditLog` neimportují — bude potřeba přidat import (mají už `auth()`/`getDb()`, není potřeba dodávat).

**Mimo scope:** `POST /api/admin/backfill-analyzed-amount` — jednorázový, `CRON_SECRET`-autorizovaný systémový skript (vlastní [ADR-0001](../docs/adr/0001-analyzed-amount-historical-backfill.md)), ne uživatelská akce; nemá `session`/e-mail k zapsání jako `changedBy`.

### 4. Rozšířit `getEventFullAuditLog` a UI

Na rozdíl od prvního návrhu **je potřeba změna v query**, protože přibývá třetí scope:

- `EventFullAuditEntry.scope`: `"event" | "registration" | "expense"` (nový typ)
- `getEventFullAuditLog` — třetí `OR` větev (`entityType = "event_expense"`), join na `eventExpenses` pro `purposeText`; když náklad už neexistuje (smazaný), fallback na `metadata.purposeText` snapshot (proto ho mají všechny `event_expense` záznamy, ne jen DELETE)
- `EventAuditTab` (`event-detail-client.tsx`) — zobrazit název nákladu vedle badge, stejně jako `registrationName`; doplnit `AUDIT_ACTION_META` o nové `action` hodnoty (české popisky) a `AUDIT_ATTEMPT_LABELS` o nové `attemptedAction` hodnoty pro `blocked` záznamy

### 5. Sdílená audit utilita pro `blocked` záznamy

`logBlockedAttempt`/`BlockedError`/`BlockedAttempt` (dnes privátní jen v `event-settlement.ts`) přesunout do sdíleného `src/lib/audit.ts` — poprvé je potřeba volat i z API rout (`attach-file`, `reanalyze`), ne jen ze server actions. `BlockedAttempt` rozšířit o `expenseId`; `entityType` výběr v `logBlockedAttempt` rozšířit o třetí větev:

```
entityType: opts.registrationId != null ? "event_registration"
          : opts.expenseId != null ? "event_expense"
          : "event"
```

---

## Co se nemění

- Vlastní tabulky `event_treasurer_approval_log`, `event_settlement_email_sends`, `event_vyuctovani_sends` — zůstávají, jen se doplní paralelní `audit_log` zápis.
- `getVyuctovaniActivityLog` a `getEventSettlementEmailLog` — zůstávají pro svá specifická zobrazení (např. přehled odeslaných mailů s počty).
- Struktura `audit_log` tabulky — žádná migrace není potřeba, jen nové hodnoty `action`/`metadata`.
- `lockBilling` / `unlockBilling` / `updateEventField` / `acceptGcalField` / registrace účastníků — audit už mají, beze změny.

---

## Otevřené otázky — vyřešeno (grilling session)

1. **`DELETE /expenses` — celý řádek, nebo jen klíčová pole?** Obojí: klíčová pole do `changes` (čitelnost v UI), celý smazaný řádek do `metadata` (forenzní snapshot). Potvrzeno.
2. **Legacy `/api/events/[id]/send-vyuctovani` — propsat do auditu, nebo na vyřazení?** Není legacy ani na vyřazení — je to jediné a aktivně používané tlačítko "Odeslat vyúčtování" (finální předání účetnictví TJ Bohemians, gate na `billingStatus = "prescribed"` a `treasurerApproved`). Zahrnuto do bodu 1 beze změny priority.
3. Rozsah tohoto zadání je omezen na akce/vyúčtování (`events`, `event_registrations`, `event_expenses`, `event_payment_prescriptions`). Podobná kontrola pro brigády/lodě/členy není součástí — provést až jako samostatné zadání, pokud bude zájem. (Beze změny.)

Nově otevřené/rozšířené v grilling session (viz [ADR-0002](../docs/adr/0002-event-audit-log-scope-and-reconstructability.md) pro plné zdůvodnění):

- Zavedení třetího scope `event_expense` pro vše vázané na konkrétní náklad (místo anonymního `"event"`).
- Princip rekonstruovatelnosti — snapshoty v `metadata` navíc k diffu u mapových polí a destruktivních vedlejších efektů.
- `blocked` log rozšířen na 11 mutací s reálnou zámkovou bránou (6 z bodu 2 + 5 z bodu 3; `lockForReimbursement`/`unlockForReimbursement`/`send-invoice-payment` žádnou nemají, viz body 2 a 3) — dřív jen v `event-settlement.ts` na jiných místech, ne jen na úspěšné zápisy.
- Doplněna routa `reanalyze_expense`, která v době sepsání prvního návrhu ještě neexistovala.
- Explicitně vyloučen `POST /api/admin/backfill-analyzed-amount` (systémový skript, ne uživatelská akce).
