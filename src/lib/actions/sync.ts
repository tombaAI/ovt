"use server";

import { eq, sql, or, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { members, importMembersTjBohemians, auditLog } from "@/db/schema";
import type { SyncUpdatableField } from "@/lib/sync-config";
import { SYNC_UPDATABLE_FIELDS } from "@/lib/sync-config";

export type SyncActionResult = { error: string } | { success: true };
export type { SyncUpdatableField };

export type TjDiff = {
    field:    SyncUpdatableField;
    label:    string;
    ourValue: string | null;
    tjValue:  string | null;
};

// ── getMemberTjDiffs ──────────────────────────────────────────────────────────
// Vrátí odlišnosti mezi importem TJ a naším záznamem pro daného člena.
// Párování: nejdřív ČSK, pak jméno.

function asStr(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    return String(v);
}

export async function getMemberTjDiffs(memberId: number): Promise<TjDiff[]> {
    const db = getDb();
    const [m] = await db.select().from(members).where(eq(members.id, memberId));
    if (!m) return [];

    // Najdi TJ záznam: nejdřív přes ČSK, pak přes jméno
    let tj: typeof importMembersTjBohemians.$inferSelect | undefined;
    if (m.cskNumber) {
        [tj] = await db.select().from(importMembersTjBohemians)
            .where(eq(importMembersTjBohemians.cskNumber, m.cskNumber));
    }
    if (!tj) {
        const nameLower = `${m.firstName} ${m.lastName}`.trim().toLowerCase();
        const all = await db.select().from(importMembersTjBohemians)
            .where(or(isNull(importMembersTjBohemians.cskNumber)));
        tj = all.find(r =>
            [r.jmeno, r.prijmeni].filter(Boolean).join(" ").trim().toLowerCase() === nameLower
        );
    }
    if (!tj) return [];

    const comparisons: Array<[SyncUpdatableField, unknown, unknown]> = [
        ["firstName",   tj.jmeno,       m.firstName],
        ["lastName",    tj.prijmeni,    m.lastName],
        ["email",       tj.email,       m.email],
        ["phone",       tj.phone,       m.phone],
        ["address",     tj.address,     m.address],
        ["birthDate",   tj.birthDate,   m.birthDate],
        ["birthNumber", tj.birthNumber, m.birthNumber],
        ["gender",      tj.gender,      m.gender],
        ["nickname",    tj.nickname,    m.nickname],
        ["cskNumber",   tj.cskNumber,   m.cskNumber],
    ];

    return comparisons
        .filter(([, tjVal, mVal]) => asStr(tjVal) !== asStr(mVal))
        .map(([field, tjVal, mVal]) => ({
            field,
            label:    SYNC_UPDATABLE_FIELDS[field],
            ourValue: asStr(mVal),
            tjValue:  asStr(tjVal),
        }));
}

// ── deleteImportRow ────────────────────────────────────────────────────────────
// Smaže stale záznam z import tabulky (např. duplicit bez ČSK po opravě jména)

export async function deleteImportRow(tjMemberId: number): Promise<SyncActionResult> {
    await auth();
    const db = getDb();
    const result = await db.delete(importMembersTjBohemians).where(eq(importMembersTjBohemians.id, tjMemberId));
    if (!result) return { error: "Záznam nenalezen" };
    revalidatePath("/dashboard/imports/members-tj");
    return { success: true };
}

// ── importFromTj ──────────────────────────────────────────────────────────────
// Vytvoří nový members záznam z dat tj_members

export async function importFromTj(tjMemberId: number): Promise<SyncActionResult> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "sync";
    const db = getDb();

    const [tj] = await db.select().from(importMembersTjBohemians).where(eq(importMembersTjBohemians.id, tjMemberId));
    if (!tj) return { error: "TJ člen nenalezen" };

    const firstName = (tj.jmeno  ?? "").trim();
    const lastName  = (tj.prijmeni ?? "").trim();
    if (!firstName && !lastName) return { error: "Chybí jméno" };

    const [{ nextId }] = await db.select({
        nextId: sql<number>`coalesce(max(${members.id}), 0) + 1`
    }).from(members);

    const memberFrom = (tj.radekOdeslan as unknown as string) ?? new Date().toISOString().split("T")[0];

    await db.insert(members).values({
        id:          nextId,
        firstName,
        lastName,
        fullName:    [firstName, lastName].filter(Boolean).join(" "),
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
        changes:    { source: { old: null, new: `import_members_tj_bohemians#${tjMemberId}` } },
        changedBy,
    });

    revalidatePath("/dashboard/imports/members-tj");
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

    const oldValue = String(current[field as keyof typeof current] ?? "");
    const newValue = value ?? null;

    const patch: Record<string, unknown> = { [field]: newValue, updatedAt: new Date() };
    if (field === "firstName") patch.fullName = `${newValue ?? ""} ${current.lastName}`.trim();
    if (field === "lastName")  patch.fullName = `${current.firstName} ${newValue ?? ""}`.trim();

    await db.update(members).set(patch as Parameters<ReturnType<typeof db.update>["set"]>[0]).where(eq(members.id, memberId));

    await db.insert(auditLog).values({
        entityType: "member",
        entityId:   memberId,
        action:     "update_from_tj",
        changes:    { [field]: { old: oldValue || null, new: newValue } },
        changedBy,
    });

    revalidatePath("/dashboard/imports/members-tj");
    revalidatePath("/dashboard/members");
    return { success: true };
}
