"use server";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { getEmailSettings, getResendClient } from "@/lib/email";
import {
    events,
    eventRegistrations,
    eventPaymentPrescriptions,
    type EventPaymentPrescriptionStatus,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

const FOREIGN_WATER_FORM_SLUG = "zahranicnivoda";
const FOREIGN_WATER_EVENT_ID = 4;
const FOREIGN_WATER_EVENT_NAME = "Zahraniční zájezd - Isel";

const FOREIGN_WATER_BANK_ACCOUNT = "351416278/0300";
const FOREIGN_WATER_VARIABLE_SYMBOL = "20702";
const FOREIGN_WATER_AMOUNT = 2500;

const dec = (value: number): string => value.toFixed(2);

function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function formatForeignWaterCode(code: number): string {
    return String(code).padStart(3, "0");
}

function buildForeignWaterPaymentMessage(code: number, fullName: string): string {
    return `C${formatForeignWaterCode(code)} prihlaska ${fullName} akce zahranicni voda`;
}

function formatCurrencyCzk(amount: number): string {
    return new Intl.NumberFormat("cs-CZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildForeignWaterPaymentQrPayload(messageForRecipient: string): string {
    return [
        "SPD*1.0",
        `ACC:${FOREIGN_WATER_BANK_ACCOUNT}`,
        `AM:${dec(FOREIGN_WATER_AMOUNT)}`,
        "CC:CZK",
        `X-VS:${FOREIGN_WATER_VARIABLE_SYMBOL}`,
        `MSG:${messageForRecipient}`,
    ].join("*");
}

async function buildForeignWaterPaymentQrDataUrl(messageForRecipient: string): Promise<string> {
    const payload = buildForeignWaterPaymentQrPayload(messageForRecipient);
    return QRCode.toDataURL(payload, {
        errorCorrectionLevel: "M",
        width: 360,
        margin: 1,
    });
}

export type ForeignWaterEventContext = {
    id: number;
    year: number;
    name: string;
    dateFrom: string | null;
    dateTo: string | null;
    location: string | null;
};

export type ForeignWaterFormContext = {
    event: ForeignWaterEventContext | null;
    payment: {
        bankAccount: string;
        variableSymbol: string;
        amount: number;
    };
};

async function resolveForeignWaterEvent(): Promise<ForeignWaterEventContext | null> {
    const db = getDb();

    const [event] = await db
        .select({
            id: events.id,
            year: events.year,
            name: events.name,
            dateFrom: events.dateFrom,
            dateTo: events.dateTo,
            location: events.location,
        })
        .from(events)
        .where(and(
            eq(events.id, FOREIGN_WATER_EVENT_ID),
            eq(events.name, FOREIGN_WATER_EVENT_NAME),
        ))
        .limit(1);

    if (!event) return null;

    return {
        id: event.id,
        year: Number(event.year),
        name: event.name,
        dateFrom: event.dateFrom as unknown as string | null,
        dateTo: event.dateTo as unknown as string | null,
        location: event.location,
    };
}

async function sendForeignWaterConfirmationEmail(params: {
    recipientEmail: string;
    fullName: string;
    eventName: string;
    paymentCodeLabel: string;
    messageForRecipient: string;
    qrCodeDataUrl: string;
}): Promise<{ sent: boolean; error: string | null }> {
    const settings = getEmailSettings();
    if (!settings.configured) {
        return { sent: false, error: "E-mailové potvrzení se nepodařilo odeslat, protože e-mailová služba není nakonfigurována." };
    }

    const resend = getResendClient();
    const htmlMessage = escapeHtml(params.messageForRecipient);
    const htmlEventName = escapeHtml(params.eventName);
    const htmlName = escapeHtml(params.fullName);
    const htmlPaymentCode = escapeHtml(params.paymentCodeLabel);
    const amountCzk = formatCurrencyCzk(FOREIGN_WATER_AMOUNT);

    try {
        await resend.emails.send({
            from: settings.from,
            to: [params.recipientEmail],
            replyTo: settings.replyTo,
            subject: `Potvrzení přihlášky - ${params.eventName}`,
            text: [
                `Ahoj ${params.fullName},`,
                "",
                `potvrzujeme přihlášku na akci ${params.eventName}.`,
                "",
                `Evidenční číslo předpisu: C${params.paymentCodeLabel}`,
                `Číslo účtu: ${FOREIGN_WATER_BANK_ACCOUNT}`,
                `VS: ${FOREIGN_WATER_VARIABLE_SYMBOL}`,
                `Částka: ${amountCzk} Kč`,
                `Zpráva pro příjemce: ${params.messageForRecipient}`,
                "",
                "V příloze je QR kód platby.",
            ].join("\n"),
            html: `
                <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
                    <p>Ahoj ${htmlName},</p>
                    <p>potvrzujeme přihlášku na akci <strong>${htmlEventName}</strong>.</p>
                    <p>
                        <strong>Evidenční číslo předpisu:</strong> C${htmlPaymentCode}<br>
                        <strong>Číslo účtu:</strong> ${FOREIGN_WATER_BANK_ACCOUNT}<br>
                        <strong>VS:</strong> ${FOREIGN_WATER_VARIABLE_SYMBOL}<br>
                        <strong>Částka:</strong> ${amountCzk} Kč<br>
                        <strong>Zpráva pro příjemce:</strong> ${htmlMessage}
                    </p>
                    <p><strong>QR kód pro platbu:</strong></p>
                    <p><img src="${params.qrCodeDataUrl}" alt="QR kód platby" width="240" height="240" /></p>
                    <p style="color: #6b7280; font-size: 12px;">V příloze najdeš stejný QR kód jako obrázek PNG.</p>
                </div>
            `,
            attachments: [
                {
                    filename: `qr-platba-C${params.paymentCodeLabel}.png`,
                    content: params.qrCodeDataUrl.replace(/^data:image\/png;base64,/, ""),
                },
            ],
        });
        return { sent: true, error: null };
    } catch {
        return { sent: false, error: "Potvrzení se nepodařilo doručit e-mailem, ale přihláška byla uložena." };
    }
}

export async function getForeignWaterFormContext(): Promise<ForeignWaterFormContext> {
    return {
        event: await resolveForeignWaterEvent(),
        payment: {
            bankAccount: FOREIGN_WATER_BANK_ACCOUNT,
            variableSymbol: FOREIGN_WATER_VARIABLE_SYMBOL,
            amount: FOREIGN_WATER_AMOUNT,
        },
    };
}

export type SubmitForeignWaterRegistrationInput = {
    email: string;
    firstName: string;
    lastName: string;
    personsCount: number;
    personsNames: string;
    transportInfo: string;
};

export type SubmitForeignWaterRegistrationResult =
    | { error: string }
    | {
        success: true;
        registrationId: number;
        submittedAt: string;
        confirmationEmail: string;
        emailSent: boolean;
        emailError: string | null;
        payment: {
            code: number;
            codeLabel: string;
            bankAccount: string;
            variableSymbol: string;
            amount: number;
            messageForRecipient: string;
            qrCodeDataUrl: string;
        };
    };

export async function submitForeignWaterRegistration(
    input: SubmitForeignWaterRegistrationInput,
): Promise<SubmitForeignWaterRegistrationResult> {
    const email = normalizeText(input.email).toLowerCase();
    const firstName = normalizeText(input.firstName);
    const lastName = normalizeText(input.lastName);
    const personsNames = normalizeText(input.personsNames);
    const transportInfo = normalizeText(input.transportInfo);

    const personsCountRaw = Number(input.personsCount);
    const personsCount = Number.isFinite(personsCountRaw) ? Math.trunc(personsCountRaw) : 0;

    if (!email || !firstName || !lastName) {
        return { error: "Vyplň prosím e-mail, jméno a příjmení." };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: "Zadej platnou e-mailovou adresu." };
    }

    if (personsCount < 1 || personsCount > 50) {
        return { error: "Počet osob musí být mezi 1 a 50." };
    }

    if (personsCount > 1 && !personsNames) {
        return { error: "Vyplň prosím jména dalších osob." };
    }

    const event = await resolveForeignWaterEvent();
    if (!event) {
        return {
            error: `Akce ID ${FOREIGN_WATER_EVENT_ID} (${FOREIGN_WATER_EVENT_NAME}) nebyla v IS nalezena. Kontaktuj prosím organizátora.`,
        };
    }

    const db = getDb();

    const created = await db.transaction(async (tx) => {
        const [registration] = await tx
            .insert(eventRegistrations)
            .values({
                eventId: event.id,
                formSlug: FOREIGN_WATER_FORM_SLUG,
                email,
                firstName,
                lastName,
                personsCount,
                personsNames: personsNames || null,
                transportInfo: transportInfo || null,
            })
            .returning({
                id: eventRegistrations.id,
                createdAt: eventRegistrations.createdAt,
            });

        const seqResult = await tx.execute(
            sql`SELECT nextval('app.event_payment_prescription_code_seq')::int AS code`,
        );
        const seqRows = seqResult as unknown as Array<{ code: number }>;
        const code = Number(seqRows[0]?.code ?? 0);

        if (!Number.isInteger(code) || code < 210) {
            throw new Error("Nepodařilo se vygenerovat číslo předpisu.");
        }

        const fullName = normalizeText(`${firstName} ${lastName}`);
        const messageForRecipient = buildForeignWaterPaymentMessage(code, fullName);

        await tx.insert(eventPaymentPrescriptions).values({
            eventId: event.id,
            registrationId: registration.id,
            prescriptionCode: code,
            bankAccount: FOREIGN_WATER_BANK_ACCOUNT,
            variableSymbol: FOREIGN_WATER_VARIABLE_SYMBOL,
            amount: dec(FOREIGN_WATER_AMOUNT),
            messageForRecipient,
            status: "pending",
        });

        return {
            registrationId: registration.id,
            submittedAt: (registration.createdAt as unknown as Date).toISOString(),
            code,
            messageForRecipient,
        };
    });

    const qrCodeDataUrl = await buildForeignWaterPaymentQrDataUrl(created.messageForRecipient);
    const emailResult = await sendForeignWaterConfirmationEmail({
        recipientEmail: email,
        fullName: normalizeText(`${firstName} ${lastName}`),
        eventName: event.name,
        paymentCodeLabel: formatForeignWaterCode(created.code),
        messageForRecipient: created.messageForRecipient,
        qrCodeDataUrl,
    });

    revalidatePath("/dashboard/events");
    revalidatePath(`/prihlaska/${FOREIGN_WATER_FORM_SLUG}`);

    return {
        success: true,
        registrationId: created.registrationId,
        submittedAt: created.submittedAt,
        confirmationEmail: email,
        emailSent: emailResult.sent,
        emailError: emailResult.error,
        payment: {
            code: created.code,
            codeLabel: formatForeignWaterCode(created.code),
            bankAccount: FOREIGN_WATER_BANK_ACCOUNT,
            variableSymbol: FOREIGN_WATER_VARIABLE_SYMBOL,
            amount: FOREIGN_WATER_AMOUNT,
            messageForRecipient: created.messageForRecipient,
            qrCodeDataUrl,
        },
    };
}

export type EventRegistrationAdminRow = {
    registrationId: number;
    createdAt: Date;
    email: string;
    firstName: string;
    lastName: string;
    personsCount: number;
    personsNames: string | null;
    transportInfo: string | null;
    paymentId: number;
    paymentCode: number;
    paymentCodeLabel: string;
    paymentAccount: string;
    paymentVariableSymbol: string;
    paymentAmount: number;
    paymentMessageForRecipient: string;
    paymentStatus: EventPaymentPrescriptionStatus;
    matchedLedgerId: number | null;
};

export async function getEventRegistrationsForAdmin(eventId: number): Promise<EventRegistrationAdminRow[]> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    const rows = await db
        .select({
            registrationId: eventRegistrations.id,
            createdAt: eventRegistrations.createdAt,
            email: eventRegistrations.email,
            firstName: eventRegistrations.firstName,
            lastName: eventRegistrations.lastName,
            personsCount: eventRegistrations.personsCount,
            personsNames: eventRegistrations.personsNames,
            transportInfo: eventRegistrations.transportInfo,
            paymentId: eventPaymentPrescriptions.id,
            paymentCode: eventPaymentPrescriptions.prescriptionCode,
            paymentAccount: eventPaymentPrescriptions.bankAccount,
            paymentVariableSymbol: eventPaymentPrescriptions.variableSymbol,
            paymentAmount: eventPaymentPrescriptions.amount,
            paymentMessageForRecipient: eventPaymentPrescriptions.messageForRecipient,
            paymentStatus: eventPaymentPrescriptions.status,
            matchedLedgerId: eventPaymentPrescriptions.matchedLedgerId,
        })
        .from(eventRegistrations)
        .innerJoin(
            eventPaymentPrescriptions,
            eq(eventPaymentPrescriptions.registrationId, eventRegistrations.id),
        )
        .where(eq(eventRegistrations.eventId, eventId))
        .orderBy(desc(eventRegistrations.createdAt));

    return rows.map((row) => ({
        registrationId: row.registrationId,
        createdAt: row.createdAt as unknown as Date,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        personsCount: Number(row.personsCount),
        personsNames: row.personsNames,
        transportInfo: row.transportInfo,
        paymentId: row.paymentId,
        paymentCode: row.paymentCode,
        paymentCodeLabel: formatForeignWaterCode(row.paymentCode),
        paymentAccount: row.paymentAccount,
        paymentVariableSymbol: row.paymentVariableSymbol,
        paymentAmount: Number(row.paymentAmount),
        paymentMessageForRecipient: row.paymentMessageForRecipient,
        paymentStatus: row.paymentStatus,
        matchedLedgerId: row.matchedLedgerId,
    }));
}
