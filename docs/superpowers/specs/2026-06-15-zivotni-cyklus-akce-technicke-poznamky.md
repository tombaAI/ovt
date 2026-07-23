---
status: technický podklad (částečně naplněný)
---

# Technické poznámky: životní cyklus akce

> **Stav:** Prioritizovaný seznam z tohoto dokumentu je částečně naplněný — příslib zálohy a odečet zálohy jsou hotové (v produkci); EUR náklady, ubytovací/pojistný přehled, přepínače `has_registrations`/`has_deposit`, pozvánka mailem a status Uzavřeno zůstávají nezahájené, shodně s [2026-06-15-zivotni-cyklus-akce.md](2026-06-15-zivotni-cyklus-akce.md). Viz [INDEX.md](INDEX.md).

Technické podklady k byznys zadání v [2026-06-15-zivotni-cyklus-akce.md](2026-06-15-zivotni-cyklus-akce.md).

---

## Co existuje v DB / kódu

### Tabulky
- `events` — základní data, `billingStatus` (draft/prescribed), `treasurerApproved`, `subsidyPerMember`
- `event_registrations` — přihlášky (e-mail, jméno, počet osob, slug formuláře)
- `event_registration_participants` — jednotlivci v přihlášce (jméno, vazba na member)
- `event_payment_prescriptions` — předpisy plateb (type: deposit/settlement, status, spárování s ledger)
- `event_expenses` — náklady (částka CZK, kategorie, beneficient, alokační metoda, příloha)
- `event_expense_allocations` — rozpis nákladu na přihlášky
- `event_treasurer_approval_log` — log souhlasu hospodáře
- `event_vyuctovani_sends` + `event_settlement_email_sends` — logy odeslaných e-mailů

### Server actions / API
- `src/lib/actions/events.ts` — CRUD akcí, GCal sync, treasurer approval, audit log
- `src/lib/actions/event-registrations.ts` — správa přihlášek
- `src/lib/actions/event-settlement.ts` — výpočet, lock/unlock billing, odeslání e-mailů
- `GET /api/events/[id]/pivnik` — PDF pivník (funguje)
- `GET /api/events/[id]/vyuctovani` — PDF vyúčtování
- `GET /api/events/[id]/ucastnici` — přehled účastníků

### UI tabs v detailu akce
- Základní info (inline edit polí)
- Přihlášky (registrations tab)
- Náklady (expenses tab)
- Vyúčtování (settlement tab — výpočet, lock, subsidy, odeslání)
- Platby (payments tab — předpisy, statusy)

---

## Nová DB pole (migrace)

| Pole | Tabulka | Typ | Účel |
|---|---|---|---|
| `has_registrations` | `events` | boolean DEFAULT false | Přepínač přihlašovacího formuláře |
| `has_deposit` | `events` | boolean DEFAULT false | Přepínač zálohy |
| `deposit_amount` | `events` | numeric(10,2) | Výše zálohy na přihlášku |
| `deposit_due_date` | `events` | date | Splatnost zálohy |
| `amount_foreign` | `event_expenses` | numeric(10,2) | Částka v cizí měně |
| `currency` | `event_expenses` | text | ISO kód měny (EUR, …) |
| `exchange_rate` | `event_expenses` | numeric(10,4) | Kurz při zadání |
| `date_of_birth` | `event_registration_participants` | date | Pro ubytovací přehled a pojištění |
| `deposit_promise` | `event_payment_prescriptions` | boolean DEFAULT false | Příslib zálohy |
| `deposit_promise_note` | `event_payment_prescriptions` | text | Poznámka k příslibu |
| `deposit_promise_by` | `event_payment_prescriptions` | text | Kdo příslib zapsal |
| `deposit_promise_at` | `event_payment_prescriptions` | timestamptz | Kdy příslib zapsal |
| `status` rozšíření o `'closed'` | `events` | enum | Finální uzavření akce |

---

## Nové API routes

- `GET /api/events/[id]/ubytovani` — PDF ubytovací přehled (jméno + datum narození)
- `GET /api/events/[id]/pojisteni` — PDF sběrací arch pojištění

---

## Nové server actions

- `sendEventInvite(eventId, recipientIds, subject, body)` — odeslání pozvánky, logovat do `mail_events` s `event_type = 'event_invite'`
- `setDepositPromise(prescriptionId, note)` — označení příslibu zálohy
- `computeSettlementWithDeposit()` — rozšíření `getEventSettlement()` o odečet zálohy (uhrazená nebo příslib)
- `closeEvent(eventId)` — přechod na status `closed`, s kontrolou podmínek

---

## Prioritizace (navrhovaná)

1. Příslib zálohy — akutní pro běžící akce
2. EUR náklady — potřeba pro zahraniční akce
3. Odečet zálohy ve výpočtu vyúčtování
4. Ubytovací přehled PDF + pojišťovací arch PDF
5. `has_registrations` / `has_deposit` přepínače
6. Pozvánka e-mailem
7. Status „Uzavřeno" + párování TJ výplat
