"use server";

import { getDb } from "@/lib/db";
import { memberContributions, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

export type ContribFormState = { error: string } | { success: true } | null;

function str(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean") return v ? "Ano" : "Ne";
    return String(v);
}

export async function savePayment(
    prevState: ContribFormState,
    formData: FormData
): Promise<ContribFormState> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    const contribId = Number(formData.get("contrib_id"));
    if (!contribId) return { error: "Chybí ID záznamu" };

    const isPaid    = formData.get("is_paid") === "on";
    const paidRaw   = formData.get("paid_amount") as string;
    const paidAmt   = paidRaw ? Number(paidRaw) || null : null;
    const paidAt    = (formData.get("paid_at") as string) || null;
    const note      = (formData.get("note") as string)?.trim() || null;

    try {
        const [current] = await db.select().from(memberContributions)
            .where(eq(memberContributions.id, contribId));
        if (!current) return { error: "Záznam nenalezen" };

        await db.update(memberContributions).set({
            isPaid:     isPaid,
            paidAmount: paidAmt,
            paidAt:     paidAt,
            note:       note,
        }).where(eq(memberContributions.id, contribId));

        // Audit
        const changes: Record<string, { old: string | null; new: string | null }> = {};
        const pairs: [string, unknown, unknown][] = [
            ["isPaid",     current.isPaid,     isPaid],
            ["paidAmount", current.paidAmount, paidAmt],
            ["paidAt",     current.paidAt,     paidAt],
            ["note",       current.note,       note],
        ];
        for (const [k, o, n] of pairs) {
            const os = str(o), ns = str(n);
            if (os !== ns) changes[k] = { old: os, new: ns };
        }
        if (Object.keys(changes).length > 0) {
            await db.insert(auditLog).values({
                entityType: "member",
                entityId:   current.memberId,
                action:     "payment_update",
                changes,
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

export async function setContributionTodo(
    contribId: number,
    note: string | null
): Promise<ContribFormState> {
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
