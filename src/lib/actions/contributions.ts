"use server";

import { getDb } from "@/lib/db";
import { memberContributions, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

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
