import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses, events, members, people, auditLog } from "@/db/schema";
import { expenseCategoryEnum } from "@/lib/expense-categories";
import { logBlockedAttempt } from "@/lib/audit";
import { isAllowedExpenseFile, resolveExpenseFileMime } from "@/lib/expense-file-validation";
import { eq } from "drizzle-orm";

type ExpenseLocks = { lockedForParticipants: boolean; lockedForReimbursement: boolean };

async function getExpenseLocks(db: ReturnType<typeof getDb>, eventId: number): Promise<ExpenseLocks | null> {
    const [row] = await db
        .select({ lockForParticipants: events.lockForParticipants, lockForReimbursement: events.lockForReimbursement })
        .from(events)
        .where(eq(events.id, eventId));
    if (!row) return null;
    return { lockedForParticipants: row.lockForParticipants, lockedForReimbursement: row.lockForReimbursement };
}

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

        const db = getDb();
        const locks = await getExpenseLocks(db, eventId);
        if (!locks) return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        if (locks.lockedForParticipants || locks.lockedForReimbursement) {
            const reason = "Nelze přidávat náklady — akce je uzamčena";
            await logBlockedAttempt(db, { attemptedAction: "create_expense", reason, changedBy: session.user.email, eventId });
            return NextResponse.json({ error: reason }, { status: 409 });
        }

        const formData = await request.formData();
        const statusRaw = String(formData.get("status") ?? "final");
        const status = (["draft", "unconfirmed", "final"] as const).includes(statusRaw as "draft" | "unconfirmed" | "final")
            ? statusRaw as "draft" | "unconfirmed" | "final"
            : "final";
        const amountStr = String(formData.get("amount") ?? "").replace(",", ".");
        const purposeText = String(formData.get("purposeText") ?? "").trim();
        const purposeCategory = String(formData.get("purposeCategory") ?? "");
        const reimbursementPersonIdRaw = String(formData.get("reimbursementPersonId") ?? "").trim();
        const reimbursementMemberIdRaw = String(formData.get("reimbursementMemberId") ?? "").trim();
        const isPaidRaw = formData.get("isPaid");
        const isPaid = isPaidRaw === null ? true : isPaidRaw !== "false" && isPaidRaw !== "0";
        const invoicePayeeName = String(formData.get("invoicePayeeName") ?? "").trim() || null;
        const file = formData.get("file") as File | null;

        // Baseline z Gemini analýzy na klientu (pokud proběhla) — pro budoucí kontrolu shody.
        const analyzedAmountRaw = String(formData.get("analyzedAmount") ?? "").replace(",", ".").trim();
        const analyzedParsed = analyzedAmountRaw ? parseFloat(analyzedAmountRaw) : NaN;
        const analyzedAmount = !isNaN(analyzedParsed) ? String(analyzedParsed) : null;

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

        const reimbursement = await resolveReimbursementTarget(db, reimbursementPersonIdRaw, reimbursementMemberIdRaw);
        if ("error" in reimbursement) return reimbursement.error;
        const { reimbursementPersonId, reimbursementMemberId } = reimbursement.value;

        let fileUrl: string | null = null;
        let fileName: string | null = null;
        let fileMime: string | null = null;

        if (file && file.size > 0) {
            if (!isAllowedExpenseFile(file.type, file.name)) {
                return NextResponse.json({ error: "Nepodporovaný typ souboru (povoleno: PDF, JPEG, PNG, WebP, HEIC, XLS, XLSX)" }, { status: 400 });
            }
            if (file.size > MAX_FILE_BYTES) {
                return NextResponse.json({ error: "Soubor je příliš velký (max 10 MB)" }, { status: 400 });
            }
            const safeMime = resolveExpenseFileMime(file.type, file.name);
            const ext = file.name.split(".").pop() ?? "bin";
            const safeName = `events/${eventId}/expenses/${Date.now()}.${ext}`;
            const blob = await put(safeName, file, {
                access: "private",
                contentType: safeMime,
            });
            fileUrl = blob.url;
            fileName = file.name;
            fileMime = safeMime;
        }

        const purposeCategoryVal = (expenseCategoryEnum as readonly string[]).includes(purposeCategory)
            ? purposeCategory as typeof expenseCategoryEnum[number]
            : null;

        const [created] = await db.insert(eventExpenses).values({
            eventId,
            status,
            amount: amount !== null ? String(amount) : null,
            analyzedAmount,
            purposeText: purposeText || null,
            purposeCategory: purposeCategoryVal,
            reimbursementPersonId,
            reimbursementMemberId,
            isPaid,
            invoicePayeeName: isPaid ? null : invoicePayeeName,
            fileUrl,
            fileName,
            fileMime,
            uploadedBy: session.user.email,
        }).returning();

        // Audit — plný snapshot počátečního stavu (kotva pro rekonstrukci; UPDATE/DELETE navazují diffem).
        await db.insert(auditLog).values({
            entityType: "event_expense",
            entityId: created.id,
            action: "create_expense",
            changes: {},
            metadata: { eventId, expenseId: created.id, purposeText: created.purposeText, snapshot: created },
            changedBy: session.user.email,
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

        const db = getDb();
        const locks = await getExpenseLocks(db, eventId);
        if (!locks) return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });

        const body = await request.json() as {
            expenseId?: unknown;
            amount?: unknown;
            analyzedAmount?: unknown;
            purposeText?: unknown;
            purposeCategory?: unknown;
            reimbursementPersonId?: unknown;
            reimbursementMemberId?: unknown;
            isPaid?: unknown;
            invoicePayeeName?: unknown;
        };

        const expenseId = Number(body.expenseId);
        if (!Number.isInteger(expenseId) || expenseId <= 0) {
            return NextResponse.json({ error: "Chybí expenseId" }, { status: 400 });
        }

        const [row] = await db.select()
            .from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));

        if (!row || row.eventId !== eventId) {
            return NextResponse.json({ error: "Doklad nenalezen" }, { status: 404 });
        }

        // Quick toggle: only isPaid — not blocked by any lock
        if (body.isPaid !== undefined && body.amount === undefined && body.purposeCategory === undefined
            && body.purposeText === undefined && body.reimbursementPersonId === undefined
            && body.invoicePayeeName === undefined && body.analyzedAmount === undefined) {
            const isPaid = body.isPaid !== false && body.isPaid !== 0 && body.isPaid !== "false";
            await db.update(eventExpenses)
                .set({ isPaid })
                .where(eq(eventExpenses.id, expenseId));
            if (row.isPaid !== isPaid) {
                await db.insert(auditLog).values({
                    entityType: "event_expense",
                    entityId: expenseId,
                    action: "update_expense",
                    changes: { isPaid: { old: String(row.isPaid), new: String(isPaid) } },
                    metadata: { eventId, expenseId, purposeText: row.purposeText },
                    changedBy: session.user.email,
                });
            }
            return NextResponse.json({ success: true });
        }

        // Amount — blocked by either lock
        if (body.amount !== undefined && (locks.lockedForParticipants || locks.lockedForReimbursement)) {
            const reason = "Nelze měnit částku — akce je uzamčena";
            await logBlockedAttempt(db, { attemptedAction: "update_expense", reason, changedBy: session.user.email, eventId, expenseId });
            return NextResponse.json({ error: reason }, { status: 409 });
        }

        // Metadata (kategorie, popis, příjemce, invoicePayeeName) — blocked by lock_for_reimbursement
        const hasMetadataChange = body.purposeCategory !== undefined || body.purposeText !== undefined
            || body.reimbursementPersonId !== undefined || body.invoicePayeeName !== undefined;
        if (hasMetadataChange && locks.lockedForReimbursement) {
            const reason = "Nelze měnit doklad — výdajový zámek je aktivní";
            await logBlockedAttempt(db, { attemptedAction: "update_expense", reason, changedBy: session.user.email, eventId, expenseId });
            return NextResponse.json({ error: reason }, { status: 409 });
        }

        // Build update from provided fields
        let amount: number | undefined;
        let purposeText: string | undefined;
        let purposeCategory: typeof expenseCategoryEnum[number] | undefined;
        let isPaid: boolean | undefined;
        let invoicePayeeName: string | null | undefined;
        let reimbursementPersonId: number | null | undefined;
        let reimbursementMemberId: number | null | undefined;

        if (body.amount !== undefined) {
            const parsed = parseFloat(String(body.amount ?? "").replace(",", "."));
            if (isNaN(parsed) || parsed <= 0) return NextResponse.json({ error: "Neplatná částka" }, { status: 400 });
            amount = parsed;
        }

        // Baseline z Gemini analýzy (při potvrzení draftu) — jen metadata, nepodléhá zámkům částky
        let analyzedAmount: string | null | undefined;
        if (body.analyzedAmount !== undefined) {
            if (body.analyzedAmount === null) {
                analyzedAmount = null;
            } else {
                const parsed = parseFloat(String(body.analyzedAmount).replace(",", "."));
                analyzedAmount = !isNaN(parsed) ? String(parsed) : null;
            }
        }

        if (body.purposeText !== undefined) {
            purposeText = String(body.purposeText ?? "").trim();
            if (!purposeText) return NextResponse.json({ error: "Chybí účel" }, { status: 400 });
        }

        if (body.purposeCategory !== undefined) {
            const cat = String(body.purposeCategory ?? "");
            if (!(expenseCategoryEnum as readonly string[]).includes(cat)) {
                return NextResponse.json({ error: "Neplatná kategorie" }, { status: 400 });
            }
            purposeCategory = cat as typeof expenseCategoryEnum[number];
        }

        if (body.isPaid !== undefined) {
            isPaid = body.isPaid !== false && body.isPaid !== 0 && body.isPaid !== "false";
        }

        if (body.invoicePayeeName !== undefined) {
            invoicePayeeName = body.invoicePayeeName !== null ? String(body.invoicePayeeName).trim() || null : null;
        }

        if (body.reimbursementPersonId !== undefined || body.reimbursementMemberId !== undefined) {
            const personIdRaw = body.reimbursementPersonId === null || body.reimbursementPersonId === undefined
                ? "" : String(body.reimbursementPersonId).trim();
            const memberIdRaw = body.reimbursementMemberId === null || body.reimbursementMemberId === undefined
                ? "" : String(body.reimbursementMemberId).trim();
            const reimbursement = await resolveReimbursementTarget(db, personIdRaw, memberIdRaw);
            if ("error" in reimbursement) return reimbursement.error;
            reimbursementPersonId = reimbursement.value.reimbursementPersonId;
            reimbursementMemberId = reimbursement.value.reimbursementMemberId;
        }

        await db.update(eventExpenses)
            .set({
                ...(amount !== undefined && { amount: String(amount), status: "final" }),
                ...(analyzedAmount !== undefined && { analyzedAmount }),
                ...(purposeText !== undefined && { purposeText }),
                ...(purposeCategory !== undefined && { purposeCategory }),
                ...(isPaid !== undefined && { isPaid }),
                ...(invoicePayeeName !== undefined && { invoicePayeeName }),
                ...(reimbursementPersonId !== undefined && { reimbursementPersonId }),
                ...(reimbursementMemberId !== undefined && { reimbursementMemberId }),
            })
            .where(eq(eventExpenses.id, expenseId));

        // Audit — diff jen reálně změněných polí (staré hodnoty z načteného řádku).
        const norm = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
        const changes: Record<string, { old: string | null; new: string | null }> = {};
        const diff = (field: string, oldV: unknown, newV: unknown) => {
            const o = norm(oldV), n = norm(newV);
            if (o !== n) changes[field] = { old: o, new: n };
        };
        if (amount !== undefined) diff("amount", row.amount, String(amount));
        if (analyzedAmount !== undefined) diff("analyzedAmount", row.analyzedAmount, analyzedAmount);
        if (purposeText !== undefined) diff("purposeText", row.purposeText, purposeText);
        if (purposeCategory !== undefined) diff("purposeCategory", row.purposeCategory, purposeCategory);
        if (isPaid !== undefined) diff("isPaid", row.isPaid, isPaid);
        if (invoicePayeeName !== undefined) diff("invoicePayeeName", row.invoicePayeeName, invoicePayeeName);
        if (reimbursementPersonId !== undefined) diff("reimbursementPersonId", row.reimbursementPersonId, reimbursementPersonId);
        if (reimbursementMemberId !== undefined) diff("reimbursementMemberId", row.reimbursementMemberId, reimbursementMemberId);

        if (Object.keys(changes).length > 0) {
            await db.insert(auditLog).values({
                entityType: "event_expense",
                entityId: expenseId,
                action: "update_expense",
                changes,
                metadata: { eventId, expenseId, purposeText: purposeText ?? row.purposeText },
                changedBy: session.user.email,
            });
        }

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
        const locks = await getExpenseLocks(db, eventId);
        if (!locks) return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        if (locks.lockedForParticipants || locks.lockedForReimbursement) {
            const reason = "Nelze mazat náklady — akce je uzamčena";
            await logBlockedAttempt(db, { attemptedAction: "delete_expense", reason, changedBy: session.user.email, eventId, expenseId: Number(expenseId) || undefined });
            return NextResponse.json({ error: reason }, { status: 409 });
        }

        const [expRow] = await db.select().from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));

        if (!expRow || expRow.eventId !== eventId) {
            return NextResponse.json({ error: "Doklad nenalezen" }, { status: 404 });
        }

        if (expRow.fileUrl) {
            await del(expRow.fileUrl);
        }

        await db.delete(eventExpenses).where(eq(eventExpenses.id, expenseId));

        // Audit — klíčová pole do changes (čitelnost), celý smazaný řádek do metadata (forenzní snapshot).
        await db.insert(auditLog).values({
            entityType: "event_expense",
            entityId: expRow.id,
            action: "delete_expense",
            changes: {
                amount: { old: expRow.amount ?? null, new: null },
                purposeText: { old: expRow.purposeText ?? null, new: null },
                purposeCategory: { old: expRow.purposeCategory ?? null, new: null },
            },
            metadata: { eventId, expenseId: expRow.id, purposeText: expRow.purposeText, snapshot: expRow },
            changedBy: session.user.email,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Interní chyba";
        console.error("[DELETE /api/events/expenses]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
