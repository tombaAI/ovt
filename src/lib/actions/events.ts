"use server";

import { getDb } from "@/lib/db";
import { events, members } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
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
