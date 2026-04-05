"use server";

import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods, membershipYears, auditLog } from "@/db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { CONTRIBUTION_YEAR } from "@/lib/constants";

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

            // Auto-enroll in the current contribution year
            await db.insert(membershipYears).values({ memberId: nextId, year: CONTRIBUTION_YEAR });

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

// ── updateMemberField — inline edit jednoho pole ─────────────────────────────
type EditableField = "fullName" | "userLogin" | "email" | "phone" | "variableSymbol" | "cskNumber" | "note";
const EDITABLE_FIELD_KEYS = new Set<EditableField>(["fullName","userLogin","email","phone","variableSymbol","cskNumber","note"]);

export async function updateMemberField(
    memberId: number,
    field: EditableField,
    value: string
): Promise<{ error: string } | { success: true }> {
    if (!EDITABLE_FIELD_KEYS.has(field)) return { error: "Neplatné pole" };

    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    try {
        const [current] = await db.select().from(members).where(eq(members.id, memberId));
        if (!current) return { error: "Člen nenalezen" };

        // Build a typed patch — fullName is notNull so we skip empty values
        let newValue: string | number | null;
        switch (field) {
            case "fullName":
                if (!value.trim()) return { error: "Jméno nesmí být prázdné" };
                newValue = value.trim();
                break;
            case "variableSymbol":
            case "cskNumber":
                newValue = Number(value) || null;
                break;
            default:
                newValue = value.trim() || null;
        }

        // Use individual typed updates to satisfy Drizzle's strict set() types
        if (field === "fullName") {
            await db.update(members).set({ fullName: newValue as string, updatedAt: new Date() }).where(eq(members.id, memberId));
        } else {
            await db.update(members).set({ [field]: newValue, updatedAt: new Date() } as Parameters<ReturnType<typeof db.update>["set"]>[0]).where(eq(members.id, memberId));
        }

        const oldVal = str(current[field]);
        const newVal = str(newValue);
        if (oldVal !== newVal) {
            await db.insert(auditLog).values({
                entityType: "member", entityId: memberId, action: "update",
                changes: { [field]: { old: oldVal, new: newVal } },
                changedBy,
            });
        }

        revalidatePath("/dashboard/members");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání" };
    }
}

// ── setIndividualDiscount ─────────────────────────────────────────────────────
export async function setIndividualDiscount(
    memberId: number,
    periodId: number,
    amount: number | null,   // null = zrušení slevy
    note: string,
    validUntilYear: number | null
): Promise<{ error: string } | { success: true }> {
    if (amount !== null && !note.trim()) return { error: "Poznámka je povinná" };
    if (amount !== null && amount <= 0) return { error: "Částka musí být kladná" };

    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    try {
        const [contrib] = await db.select()
            .from(memberContributions)
            .where(and(eq(memberContributions.memberId, memberId), eq(memberContributions.periodId, periodId)));
        if (!contrib) return { error: "Příspěvkový záznam nenalezen" };

        const patch = {
            discountIndividual:          amount !== null ? -Math.abs(amount) : null,
            discountIndividualNote:      amount !== null ? note.trim() : null,
            discountIndividualValidUntil: amount !== null ? validUntilYear : null,
        };

        await db.update(memberContributions).set(patch).where(eq(memberContributions.id, contrib.id));

        await db.insert(auditLog).values({
            entityType: "member", entityId: memberId, action: "discount_change",
            changes: {
                discountIndividual: {
                    old: str(contrib.discountIndividual),
                    new: amount !== null ? str(-Math.abs(amount)) : null,
                },
                discountNote:       { old: contrib.discountIndividualNote, new: patch.discountIndividualNote },
                validUntil:         { old: str(contrib.discountIndividualValidUntil), new: str(validUntilYear) },
            },
            changedBy,
        });

        revalidatePath("/dashboard/members");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání" };
    }
}

// ── setContributionFlags — toggle výbor/TOM without touching member fields ───
export async function setContributionFlags(
    memberId: number,
    periodId: number,
    isCommittee: boolean,
    isTom: boolean
): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    try {
        const [period] = await db.select()
            .from(contributionPeriods)
            .where(eq(contributionPeriods.id, periodId));
        if (!period) return { error: "Příspěvkové období nenalezeno" };

        const [contrib] = await db.select()
            .from(memberContributions)
            .where(and(eq(memberContributions.memberId, memberId), eq(memberContributions.periodId, periodId)));
        if (!contrib) return { error: "Příspěvkový záznam nenalezen" };

        await db.update(memberContributions).set({
            discountCommittee: isCommittee ? -period.discountCommittee : null,
            discountTom:       isTom       ? -period.discountTom       : null,
        }).where(eq(memberContributions.id, contrib.id));

        const flagChanges = diffObjects(
            { isCommittee: Boolean(contrib.discountCommittee), isTom: Boolean(contrib.discountTom) },
            { isCommittee, isTom }
        );
        if (Object.keys(flagChanges).length > 0) {
            await db.insert(auditLog).values({
                entityType: "member", entityId: memberId, action: "update",
                changes: flagChanges, changedBy,
            });
        }

        revalidatePath("/dashboard/members");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání" };
    }
}

// ── setMembershipDates — quick inline edit for a single year ─────────────────
export async function setMembershipDates(
    memberId: number,
    year: number,
    fromDate: string | null,
    toDate: string | null,
): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    try {
        await db.insert(membershipYears)
            .values({ memberId, year, fromDate: fromDate || null, toDate: toDate || null })
            .onConflictDoUpdate({
                target: [membershipYears.memberId, membershipYears.year],
                set: { fromDate: fromDate || null, toDate: toDate || null },
            });

        await db.insert(auditLog).values({
            entityType: "member", entityId: memberId, action: "update",
            changes: { membershipDates: { old: null, new: `${year}: ${fromDate ?? "—"} – ${toDate ?? "—"}` } },
            changedBy,
        });

        revalidatePath("/dashboard/members");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání" };
    }
}

// ── getMemberHistory — per-year overview 2019–2025 ───────────────────────────
const REVIEW_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025] as const;

export type MemberYearRecord = {
    year: number;
    isMember: boolean;
    fromDate: string | null;
    toDate: string | null;
    amountTotal: number | null;
    paidAmount: number | null;
    isPaid: boolean | null;
};

export async function getMemberHistory(memberId: number): Promise<MemberYearRecord[]> {
    const db = getDb();

    const myRows = await db.select()
        .from(membershipYears)
        .where(eq(membershipYears.memberId, memberId));

    const finRows = await db
        .select({
            year:        contributionPeriods.year,
            amountTotal: memberContributions.amountTotal,
            paidAmount:  memberContributions.paidAmount,
            isPaid:      memberContributions.isPaid,
        })
        .from(memberContributions)
        .innerJoin(contributionPeriods, eq(memberContributions.periodId, contributionPeriods.id))
        .where(eq(memberContributions.memberId, memberId));

    const myMap  = new Map(myRows.map(r => [r.year, r]));
    const finMap = new Map(finRows.map(r => [r.year, r]));

    return REVIEW_YEARS.map(year => {
        const my  = myMap.get(year)  ?? null;
        const fin = finMap.get(year) ?? null;
        return {
            year,
            isMember:    my !== null,
            fromDate:    my?.fromDate ?? null,
            toDate:      my?.toDate   ?? null,
            amountTotal: fin?.amountTotal ?? null,
            paidAmount:  fin?.paidAmount  ?? null,
            isPaid:      fin?.isPaid      ?? null,
        };
    });
}

// ── saveMembershipHistory — bulk upsert from review tool ─────────────────────
export async function saveMembershipHistory(
    memberId: number,
    years: { year: number; isMember: boolean; fromDate: string | null; toDate: string | null }[],
    markReviewed: boolean,
): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    try {
        // Delete all review-range rows then re-insert
        await db.delete(membershipYears).where(
            and(
                eq(membershipYears.memberId, memberId),
                inArray(membershipYears.year, REVIEW_YEARS as unknown as number[])
            )
        );

        const toInsert = years
            .filter(y => y.isMember)
            .map(y => ({ memberId, year: y.year, fromDate: y.fromDate || null, toDate: y.toDate || null }));

        if (toInsert.length > 0) {
            await db.insert(membershipYears).values(toInsert);
        }

        if (markReviewed) {
            await db.update(members)
                .set({ membershipReviewed: true })
                .where(eq(members.id, memberId));
        }

        await db.insert(auditLog).values({
            entityType: "member", entityId: memberId, action: "membership_review",
            changes: { reviewedYears: { old: null, new: years.filter(y => y.isMember).map(y => y.year).join(", ") } },
            changedBy,
        });

        revalidatePath("/dashboard/members");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání" };
    }
}

// ── setMemberTodo ─────────────────────────────────────────────────────────────
export async function setMemberTodo(
    memberId: number,
    note: string | null
): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();
    try {
        const [current] = await db.select({ todoNote: members.todoNote })
            .from(members).where(eq(members.id, memberId));
        if (!current) return { error: "Člen nenalezen" };

        await db.update(members).set({ todoNote: note }).where(eq(members.id, memberId));

        if (current.todoNote !== note) {
            await db.insert(auditLog).values({
                entityType: "member", entityId: memberId,
                action: note ? "todo_set" : "todo_resolved",
                changes: { todoNote: { old: current.todoNote, new: note } },
                changedBy,
            });
        }
        revalidatePath("/dashboard/members");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání" };
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

