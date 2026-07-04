# Zadání: Doplnit chybějící audit u akcí a vyúčtování

## Byznys případ

Hospodář (a admin obecně) potřebuje u každé akce vidět kompletní historii toho, kdo a kdy s ní něco udělal — nejen editace polí, ale i souhlas/odvolání vyúčtování, odeslání mailů účastníkům, zamykání dokladů, změny nákladů. Dnes existuje jednotný pohled `getEventFullAuditLog()`, ale řada mutací do něj vůbec nepropisuje — buď píší do vlastní vedlejší tabulky, kterou tento pohled nečte, nebo nepíšou nikam.

Zjištěno při ruční kontrole: potvrzení/odvolání vyúčtování hospodářem a odeslání mailů se v auditu akce nezobrazují, přestože se něco reálně stalo. Tato analýza jde dál a hledá **všechny** podobné mezery v okruhu akcí a vyúčtování.

---

## Aktuální stav

### Jednotný audit

- Tabulka `app.audit_log` (`src/db/schema.ts`) — `entityType`, `entityId`, `action`, `changes` (JSONB diff), `metadata`, `changedBy`, `changedAt`.
- [`getEventAuditLog`](src/lib/actions/events.ts#L633) — jednoduchý pohled, jen pole akce (`entityType = "event"`).
- [`getEventFullAuditLog`](src/lib/actions/event-registrations.ts#L1359) — "forenzní" pohled jen pro hospodáře (`TREASURER_EMAIL`), sjednocuje `entityType IN ("event", "event_registration")`. **Toto je jediné místo, kde by měla být vidět kompletní historie akce — a právě sem se nedostává několik kategorií mutací (viz níže).**

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

### 1. Sjednotit zápis existujících logů do `audit_log`

U tří míst, které už logují (jen jinam), přidat vedle zápisu do vlastní tabulky i řádek do `audit_log` s `entityType: "event"`, `entityId: eventId`:

- `setTreasurerApproval` → `action: "treasurer_approve"` / `"treasurer_revoke"`
- `sendEventSettlementEmails` → `action: "send_settlement_emails"`, `metadata: { sent, skipped, failed }`
- `sendSingleRegistrationEmail` → `action: "send_settlement_email_single"`, `metadata: { registrationId }`
- `logVyuctovaniSend` → `action: "send_vyuctovani_tj"`, `metadata: { recipients }`

Vlastní tabulky (`event_treasurer_approval_log`, `event_settlement_email_sends`, `event_vyuctovani_sends`) zůstávají beze změny — mají specifický tvar dat (příjemci, počty) potřebný pro jiná zobrazení. Jde jen o přidání paralelního záznamu do jednotného auditu.

### 2. Doplnit audit u settlement akcí, které nemají žádný log

Do každé z těchto funkcí přidat `db.insert(auditLog)` se `changes` (kde dává smysl starý/nový stav) a `entityType: "event"`:

- `lockForReimbursement` / `unlockForReimbursement` → `action: "lock_reimbursement"` / `"unlock_reimbursement"`
- `updateEventSubsidy` → `action: "update_subsidy"`, `changes: { subsidyPerMember: { old, new } }`
- `updateExpenseAllocationMethod` → `action: "update_expense_allocation_method"`, `metadata: { expenseId }`, `changes: { allocationMethod: { old, new } }`
- `setExpenseRegistrationAllocations` → `action: "set_expense_registration_allocations"`, `metadata: { expenseId }`
- `setExpenseParticipantCoefficients` → `action: "set_expense_coefficients"`, `metadata: { expenseId }`
- `setDepositPromise` / `setDepositWontPay` → `action: "set_deposit_promise"` / `"set_deposit_wont_pay"`, `metadata: { prescriptionId }`, `changes: { value: { old, new }, note: { old, new } }`

### 3. Doplnit audit v API routách pro náklady akce

V `src/app/api/events/[id]/expenses/route.ts` (POST/PATCH/DELETE) a v `attach-file/route.ts`, `send-invoice-payment/route.ts` přidat `db.insert(auditLog)` po každé úspěšné mutaci:

- POST → `action: "create_expense"`, `metadata: { expenseId }`
- PATCH → `action: "update_expense"`, `metadata: { expenseId }`, `changes` s reálně změněnými poli (částka, kategorie, účel, plátce, `isPaid`...)
- DELETE → `action: "delete_expense"`, `metadata: { expenseId }`, `changes` s hodnotami smazaného řádku (protože po smazání už nejdou dohledat)
- attach-file → `action: "attach_expense_file"`, `metadata: { expenseId, fileName }`
- send-invoice-payment → `action: "send_invoice_payment"`, `metadata: { expenseId }`

Tyto routy zatím `auditLog` neimportují — bude potřeba přidat import a `getDb()`/session stejně jako u ostatních server actions (`auth()` pro `changedBy`).

### 4. Rozšířit `getEventFullAuditLog`

Žádná změna v query není potřeba, pokud všechny výše uvedené akce začnou zapisovat do `audit_log` s `entityType: "event"` — automaticky se objeví. Jen ověřit, že UI (`event-detail-client.tsx` / audit tab) umí zobrazit nové hodnoty `action` čitelně (mapování na české popisky, podobně jako u `update_field`/`accept_from_gcal`).

---

## Co se nemění

- Vlastní tabulky `event_treasurer_approval_log`, `event_settlement_email_sends`, `event_vyuctovani_sends` — zůstávají, jen se doplní paralelní `audit_log` zápis.
- `getVyuctovaniActivityLog` a `getEventSettlementEmailLog` — zůstávají pro svá specifická zobrazení (např. přehled odeslaných mailů s počty).
- Struktura `audit_log` tabulky — žádná migrace není potřeba, jen nové hodnoty `action`/`metadata`.
- `lockBilling` / `unlockBilling` / `updateEventField` / `acceptGcalField` / registrace účastníků — audit už mají, beze změny.

---

## Otevřené otázky

1. U `DELETE /expenses` a dalších destruktivních akcí — má `changes` obsahovat celý smazaný řádek, nebo jen klíčová pole (částka, účel)? Navrhujeme klíčová pole kvůli čitelnosti v UI, plný snapshot do `metadata` pro forenzní účely.
2. Má se do jednotného auditu propsat i legacy `/api/events/[id]/send-vyuctovani` (PDF pro TJ), nebo je to už na vyřazení a nemá smysl do něj investovat? (Ovlivní prioritu bodu 1 pro `logVyuctovaniSend`.)
3. Rozsah tohoto zadání je omezen na akce/vyúčtování (`events`, `event_registrations`, `event_expenses`, `event_payment_prescriptions`). Podobná kontrola pro brigády/lodě/členy není součástí — provést až jako samostatné zadání, pokud bude zájem.
