"use server";

import { getDb } from "@/lib/db";
import { notebookNotes, notebookNoteVersions } from "@/db/schema";
import { eq, desc, isNull, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

export type NoteRow = typeof notebookNotes.$inferSelect;
export type NoteVersionRow = typeof notebookNoteVersions.$inferSelect;
export type NoteWithLatest = NoteRow & { latestContent: string; versionCount: number };
export type NoteActionResult = { error: string } | { success: true; id?: number };

export async function getNotes(includeArchived = false): Promise<NoteWithLatest[]> {
    const db = getDb();
    const notes = await db
        .select()
        .from(notebookNotes)
        .where(includeArchived ? isNotNull(notebookNotes.archivedAt) : isNull(notebookNotes.archivedAt))
        .orderBy(desc(notebookNotes.updatedAt));

    const result: NoteWithLatest[] = [];
    for (const note of notes) {
        const versions = await db
            .select()
            .from(notebookNoteVersions)
            .where(eq(notebookNoteVersions.noteId, note.id))
            .orderBy(desc(notebookNoteVersions.createdAt))
            .limit(1);
        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(notebookNoteVersions)
            .where(eq(notebookNoteVersions.noteId, note.id));
        result.push({
            ...note,
            latestContent: versions[0]?.content ?? "",
            versionCount: Number(count),
        });
    }
    return result;
}

export async function getExistingCategories(): Promise<string[]> {
    const db = getDb();
    const rows = await db.execute(
        sql`SELECT DISTINCT unnest(categories) AS category FROM app.notebook_notes WHERE archived_at IS NULL ORDER BY category`
    );
    return (rows as unknown as { category: string }[]).map(r => r.category).filter(Boolean);
}

export async function getNoteVersions(noteId: number): Promise<NoteVersionRow[]> {
    const db = getDb();
    return db
        .select()
        .from(notebookNoteVersions)
        .where(eq(notebookNoteVersions.noteId, noteId))
        .orderBy(desc(notebookNoteVersions.createdAt));
}

export async function createNote(title: string, content: string, categories: string[]): Promise<NoteActionResult> {
    const session = await auth();
    const email = session?.user?.email ?? "unknown";
    const db = getDb();
    try {
        const [note] = await db
            .insert(notebookNotes)
            .values({ title, categories, createdByEmail: email })
            .returning();
        await db.insert(notebookNoteVersions).values({
            noteId: note.id,
            content,
            createdByEmail: email,
        });
        revalidatePath("/dashboard/informace");
        return { success: true, id: note.id };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při vytváření poznámky" };
    }
}

export async function saveNoteVersion(
    noteId: number,
    title: string,
    content: string,
    categories: string[]
): Promise<NoteActionResult> {
    const session = await auth();
    const email = session?.user?.email ?? "unknown";
    const db = getDb();
    try {
        await db
            .update(notebookNotes)
            .set({ title, categories, updatedAt: new Date() })
            .where(eq(notebookNotes.id, noteId));
        await db.insert(notebookNoteVersions).values({
            noteId,
            content,
            createdByEmail: email,
        });
        revalidatePath("/dashboard/informace");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při ukládání" };
    }
}

export async function archiveNote(noteId: number): Promise<NoteActionResult> {
    const db = getDb();
    try {
        await db
            .update(notebookNotes)
            .set({ archivedAt: new Date() })
            .where(eq(notebookNotes.id, noteId));
        revalidatePath("/dashboard/informace");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při archivaci" };
    }
}

export async function unarchiveNote(noteId: number): Promise<NoteActionResult> {
    const db = getDb();
    try {
        await db
            .update(notebookNotes)
            .set({ archivedAt: null })
            .where(eq(notebookNotes.id, noteId));
        revalidatePath("/dashboard/informace");
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při obnovení" };
    }
}
