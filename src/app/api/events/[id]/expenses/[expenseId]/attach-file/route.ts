import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses } from "@/db/schema";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set([
    "image/jpeg", "image/png", "image/webp", "image/heic",
    "application/pdf",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
        }

        const { id, expenseId: expenseIdStr } = await params;
        const eventId = Number(id);
        const expenseId = Number(expenseIdStr);

        if (isNaN(eventId) || eventId <= 0 || isNaN(expenseId) || expenseId <= 0) {
            return NextResponse.json({ error: "Neplatné ID" }, { status: 400 });
        }

        const db = getDb();

        const [expense] = await db
            .select({ id: eventExpenses.id, eventId: eventExpenses.eventId, fileUrl: eventExpenses.fileUrl })
            .from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));

        if (!expense || expense.eventId !== eventId) {
            return NextResponse.json({ error: "Doklad nenalezen" }, { status: 404 });
        }

        if (expense.fileUrl) {
            return NextResponse.json({ error: "Doklad již má přiložený soubor" }, { status: 409 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file || file.size === 0) {
            return NextResponse.json({ error: "Nebyl vybrán žádný soubor" }, { status: 400 });
        }

        if (!ALLOWED_MIME.has(file.type)) {
            return NextResponse.json(
                { error: "Nepodporovaný typ souboru (povoleno: PDF, JPEG, PNG, WebP, HEIC)" },
                { status: 400 },
            );
        }

        if (file.size > MAX_FILE_BYTES) {
            return NextResponse.json({ error: "Soubor je příliš velký (max 10 MB)" }, { status: 400 });
        }

        const ext = file.name.split(".").pop() ?? "bin";
        const safeName = `events/${eventId}/expenses/${expenseId}_${Date.now()}.${ext}`;
        const blob = await put(safeName, file, {
            access: "private",
            contentType: file.type,
        });

        await db
            .update(eventExpenses)
            .set({ fileUrl: blob.url, fileName: file.name, fileMime: file.type })
            .where(eq(eventExpenses.id, expenseId));

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Interní chyba";
        console.error("[POST attach-file]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
