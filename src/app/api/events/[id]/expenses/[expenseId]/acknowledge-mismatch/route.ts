import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses, events, auditLog } from "@/db/schema";
import { isTreasurerOfOddil } from "@/lib/treasurer";
import { hasAmountMismatch } from "@/lib/expense-mismatch";
import { logBlockedAttempt } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Potvrdí AKTUÁLNÍ neshodu zjištěné vs. zapsané částky jako v pořádku (typicky jiná měna
 * dokladu — faktura v EUR, zaplaceno v CZK — což se nikdy "neopraví" na číselnou shodu).
 * Jen hospodář (hospodář oddílu, kterému doklad patří). Váže se přesně na dvojici (amount, analyzedAmount) v okamžiku potvrzení —
 * jakákoli pozdější změna (nový doklad, oprava částky) potvrzení automaticky zneplatní
 * (viz isMismatchAcknowledged v lib/expense-mismatch.ts).
 *
 * lockForReimbursement blokuje bez výjimky (stejně jako attach-file/reanalyze — plně
 * uzavřená akce se už nemění vůbec). lockForParticipants nic neomezuje navíc, protože
 * akce je stejně vyhrazena hospodáři.
 */
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

        const [eventRow] = await db
            .select({ lockForReimbursement: events.lockForReimbursement, oddil: events.oddil })
            .from(events)
            .where(eq(events.id, eventId));
        if (!eventRow) return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        if (!isTreasurerOfOddil(session.user.email, eventRow.oddil)) {
            return NextResponse.json({ error: "Neshodu smí potvrdit jen hospodář" }, { status: 403 });
        }
        if (eventRow.lockForReimbursement) {
            const reason = "Nelze potvrdit neshodu — výdajový zámek je aktivní";
            await logBlockedAttempt(db, { attemptedAction: "acknowledge_expense_mismatch", reason, changedBy: session.user.email, eventId, expenseId });
            return NextResponse.json({ error: reason }, { status: 409 });
        }

        const [expense] = await db
            .select({
                id: eventExpenses.id,
                eventId: eventExpenses.eventId,
                amount: eventExpenses.amount,
                analyzedAmount: eventExpenses.analyzedAmount,
                purposeText: eventExpenses.purposeText,
            })
            .from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));

        if (!expense || expense.eventId !== eventId) {
            return NextResponse.json({ error: "Doklad nenalezen" }, { status: 404 });
        }
        if (!hasAmountMismatch(expense.amount, expense.analyzedAmount)) {
            return NextResponse.json({ error: "U tohoto dokladu není žádná neshoda k potvrzení" }, { status: 400 });
        }

        await db
            .update(eventExpenses)
            .set({
                mismatchAcknowledgedAmount: expense.amount,
                mismatchAcknowledgedAnalyzedAmount: expense.analyzedAmount,
                mismatchAcknowledgedBy: session.user.email,
                mismatchAcknowledgedAt: new Date(),
            })
            .where(eq(eventExpenses.id, expenseId));

        await db.insert(auditLog).values({
            entityType: "event_expense",
            entityId: expenseId,
            action: "acknowledge_expense_mismatch",
            changes: {
                amount: { old: null, new: expense.amount },
                analyzedAmount: { old: null, new: expense.analyzedAmount },
            },
            metadata: { eventId, expenseId, purposeText: expense.purposeText },
            changedBy: session.user.email,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Interní chyba";
        console.error("[POST acknowledge-mismatch]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
