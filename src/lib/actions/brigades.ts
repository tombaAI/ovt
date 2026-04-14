"use server";

import { getDb } from "@/lib/db";
import { brigades, brigadeMembers, members } from "@/db/schema";
import { eq, asc, inArray, and } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

// ── Types ────────────────────────────────────────────────────────────────────

export type BrigadeRow = {
    id: number;
    date: string;
    year: number;
    name: string | null;
    leaderId: number | null;
    leaderName: string | null;
    note: string | null;
    memberCount: number;
};

export type BrigadeMemberRow = {
    brigadeId: number;
    memberId: number;
    firstName: string;
    lastName: string;
    note: string | null;
};

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getBrigades(year: number): Promise<BrigadeRow[]> {
    const db = getDb();

    const rows = await db
        .select({
            id:         brigades.id,
            date:       brigades.date,
            year:       brigades.year,
            name:       brigades.name,
            leaderId:   brigades.leaderId,
            leaderName: members.fullName,
            note:       brigades.note,
        })
        .from(brigades)
        .leftJoin(members, eq(brigades.leaderId, members.id))
        .where(eq(brigades.year, year))
        .orderBy(asc(brigades.date));

    if (rows.length === 0) return [];

    const brigadeIds = rows.map(r => r.id);
    const counts = await db
        .select({ brigadeId: brigadeMembers.brigadeId })
        .from(brigadeMembers)
        .where(inArray(brigadeMembers.brigadeId, brigadeIds));

    const countMap = counts.reduce((acc, r) => {
        acc[r.brigadeId] = (acc[r.brigadeId] ?? 0) + 1;
        return acc;
    }, {} as Record<number, number>);

    return rows.map(r => ({
        ...r,
        date: r.date as unknown as string,
        memberCount: countMap[r.id] ?? 0,
    }));
}

export async function getBrigadeMembers(brigadeId: number): Promise<BrigadeMemberRow[]> {
    const db = getDb();

    const rows = await db
        .select({
            brigadeId: brigadeMembers.brigadeId,
            memberId:  brigadeMembers.memberId,
            firstName: members.firstName,
            lastName:  members.lastName,
            note:      brigadeMembers.note,
        })
        .from(brigadeMembers)
        .innerJoin(members, eq(brigadeMembers.memberId, members.id))
        .where(eq(brigadeMembers.brigadeId, brigadeId))
        .orderBy(asc(members.lastName), asc(members.firstName));

    return rows;
}

/** Vrátí Set memberIds, kteří mají alespoň jednu brigádu v daném roce */
export async function getBrigadeMemberIdsByYear(year: number): Promise<Set<number>> {
    const db = getDb();

    const rows = await db
        .select({ memberId: brigadeMembers.memberId })
        .from(brigadeMembers)
        .innerJoin(brigades, eq(brigadeMembers.brigadeId, brigades.id))
        .where(eq(brigades.year, year));

    return new Set(rows.map(r => r.memberId));
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function createBrigade(data: {
    date: string;
    year: number;
    name: string | null;
    leaderId: number | null;
    note: string | null;
    initialMemberIds: number[];
}): Promise<{ id: number }> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    const [brigade] = await db
        .insert(brigades)
        .values({
            date:      data.date,
            year:      data.year,
            name:      data.name,
            leaderId:  data.leaderId,
            note:      data.note,
            createdBy: session.user.email,
        })
        .returning({ id: brigades.id });

    if (data.initialMemberIds.length > 0) {
        await db.insert(brigadeMembers).values(
            data.initialMemberIds.map(memberId => ({
                brigadeId: brigade.id,
                memberId,
                createdAt: new Date(),
            }))
        );
    }

    revalidatePath("/dashboard/brigades");
    revalidatePath("/dashboard/members");
    return { id: brigade.id };
}

export async function updateBrigade(id: number, data: {
    date: string;
    year: number;
    name: string | null;
    leaderId: number | null;
    note: string | null;
}): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    await db
        .update(brigades)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(brigades.id, id));

    revalidatePath("/dashboard/brigades");
    revalidatePath("/dashboard/members");
}

export async function deleteBrigade(id: number): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    // brigade_members se smaže kaskádou
    await db.delete(brigades).where(eq(brigades.id, id));

    revalidatePath("/dashboard/brigades");
    revalidatePath("/dashboard/members");
}

export async function addBrigadeMember(brigadeId: number, memberId: number): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    await db
        .insert(brigadeMembers)
        .values({ brigadeId, memberId })
        .onConflictDoNothing();

    revalidatePath("/dashboard/brigades");
    revalidatePath("/dashboard/members");
}

export async function removeBrigadeMember(brigadeId: number, memberId: number): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    await db
        .delete(brigadeMembers)
        .where(and(
            eq(brigadeMembers.brigadeId, brigadeId),
            eq(brigadeMembers.memberId, memberId),
        ));

    revalidatePath("/dashboard/brigades");
    revalidatePath("/dashboard/members");
}
