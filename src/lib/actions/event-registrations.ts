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

const FOREIGN_WATER_FORM_SLUG = "zahranicnivoda";
const FOREIGN_WATER_EVENT_ID = 4;
const FOREIGN_WATER_EVENT_NAME = "Zahraniční zájezd - Isel";

const FOREIGN_WATER_BANK_ACCOUNT = "351416278/0300";
const FOREIGN_WATER_VARIABLE_SYMBOL = "20702";
const FOREIGN_WATER_AMOUNT_PER_PERSON = 2500;

const dec = (value: number): string => value.toFixed(2);

function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function normalizeNameList(values: string[]): string[] {
    return values
        .map((value) => normalizeText(value))
        .filter(Boolean);
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

function splitBankAccount(bankAccount: string): { accountNumber: string; bankCode: string } {
    const [accountNumber, bankCode] = bankAccount.split("/");
    if (!accountNumber || !bankCode) {
        throw new Error("Neplatný formát bankovního účtu pro QR.");
    }
    return { accountNumber, bankCode };
}

function buildForeignWaterPayliboQrUrl(params: {
    amount: number;
    variableSymbol: string;
    bankAccount: string;
    messageForRecipient: string;
}): string {
    const { accountNumber, bankCode } = splitBankAccount(params.bankAccount);
    const message = encodeURIComponent(params.messageForRecipient);
    return (
        `https://api.paylibo.com/paylibo/generator/czech/image` +
        `?accountNumber=${accountNumber}` +
        `&bankCode=${bankCode}` +
        `&amount=${params.amount}` +
        `&currency=CZK` +
        `&vs=${params.variableSymbol}` +
        `&message=${message}` +
        `&size=260`
    );
}

function parseParticipantNames(rawValue: string | null, fallbackName: string): string[] {
    const parsed = (rawValue ?? "")
        .split(/[\n;,]+/)
        .map((name) => normalizeText(name))
        .filter(Boolean);

    if (parsed.length > 0) return parsed;
    return fallbackName ? [fallbackName] : [];
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
        amountPerPerson: number;
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
    personsCount: number;
    amount: number;
    messageForRecipient: string;
    qrCodeUrl: string;
}): Promise<{ sent: boolean; error: string | null }> {
    const settings = getEmailSettings();
    if (!settings.configured) {
        return { sent: false, error: "E-mailové potvrzení se nepodařilo odeslat, protože e-mailová služba není nakonfigurována." };
    }

    const resend = getResendClient();
    const htmlMessage = escapeHtml(params.messageForRecipient);
    const htmlEventName = escapeHtml(params.eventName);
    const htmlName = escapeHtml(params.fullName);
    const amountCzk = formatCurrencyCzk(params.amount);

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
                `Počet osob: ${params.personsCount}`,
                `Číslo účtu: ${FOREIGN_WATER_BANK_ACCOUNT}`,
                `VS: ${FOREIGN_WATER_VARIABLE_SYMBOL}`,
                `Částka: ${amountCzk} Kč`,
                `Zpráva pro příjemce: ${params.messageForRecipient}`,
                `QR kód: ${params.qrCodeUrl}`,
                "",
                "Po přihlášení v aplikaci vidíš stejné platební údaje i QR kód.",
            ].join("\n"),
            html: `
                <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
                    <p>Ahoj ${htmlName},</p>
                    <p>potvrzujeme přihlášku na akci <strong>${htmlEventName}</strong>.</p>
                    <p>
                        <strong>Počet osob:</strong> ${params.personsCount}<br>
                        <strong>Číslo účtu:</strong> ${FOREIGN_WATER_BANK_ACCOUNT}<br>
                        <strong>VS:</strong> ${FOREIGN_WATER_VARIABLE_SYMBOL}<br>
                        <strong>Částka:</strong> ${amountCzk} Kč<br>
                        <strong>Zpráva pro příjemce:</strong> ${htmlMessage}
                    </p>
                    <p><strong>QR kód pro platbu:</strong></p>
                    <p><img src="${params.qrCodeUrl}" alt="QR kód platby" width="240" height="240" /></p>
                </div>
            `,
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
            amountPerPerson: FOREIGN_WATER_AMOUNT_PER_PERSON,
        },
    };
}

export type SubmitForeignWaterRegistrationInput = {
    registrationId?: number;
    email: string;
    firstName: string;
    lastName: string;
    additionalPersons: string[];
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
            amountPerPerson: number;
            personsCount: number;
            messageForRecipient: string;
            qrCodeUrl: string;
        };
    };

export async function submitForeignWaterRegistration(
    input: SubmitForeignWaterRegistrationInput,
): Promise<SubmitForeignWaterRegistrationResult> {
    const email = normalizeText(input.email).toLowerCase();
    const firstName = normalizeText(input.firstName);
    const lastName = normalizeText(input.lastName);
    const fullName = normalizeText(`${firstName} ${lastName}`);
    const additionalPersons = normalizeNameList(input.additionalPersons ?? []);
    const participantNames = [fullName, ...additionalPersons];
    const personsCount = participantNames.length;
    const transportInfo = normalizeText(input.transportInfo);
    const amount = personsCount * FOREIGN_WATER_AMOUNT_PER_PERSON;

    if (!email || !firstName || !lastName) {
        return { error: "Vyplň prosím e-mail, jméno a příjmení." };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: "Zadej platnou e-mailovou adresu." };
    }

    if (personsCount < 1 || personsCount > 50) {
        return { error: "Počet osob musí být mezi 1 a 50." };
    }

    const event = await resolveForeignWaterEvent();
    if (!event) {
        return {
            error: `Akce ID ${FOREIGN_WATER_EVENT_ID} (${FOREIGN_WATER_EVENT_NAME}) nebyla v IS nalezena. Kontaktuj prosím organizátora.`,
        };
    }

    const db = getDb();

    const created = await db.transaction(async (tx) => {
        if (input.registrationId) {
            const [existingPrescription] = await tx
                .select({
                    code: eventPaymentPrescriptions.prescriptionCode,
                })
                .from(eventPaymentPrescriptions)
                .where(and(
                    eq(eventPaymentPrescriptions.registrationId, input.registrationId),
                    eq(eventPaymentPrescriptions.eventId, event.id),
                ))
                .limit(1);

            if (!existingPrescription) {
                throw new Error("Původní přihláška už nebyla nalezena. Obnov stránku a zkus to prosím znovu.");
            }

            const [registration] = await tx
                .update(eventRegistrations)
                .set({
                    email,
                    firstName,
                    lastName,
                    personsCount,
                    personsNames: participantNames.join("\n"),
                    transportInfo: transportInfo || null,
                })
                .where(and(
                    eq(eventRegistrations.id, input.registrationId),
                    eq(eventRegistrations.eventId, event.id),
                ))
                .returning({
                    id: eventRegistrations.id,
                });

            if (!registration) {
                throw new Error("Původní přihláška už nebyla nalezena. Obnov stránku a zkus to prosím znovu.");
            }

            const messageForRecipient = buildForeignWaterPaymentMessage(existingPrescription.code, fullName);

            await tx
                .update(eventPaymentPrescriptions)
                .set({
                    bankAccount: FOREIGN_WATER_BANK_ACCOUNT,
                    variableSymbol: FOREIGN_WATER_VARIABLE_SYMBOL,
                    amount: dec(amount),
                    messageForRecipient,
                    updatedAt: new Date(),
                })
                .where(and(
                    eq(eventPaymentPrescriptions.registrationId, registration.id),
                    eq(eventPaymentPrescriptions.eventId, event.id),
                ));

            return {
                registrationId: registration.id,
                submittedAt: new Date().toISOString(),
                code: existingPrescription.code,
                messageForRecipient,
            };
        }

        const [registration] = await tx
            .insert(eventRegistrations)
            .values({
                eventId: event.id,
                formSlug: FOREIGN_WATER_FORM_SLUG,
                email,
                firstName,
                lastName,
                personsCount,
                personsNames: participantNames.join("\n"),
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

        const messageForRecipient = buildForeignWaterPaymentMessage(code, fullName);

        await tx.insert(eventPaymentPrescriptions).values({
            eventId: event.id,
            registrationId: registration.id,
            prescriptionCode: code,
            bankAccount: FOREIGN_WATER_BANK_ACCOUNT,
            variableSymbol: FOREIGN_WATER_VARIABLE_SYMBOL,
            amount: dec(amount),
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

    const qrCodeUrl = buildForeignWaterPayliboQrUrl({
        amount,
        variableSymbol: FOREIGN_WATER_VARIABLE_SYMBOL,
        bankAccount: FOREIGN_WATER_BANK_ACCOUNT,
        messageForRecipient: created.messageForRecipient,
    });

    const emailResult = await sendForeignWaterConfirmationEmail({
        recipientEmail: email,
        fullName,
        eventName: event.name,
        personsCount,
        amount,
        messageForRecipient: created.messageForRecipient,
        qrCodeUrl,
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
            amount,
            amountPerPerson: FOREIGN_WATER_AMOUNT_PER_PERSON,
            personsCount,
            messageForRecipient: created.messageForRecipient,
            qrCodeUrl,
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
    participantNames: string[];
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
        participantNames: parseParticipantNames(row.personsNames, normalizeText(`${row.firstName} ${row.lastName}`)),
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
