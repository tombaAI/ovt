---
status: produkce
---

# Zadání: Propadlá záloha — napočítání na fixní náklad

> **Stav: V produkci.** Propadlá záloha per účastník je nasazená — viz [INDEX.md](INDEX.md).

Samostatný úkol vyčleněný ze sekce 6 (Vyúčtování, storno podmínky) dokumentu [2026-06-15-zivotni-cyklus-akce.md](2026-06-15-zivotni-cyklus-akce.md).

---

## Finanční model (základ)

Finance akce se počítají **per účastník (person)**. Registrace je jen platební obálka — jedna bankovní platba za skupinu, ale výpočty probíhají per hlava.

**Záloha** (`event_payment_prescriptions.type = "deposit"`) je fixní částka na akci — vždy určená jako pevná sazba × počet osob. Proto:
- `depositPrescription.amount = fixní_sazba × registration.personsCount`
- Podíl jednoho účastníka = `prescription.amount / personsCount` (přesně = fixní_sazba)
- Tato hodnota je **deterministická** — nepotřebuje se nikam ukládat jako konfigurovatelné pole.

---

## Byznys případ

Přihláška může obsahovat více účastníků (rodina, skupina). Jeden nebo více z nich odhlásí účast — ale ne nutně všichni. Záloha odpovídající jejich podílu (fixní sazba × jejich počet) nelze vrátit v plné výši — část propadá.

Vedoucí akce rozhodne za každého odhlašujícího účastníka:
- kolik Kč se mu vrátí (`deposit_refund_amount`)
- co se stane se zbytkem

---

## Byznys logika

### Dvě situace

**A) Celá přihláška se ruší** — všichni účastníci odhlásí.
- Stávající tok: `cancelAdminRegistration` nastaví `cancelled_at` na přihlášce.
- Rozšíříme o záložní politiku (viz níže).

**B) Jen někteří účastníci nejedou** — přihláška zůstává aktivní, ostatní jedou dál.
- Nový tok: admin označí konkrétní účastníky jako „nejede".
- Přihláška sama o sobě není zrušena, jen je vidět kdo vypadl a jak se vyřešila jeho záloha.

---

### Záložní politika per odhlášený účastník

**Fixní podíl zálohy** na odhlašujícího = `depositPrescription.amount / personsCount` (odvozeno, neuloženo)

**Vrácená část** = `deposit_refund_amount` — admin nastaví, kolik Kč se vrátí (0 až celý podíl)

**Propadlá část** = `podíl − deposit_refund_amount`

**Co se zbytkem** — `deposit_forfeit_policy`:
1. `forfeit_to_expense` — **napočítá se na konkrétní náklad** (zlevní ho pro ostatní) ← **implementujeme teď**
2. `forfeit_split` — rozpočítá se na všechny zbývající náklady ← zatím jen DB, UI ne
3. `forfeit_to_club` — propadne oddílu, mimo vyúčtování akce ← zatím jen DB, UI ne

**Na který náklad** — `deposit_forfeit_expense_id` (jen při policy `forfeit_to_expense`)

### Výpočet efektivní částky nákladu

Při `forfeit_to_expense`:
```
effectiveAmount = expense.amount
                − Σ(podíl − deposit_refund_amount)
                  pro všechny odhlášené účastníky napojené na tento náklad
```
kde `podíl = depositPrescription.amount / personsCount`.

Původní `expense.amount` v DB se nemění — efektivní částka slouží jen pro výpočet vyúčtování.

---

### Viditelnost

U každé přihlášky, kde někdo nevyjel, musí být jasně vidět:
- kolik účastníků z přihlášky nejede — badge **„N nejede"** na řádku přihlášky
- jméno každého odhlášeného + jak se vyřešila jeho záloha (vráceno X Kč / propadlo Y Kč → náklad Z)
- u příslušného nákladu ve vyúčtování: badge **„−Y Kč (storno záloha)"**

---

## Co se mění v UI

### 1. Přehled přihlášek (event-detail-client.tsx)

Řádek přihlášky:
- Badge „N nejede" pokud má přihláška ≥1 odhlášeného účastníka ale přihláška samotná není zrušena

V detailu přihlášky (sheet nebo rozbalený řádek):
- Seznam všech účastníků s ikonkou ✓ jedou / ✗ nejede
- Tlačítko „Označit jako nejede" u každého aktivního účastníka
- U každého odhlášeného: zobrazit vráceno / propadlo / kam

### 2. Dialog „Účastník nejede"

Otevře se po kliknutí „Označit jako nejede" u konkrétního účastníka.

Zobrazuje (jen pokud přihláška má zálohu — prescription existuje):
- Jméno účastníka (read-only)
- **Záloha za tohoto účastníka** = `prescription.amount / personsCount` Kč (informativně, read-only)
- **„Vrátit"** — číslo v Kč, default = 0, max = záloha za tohoto účastníka
- **Politika propadnutí** (radio):
  - „Napočítat na náklad" → select nákladů akce (`status = final`) ← aktivní
  - Ostatní varianty: disabled, „bude doplněno"
- Tlačítko Uložit / Zrušit

Pokud přihláška zálohu nemá: dialog jen potvrdí odhlášení bez záložních polí.

### 3. Dialog pro zrušení celé přihlášky

Stávající `cancelAdminRegistration` dialog — rozšíříme stejně jako výše.
- Pole se týkají celé zálohy (ne per-účastník), protože se ruší všichni najednou
- Pokud někteří účastníci již jsou odhlášeni, dialog pracuje se zbývající neřešenou zálohou

### 4. Vyúčtování — záložka Náklady (event-settlement-tab.tsx)

U nákladů, kde propadla záloha:
- Badge „−Y Kč (storno záloha)" vedle částky nákladu
- Tooltip / rozbalovací řádek: kdo odhlásil, kolik propadlo

---

## Co se nemění

- Zálohy u aktivních přihlášek — nedotčeno.
- Přihlášky bez zálohy — bez nových polí.
- Výpočet unitPrice a alokací — nedotčen (jen efektivní částka nákladu se mění pro výpočet, ne unitPrice).

---

## Technická analýza

### Datový model

Záloha je na přihlášce (`event_payment_prescriptions`). Odhlášení a záložní politika se ukládají na `event_registration_participants`, protože granularita je per účastník.

```
event_registrations
  └─ cancelled_at                     ← celkové zrušení přihlášky (stávající)

event_registration_participants       ← záložní pole zde (nové)
  └─ cancelled_at                     ← tento účastník nejede
  └─ deposit_refund_amount            ← kolik Kč se mu vrátí
  └─ deposit_forfeit_policy           ← kam propadne zbytek
  └─ deposit_forfeit_expense_id       ← FK na event_expenses (nullable)
```

`deposit_portion` se **neukládá** — vždy se odvozuje jako `depositPrescription.amount / personsCount`.

Pro celkové zrušení přihlášky (situace A) nastavíme `cancelled_at` + záložní pole na **všechny** účastníky + `cancelled_at` na přihlášce (zachování stávajícího chování).

### Migrace

**Soubor: `supabase/migrations/YYYYMMDD_HHMMSS_participant_deposit_forfeit.sql`**

```sql
ALTER TABLE app.event_registration_participants
  ADD COLUMN cancelled_at              TIMESTAMPTZ,
  ADD COLUMN deposit_refund_amount     NUMERIC(10,2),
  ADD COLUMN deposit_forfeit_policy    TEXT
      CHECK (deposit_forfeit_policy IN ('forfeit_to_expense','forfeit_split','forfeit_to_club')),
  ADD COLUMN deposit_forfeit_expense_id INTEGER
      REFERENCES app.event_expenses(id) ON DELETE SET NULL;

CREATE INDEX event_reg_participants_cancelled_idx
  ON app.event_registration_participants(cancelled_at)
  WHERE cancelled_at IS NOT NULL;
```

### Drizzle schéma

**`src/db/schema.ts` — tabulka `eventRegistrationParticipants`:**

```typescript
cancelledAt:               timestamp("cancelled_at", { withTimezone: true }),
depositRefundAmount:       numeric("deposit_refund_amount", { precision: 10, scale: 2 }),
depositForfeitPolicy:      text("deposit_forfeit_policy", {
                             enum: ["forfeit_to_expense", "forfeit_split", "forfeit_to_club"]
                           }),
depositForfeitExpenseId:   integer("deposit_forfeit_expense_id")
                             .references(() => eventExpenses.id, { onDelete: "set null" }),
```

### Nová server action

**`cancelParticipant(participantId, data)` v `event-settlement.ts`:**

```typescript
interface CancelParticipantData {
  depositRefundAmount?:     number;
  depositForfeitPolicy?:    "forfeit_to_expense" | "forfeit_split" | "forfeit_to_club";
  depositForfeitExpenseId?: number;
}
```

- Nastaví `cancelled_at = now()` + záložní pole na daného účastníka
- Pokud jsou po této operaci **všichni** účastníci přihlášky odhlášeni → automaticky nastaví i `cancelled_at` na `event_registrations` (přihláška přejde do stavu zrušeno)
- Revaliduje stránku

### Rozšíření `cancelAdminRegistration`

Přijme volitelně záložní data a aplikuje je na všechny účastníky přihlášky najednou.

### Rozšíření `getEventSettlement`

```typescript
// Odvozená hodnota per participant (neukládá se do DB):
const depositPerParticipant = (reg: SettlementRegistrationRow) => {
    const total = effectiveDepositAmount(reg.depositPrescription);
    const count = reg.personsCount;
    return count > 0 ? total / count : 0;
};

// Pro každý expense — odečtení propadlých záloh:
const forfeitedForExpense = allParticipants
  .filter(p =>
    p.cancelledAt !== null &&
    p.depositForfeitPolicy === "forfeit_to_expense" &&
    p.depositForfeitExpenseId === expense.id
  )
  .reduce((sum, p) => {
    const reg = registrationForParticipant(p);
    const portion = depositPerParticipant(reg);
    const refund = Number(p.depositRefundAmount ?? 0);
    return sum + Math.max(0, portion - refund);
  }, 0);

const effectiveAmount = Math.max(0, expense.amount - forfeitedForExpense);
```

`getEventSettlement` musí načíst i odhlášené účastníky (s jejich záložními poli) — ne jen aktivní.

### Soubory ke změně

| Soubor | Změna |
|---|---|
| `supabase/migrations/…_participant_deposit_forfeit.sql` | Nová migrace — 4 sloupce na `event_registration_participants` |
| `src/db/schema.ts` | Přidat 4 pole do `eventRegistrationParticipants` |
| `src/lib/actions/event-settlement.ts` | Nová action `cancelParticipant`; rozšíření `cancelAdminRegistration`; rozšíření `getEventSettlement` — načíst i odhlášené účastníky, odečíst jejich zálohy od efektivní částky nákladů |
| `src/app/(admin)/dashboard/events/[id]/event-detail-client.tsx` | Badge „N nejede" na řádku přihlášky; dialog „Účastník nejede" per participant; rozšíření stávajícího cancel dialogu |
| `src/app/(admin)/dashboard/events/[id]/event-settlement-tab.tsx` | Badge „−Y Kč (storno záloha)" u nákladů |

---

## Otevřené otázky

1. **Záloha ještě nebyla zaplacena** — pokud `depositPrescription.status = pending` (ne matched/paid), forfeit počítáme z `prescription.amount`, ale fyzicky nic nepropadlo. Nejspíš: evidovat storno i tak, ale ve vyúčtování zobrazit upozornění „záloha nebyla přijata".
2. **Přepočet po změně** — pokud admin upraví `deposit_refund_amount` po uložení, vyúčtování se přepočítá automaticky (deterministická funkce). Žádné explicitní tlačítko „Přepočítat" není třeba.
3. **Fyzická refundace** — `deposit_refund_amount` je evidenční hodnota; platba zpět proběhne mimo systém. Systém jen zaznamená rozhodnutí.
