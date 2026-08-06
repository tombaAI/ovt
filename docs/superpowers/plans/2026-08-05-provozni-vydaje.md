# Provozní výdaje — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provozní výdaj (oprava vleku apod.) jako akce typu `provozni` bez účastníků, se samostatnou stránkou `/dashboard/provoz` viditelnou jen hospodáři a 2krokovým vyúčtováním (uzamknout částky → odeslat na TJ).

**Architecture:** Žádné nové tabulky — nová hodnota `provozni` v `eventTypeEnum` zdědí celou výdajovou mašinerii (`event_expenses`, zámky, odeslání na TJ, audit) přes stávající FK. Stránka `/dashboard/provoz` je jen jiný pohled na `events`; detail se recykluje z `/dashboard/events/[id]` s režimem `isProvozni` (skryté záložky Přihlášky/Vyúčtování/Platby, workflow v záložce Náklady).

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, shadcn/ui, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-05-provozni-vydaje.md` (status `zgrilovano`).

## Global Constraints

- Větev: `feat/2026-08-05-provozni-vydaje` ze `staging` (potvrzeno uživatelem). Commit + push po každém tasku. Nikdy nepushovat přímo na `staging` — na konci PR `feature → staging`.
- Pre-commit hook spouští `npm run lint && npx tsc --noEmit && npm run test:unit` — každý commit musí projít.
- Veškeré UI texty česky; u provozních výdajů mluvit o „provozním výdaji", ne o „akci".
- Server actions: návratový tvar `{ error: string } | { success: true }` (resp. `{ id }`), `getDb()` singleton, `await auth()` pro e-mail, `revalidatePath()` po mutaci.
- Gate hospodáře: výhradně existující `isTreasurer()` z `src/lib/treasurer.ts` (env `TREASURER_EMAIL`).
- Enum hodnota je `provozni`, UI label „Provozní výdaj".
- Migrace: nový soubor v `supabase/migrations/` commitnutý spolu se změnou `src/db/schema.ts`; aplikuje ji GHA (staging i produkce), nikdy ručně.
- Guardrail „veřejná přihláška na provozní výdaj nesmí vzniknout" je splněn strukturálně: jediný veřejný formulář (`/prihlaska/zahranicnivoda`) cílí na konkrétní zahraniční akci přes `FOREIGN_WATER_FORM_SLUG` a admin dialog přihlášky žije ve skryté záložce Přihlášky. Žádný kód navíc (YAGNI).

---

### Task 1: Větev, schéma, migrace, labely typů

**Files:**
- Modify: `src/db/schema.ts:378`
- Create: `supabase/migrations/20260805_180000_event_type_provozni.sql`
- Modify: `src/lib/events-config.ts`
- Modify: `src/app/(admin)/dashboard/events/add-event-sheet.tsx:28`
- Modify: `src/app/(admin)/dashboard/events/[id]/event-detail-client.tsx:75`

**Interfaces:**
- Produces: `eventTypeEnum` obsahuje `"provozni"`; `EVENT_TYPE_LABELS.provozni === "Provozní výdaj"`; nový export `SELECTABLE_EVENT_TYPES` (dvojice [hodnota, label] bez `provozni`) v `src/lib/events-config.ts` — používají ho oba selecty typu akce.

- [ ] **Step 1: Založit větev**

```bash
git checkout staging && git pull origin staging
git checkout -b feat/2026-08-05-provozni-vydaje
```

- [ ] **Step 2: Rozšířit enum ve schématu**

V `src/db/schema.ts` řádek 378:

```ts
export const eventTypeEnum = ["cpv", "foreign", "recreational", "club", "race", "brigada", "other", "provozni"] as const;
```

- [ ] **Step 3: Migrace CHECK constraintu**

Nový soubor `supabase/migrations/20260805_180000_event_type_provozni.sql` (constraint založen v `20260414_220000_events.sql:12`, PostgreSQL mu dal výchozí jméno `events_event_type_check`):

```sql
-- Nový typ akce 'provozni' — provozní výdaje mimo akce (spec 2026-08-05-provozni-vydaje.md)
ALTER TABLE app.events DROP CONSTRAINT events_event_type_check;
ALTER TABLE app.events ADD CONSTRAINT events_event_type_check
    CHECK (event_type IN ('cpv','foreign','recreational','club','race','brigada','other','provozni'));
```

- [ ] **Step 4: Label + selectable typy v events-config**

V `src/lib/events-config.ts` doplnit do `EVENT_TYPE_LABELS` řádek `provozni: "Provozní výdaj",` (TypeScript to vynutí — Record přes `EventType`) a pod mapu přidat:

```ts
/**
 * Typy nabízené v selectech typu akce. `provozni` je záměrně vynechán —
 * provozní výdaje vznikají výhradně tlačítkem na /dashboard/provoz a běžná
 * akce se na provozní výdaj nesmí přepnout (a naopak).
 */
export const SELECTABLE_EVENT_TYPES = (Object.entries(EVENT_TYPE_LABELS) as [EventType, string][])
    .filter(([k]) => k !== "provozni");
```

- [ ] **Step 5: Přepnout oba selecty na SELECTABLE_EVENT_TYPES**

V `add-event-sheet.tsx:28` a `event-detail-client.tsx:75` smazat lokální
`const EVENT_TYPES = Object.entries(EVENT_TYPE_LABELS) as [EventType, string][];`
a místo něj importovat `SELECTABLE_EVENT_TYPES` z `@/lib/events-config`; všechna použití `EVENT_TYPES` v obou souborech přejmenovat na `SELECTABLE_EVENT_TYPES`.

- [ ] **Step 6: Ověřit typy a testy**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS (žádné chyby — Record je úplný, selecty kompilují).

- [ ] **Step 7: Commit + push**

```bash
git add src/db/schema.ts supabase/migrations/20260805_180000_event_type_provozni.sql src/lib/events-config.ts "src/app/(admin)/dashboard/events/add-event-sheet.tsx" "src/app/(admin)/dashboard/events/[id]/event-detail-client.tsx"
git commit -m "feat(provoz): typ akce provozni — schéma, migrace, labely"
git push -u origin feat/2026-08-05-provozni-vydaje
```

---

### Task 2: Vyfiltrovat provozní výdaje z kalendáře, roků a dashboardu

**Files:**
- Modify: `src/lib/actions/events.ts` (`getEvents` ~ř. 63, `getEventYears` ~ř. 192, import `ne`/`and` z drizzle-orm)
- Modify: `src/app/(admin)/dashboard/page.tsx:110-112`

**Interfaces:**
- Consumes: `eventTypeEnum` s `provozni` (Task 1).
- Produces: `getEvents(year)` a `getEventYears()` nikdy nevrací akce typu `provozni`; dashboard počty akcí je nezapočítávají. Signatury beze změny.

- [ ] **Step 1: Filtr v getEvents a getEventYears**

V `src/lib/actions/events.ts` rozšířit import: `import { eq, ne, and, asc, desc, sql } from "drizzle-orm";`

`getEvents`: `.where(eq(events.year, year))` → `.where(and(eq(events.year, year), ne(events.eventType, "provozni")))`

`getEventYears`: za `.from(events)` vložit `.where(ne(events.eventType, "provozni"))`.

- [ ] **Step 2: Filtr v dashboard počtech**

V `src/app/(admin)/dashboard/page.tsx` (ř. 110-112): `.where(eq(events.year, year))` → `.where(and(eq(events.year, year), ne(events.eventType, "provozni")))` — doplnit `ne`, `and` do importu z drizzle-orm.

- [ ] **Step 3: Ověřit**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS. (Funkční pokrytí filtru přidá E2E test v Tasku 7 — DB dotaz nejde unit-testovat bez DB.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/events.ts "src/app/(admin)/dashboard/page.tsx"
git commit -m "feat(provoz): vyfiltrovat provozní výdaje z kalendáře a dashboardu"
git push
```

---

### Task 3: Čistý modul stavu + server akce getProvozniVydaje / createProvozniVydaj

**Files:**
- Create: `src/lib/provoz-status.ts`
- Test: `src/lib/provoz-status.test.ts`
- Modify: `src/lib/actions/events.ts` (nové akce na konec sekce Queries/Mutations; import `eventExpenses` ze schématu a `isTreasurer` z `@/lib/treasurer`)

**Interfaces:**
- Produces (pro Task 5):
  - `deriveProvozniStav(billingStatus: "draft" | "prescribed", sentToTj: boolean): "rozpracovano" | "uzamceno" | "odeslano"`
  - `getProvozniVydaje(): Promise<ProvozniVydajRow[]>` — `ProvozniVydajRow = { id: number; name: string; dateFrom: string | null; leaderName: string | null; billingStatus: "draft" | "prescribed"; expenseCount: number; expenseSum: number; sentToTj: boolean }`
  - `createProvozniVydaj(data: { name: string; dateFrom: string | null; leaderId: number | null; description: string | null }): Promise<{ id: number } | { error: string }>`

- [ ] **Step 1: Napsat failing test**

`src/lib/provoz-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveProvozniStav } from "./provoz-status";

describe("deriveProvozniStav", () => {
    it("draft bez odeslání = rozpracováno", () => {
        expect(deriveProvozniStav("draft", false)).toBe("rozpracovano");
    });
    it("prescribed bez odeslání = částky uzamčeny", () => {
        expect(deriveProvozniStav("prescribed", false)).toBe("uzamceno");
    });
    it("prescribed s odesláním = odesláno na TJ", () => {
        expect(deriveProvozniStav("prescribed", true)).toBe("odeslano");
    });
    it("draft s odesláním (odemčeno po odeslání) = zpět rozpracováno", () => {
        expect(deriveProvozniStav("draft", true)).toBe("rozpracovano");
    });
});
```

- [ ] **Step 2: Ověřit, že padá**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './provoz-status'`.

- [ ] **Step 3: Implementace čistého modulu**

`src/lib/provoz-status.ts`:

```ts
/**
 * Odvozený stav provozního výdaje (spec 2026-08-05-provozni-vydaje.md).
 * Odemčení po odeslání vrací stav na "rozpracovano" — signalizuje, že se
 * částky znovu upravují a před dalším odesláním musí být znovu uzamčeny.
 */
export type ProvozniStav = "rozpracovano" | "uzamceno" | "odeslano";

export const PROVOZNI_STAV_LABELS: Record<ProvozniStav, string> = {
    rozpracovano: "Rozpracováno",
    uzamceno: "Částky uzamčeny",
    odeslano: "Odesláno na TJ",
};

export function deriveProvozniStav(
    billingStatus: "draft" | "prescribed",
    sentToTj: boolean,
): ProvozniStav {
    if (billingStatus === "draft") return "rozpracovano";
    return sentToTj ? "odeslano" : "uzamceno";
}
```

- [ ] **Step 4: Ověřit zelenou**

Run: `npm run test:unit`
Expected: PASS (54 testů).

- [ ] **Step 5: Server akce v events.ts**

Do importu schématu v `src/lib/actions/events.ts` přidat `eventExpenses`; přidat `import { isTreasurer } from "@/lib/treasurer";`. Na konec sekce Queries:

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
};

export async function getProvozniVydaje(): Promise<ProvozniVydajRow[]> {
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
    }));
}
```

Za `createEvent` přidat mutaci (rok se doplňuje automaticky — spec: povinný jen název):

```ts
export type ProvozniVydajFormData = {
    name: string;
    dateFrom: string | null;
    leaderId: number | null;
    description: string | null;
};

export async function createProvozniVydaj(
    data: ProvozniVydajFormData,
): Promise<{ id: number } | { error: string }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };
    if (!isTreasurer(session.user.email)) return { error: "Provozní výdaje jsou jen pro hospodáře." };
    if (!data.name.trim()) return { error: "Název je povinný." };

    const db = getDb();
    const [row] = await db
        .insert(events)
        .values({
            year: new Date().getFullYear(),
            name: data.name.trim(),
            eventType: "provozni",
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

Pozn.: `events.createdAt` ve schématu existuje (`createdAt` s `defaultNow()`), `desc` je už importované.

- [ ] **Step 6: Ověřit**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/provoz-status.ts src/lib/provoz-status.test.ts src/lib/actions/events.ts
git commit -m "feat(provoz): server akce a odvozený stav provozního výdaje"
git push
```

---

### Task 4: lockBilling/unlockBilling — auto-souhlas hospodáře u provozního výdaje

**Files:**
- Modify: `src/lib/actions/event-settlement.ts` (`lockBilling` ř. 659, `unlockBilling` ř. 699; do importu schématu přidat `eventTreasurerApprovalLog`)

**Interfaces:**
- Consumes: `isTreasurer` (už importován na ř. 22), `eventTreasurerApprovalLog` ze schématu.
- Produces: `lockBilling(eventId)` u akce typu `provozni` navíc nastaví `treasurerApproved = true` + zapíše approval log a audit; `unlockBilling(eventId)` u `provozni` souhlas vždy odvolá. Signatury beze změny — UI v Tasku 6 je volá beze změn.

- [ ] **Step 1: lockBilling — rozšířit select a auto-souhlas**

V `lockBilling` rozšířit úvodní select (ř. 664):

```ts
const [event] = await db
    .select({ name: events.name, eventType: events.eventType, treasurerApproved: events.treasurerApproved })
    .from(events).where(eq(events.id, eventId));
if (!event) return { error: "Akce nenalezena" };

const isProvozni = event.eventType === "provozni";
if (isProvozni && !isTreasurer(session.user.email)) {
    return { error: "Provozní výdaj může uzamknout jen hospodář." };
}
```

Za stávající `db.update(events).set({ billingStatus: "prescribed", ... })` blok (před `revalidatePath`) vložit:

```ts
// Provozní výdaj: zamyká sám hospodář — samostatný krok souhlasu odpadá,
// souhlas se uděluje automaticky při zamčení (spec 2026-08-05-provozni-vydaje.md).
if (isProvozni && !event.treasurerApproved) {
    await db.update(events).set({ treasurerApproved: true }).where(eq(events.id, eventId));
    await db.insert(eventTreasurerApprovalLog).values({
        eventId,
        action: "approved",
        changedBy: session.user.name?.trim() || session.user.email,
    });
    await db.insert(auditLog).values({
        entityType: "event",
        entityId: eventId,
        action: "treasurer_approve",
        changes: { treasurerApproved: { old: "false", new: "true" } },
        metadata: { eventId, auto: "provozni_lock" },
        changedBy: session.user.email,
    });
}
```

- [ ] **Step 2: unlockBilling — odvolat souhlas u provozního**

Na začátek `unlockBilling` (za `const db = getDb();`) přidat:

```ts
const [ev] = await db.select({ eventType: events.eventType }).from(events).where(eq(events.id, eventId));
if (!ev) return { error: "Akce nenalezena" };
const isProvozni = ev.eventType === "provozni";
```

V transakci změnit reset souhlasu z `...(collecting ? { treasurerApproved: false } : {})` na `...(collecting || isProvozni ? { treasurerApproved: false } : {})` a za stávající `tx.insert(auditLog)` vložit:

```ts
if (isProvozni) {
    await tx.insert(eventTreasurerApprovalLog).values({
        eventId,
        action: "revoked",
        changedBy: session.user!.name?.trim() || session.user!.email!,
    });
}
```

- [ ] **Step 3: Ověřit**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/event-settlement.ts
git commit -m "feat(provoz): zámek částek uděluje souhlas hospodáře automaticky"
git push
```

---

### Task 5: Stránka /dashboard/provoz + navigace s gatem

**Files:**
- Modify: `src/app/(admin)/layout.tsx`
- Modify: `src/app/(admin)/nav-links.tsx`
- Modify: `src/app/(admin)/mobile-nav.tsx`
- Create: `src/app/(admin)/dashboard/provoz/page.tsx`
- Create: `src/app/(admin)/dashboard/provoz/provoz-client.tsx`

**Interfaces:**
- Consumes: `getProvozniVydaje`, `createProvozniVydaj`, `ProvozniVydajRow` (Task 3); `deriveProvozniStav`, `PROVOZNI_STAV_LABELS` (Task 3); `getMembersForAutocomplete`, `MemberOption` z `@/lib/actions/events`; `isTreasurer` z `@/lib/treasurer`.
- Produces: route `/dashboard/provoz` (jen hospodář, jinak `redirect("/dashboard")`); `NavLinks`/`MobileNav` přijímají prop `showProvoz: boolean`.

- [ ] **Step 1: Navigace — prop showProvoz**

`src/app/(admin)/layout.tsx`: přidat `import { isTreasurer } from "@/lib/treasurer";`, v komponentě `const showProvoz = isTreasurer(session?.user?.email);` a předat `<NavLinks showProvoz={showProvoz} />` a `<MobileNav showProvoz={showProvoz} />`.

`src/app/(admin)/nav-links.tsx`: `export function NavLinks({ showProvoz }: { showProvoz: boolean })`; položky sestavit dynamicky — za `{ href: "/dashboard/finance", label: "Finance" }` vložit podmíněně:

```ts
const items = NAV_ITEMS.flatMap(item => [
    item,
    ...(item.href === "/dashboard/finance" && showProvoz
        ? [{ href: "/dashboard/provoz", label: "Provoz" }]
        : []),
]);
```

a mapovat přes `items` místo `NAV_ITEMS`.

`src/app/(admin)/mobile-nav.tsx`: `export function MobileNav({ showProvoz }: { showProvoz: boolean })`; v render sekci „More" použít `[...MORE_ITEMS, ...(showProvoz ? [{ href: "/dashboard/provoz", label: "Provoz" }] : [])]` (a stejné rozšíření v `isMoreActive` výpočtu).

- [ ] **Step 2: Server page s gatem**

`src/app/(admin)/dashboard/provoz/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isTreasurer } from "@/lib/treasurer";
import { getProvozniVydaje, getMembersForAutocomplete } from "@/lib/actions/events";
import { ProvozClient } from "./provoz-client";

export default async function ProvozPage() {
    const session = await auth();
    if (!isTreasurer(session?.user?.email)) redirect("/dashboard");

    const [rows, allMembers] = await Promise.all([
        getProvozniVydaje(),
        getMembersForAutocomplete(),
    ]);

    return <ProvozClient rows={rows} allMembers={allMembers} />;
}
```

- [ ] **Step 3: Klient — tabulka + dialog založení**

`src/app/(admin)/dashboard/provoz/provoz-client.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { createProvozniVydaj, type ProvozniVydajRow, type MemberOption } from "@/lib/actions/events";
import { deriveProvozniStav, PROVOZNI_STAV_LABELS, type ProvozniStav } from "@/lib/provoz-status";

const STAV_COLORS: Record<ProvozniStav, string> = {
    rozpracovano: "bg-gray-100 text-gray-600",
    uzamceno: "bg-amber-50 text-amber-700",
    odeslano: "bg-emerald-50 text-emerald-700",
};

const fmtKc = (n: number) =>
    new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(n) + " Kč";
const fmtDate = (d: string | null) =>
    d ? new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(d)) : "—";

export function ProvozClient({ rows, allMembers }: { rows: ProvozniVydajRow[]; allMembers: MemberOption[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [leaderId, setLeaderId] = useState("");
    const [description, setDescription] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function handleCreate() {
        setError(null);
        startTransition(async () => {
            const res = await createProvozniVydaj({
                name,
                dateFrom: dateFrom || null,
                leaderId: leaderId ? Number(leaderId) : null,
                description: description.trim() || null,
            });
            if ("error" in res) { setError(res.error); return; }
            router.push(`/dashboard/events/${res.id}`);
        });
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-5">
                <h1 className="text-xl font-semibold text-gray-900">Provozní výdaje</h1>
                <Dialog open={open} onOpenChange={o => { setOpen(o); setError(null); }}>
                    <DialogTrigger asChild>
                        <Button size="sm"><Plus size={15} />Nový provozní výdaj</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader><DialogTitle>Nový provozní výdaj</DialogTitle></DialogHeader>
                        <div className="space-y-3">
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

            {rows.length === 0 ? (
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
                            {rows.map(r => {
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

Pozn.: pokud `src/components/ui/dialog.tsx` nebo `textarea.tsx` v projektu chybí, doinstalovat přes `npx shadcn@latest add dialog textarea` (nikdy needitovat ručně — viz CLAUDE.md).

- [ ] **Step 4: Ověřit build**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/layout.tsx" "src/app/(admin)/nav-links.tsx" "src/app/(admin)/mobile-nav.tsx" "src/app/(admin)/dashboard/provoz/"
git commit -m "feat(provoz): stránka /dashboard/provoz s gatem hospodáře + navigace"
git push
```

---

### Task 6: Detail v režimu provozního výdaje

**Files:**
- Modify: `src/app/(admin)/dashboard/events/[id]/page.tsx`
- Modify: `src/app/(admin)/dashboard/events/[id]/event-detail-client.tsx` (header ř. 1898-1956, tabs ř. 1959-2135, detail tab ř. 2010-2094)
- Modify: `src/app/(admin)/dashboard/events/[id]/event-expenses-tab.tsx` (props ~ř. 2935, approval karta ~ř. 3015-3060)
- Modify: `src/app/(admin)/dashboard/events/[id]/event-expense-actions.tsx` (`EventExpenseActions` ~ř. 712)

**Interfaces:**
- Consumes: `lockBilling`, `unlockBilling` z `@/lib/actions/event-settlement` (Task 4 — u provozního auto-souhlas); `EVENT_TYPE_LABELS` (Task 1).
- Produces: detail `/dashboard/events/[id]` pro `eventType === "provozni"`: gate ne-hospodáře, záložky jen Detail / Náklady / Audit, workflow zámku částek v záložce Náklady.

- [ ] **Step 1: Server gate v detail page**

`src/app/(admin)/dashboard/events/[id]/page.tsx` — přidat `import { redirect } from "next/navigation";` a za `if (!event) notFound();` + výpočet `isTreasurer` vložit:

```ts
if (event.eventType === "provozni" && !isTreasurer) redirect("/dashboard");
```

- [ ] **Step 2: event-detail-client — režim isProvozni**

V `EventDetailClient` (ř. 1815) hned na začátku:

```ts
const isProvozni = event.eventType === "provozni";
```

Úpravy (všechny podmíněné `isProvozni`):

1. **Zpětný odkaz** (ř. 1899-1903): `href={isProvozni ? "/dashboard/provoz" : `/dashboard/events?year=${event.year}`}`, text `{isProvozni ? "Provozní výdaje" : `Kalendář ${event.year}`}`.
2. **Header tlačítka** (ř. 1905-1922): tlačítka „Seznam účastníků" a „Pivník" obalit `{!isProvozni && (…)}`; „Vyúčtování oddílu" zůstává.
3. **Smazání** (ř. 1885-1891, 1936): confirm text `Smazat ${isProvozni ? "provozní výdaj" : "akci"} „${event.name}"?…`, po smazání `router.push(isProvozni ? "/dashboard/provoz" : `/dashboard/events?year=${event.year}`)`; label tlačítka `{deleting ? "Mažu…" : isProvozni ? "Smazat výdaj" : "Smazat akci"}`.
4. **Badges** (ř. 1945-1955): pro provozní jen `<Badge className="bg-slate-100 text-slate-600 border-0 text-xs font-normal">{EVENT_TYPE_LABELS.provozni}</Badge>` — stavový a GCal badge obalit `{!isProvozni && (…)}`.
5. **TabsList** (ř. 1961): `grid-cols` → `` `${isProvozni ? "grid-cols-3" : isTreasurer ? "grid-cols-6" : "grid-cols-5"}` ``; TabsTrigger `registrations`, `settlement`, `payments` obalit `{!isProvozni && (…)}`; totéž pro odpovídající `TabsContent` bloky (ř. 2097-2099, 2116-2118, 2121-2128). Audit trigger zůstává `{isTreasurer && …}` (hospodář na provozním vždy projde gatem).
6. **Výchozí tab** (ř. 1817-1822): beze změny — `"detail"` platí pro oba režimy; sessionStorage klíč je per event, uložený skrytý tab se u provozního nemůže vyskytnout (založen jako provozní od začátku; kdyby ano, Tabs bez triggeru zobrazí prázdno jen do prvního kliknutí — akceptováno).
7. **Detail tab** (ř. 2010-2094): obalit `{!isProvozni && (…)}`: `ImmediateSelect` Typ (ř. 2020-2021), `ImmediateSelect` Stav (ř. 2022-2023), celý blok „Termín přihlášek" (ř. 2067-2074), GCal blok (ř. 2089-2093). GCal props (`gcalValue`, `onGcalAccept`, `onGcalPush`) na polích netřeba řešit — bez `gcalEventId` jsou `undefined` samy.
8. **Expenses tab** (ř. 2102-2113): předat sdílený stav a nové props:

```tsx
<EventExpensesTab
    eventId={event.id}
    eventName={event.name}
    leaderName={event.leaderName}
    leaderCskNumber={event.leaderCskNumber}
    billingStatus={billingStatus}
    lockForReimbursement={event.lockForReimbursement}
    treasurerApproved={event.treasurerApproved}
    isTreasurer={isTreasurer}
    isProvozni={isProvozni}
    onBillingStatusChange={setBillingStatus}
/>
```

(`billingStatus={event.billingStatus}` → `billingStatus={billingStatus}` — sdílený stav z ř. 1829.)

- [ ] **Step 3: event-expenses-tab — zámek částek pro provozní**

Přidat do props: `isProvozni?: boolean; onBillingStatusChange?: (s: "draft" | "prescribed") => void;` (destrukturovat s defaultem `isProvozni = false`). Importovat `lockBilling`, `unlockBilling` z `@/lib/actions/event-settlement` a přidat handler + stav:

```ts
const [amountLocking, setAmountLocking] = useState(false);
const [amountLockError, setAmountLockError] = useState<string | null>(null);

async function handleToggleAmountLock() {
    setAmountLocking(true);
    setAmountLockError(null);
    const res = isPrescribed
        ? await unlockBilling(eventId, { confirmed: true })
        : await lockBilling(eventId);
    if ("error" in res) {
        setAmountLockError(res.error);
    } else {
        const next = isPrescribed ? "draft" : "prescribed";
        onBillingStatusChange?.(next);
        setTreasurerApproved(next === "prescribed"); // auto-souhlas / odvolání ze serveru (Task 4)
        getVyuctovaniActivityLog(eventId).then(setActivityLog);
    }
    setAmountLocking(false);
}
```

UI úpravy v kartě `isPrescribed` (ř. ~3015):

1. **Status řádek**: pro provozní jiný text — `{isProvozni ? "Částky jsou uzamčeny — před odesláním na TJ je nelze měnit. Pro úpravy odemkněte níže." : "Příjmový zámek je aktivní — …"}` (stávající text zmiňuje záložku Vyúčtování, která je u provozního skrytá).
2. **Souhlas hospodáře** (checkbox label blok, ř. ~3023-3047): obalit `{!isProvozni && (…)}`.
3. **EventExpenseActions**: doplnit prop `isProvozni={isProvozni}`.
4. **Nová karta pro draft provozní** — hned nad `isPrescribed` kartu přidat:

```tsx
{isProvozni && !isPrescribed && (
    <div className="rounded-xl border px-4 py-4 space-y-2">
        <p className="text-sm text-gray-700">
            Až budou všechny doklady zadané, uzamkněte částky — tím je připravíte k odeslání na TJ.
        </p>
        <Button size="sm" onClick={handleToggleAmountLock} disabled={amountLocking}>
            {amountLocking ? "…" : "Uzamknout částky"}
        </Button>
        {amountLockError && <p className="text-xs text-red-600">{amountLockError}</p>}
    </div>
)}
```

5. **Odemknout** — do `isPrescribed` karty (pod EventExpenseActions) přidat:

```tsx
{isProvozni && (
    <div className="border-t border-[#327600]/10 pt-3">
        <Button size="sm" variant="outline" onClick={handleToggleAmountLock} disabled={amountLocking}>
            {amountLocking ? "…" : "Odemknout částky"}
        </Button>
        {amountLockError && <p className="text-xs text-red-600 mt-1">{amountLockError}</p>}
    </div>
)}
```

- [ ] **Step 4: event-expense-actions — hláška pro provozní**

`EventExpenseActions` přidat prop `isProvozni?: boolean` (default `false`) a změnit červenou hlášku (ř. ~790):

```tsx
{!treasurerApproved && !sendMessage && (
    <p className="text-xs text-red-600">
        {isProvozni
            ? "Vyúčtování nelze odeslat — nejdřív uzamkněte částky."
            : "Vyúčtování nelze odeslat — hospodář ještě neudělil souhlas s vyúčtováním."}
    </p>
)}
```

- [ ] **Step 5: Ověřit**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/dashboard/events/[id]/"
git commit -m "feat(provoz): detail v režimu provozního výdaje — gate, záložky, zámek částek"
git push
```

---

### Task 7: E2E testy, CI env, dorovnání specu

**Files:**
- Modify: `.github/workflows/tests.yml` (env blok e2e jobu, ř. ~40)
- Modify: `e2e/smoke.spec.ts`
- Modify: `e2e/README.md` (seznam env proměnných)
- Modify: `docs/superpowers/specs/2026-08-05-provozni-vydaje.md`
- Modify: `docs/superpowers/specs/INDEX.md`

**Interfaces:**
- Consumes: route `/dashboard/provoz` (Task 5), gate + detail režim (Task 6), filtr kalendáře (Task 2).
- Produces: CI zeleně projde s `TREASURER_EMAIL` nastaveným na e2e admina; spec odpovídá skutečné implementaci.

- [ ] **Step 1: CI env**

V `.github/workflows/tests.yml` do env bloku e2e jobu (kde je `DATABASE_URL` a `AUTH_SECRET`, ř. 40-42) přidat:

```yaml
      TREASURER_EMAIL: e2e-admin@test.local
```

Do `e2e/README.md` do seznamu env proměnných doplnit řádek: `TREASURER_EMAIL=e2e-admin@test.local — e2e admin je zároveň hospodář (testy sekce Provoz)`.

- [ ] **Step 2: E2E testy**

V `e2e/smoke.spec.ts`:

1. Do pole stránek v testu „stránka … se vykreslí" přidat `"/dashboard/provoz"`.
2. Přidat `import { encode } from "next-auth/jwt";` a nový describe blok:

```ts
test.describe("provozní výdaje", () => {
    test("hospodář založí výdaj; nezobrazí se v kalendáři, zobrazí se v Provozu", async ({ page }) => {
        await page.goto("/dashboard/provoz");
        await expect(page.getByRole("heading", { name: "Provozní výdaje" })).toBeVisible();

        await page.getByRole("button", { name: "Nový provozní výdaj" }).click();
        await page.getByLabel("Název *").fill("E2E oprava vleku");
        await page.getByRole("button", { name: "Založit" }).click();

        // Po založení přesměruje na detail v režimu provozního výdaje
        await expect(page).toHaveURL(/\/dashboard\/events\/\d+/);
        await expect(page.getByRole("heading", { name: "E2E oprava vleku" })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Náklady" })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Přihlášky" })).toHaveCount(0);

        // Nezobrazuje se v kalendáři akcí
        await page.goto(`/dashboard/events?year=${new Date().getFullYear()}`);
        await expect(page.getByText("E2E oprava vleku")).toHaveCount(0);

        // Zobrazuje se v seznamu Provozu
        await page.goto("/dashboard/provoz");
        await expect(page.getByText("E2E oprava vleku").first()).toBeVisible();
    });

    test("ne-hospodář je z /dashboard/provoz přesměrován", async ({ browser, baseURL }) => {
        const secret = process.env.AUTH_SECRET;
        if (!secret) throw new Error("AUTH_SECRET musí být nastaven");
        const token = await encode({
            token: { name: "E2E Ne-hospodář", email: "e2e-nehospodar@test.local", sub: "e2e-nehospodar" },
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
        const page = await context.newPage();
        await page.goto("/dashboard/provoz");
        await expect(page).toHaveURL(/\/dashboard$/);
        await context.close();
    });
});
```

Pozn.: middleware i server actions JWT jen dekódují (viz komentář v `e2e/auth.setup.ts`) — podepsaná cookie pro ne-hospodáře stačí, není třeba ho seedovat do `admin_users`.

- [ ] **Step 3: Spustit E2E lokálně**

Run: dle `e2e/README.md` (lokální testovací DB + `TREASURER_EMAIL=e2e-admin@test.local` v env serveru) `npm run test:e2e`
Expected: PASS včetně obou nových testů. Pokud lokální DB není k dispozici (viz memory o blokovaném portu 5432), ověří se v CI po pushi — v tom případě po pushi zkontrolovat zelený běh `tests.yml`.

- [ ] **Step 4: Dorovnat spec podle skutečné implementace**

V `docs/superpowers/specs/2026-08-05-provozni-vydaje.md`:

1. V sekci „4. Detail" změnit větu o záložkách na: skryté záložky **Přihlášky, Vyúčtování i Platby** — záložka Vyúčtování je čistě participantská (rozpočítávání nákladů na účastníky) a tlačítka výdajové strany (zámek částek, PDF, odeslání na TJ) žijí v záložce **Náklady**; zůstává Detail, Náklady, Audit.
2. V sekci „5. Workflow" doplnit: tlačítka „Uzamknout částky"/„Odemknout částky" jsou v záložce Náklady (záložka Platby s původním zámkem je u provozního skrytá); odemčení automaticky odvolá souhlas hospodáře.
3. V sekci „7. Testy" nahradit „Unit test filtru seznamu akcí" za: filtr kalendáře pokrývá E2E asercí (DB dotaz nejde unit-testovat); unit test má čistý modul `deriveProvozniStav` (`src/lib/provoz-status.test.ts`).
4. Frontmatter `status: zgrilovano` → `status: implementace`; stejně upravit stav v `INDEX.md` (řádek tabulky + položka 9 backlogu → přesun do „V realizaci" s odkazem na větev `feat/2026-08-05-provozni-vydaje`).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/tests.yml e2e/smoke.spec.ts e2e/README.md docs/superpowers/specs/2026-08-05-provozni-vydaje.md docs/superpowers/specs/INDEX.md
git commit -m "test(provoz): E2E smoke sekce Provoz + gate; spec dorovnán na implementaci"
git push
```

---

## Po dokončení všech tasků

1. Whole-branch review (superpowers:requesting-code-review) nad celým diffem `feat/2026-08-05-provozni-vydaje` vs `staging`.
2. PR `feat/2026-08-05-provozni-vydaje → staging` (ne přímý push). Migrace `20260805_180000_event_type_provozni.sql` bude viditelná v PR diffu; po mergi ji na staging DB aplikuje `db-migrate-staging.yml`.
3. UAT na staging preview: založit provozní výdaj, nahrát doklad, uzamknout částky, ověřit stav v seznamu; přepnout akci 48 „Oprava vleku" na typ provozní jedním SQL updatem na staging DB (`UPDATE app.events SET event_type = 'provozni' WHERE id = 48;`) a ověřit, že zmizela z kalendáře a objevila se v Provozu.
4. Po UAT: spec `status: staging-uat` → `schvaleno`, PR `staging → main`. **Ověřit, že `TREASURER_EMAIL` je nastaven ve Vercel Production i Preview** — bez něj se sekce Provoz nezobrazí nikomu (fail-safe).
