# Zadání: Zamknout náklady a odeslat předpisy účastníkům

Samostatný úkol vyčleněný ze sekce 6 (Vyúčtování — proces odeslání na účastníky) dokumentu `ZADANI_ZIVOTNI_CYKLUS_AKCE.md`.

**Závislost:** Správné chování zálohy ve výpočtu zajišťuje zadání `ZADANI_ZAPOCITANI_ZALOHY.md` — doporučujeme ho dokončit první, aby e-mail obsahoval správnou výši doplatku.

---

## Byznys případ

Vedoucí akce chce uzamknout výši nákladů z pohledu účastníků (aby se výpočet doplatků nezměnil) a rozeslat jim e-maily s předpisy plateb. Zároveň chce mít možnost dál přikládat doklady k fakturám a jinak pracovat s výdajovou stranou, aniž by se dotkl výpočtu pro účastníky.

Tedy: **dva oddělené zámky** — příjmový (pro účastníky) a výdajový (pro TJ).

---

## Aktuální stav

### Co funguje
- `lockBilling` (event-settlement.ts:279) — nastaví `billingStatus = "prescribed"`, přepočítá a uloží předpisy
- `unlockBilling` — vrátí na `"draft"`, předpisy zůstanou (se správnou částkou do příštího locku)
- `sendEventSettlementEmails` — odešle e-maily; vyžaduje `treasurerApproved === true`
- `sendSingleRegistrationEmail` — odešle jednomu účastníkovi; vyžaduje `billingStatus === "prescribed"` + `treasurerApproved`
- UI: záložka Platby (event-payments-tab.tsx) má tlačítka Zamknout / Odemknout / Rozeslat předpisy

### Problém — jediný zámek blokuje příliš mnoho
Stávající `billingStatus === "prescribed"` blokuje VEŠKEROU editaci nákladů v `assertNotPrescribed` (expenses/route.ts:9). Nelze tedy:
- přiložit fakturu bez dokladu (zadání č. 1) po uzamčení
- upravit příjemce faktury (admin to potřebuje i po uzamčení)

---

## Co se má změnit

### 1. Přidat výdajový zámek

Nové pole v `events`:

| Pole | Typ | Default | Popis |
|---|---|---|---|
| `expenses_locked` | boolean | false | Výdajový zámek — doklady k fakturám jsou zmrazeny, lze odeslat na TJ |

### 2. Upravit logiku editace nákladů

**Dvě skupiny operací s různými podmínkami:**

| Operace | Blokuje příjmový zámek (`prescribed`) | Blokuje výdajový zámek (`expenses_locked`) |
|---|---|---|
| Změna částky / kategorie / alokace | ✓ | ✓ |
| Přidat nový náklad (účtenku nebo fakturu) | ✓ | ✓ |
| Smazat náklad | ✓ | ✓ |
| Přiložit soubor k existující faktuře | ✗ | ✓ |
| Změna `invoicePayeeName` | ✗ | ✓ |
| Odeslat pokyn k úhradě faktury | ✗ | ✓ |

V `assertNotPrescribed` (expenses/route.ts:9) přidat logiku: pro attach-file endpoint (`/expenses/[expenseId]/attach-file`) kontrolovat jen `expenses_locked`, ne `billingStatus`.

Pro PATCH endpoint: rozlišit „full update" (blokováno oběma) od „partial update" — pouze `invoicePayeeName` nebo `isPaid` toggle — blokováno jen `expenses_locked`.

### 3. Nové server actions

```typescript
// src/lib/actions/event-settlement.ts

export async function lockExpenses(
    eventId: number,
): Promise<{ success: true } | { error: string }>
// Nastaví events.expenses_locked = true, uloží updatedAt

export async function unlockExpenses(
    eventId: number,
): Promise<{ success: true } | { error: string }>
// Nastaví events.expenses_locked = false
```

### 4. UI — záložka Platby

**Příjmový zámek (stávající):**

```
[🔒 Zamknout náklady (pro účastníky)]
  → vygeneruje předpisy, zamkne změny částek
[🔓 Odemknout a upravit]

[📧 Rozeslat předpisy všem]  — vyžaduje: prescribed + treasurerApproved
[📧 Odeslat jednomu]         — vyžaduje: prescribed + treasurerApproved
```

**Výdajový zámek (nový):**

```
[🔒 Uzavřít doklady (odeslat na TJ)]
  → zmrazí soubory a příjemce faktur
[🔓 Znovu otevřít doklady]
```

Výdajový zámek zobrazovat v záložce Náklady, poblíž existujícího checkboxu hospodáře.

### 5. Načítání `expenses_locked` v event detail

`event-detail-client.tsx` a komponenty předávají `expenses_locked` do záložky Náklady. `ExpenseItem` respektuje oba zámky podle tabulky výše.

---

## Co se nemění

- `lockBilling` / `unlockBilling` — logika beze změny, jen UI doplní výdajový zámek vedle
- `sendEventSettlementEmails` — zůstane vyžadovat `treasurerApproved`
- `treasurerApproved` checkbox (záložka Náklady) — beze změny
- Předpisy v DB — při odemčení příjmového zámku zůstávají (opraveno v předchozím releasu)

---

## Technické podklady

### Aktuální stav DB / kódu

**`events.billing_status` (src/db/schema.ts:412)**
- `"draft" | "prescribed"` — příjmový zámek
- Chybí: `expenses_locked`

**`assertNotPrescribed` (src/app/api/events/[id]/expenses/route.ts:9)**
Blokuje celý expenses endpoint při `billingStatus === "prescribed"`. Je třeba zpřesnit — různé endpointy potřebují různé kontroly.

**`lockBilling` (event-settlement.ts:279)**
Přepočítá předpisy a nastaví `billingStatus = "prescribed"`. Správné chování zachováme.

**`sendEventSettlementEmails` (event-settlement.ts:831)**
- Vyžaduje `event.treasurerApproved === true` (řádek 845)
- Znovu přepočítá předpisy před odesláním (bezpečné) 
- Beze změny

**`ExpenseItem` (event-expenses-tab.tsx:1590)**
Přijímá prop `locked` (boolean). Skryje tlačítka Upravit a Smazat. Rozšíříme o `expensesLocked` prop.

**`event-detail-client.tsx`**
Načítá `event.billingStatus` a `event.treasurerApproved`. Přidáme `event.expensesLocked`.

### Migrace

**Soubor: `supabase/migrations/YYYYMMDD_HHMMSS_expenses_locked.sql`**

```sql
ALTER TABLE app.events
  ADD COLUMN expenses_locked BOOLEAN NOT NULL DEFAULT false;
```

### Aktualizace Drizzle schématu

**`src/db/schema.ts` — tabulka `events`:**

```typescript
expensesLocked: boolean("expenses_locked").notNull().default(false),
```

### Soubory ke změně

| Soubor | Změna |
|---|---|
| `supabase/migrations/…_expenses_locked.sql` | Nová migrace — 1 sloupec |
| `src/db/schema.ts` | Přidat `expensesLocked` do `events` |
| `src/lib/actions/event-settlement.ts` | Přidat `lockExpenses()`, `unlockExpenses()` |
| `src/app/api/events/[id]/expenses/route.ts` | `assertNotPrescribed` nahradit dvouúrovňovou kontrolou; POST/DELETE blokovat oběma; PATCH (full) blokovat oběma; PATCH (partial: invoicePayeeName, isPaid) blokovat jen `expenses_locked` |
| `src/app/api/events/[id]/expenses/[expenseId]/attach-file/route.ts` | Kontrolovat jen `expenses_locked` (přidáme až jako součást zadání č. 1) |
| `src/app/(admin)/dashboard/events/[id]/event-detail-client.tsx` | Načíst + předat `expensesLocked` |
| `src/app/(admin)/dashboard/events/[id]/event-expenses-tab.tsx` | `ExpenseItem` rozšířit o `expensesLocked` prop; blokovat attach-file jen při `expensesLocked`; UI sekce výdajového zámku |
| `src/app/(admin)/dashboard/events/[id]/event-payments-tab.tsx` | UI sekce výdajového zámku (tlačítka Uzavřít/Otevřít doklady) |

---

## Otevřené otázky

1. Pořadí zámků: je nutné mít příjmový zámek aktivní před uzavřením výdajů, nebo mohou být nezávislé? (Navrhujeme: nezávislé — případ kdy TJ potřebuje faktury rychle se může stát.)
2. Souhlas hospodáře (`treasurerApproved`): má být podmínkou pro příjmový zámek, nebo jen pro odeslání e-mailů? (Dnes je podmínkou pro odeslání — ponecháme tak.)
