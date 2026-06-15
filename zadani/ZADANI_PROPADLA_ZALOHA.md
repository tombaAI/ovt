# Zadání: Propadlá záloha — napočítání na fixní náklad

Samostatný úkol vyčleněný ze sekce 6 (Vyúčtování, storno podmínky) dokumentu `ZADANI_ZIVOTNI_CYKLUS_AKCE.md`.

---

## Byznys případ

Účastník zaplatí zálohu a pak odhlásí účast. Zálohu nelze vrátit v plné výši — část (nebo celá) propadá. Vedoucí akce rozhodne, co se s propadlou částí stane. Konkrétně teď potřebujeme implementovat variantu: **propadlá záloha zlevní jeden konkrétní (fixní) náklad**, např. pronájem chaty. Ostatní varianty jsou připraveny v DB, ale UI pro ně zatím nevznikne.

---

## Byznys logika — varianty propadnutí zálohy

Při rušení přihlášky s existující zálohou admin nastaví:

**A) Kolik se vrátí** (v Kč) — `deposit_refund_amount`

**B) Co se zbytkem** — `deposit_forfeit_policy`:
1. `forfeit_to_expense` — **napočítá se na konkrétní náklad** (zlevní ho; ostatní účastníci platí méně) ← **implementujeme teď**
2. `forfeit_split` — rozpočítá se rovnoměrně na všechny zbývající náklady ← zatím jen DB, UI ne
3. `forfeit_to_club` — propadne oddílu, mimo vyúčtování akce ← zatím jen DB, UI ne

Výpočet efektivní částky nákladu při `forfeit_to_expense`:
```
effectiveAmount = expense.amount − Σ(deposit_refund_remainder pro všechny storna napojené na tento náklad)
```
kde `deposit_refund_remainder = depositPaid − deposit_refund_amount` (kolik zálohy propadlo).

---

## Co se má změnit

### 1. Dialog pro zrušení přihlášky

Stávající `cancelAdminRegistration` dialog v event-detail-client.tsx zobrazí navíc (pouze pokud přihláška má zálohu):

- Pole „Vrátit zálohu" (číslo v Kč, default = celá záloha)
- Výběr varianty propadnutí (radio):
  - „Napočítat na náklad" → select s náklady akce (filtrovány na status=final) ← aktivní
  - Ostatní varianty: skryté nebo disabled s textem „bude doplněno"

### 2. Výpočet vyúčtování

V `getEventSettlement` (event-settlement.ts:85) se pro každý náklad odečtou propadlé zálohy napojené na něj:

```typescript
// Pro každý expense před výpočtem alokací:
const forfeitedForExpense = cancelledRegistrations
  .filter(r => r.depositForfeitPolicy === "forfeit_to_expense" && r.depositForfeitExpenseId === expense.id)
  .reduce((sum, r) => sum + (r.depositPaidAmount - r.depositRefundAmount), 0);
const effectiveAmount = Math.max(0, expense.amount - forfeitedForExpense);
```

Efektivní částka se používá dál ve výpočtu `unitPrice` a alokací — původní `expense.amount` v DB se nemění.

### 3. Zobrazení ve vyúčtování

V záložce Vyúčtování (event-settlement-tab.tsx) u nákladů, kde je propadlá záloha, zobrazit badge „−X Kč (storno záloha)".

---

## Co se nemění

- Zálohy u aktivních přihlášek — nedotčeno.
- Stávající `cancelAdminRegistration` server action — rozšíříme o nové parametry, ale logika zrušení zůstává.
- Přihlášky bez zálohy — dialog zůstane stejný (bez nových polí).

---

## Technické podklady

### Aktuální stav DB / kódu

**`event_registrations` (src/db/schema.ts:426)**
Chybí pole pro storno politiku zálohy — je třeba přidat.

**`cancelAdminRegistration` (event-settlement.ts:1050)**
Nastaví `cancelled_at` a předpisy přejdou na `status = "cancelled"`. Kontroluje, zda záloha nebyla zaplacena — pokud ano, blokuje zrušení. Toto zůstane zachováno: dialog se zobrazí jen pokud záloha není `matched/paid`, NEBO pokud je zaplacená, admin uvidí pole pro nastavení propadnutí.

**`getEventSettlement` (event-settlement.ts:85)**
Načítá náklady a přihlášky. Efektivní částku nákladu zatím nepočítá (bere `expense.amount` přímo). Zde přidáme výpočet s propadlými zálohami.

### Migrace

**Soubor: `supabase/migrations/YYYYMMDD_HHMMSS_deposit_forfeit.sql`**

```sql
ALTER TABLE app.event_registrations
  ADD COLUMN deposit_refund_amount  NUMERIC(10,2),
  ADD COLUMN deposit_forfeit_policy TEXT
      CHECK (deposit_forfeit_policy IN ('forfeit_to_expense','forfeit_split','forfeit_to_club')),
  ADD COLUMN deposit_forfeit_expense_id INTEGER
      REFERENCES app.event_expenses(id) ON DELETE SET NULL;
```

Žádný DEFAULT — pole jsou null pro přihlášky bez zálohy nebo bez storna.

### Aktualizace Drizzle schématu

**`src/db/schema.ts` — tabulka `eventRegistrations`:**

```typescript
depositRefundAmount:     numeric("deposit_refund_amount", { precision: 10, scale: 2 }),
depositForfeitPolicy:    text("deposit_forfeit_policy", {
                           enum: ["forfeit_to_expense", "forfeit_split", "forfeit_to_club"]
                         }),
depositForfeitExpenseId: integer("deposit_forfeit_expense_id")
                           .references(() => eventExpenses.id, { onDelete: "set null" }),
```

### Soubory ke změně

| Soubor | Změna |
|---|---|
| `supabase/migrations/…_deposit_forfeit.sql` | Nová migrace — 3 sloupce |
| `src/db/schema.ts` | Přidat pole do `eventRegistrations` |
| `src/lib/actions/event-settlement.ts` | `cancelAdminRegistration` — přijme `{ depositRefundAmount?, depositForfeitPolicy?, depositForfeitExpenseId? }`; uloží do DB. `getEventSettlement` — načíst zrušené přihlášky s forfeit daty, odečíst od efektivní částky nákladu. |
| `src/app/(admin)/dashboard/events/[id]/event-detail-client.tsx` | Dialog pro zrušení přihlášky — zobrazit zálohu a nová pole (refund amount + forfeit policy + select nákladu) pokud přihláška má zálohu |
| `src/app/(admin)/dashboard/events/[id]/event-settlement-tab.tsx` | Zobrazit badge „−X Kč (storno záloha)" u nákladů kde propadla záloha |

---

## Otevřené otázky

1. Co se stane se zálohou, která propadla a ještě nebyla spárována? (Zatím ji spárujeme ručně nebo necháme jako nenapárovanou platbu.)
2. Pokud admin změní výši refundace po zrušení, potřebujeme přepočítat vyúčtování — stačí `lockBilling` znovu, nebo chceme explicitní tlačítko „Přepočítat"?
