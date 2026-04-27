"use server";

import { getDb } from "@/lib/db";
import { events, members, auditLog } from "@/db/schema";
import { eq, asc, desc, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import type { EventType, EventStatus, EventSource } from "@/db/schema";

export type { EventType, EventStatus, EventSource };

// ── Types ────────────────────────────────────────────────────────────────────

export type EventRow = {
    id: number;
    year: number;
    name: string;
    eventType: EventType;
    dateFrom: string | null;
    dateTo: string | null;
    approxMonth: number | null;
    location: string | null;
    leaderId: number | null;
    leaderName: string | null;
    status: EventStatus;
    description: string | null;
    externalUrl: string | null;
    source: EventSource;
    gcalEventId: string | null;
    gcalSync: boolean;
    gcalSyncedAt: Date | null;
    note: string | null;
    updatedAt: Date | null;
};

export type EventFormData = {
    year: number;
    name: string;
    eventType: EventType;
    dateFrom: string | null;
    dateTo: string | null;
    approxMonth: number | null;
    location: string | null;
    leaderId: number | null;
    status: EventStatus;
    description: string | null;
    externalUrl: string | null;
    gcalSync: boolean;
    note: string | null;
};

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getEvents(year: number): Promise<EventRow[]> {
    const db = getDb();

    const rows = await db
        .select({
            id:           events.id,
            year:         events.year,
            name:         events.name,
            eventType:    events.eventType,
            dateFrom:     events.dateFrom,
            dateTo:       events.dateTo,
            approxMonth:  events.approxMonth,
            location:     events.location,
            leaderId:     events.leaderId,
            leaderName:   members.fullName,
            status:       events.status,
            description:  events.description,
            externalUrl:  events.externalUrl,
            source:       events.source,
            gcalEventId:  events.gcalEventId,
            gcalSync:     events.gcalSync,
            gcalSyncedAt: events.gcalSyncedAt,
            note:         events.note,
            updatedAt:    events.updatedAt,
        })
        .from(events)
        .leftJoin(members, eq(events.leaderId, members.id))
        .where(eq(events.year, year))
        .orderBy(asc(events.dateFrom), asc(events.approxMonth), asc(events.name));

    return rows.map(r => ({
        ...r,
        year:        Number(r.year),
        dateFrom:    r.dateFrom  as unknown as string | null,
        dateTo:      r.dateTo    as unknown as string | null,
        approxMonth: r.approxMonth ? Number(r.approxMonth) : null,
    }));
}

export async function getEventById(id: number): Promise<EventRow | null> {
    const db = getDb();
    const rows = await db
        .select({
            id:           events.id,
            year:         events.year,
            name:         events.name,
            eventType:    events.eventType,
            dateFrom:     events.dateFrom,
            dateTo:       events.dateTo,
            approxMonth:  events.approxMonth,
            location:     events.location,
            leaderId:     events.leaderId,
            leaderName:   members.fullName,
            status:       events.status,
            description:  events.description,
            externalUrl:  events.externalUrl,
            source:       events.source,
            gcalEventId:  events.gcalEventId,
            gcalSync:     events.gcalSync,
            gcalSyncedAt: events.gcalSyncedAt,
            note:         events.note,
            updatedAt:    events.updatedAt,
        })
        .from(events)
        .leftJoin(members, eq(events.leaderId, members.id))
        .where(eq(events.id, id))
        .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0]!;
    return {
        ...r,
        year:        Number(r.year),
        dateFrom:    r.dateFrom  as unknown as string | null,
        dateTo:      r.dateTo    as unknown as string | null,
        approxMonth: r.approxMonth ? Number(r.approxMonth) : null,
    };
}

export async function getEventYears(): Promise<number[]> {
    const db = getDb();
    const rows = await db
        .select({ year: sql<number>`distinct ${events.year}` })
        .from(events)
        .orderBy(desc(events.year));

    const current = new Date().getFullYear();
    const dbYears = rows.map(r => Number(r.year));
    const all = new Set([...dbYears, current, current + 1]);
    return Array.from(all).sort((a, b) => b - a);
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function createEvent(data: EventFormData): Promise<{ id: number }> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    const [event] = await db
        .insert(events)
        .values({
            year:        data.year,
            name:        data.name,
            eventType:   data.eventType,
            dateFrom:    data.dateFrom ?? undefined,
            dateTo:      data.dateTo ?? undefined,
            approxMonth: data.approxMonth ?? undefined,
            location:    data.location ?? undefined,
            leaderId:    data.leaderId ?? undefined,
            status:      data.status,
            description: data.description ?? undefined,
            externalUrl: data.externalUrl ?? undefined,
            gcalSync:    data.gcalSync,
            note:        data.note ?? undefined,
            createdBy:   session.user.email,
        })
        .returning({ id: events.id });

    revalidatePath("/dashboard/events");
    return { id: event.id };
}

export async function updateEvent(id: number, data: EventFormData): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    await db
        .update(events)
        .set({
            year:        data.year,
            name:        data.name,
            eventType:   data.eventType,
            dateFrom:    data.dateFrom ?? null,
            dateTo:      data.dateTo ?? null,
            approxMonth: data.approxMonth ?? null,
            location:    data.location ?? null,
            leaderId:    data.leaderId ?? null,
            status:      data.status,
            description: data.description ?? null,
            externalUrl: data.externalUrl ?? null,
            gcalSync:    data.gcalSync,
            note:        data.note ?? null,
            updatedAt:   new Date(),
        })
        .where(eq(events.id, id));

    revalidatePath("/dashboard/events");
}

export async function deleteEvent(id: number): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    await db.delete(events).where(eq(events.id, id));

    revalidatePath("/dashboard/events");
}

export async function copyEventsFromYear(fromYear: number, toYear: number): Promise<{ count: number }> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();

    const source = await db
        .select()
        .from(events)
        .where(eq(events.year, fromYear))
        .orderBy(asc(events.dateFrom), asc(events.approxMonth));

    if (source.length === 0) return { count: 0 };

    const toInsert = source.map(e => ({
        year:        toYear,
        name:        e.name,
        eventType:   e.eventType,
        dateFrom:    null as string | null,       // nový rok = termíny zatím neznámé
        dateTo:      null as string | null,
        approxMonth: e.approxMonth ?? undefined,  // orientační měsíc zachováme
        location:    e.location ?? undefined,
        leaderId:    null as number | null,        // vedoucí se určí nově
        status:      "planned" as const,
        description: e.description ?? undefined,
        externalUrl: e.externalUrl ?? undefined,
        gcalSync:    false,
        note:        null as string | null,
        createdBy:   session.user!.email!,
    }));

    await db.insert(events).values(toInsert);

    revalidatePath("/dashboard/events");
    return { count: toInsert.length };
}

// ── Google Calendar sync ──────────────────────────────────────────────────────

/**
 * Pushne akci do Google Kalendáře (vytvoří nebo aktualizuje).
 * Akce musí mít nastaven dateFrom, jinak vrátí chybu.
 * Uloží gcal_event_id a gcal_synced_at do DB.
 */
export async function syncEventToGcal(id: number): Promise<{ gcalEventId: string }> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!event) throw new Error("Akce nenalezena");
    if (!event.dateFrom) throw new Error("Akce nemá nastaven termín — nelze synchronizovat do Google Kalendáře");

    const { upsertGcalEvent } = await import("@/lib/gcal");

    const gcalId = await upsertGcalEvent(event.gcalEventId, {
        summary:     event.name,
        description: event.description,
        location:    event.location,
        dateFrom:    event.dateFrom as unknown as string,
        dateTo:      event.dateTo   as unknown as string | null,
        externalUrl: event.externalUrl,
    });

    await db
        .update(events)
        .set({ gcalEventId: gcalId, gcalSync: true, gcalSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(events.id, id));

    revalidatePath("/dashboard/events");
    return { gcalEventId: gcalId };
}

/**
 * Odstraní akci z Google Kalendáře a vymaže gcal_event_id z DB.
 */
export async function removeEventFromGcal(id: number): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!event?.gcalEventId) return; // není v GCal, nic neděláme

    const { deleteGcalEvent } = await import("@/lib/gcal");
    await deleteGcalEvent(event.gcalEventId);

    await db
        .update(events)
        .set({ gcalEventId: null, gcalSync: false, gcalSyncedAt: null, updatedAt: new Date() })
        .where(eq(events.id, id));

    revalidatePath("/dashboard/events");
}

/**
 * Načte seznam eventů z Google Kalendáře pro daný rok.
 * Slouží pro manuální preview/import — nic neukládá do DB.
 */
export async function fetchGcalEvents(year: number) {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const { listGcalEvents } = await import("@/lib/gcal");
    return listGcalEvents(year, year);
}

export type GcalImportItem = {
    gcalEventId: string;
    summary: string;
    dateFrom: string | null;
    dateTo: string | null;
    location: string | null;
};

/**
 * Importuje vybrané GCal eventy jako nové akce do DB.
 * Eventy s existujícím gcal_event_id se přeskočí (idempotentní).
 * Vrátí počet skutečně vložených záznamů.
 */
export async function importGcalEvents(
    year: number,
    items: GcalImportItem[],
): Promise<{ imported: number; skipped: number }> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    if (items.length === 0) return { imported: 0, skipped: 0 };

    const db = getDb();

    // Načti stávající gcal_event_id pro daný rok — přeskočíme duplicity
    const existing = await db
        .select({ gcalEventId: events.gcalEventId })
        .from(events)
        .where(eq(events.year, year));
    const existingIds = new Set(existing.map(r => r.gcalEventId).filter(Boolean));

    const toInsert = items.filter(i => !existingIds.has(i.gcalEventId));
    if (toInsert.length === 0) return { imported: 0, skipped: items.length };

    await db.insert(events).values(
        toInsert.map(i => ({
            year,
            name:        i.summary,
            eventType:   "other" as const,
            dateFrom:    i.dateFrom ?? undefined,
            dateTo:      i.dateTo   ?? undefined,
            location:    i.location ?? undefined,
            status:      "planned"  as const,
            source:      "google_calendar" as const,
            gcalEventId: i.gcalEventId,
            gcalSync:    true,
            gcalSyncedAt: new Date(),
            createdBy:   session.user!.email!,
        }))
    );

    revalidatePath("/dashboard/events");
    return { imported: toInsert.length, skipped: items.length - toInsert.length };
}

// ── Inline field update + audit ───────────────────────────────────────────────

const ALLOWED_EVENT_FIELDS = new Set([
    "name", "eventType", "dateFrom", "dateTo", "approxMonth",
    "location", "leaderId", "status", "description", "externalUrl",
    "gcalSync", "note",
]);

export type EventAuditEntry = {
    id: number;
    action: string;
    changes: Record<string, { old: string | null; new: string | null }>;
    changedBy: string;
    changedAt: Date;
};

export async function updateEventField(
    id: number,
    field: string,
    value: string | null,
): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");
    if (!ALLOWED_EVENT_FIELDS.has(field)) throw new Error(`Nepovolené pole: ${field}`);

    const db = getDb();
    const [before] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!before) throw new Error("Akce nenalezena");

    // Přetypování hodnoty podle pole
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updatedAt: new Date() };
    if (field === "approxMonth" || field === "leaderId") {
        update[field] = value !== null && value !== "" ? Number(value) : null;
    } else if (field === "gcalSync") {
        update[field] = value === "true";
    } else {
        update[field] = value !== null && value !== "" ? value : null;
    }

    await db.update(events).set(update).where(eq(events.id, id));

    // Audit
    const oldVal = String((before as Record<string, unknown>)[field] ?? "");
    const newVal = String(update[field] ?? "");
    if (oldVal !== newVal) {
        await db.insert(auditLog).values({
            entityType: "event",
            entityId:   id,
            action:     "update_field",
            changes:    { [field]: { old: oldVal || null, new: newVal || null } },
            changedBy:  session.user.email,
        });
    }

    revalidatePath("/dashboard/events");
}

export async function getEventAuditLog(id: number): Promise<EventAuditEntry[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, id))
        .orderBy(desc(auditLog.changedAt))
        .limit(50);
    return rows.filter(r => r.entityType === "event") as EventAuditEntry[];
}

// ── GCal diff ─────────────────────────────────────────────────────────────────

export type GcalDiffField = {
    field: string;        // klíč v DB
    label: string;        // čitelný název
    appValue: string | null;
    gcalValue: string | null;
    match: boolean;
};

export type GcalDiffResult =
    | { gcalExists: false }
    | { gcalExists: true; fields: GcalDiffField[]; gcalUpdatedAt: string | null };

export async function getEventGcalDiff(id: number): Promise<GcalDiffResult> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!event?.gcalEventId) return { gcalExists: false };

    const { fetchGcalEventById } = await import("@/lib/gcal");
    const gcal = await fetchGcalEventById(event.gcalEventId);
    if (!gcal) return { gcalExists: false };

    const fields: GcalDiffField[] = [
        {
            field:     "name",
            label:     "Název",
            appValue:  event.name,
            gcalValue: gcal.summary,
            match:     event.name === gcal.summary,
        },
        {
            field:     "dateFrom",
            label:     "Datum od",
            appValue:  event.dateFrom as unknown as string | null,
            gcalValue: gcal.dateFrom,
            match:     (event.dateFrom as unknown as string | null) === gcal.dateFrom,
        },
        {
            field:     "dateTo",
            label:     "Datum do",
            appValue:  event.dateTo as unknown as string | null,
            gcalValue: gcal.dateTo,
            match:     (event.dateTo as unknown as string | null) === gcal.dateTo,
        },
        {
            field:     "location",
            label:     "Místo",
            appValue:  event.location,
            gcalValue: gcal.location,
            match:     (event.location ?? null) === (gcal.location ?? null),
        },
        (() => {
            // GCal description = appDescription + "\n\nOdkaz: url" — stripujeme URL suffix
            const gcalRaw = gcal.description?.trim() ?? null;
            const url = event.externalUrl;
            const gcalDesc = gcalRaw && url && gcalRaw.includes(`\n\nOdkaz: ${url}`)
                ? (gcalRaw.replace(`\n\nOdkaz: ${url}`, "").trim() || null)
                : gcalRaw;
            const appDesc = event.description?.trim() || null;
            return {
                field:     "description",
                label:     "Popis",
                appValue:  appDesc,
                gcalValue: gcalDesc,
                match:     appDesc === gcalDesc,
            };
        })(),
    ];

    return { gcalExists: true, fields, gcalUpdatedAt: gcal.updatedAt };
}

/**
 * Přijme hodnotu konkrétního pole z GCal do DB (jednosměrně GCal → app).
 */
export async function acceptGcalField(id: number, field: string, gcalValue: string | null): Promise<void> {
    await updateEventField(id, field, gcalValue);

    // Přidej audit záznam označující zdroj
    const session = await auth();
    const db = getDb();
    await db.insert(auditLog).values({
        entityType: "event",
        entityId:   id,
        action:     "accept_from_gcal",
        changes:    { [field]: { old: null, new: gcalValue } },
        changedBy:  session?.user?.email ?? "unknown",
    }).onConflictDoNothing();

    revalidatePath("/dashboard/events");
}
