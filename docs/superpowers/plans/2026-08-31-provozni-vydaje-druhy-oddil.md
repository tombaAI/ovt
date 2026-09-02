# Provozní výdaje — druhý oddíl (TOM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozšířit existující funkci "provozní výdaje mimo akci" o druhý oddíl (TOM, kód 234, hospodářka Alžběta Poupětová) — vlastní hospodář, vlastní kód oddílu na PDF/mailu, vlastní příjemce mailu na TJ — beze změny výsledovky a bez dopadu na členy/příspěvky/běžné akce (ty zůstávají jen OVT).

**Architecture:** Žádná nová tabulka. Nový sloupec `events.oddil` (`'ovt' | 'tom'`, default `'ovt'`) rozlišuje, kterému oddílu provozní výdaj patří. Gate hospodáře se rozšiřuje ze "je jediný globální hospodář" na "je hospodář TOHOTO oddílu" (`isTreasurerOfOddil`) — a protože `isTreasurerOfOddil(email, 'ovt')` je matematicky identické s dnešním `isTreasurer(email)`, u běžných akcí (vždy `oddil = 'ovt'`) se chování nemění vůbec. Vstup do sekce Provoz řídí nová `isAnyOddilTreasurer` (kterýkoli ze dvou hospodářů).

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, shadcn/ui (Tabs), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-provozni-vydaje-vice-oddilu.md` (status `navrh`, uživatelem odsouhlaseno).

## Global Constraints

- Větev: `feat/2026-08-31-provozni-vydaje-druhy-oddil` ze `staging` (založena, potvrzeno uživatelem). Commit + push po každém tasku. Nikdy nepushovat přímo na `staging` — na konci PR `feature → staging`.
- Pre-commit hook spouští `npm run lint && npx tsc --noEmit && npm run test:unit` — každý commit musí projít.
- Env proměnné `TREASURER_EMAIL_TOM` a `EMAIL_HOSPODAR_ODDILU_TOM` jsou **již nastavené uživatelem** ve Vercel (staging i produkce) — kód na ně může spoléhat, nic dalšího není třeba konfigurovat mimo CI (task 9).
- Server actions: návratový tvar `{ error: string } | { success: true }` (resp. `{ id }`), `getDb()` singleton, `await auth()` pro e-mail, `revalidatePath()` po mutaci.
- Migrace: nový soubor v `supabase/migrations/` commitnutý spolu se změnou `src/db/schema.ts`; aplikuje ji GHA (staging i produkce), nikdy ručně.
- **Zjištění nad rámec spec dokumentu, ale nutné pro funkčnost** (bez nich by hospodářka TOM nemohla spravovat vlastní doklady): tři API routy pro doklady (`acknowledge-mismatch`, `reanalyze`, `attach-file`) dnes volají globální `isTreasurer()` bez ohledu na to, kterému oddílu doklad patří — task 5 je opravuje na `isTreasurerOfOddil`. Stejně tak `send-invoice-payment` posílal pokyn k úhradě vždy na centrální `EMAIL_HOSPODAR_ODDILU_TJB` — task 8 ho přepíná na příjemce podle oddílu.

---

### Task 1: Datový model — schéma, migrace, config oddílů

**Files:**
- Modify: `src/db/schema.ts:378` (za `eventSourceEnum`), `src/db/schema.ts:396` (sloupec v `events`)
- Create: `supabase/migrations/20260831_120000_events_oddil.sql`
- Create: `src/lib/oddily-config.ts`
- Modify: `docs/superpowers/specs/INDEX.md`

**Interfaces:**
- Produces: `oddilEnum = ["ovt", "tom"] as const`, `export type Oddil = typeof oddilEnum[number];` v `src/db/schema.ts`; `events.oddil` sloupec. `ODDIL_LABELS`, `ODDIL_NAZEV`, `ODDIL_KOD: Record<Oddil, string>`, `ODDIL_VALUES: Oddil[]`, `getOddilNazevPlny(oddil: Oddil): string`, `getOddilTjRecipientEmail(oddil: Oddil): string | null` v `src/lib/oddily-config.ts`.

- [ ] **Step 1: Enum a sloupec ve schématu**

V `src/db/schema.ts` za řádek 388 (`export type EventSource = typeof eventSourceEnum[number];`) přidat:

```ts
export const oddilEnum = ["ovt", "tom"] as const;
export type Oddil = typeof oddilEnum[number];
```

V definici tabulky `events` (řádek 396, hned za `eventType`) přidat:

```ts
        eventType: text("event_type", { enum: eventTypeEnum }).notNull().default("other"),
        oddil: text("oddil", { enum: oddilEnum }).notNull().default("ovt"),
```

- [ ] **Step 2: Migrace**

`supabase/migrations/20260831_120000_events_oddil.sql`:

```sql
-- Druhý oddíl (TOM) u provozních výdajů — spec 2026-08-31-provozni-vydaje-vice-oddilu.md
BEGIN;

ALTER TABLE app.events ADD COLUMN oddil text NOT NULL DEFAULT 'ovt';
ALTER TABLE app.events ADD CONSTRAINT events_oddil_check CHECK (oddil IN ('ovt', 'tom'));

COMMIT;
```

- [ ] **Step 3: Config modul**

`src/lib/oddily-config.ts`:

```ts
import type { Oddil } from "@/db/schema";

export const ODDIL_LABELS: Record<Oddil, string> = {
    ovt: "OVT",
    tom: "TOM",
};

export const ODDIL_NAZEV: Record<Oddil, string> = {
    ovt: "Oddíl vodní turistiky",
    tom: "Turistický oddíl mládeže",
};

export const ODDIL_KOD: Record<Oddil, string> = {
    ovt: "207",
    tom: "234",
};

export const ODDIL_VALUES = Object.keys(ODDIL_LABELS) as Oddil[];

/** Text tištěný jako "oddíl" na PDF vyúčtování a v mailu na TJ, např. "207 Oddíl vodní turistiky". */
export function getOddilNazevPlny(oddil: Oddil): string {
    return `${ODDIL_KOD[oddil]} ${ODDIL_NAZEV[oddil]}`;
}

const ODDIL_TJ_RECIPIENT_ENV: Record<Oddil, string> = {
    ovt: "EMAIL_HOSPODAR_ODDILU_TJB",
    tom: "EMAIL_HOSPODAR_ODDILU_TOM",
};

/** Příjemce mailu s vyúčtováním/pokynem k úhradě na TJ, podle oddílu. */
export function getOddilTjRecipientEmail(oddil: Oddil): string | null {
    return process.env[ODDIL_TJ_RECIPIENT_ENV[oddil]]?.trim() || null;
}
```

- [ ] **Step 4: Registrace v INDEX.md**

V `docs/superpowers/specs/INDEX.md` do tabulky „Aktivní zadání" (za řádek s `2026-08-05-provozni-vydaje.md`) přidat:

```
| [2026-08-31-provozni-vydaje-vice-oddilu.md](2026-08-31-provozni-vydaje-vice-oddilu.md) | Provozní výdaje pro druhý oddíl (TOM) — vlastní hospodář, kód oddílu, příjemce mailu na TJ | `navrh` — realizace na `feat/2026-08-31-provozni-vydaje-druhy-oddil` |
```

- [ ] **Step 5: Ověřit**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS (nový sloupec je `NOT NULL DEFAULT`, žádný existující insert/select se nerozbije).

- [ ] **Step 6: Commit + push**

```bash
git add src/db/schema.ts supabase/migrations/20260831_120000_events_oddil.sql src/lib/oddily-config.ts docs/superpowers/specs/INDEX.md
git commit -m "feat(provoz): sloupec events.oddil + config oddílů (OVT/TOM)"
git push -u origin feat/2026-08-31-provozni-vydaje-druhy-oddil
```

---

### Task 2: `isTreasurerOfOddil` / `isAnyOddilTreasurer`

**Files:**
- Modify: `src/lib/treasurer.ts`
- Test: `src/lib/treasurer.test.ts`

**Interfaces:**
- Consumes: `Oddil` (Task 1, `@/db/schema`), `ODDIL_VALUES` (Task 1, `@/lib/oddily-config`).
- Produces (pro Tasky 3–6): `isTreasurer(email)` — beze změny (= hospodář OVT). `isTreasurerOfOddil(email: string | null | undefined, oddil: Oddil): boolean`. `isAnyOddilTreasurer(email: string | null | undefined): boolean`.

- [ ] **Step 1: Napsat failing test**

`src/lib/treasurer.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAnyOddilTreasurer, isTreasurer, isTreasurerOfOddil } from "./treasurer";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("isTreasurer", () => {
    it("shoduje se case-insensitive s TREASURER_EMAIL", () => {
        vi.stubEnv("TREASURER_EMAIL", "hospodar@ovt.cz");
        expect(isTreasurer("Hospodar@OVT.cz")).toBe(true);
        expect(isTreasurer("jiny@ovt.cz")).toBe(false);
    });

    it("bez nastaveného env vrací vždy false", () => {
        vi.stubEnv("TREASURER_EMAIL", "");
        expect(isTreasurer("cokoli@ovt.cz")).toBe(false);
    });
});

describe("isTreasurerOfOddil", () => {
    it("ovt čte TREASURER_EMAIL, tom čte TREASURER_EMAIL_TOM — nezávisle", () => {
        vi.stubEnv("TREASURER_EMAIL", "hospodar-ovt@test.local");
        vi.stubEnv("TREASURER_EMAIL_TOM", "hospodarka-tom@test.local");

        expect(isTreasurerOfOddil("hospodar-ovt@test.local", "ovt")).toBe(true);
        expect(isTreasurerOfOddil("hospodar-ovt@test.local", "tom")).toBe(false);
        expect(isTreasurerOfOddil("hospodarka-tom@test.local", "tom")).toBe(true);
        expect(isTreasurerOfOddil("hospodarka-tom@test.local", "ovt")).toBe(false);
    });

    it("isTreasurerOfOddil(email, 'ovt') je identické s isTreasurer(email)", () => {
        vi.stubEnv("TREASURER_EMAIL", "hospodar-ovt@test.local");
        expect(isTreasurerOfOddil("hospodar-ovt@test.local", "ovt")).toBe(isTreasurer("hospodar-ovt@test.local"));
    });
});

describe("isAnyOddilTreasurer", () => {
    it("vrátí true pro hospodáře kteréhokoli ze dvou oddílů", () => {
        vi.stubEnv("TREASURER_EMAIL", "hospodar-ovt@test.local");
        vi.stubEnv("TREASURER_EMAIL_TOM", "hospodarka-tom@test.local");

        expect(isAnyOddilTreasurer("hospodar-ovt@test.local")).toBe(true);
        expect(isAnyOddilTreasurer("hospodarka-tom@test.local")).toBe(true);
        expect(isAnyOddilTreasurer("nekdo-jiny@test.local")).toBe(false);
        expect(isAnyOddilTreasurer(null)).toBe(false);
    });
});
```

- [ ] **Step 2: Ověřit, že padá**

Run: `npm run test:unit`
Expected: FAIL — `isTreasurerOfOddil`/`isAnyOddilTreasurer` nejsou exportované.

- [ ] **Step 3: Implementace**

`src/lib/treasurer.ts` — nahradit celý obsah:

```ts
import type { Oddil } from "@/db/schema";
import { ODDIL_VALUES } from "@/lib/oddily-config";

/**
 * Hospodář (`TREASURER_EMAIL`) — jediná role s právem potvrdit citlivé operace u akcí,
 * které už vybírají peníze / mají zamčené předpisy (např. neshodu částky při výměně dokladu,
 * úpravu už vybíraných přihlášek). Mimo zamčený stav neshodu řeší kterýkoli admin.
 * Týká se výhradně OVT — běžné akce dělá v appce jen OVT (`event.oddil` je u nich vždy 'ovt').
 */
export function isTreasurer(email: string | null | undefined): boolean {
    const treasurerEmail = process.env.TREASURER_EMAIL?.trim().toLowerCase();
    return !!treasurerEmail && !!email && email.toLowerCase() === treasurerEmail;
}

const ODDIL_TREASURER_ENV: Record<Oddil, string> = {
    ovt: "TREASURER_EMAIL",
    tom: "TREASURER_EMAIL_TOM",
};

/**
 * Hospodář KONKRÉTNÍHO oddílu (provozní výdaje — spec 2026-08-31-provozni-vydaje-vice-oddilu.md).
 * `isTreasurerOfOddil(email, 'ovt')` je záměrně identické s `isTreasurer(email)` — čte stejný env.
 */
export function isTreasurerOfOddil(email: string | null | undefined, oddil: Oddil): boolean {
    const treasurerEmail = process.env[ODDIL_TREASURER_ENV[oddil]]?.trim().toLowerCase();
    return !!treasurerEmail && !!email && email.toLowerCase() === treasurerEmail;
}

/** Je hospodářem alespoň jednoho oddílu — gate na vstup do sekce Provoz a detail provozního výdaje. */
export function isAnyOddilTreasurer(email: string | null | undefined): boolean {
    return ODDIL_VALUES.some(oddil => isTreasurerOfOddil(email, oddil));
}
```

- [ ] **Step 4: Ověřit zelenou**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/treasurer.ts src/lib/treasurer.test.ts
git commit -m "feat(provoz): isTreasurerOfOddil/isAnyOddilTreasurer — hospodář per oddíl"
git push
```

---

### Task 3: `actions/events.ts` — oddíl v typech a server akcích

**Files:**
- Modify: `src/lib/actions/events.ts` (importy ř. 1-11, `EventRow` ř. 15-44, `getEvents` ř. 64-112, `getEventById` ř. 142-191, `ProvozniVydajRow`/`getProvozniVydaje` ř. 207-246, `ProvozniVydajFormData`/`createProvozniVydaj` ř. 279-310)

**Interfaces:**
- Consumes: `Oddil` (Task 1), `isAnyOddilTreasurer` (Task 2).
- Produces: `EventRow.oddil: Oddil`; `ProvozniVydajRow.oddil: Oddil`; `ProvozniVydajFormData.oddil: Oddil`; `getProvozniVydaje()` vrací záznamy OBOU oddílů (gate rozšířen na `isAnyOddilTreasurer`); `createProvozniVydaj(data)` ukládá `oddil` a je gatováno `isAnyOddilTreasurer`.

- [ ] **Step 1: Import a re-export typu Oddil**

Řádek 8-11, nahradit:

```ts
import { isTreasurer } from "@/lib/treasurer";
import type { EventType, EventStatus, EventSource } from "@/db/schema";

export type { EventType, EventStatus, EventSource };
```

za:

```ts
import { isTreasurer, isAnyOddilTreasurer } from "@/lib/treasurer";
import type { EventType, EventStatus, EventSource, Oddil } from "@/db/schema";

export type { EventType, EventStatus, EventSource, Oddil };
```

- [ ] **Step 2: `EventRow` — přidat pole `oddil`**

V `EventRow` (řádek 19, hned za `eventType: EventType;`) přidat:

```ts
    eventType: EventType;
    oddil: Oddil;
```

- [ ] **Step 3: `getEvents` — doplnit select**

V `getEvents` (řádek 72, hned za `eventType: events.eventType,`) přidat do objektu selectu:

```ts
            eventType: events.eventType,
            oddil: events.oddil,
```

(Filtr `ne(events.eventType, "provozni")` beze změny — u vrácených běžných akcí bude `oddil` vždy `'ovt'`.)

- [ ] **Step 4: `getEventById` — doplnit select**

V `getEventById` (řádek 149, hned za `eventType: events.eventType,`) stejně přidat:

```ts
            eventType: events.eventType,
            oddil: events.oddil,
```

- [ ] **Step 5: `ProvozniVydajRow`/`getProvozniVydaje` — oddíl v seznamu**

Řádky 207-246, nahradit celý blok:

```ts
export type ProvozniVydajRow = {
    id: number;
    name: string;
    dateFrom: string | null;
    leaderName: string | null;
    billingStatus: "draft" | "prescribed";
    expenseCount: number;
    expenseSum: number;
    sentToTj: boolean;
    oddil: Oddil;
};

export async function getProvozniVydaje(): Promise<ProvozniVydajRow[]> {
    const session = await auth();
    if (!isAnyOddilTreasurer(session?.user?.email)) return [];

    const db = getDb();
    const rows = await db
        .select({
            id: events.id,
            name: events.name,
            dateFrom: events.dateFrom,
            leaderName: members.fullName,
            billingStatus: events.billingStatus,
            expenseCount: sql<number>`(select count(*) from ${eventExpenses} where ${eventExpenses.eventId} = ${events.id})`,
            expenseSum: sql<number>`coalesce((select sum(${eventExpenses.amount}) from ${eventExpenses} where ${eventExpenses.eventId} = ${events.id}), 0)`,
            sentToTj: sql<boolean>`exists (select 1 from ${eventVyuctovaniSends} where ${eventVyuctovaniSends.eventId} = ${events.id})`,
            oddil: events.oddil,
        })
        .from(events)
        .leftJoin(members, eq(events.leaderId, members.id))
        .where(eq(events.eventType, "provozni"))
        .orderBy(desc(events.createdAt));

    return rows.map(r => ({
        ...r,
        billingStatus: r.billingStatus as "draft" | "prescribed",
        dateFrom: r.dateFrom as unknown as string | null,
        expenseCount: Number(r.expenseCount),
        expenseSum: Number(r.expenseSum),
        oddil: r.oddil as Oddil,
    }));
}
```

(Gate rozšířen z `isTreasurer` na `isAnyOddilTreasurer` — kterýkoli ze dvou hospodářů vidí OBĚ agendy, filtrování na jednu záložku dělá klient v Tasku 7.)

- [ ] **Step 6: `ProvozniVydajFormData`/`createProvozniVydaj` — oddíl při založení**

Řádky 279-310, nahradit:

```ts
export type ProvozniVydajFormData = {
    name: string;
    dateFrom: string | null;
    leaderId: number | null;
    description: string | null;
    oddil: Oddil;
};

export async function createProvozniVydaj(
    data: ProvozniVydajFormData,
): Promise<{ id: number } | { error: string }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };
    if (!isAnyOddilTreasurer(session.user.email)) return { error: "Provozní výdaje jsou jen pro hospodáře." };
    if (!data.name.trim()) return { error: "Název je povinný." };

    const db = getDb();
    const [row] = await db
        .insert(events)
        .values({
            year: new Date().getFullYear(),
            name: data.name.trim(),
            eventType: "provozni",
            oddil: data.oddil,
            dateFrom: data.dateFrom ?? undefined,
            leaderId: data.leaderId ?? undefined,
            description: data.description ?? undefined,
            createdBy: session.user.email,
        })
        .returning({ id: events.id });

    revalidatePath("/dashboard/provoz");
    return { id: row.id };
}
```

- [ ] **Step 7: Ověřit**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/events.ts
git commit -m "feat(provoz): oddíl v EventRow, getProvozniVydaje a createProvozniVydaj"
git push
```

---

### Task 4: `lockBilling`/`unlockBilling` — gate podle oddílu

**Files:**
- Modify: `src/lib/actions/event-settlement.ts` (`lockBilling` ř. 660-722, `unlockBilling` ř. 730-762; import ř. 23)

**Interfaces:**
- Consumes: `isTreasurerOfOddil` (Task 2), `Oddil` (Task 1), `ODDIL_LABELS` (Task 1, `@/lib/oddily-config`).
- Produces: `lockBilling`/`unlockBilling` beze změny signatury; u `eventType === 'provozni'` gate kontroluje hospodáře KONKRÉTNÍHO oddílu dané akce, ne globálního.

- [ ] **Step 1: Import**

Řádek 23, nahradit:

```ts
import { isTreasurer } from "@/lib/treasurer";
```

za:

```ts
import { isTreasurer, isTreasurerOfOddil } from "@/lib/treasurer";
import { ODDIL_LABELS } from "@/lib/oddily-config";
```

- [ ] **Step 2: `lockBilling` — select `oddil` a department-aware gate**

Řádky 665-675, nahradit:

```ts
        const [event] = await db
            .select({ name: events.name, eventType: events.eventType, treasurerApproved: events.treasurerApproved })
            .from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };

        const isProvozni = event.eventType === "provozni";
        if (isProvozni && !isTreasurer(session.user.email)) {
            const reason = "Provozní výdaj může uzamknout jen hospodář.";
            await logBlockedAttempt(db, { attemptedAction: "lock_billing", reason, changedBy: session.user.email, eventId });
            return { error: reason };
        }
```

za:

```ts
        const [event] = await db
            .select({ name: events.name, eventType: events.eventType, treasurerApproved: events.treasurerApproved, oddil: events.oddil })
            .from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };

        const isProvozni = event.eventType === "provozni";
        if (isProvozni && !isTreasurerOfOddil(session.user.email, event.oddil)) {
            const reason = `Provozní výdaj oddílu ${ODDIL_LABELS[event.oddil]} může uzamknout jen jeho hospodář.`;
            await logBlockedAttempt(db, { attemptedAction: "lock_billing", reason, changedBy: session.user.email, eventId });
            return { error: reason };
        }
```

- [ ] **Step 3: `unlockBilling` — select `oddil` a department-aware gate**

Řádky 739-746, nahradit:

```ts
        const [ev] = await db.select({ eventType: events.eventType }).from(events).where(eq(events.id, eventId));
        if (!ev) return { error: "Akce nenalezena" };
        const isProvozni = ev.eventType === "provozni";
        if (isProvozni && !isTreasurer(session.user.email)) {
            const reason = "Provozní výdaj může odemknout jen hospodář.";
            await logBlockedAttempt(db, { attemptedAction: "unlock_billing", reason, changedBy: session.user.email, eventId });
            return { error: reason };
        }
```

za:

```ts
        const [ev] = await db.select({ eventType: events.eventType, oddil: events.oddil }).from(events).where(eq(events.id, eventId));
        if (!ev) return { error: "Akce nenalezena" };
        const isProvozni = ev.eventType === "provozni";
        if (isProvozni && !isTreasurerOfOddil(session.user.email, ev.oddil)) {
            const reason = `Provozní výdaj oddílu ${ODDIL_LABELS[ev.oddil]} může odemknout jen jeho hospodář.`;
            await logBlockedAttempt(db, { attemptedAction: "unlock_billing", reason, changedBy: session.user.email, eventId });
            return { error: reason };
        }
```

Poznámka: řádek 753-758 (`unlockBilling` gate "akce už vybírá peníze", `process.env.TREASURER_EMAIL` napřímo) se týká jen skutečně vybírajících **běžných** akcí — u nich je `oddil` vždy `'ovt'`, takže zůstává funkčně beze změny. Neupravovat (mimo rozsah tohoto tasku, `isTreasurer` tam zůstává použitelné beze změny významu).

- [ ] **Step 4: Ověřit**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/event-settlement.ts
git commit -m "feat(provoz): lockBilling/unlockBilling — gate podle oddílu, ne globální hospodář"
git push
```

---

### Task 5: Doklady (mismatch/reanalyze/attach-file) — gate podle oddílu

**Files:**
- Modify: `src/app/api/events/[id]/expenses/[expenseId]/acknowledge-mismatch/route.ts`
- Modify: `src/app/api/events/[id]/expenses/[expenseId]/reanalyze/route.ts`
- Modify: `src/app/api/events/[id]/expenses/[expenseId]/attach-file/route.ts`

**Interfaces:**
- Consumes: `isTreasurerOfOddil` (Task 2).
- Produces: všechny tři routy počítají "je hospodář" podle `oddil` KONKRÉTNÍ akce (`eventId` z URL), ne podle globálního `TREASURER_EMAIL` — jinak by hospodářka TOM nemohla nikdy potvrdit neshodu ani přeanalyzovat/vyměnit doklad u vlastních (TOM) provozních výdajů.

- [ ] **Step 1: `acknowledge-mismatch/route.ts` — přesunout gate za načtení akce**

Nahradit import (řádek 6):

```ts
import { isTreasurer } from "@/lib/treasurer";
```

za:

```ts
import { isTreasurerOfOddil } from "@/lib/treasurer";
```

Odstranit časný gate (řádky 32-34):

```ts
        if (!isTreasurer(session.user.email)) {
            return NextResponse.json({ error: "Neshodu smí potvrdit jen hospodář" }, { status: 403 });
        }
```

Rozšířit select akce (řádky 45-49) o `oddil` a hned za něj vložit gate:

```ts
        const [eventRow] = await db
            .select({ lockForReimbursement: events.lockForReimbursement, oddil: events.oddil })
            .from(events)
            .where(eq(events.id, eventId));
        if (!eventRow) return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        if (!isTreasurerOfOddil(session.user.email, eventRow.oddil)) {
            return NextResponse.json({ error: "Neshodu smí potvrdit jen hospodář" }, { status: 403 });
        }
```

- [ ] **Step 2: `reanalyze/route.ts` — select `oddil` a department-aware gate**

Nahradit import (řádek 8):

```ts
import { isTreasurer } from "@/lib/treasurer";
```

za:

```ts
import { isTreasurerOfOddil } from "@/lib/treasurer";
```

Rozšířit select (řádky 42-48):

```ts
        const [eventRow] = await db
            .select({
                lockForParticipants: events.lockForParticipants,
                lockForReimbursement: events.lockForReimbursement,
                oddil: events.oddil,
            })
            .from(events)
            .where(eq(events.id, eventId));
```

Řádek 90, nahradit:

```ts
                isTreasurer: isTreasurer(session.user.email),
```

za:

```ts
                isTreasurer: isTreasurerOfOddil(session.user.email, eventRow.oddil),
```

- [ ] **Step 3: `attach-file/route.ts` — select `oddil` a department-aware gate**

Nahradit import (řádek 8):

```ts
import { isTreasurer } from "@/lib/treasurer";
```

za:

```ts
import { isTreasurerOfOddil } from "@/lib/treasurer";
```

Rozšířit select (řádky 45-51):

```ts
        const [eventRow] = await db
            .select({
                lockForParticipants: events.lockForParticipants,
                lockForReimbursement: events.lockForReimbursement,
                oddil: events.oddil,
            })
            .from(events)
            .where(eq(events.id, eventId));
```

Řádek 100, nahradit:

```ts
                isTreasurer: isTreasurer(session.user.email),
```

za:

```ts
                isTreasurer: isTreasurerOfOddil(session.user.email, eventRow.oddil),
```

- [ ] **Step 4: Ověřit**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/events/[id]/expenses/[expenseId]/acknowledge-mismatch/route.ts" "src/app/api/events/[id]/expenses/[expenseId]/reanalyze/route.ts" "src/app/api/events/[id]/expenses/[expenseId]/attach-file/route.ts"
git commit -m "fix(provoz): doklady — gate hospodáře podle oddílu akce, ne globálně"
git push
```

---

### Task 6: Detail akce a navigace — vstupní gate + odznak oddílu

**Files:**
- Modify: `src/app/(admin)/dashboard/events/[id]/page.tsx`
- Modify: `src/app/(admin)/layout.tsx`
- Modify: `src/app/(admin)/dashboard/events/[id]/event-detail-client.tsx` (badge sekce ř. 1949-1964)

**Interfaces:**
- Consumes: `isTreasurerOfOddil`, `isAnyOddilTreasurer` (Task 2); `ODDIL_LABELS` (Task 1); `event.oddil` na `EventRow` (Task 3).
- Produces: vstup do `/dashboard/events/[id]` pro provozní výdaj povolen kterémukoli ze dvou hospodářů; prop `isTreasurer` předávaný do `EventDetailClient` (a skrz něj do `EventExpensesTab`, `EventExpenseActions`, mismatch UI) odpovídá hospodáři KONKRÉTNÍHO oddílu dané akce — beze změny signatur, beze změny chování u běžných akcí (`oddil` vždy `'ovt'`).

- [ ] **Step 1: `events/[id]/page.tsx` — přepočítat isTreasurer podle oddílu akce**

Nahradit celý soubor:

```tsx
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/actions/events";
import { auth } from "@/auth";
import { isAnyOddilTreasurer, isTreasurerOfOddil } from "@/lib/treasurer";
import { EventDetailClient } from "./event-detail-client";

export default async function EventDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const eventId = Number(id);
    if (isNaN(eventId) || eventId <= 0) notFound();

    const [event, session] = await Promise.all([getEventById(eventId), auth()]);
    if (!event) notFound();

    if (event.eventType === "provozni" && !isAnyOddilTreasurer(session?.user?.email)) {
        redirect("/dashboard");
    }

    // isTreasurerOfOddil(email, 'ovt') je identické s dnešním isTreasurer() — u běžných
    // akcí (oddil vždy 'ovt') se chování oproti dnešku nemění vůbec.
    const isTreasurer = isTreasurerOfOddil(session?.user?.email, event.oddil);

    return <EventDetailClient event={event} isTreasurer={isTreasurer} />;
}
```

- [ ] **Step 2: `(admin)/layout.tsx` — nav gate na kteréhokoli hospodáře**

Řádek 8 a 14, nahradit:

```ts
import { isTreasurer } from "@/lib/treasurer";
```

```ts
    const showProvoz = isTreasurer(session?.user?.email);
```

za:

```ts
import { isAnyOddilTreasurer } from "@/lib/treasurer";
```

```ts
    const showProvoz = isAnyOddilTreasurer(session?.user?.email);
```

- [ ] **Step 3: `provoz/page.tsx` — gate na kteréhokoli hospodáře**

`src/app/(admin)/dashboard/provoz/page.tsx`, řádek 3 a 9, nahradit:

```ts
import { isTreasurer } from "@/lib/treasurer";
```

```ts
    if (!isTreasurer(session?.user?.email)) redirect("/dashboard");
```

za:

```ts
import { isAnyOddilTreasurer } from "@/lib/treasurer";
```

```ts
    if (!isAnyOddilTreasurer(session?.user?.email)) redirect("/dashboard");
```

- [ ] **Step 4: Odznak oddílu v detailu provozního výdaje**

`event-detail-client.tsx` — doplnit import (u ostatních importů z `@/lib/events-config`):

```ts
import { ODDIL_LABELS } from "@/lib/oddily-config";
```

Řádky 1950-1951, nahradit:

```tsx
                        {isProvozni ? (
                            <Badge className="bg-slate-100 text-slate-600 border-0 text-xs font-normal">{EVENT_TYPE_LABELS.provozni}</Badge>
                        ) : (
```

za:

```tsx
                        {isProvozni ? (
                            <>
                                <Badge className="bg-slate-100 text-slate-600 border-0 text-xs font-normal">{EVENT_TYPE_LABELS.provozni}</Badge>
                                <Badge className="bg-emerald-50 text-emerald-700 border-0 text-xs font-normal">{ODDIL_LABELS[event.oddil]}</Badge>
                            </>
                        ) : (
```

- [ ] **Step 5: Ověřit**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/dashboard/events/[id]/page.tsx" "src/app/(admin)/layout.tsx" "src/app/(admin)/dashboard/provoz/page.tsx" "src/app/(admin)/dashboard/events/[id]/event-detail-client.tsx"
git commit -m "feat(provoz): vstup do sekce/detailu pro kteréhokoli hospodáře + odznak oddílu"
git push
```

---

### Task 7: `/dashboard/provoz` — záložky OVT/TOM

**Files:**
- Modify: `src/app/(admin)/dashboard/provoz/page.tsx`
- Modify: `src/app/(admin)/dashboard/provoz/provoz-client.tsx`

**Interfaces:**
- Consumes: `ProvozniVydajRow.oddil`, `createProvozniVydaj` s `oddil` (Task 3); `ODDIL_VALUES`, `ODDIL_LABELS` (Task 1); `Oddil` (Task 1, re-exportováno z `@/lib/actions/events`); `Tabs`/`TabsList`/`TabsTrigger` z `@/components/ui/tabs`.
- Produces: `/dashboard/provoz?oddil=tom` otevře záložku TOM (default `ovt` bez parametru); dialog založení má select oddílu s výchozí hodnotou = aktivní záložka.

- [ ] **Step 1: `page.tsx` — načíst searchParams, předat initialOddil**

Nahradit celý soubor:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAnyOddilTreasurer } from "@/lib/treasurer";
import { getProvozniVydaje, getMembersForAutocomplete, type Oddil } from "@/lib/actions/events";
import { ODDIL_VALUES } from "@/lib/oddily-config";
import { ProvozClient } from "./provoz-client";

export default async function ProvozPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();
    if (!isAnyOddilTreasurer(session?.user?.email)) redirect("/dashboard");

    const params = await searchParams;
    const requestedOddil = typeof params.oddil === "string" ? params.oddil : undefined;
    const initialOddil: Oddil = (ODDIL_VALUES as string[]).includes(requestedOddil ?? "")
        ? (requestedOddil as Oddil)
        : "ovt";

    const [rows, allMembers] = await Promise.all([
        getProvozniVydaje(),
        getMembersForAutocomplete(),
    ]);

    return <ProvozClient rows={rows} allMembers={allMembers} initialOddil={initialOddil} />;
}
```

- [ ] **Step 2: `provoz-client.tsx` — záložky + oddíl v dialogu**

Nahradit celý soubor:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { createProvozniVydaj, type ProvozniVydajRow, type MemberOption, type Oddil } from "@/lib/actions/events";
import { deriveProvozniStav, PROVOZNI_STAV_LABELS, type ProvozniStav } from "@/lib/provoz-status";
import { ODDIL_LABELS, ODDIL_VALUES } from "@/lib/oddily-config";

const STAV_COLORS: Record<ProvozniStav, string> = {
    rozpracovano: "bg-gray-100 text-gray-600",
    uzamceno: "bg-amber-50 text-amber-700",
    odeslano: "bg-emerald-50 text-emerald-700",
};

const fmtKc = (n: number) =>
    new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(n) + " Kč";
const fmtDate = (d: string | null) =>
    d ? new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(d)) : "—";

function updateOddilInUrl(oddil: Oddil) {
    const url = new URL(window.location.href);
    if (oddil === "ovt") url.searchParams.delete("oddil");
    else url.searchParams.set("oddil", oddil);
    window.history.replaceState({}, "", url.toString());
}

export function ProvozClient({
    rows, allMembers, initialOddil,
}: {
    rows: ProvozniVydajRow[]; allMembers: MemberOption[]; initialOddil: Oddil;
}) {
    const router = useRouter();
    const [activeOddil, setActiveOddil] = useState<Oddil>(initialOddil);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [leaderId, setLeaderId] = useState("");
    const [description, setDescription] = useState("");
    const [oddil, setOddil] = useState<Oddil>(initialOddil);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function handleTabChange(value: string) {
        const next = value as Oddil;
        setActiveOddil(next);
        updateOddilInUrl(next);
    }

    function handleCreate() {
        setError(null);
        startTransition(async () => {
            const res = await createProvozniVydaj({
                name,
                dateFrom: dateFrom || null,
                leaderId: leaderId ? Number(leaderId) : null,
                description: description.trim() || null,
                oddil,
            });
            if ("error" in res) { setError(res.error); return; }
            router.push(`/dashboard/events/${res.id}`);
        });
    }

    const visibleRows = rows.filter(r => r.oddil === activeOddil);

    return (
        <div>
            <div className="flex items-center justify-between mb-5">
                <h1 className="text-xl font-semibold text-gray-900">Provozní výdaje</h1>
                <Dialog open={open} onOpenChange={o => { setOpen(o); setError(null); if (o) setOddil(activeOddil); }}>
                    <DialogTrigger asChild>
                        <Button size="sm"><Plus size={15} />Nový provozní výdaj</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader><DialogTitle>Nový provozní výdaj</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label htmlFor="provoz-oddil" className="text-sm font-medium">Oddíl</label>
                                <select id="provoz-oddil" value={oddil} onChange={e => setOddil(e.target.value as Oddil)}
                                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                                    {ODDIL_VALUES.map(o => (
                                        <option key={o} value={o}>{ODDIL_LABELS[o]}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="provoz-name" className="text-sm font-medium">Název *</label>
                                <Input id="provoz-name" value={name} onChange={e => setName(e.target.value)}
                                    placeholder="Např. Oprava vleku" />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="provoz-date" className="text-sm font-medium">Datum</label>
                                <Input id="provoz-date" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="provoz-leader" className="text-sm font-medium">Odpovědná osoba</label>
                                <select id="provoz-leader" value={leaderId} onChange={e => setLeaderId(e.target.value)}
                                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                                    <option value="">— nevybráno —</option>
                                    {allMembers.map(m => (
                                        <option key={m.id} value={m.id}>{m.lastName} {m.firstName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="provoz-desc" className="text-sm font-medium">Popis</label>
                                <Textarea id="provoz-desc" value={description} onChange={e => setDescription(e.target.value)}
                                    placeholder="Volitelný popis…" rows={3} />
                            </div>
                            {error && <p className="text-sm text-red-600">{error}</p>}
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreate} disabled={pending || !name.trim()}>
                                {pending ? "Zakládám…" : "Založit"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Tabs value={activeOddil} onValueChange={handleTabChange} className="mb-4 gap-0">
                <TabsList>
                    {ODDIL_VALUES.map(o => (
                        <TabsTrigger key={o} value={o}>{ODDIL_LABELS[o]}</TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {visibleRows.length === 0 ? (
                <p className="text-sm text-gray-500">Zatím žádné provozní výdaje.</p>
            ) : (
                <div className="rounded-xl border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-gray-50/50 text-left text-xs text-gray-500">
                                <th className="px-4 py-2.5 font-medium">Název</th>
                                <th className="px-4 py-2.5 font-medium">Datum</th>
                                <th className="px-4 py-2.5 font-medium">Odpovědná osoba</th>
                                <th className="px-4 py-2.5 font-medium text-right">Doklady</th>
                                <th className="px-4 py-2.5 font-medium text-right">Částka</th>
                                <th className="px-4 py-2.5 font-medium">Stav</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map(r => {
                                const stav = deriveProvozniStav(r.billingStatus, r.sentToTj);
                                return (
                                    <tr key={r.id} onClick={() => router.push(`/dashboard/events/${r.id}`)}
                                        className="border-b last:border-0 hover:bg-gray-50 cursor-pointer transition-colors">
                                        <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                                        <td className="px-4 py-2.5 text-gray-600">{fmtDate(r.dateFrom)}</td>
                                        <td className="px-4 py-2.5 text-gray-600">{r.leaderName ?? "—"}</td>
                                        <td className="px-4 py-2.5 text-right text-gray-600">{r.expenseCount}</td>
                                        <td className="px-4 py-2.5 text-right text-gray-900">{fmtKc(r.expenseSum)}</td>
                                        <td className="px-4 py-2.5">
                                            <Badge className={`${STAV_COLORS[stav]} border-0 text-xs font-normal`}>
                                                {PROVOZNI_STAV_LABELS[stav]}
                                            </Badge>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Ověřit build**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/dashboard/provoz/"
git commit -m "feat(provoz): záložky OVT/TOM na /dashboard/provoz + výběr oddílu při založení"
git push
```

---

### Task 8: PDF vyúčtování a mail na TJ — kód oddílu a příjemce podle oddílu

**Files:**
- Modify: `src/app/api/events/[id]/vyuctovani/route.tsx`
- Modify: `src/app/api/events/[id]/send-vyuctovani/route.tsx`
- Modify: `src/app/api/events/[id]/expenses/[expenseId]/send-invoice-payment/route.ts`

**Interfaces:**
- Consumes: `getOddilNazevPlny`, `getOddilTjRecipientEmail` (Task 1, `@/lib/oddily-config`).
- Produces: text "oddílu" na PDF a příjemce mailu na TJ se odvozují z `event.oddil` — pro `'ovt'` identické s dnešním chováním (`getOddilNazevPlny('ovt') === "207 Oddíl vodní turistiky"`, `getOddilTjRecipientEmail('ovt')` čte stejný env `EMAIL_HOSPODAR_ODDILU_TJB` jako dnes).

- [ ] **Step 1: `vyuctovani/route.tsx` — oddi podle oddílu**

Odstranit konstantu (řádek 16):

```ts
const DEFAULT_ODDIL = "207 Oddíl vodní turistiky";
```

Doplnit import:

```ts
import { getOddilNazevPlny } from "@/lib/oddily-config";
```

Rozšířit select (řádky 37-46) o `oddil`:

```ts
        const [event] = await db
            .select({
                id: events.id,
                name: events.name,
                oddil: events.oddil,
                leaderName: members.fullName,
            })
            .from(events)
            .leftJoin(members, eq(events.leaderId, members.id))
            .where(eq(events.id, eventId))
            .limit(1);
```

Řádek 67, nahradit:

```ts
            oddi: DEFAULT_ODDIL,
```

za:

```ts
            oddi: getOddilNazevPlny(event.oddil),
```

- [ ] **Step 2: `send-vyuctovani/route.tsx` — oddi a hospodarEmail podle oddílu**

Odstranit konstantu (řádek 18):

```ts
const DEFAULT_ODDIL = "207 Oddíl vodní turistiky";
```

Doplnit import (u ostatních importů z `@/lib/...`):

```ts
import { getOddilNazevPlny, getOddilTjRecipientEmail } from "@/lib/oddily-config";
```

Rozšířit select akce (řádky 172-185) o `oddil`:

```ts
    const [event] = await db
      .select({
        id: events.id,
        name: events.name,
        eventType: events.eventType,
        oddil: events.oddil,
        billingStatus: events.billingStatus,
        treasurerApproved: events.treasurerApproved,
        leaderName: members.fullName,
        leaderEmail: members.email,
      })
      .from(events)
      .leftJoin(members, eq(events.leaderId, members.id))
      .where(eq(events.id, eventId))
      .limit(1);
```

Řádek 217, nahradit:

```ts
    const hospodarEmail = process.env.EMAIL_HOSPODAR_ODDILU_TJB?.trim() || null;
```

za:

```ts
    const hospodarEmail = getOddilTjRecipientEmail(event.oddil);
```

Řádek 306, nahradit:

```ts
      oddi: DEFAULT_ODDIL,
```

za:

```ts
      oddi: getOddilNazevPlny(event.oddil),
```

- [ ] **Step 3: `send-invoice-payment/route.ts` — hospodarEmail podle oddílu**

Doplnit import:

```ts
import { getOddilTjRecipientEmail } from "@/lib/oddily-config";
```

Odstranit časnou kontrolu (řádky 43-49):

```ts
        const hospodarEmail = process.env.EMAIL_HOSPODAR_ODDILU_TJB?.trim() || null;
        if (!hospodarEmail) {
            return NextResponse.json(
                { error: "ENV EMAIL_HOSPODAR_ODDILU_TJB není nastavený. Příjemce neznámý." },
                { status: 503 },
            );
        }
```

Rozšířit select akce (řádky 94-98) o `oddil` a za něj vložit kontrolu se správnou proměnnou v chybové hlášce:

```ts
        const [event] = await db
            .select({ name: events.name, oddil: events.oddil })
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1);

        if (!event) {
            return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        }

        const hospodarEmail = getOddilTjRecipientEmail(event.oddil);
        if (!hospodarEmail) {
            return NextResponse.json(
                { error: `Příjemce mailu pro oddíl ${event.oddil} není nastavený (chybějící env proměnná).` },
                { status: 503 },
            );
        }
```

(Nahrazuje původní blok řádků 94-102 — `if (!event) {...}` z něj zůstává, jen se za něj přidává `hospodarEmail`.)

- [ ] **Step 4: Ověřit**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/events/[id]/vyuctovani/route.tsx" "src/app/api/events/[id]/send-vyuctovani/route.tsx" "src/app/api/events/[id]/expenses/[expenseId]/send-invoice-payment/route.ts"
git commit -m "feat(provoz): PDF a maily na TJ — kód oddílu a příjemce podle oddílu"
git push
```

---

### Task 9: E2E testy, CI env, dorovnání specu

**Files:**
- Modify: `.github/workflows/tests.yml` (env blok e2e jobu, ř. ~40-46)
- Modify: `e2e/smoke.spec.ts`
- Modify: `e2e/README.md`
- Modify: `docs/superpowers/specs/2026-08-31-provozni-vydaje-vice-oddilu.md`
- Modify: `docs/superpowers/specs/INDEX.md`

**Interfaces:**
- Consumes: záložky `/dashboard/provoz` (Task 7), gate podle oddílu (Task 2, 4, 6), oddíl při založení (Task 3, 7).
- Produces: CI zeleně projde s `TREASURER_EMAIL` a `TREASURER_EMAIL_TOM` nastavenými na dva odlišné e2e adminy.

- [ ] **Step 1: CI env**

V `.github/workflows/tests.yml` do env bloku e2e jobu (kde je `TREASURER_EMAIL: e2e-admin@test.local`) přidat:

```yaml
      TREASURER_EMAIL_TOM: e2e-tom@test.local
```

Do `e2e/README.md` do seznamu env proměnných doplnit řádek:

```
TREASURER_EMAIL_TOM=e2e-tom@test.local — samostatný e2e admin jako hospodářka oddílu TOM (testy druhého oddílu v sekci Provoz)
```

- [ ] **Step 2: E2E test — hospodářka TOM vidí obě záložky, hospodář OVT nemůže uzamknout cizí oddíl**

V `e2e/smoke.spec.ts` na konec souboru (za stávající `test.describe("provozní výdaje", ...)` blok, řádek 100) přidat:

```ts
test.describe("provozní výdaje — druhý oddíl (TOM)", () => {
    async function tomContext(browser: import("@playwright/test").Browser, baseURL: string | undefined) {
        const secret = process.env.AUTH_SECRET;
        if (!secret) throw new Error("AUTH_SECRET musí být nastaven");
        const token = await encode({
            token: { name: "E2E Hospodářka TOM", email: "e2e-tom@test.local", sub: "e2e-tom" },
            secret,
            salt: "authjs.session-token",
            maxAge: 3600,
        });
        const context = await browser.newContext();
        await context.addCookies([{
            name: "authjs.session-token",
            value: token,
            domain: new URL(baseURL!).hostname,
            path: "/",
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
        }]);
        return context;
    }

    test("hospodářka TOM založí výdaj pro TOM; hospodář OVT ho vidí, ale nesmí uzamknout", async ({ browser, baseURL, page }) => {
        const tomCtx = await tomContext(browser, baseURL);
        const tomPage = await tomCtx.newPage();

        await tomPage.goto("/dashboard/provoz");
        await expect(tomPage.getByRole("heading", { name: "Provozní výdaje" })).toBeVisible();
        await expect(tomPage.getByRole("tab", { name: "OVT" })).toBeVisible();
        await tomPage.getByRole("tab", { name: "TOM" }).click();

        await tomPage.getByRole("button", { name: "Nový provozní výdaj" }).click();
        await tomPage.getByLabel("Název *").fill("E2E výdaj TOM");
        await tomPage.getByRole("button", { name: "Založit" }).click();

        await expect(tomPage).toHaveURL(/\/dashboard\/events\/\d+/);
        const eventUrl = tomPage.url();
        await tomCtx.close();

        // Hospodář OVT (výchozí přihlášená session) vidí detail cizího oddílu…
        await page.goto(eventUrl);
        await expect(page.getByRole("heading", { name: "E2E výdaj TOM" })).toBeVisible();
        await expect(page.getByText("TOM", { exact: true }).first()).toBeVisible();

        // …ale uzamčení je vyhrazené hospodářce TOM.
        await page.getByRole("tab", { name: "Náklady" }).click();
        await page.getByRole("button", { name: "Uzamknout částky" }).click();
        await expect(page.getByText(/může uzamknout jen jeho hospodář/)).toBeVisible();
    });
});
```

- [ ] **Step 3: Spustit E2E lokálně**

Run: dle `e2e/README.md` (lokální testovací DB + `TREASURER_EMAIL=e2e-admin@test.local TREASURER_EMAIL_TOM=e2e-tom@test.local` v env serveru) `npm run test:e2e`
Expected: PASS včetně nového testu. Pokud lokální DB není k dispozici, ověří se v CI po pushi.

- [ ] **Step 4: Dorovnat stav specu**

V `docs/superpowers/specs/2026-08-31-provozni-vydaje-vice-oddilu.md` frontmatter `status: navrh` → `status: implementace`.

V `docs/superpowers/specs/INDEX.md` upravit řádek přidaný v Tasku 1 na:

```
| [2026-08-31-provozni-vydaje-vice-oddilu.md](2026-08-31-provozni-vydaje-vice-oddilu.md) | Provozní výdaje pro druhý oddíl (TOM) — vlastní hospodář, kód oddílu, příjemce mailu na TJ | `implementace` — větev `feat/2026-08-31-provozni-vydaje-druhy-oddil` |
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/tests.yml e2e/smoke.spec.ts e2e/README.md docs/superpowers/specs/2026-08-31-provozni-vydaje-vice-oddilu.md docs/superpowers/specs/INDEX.md
git commit -m "test(provoz): E2E pro druhý oddíl (TOM) + CI env; spec do implementace"
git push
```

---

## Po dokončení všech tasků

1. Whole-branch review (`superpowers:requesting-code-review`) nad celým diffem `feat/2026-08-31-provozni-vydaje-druhy-oddil` vs `staging`.
2. PR `feat/2026-08-31-provozni-vydaje-druhy-oddil → staging` (ne přímý push). Migrace `20260831_120000_events_oddil.sql` bude viditelná v PR diffu; po mergi ji na staging DB aplikuje `db-migrate-staging.yml`.
3. UAT na staging preview: přihlásit se jako hospodář OVT, ověřit obě záložky; přihlásit se jako Alžběta Poupětová (po přidání do `admin_users` — mimo tento plán, provozní krok navíc ze spec dokumentu), založit provozní výdaj TOM, nahrát doklad, uzamknout částky, odeslat na TJ a ověřit, že mail jde na `EMAIL_HOSPODAR_ODDILU_TOM`, ne na centrální adresu.
4. Po UAT: spec `status: staging-uat` → `schvaleno`, PR `staging → main`. **Ověřit, že `TREASURER_EMAIL_TOM` a `EMAIL_HOSPODAR_ODDILU_TOM` jsou nastavené ve Vercel Production** (uživatel potvrdil, že jsou nastavené — ověřit i pro Production prostředí, ne jen Preview).
