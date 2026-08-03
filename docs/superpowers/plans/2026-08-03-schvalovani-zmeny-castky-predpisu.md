# Schvalování změny částky vyúčtování po vygenerování předpisu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přepočet vyúčtování akce (`lockBilling`/`regeneratePrescriptions`) nikdy potichu nezmění už vygenerovanou částku settlement předpisu — místo toho vytvoří návrh (`proposedAmount`), který admin výslovně potvrdí (jednotlivě nebo hromadně).

**Architecture:** Čistá rozhodovací funkce (`decideProposalAction`) určuje akci (přímý zápis / žádná akce / vyčištění návrhu / nastavení návrhu) čistě z `currentAmount`/`newAmount`/`hasPendingProposal` — bez DB závislosti, testovaná Vitestem. `upsertPrescriptionAmounts` (DB adaptér v `event-settlement.ts`) ji volá pro každou přihlášku a aplikuje výsledek. Dvě nové server actions (`confirmProposedAmount`, `confirmProposedAmounts`) provádějí potvrzení. UI (`event-payments-tab.tsx`) zobrazí návrh vedle platné částky a nabídne potvrzení.

**Tech Stack:** Next.js 15 server actions, Drizzle ORM (Neon Postgres), Vitest (unit), React (client component).

## Global Constraints

- **Rozsah jen `type = 'settlement'`** — zálohy (`type = 'deposit'`) tímhle mechanismem nejsou dotčené (viz zadání, otázka 2).
- **KISS — žádný stavový enum, žádné zamítnutí, žádné TTL, žádná paměť.** Jen dvě nová pole: `proposedAmount` (nullable numeric), `proposedAt` (nullable timestamp). Žádná `rejectProposedAmount` akce.
- **Živé čtení (`getEventSettlement`) nikdy nezapisuje do DB.** `proposedAmount`/`proposedAt` se zapisují výhradně uvnitř `upsertPrescriptionAmounts`, volané jen z `lockBilling`/`regeneratePrescriptions` (explicitní admin akce).
- **První generování (`currentAmount == 0`) je vždy přímý zápis**, bez návrhu — chrání se až druhé a další přepočtení.
- **Žádná změna se neaplikuje na `matched`/`paid` předpisy automaticky** — i ty teď procházejí stejnou rozhodovací logikou (návrh se ukáže, `amount` se nezmění, dokud admin nepotvrdí).
- Zdrojový dokument: [docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md](../specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md).

---

## File Structure

| Soubor | Odpovědnost |
|---|---|
| `src/db/schema.ts` | Přidá `proposedAmount`/`proposedAt` na `eventPaymentPrescriptions` |
| `supabase/migrations/20260803_150000_add_prescription_proposed_amount.sql` | DDL pro nová pole |
| `src/lib/prescription-proposal.ts` (nový) | Čistá rozhodovací funkce — jediné místo, kde žije logika „kdy zapsat přímo / kdy navrhnout" |
| `src/lib/prescription-proposal.test.ts` (nový) | Unit testy rozhodovací funkce |
| `src/lib/actions/event-settlement.ts` | `PrescriptionInfo` + select (čtení nových polí), `upsertPrescriptionAmounts`/`lockBilling`/`regeneratePrescriptions` (zápis), nové `confirmProposedAmount`/`confirmProposedAmounts` |
| `src/app/(admin)/dashboard/events/[id]/event-payments-tab.tsx` | Zobrazení návrhu + potvrzení (jednotlivě, hromadně) |

---

## Task 1: Schema — nová pole `proposedAmount`/`proposedAt`

**Files:**
- Modify: `src/db/schema.ts:496-537` (`eventPaymentPrescriptions` definice tabulky)
- Create: `supabase/migrations/20260803_150000_add_prescription_proposed_amount.sql`

**Interfaces:**
- Produces: `eventPaymentPrescriptions.proposedAmount: numeric(10,2) | null`, `eventPaymentPrescriptions.proposedAt: timestamptz | null` — Drizzle sloupce, čte je Task 3.

- [ ] **Step 1: Přidat sloupce do Drizzle schématu**

V `src/db/schema.ts` najdi definici `eventPaymentPrescriptions` (obsahuje řádek `emailSentAt: timestamp("email_sent_at", { withTimezone: true }),`). Za tento řádek přidej:

```ts
        // Návrh přepočtené částky (mechanismus schvalování změny — viz
        // docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md).
        // Vyplní se jen když se přepočet liší od `amount` a `amount` už bylo reálně
        // vygenerováno (ne 0). `amount` se dál nemění, dokud admin proposedAmount
        // výslovně nepotvrdí (confirmProposedAmount/confirmProposedAmounts).
        proposedAmount: numeric("proposed_amount", { precision: 10, scale: 2 }),
        proposedAt: timestamp("proposed_at", { withTimezone: true }),
```

Výsledek (kontext, needn't retype beyond the insert above):

```ts
        emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
        proposedAmount: numeric("proposed_amount", { precision: 10, scale: 2 }),
        proposedAt: timestamp("proposed_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
```

- [ ] **Step 2: Napsat migrační soubor**

Vytvoř `supabase/migrations/20260803_150000_add_prescription_proposed_amount.sql`:

```sql
-- Mechanismus schvalování změny částky vyúčtování po vygenerování předpisu —
-- viz docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md.
-- Jen pro type = 'settlement'; zálohy (type = 'deposit') tímhle nejsou dotčené.

ALTER TABLE app.event_payment_prescriptions
    ADD COLUMN IF NOT EXISTS proposed_amount numeric(10, 2),
    ADD COLUMN IF NOT EXISTS proposed_at timestamptz;
```

- [ ] **Step 3: Ověřit typovou konzistenci**

Run: `npx tsc --noEmit`
Expected: bez chyb (nová pole zatím nikde nejsou čtena/zapisována, jen přidaná do typu tabulky).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts supabase/migrations/20260803_150000_add_prescription_proposed_amount.sql
git commit -m "feat(events): přidat proposedAmount/proposedAt na settlement předpis"
```

---

## Task 2: Čistá rozhodovací funkce `decideProposalAction`

**Files:**
- Create: `src/lib/prescription-proposal.ts`
- Test: `src/lib/prescription-proposal.test.ts`

**Interfaces:**
- Produces: `decideProposalAction(currentAmount: number, newAmount: number, hasPendingProposal: boolean): ProposalAction`, kde
  ```ts
  type ProposalAction =
      | { kind: "write_amount"; amount: number }
      | { kind: "no_op" }
      | { kind: "clear_proposal" }
      | { kind: "set_proposal"; proposedAmount: number };
  ```
  — konzumuje ho Task 4 (`upsertPrescriptionAmounts`).

- [ ] **Step 1: Napsat padající testy**

Vytvoř `src/lib/prescription-proposal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideProposalAction } from "./prescription-proposal";

// Scénáře odpovídají docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md,
// sekce "Navrhovaný tok" — Zápis (uvnitř upsertPrescriptionAmounts).

describe("decideProposalAction", () => {
    it("nikdy reálně vygenerováno (currentAmount = 0) → přímý zápis, bez ohledu na hasPendingProposal", () => {
        expect(decideProposalAction(0, 4578, false)).toEqual({ kind: "write_amount", amount: 4578 });
        expect(decideProposalAction(0, 0, false)).toEqual({ kind: "write_amount", amount: 0 });
    });

    it("přepočet sedí s platnou částkou a nevisí žádný návrh → žádná akce", () => {
        expect(decideProposalAction(4315, 4315, false)).toEqual({ kind: "no_op" });
    });

    it("přepočet sedí s platnou částkou, ale visí starý návrh → vyčistit (nesoulad zmizel)", () => {
        expect(decideProposalAction(4315, 4315, true)).toEqual({ kind: "clear_proposal" });
    });

    it("přepočet se liší od platné částky → návrh, bez ohledu na to, jestli už nějaký visel", () => {
        expect(decideProposalAction(4315, 4578, false)).toEqual({ kind: "set_proposal", proposedAmount: 4578 });
        expect(decideProposalAction(4315, 4578, true)).toEqual({ kind: "set_proposal", proposedAmount: 4578 });
    });

    it("liší se i směrem dolů (accepted amount klesl)", () => {
        expect(decideProposalAction(4578, 4315, false)).toEqual({ kind: "set_proposal", proposedAmount: 4315 });
    });
});
```

- [ ] **Step 2: Spustit testy a ověřit selhání**

Run: `npx vitest run src/lib/prescription-proposal.test.ts`
Expected: FAIL — `Cannot find module './prescription-proposal'`

- [ ] **Step 3: Napsat implementaci**

Vytvoř `src/lib/prescription-proposal.ts`:

```ts
/**
 * Rozhodovací logika pro krok "zápis" v upsertPrescriptionAmounts (event-settlement.ts) —
 * viz docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md.
 * Čistá funkce, žádná DB závislost — jediné místo, které určuje, kdy se smí částka
 * settlement předpisu přepsat přímo a kdy musí vzniknout návrh k potvrzení.
 */

export type ProposalAction =
    | { kind: "write_amount"; amount: number }
    | { kind: "no_op" }
    | { kind: "clear_proposal" }
    | { kind: "set_proposal"; proposedAmount: number };

export function decideProposalAction(
    currentAmount: number,
    newAmount: number,
    hasPendingProposal: boolean,
): ProposalAction {
    if (currentAmount === 0) return { kind: "write_amount", amount: newAmount };
    if (currentAmount === newAmount) return hasPendingProposal ? { kind: "clear_proposal" } : { kind: "no_op" };
    return { kind: "set_proposal", proposedAmount: newAmount };
}
```

- [ ] **Step 4: Spustit testy a ověřit průchod**

Run: `npx vitest run src/lib/prescription-proposal.test.ts`
Expected: PASS (5 testů)

- [ ] **Step 5: Commit**

```bash
git add src/lib/prescription-proposal.ts src/lib/prescription-proposal.test.ts
git commit -m "feat(events): čistá rozhodovací funkce decideProposalAction + testy"
```

---

## Task 3: Číst `proposedAmount`/`proposedAt` přes `PrescriptionInfo`

**Files:**
- Modify: `src/lib/actions/event-settlement.ts:74-88` (`type PrescriptionInfo`)
- Modify: `src/lib/actions/event-settlement.ts:285-304` (select `prescriptions`)
- Modify: `src/lib/actions/event-settlement.ts:469-486` (`toPrescriptionInfo`)

**Interfaces:**
- Consumes: nic nového (jen existující `eventPaymentPrescriptions` tabulka z Task 1).
- Produces: `PrescriptionInfo.proposedAmount: number | null`, `PrescriptionInfo.proposedAt: Date | null` — čte je Task 4 (rozhoduje podle nich) a Task 6 (UI zobrazení).

- [ ] **Step 1: Rozšířit typ `PrescriptionInfo`**

Najdi (`event-settlement.ts:74-88`):

```ts
export type PrescriptionInfo = {
    id: number;
    prescriptionCode: number;
    variableSymbol: string;
    bankAccount: string;
    status: string;
    amount: number;
    matchedAmount: number | null;
    paymentDue: string | null;
    depositPromise: boolean;
    depositPromiseNote: string | null;
    depositWontPay: boolean;
    depositWontPayNote: string | null;
    emailSentAt: Date | null;
};
```

Nahraď za:

```ts
export type PrescriptionInfo = {
    id: number;
    prescriptionCode: number;
    variableSymbol: string;
    bankAccount: string;
    status: string;
    amount: number;
    matchedAmount: number | null;
    paymentDue: string | null;
    depositPromise: boolean;
    depositPromiseNote: string | null;
    depositWontPay: boolean;
    depositWontPayNote: string | null;
    emailSentAt: Date | null;
    /** Návrh přepočtené částky, čeká na potvrzení (mechanismus schvalování změny) — null = žádný nevyřízený návrh. */
    proposedAmount: number | null;
    proposedAt: Date | null;
};
```

- [ ] **Step 2: Doplnit select query**

Najdi (`event-settlement.ts:285-304`) blok `const prescriptions = regIds.length > 0 ? await db.select({...`. Uvnitř `.select({...})` za řádek `emailSentAt: eventPaymentPrescriptions.emailSentAt,` přidej:

```ts
            proposedAmount: eventPaymentPrescriptions.proposedAmount,
            proposedAt: eventPaymentPrescriptions.proposedAt,
```

- [ ] **Step 3: Doplnit mapování v `toPrescriptionInfo`**

Najdi (`event-settlement.ts:469-486`):

```ts
        const toPrescriptionInfo = (p: typeof depositRaw): PrescriptionInfo | null =>
            p ? {
                id: p.id,
                prescriptionCode: p.prescriptionCode,
                bankAccount: p.bankAccount,
                variableSymbol: p.variableSymbol,
                status: p.status,
                amount: parseFloat(p.amount),
                matchedAmount: p.matchedAmount ? parseFloat(p.matchedAmount) : null,
                paymentDue: p.paymentDue,
                depositPromise: p.depositPromise,
                depositPromiseNote: p.depositPromiseNote,
                depositWontPay: p.depositWontPay,
                depositWontPayNote: p.depositWontPayNote,
                emailSentAt: p.emailSentAt,
            } : null;
```

Nahraď za:

```ts
        const toPrescriptionInfo = (p: typeof depositRaw): PrescriptionInfo | null =>
            p ? {
                id: p.id,
                prescriptionCode: p.prescriptionCode,
                bankAccount: p.bankAccount,
                variableSymbol: p.variableSymbol,
                status: p.status,
                amount: parseFloat(p.amount),
                matchedAmount: p.matchedAmount ? parseFloat(p.matchedAmount) : null,
                paymentDue: p.paymentDue,
                depositPromise: p.depositPromise,
                depositPromiseNote: p.depositPromiseNote,
                depositWontPay: p.depositWontPay,
                depositWontPayNote: p.depositWontPayNote,
                emailSentAt: p.emailSentAt,
                proposedAmount: p.proposedAmount ? parseFloat(p.proposedAmount) : null,
                proposedAt: p.proposedAt,
            } : null;
```

- [ ] **Step 4: Ověřit typy a že stávající testy dál procházejí**

Run: `npx tsc --noEmit && npx vitest run`
Expected: bez chyb, všechny stávající testy (39 + 5 nových z Task 2) PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/event-settlement.ts
git commit -m "feat(events): číst proposedAmount/proposedAt do PrescriptionInfo"
```

---

## Task 4: `upsertPrescriptionAmounts` používá `decideProposalAction`

**Files:**
- Modify: `src/lib/actions/event-settlement.ts:1057-1132` (`regeneratePrescriptions`, `upsertPrescriptionAmounts`)
- Modify: `src/lib/actions/event-settlement.ts:659-691` (`lockBilling`)

**Interfaces:**
- Consumes: `decideProposalAction` z Task 2, `PrescriptionInfo.proposedAmount` z Task 3.
- Produces: `upsertPrescriptionAmounts` vrací `{ created: number; updated: number; proposed: number }` (přidané pole `proposed`), `regeneratePrescriptions` vrací `{ created; updated; proposed } | { error }`, `lockBilling` vrací `{ success: true; proposed: number } | { error }` — čte je Task 6 (UI zpětná vazba).

- [ ] **Step 1: Přidat import**

V hlavičce `event-settlement.ts` (blok importů z `@/lib/settlement-calc`, řádky 24-41) přidej import z nového modulu, hned pod poslední `import ... from "@/lib/settlement-calc";`:

```ts
import { decideProposalAction } from "@/lib/prescription-proposal";
```

- [ ] **Step 2: Přepsat `upsertPrescriptionAmounts`**

Najdi celou funkci (`event-settlement.ts:1091-1132`):

```ts
async function upsertPrescriptionAmounts(
    eventId: number,
    settlement: Awaited<ReturnType<typeof getEventSettlement>>,
    eventName: string,
    db: ReturnType<typeof getDb>,
): Promise<{ created: number; updated: number }> {
    const paymentDue = new Date();
    paymentDue.setDate(paymentDue.getDate() + 7);
    const paymentDueStr = paymentDue.toISOString().slice(0, 10);
    let created = 0, updated = 0;

    await db.transaction(async tx => {
        for (const reg of settlement.registrations) {
            const settlementAmount = String(Math.max(0, reg.totalAmount - reg.effectiveDepositForSettlement));

            // Pojistka: už zaplacený/spárovaný doplatek se NIKDY nepřepisuje — člověk zaplatil
            // dohodnutou částku, ta platí (důvěra uživatelů > korunová přesnost). Přepočet smí
            // měnit jen pending předpisy. Viz no-regen-after-payments.
            if (reg.settlementPrescription && (reg.settlementPrescription.status === "matched" || reg.settlementPrescription.status === "paid")) {
                continue;
            }

            if (reg.settlementPrescription) {
                await tx.update(eventPaymentPrescriptions)
                    .set({ amount: settlementAmount, paymentDue: paymentDueStr, updatedAt: new Date() })
                    .where(eq(eventPaymentPrescriptions.id, reg.settlementPrescription.id));
                updated++;
            } else {
                await createSettlementPrescription(tx, eventId, reg.registrationId, reg.firstName, reg.lastName, eventName);
                // Při prvním vytvoření nastavíme správnou částku a splatnost
                await tx.update(eventPaymentPrescriptions)
                    .set({ amount: settlementAmount, paymentDue: paymentDueStr })
                    .where(and(
                        eq(eventPaymentPrescriptions.registrationId, reg.registrationId),
                        eq(eventPaymentPrescriptions.type, "settlement"),
                    ));
                created++;
            }
        }
    });
    return { created, updated };
}
```

Nahraď za:

```ts
/**
 * Interní helper: vytvoří nebo aktualizuje settlement (doplatek) předpisy.
 * Deposit předpisy (zálohy) se NIKDY nemění — jejich částka je fixní od přihlášky.
 * Settlement částka = max(0, totalAmount − depositAmount).
 *
 * Jednou vygenerovaná částka se nikdy nepřepíše potichu (viz
 * docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md) — o tom,
 * co přesně se stane, rozhoduje decideProposalAction. Platí i pro matched/paid
 * předpisy: rozdíl se ukáže jako návrh, `amount` (co bylo skutečně zaplaceno/dohodnuto)
 * se nezmění, dokud ho admin výslovně nepotvrdí.
 */
async function upsertPrescriptionAmounts(
    eventId: number,
    settlement: Awaited<ReturnType<typeof getEventSettlement>>,
    eventName: string,
    db: ReturnType<typeof getDb>,
): Promise<{ created: number; updated: number; proposed: number }> {
    const paymentDue = new Date();
    paymentDue.setDate(paymentDue.getDate() + 7);
    const paymentDueStr = paymentDue.toISOString().slice(0, 10);
    let created = 0, updated = 0, proposed = 0;

    await db.transaction(async tx => {
        for (const reg of settlement.registrations) {
            const newAmount = Math.max(0, reg.totalAmount - reg.effectiveDepositForSettlement);

            if (!reg.settlementPrescription) {
                await createSettlementPrescription(tx, eventId, reg.registrationId, reg.firstName, reg.lastName, eventName);
                // Při prvním vytvoření nastavíme správnou částku a splatnost — nikdy návrh,
                // amount = 0 před tímto zápisem znamená "nic nebylo vygenerováno", není co chránit.
                await tx.update(eventPaymentPrescriptions)
                    .set({ amount: String(newAmount), paymentDue: paymentDueStr })
                    .where(and(
                        eq(eventPaymentPrescriptions.registrationId, reg.registrationId),
                        eq(eventPaymentPrescriptions.type, "settlement"),
                    ));
                created++;
                continue;
            }

            const decision = decideProposalAction(
                reg.settlementPrescription.amount,
                newAmount,
                reg.settlementPrescription.proposedAmount !== null,
            );

            switch (decision.kind) {
                case "write_amount":
                    await tx.update(eventPaymentPrescriptions)
                        .set({ amount: String(decision.amount), paymentDue: paymentDueStr, updatedAt: new Date() })
                        .where(eq(eventPaymentPrescriptions.id, reg.settlementPrescription.id));
                    updated++;
                    break;
                case "clear_proposal":
                    await tx.update(eventPaymentPrescriptions)
                        .set({ proposedAmount: null, proposedAt: null })
                        .where(eq(eventPaymentPrescriptions.id, reg.settlementPrescription.id));
                    break;
                case "set_proposal":
                    await tx.update(eventPaymentPrescriptions)
                        .set({ proposedAmount: String(decision.proposedAmount), proposedAt: new Date() })
                        .where(eq(eventPaymentPrescriptions.id, reg.settlementPrescription.id));
                    proposed++;
                    break;
                case "no_op":
                    break;
            }
        }
    });
    return { created, updated, proposed };
}
```

- [ ] **Step 3: Propagovat `proposed` přes `regeneratePrescriptions`**

Najdi (`event-settlement.ts:1057-1084`):

```ts
export async function regeneratePrescriptions(
    eventId: number,
): Promise<{ error: string } | { created: number; updated: number }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };
        const settlement = await getEventSettlement(eventId);
        const gateError = await prescriptionGateError(db, eventId, settlement, "regenerate_prescriptions", session.user.email);
        if (gateError) return { error: gateError };
        const result = await upsertPrescriptionAmounts(eventId, settlement, event.name, db);
        await db.insert(auditLog).values({
            entityType: "event",
            entityId: eventId,
            action: "regenerate_prescriptions",
            changes: { created: { old: null, new: String(result.created) }, updated: { old: null, new: String(result.updated) } },
            metadata: { eventId },
            changedBy: session.user.email,
        });
        revalidatePath(`/dashboard/events/${eventId}`);
        return result;
    } catch (e) {
        console.error(e);
        return { error: "Chyba při přegenerování předpisů" };
    }
}
```

Nahraď za:

```ts
export async function regeneratePrescriptions(
    eventId: number,
): Promise<{ error: string } | { created: number; updated: number; proposed: number }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };
        const settlement = await getEventSettlement(eventId);
        const gateError = await prescriptionGateError(db, eventId, settlement, "regenerate_prescriptions", session.user.email);
        if (gateError) return { error: gateError };
        const result = await upsertPrescriptionAmounts(eventId, settlement, event.name, db);
        await db.insert(auditLog).values({
            entityType: "event",
            entityId: eventId,
            action: "regenerate_prescriptions",
            changes: {
                created: { old: null, new: String(result.created) },
                updated: { old: null, new: String(result.updated) },
                proposed: { old: null, new: String(result.proposed) },
            },
            metadata: { eventId },
            changedBy: session.user.email,
        });
        revalidatePath(`/dashboard/events/${eventId}`);
        return result;
    } catch (e) {
        console.error(e);
        return { error: "Chyba při přegenerování předpisů" };
    }
}
```

- [ ] **Step 4: Propagovat `proposed` přes `lockBilling`**

Najdi (`event-settlement.ts:659-691`):

```ts
export async function lockBilling(eventId: number): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };

        const settlement = await getEventSettlement(eventId);
        const gateError = await prescriptionGateError(db, eventId, settlement, "lock_billing", session.user.email);
        if (gateError) return { error: gateError };
        await upsertPrescriptionAmounts(eventId, settlement, event.name, db);

        await db.update(events)
            .set({ billingStatus: "prescribed", lockForParticipants: true, updatedAt: new Date() })
            .where(eq(events.id, eventId));

        await db.insert(auditLog).values({
            entityType: "event",
            entityId: eventId,
            action: "lock_billing",
            changes: { billingStatus: { old: "draft", new: "prescribed" } },
            metadata: { eventId },
            changedBy: session.user.email,
        });

        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při uzamčení vyúčtování" };
    }
}
```

Nahraď za:

```ts
export async function lockBilling(eventId: number): Promise<{ success: true; proposed: number } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };

        const settlement = await getEventSettlement(eventId);
        const gateError = await prescriptionGateError(db, eventId, settlement, "lock_billing", session.user.email);
        if (gateError) return { error: gateError };
        const result = await upsertPrescriptionAmounts(eventId, settlement, event.name, db);

        await db.update(events)
            .set({ billingStatus: "prescribed", lockForParticipants: true, updatedAt: new Date() })
            .where(eq(events.id, eventId));

        await db.insert(auditLog).values({
            entityType: "event",
            entityId: eventId,
            action: "lock_billing",
            changes: {
                billingStatus: { old: "draft", new: "prescribed" },
                ...(result.proposed > 0 ? { proposed: { old: null, new: String(result.proposed) } } : {}),
            },
            metadata: { eventId },
            changedBy: session.user.email,
        });

        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true, proposed: result.proposed };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při uzamčení vyúčtování" };
    }
}
```

- [ ] **Step 5: Ověřit typy a testy**

Run: `npx tsc --noEmit && npx vitest run`
Expected: bez chyb (typová chyba se objeví v `event-payments-tab.tsx`, protože `handleLock` zatím nepočítá s novým tvarem `{ success: true; proposed: number }` — to řeší Task 6; do té doby je typová chyba v `event-payments-tab.tsx` očekávaná/dočasná).

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/event-settlement.ts
git commit -m "feat(events): upsertPrescriptionAmounts rozhoduje mezi zápisem a návrhem"
```

---

## Task 5: Nové server actions `confirmProposedAmount` / `confirmProposedAmounts`

**Files:**
- Modify: `src/lib/actions/event-settlement.ts` (nové exporty, umísti za `setDepositWontPay`, tj. po řádku `~2177` z původního souboru — přesná pozice není kritická, jen za existující deposit-resolution akce)

**Interfaces:**
- Consumes: `PrescriptionInfo`/`eventPaymentPrescriptions.proposedAmount` (Task 3).
- Produces: `confirmProposedAmount(prescriptionId: number): Promise<{ success: true } | { error: string }>`, `confirmProposedAmounts(eventId: number, prescriptionIds?: number[]): Promise<{ success: true; confirmed: number } | { error: string }>` — volá je Task 6 (UI).

- [ ] **Step 1: Napsat `confirmProposedAmount`**

Přidej za `setDepositWontPay` (konec souboru je i vhodné místo, pokud je jistější orientační bod):

```ts
/**
 * Potvrdí návrh přepočtené částky jedné přihlášky — `amount = proposedAmount`, vyčistí
 * proposedAmount/proposedAt. Viz docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md.
 */
export async function confirmProposedAmount(prescriptionId: number): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();

        const [p] = await db
            .select({
                type: eventPaymentPrescriptions.type,
                eventId: eventPaymentPrescriptions.eventId,
                registrationId: eventPaymentPrescriptions.registrationId,
                amount: eventPaymentPrescriptions.amount,
                proposedAmount: eventPaymentPrescriptions.proposedAmount,
            })
            .from(eventPaymentPrescriptions)
            .where(eq(eventPaymentPrescriptions.id, prescriptionId));

        if (!p) return { error: "Předpis nenalezen" };
        if (p.type !== "settlement") return { error: "Návrh lze potvrdit jen u doplatku" };
        if (p.proposedAmount === null) return { error: "Žádný návrh k potvrzení" };

        await db.update(eventPaymentPrescriptions)
            .set({ amount: p.proposedAmount, proposedAmount: null, proposedAt: null, updatedAt: new Date() })
            .where(eq(eventPaymentPrescriptions.id, prescriptionId));

        await db.insert(auditLog).values({
            entityType: "event_registration",
            entityId: p.registrationId,
            action: "confirm_proposed_amount",
            changes: { amount: { old: p.amount, new: p.proposedAmount } },
            metadata: { eventId: p.eventId, registrationId: p.registrationId, prescriptionId },
            changedBy: session.user.email,
        });

        revalidatePath(`/dashboard/events/${p.eventId}`);
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Nepodařilo se potvrdit návrh" };
    }
}
```

- [ ] **Step 2: Napsat `confirmProposedAmounts` (hromadně / vybraná podmnožina)**

Přidej hned za `confirmProposedAmount`:

```ts
/**
 * Hromadně potvrdí návrhy přepočtu — bez `prescriptionIds` všechny nevyřízené návrhy
 * akce, s `prescriptionIds` jen vybranou podmnožinu (scénář "část lidí už zaplatila,
 * u nich změnu nechci, zbytek přepočítám").
 */
export async function confirmProposedAmounts(
    eventId: number,
    prescriptionIds?: number[],
): Promise<{ success: true; confirmed: number } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();

        const rows = await db
            .select({
                id: eventPaymentPrescriptions.id,
                registrationId: eventPaymentPrescriptions.registrationId,
                amount: eventPaymentPrescriptions.amount,
                proposedAmount: eventPaymentPrescriptions.proposedAmount,
            })
            .from(eventPaymentPrescriptions)
            .where(and(
                eq(eventPaymentPrescriptions.eventId, eventId),
                eq(eventPaymentPrescriptions.type, "settlement"),
                isNotNull(eventPaymentPrescriptions.proposedAmount),
                ...(prescriptionIds ? [inArray(eventPaymentPrescriptions.id, prescriptionIds)] : []),
            ));

        if (rows.length === 0) return { success: true, confirmed: 0 };

        await db.transaction(async tx => {
            for (const p of rows) {
                await tx.update(eventPaymentPrescriptions)
                    .set({ amount: p.proposedAmount!, proposedAmount: null, proposedAt: null, updatedAt: new Date() })
                    .where(eq(eventPaymentPrescriptions.id, p.id));

                await tx.insert(auditLog).values({
                    entityType: "event_registration",
                    entityId: p.registrationId,
                    action: "confirm_proposed_amount",
                    changes: { amount: { old: p.amount, new: p.proposedAmount } },
                    metadata: { eventId, registrationId: p.registrationId, prescriptionId: p.id },
                    changedBy: session.user.email,
                });
            }
        });

        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true, confirmed: rows.length };
    } catch (e) {
        console.error(e);
        return { error: "Nepodařilo se potvrdit návrhy" };
    }
}
```

- [ ] **Step 3: Ověřit typy**

Run: `npx tsc --noEmit`
Expected: bez chyb. (`isNotNull`, `inArray`, `and` už jsou v souboru importované — viz hlavička souboru.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/event-settlement.ts
git commit -m "feat(events): confirmProposedAmount/confirmProposedAmounts server actions"
```

---

## Task 6: UI — zobrazení a potvrzení návrhu v záložce Platby

**Files:**
- Modify: `src/app/(admin)/dashboard/events/[id]/event-payments-tab.tsx`

**Interfaces:**
- Consumes: `confirmProposedAmount`, `confirmProposedAmounts` (Task 5), `PrescriptionInfo.proposedAmount`/`proposedAt` (Task 3), `lockBilling` vracející `{ success: true; proposed: number }` (Task 4).

- [ ] **Step 1: Import nových actions**

V bloku importů z `@/lib/actions/event-settlement` (řádky 11-21) přidej `confirmProposedAmount, confirmProposedAmounts,` za `setDepositWontPay,`:

```ts
import {
    getEventSettlement,
    updateEventSubsidy,
    lockBilling,
    unlockBilling,
    sendEventSettlementEmails,
    sendSingleRegistrationEmail,
    getEventSettlementEmailLog,
    setDepositPromise,
    setDepositWontPay,
    confirmProposedAmount,
    confirmProposedAmounts,
} from "@/lib/actions/event-settlement";
```

- [ ] **Step 2: Helper pro autoritativní částku**

Za funkci `registrationForfeitTotal` (kolem řádku 53, před sekcí `// ── Stav platby přihlášky`) přidej:

```ts
/**
 * "K zaplacení" musí ukazovat skutečně platnou (potvrzenou) částku, ne živý přepočet —
 * jinak by nepotvrzený návrh (proposedAmount) tiše "vyhrál" v hlavním sloupci ještě
 * před potvrzením. Dokud settlementPrescription neexistuje (akce v přípravě, nikdy
 * nezamčeno), platná hodnota ještě neexistuje — použije se živý přepočet jako náhled.
 */
function authoritativeSettlementAmount(reg: SettlementRegistrationRow): number {
    return reg.settlementPrescription ? reg.settlementPrescription.amount : reg.settlementAmount;
}
```

- [ ] **Step 3: Zobrazit badge + tlačítko Potvrdit v `RegistrationRow`**

Uprav signaturu `RegistrationRow` (řádek 386) — přidej `onConfirmProposal`:

```ts
function RegistrationRow({ reg, hasPerReg, isPrescribed, treasurerApproved, onSendEmail, onDepositPromiseChange, onDepositWontPayChange, onConfirmProposal }: {
    reg: SettlementRegistrationRow; hasPerReg: boolean;
    isPrescribed: boolean; treasurerApproved: boolean;
    onSendEmail: (registrationId: number, name: string) => void;
    onDepositPromiseChange: (prescriptionId: number, promise: boolean, note: string) => void;
    onDepositWontPayChange: (prescriptionId: number, wontPay: boolean, note: string) => void;
    onConfirmProposal: (prescriptionId: number) => void;
}) {
```

Uvnitř `RegistrationRow`, hned pod `const forfeitTotal = registrationForfeitTotal(reg);` (řádek 398), přidej:

```ts
    const proposedAmount = reg.settlementPrescription?.proposedAmount ?? null;
    // Zvýrazněné varování pro matched/paid — přijetí návrhu tam znamená reálný doplatek
    // nebo vratku, ne jen úpravu čísla na papíře (viz zadání, sekce UI).
    const proposalOnPaidPrescription = proposedAmount !== null
        && (reg.settlementPrescription?.status === "matched" || reg.settlementPrescription?.status === "paid");
    const [confirming, startConfirm] = useTransition();
```

Najdi buňku „K zaplacení" (řádek 465):

```ts
                <td className="py-2 pr-3 text-right font-semibold text-gray-900 tabular-nums">{fmtCzk(reg.settlementAmount)}</td>
```

Nahraď za:

```ts
                <td className="py-2 pr-3 text-right font-semibold text-gray-900 tabular-nums" onClick={e => e.stopPropagation()}>
                    <div className="flex flex-col items-end gap-0.5">
                        <span>{fmtCzk(authoritativeSettlementAmount(reg))}</span>
                        {proposedAmount !== null && reg.settlementPrescription && (
                            <div className="flex flex-col items-end gap-0.5">
                                <div className="flex items-center gap-1.5">
                                    <Badge className={proposalOnPaidPrescription
                                        ? "bg-red-100 text-red-700 border-0 text-[10px]"
                                        : "bg-amber-100 text-amber-700 border-0 text-[10px]"}>
                                        Návrh: {fmtCzk(proposedAmount)}
                                    </Badge>
                                    <button
                                        onClick={() => { const id = reg.settlementPrescription!.id; startConfirm(async () => onConfirmProposal(id)); }}
                                        disabled={confirming}
                                        className="text-[10px] text-emerald-600 hover:text-emerald-700 font-medium whitespace-nowrap">
                                        {confirming ? "…" : "potvrdit"}
                                    </button>
                                </div>
                                {proposalOnPaidPrescription && (
                                    <p className="text-[9px] text-red-600 max-w-[140px] text-right leading-tight">
                                        Už {reg.settlementPrescription.status === "paid" ? "zaplaceno" : "spárováno"} — přijetí znamená doplatek/vratku
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </td>
```

- [ ] **Step 4: Provlíknout `onConfirmProposal` přes `RegistrationSummaryTable`**

Uprav signaturu `RegistrationSummaryTable` (řádek 493):

```ts
function RegistrationSummaryTable({ rows, unitPrice, hasPerReg, isPrescribed, treasurerApproved, onSendEmail, onDepositPromiseChange, onDepositWontPayChange, onConfirmProposal }: {
    rows: SettlementRegistrationRow[]; unitPrice: number; hasPerReg: boolean;
    isPrescribed: boolean; treasurerApproved: boolean;
    onSendEmail: (registrationId: number, name: string) => void;
    onDepositPromiseChange: (prescriptionId: number, promise: boolean, note: string) => void;
    onDepositWontPayChange: (prescriptionId: number, wontPay: boolean, note: string) => void;
    onConfirmProposal: (prescriptionId: number) => void;
}) {
```

V `<tbody>` (řádek 519-523) doplň prop:

```ts
                    {rows.map(reg => (
                        <RegistrationRow key={reg.registrationId} reg={reg} hasPerReg={hasPerReg}
                            isPrescribed={isPrescribed} treasurerApproved={treasurerApproved}
                            onSendEmail={onSendEmail} onDepositPromiseChange={onDepositPromiseChange} onDepositWontPayChange={onDepositWontPayChange}
                            onConfirmProposal={onConfirmProposal} />
                    ))}
```

V `<tfoot>` uprav součet „K zaplacení" (řádek 533), ať sčítá autoritativní částku místo živého přepočtu:

```ts
                        <td className="pt-2 pr-3 text-right text-sm font-bold text-gray-900 tabular-nums">{fmtCzk(rows.reduce((s, r) => s + authoritativeSettlementAmount(r), 0))}</td>
```

- [ ] **Step 5: Banner + hromadné potvrzení v `EventPaymentsTab`**

V hlavní komponentě `EventPaymentsTab`, za `function silentReload() {...}` (řádek 574) přidej handler:

```ts
    const [confirmingBulk, startConfirmBulk] = useTransition();

    function handleConfirmProposal(prescriptionId: number) {
        confirmProposedAmount(prescriptionId).then(res => {
            if ("error" in res) setSendFeedback(`Chyba: ${res.error}`);
            else silentReload();
        });
    }

    function handleConfirmAllProposals() {
        startConfirmBulk(async () => {
            const res = await confirmProposedAmounts(eventId);
            if ("error" in res) { setSendFeedback(`Chyba: ${res.error}`); return; }
            setSendFeedback(res.confirmed > 0 ? `Potvrzeno ${res.confirmed} návrhů.` : "Žádné návrhy k potvrzení.");
            silentReload();
        });
    }
```

Uprav `handleLock` (řádek 588-598) — přidej zpětnou vazbu o počtu návrhů:

```ts
    function handleLock() {
        setLockError(null);
        startLock(async () => {
            const res = await lockBilling(eventId);
            if ("error" in res) { setLockError(res.error); return; }
            setBillingStatus("prescribed");
            onBillingStatusChange("prescribed");
            load();
            if (res.proposed > 0) setSendFeedback(`Vygenerováno. ${res.proposed} přihlášek má navržený přepočet ke schválení.`);
            setBatchModalOpen(true);
        });
    }
```

Za blok „Přehled plateb" (`</div>` na řádku 812, hned před ním, tj. uvnitř `<div className="rounded-xl border border-gray-200 bg-white px-4 py-3">` po `<h3>...</h3>` na řádku 797) přidej banner — nejsnazší umístění je hned pod `<h3>` blok, před podmínku `{!hasRegistrations ? (`:

```ts
                {(() => {
                    const pending = settlement.registrations.filter(r => r.settlementPrescription?.proposedAmount != null);
                    if (pending.length === 0) return null;
                    return (
                        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <p className="text-xs text-amber-800">
                                <span className="font-medium">{pending.length}</span> {pending.length === 1 ? "přihláška má" : "přihlášek má"} navržený přepočet.
                            </p>
                            <Button size="sm" variant="outline" onClick={handleConfirmAllProposals} disabled={confirmingBulk}
                                className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100">
                                {confirmingBulk ? <><Loader2 size={12} className="animate-spin mr-1" />Potvrzuji…</> : "Potvrdit vše"}
                            </Button>
                        </div>
                    );
                })()}
```

Doplň `onConfirmProposal={handleConfirmProposal}` do volání `<RegistrationSummaryTable ... />` (řádek 801-810).

- [ ] **Step 6: Ověřit typy a stávající testy**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: bez chyb, 44 testů PASS (39 původních + 5 z Task 2).

- [ ] **Step 7: Manuální ověření na staging preview**

Lokálně chybí `DATABASE_URL` proti reálným datům (per CLAUDE.md — pro reálné ověření použij staging, ne localhost). Po pushnutí větve a otevření PR do `staging`:

1. Otevři akci s alespoň jednou vygenerovanou (zamčenou) přihláškou na staging preview.
2. Klikni „Odemknout a upravit", uprav libovolný náklad/koeficient tak, aby se změnila výsledná částka alespoň jedné přihlášky.
3. Klikni „Vygenerovat předpisy →" — ověř, že se objeví hláška „N přihlášek má navržený přepočet…" a amber banner nad tabulkou.
4. Ověř, že sloupec „K zaplacení" u dotčené přihlášky pořád ukazuje **starou** částku (ne novou) a pod ní badge „Návrh: {nová částka}" + odkaz „potvrdit".
5. Klikni „potvrdit" u jedné přihlášky — ověř, že se badge zmizí a „K zaplacení" se přepne na novou částku.
6. Pokud je návrhů víc, klikni „Potvrdit vše" — ověř, že zmizí i banner.
7. Zopakuj scénář na přihlášce, jejíž settlement předpis je `matched`/`paid` (typicky ta, co má spárovanou platbu) — ověř, že badge je **červený**, ne amber, a je pod ním text „Už zaplaceno/spárováno — přijetí znamená doplatek/vratku".
8. Zkontroluj `audit_log` (přes Neon MCP nebo Drizzle Studio) — měl by obsahovat `action = 'confirm_proposed_amount'` s `entityType = 'event_registration'` a správným `old`/`new` v `changes.amount`.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(admin\)/dashboard/events/\[id\]/event-payments-tab.tsx
git commit -m "feat(events): zobrazit a potvrzovat návrh přepočtu v záložce Platby"
```

---

## Self-Review (proběhlo při psaní plánu)

**Spec coverage:**
- Krok 1 (nikdy tichá změna, první generování přímé) → Task 4 Step 2. ✅
- Krok 2 (rozsah jen settlement) → Task 1, 3, 4, 5 (všude `type = 'settlement'`/settlementPrescription). ✅
- Krok 3 (žádné TTL, přegenerování přepisuje starý návrh) → `decideProposalAction` vždy vrací čerstvé `set_proposal` bez ohledu na `hasPendingProposal` (Task 2). ✅
- Krok 4 (žádné zamítnutí, KISS) → žádná `reject` akce nikde v plánu. ✅
- Živý náhled nezapisuje → `getEventSettlement` beze změny, zápis jen v `upsertPrescriptionAmounts` (Task 4). ✅
- Potvrzení jednotlivě/hromadně/podmnožina → `confirmProposedAmount` + `confirmProposedAmounts(eventId, prescriptionIds?)` (Task 5). ✅
- UI viditelnost rozdílu → badge v Task 6 Step 3; matched/paid teď prochází stejnou `decideProposalAction` logikou jako pending (Task 4 Step 2 odstranilo starý `continue` guard).
- **Zvýrazněné varování konkrétně pro matched/paid** (zadání, sekce UI: „přijetí tam znamená reálný doplatek nebo vratku") → původně jsem měl v Task 6 Step 3 jen jednotný amber badge bez rozlišení závažnosti — chybělo. Opraveno: `proposalOnPaidPrescription` rozlišuje červený badge + doplňkový text „Už zaplaceno/spárováno — přijetí znamená doplatek/vratku" pro `status IN ('matched','paid')`, amber beze změny pro `pending`. ✅

**Placeholder scan:** žádné TBD/TODO, všechny kódové bloky kompletní, žádné „similar to Task N".

**Type consistency:** `ProposalAction`/`decideProposalAction` signatura shodná mezi Task 2 (definice+testy) a Task 4 (použití). `PrescriptionInfo.proposedAmount`/`proposedAt` shodné mezi Task 3 (definice) a Task 4/6 (čtení). `upsertPrescriptionAmounts`/`lockBilling`/`regeneratePrescriptions` návratové typy shodné mezi Task 4 (definice) a Task 6 (čtení `res.proposed`). `confirmProposedAmount`/`confirmProposedAmounts` signatury shodné mezi Task 5 a Task 6.

**Doplněno při review:**
1. Task 6 Step 2+3 (`authoritativeSettlementAmount`) — bez něj by "K zaplacení" ukazoval živý přepočet i před potvrzením, což by mechanismus fakticky obešlo. Nebylo explicitně v zadání vypsané jako task, ale je to nutný důsledek principu "amount se nemění, dokud se nepotvrdí".
2. Task 6 Step 3 (`proposalOnPaidPrescription`) — zadání explicitně žádá zvýrazněné varování pro matched/paid, první verze plánu měla jen jednotný badge. Opraveno inline, viz „Spec coverage" výše.
