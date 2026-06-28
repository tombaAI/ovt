# Zadání: Započtení zálohy a příslib zálohy

Samostatný úkol vyčleněný ze sekcí 1 (Bude záloha?), 6 (Příslib zálohy) a 7 (Párování plateb) dokumentu `ZADANI_ZIVOTNI_CYKLUS_AKCE.md`.

---

## Byznys případ

Při vyúčtování akce má každý účastník zaplatit **doplatek = celkové náklady za přihlášku − dotace − záloha**. Záloha se musí odečíst od doplatku, ale jen pokud ji účastník skutečně zaplatil — nebo pokud vedoucí akce ví, že ji záloha je „na cestě" (příslib).

**Příslib zálohy:** Stane se, že záloha dorazila na účet TJ, ale ještě nebyla spárována v systému. Vedoucí akce chce označit zálohu jako „příslib" — potvrdit, že byla odeslána, a aby se s ní počítalo při výpočtu doplatku.

---

## Aktuální stav (co funguje a co ne)

### Co funguje
- Zálohy existují jako `type: "deposit"` předpisy v `event_payment_prescriptions`
- `upsertPrescriptionAmounts` odečítá zálohu: `settlementAmount = max(0, totalAmount − depositAmount)`
- E-mail šablona předává `depositAmount` (pole `depositPrescription?.amount`)

### Co nefunguje
- `depositAmount` se bere vždy z **předpisu** (co bylo napsáno), ne z **uhrazené částky** — odečítá se i záloha, která nebyla zaplacena
- Příslib zálohy neexistuje — chybí DB pole i UI
- E-mail proto může uvádět nesprávný doplatek

---

## Správné chování

Efektivní záloha pro výpočet doplatku:

| Stav zálohy | Efektivní záloha |
|---|---|
| `matched` nebo `paid` | `matchedAmount` (co skutečně přišlo) |
| `pending` + `deposit_promise = true` | `amount` z předpisu (příslib — počítáme s ním) |
| `pending` + `deposit_promise = false` | `0` (záloha nedorazila, nepočítáme) |
| `cancelled` | `0` |

---

## Co se má změnit

### 1. DB — příslib zálohy

Nová pole v `event_payment_prescriptions`:

| Pole | Typ | Popis |
|---|---|---|
| `deposit_promise` | boolean DEFAULT false | Příslib zálohy aktivní |
| `deposit_promise_note` | text | Poznámka (např. „účastník zaslal potvrzení platby") |
| `deposit_promise_by` | text | Email admina, kdo příslib zapsal |
| `deposit_promise_at` | timestamptz | Kdy příslib zapsal |

### 2. Výpočet efektivní zálohy

V `getEventSettlement` (event-settlement.ts:233) nahradit:
```typescript
// PŘED:
const depositAmount = reg.depositPrescription?.amount ?? 0;

// PO:
function effectiveDepositAmount(dep: PrescriptionInfo | null): number {
    if (!dep) return 0;
    if (dep.status === "matched" || dep.status === "paid")
        return dep.matchedAmount ?? dep.amount;
    if (dep.depositPromise)
        return dep.amount;
    return 0;
}
const depositAmount = effectiveDepositAmount(reg.depositPrescription);
```

`PrescriptionInfo` rozšířit o `depositPromise: boolean`.

Stejnou logiku použít v `upsertPrescriptionAmounts` (event-settlement.ts:547) při výpočtu `settlementAmount`.

### 3. E-mail — správná výše doplatku

V `buildSettlementEmailPayload` (event-settlement.ts:801):
```typescript
// PŘED:
depositAmount: reg.depositPrescription?.amount ?? 0,

// PO:
depositAmount: effectiveDepositAmount(reg.depositPrescription),
```

E-mail bude zobrazovat doplatek snížený jen o skutečně přijatou (nebo přislíbenou) zálohu.

### 4. Nový server action — setDepositPromise

```typescript
// src/lib/actions/event-settlement.ts
export async function setDepositPromise(
    prescriptionId: number,
    promise: boolean,
    note: string,
): Promise<{ success: true } | { error: string }>
```

- Ověří session
- Načte předpis, zkontroluje že `type === "deposit"` a `status === "pending"`
- Uloží `deposit_promise`, `deposit_promise_note`, `deposit_promise_by`, `deposit_promise_at`
- `revalidatePath` pro event

### 5. UI — příslib zálohy v záložce Platby

V `event-payments-tab.tsx`, u každé přihlášky, která má `depositPrescription` ve stavu `pending`:

```
záloha C1234  [Čeká na platbu]  [Označit jako příslib]
```

Po kliknutí „Označit jako příslib" otevře malý dialog s polem pro poznámku. Po uložení:
- Badge se změní na „Příslib zálohy" (fialová nebo modrá)
- Doplatek se okamžitě přepočítá v UI

Příslib lze odvolat — znovu se zobrazí „Označit jako příslib".

---

## Co se nemění

- Zálohy ve stavu `matched`/`paid` — fungují správně, nedotčeno
- Tvorba zálohy (deposit předpis) — záloha vzniká z veřejného formuláře nebo ručně; to sem nepatří
- Výpočet alokací nákladů — záloha ho neovlivní

---

## Technické podklady

### Aktuální stav DB / kódu

**`event_payment_prescriptions` (src/db/schema.ts:483)**
- `type: "deposit" | "settlement"` — existuje
- `status: "pending" | "matched" | "paid" | "cancelled"` — existuje
- `matched_amount numeric` — co bylo skutečně zaplaceno — existuje
- Chybí: `deposit_promise*` pole

**`getEventSettlement` (event-settlement.ts:233)**
- Načítá `depositRaw = prescriptions.find(p => p.type === "deposit")` 
- `depositAmount = reg.depositPrescription?.amount ?? 0` — bere PŘEDPIS, ne skutečnou platbu
- Toto je chyba, kterou opravujeme

**`upsertPrescriptionAmounts` (event-settlement.ts:547)**
- `const depositAmount = reg.depositPrescription?.amount ?? 0;` — stejná chyba

**`buildSettlementEmailPayload` (event-settlement.ts:801)**
- `depositAmount: reg.depositPrescription?.amount ?? 0` — stejná chyba

### Migrace

**Soubor: `supabase/migrations/YYYYMMDD_HHMMSS_deposit_promise.sql`**

```sql
ALTER TABLE app.event_payment_prescriptions
  ADD COLUMN deposit_promise    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN deposit_promise_note TEXT,
  ADD COLUMN deposit_promise_by  TEXT,
  ADD COLUMN deposit_promise_at  TIMESTAMPTZ;
```

### Aktualizace Drizzle schématu

**`src/db/schema.ts` — tabulka `eventPaymentPrescriptions`:**

```typescript
depositPromise:     boolean("deposit_promise").notNull().default(false),
depositPromiseNote: text("deposit_promise_note"),
depositPromiseBy:   text("deposit_promise_by"),
depositPromiseAt:   timestamp("deposit_promise_at", { withTimezone: true }),
```

### Rozšíření `PrescriptionInfo`

**`src/lib/actions/event-settlement.ts:42` — typ `PrescriptionInfo`:**

```typescript
export type PrescriptionInfo = {
    // ... stávající pole ...
    depositPromise: boolean;          // nové
    depositPromiseNote: string | null; // nové
};
```

Načíst tato pole v `getEventSettlement` select dotazu.

### Soubory ke změně

| Soubor | Změna |
|---|---|
| `supabase/migrations/…_deposit_promise.sql` | Nová migrace — 4 sloupce |
| `src/db/schema.ts` | Přidat pole do `eventPaymentPrescriptions` |
| `src/lib/actions/event-settlement.ts` | Rozšířit `PrescriptionInfo`, přidat `effectiveDepositAmount()`, opravit výpočet v `getEventSettlement`, `upsertPrescriptionAmounts`, `buildSettlementEmailPayload`; přidat `setDepositPromise()` |
| `src/app/(admin)/dashboard/events/[id]/event-payments-tab.tsx` | UI pro zobrazení zálohy a příslib tlačítko/badge |

---

## Otevřené otázky

1. Pokud záloha je `matched` s `matchedAmount < amount` (zaplatil méně než záloha), odečítáme `matchedAmount` nebo `amount`? (Navrhujeme: `matchedAmount` — odečítáme jen co přišlo.)
2. Příslib lze nastavit i pokud přihláška je stornovaná? (Nejspíše ne — záloha je `cancelled`.)
