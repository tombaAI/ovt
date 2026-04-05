"use server";

import { getDb } from "@/lib/db";
import { memberContributions, payments, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

export type ContribActionResult = { error: string } | { success: true };

export async function addPayment(
    contribId: number,
    memberId: number,
    amount: number,
    paidAt: string | null,
    note: string | null,
): Promise<ContribActionResult> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();
    try {
        await db.insert(payments).values({ contribId, memberId, amount, paidAt, note, createdBy: changedBy });
        await db.insert(auditLog).values({
            entityType: "member", entityId: memberId, action: "payment_add",
            changes: {
                amount: { old: null, new: String(amount) },
                paidAt: { old: null, new: paidAt },
            },
            changedBy,
        });
        revalidatePath("/dashboard/contributions");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání platby" };
    }
}

export async function deletePayment(
    paymentId: number,
    memberId: number,
): Promise<ContribActionResult> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();
    try {
        const [pay] = await db.select().from(payments).where(eq(payments.id, paymentId));
        if (!pay) return { error: "Platba nenalezena" };

        await db.delete(payments).where(eq(payments.id, paymentId));
        await db.insert(auditLog).values({
            entityType: "member", entityId: memberId, action: "payment_delete",
            changes: {
                amount: { old: String(pay.amount), new: null },
                paidAt: { old: pay.paidAt, new: null },
            },
            changedBy,
        });
        revalidatePath("/dashboard/contributions");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při mazání platby" };
    }
}

export async function setContributionTodo(
    contribId: number,
    note: string | null
): Promise<ContribActionResult> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();
    try {
        const [current] = await db
            .select({ todoNote: memberContributions.todoNote, memberId: memberContributions.memberId })
            .from(memberContributions).where(eq(memberContributions.id, contribId));
        if (!current) return { error: "Záznam nenalezen" };

        await db.update(memberContributions).set({ todoNote: note })
            .where(eq(memberContributions.id, contribId));

        if (current.todoNote !== note) {
            await db.insert(auditLog).values({
                entityType: "member", entityId: current.memberId,
                action: note ? "todo_set" : "todo_resolved",
                changes: { todoNote: { old: current.todoNote, new: note } },
                changedBy,
            });
        }
        revalidatePath("/dashboard/contributions");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání" };
    }
}
