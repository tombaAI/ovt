import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { people } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
        }

        const { id } = await params;
        const personId = Number(id);
        if (!Number.isInteger(personId) || personId <= 0) {
            return NextResponse.json({ error: "Neplatné ID" }, { status: 400 });
        }

        const db = getDb();
        const [person] = await db
            .select({ id: people.id, memberId: people.memberId })
            .from(people)
            .where(eq(people.id, personId));

        if (!person) {
            return NextResponse.json({ error: "Osoba nenalezena" }, { status: 404 });
        }
        if (person.memberId !== null) {
            return NextResponse.json({ error: "Údaje člena se upravují přes profil člena" }, { status: 403 });
        }

        const body = await request.json() as Record<string, unknown>;

        const fullName = String(body.fullName ?? "").trim();
        if (!fullName) {
            return NextResponse.json({ error: "Jméno je povinné" }, { status: 400 });
        }

        const bankAccountNumber = typeof body.bankAccountNumber === "string"
            ? body.bankAccountNumber.trim() || null
            : null;
        const bankCode = typeof body.bankCode === "string"
            ? body.bankCode.trim() || null
            : null;
        const email = typeof body.email === "string"
            ? body.email.trim() || null
            : null;
        const phone = typeof body.phone === "string"
            ? body.phone.trim() || null
            : null;

        await db.update(people)
            .set({ fullName, bankAccountNumber, bankCode, email, phone, updatedAt: new Date() })
            .where(eq(people.id, personId));

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Interní chyba";
        console.error("[PATCH /api/people/[id]]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
