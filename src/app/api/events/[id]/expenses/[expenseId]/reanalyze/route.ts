import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses, events, auditLog } from "@/db/schema";
import { analyzeExpenseFile, ExpenseAnalysisConfigError } from "@/lib/expense-analysis";
import { fetchPrivateBlobAsFile } from "@/lib/blob-fetch";
import { isTreasurerOfOddil } from "@/lib/treasurer";
import { evaluateLockedMismatchGate } from "@/lib/expense-mismatch";
import { logBlockedAttempt } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Přeanalyzovat AKTUÁLNĚ přiloženou přílohu dokladu — bez nahrávání nového souboru.
 * Zapisuje jen analyzed_amount; amount ani soubor se nemění. Slouží k aktivaci/obnovení
 * kontroly shody u dokladů, které analýzu neměly (nebo po zlepšení promptu).
 *
 * Stejné brány jako u výměny přílohy: lockForReimbursement tvrdě blokuje (bez výjimky),
 * lockForParticipants + neshoda → jen hospodář po potvrzení (confirmMismatch).
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
            .select({
                lockForParticipants: events.lockForParticipants,
                lockForReimbursement: events.lockForReimbursement,
                oddil: events.oddil,
            })
            .from(events)
            .where(eq(events.id, eventId));
        if (!eventRow) return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        if (eventRow.lockForReimbursement) {
            const reason = "Nelze analyzovat — výdajový zámek je aktivní";
            await logBlockedAttempt(db, { attemptedAction: "reanalyze_expense", reason, changedBy: session.user.email, eventId, expenseId });
            return NextResponse.json({ error: reason }, { status: 409 });
        }

        const [expense] = await db
            .select({
                id: eventExpenses.id,
                eventId: eventExpenses.eventId,
                amount: eventExpenses.amount,
                analyzedAmount: eventExpenses.analyzedAmount,
                purposeText: eventExpenses.purposeText,
                fileUrl: eventExpenses.fileUrl,
                fileName: eventExpenses.fileName,
                fileMime: eventExpenses.fileMime,
            })
            .from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));

        if (!expense || expense.eventId !== eventId) {
            return NextResponse.json({ error: "Doklad nenalezen" }, { status: 404 });
        }
        if (!expense.fileUrl) {
            return NextResponse.json({ error: "Doklad nemá přílohu k analýze" }, { status: 400 });
        }

        const confirmMismatch = (() => {
            const url = new URL(request.url);
            return url.searchParams.get("confirmMismatch") === "true";
        })();

        const file = await fetchPrivateBlobAsFile(expense.fileUrl, expense.fileName, expense.fileMime);
        const analysis = await analyzeExpenseFile(file, { user: session.user.email, source: "reanalyze" });
        const analyzedAmount = analysis.total_amount;

        if (eventRow.lockForParticipants) {
            const gate = evaluateLockedMismatchGate({
                amount: expense.amount,
                analyzedAmount,
                isTreasurer: isTreasurerOfOddil(session.user.email, eventRow.oddil),
                confirmMismatch,
            });
            if (!gate.ok) {
                await logBlockedAttempt(db, { attemptedAction: "reanalyze_expense", reason: gate.error, changedBy: session.user.email, eventId, expenseId });
                return NextResponse.json({ error: gate.error, code: gate.code, analysis }, { status: 409 });
            }
        }

        const newAnalyzedAmount = analyzedAmount != null ? String(analyzedAmount) : null;
        await db
            .update(eventExpenses)
            .set({ analyzedAmount: newAnalyzedAmount })
            .where(eq(eventExpenses.id, expenseId));

        if ((expense.analyzedAmount ?? null) !== newAnalyzedAmount) {
            await db.insert(auditLog).values({
                entityType: "event_expense",
                entityId: expenseId,
                action: "reanalyze_expense",
                changes: { analyzedAmount: { old: expense.analyzedAmount ?? null, new: newAnalyzedAmount } },
                metadata: { eventId, expenseId, purposeText: expense.purposeText },
                changedBy: session.user.email,
            });
        }

        return NextResponse.json({ success: true, analysis });
    } catch (err) {
        if (err instanceof ExpenseAnalysisConfigError) {
            return NextResponse.json({ error: err.message }, { status: 503 });
        }
        const msg = err instanceof Error ? err.message : "Interní chyba";
        console.error("[POST reanalyze]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
