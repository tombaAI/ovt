"use server";

import { getDb } from "@/lib/db";
import { members, people, memberContributions, contributionPeriods, auditLog, payments } from "@/db/schema";
import { eq, and, ne, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getSelectedYear } from "@/lib/actions/year";

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

async function checkVsUnique(db: ReturnType<typeof getDb>, vs: number, excludeId?: number): Promise<boolean> {
    const rows = await db.select({ id: members.id }).from(members)
        .where(excludeId !== undefined
            ? and(eq(members.variableSymbol, vs), ne(members.id, excludeId))
            : eq(members.variableSymbol, vs));
    return rows.length === 0;
}

async function syncPersonForMember(db: ReturnType<typeof getDb>, memberId: number) {
    const [member] = await db
        .select({
            id: members.id,
            firstName: members.firstName,
            lastName: members.lastName,
            fullName: members.fullName,
            email: members.email,
            phone: members.phone,
            bankAccountNumber: members.bankAccountNumber,
            bankCode: members.bankCode,
        })
        .from(members)
        .where(eq(members.id, memberId));

    if (!member) return;

    await db
        .insert(people)
        .values({
            memberId: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            fullName: member.fullName,
            email: member.email,
            phone: member.phone,
            bankAccountNumber: member.bankAccountNumber,
            bankCode: member.bankCode,
        })
        .onConflictDoUpdate({
            target: people.memberId,
            set: {
                firstName: member.firstName,
                lastName: member.lastName,
                fullName: member.fullName,
                email: member.email,
                phone: member.phone,
                bankAccountNumber: member.bankAccountNumber,
                bankCode: member.bankCode,
                updatedAt: new Date(),
            },
        });
}

// ── saveMember ───────────────────────────────────────────────────────────────
export async function saveMember(
    prevState: MemberFormState,
    formData: FormData
): Promise<MemberFormState> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    const firstName = (formData.get("first_name") as string)?.trim();
    const lastName  = (formData.get("last_name")  as string)?.trim();
    if (!firstName) return { error: "Jméno je povinné" };
    if (!lastName)  return { error: "Příjmení je povinné" };

    const idRaw = formData.get("id") as string;

    const memberData = {
        firstName,
        lastName,
        fullName:       `${firstName} ${lastName}`,
        userLogin:      (formData.get("user_login") as string)?.trim()  || null,
        email:          (formData.get("email") as string)?.trim()        || null,
        phone:          (formData.get("phone") as string)?.trim()        || null,
        variableSymbol: Number(formData.get("variable_symbol")) || null,
        cskNumber:      (formData.get("csk_number") as string)?.trim() || null,
        bankAccountNumber: (formData.get("bank_account_number") as string)?.trim() || null,
        bankCode:          (formData.get("bank_code") as string)?.trim() || null,
        note:           (formData.get("note") as string)?.trim()         || null,
    };

    try {
        if (idRaw) {
            // ── UPDATE ────────────────────────────────────────────────────
            const id = Number(idRaw);

            const [current] = await db.select().from(members).where(eq(members.id, id));
            if (!current) return { error: "Člen nenalezen" };

            if (memberData.variableSymbol !== null && memberData.variableSymbol !== current.variableSymbol) {
                if (!await checkVsUnique(db, memberData.variableSymbol, id))
                    return { error: "Variabilní symbol je již používán jiným členem" };
            }

            await db.update(members)
                .set({ ...memberData, updatedAt: new Date() })
                .where(eq(members.id, id));
            await syncPersonForMember(db, id);

            const memberChanges = diffObjects(
                {
                    firstName:      current.firstName,
                    lastName:       current.lastName,
                    userLogin:      current.userLogin,
                    email:          current.email,
                    phone:          current.phone,
                    variableSymbol: current.variableSymbol,
                    cskNumber:      current.cskNumber,
                    bankAccountNumber: current.bankAccountNumber,
                    bankCode:       current.bankCode,
                    note:           current.note,
                },
                {
                    firstName:      memberData.firstName,
                    lastName:       memberData.lastName,
                    userLogin:      memberData.userLogin,
                    email:          memberData.email,
                    phone:          memberData.phone,
                    variableSymbol: memberData.variableSymbol,
                    cskNumber:      memberData.cskNumber,
                    bankAccountNumber: memberData.bankAccountNumber,
                    bankCode:       memberData.bankCode,
                    note:           memberData.note,
                }
            );

            // Current year contribution flags
            const selectedYear = await getSelectedYear();
            const [period] = await db.select()
                .from(contributionPeriods)
                .where(eq(contributionPeriods.year, selectedYear));

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
            const memberFromRaw = (formData.get("member_from") as string)?.trim();
            if (!memberFromRaw) return { error: "Datum vstupu je povinné" };

            if (memberData.variableSymbol !== null) {
                if (!await checkVsUnique(db, memberData.variableSymbol))
                    return { error: "Variabilní symbol je již používán jiným členem" };
            }

            const [{ nextId }] = await db.select({
                nextId: sql<number>`coalesce(max(${members.id}), 0) + 1`
            }).from(members);

            await db.insert(members).values({
                id: nextId,
                ...memberData,
                memberFrom: memberFromRaw,
            });
            await syncPersonForMember(db, nextId);

            await db.insert(auditLog).values({
                entityType: "member",
                entityId:   nextId,
                action:     "create",
                changes:    Object.fromEntries(
                    Object.entries({ ...memberData, memberFrom: memberFromRaw })
                        .map(([k, v]) => [k, { old: null, new: str(v) }])
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
type EditableField = "firstName" | "lastName" | "nickname" | "userLogin" | "email" | "phone" | "gender" | "address" | "bankAccountNumber" | "bankCode" | "variableSymbol" | "cskNumber" | "note" | "memberFrom";
const EDITABLE_FIELD_KEYS = new Set<EditableField>(["firstName","lastName","nickname","userLogin","email","phone","gender","address","bankAccountNumber","bankCode","variableSymbol","cskNumber","note","memberFrom"]);

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

        let newValue: string | number | null;
        switch (field) {
            case "firstName":
            case "lastName":
                if (!value.trim()) return { error: field === "firstName" ? "Jméno nesmí být prázdné" : "Příjmení nesmí být prázdné" };
                newValue = value.trim();
                break;
            case "memberFrom":
                if (!value.trim()) return { error: "Datum vstupu nesmí být prázdné" };
                newValue = value.trim();
                break;
            case "variableSymbol":
                newValue = Number(value) || null;
                if (newValue !== null && newValue !== current.variableSymbol) {
                    if (!await checkVsUnique(db, newValue as number, memberId))
                        return { error: "Variabilní symbol je již používán jiným členem" };
                }
                break;
            case "cskNumber":
                newValue = value.trim() || null;
                break;
            default:
                newValue = value.trim() || null;
        }

        if (field === "firstName" || field === "lastName") {
            const updated = field === "firstName"
                ? { firstName: newValue as string, fullName: `${newValue} ${current.lastName}`, updatedAt: new Date() }
                : { lastName:  newValue as string, fullName: `${current.firstName} ${newValue}`, updatedAt: new Date() };
            await db.update(members).set(updated).where(eq(members.id, memberId));
        } else if (field === "memberFrom") {
            await db.update(members).set({ memberFrom: newValue as string, updatedAt: new Date() }).where(eq(members.id, memberId));
        } else {
            await db.update(members).set({ [field]: newValue, updatedAt: new Date() } as Parameters<ReturnType<typeof db.update>["set"]>[0]).where(eq(members.id, memberId));
        }

        await syncPersonForMember(db, memberId);

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
    amount: number | null,
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

// ── setContributionFlags ──────────────────────────────────────────────────────
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

        // Uložit trvalý příznak přímo na člena (zachová se i po smazání předpisů)
        await db.update(members).set({
            isCommitteeMember: isCommittee,
            isTomLeader:       isTom,
        }).where(eq(members.id, memberId));

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

// ── terminateMembership ───────────────────────────────────────────────────────
export async function terminateMembership(
    memberId: number,
    toDate: string,
    note: string,
): Promise<{ error: string } | { success: true }> {
    if (!toDate) return { error: "Datum ukončení je povinné" };
    if (!note.trim()) return { error: "Komentář je povinný" };

    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    try {
        const [current] = await db.select({ memberTo: members.memberTo })
            .from(members).where(eq(members.id, memberId));
        if (!current) return { error: "Člen nenalezen" };

        await db.update(members)
            .set({ memberTo: toDate, memberToNote: note.trim(), updatedAt: new Date() })
            .where(eq(members.id, memberId));

        await db.insert(auditLog).values({
            entityType: "member", entityId: memberId, action: "membership_terminated",
            changes: {
                memberTo:     { old: current.memberTo ?? null, new: toDate },
                memberToNote: { old: null, new: note.trim() },
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

// ── getMemberHistory — contribution overview per year of membership ───────────

export type MemberYearRecord = {
    year: number;
    hasContrib: boolean;
    amountTotal: number | null;
    paidTotal: number;
};

export async function getMemberHistory(memberId: number): Promise<MemberYearRecord[]> {
    const db = getDb();

    const [member] = await db
        .select({ memberFrom: members.memberFrom, memberTo: members.memberTo })
        .from(members).where(eq(members.id, memberId));

    if (!member) return [];

    const fromYear = parseInt((member.memberFrom as unknown as string).slice(0, 4));
    const toYear   = member.memberTo ? parseInt((member.memberTo as unknown as string).slice(0, 4)) : null;

    // All contribution periods within the member's active years
    const allPeriods = await db
        .select({ id: contributionPeriods.id, year: contributionPeriods.year })
        .from(contributionPeriods);

    const relevantPeriods = allPeriods.filter(p =>
        p.year >= fromYear && (toYear === null || p.year <= toYear)
    );

    if (relevantPeriods.length === 0) return [];

    // Contributions for this member with payment totals
    const contribs = await db
        .select({
            periodId:    memberContributions.periodId,
            amountTotal: memberContributions.amountTotal,
            paidTotal:   sql<number>`coalesce(sum(${payments.amount}), 0)`,
        })
        .from(memberContributions)
        .leftJoin(payments, eq(payments.contribId, memberContributions.id))
        .where(eq(memberContributions.memberId, memberId))
        .groupBy(memberContributions.id, memberContributions.periodId, memberContributions.amountTotal);

    const contribMap = new Map(contribs.map(c => [c.periodId, c]));

    return relevantPeriods
        .map(p => {
            const contrib = contribMap.get(p.id);
            return {
                year:        p.year,
                hasContrib:  Boolean(contrib),
                amountTotal: contrib?.amountTotal ?? null,
                paidTotal:   contrib ? Number(contrib.paidTotal) : 0,
            };
        })
        .sort((a, b) => b.year - a.year);
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

// ── setMemberReviewed ─────────────────────────────────────────────────────────
export async function setMemberReviewed(
    memberId: number,
    reviewed: boolean
): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();
    try {
        const [current] = await db.select({ membershipReviewed: members.membershipReviewed })
            .from(members).where(eq(members.id, memberId));
        if (!current) return { error: "Člen nenalezen" };

        await db.update(members).set({ membershipReviewed: reviewed, updatedAt: new Date() }).where(eq(members.id, memberId));

        if (current.membershipReviewed !== reviewed) {
            await db.insert(auditLog).values({
                entityType: "member", entityId: memberId, action: "update",
                changes: { membershipReviewed: { old: str(current.membershipReviewed), new: str(reviewed) } },
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
