"use server";

import { getDb } from "@/lib/db";
import { memberContributions, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

function str(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean") return v ? "Ano" : "Ne";
    return String(v);
}

export type ContribActionResult = { error: string } | { success: true };

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

export async function setContribReviewed(
    contribId: number,
    reviewed: boolean
): Promise<ContribActionResult> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "unknown";
    const db = getDb();
    try {
        const [current] = await db
            .select({ reviewed: memberContributions.reviewed, emailSent: memberContributions.emailSent, memberId: memberContributions.memberId })
            .from(memberContributions).where(eq(memberContributions.id, contribId));
        if (!current) return { error: "Záznam nenalezen" };

        // Po odeslání emailu nelze zrušit revizi
        if (!reviewed && current.emailSent) return { error: "Nelze zrušit revizi — email byl odeslán" };

        await db.update(memberContributions).set({ reviewed }).where(eq(memberContributions.id, contribId));

        if (current.reviewed !== reviewed) {
            await db.insert(auditLog).values({
                entityType: "member", entityId: current.memberId,
                action: "update",
                changes: { reviewed: { old: str(current.reviewed), new: str(reviewed) } },
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
