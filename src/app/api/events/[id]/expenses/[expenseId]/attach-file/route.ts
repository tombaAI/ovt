import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses, events, auditLog } from "@/db/schema";
import { analyzeExpenseFile, ExpenseAnalysisConfigError } from "@/lib/expense-analysis";
import { isTreasurer } from "@/lib/treasurer";
import { evaluateLockedMismatchGate, analyzedMatchesAmount } from "@/lib/expense-mismatch";
import { logBlockedAttempt } from "@/lib/audit";
import { isAllowedExpenseFile, resolveExpenseFileMime } from "@/lib/expense-file-validation";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Přiložení NEBO výměna souboru dokladu — pro libovolný náklad (isPaid true/false, s fileUrl i bez).
 * Při každém nahrání proběhne Gemini analýza a uloží se analyzed_amount (baseline pro kontrolu shody).
 *
 * Zamčené předpisy (lockForParticipants): server ignoruje klientem poslanou částku (obrana proti
 * obejití zámku) a neshodu smí uložit jen hospodář po potvrzení. Odemčeno: částka editovatelná bez gate.
 * lockForReimbursement: tvrdě blokováno, bez výjimky.
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
            })
            .from(events)
            .where(eq(events.id, eventId));
        if (!eventRow) return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        if (eventRow.lockForReimbursement) {
            const reason = "Nelze přikládat soubory — výdajový zámek je aktivní";
            await logBlockedAttempt(db, { attemptedAction: "attach_expense_file", reason, changedBy: session.user.email, eventId, expenseId });
            return NextResponse.json({ error: reason }, { status: 409 });
        }

        const [expense] = await db
            .select({ id: eventExpenses.id, eventId: eventExpenses.eventId, amount: eventExpenses.amount, analyzedAmount: eventExpenses.analyzedAmount, fileUrl: eventExpenses.fileUrl, fileName: eventExpenses.fileName, purposeText: eventExpenses.purposeText })
            .from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));

        if (!expense || expense.eventId !== eventId) {
            return NextResponse.json({ error: "Doklad nenalezen" }, { status: 404 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const clientAmountRaw = String(formData.get("amount") ?? "").replace(",", ".").trim();
        const confirmMismatch = String(formData.get("confirmMismatch") ?? "") === "true";

        if (!file || file.size === 0) {
            return NextResponse.json({ error: "Nebyl vybrán žádný soubor" }, { status: 400 });
        }
        if (!isAllowedExpenseFile(file.type, file.name)) {
            return NextResponse.json(
                { error: "Nepodporovaný typ souboru (povoleno: PDF, JPEG, PNG, WebP, HEIC, XLS, XLSX)" },
                { status: 400 },
            );
        }
        if (file.size > MAX_FILE_BYTES) {
            return NextResponse.json({ error: "Soubor je příliš velký (max 10 MB)" }, { status: 400 });
        }

        // Gemini analýza nové přílohy
        const analysis = await analyzeExpenseFile(file, { user: session.user.email, source: "attach-file" });
        const analyzedAmount = analysis.total_amount;

        const locked = eventRow.lockForParticipants;

        // Určení částky k uložení + brána neshody
        let amountToSave: string | null;
        if (locked) {
            // Ignoruj klientskou částku, použij aktuální z DB
            amountToSave = expense.amount;
            const gate = evaluateLockedMismatchGate({
                amount: expense.amount,
                analyzedAmount,
                isTreasurer: isTreasurer(session.user.email),
                confirmMismatch,
            });
            if (!gate.ok) {
                await logBlockedAttempt(db, { attemptedAction: "attach_expense_file", reason: gate.error, changedBy: session.user.email, eventId, expenseId });
                return NextResponse.json({ error: gate.error, code: gate.code, analysis }, { status: 409 });
            }
        } else {
            // Odemčeno — použij klientem poslanou částku (mohla být upravena), jinak ponech stávající
            if (clientAmountRaw) {
                const parsed = parseFloat(clientAmountRaw);
                if (isNaN(parsed) || parsed <= 0) {
                    return NextResponse.json({ error: "Neplatná částka" }, { status: 400 });
                }
                amountToSave = String(parsed);
            } else {
                amountToSave = expense.amount;
            }
        }

        // Uložení v bezpečném pořadí: nahrát nový → zapsat DB → teprve pak smazat starý blob.
        const safeMime = resolveExpenseFileMime(file.type, file.name);
        const ext = file.name.split(".").pop() ?? "bin";
        const safeName = `events/${eventId}/expenses/${expenseId}_${Date.now()}.${ext}`;
        const blob = await put(safeName, file, { access: "private", contentType: safeMime });

        const newAnalyzedAmount = analyzedAmount != null ? String(analyzedAmount) : null;
        await db
            .update(eventExpenses)
            .set({
                fileUrl: blob.url,
                fileName: file.name,
                fileMime: safeMime,
                analyzedAmount: newAnalyzedAmount,
                ...(locked ? {} : { amount: amountToSave }),
            })
            .where(eq(eventExpenses.id, expenseId));

        // Audit — diff přílohy/částky + metadata (výměna? přebil hospodář neshodu?).
        const changes: Record<string, { old: string | null; new: string | null }> = {
            fileUrl: { old: expense.fileUrl ?? null, new: blob.url },
            fileName: { old: expense.fileName ?? null, new: file.name },
            analyzedAmount: { old: expense.analyzedAmount ?? null, new: newAnalyzedAmount },
        };
        if (!locked && amountToSave !== expense.amount) {
            changes.amount = { old: expense.amount ?? null, new: amountToSave };
        }
        // mismatchOverridden: v zamčeném stavu gate prošel, ale částka se přesto neshoduje → hospodář ji přebil.
        const mismatchOverridden = locked && !analyzedMatchesAmount(amountToSave, analyzedAmount);
        await db.insert(auditLog).values({
            entityType: "event_expense",
            entityId: expenseId,
            action: "attach_expense_file",
            changes,
            metadata: { eventId, expenseId, purposeText: expense.purposeText, replaced: !!expense.fileUrl, mismatchOverridden },
            changedBy: session.user.email,
        });

        if (expense.fileUrl) {
            try {
                await del(expense.fileUrl);
            } catch (e) {
                // Osiřelý starý blob = jen plýtvání úložištěm, ne datová ztráta — neselháváme kvůli tomu.
                console.error("[attach-file] smazání starého blobu selhalo", e);
            }
        }

        return NextResponse.json({ success: true, analysis });
    } catch (err) {
        if (err instanceof ExpenseAnalysisConfigError) {
            return NextResponse.json({ error: err.message }, { status: 503 });
        }
        const msg = err instanceof Error ? err.message : "Interní chyba";
        console.error("[POST attach-file]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
