import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { eventExpenses, events, mailEvents, auditLog } from "@/db/schema";
import { getEmailSettings, getResendClient } from "@/lib/email";
import { buildInvoicePaymentInstructionEmail } from "@/lib/email-templates/invoice-payment-instruction";

export const dynamic = "force-dynamic";

async function fetchBlobAttachment(url: string, filename: string): Promise<{ filename: string; content: Buffer }> {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN není nastavený");

    if (!url.match(/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//)) {
        throw new Error(`Neplatná URL přílohy: ${url}`);
    }

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Přílohu ${filename} se nepodařilo načíst z úložiště`);

    return { filename, content: Buffer.from(await res.arrayBuffer()) };
}

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
        }

        const settings = getEmailSettings();
        if (!settings.configured) {
            return NextResponse.json(
                { error: "RESEND_API_KEY není nastavený. E-mail nelze odeslat." },
                { status: 503 },
            );
        }

        const hospodarEmail = process.env.EMAIL_HOSPODAR_ODDILU_TJB?.trim() || null;
        if (!hospodarEmail) {
            return NextResponse.json(
                { error: "ENV EMAIL_HOSPODAR_ODDILU_TJB není nastavený. Příjemce neznámý." },
                { status: 503 },
            );
        }

        const { id, expenseId: expenseIdStr } = await params;
        const eventId = Number(id);
        const expenseId = Number(expenseIdStr);

        if (isNaN(eventId) || eventId <= 0 || isNaN(expenseId) || expenseId <= 0) {
            return NextResponse.json({ error: "Neplatné ID" }, { status: 400 });
        }

        const db = getDb();

        const [expense] = await db
            .select({
                id: eventExpenses.id,
                eventId: eventExpenses.eventId,
                isPaid: eventExpenses.isPaid,
                amount: eventExpenses.amount,
                purposeText: eventExpenses.purposeText,
                invoicePayeeName: eventExpenses.invoicePayeeName,
                fileUrl: eventExpenses.fileUrl,
                fileName: eventExpenses.fileName,
                invoicePaymentSentAt: eventExpenses.invoicePaymentSentAt,
            })
            .from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));

        if (!expense || expense.eventId !== eventId) {
            return NextResponse.json({ error: "Doklad nenalezen" }, { status: 404 });
        }

        if (expense.isPaid) {
            return NextResponse.json(
                { error: "Doklad je označen jako zaplacený — pokyn k úhradě není potřeba." },
                { status: 400 },
            );
        }

        if (!expense.fileUrl || !expense.fileName) {
            return NextResponse.json(
                { error: "Doklad nemá přiloženou fakturu. Nejdříve nahrajte soubor faktury." },
                { status: 400 },
            );
        }

        const [event] = await db
            .select({ name: events.name })
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1);

        if (!event) {
            return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        }

        const attachment = await fetchBlobAttachment(expense.fileUrl, expense.fileName);

        const { subject, html } = buildInvoicePaymentInstructionEmail({
            eventName: event.name,
            payeeName: expense.invoicePayeeName ?? null,
            amount: expense.amount ? Number(expense.amount) : null,
            purposeText: expense.purposeText,
            fileName: expense.fileName,
            senderName: session.user.name ?? session.user.email,
        });

        const resend = getResendClient();
        const from = settings.from ?? "OVT Bohemians <onboarding@resend.dev>";
        const to = settings.testTo ?? hospodarEmail;

        const { data, error: sendError } = await resend.emails.send({
            from,
            to,
            subject,
            html,
            attachments: [{ filename: attachment.filename, content: attachment.content }],
        });

        const sentAt = new Date();

        await Promise.all([
            db.update(eventExpenses)
                .set({ invoicePaymentSentAt: sentAt })
                .where(eq(eventExpenses.id, expenseId)),
            db.insert(mailEvents).values({
                provider: "resend",
                direction: "outbound",
                eventType: "sent",
                emailType: "invoice_payment_instruction",
                messageId: data?.id ?? null,
                fromEmail: from,
                toEmail: to,
                subject,
                payload: {
                    eventId,
                    expenseId,
                    fileName: expense.fileName,
                    testTo: settings.testTo ?? null,
                    sendError: sendError ? String(sendError) : null,
                },
            }),
            db.insert(auditLog).values({
                entityType: "event_expense",
                entityId: expenseId,
                action: "send_invoice_payment",
                changes: { invoicePaymentSentAt: { old: expense.invoicePaymentSentAt?.toISOString() ?? null, new: sentAt.toISOString() } },
                metadata: { eventId, expenseId, purposeText: expense.purposeText, recipient: to },
                changedBy: session.user.email,
            }),
        ]);

        return NextResponse.json({ success: true, recipient: to });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Interní chyba";
        console.error("[POST send-invoice-payment]", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
