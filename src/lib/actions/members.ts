"use server";

import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods, auditLog } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { CONTRIBUTION_YEAR } from "@/lib/constants";
import { FIELD_LABELS } from "@/lib/member-fields";

export type MemberFormState = { error: string } | { success: true } | null;

export type AuditEntry = {
    id: number;
    action: string;
    changes: Record<string, { old: string | null; new: string | null }>;
    changedBy: string;
    changedAt: Date;
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function str(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean") return v ? "Ano" : "Ne";
    return String(v);
}

function diffObjects(
    prev: Record<string, unknown>,
    next: Record<string, unknown>
): Record<string, { old: string | null; new: string | null }> {
    const changes: Record<string, { old: string | null; new: string | null }> = {};
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const k of keys) {
        const o = str(prev[k]);
        const n = str(next[k]);
        if (o !== n) changes[k] = { old: o, new: n };
    }
    return changes;
}

// ── saveMember ───────────────────────────────────────────────────────────────
export async function saveMember(
    prevState: MemberFormState,
    formData: FormData
): Promise<MemberFormState> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    const fullName = (formData.get("full_name") as string)?.trim();
    if (!fullName) return { error: "Jméno je povinné" };

    const idRaw = formData.get("id") as string;

    const memberData = {
        fullName,
        userLogin:      (formData.get("user_login") as string)?.trim()  || null,
        email:          (formData.get("email") as string)?.trim()        || null,
        phone:          (formData.get("phone") as string)?.trim()        || null,
        variableSymbol: Number(formData.get("variable_symbol")) || null,
        cskNumber:      Number(formData.get("csk_number"))      || null,
        isActive:       formData.get("is_active") === "on",
        note:           (formData.get("note") as string)?.trim()         || null,
    };

    try {
        if (idRaw) {
            // ── UPDATE ────────────────────────────────────────────────────
            const id = Number(idRaw);

            const [current] = await db.select().from(members).where(eq(members.id, id));
            if (!current) return { error: "Člen nenalezen" };

            await db.update(members)
                .set({ ...memberData, updatedAt: new Date() })
                .where(eq(members.id, id));

            // Basic field audit
            const memberChanges = diffObjects(
                {
                    fullName:       current.fullName,
                    userLogin:      current.userLogin,
                    email:          current.email,
                    phone:          current.phone,
                    variableSymbol: current.variableSymbol,
                    cskNumber:      current.cskNumber,
                    isActive:       current.isActive,
                    note:           current.note,
                },
                memberData
            );

            // Current year contribution flags
            const [period] = await db.select()
                .from(contributionPeriods)
                .where(eq(contributionPeriods.year, CONTRIBUTION_YEAR));

            if (period) {
                const [contrib] = await db.select()
                    .from(memberContributions)
                    .where(and(
                        eq(memberContributions.memberId, id),
                        eq(memberContributions.periodId, period.id)
                    ));

                if (contrib) {
                    const isCommittee = formData.get("is_committee") === "on";
                    const isTom       = formData.get("is_tom") === "on";
                    const indRaw      = formData.get("individual_discount");
                    const indAmount   = indRaw ? Math.abs(Number(indRaw)) : 0;

                    const newDiscCommittee  = isCommittee ? -period.discountCommittee : null;
                    const newDiscTom        = isTom       ? -period.discountTom       : null;
                    const newDiscIndividual = indAmount   ? -indAmount                : null;

                    await db.update(memberContributions).set({
                        discountCommittee:  newDiscCommittee,
                        discountTom:        newDiscTom,
                        discountIndividual: newDiscIndividual,
                    }).where(eq(memberContributions.id, contrib.id));

                    // Audit contribution flag changes
                    const flagChanges = diffObjects(
                        {
                            isCommittee:        Boolean(contrib.discountCommittee),
                            isTom:              Boolean(contrib.discountTom),
                            discountIndividual: contrib.discountIndividual
                                ? Math.abs(contrib.discountIndividual)
                                : null,
                        },
                        {
                            isCommittee:        isCommittee,
                            isTom:              isTom,
                            discountIndividual: indAmount || null,
                        }
                    );
                    Object.assign(memberChanges, flagChanges);
                }
            }

            if (Object.keys(memberChanges).length > 0) {
                await db.insert(auditLog).values({
                    entityType: "member",
                    entityId:   id,
                    action:     "update",
                    changes:    memberChanges,
                    changedBy,
                });
            }
        } else {
            // ── CREATE ────────────────────────────────────────────────────
            const [{ nextId }] = await db.select({
                nextId: sql<number>`coalesce(max(${members.id}), 0) + 1`
            }).from(members);

            await db.insert(members).values({ id: nextId, ...memberData });

            await db.insert(auditLog).values({
                entityType: "member",
                entityId:   nextId,
                action:     "create",
                changes:    Object.fromEntries(
                    Object.entries(memberData).map(([k, v]) => [k, { old: null, new: str(v) }])
                ),
                changedBy,
            });
        }

        revalidatePath("/dashboard/members");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání. Zkus to znovu." };
    }
}

// ── getMemberAuditLog ────────────────────────────────────────────────────────
export async function getMemberAuditLog(memberId: number): Promise<AuditEntry[]> {
    const db = getDb();
    const rows = await db.select()
        .from(auditLog)
        .where(and(
            eq(auditLog.entityType, "member"),
            eq(auditLog.entityId, memberId)
        ))
        .orderBy(desc(auditLog.changedAt))
        .limit(50);

    return rows.map(r => ({
        id:        r.id,
        action:    r.action,
        changes:   r.changes as AuditEntry["changes"],
        changedBy: r.changedBy,
        changedAt: r.changedAt,
    }));
}

