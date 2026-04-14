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
