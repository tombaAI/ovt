"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { members, tjMembers, auditLog } from "@/db/schema";
import type { SyncUpdatableField } from "@/lib/sync-config";

export type SyncActionResult = { error: string } | { success: true };
export type { SyncUpdatableField };

// ── importFromTj ──────────────────────────────────────────────────────────────
// Vytvoří nový members záznam z dat tj_members

export async function importFromTj(tjMemberId: number): Promise<SyncActionResult> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "sync";
    const db = getDb();

    const [tj] = await db.select().from(tjMembers).where(eq(tjMembers.id, tjMemberId));
    if (!tj) return { error: "TJ člen nenalezen" };

    const fullName = [tj.jmeno, tj.prijmeni].filter(Boolean).join(" ").trim();
    if (!fullName) return { error: "Chybí jméno" };

    const [{ nextId }] = await db.select({
        nextId: sql<number>`coalesce(max(${members.id}), 0) + 1`
    }).from(members);

    const memberFrom = (tj.radekOdeslan as unknown as string) ?? new Date().toISOString().split("T")[0];

    await db.insert(members).values({
        id:          nextId,
        fullName,
        nickname:    tj.nickname,
        email:       tj.email,
        phone:       tj.phone,
        birthDate:   tj.birthDate,
        birthNumber: tj.birthNumber,
        gender:      tj.gender,
        address:     tj.address,
        cskNumber:   tj.cskNumber,
        memberFrom,
    });

    await db.insert(auditLog).values({
        entityType: "member",
        entityId:   nextId,
        action:     "import_from_tj",
        changes:    { source: { old: null, new: `tj_members#${tjMemberId}` } },
        changedBy,
    });

    revalidatePath("/dashboard/sync");
    revalidatePath("/dashboard/members");
    return { success: true };
}

// ── updateMemberFieldFromTj ────────────────────────────────────────────────────
// Přepíše jedno pole v members hodnotou z tj_members

export async function updateMemberFieldFromTj(
    memberId: number,
    field: SyncUpdatableField,
    value: string | null
): Promise<SyncActionResult> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "sync";
    const db = getDb();

    const [current] = await db.select().from(members).where(eq(members.id, memberId));
    if (!current) return { error: "Člen nenalezen" };

    const oldValue = String(current[field] ?? "");
    const newValue = value ?? null;

    await db.update(members)
        .set({ [field]: newValue, updatedAt: new Date() })
        .where(eq(members.id, memberId));

    await db.insert(auditLog).values({
        entityType: "member",
        entityId:   memberId,
        action:     "update_from_tj",
        changes:    { [field]: { old: oldValue || null, new: newValue } },
        changedBy,
    });

    revalidatePath("/dashboard/sync");
    revalidatePath("/dashboard/members");
    return { success: true };
}
