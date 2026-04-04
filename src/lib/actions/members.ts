"use server";

import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type MemberFormState = { error: string } | { success: true } | null;

export async function saveMember(
    prevState: MemberFormState,
    formData: FormData
): Promise<MemberFormState> {
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
            const id = Number(idRaw);
            await db.update(members)
                .set({ ...memberData, updatedAt: new Date() })
                .where(eq(members.id, id));

            // Update 2026 contribution flags if the record exists
            const [period] = await db.select()
                .from(contributionPeriods)
                .where(eq(contributionPeriods.year, 2026));

            if (period) {
                const [contrib] = await db.select({ id: memberContributions.id })
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

                    await db.update(memberContributions).set({
                        discountCommittee:  isCommittee ? -period.discountCommittee : null,
                        discountTom:        isTom       ? -period.discountTom       : null,
                        discountIndividual: indAmount   ? -indAmount                : null,
                    }).where(eq(memberContributions.id, contrib.id));
                }
            }
        } else {
            // New member — auto-assign ID
            const [{ nextId }] = await db.select({
                nextId: sql<number>`coalesce(max(${members.id}), 0) + 1`
            }).from(members);

            await db.insert(members).values({ id: nextId, ...memberData });
        }

        revalidatePath("/dashboard/members");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání. Zkus to znovu." };
    }
}
