"use server";

import { getDb } from "@/lib/db";
import { boats, members } from "@/db/schema";
import { eq, isNull, isNotNull, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

// ── Types ────────────────────────────────────────────────────────────────────

export type BoatRow = {
    id: number;
    ownerId: number | null;
    ownerName: string | null;
    description: string | null;
    color: string | null;
    grid: string | null;
    position: number | null;
    isPresent: boolean;
    storedFrom: string | null;
    storedTo: string | null;
    note: string | null;
};

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getBoats(includeArchived = false): Promise<BoatRow[]> {
    const db = getDb();

    const query = db
        .select({
            id:          boats.id,
            ownerId:     boats.ownerId,
            ownerName:   members.fullName,
            description: boats.description,
            color:       boats.color,
            grid:        boats.grid,
            position:    boats.position,
            isPresent:   boats.isPresent,
            storedFrom:  boats.storedFrom,
            storedTo:    boats.storedTo,
            note:        boats.note,
        })
        .from(boats)
        .leftJoin(members, eq(boats.ownerId, members.id))
        .$dynamic();

    const filtered = includeArchived
        ? query.where(isNotNull(boats.storedTo))
        : query.where(isNull(boats.storedTo));

    const rows = await filtered.orderBy(
        sql`${boats.grid} ASC NULLS LAST`,
        sql`${boats.position} ASC NULLS LAST`,
        sql`${members.lastName} ASC NULLS LAST`,
        sql`${members.firstName} ASC NULLS LAST`,
    );

    return rows.map(r => ({
        ...r,
        storedFrom: r.storedFrom as unknown as string | null,
        storedTo:   r.storedTo as unknown as string | null,
    }));
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function createBoat(data: {
    ownerId: number | null;
    description: string | null;
    color: string | null;
    grid: string | null;
    position: number | null;
    isPresent: boolean;
    storedFrom: string | null;
    note: string | null;
}): Promise<{ id: number }> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    const [boat] = await db
        .insert(boats)
        .values({
            ownerId:     data.ownerId,
            description: data.description,
            color:       data.color,
            grid:        data.grid,
            position:    data.position,
            isPresent:   data.isPresent,
            storedFrom:  data.storedFrom,
            storedTo:    null,
            note:        data.note,
            createdBy:   session.user.email,
        })
        .returning({ id: boats.id });

    revalidatePath("/dashboard/boats");
    return { id: boat.id };
}

export async function updateBoat(id: number, data: {
    ownerId: number | null;
    description: string | null;
    color: string | null;
    grid: string | null;
    position: number | null;
    isPresent: boolean;
    storedFrom: string | null;
    storedTo: string | null;
    note: string | null;
}): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    await db
        .update(boats)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(boats.id, id));

    revalidatePath("/dashboard/boats");
}

export async function deleteBoat(id: number): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    await db.delete(boats).where(eq(boats.id, id));

    revalidatePath("/dashboard/boats");
}
