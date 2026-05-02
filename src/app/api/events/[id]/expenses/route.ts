import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses, members, people } from "@/db/schema";
import { expenseCategoryEnum } from "@/lib/expense-categories";
import { eq } from "drizzle-orm";

const ALLOWED_MIME = new Set([
    "image/jpeg", "image/png", "image/webp", "image/heic",
    "application/pdf",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

async function resolveReimbursementTarget(
    db: ReturnType<typeof getDb>,
    reimbursementPersonIdRaw: string,
    reimbursementMemberIdRaw: string,
): Promise<
    | { value: { reimbursementPersonId: number | null; reimbursementMemberId: number | null } }
    | { error: NextResponse }
> {
    if (reimbursementPersonIdRaw) {
        const candidateId = Number(reimbursementPersonIdRaw);
        if (!Number.isInteger(candidateId) || candidateId <= 0) {
            return { error: NextResponse.json({ error: "Neplatný příjemce proplacení" }, { status: 400 }) };
        }

        const [person] = await db
            .select({ id: people.id, memberId: people.memberId })
            .from(people)
            .where(eq(people.id, candidateId));

        if (!person) {
            return { error: NextResponse.json({ error: "Vybraný příjemce nebyl nalezen" }, { status: 400 }) };
        }

        return { value: { reimbursementPersonId: person.id, reimbursementMemberId: person.memberId } };
    }

    if (reimbursementMemberIdRaw) {
        const candidateId = Number(reimbursementMemberIdRaw);
        if (!Number.isInteger(candidateId) || candidateId <= 0) {
            return { error: NextResponse.json({ error: "Neplatný člen pro proplacení" }, { status: 400 }) };
        }

        const [member] = await db.select({
            id: members.id,
            firstName: members.firstName,
            lastName: members.lastName,
            fullName: members.fullName,
            email: members.email,
            phone: members.phone,
            bankAccountNumber: members.bankAccountNumber,
            bankCode: members.bankCode,
        }).from(members).where(eq(members.id, candidateId));
        if (!member) {
            return { error: NextResponse.json({ error: "Vybraný člen nebyl nalezen" }, { status: 400 }) };
        }

        const [person] = await db
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
            })
            .returning({ id: people.id });

        return { value: { reimbursementPersonId: person?.id ?? null, reimbursementMemberId: member.id } };
    }

    return { value: { reimbursementPersonId: null, reimbursementMemberId: null } };
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
        }

        const { id } = await params;
        const eventId = Number(id);
        if (isNaN(eventId) || eventId <= 0) {
            return NextResponse.json({ error: "Neplatné ID akce" }, { status: 400 });
        }

        const formData = await request.formData();
        const statusRaw       = String(formData.get("status") ?? "final");
        const status          = (["draft", "unconfirmed", "final"] as const).includes(statusRaw as "draft" | "unconfirmed" | "final")
            ? statusRaw as "draft" | "unconfirmed" | "final"
            : "final";
        const amountStr       = String(formData.get("amount") ?? "").replace(",", ".");
        const purposeText     = String(formData.get("purposeText") ?? "").trim();
        const purposeCategory = String(formData.get("purposeCategory") ?? "");
        const reimbursementPersonIdRaw = String(formData.get("reimbursementPersonId") ?? "").trim();
        const reimbursementMemberIdRaw = String(formData.get("reimbursementMemberId") ?? "").trim();
        const file            = formData.get("file") as File | null;

        let amount: number | null = null;
        if (status === "final") {
            amount = parseFloat(amountStr);
            if (isNaN(amount) || amount <= 0)
                return NextResponse.json({ error: "Neplatná částka" }, { status: 400 });
            if (!purposeText)
                return NextResponse.json({ error: "Chybí účel" }, { status: 400 });
            if (!(expenseCategoryEnum as readonly string[]).includes(purposeCategory))
                return NextResponse.json({ error: "Neplatná kategorie" }, { status: 400 });
        } else {
            const parsed = parseFloat(amountStr);
            if (!isNaN(parsed) && parsed > 0) amount = parsed;
        }

        const db = getDb();
        const reimbursement = await resolveReimbursementTarget(db, reimbursementPersonIdRaw, reimbursementMemberIdRaw);
        if ("error" in reimbursement) return reimbursement.error;
        const { reimbursementPersonId, reimbursementMemberId } = reimbursement.value;

        let fileUrl: string | null = null;
        let fileName: string | null = null;
        let fileMime: string | null = null;

        if (file && file.size > 0) {
            if (!ALLOWED_MIME.has(file.type)) {
                return NextResponse.json({ error: "Nepodporovaný typ souboru (povoleno: PDF, JPEG, PNG, WebP, HEIC)" }, { status: 400 });
            }
            if (file.size > MAX_FILE_BYTES) {
                return NextResponse.json({ error: "Soubor je příliš velký (max 10 MB)" }, { status: 400 });
            }
            const ext = file.name.split(".").pop() ?? "bin";
            const safeName = `events/${eventId}/expenses/${Date.now()}.${ext}`;
            const blob = await put(safeName, file, {
                access: "private",
                contentType: file.type,
            });
            fileUrl = blob.url;
            fileName = file.name;
            fileMime = file.type;
        }

        const purposeCategoryVal = (expenseCategoryEnum as readonly string[]).includes(purposeCategory)
            ? purposeCategory as typeof expenseCategoryEnum[number]
            : null;

        await db.insert(eventExpenses).values({
            eventId,
            status,
            amount: amount !== null ? String(amount) : null,
            purposeText: purposeText || null,
            purposeCategory: purposeCategoryVal,
            reimbursementPersonId,
            reimbursementMemberId,
            fileUrl,
            fileName,
            fileMime,
            uploadedBy: session.user.email,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Interní chyba";
        console.error("[POST /api/events/expenses]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
        }

        const { id } = await params;
        const eventId = Number(id);
        if (isNaN(eventId) || eventId <= 0) {
            return NextResponse.json({ error: "Neplatné ID akce" }, { status: 400 });
        }

        const body = await request.json() as {
            expenseId?: unknown;
            amount?: unknown;
            purposeText?: unknown;
            purposeCategory?: unknown;
            reimbursementPersonId?: unknown;
            reimbursementMemberId?: unknown;
        };

        const expenseId = Number(body.expenseId);
        if (!Number.isInteger(expenseId) || expenseId <= 0) {
            return NextResponse.json({ error: "Chybí expenseId" }, { status: 400 });
        }

        const amountStr = String(body.amount ?? "").replace(",", ".");
        const purposeText = String(body.purposeText ?? "").trim();
        const purposeCategory = String(body.purposeCategory ?? "");
        const reimbursementPersonIdRaw = body.reimbursementPersonId === null || body.reimbursementPersonId === undefined
            ? ""
            : String(body.reimbursementPersonId).trim();
        const reimbursementMemberIdRaw = body.reimbursementMemberId === null || body.reimbursementMemberId === undefined
            ? ""
            : String(body.reimbursementMemberId).trim();

        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
            return NextResponse.json({ error: "Neplatná částka" }, { status: 400 });
        }
        if (!purposeText) {
            return NextResponse.json({ error: "Chybí účel" }, { status: 400 });
        }
        if (!(expenseCategoryEnum as readonly string[]).includes(purposeCategory)) {
            return NextResponse.json({ error: "Neplatná kategorie" }, { status: 400 });
        }

        const db = getDb();
        const [row] = await db.select({ id: eventExpenses.id, eventId: eventExpenses.eventId })
            .from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));

        if (!row || row.eventId !== eventId) {
            return NextResponse.json({ error: "Doklad nenalezen" }, { status: 404 });
        }

        const reimbursement = await resolveReimbursementTarget(db, reimbursementPersonIdRaw, reimbursementMemberIdRaw);
        if ("error" in reimbursement) return reimbursement.error;

        await db.update(eventExpenses)
            .set({
                status: "final",
                amount: String(amount),
                purposeText,
                purposeCategory: purposeCategory as typeof expenseCategoryEnum[number],
                reimbursementPersonId: reimbursement.value.reimbursementPersonId,
                reimbursementMemberId: reimbursement.value.reimbursementMemberId,
            })
            .where(eq(eventExpenses.id, expenseId));

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Interní chyba";
        console.error("[PATCH /api/events/expenses]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
        }

        const { expenseId } = await request.json();
        if (!expenseId) {
            return NextResponse.json({ error: "Chybí expenseId" }, { status: 400 });
        }

        const { id } = await params;
        const eventId = Number(id);

        const db = getDb();
        const [row] = await db.select().from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));

        if (!row || row.eventId !== eventId) {
            return NextResponse.json({ error: "Doklad nenalezen" }, { status: 404 });
        }

        if (row.fileUrl) {
            await del(row.fileUrl);
        }

        await db.delete(eventExpenses).where(eq(eventExpenses.id, expenseId));

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Interní chyba";
        console.error("[DELETE /api/events/expenses]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
