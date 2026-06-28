"use server";

import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { getEmailSettings, getResendClient } from "@/lib/email";
import {
    events,
    eventRegistrations,
    eventRegistrationParticipants,
    eventPaymentPrescriptions,
    auditLog,
    members,
    type EventPaymentPrescriptionStatus,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getEventSettlement } from "@/lib/actions/event-settlement";

const FOREIGN_WATER_FORM_SLUG = "zahranicnivoda";
const FOREIGN_WATER_EVENT_ID = 4;
const FOREIGN_WATER_EVENT_NAME = "Zahraniční zájezd - Isel";

const FOREIGN_WATER_BANK_ACCOUNT = "351416278/0300";
const FOREIGN_WATER_VARIABLE_SYMBOL = "20702";
const FOREIGN_WATER_AMOUNT_PER_PERSON = 2500;
const FOREIGN_WATER_PUBLIC_TOKEN_BYTES = 24;

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

function formatDateCz(isoDate: string): string {
    const [year, month, day] = isoDate.split("-");
    return `${Number(day)}. ${Number(month)}. ${year}`;
}

function formatDateRangeCz(dateFrom: string | null, dateTo: string | null): string {
    if (dateFrom && dateTo && dateFrom !== dateTo) {
        return `${formatDateCz(dateFrom)} - ${formatDateCz(dateTo)}`;
    }
    if (dateFrom) return formatDateCz(dateFrom);
    return "termin bude doplnen";
}

function vocative(name: string): string {
    if (/něk$/.test(name))      return name.replace(/něk$/, "ňku");
    if (/ch$/.test(name))       return name + "u";
    if (/[aá]$/.test(name))     return name.slice(0, -1) + "o";
    if (/[eí]$/.test(name))     return name;
    if (/o$/.test(name))        return name;
    if (/[šžčřj]$/.test(name))  return name + "i";
    if (/k$/.test(name))        return name + "u";
    return name + "e";
}

function createPublicToken(): string {
    return randomBytes(FOREIGN_WATER_PUBLIC_TOKEN_BYTES).toString("hex");
}

function normalizePublicToken(value: string): string {
    return normalizeText(value).toLowerCase();
}

function isUniqueViolationError(error: unknown): boolean {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && (error as { code?: string }).code === "23505";
}

function sanitizeHost(rawHost: string): string | null {
    const candidate = rawHost.split(",")[0]?.trim() ?? "";
    if (!candidate) return null;
    if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(candidate)) return null;
    return candidate;
}

async function resolvePublicAppBaseUrl(): Promise<string> {
    try {
        const hdr = await headers();
        const host = sanitizeHost(hdr.get("x-forwarded-host") ?? hdr.get("host") ?? "");
        if (host) {
            const forwardedProto = normalizeText(hdr.get("x-forwarded-proto") ?? "").toLowerCase();
            const protocol = forwardedProto === "http" || forwardedProto === "https"
                ? forwardedProto
                : (host.startsWith("localhost") || host.startsWith("127.0.0.1"))
                    ? "http"
                    : "https";
            return `${protocol}://${host}`;
        }
    } catch {
        // No request context (e.g. some background/server-only invocations). Fall through to env fallback.
    }

    const configured = normalizeText(process.env.APP_BASE_URL ?? "");
    if (configured) {
        const normalized = configured.replace(/\/+$/, "");
        if (/^https?:\/\//.test(normalized)) return normalized;
    }

    const vercelUrl = normalizeText(process.env.VERCEL_URL ?? "");
    if (vercelUrl) {
        const host = vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
        return `https://${host}`;
    }

    return "http://localhost:3000";
}

function buildForeignWaterRegistrationDetailUrl(publicToken: string, baseUrl: string): string {
    return `${baseUrl}/prihlaska/${FOREIGN_WATER_FORM_SLUG}/potvrzeni/${encodeURIComponent(publicToken)}`;
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

function buildForeignWaterConfirmationEmail(params: {
        fullName: string;
        firstName: string;
        lastName: string;
        email: string;
        phone: string | null;
        eventName: string;
        eventDateFrom: string | null;
        eventDateTo: string | null;
        eventLocation: string | null;
        participantNames: string[];
        transportInfo: string | null;
        codeLabel: string;
        personsCount: number;
        amount: number;
        amountPerPerson: number;
        messageForRecipient: string;
        qrCodeUrl: string;
        detailUrl: string;
}): { subject: string; text: string; html: string } {
        const amountCzk = formatCurrencyCzk(params.amount);
        const amountPerPersonCzk = formatCurrencyCzk(params.amountPerPerson);
        const eventDateLabel = formatDateRangeCz(params.eventDateFrom, params.eventDateTo);
        const eventLocation = params.eventLocation || "bude doplněno";
        const phoneLabel = params.phone || "neuvedeno";
        const htmlEventName = escapeHtml(params.eventName);
        const htmlFullName = escapeHtml(params.fullName);
        const htmlEmail = escapeHtml(params.email);
        const htmlPhone = escapeHtml(phoneLabel);
        const htmlEventDate = escapeHtml(eventDateLabel);
        const htmlEventLocation = escapeHtml(eventLocation);
        const htmlMessage = escapeHtml(params.messageForRecipient);
        const htmlTransport = params.transportInfo ? escapeHtml(params.transportInfo) : "neuvedeno";
        const htmlDetailUrl = escapeHtml(params.detailUrl);
        const addressedFirstName = vocative(params.firstName);
        const htmlParticipantItems = params.participantNames
                .map((name) => `<li style=\"margin:0 0 4px;\">${escapeHtml(name)}</li>`)
                .join("");

        const subject = `Potvrzení přihlášky - ${params.eventName}`;
        const text = [
                `Ahoj ${addressedFirstName},`,
                "",
                `potvrzujeme přihlášku na akci ${params.eventName}.`,
                "",
                "ÚDAJE Z PŘIHLÁŠKY",
                `Hlavní přihlašující: ${params.firstName} ${params.lastName}`,
                `E-mail: ${params.email}`,
                `Telefon: ${phoneLabel}`,
                `Akce: ${params.eventName}`,
                `Termín: ${eventDateLabel}`,
                `Místo: ${eventLocation}`,
                `Počet osob: ${params.personsCount}`,
                "Účastníci:",
                ...params.participantNames.map((name) => `- ${name}`),
                `Lodě / doprava: ${params.transportInfo || "neuvedeno"}`,
                "",
                "PLATEBNÍ ÚDAJE",
                `Číslo předpisu: C${params.codeLabel}`,
                `Číslo účtu: ${FOREIGN_WATER_BANK_ACCOUNT}`,
                `Variabilní symbol: ${FOREIGN_WATER_VARIABLE_SYMBOL}`,
                `Cena za osobu: ${amountPerPersonCzk} Kč`,
                `Částka celkem: ${amountCzk} Kč`,
                `Zpráva pro příjemce: ${params.messageForRecipient}`,
                `QR platba: ${params.qrCodeUrl}`,
                "",
                "Detail přihlášky:",
                "- stav přihlášky",
                "- stav zaplacení",
                "- možnost úpravy a zrušení",
                params.detailUrl,
                "",
                "Oddíl vodní turistiky TJ Bohemians, www.ovtbohemians.cz",
                "Tento e-mail byl odeslán ze systému OVT přihlašování na akce.",
        ].join("\n");

        const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:620px;width:100%;">

    <tr>
        <td style="background:#327600;padding:24px 32px;">
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">OVT Bohemians</p>
            <p style="margin:4px 0 0;color:#a3d977;font-size:14px;">Potvrzení přihlášky na akci</p>
        </td>
    </tr>

    <tr>
        <td style="padding:28px 32px 8px;">
            <p style="margin:0 0 16px;font-size:15px;color:#374151;">Ahoj <strong>${escapeHtml(addressedFirstName)}</strong>,</p>
            <p style="margin:0 0 22px;font-size:14px;color:#6b7280;line-height:1.6;">
                přihláška na akci <strong>${htmlEventName}</strong> byla úspěšně uložena.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px;">
                <tr><td colspan="2" style="padding:0 0 12px;">
                    <p style="margin:0;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Údaje z přihlášky</p>
                </td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Hlavní přihlašující</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${htmlFullName}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">E-mail</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${htmlEmail}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Telefon</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${htmlPhone}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Akce</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${htmlEventName}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Termín</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${htmlEventDate}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Místo</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${htmlEventLocation}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Počet osob</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${params.personsCount}</td></tr>
                <tr><td colspan="2" style="padding:12px 0 2px;color:#6b7280;font-size:14px;">Účastníci</td></tr>
                <tr><td colspan="2" style="padding:2px 0 0;font-size:14px;color:#111827;">
                    <ul style="margin:0;padding-left:18px;">${htmlParticipantItems}</ul>
                </td></tr>
                <tr><td colspan="2" style="padding:12px 0 0;color:#6b7280;font-size:14px;">Lodě / doprava</td></tr>
                <tr><td colspan="2" style="padding:2px 0 0;font-size:14px;color:#111827;">${htmlTransport}</td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px;background:#f9fafb;">
                <tr><td colspan="2" style="padding:0 0 12px;">
                    <p style="margin:0;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Platební údaje</p>
                </td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Číslo předpisu</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">C${params.codeLabel}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Číslo účtu</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${FOREIGN_WATER_BANK_ACCOUNT}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Variabilní symbol</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${FOREIGN_WATER_VARIABLE_SYMBOL}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Cena za osobu</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${amountPerPersonCzk} Kč</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#6b7280;font-size:14px;">Částka k úhradě</td><td style="padding:4px 0;font-size:17px;font-weight:700;color:#327600;text-align:right;">${amountCzk} Kč</td></tr>
                <tr><td colspan="2" style="padding:12px 0 0;color:#6b7280;font-size:14px;">Zpráva pro příjemce</td></tr>
                <tr><td colspan="2" style="padding:2px 0 0;font-size:14px;color:#111827;">${htmlMessage}</td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr><td align="center">
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">QR platba</p>
                    <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.5;">Naskenuj QR kód v mobilní aplikaci banky, nebo použij data výše.</p>
                    <img src="${params.qrCodeUrl}" width="220" height="220" alt="QR kód platby" style="display:block;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;margin:0 auto;" />
                </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dbe7d2;border-radius:8px;padding:14px;margin-bottom:20px;background:#f7fcf3;">
                <tr><td style="font-size:13px;color:#466133;line-height:1.6;">
                    <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#466133;">Detail přihlášky</p>
                    <p style="margin:0 0 12px;font-size:13px;color:#466133;line-height:1.6;">
                        V detailu přihlášky najdeš stav přihlášky, stav zaplacení i možnost úpravy a zrušení.
                    </p>
                    <a href="${htmlDetailUrl}" style="display:inline-block;background:#327600;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;line-height:1;padding:11px 16px;border-radius:8px;">
                        Otevřít detail přihlášky
                    </a>
                </td></tr>
            </table>

        </td>
    </tr>

    <tr>
        <td style="padding:20px 32px 24px;border-top:1px solid #2a6400;background:#327600;">
            <p style="margin:0 0 4px;font-size:12px;line-height:1.7;color:#e3f2d6;font-weight:400;">
                <strong style="font-weight:700;color:#ffffff;">Oddíl vodní turistiky TJ Bohemians</strong>,
                <a href="https://www.ovtbohemians.cz" style="color:#ffffff;text-decoration:underline;font-weight:400;">www.ovtbohemians.cz</a>
            </p>
            <p style="margin:0;font-size:12px;line-height:1.7;color:#e3f2d6;font-weight:400;">
                Tento e-mail byl odeslán ze systému OVT přihlašování na akce.
            </p>
        </td>
    </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

        return { subject, text, html };
}

async function sendForeignWaterConfirmationEmail(params: {
        recipientEmail: string;
        fullName: string;
        firstName: string;
        lastName: string;
        email: string;
        phone: string | null;
        eventName: string;
        eventDateFrom: string | null;
        eventDateTo: string | null;
        eventLocation: string | null;
        participantNames: string[];
        transportInfo: string | null;
        codeLabel: string;
        personsCount: number;
        amount: number;
        amountPerPerson: number;
        messageForRecipient: string;
        qrCodeUrl: string;
        detailUrl: string;
}): Promise<{ sent: boolean; error: string | null }> {
    const settings = getEmailSettings();
    if (!settings.configured) {
        return { sent: false, error: "E-mailové potvrzení se nepodařilo odeslat, protože e-mailová služba není nakonfigurována." };
    }

    const resend = getResendClient();
        const message = buildForeignWaterConfirmationEmail({
                fullName: params.fullName,
                firstName: params.firstName,
                lastName: params.lastName,
                email: params.email,
                phone: params.phone,
                eventName: params.eventName,
                eventDateFrom: params.eventDateFrom,
                eventDateTo: params.eventDateTo,
                eventLocation: params.eventLocation,
                participantNames: params.participantNames,
                transportInfo: params.transportInfo,
                codeLabel: params.codeLabel,
                personsCount: params.personsCount,
                amount: params.amount,
                amountPerPerson: params.amountPerPerson,
                messageForRecipient: params.messageForRecipient,
                qrCodeUrl: params.qrCodeUrl,
                detailUrl: params.detailUrl,
        });

    try {
        await resend.emails.send({
            from: settings.from,
            to: [params.recipientEmail],
            replyTo: settings.replyTo,
                        subject: message.subject,
                        text: message.text,
                        html: message.html,
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
    phone: string;
    firstName: string;
    lastName: string;
    primaryIsMember: boolean;
    additionalPersons: Array<{ name: string; isMember: boolean }>;
    transportInfo: string;
};

export type SubmitForeignWaterRegistrationResult =
    | { error: string }
    | {
        success: true;
        registrationId: number;
        registrationToken: string;
        registrationDetailUrl: string;
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

type ForeignWaterRegistrationSubmitTxResult = {
    registrationId: number;
    submittedAt: string;
    code: number;
    messageForRecipient: string;
    publicToken: string;
};

type ParticipantData = { fullName: string; isMember: boolean };

function buildParticipantInsertRows(registrationId: number, eventId: number, participants: ParticipantData[]) {
    return participants.map((p, index) => ({
        registrationId,
        eventId,
        participantOrder: index + 1,
        fullName: p.fullName,
        isPrimary: index === 0,
        isMember: p.isMember,
    }));
}

function normalizePersonList(persons: Array<{ name: string; isMember: boolean }>): ParticipantData[] {
    return persons
        .map((p) => ({ fullName: normalizeText(p.name), isMember: p.isMember }))
        .filter((p) => p.fullName);
}

export async function submitForeignWaterRegistration(
    input: SubmitForeignWaterRegistrationInput,
): Promise<SubmitForeignWaterRegistrationResult> {
    const email = normalizeText(input.email).toLowerCase();
    const phone = normalizeText(input.phone ?? "");
    const firstName = normalizeText(input.firstName);
    const lastName = normalizeText(input.lastName);
    const fullName = normalizeText(`${firstName} ${lastName}`);
    const primaryIsMember = input.primaryIsMember ?? false;
    const allParticipants: ParticipantData[] = [
        { fullName, isMember: primaryIsMember },
        ...normalizePersonList(input.additionalPersons ?? []),
    ];
    const personsCount = allParticipants.length;
    const participantNames = allParticipants.map((p) => p.fullName);
    const transportInfo = normalizeText(input.transportInfo);
    const amount = personsCount * FOREIGN_WATER_AMOUNT_PER_PERSON;

    if (!email || !phone || !firstName || !lastName || !transportInfo) {
        return { error: "Vyplň prosím e-mail, telefon, jméno, příjmení a typy lodí/dopravy." };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: "Zadej platnou e-mailovou adresu." };
    }

    if (phone.length > 60) {
        return { error: "Telefon je příliš dlouhý. Zkrať ho prosím na max. 60 znaků." };
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

    const created = await db.transaction(async (tx): Promise<ForeignWaterRegistrationSubmitTxResult> => {
        if (input.registrationId) {
            const [existing] = await tx
                .select({
                    code:            eventPaymentPrescriptions.prescriptionCode,
                    publicToken:     eventRegistrations.publicToken,
                    paymentStatus:   eventPaymentPrescriptions.status,
                    oldEmail:        eventRegistrations.email,
                    oldPhone:        eventRegistrations.phone,
                    oldFirstName:    eventRegistrations.firstName,
                    oldLastName:     eventRegistrations.lastName,
                    oldPersonsCount: eventRegistrations.personsCount,
                    oldPersonsNames: eventRegistrations.personsNames,
                    oldTransportInfo: eventRegistrations.transportInfo,
                    oldCancelledAt:  eventRegistrations.cancelledAt,
                })
                .from(eventRegistrations)
                .innerJoin(
                    eventPaymentPrescriptions,
                    and(
                        eq(eventPaymentPrescriptions.registrationId, eventRegistrations.id),
                        eq(eventPaymentPrescriptions.eventId, event.id),
                    ),
                )
                .where(and(
                    eq(eventRegistrations.id, input.registrationId),
                    eq(eventRegistrations.eventId, event.id),
                ))
                .limit(1);

            if (!existing) {
                throw new Error("Původní přihláška už nebyla nalezena. Obnov stránku a zkus to prosím znovu.");
            }

            const [registration] = await tx
                .update(eventRegistrations)
                .set({
                    email,
                    phone: phone || null,
                    firstName,
                    lastName,
                    personsCount,
                    personsNames: participantNames.join("\n"),
                    transportInfo: transportInfo || null,
                    cancelledAt: null,
                })
                .where(and(
                    eq(eventRegistrations.id, input.registrationId),
                    eq(eventRegistrations.eventId, event.id),
                ))
                .returning({
                    id: eventRegistrations.id,
                    createdAt: eventRegistrations.createdAt,
                });

            if (!registration) {
                throw new Error("Původní přihláška už nebyla nalezena. Obnov stránku a zkus to prosím znovu.");
            }

            await tx
                .delete(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.registrationId, registration.id));

            await tx
                .insert(eventRegistrationParticipants)
                .values(buildParticipantInsertRows(registration.id, event.id, allParticipants));

            const messageForRecipient = buildForeignWaterPaymentMessage(existing.code, fullName);

            const paymentUpdate: {
                bankAccount: string;
                variableSymbol: string;
                amount: string;
                messageForRecipient: string;
                updatedAt: Date;
                status?: EventPaymentPrescriptionStatus;
            } = {
                bankAccount: FOREIGN_WATER_BANK_ACCOUNT,
                variableSymbol: FOREIGN_WATER_VARIABLE_SYMBOL,
                amount: dec(amount),
                messageForRecipient,
                updatedAt: new Date(),
            };

            if (existing.paymentStatus === "cancelled") {
                paymentUpdate.status = "pending";
            }

            await tx
                .update(eventPaymentPrescriptions)
                .set(paymentUpdate)
                .where(and(
                    eq(eventPaymentPrescriptions.registrationId, registration.id),
                    eq(eventPaymentPrescriptions.eventId, event.id),
                ));

            // ── Audit log ─────────────────────────────────────────────────
            const auditChanges: Record<string, { old: string | null; new: string | null }> = {};
            const cmp = (a: string | null | undefined, b: string | null | undefined) =>
                (a ?? null) === (b ?? null);

            if (!cmp(existing.oldEmail, email))
                auditChanges.email = { old: existing.oldEmail, new: email };
            if (!cmp(existing.oldPhone, phone || null))
                auditChanges.phone = { old: existing.oldPhone ?? null, new: phone || null };
            if (!cmp(existing.oldFirstName, firstName))
                auditChanges.firstName = { old: existing.oldFirstName, new: firstName };
            if (!cmp(existing.oldLastName, lastName))
                auditChanges.lastName = { old: existing.oldLastName, new: lastName };
            if (Number(existing.oldPersonsCount) !== personsCount)
                auditChanges.personsCount = { old: String(existing.oldPersonsCount), new: String(personsCount) };
            if (!cmp(existing.oldPersonsNames, participantNames.join("\n")))
                auditChanges.personsNames = { old: existing.oldPersonsNames ?? null, new: participantNames.join(", ") };
            if (!cmp(existing.oldTransportInfo, transportInfo || null))
                auditChanges.transportInfo = { old: existing.oldTransportInfo ?? null, new: transportInfo || null };
            if (existing.oldCancelledAt !== null)
                auditChanges.cancelledAt = { old: "zrušeno", new: null };

            if (Object.keys(auditChanges).length > 0) {
                await tx.insert(auditLog).values({
                    entityType: "event_registration",
                    entityId:   registration.id,
                    action:     "update",
                    changes:    auditChanges,
                    changedBy:  email,
                });
            }

            return {
                registrationId: registration.id,
                submittedAt: (registration.createdAt as unknown as Date).toISOString(),
                code: existing.code,
                messageForRecipient,
                publicToken: existing.publicToken,
            };
        }

        let registration: {
            id: number;
            createdAt: Date;
            publicToken: string;
        } | null = null;

        for (let attempt = 0; attempt < 3 && !registration; attempt++) {
            const publicToken = createPublicToken();
            try {
                const [inserted] = await tx
                    .insert(eventRegistrations)
                    .values({
                        eventId: event.id,
                        formSlug: FOREIGN_WATER_FORM_SLUG,
                        email,
                        phone: phone || null,
                        firstName,
                        lastName,
                        publicToken,
                        personsCount,
                        personsNames: participantNames.join("\n"),
                        transportInfo: transportInfo || null,
                    })
                    .returning({
                        id: eventRegistrations.id,
                        createdAt: eventRegistrations.createdAt,
                        publicToken: eventRegistrations.publicToken,
                    });

                registration = {
                    id: inserted.id,
                    createdAt: inserted.createdAt as unknown as Date,
                    publicToken: inserted.publicToken,
                };
            } catch (error) {
                if (!isUniqueViolationError(error) || attempt === 2) {
                    throw error;
                }
            }
        }

        if (!registration) {
            throw new Error("Nepodařilo se vytvořit přihlášku. Zkus to prosím znovu.");
        }

        await tx
            .insert(eventRegistrationParticipants)
            .values(buildParticipantInsertRows(registration.id, event.id, allParticipants));

        const seqResult = await tx.execute(
            sql`SELECT nextval('app.event_payment_prescription_code_seq')::int AS code`,
        );
        const seqRows = seqResult as unknown as Array<{ code: number }>;
        const code = Number(seqRows[0]?.code ?? 0);

        if (!Number.isInteger(code) || code < 210) {
            throw new Error("Nepodařilo se vygenerovat číslo předpisu.");
        }

        // Kód uložit trvale na přihlášku — předpis ho jen přebírá
        await tx.update(eventRegistrations)
            .set({ prescriptionCode: code })
            .where(eq(eventRegistrations.id, registration.id));

        const messageForRecipient = buildForeignWaterPaymentMessage(code, fullName);

        await tx.insert(eventPaymentPrescriptions).values({
            eventId: event.id,
            registrationId: registration.id,
            type: "deposit",
            prescriptionCode: code,
            bankAccount: FOREIGN_WATER_BANK_ACCOUNT,
            variableSymbol: FOREIGN_WATER_VARIABLE_SYMBOL,
            amount: dec(amount),
            messageForRecipient,
            status: "pending",
        });

        return {
            registrationId: registration.id,
            submittedAt: registration.createdAt.toISOString(),
            code,
            messageForRecipient,
            publicToken: registration.publicToken,
        };
    });

    const publicAppBaseUrl = await resolvePublicAppBaseUrl();
    const registrationDetailUrl = buildForeignWaterRegistrationDetailUrl(created.publicToken, publicAppBaseUrl);
    const codeLabel = formatForeignWaterCode(created.code);

    const qrCodeUrl = buildForeignWaterPayliboQrUrl({
        amount,
        variableSymbol: FOREIGN_WATER_VARIABLE_SYMBOL,
        bankAccount: FOREIGN_WATER_BANK_ACCOUNT,
        messageForRecipient: created.messageForRecipient,
    });

    const emailResult = await sendForeignWaterConfirmationEmail({
        recipientEmail: email,
        fullName,
        firstName,
        lastName,
        email,
        phone: phone || null,
        eventName: event.name,
        eventDateFrom: event.dateFrom,
        eventDateTo: event.dateTo,
        eventLocation: event.location,
        participantNames,
        transportInfo: transportInfo || null,
        codeLabel,
        personsCount,
        amount,
        amountPerPerson: FOREIGN_WATER_AMOUNT_PER_PERSON,
        messageForRecipient: created.messageForRecipient,
        qrCodeUrl,
        detailUrl: registrationDetailUrl,
    });

    revalidatePath("/dashboard/events");
    revalidatePath(`/prihlaska/${FOREIGN_WATER_FORM_SLUG}`);
    revalidatePath(`/prihlaska/${FOREIGN_WATER_FORM_SLUG}/potvrzeni/${created.publicToken}`);

    return {
        success: true,
        registrationId: created.registrationId,
        registrationToken: created.publicToken,
        registrationDetailUrl,
        submittedAt: created.submittedAt,
        confirmationEmail: email,
        emailSent: emailResult.sent,
        emailError: emailResult.error,
        payment: {
            code: created.code,
            codeLabel,
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

export type ForeignWaterRegistrationParticipant = {
    id?: number;
    participantOrder: number;
    fullName: string;
    isPrimary: boolean;
    isMember: boolean;
    memberId?: number | null;
    memberName?: string | null;
    cancelledAt?: Date | null;
    depositRefundAmount?: number | null;
    depositForfeitPolicy?: string | null;
    depositForfeitExpenseId?: number | null;
};

export type ForeignWaterRegistrationDetail = {
    registrationId: number;
    registrationToken: string;
    registrationDetailUrl: string;
    submittedAt: string;
    cancelledAt: string | null;
    registrationStatus: "active" | "cancelled";
    event: ForeignWaterEventContext;
    registrant: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string | null;
    };
    participants: ForeignWaterRegistrationParticipant[];
    transportInfo: string | null;
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
        status: EventPaymentPrescriptionStatus;
        matchedAmount: number | null;
        isPaidInFull: boolean;
        remainderAmount: number | null;
        remainderQrCodeUrl: string | null;
    };
};

export type CancelForeignWaterRegistrationResult =
    | { error: string }
    | { success: true; cancelledAt: string };

export async function cancelForeignWaterRegistrationByToken(token: string): Promise<CancelForeignWaterRegistrationResult> {
    const publicToken = normalizePublicToken(token);
    if (!/^[a-f0-9]{32,64}$/.test(publicToken)) {
        return { error: "Neplatný odkaz přihlášky." };
    }

    const db = getDb();
    const now = new Date();
    const result = await db.transaction(async (tx) => {
        const [existing] = await tx
            .select({
                registrationId: eventRegistrations.id,
                cancelledAt:    eventRegistrations.cancelledAt,
                paymentStatus:  eventPaymentPrescriptions.status,
                email:          eventRegistrations.email,
            })
            .from(eventRegistrations)
            .innerJoin(
                eventPaymentPrescriptions,
                and(
                    eq(eventPaymentPrescriptions.registrationId, eventRegistrations.id),
                    eq(eventPaymentPrescriptions.eventId, eventRegistrations.eventId),
                ),
            )
            .where(and(
                eq(eventRegistrations.publicToken, publicToken),
                eq(eventRegistrations.formSlug, FOREIGN_WATER_FORM_SLUG),
                eq(eventRegistrations.eventId, FOREIGN_WATER_EVENT_ID),
            ))
            .limit(1);

        if (!existing) return null;

        if (existing.paymentStatus === "paid") {
            return { blocked: true as const };
        }

        if (existing.cancelledAt) {
            return {
                cancelledAt: (existing.cancelledAt as unknown as Date).toISOString(),
            };
        }

        const [updated] = await tx
            .update(eventRegistrations)
            .set({
                cancelledAt: now,
            })
            .where(eq(eventRegistrations.id, existing.registrationId))
            .returning({
                cancelledAt: eventRegistrations.cancelledAt,
            });

        await tx
            .update(eventPaymentPrescriptions)
            .set({
                status: "cancelled",
                updatedAt: now,
            })
            .where(and(
                eq(eventPaymentPrescriptions.registrationId, existing.registrationId),
                eq(eventPaymentPrescriptions.eventId, FOREIGN_WATER_EVENT_ID),
            ));

        // Odlinkovat členy — uvolní unique constraint pro jinou aktivní přihlášku téhož člena
        await tx
            .update(eventRegistrationParticipants)
            .set({ memberId: null })
            .where(eq(eventRegistrationParticipants.registrationId, existing.registrationId));

        await tx.insert(auditLog).values({
            entityType: "event_registration",
            entityId:   existing.registrationId,
            action:     "cancel",
            changes:    { cancelledAt: { old: null, new: now.toISOString() } },
            changedBy:  existing.email,
        });

        return {
            cancelledAt: (updated.cancelledAt as unknown as Date).toISOString(),
        };
    });

    if (!result) {
        return { error: "Přihláška nebyla nalezena." };
    }

    if ("blocked" in result) {
        return { error: "Přihlášku s uhrazenou platbou nelze automaticky zrušit. Kontaktuj prosím organizátora." };
    }

    revalidatePath(`/prihlaska/${FOREIGN_WATER_FORM_SLUG}/potvrzeni/${publicToken}`);
    revalidatePath(`/prihlaska/${FOREIGN_WATER_FORM_SLUG}`);
    revalidatePath("/dashboard/events");

    return {
        success: true,
        cancelledAt: result.cancelledAt,
    };
}

export async function getForeignWaterRegistrationByToken(token: string): Promise<ForeignWaterRegistrationDetail | null> {
    const publicToken = normalizePublicToken(token);
    if (!/^[a-f0-9]{32,64}$/.test(publicToken)) return null;
    const publicAppBaseUrl = await resolvePublicAppBaseUrl();

    const db = getDb();
    const [row] = await db
        .select({
            registrationId: eventRegistrations.id,
            createdAt: eventRegistrations.createdAt,
            email: eventRegistrations.email,
            phone: eventRegistrations.phone,
            firstName: eventRegistrations.firstName,
            lastName: eventRegistrations.lastName,
            personsNames: eventRegistrations.personsNames,
            transportInfo: eventRegistrations.transportInfo,
            cancelledAt: eventRegistrations.cancelledAt,
            eventId: events.id,
            eventYear: events.year,
            eventName: events.name,
            eventDateFrom: events.dateFrom,
            eventDateTo: events.dateTo,
            eventLocation: events.location,
            paymentCode: eventPaymentPrescriptions.prescriptionCode,
            paymentAccount: eventPaymentPrescriptions.bankAccount,
            paymentVariableSymbol: eventPaymentPrescriptions.variableSymbol,
            paymentAmount: eventPaymentPrescriptions.amount,
            paymentMatchedAmount: eventPaymentPrescriptions.matchedAmount,
            paymentMessageForRecipient: eventPaymentPrescriptions.messageForRecipient,
            paymentStatus: eventPaymentPrescriptions.status,
        })
        .from(eventRegistrations)
        .innerJoin(events, eq(events.id, eventRegistrations.eventId))
        .innerJoin(
            eventPaymentPrescriptions,
            and(
                eq(eventPaymentPrescriptions.registrationId, eventRegistrations.id),
                eq(eventPaymentPrescriptions.eventId, eventRegistrations.eventId),
            ),
        )
        .where(and(
            eq(eventRegistrations.publicToken, publicToken),
            eq(eventRegistrations.formSlug, FOREIGN_WATER_FORM_SLUG),
            eq(eventRegistrations.eventId, FOREIGN_WATER_EVENT_ID),
            eq(events.name, FOREIGN_WATER_EVENT_NAME),
        ))
        .limit(1);

    if (!row) return null;

    const participantRows = await db
        .select({
            participantOrder: eventRegistrationParticipants.participantOrder,
            fullName: eventRegistrationParticipants.fullName,
            isPrimary: eventRegistrationParticipants.isPrimary,
            isMember: eventRegistrationParticipants.isMember,
        })
        .from(eventRegistrationParticipants)
        .where(eq(eventRegistrationParticipants.registrationId, row.registrationId))
        .orderBy(asc(eventRegistrationParticipants.participantOrder));

    const participants: ForeignWaterRegistrationParticipant[] = participantRows.length > 0
        ? participantRows.map((participant) => ({
            participantOrder: Number(participant.participantOrder),
            fullName: participant.fullName,
            isPrimary: participant.isPrimary,
            isMember: participant.isMember,
        }))
        : parseParticipantNames(row.personsNames, normalizeText(`${row.firstName} ${row.lastName}`))
            .map((fullName, index) => ({
                participantOrder: index + 1,
                fullName,
                isPrimary: index === 0,
                isMember: false,
            }));

    const amount = Number(row.paymentAmount);
    const matchedAmount = row.paymentMatchedAmount !== null ? Number(row.paymentMatchedAmount) : null;
    const isPaymentReceived = row.paymentStatus === "matched" || row.paymentStatus === "paid";
    const isPaidInFull = isPaymentReceived && matchedAmount !== null && matchedAmount >= amount;
    const remainderAmount = isPaymentReceived && matchedAmount !== null && matchedAmount < amount
        ? Math.round((amount - matchedAmount) * 100) / 100
        : null;

    const qrCodeUrl = buildForeignWaterPayliboQrUrl({
        amount,
        variableSymbol: row.paymentVariableSymbol,
        bankAccount: row.paymentAccount,
        messageForRecipient: row.paymentMessageForRecipient,
    });
    const remainderQrCodeUrl = remainderAmount !== null
        ? buildForeignWaterPayliboQrUrl({
            amount: remainderAmount,
            variableSymbol: row.paymentVariableSymbol,
            bankAccount: row.paymentAccount,
            messageForRecipient: row.paymentMessageForRecipient,
        })
        : null;

    return {
        registrationId: row.registrationId,
        registrationToken: publicToken,
        registrationDetailUrl: buildForeignWaterRegistrationDetailUrl(publicToken, publicAppBaseUrl),
        submittedAt: (row.createdAt as unknown as Date).toISOString(),
        cancelledAt: row.cancelledAt ? (row.cancelledAt as unknown as Date).toISOString() : null,
        registrationStatus: row.cancelledAt ? "cancelled" : "active",
        event: {
            id: row.eventId,
            year: Number(row.eventYear),
            name: row.eventName,
            dateFrom: row.eventDateFrom as unknown as string | null,
            dateTo: row.eventDateTo as unknown as string | null,
            location: row.eventLocation,
        },
        registrant: {
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
        },
        participants,
        transportInfo: row.transportInfo,
        payment: {
            code: row.paymentCode,
            codeLabel: formatForeignWaterCode(row.paymentCode),
            bankAccount: row.paymentAccount,
            variableSymbol: row.paymentVariableSymbol,
            amount,
            amountPerPerson: FOREIGN_WATER_AMOUNT_PER_PERSON,
            personsCount: participants.length,
            messageForRecipient: row.paymentMessageForRecipient,
            qrCodeUrl,
            status: row.paymentStatus,
            matchedAmount,
            isPaidInFull,
            remainderAmount,
            remainderQrCodeUrl,
        },
    };
}

export type EventRegistrationAdminRow = {
    registrationId: number;
    createdAt: Date;
    email: string;
    phone: string | null;
    firstName: string;
    lastName: string;
    personsCount: number;
    participants: ForeignWaterRegistrationParticipant[];
    participantNames: string[];
    transportInfo: string | null;
    note: string | null;
    cancelledAt: Date | null;
    paymentId: number | null;
    paymentCode: number | null;
    paymentCodeLabel: string;
    paymentAccount: string | null;
    paymentVariableSymbol: string | null;
    paymentAmount: number;
    paymentMessageForRecipient: string | null;
    paymentStatus: EventPaymentPrescriptionStatus | null;
    matchedLedgerId: number | null;
    depositId: number | null;   // id deposit prescription — pro setDepositPromise/setDepositWontPay
    depositCodeLabel: string | null;
    depositAmount: number | null;   // záloha (deposit prescription amount), null pokud neexistuje
    depositStatus: EventPaymentPrescriptionStatus | null;
    depositMatchedAmount: number | null;
    depositPromise: boolean;   // příslib zálohy — pro doplatek se počítá jako zaplaceno
    depositPromiseNote: string | null;
    depositWontPay: boolean;   // explicitní rozhodnutí "záloha se nebude vybírat" — jde do doplatku
    depositWontPayNote: string | null;
    settlementAmount: number | null;   // doplatek (settlement prescription amount), null pokud neexistuje
    settlementCodeLabel: string | null;
    settlementStatus: EventPaymentPrescriptionStatus | null;
    settlementMatchedAmount: number | null;
    settlementEmailSentAt: Date | null;   // kdy byl naposledy odeslán e-mail s předpisem doplatku
    totalAmount: number | null;   // živě počítaná cena akce po dotaci (getEventSettlement) — null u zrušených přihlášek
};

export async function getEventRegistrationsForAdmin(eventId: number): Promise<EventRegistrationAdminRow[]> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    const depositPresc = alias(eventPaymentPrescriptions, "deposit_presc");
    const settlementPresc = alias(eventPaymentPrescriptions, "settlement_presc");
    const rows = await db
        .select({
            registrationId: eventRegistrations.id,
            createdAt: eventRegistrations.createdAt,
            email: eventRegistrations.email,
            phone: eventRegistrations.phone,
            firstName: eventRegistrations.firstName,
            lastName: eventRegistrations.lastName,
            personsCount: eventRegistrations.personsCount,
            personsNames: eventRegistrations.personsNames,
            transportInfo: eventRegistrations.transportInfo,
            note: eventRegistrations.note,
            cancelledAt: eventRegistrations.cancelledAt,
            // Deposit (záloha) má přednost před settlement — pokud neexistuje, použij settlement
            paymentId: sql<number | null>`COALESCE(${depositPresc.id}, ${settlementPresc.id})`,
            paymentCode: sql<number | null>`COALESCE(${depositPresc.prescriptionCode}, ${settlementPresc.prescriptionCode})`,
            paymentAccount: sql<string | null>`COALESCE(${depositPresc.bankAccount}, ${settlementPresc.bankAccount})`,
            paymentVariableSymbol: sql<string | null>`COALESCE(${depositPresc.variableSymbol}, ${settlementPresc.variableSymbol})`,
            paymentAmount: sql<string | null>`COALESCE(${depositPresc.amount}, ${settlementPresc.amount})`,
            paymentMessageForRecipient: sql<string | null>`COALESCE(${depositPresc.messageForRecipient}, ${settlementPresc.messageForRecipient})`,
            paymentStatus: sql<string | null>`COALESCE(${depositPresc.status}, ${settlementPresc.status})`,
            matchedLedgerId: sql<number | null>`COALESCE(${depositPresc.matchedLedgerId}, ${settlementPresc.matchedLedgerId})`,
            depositId: depositPresc.id,
            depositCode: depositPresc.prescriptionCode,
            depositAmount: depositPresc.amount,
            depositStatus: depositPresc.status,
            depositMatchedAmount: depositPresc.matchedAmount,
            depositPromise: depositPresc.depositPromise,
            depositPromiseNote: depositPresc.depositPromiseNote,
            depositWontPay: depositPresc.depositWontPay,
            depositWontPayNote: depositPresc.depositWontPayNote,
            settlementCode: settlementPresc.prescriptionCode,
            settlementAmount: settlementPresc.amount,
            settlementStatus: settlementPresc.status,
            settlementMatchedAmount: settlementPresc.matchedAmount,
            settlementEmailSentAt: settlementPresc.emailSentAt,
        })
        .from(eventRegistrations)
        .leftJoin(depositPresc, and(
            eq(depositPresc.registrationId, eventRegistrations.id),
            eq(depositPresc.type, "deposit"),
        ))
        .leftJoin(settlementPresc, and(
            eq(settlementPresc.registrationId, eventRegistrations.id),
            eq(settlementPresc.type, "settlement"),
        ))
        .where(eq(eventRegistrations.eventId, eventId))
        .orderBy(desc(eventRegistrations.createdAt));

    const registrationIds = rows.map((row) => row.registrationId);
    const participantRows = registrationIds.length > 0
        ? await db
            .select({
                id: eventRegistrationParticipants.id,
                registrationId: eventRegistrationParticipants.registrationId,
                participantOrder: eventRegistrationParticipants.participantOrder,
                fullName: eventRegistrationParticipants.fullName,
                isPrimary: eventRegistrationParticipants.isPrimary,
                isMember: eventRegistrationParticipants.isMember,
                memberId: eventRegistrationParticipants.memberId,
                memberName: members.fullName,
                cancelledAt: eventRegistrationParticipants.cancelledAt,
                depositRefundAmount: eventRegistrationParticipants.depositRefundAmount,
                depositForfeitPolicy: eventRegistrationParticipants.depositForfeitPolicy,
                depositForfeitExpenseId: eventRegistrationParticipants.depositForfeitExpenseId,
            })
            .from(eventRegistrationParticipants)
            .leftJoin(members, eq(eventRegistrationParticipants.memberId, members.id))
            .where(inArray(eventRegistrationParticipants.registrationId, registrationIds))
            .orderBy(
                asc(eventRegistrationParticipants.registrationId),
                asc(eventRegistrationParticipants.participantOrder),
            )
        : [];

    const participantsByRegistration = new Map<number, ForeignWaterRegistrationParticipant[]>();
    for (const participantRow of participantRows) {
        const list = participantsByRegistration.get(participantRow.registrationId) ?? [];
        list.push({
            id: participantRow.id,
            participantOrder: Number(participantRow.participantOrder),
            fullName: participantRow.fullName,
            isPrimary: participantRow.isPrimary,
            isMember: participantRow.isMember,
            memberId: participantRow.memberId,
            memberName: participantRow.memberName,
            cancelledAt: participantRow.cancelledAt as Date | null,
            depositRefundAmount: participantRow.depositRefundAmount ? parseFloat(participantRow.depositRefundAmount) : null,
            depositForfeitPolicy: participantRow.depositForfeitPolicy,
            depositForfeitExpenseId: participantRow.depositForfeitExpenseId,
        });
        participantsByRegistration.set(participantRow.registrationId, list);
    }

    // Doplatek uložený v prescription se nepřepočítává automaticky při každé změně
    // (příslib/nebude platit zálohy, spárování platby, úprava dotace…) — jen při
    // lockBilling/regeneratePrescriptions/odeslání e-mailu. Aby tahle admin tabulka
    // neukazovala zastaralé číslo, doplatek (a totalAmount pro stav plateb) se vždy
    // dotáhne živě ze stejného zdroje jako záložka Platby (getEventSettlement).
    const liveSettlement = await getEventSettlement(eventId);
    const liveByRegistration = new Map(liveSettlement.registrations.map(sr => [sr.registrationId, sr]));

    return rows.map((row) => {
        const fallbackParticipants = parseParticipantNames(
            row.personsNames,
            normalizeText(`${row.firstName} ${row.lastName}`),
        ).map((fullName, index) => ({
            participantOrder: index + 1,
            fullName,
            isPrimary: index === 0,
            isMember: false,
        }));

        const participants = participantsByRegistration.get(row.registrationId) ?? fallbackParticipants;
        const participantNames = participants.map((participant) => participant.fullName);

        return {
        registrationId: row.registrationId,
        createdAt: row.createdAt as unknown as Date,
        email: row.email,
        phone: row.phone,
        firstName: row.firstName,
        lastName: row.lastName,
        personsCount: participantNames.length > 0 ? participantNames.length : Number(row.personsCount),
        participants,
        participantNames,
        transportInfo: row.transportInfo,
        note: row.note,
        cancelledAt: row.cancelledAt as unknown as Date | null,
        paymentId: row.paymentId,
        paymentCode: row.paymentCode,
        paymentCodeLabel: row.paymentCode ? formatForeignWaterCode(row.paymentCode) : "—",
        paymentAccount: row.paymentAccount,
        paymentVariableSymbol: row.paymentVariableSymbol,
        paymentAmount: row.paymentAmount ? Number(row.paymentAmount) : 0,
        paymentMessageForRecipient: row.paymentMessageForRecipient,
        paymentStatus: row.paymentStatus as EventPaymentPrescriptionStatus | null,
        matchedLedgerId: row.matchedLedgerId,
        depositId: row.depositId,
        depositCodeLabel: row.depositCode ? formatForeignWaterCode(row.depositCode) : null,
        depositAmount: row.depositAmount ? Number(row.depositAmount) : null,
        depositStatus: row.depositStatus as EventPaymentPrescriptionStatus | null,
        depositMatchedAmount: row.depositMatchedAmount ? Number(row.depositMatchedAmount) : null,
        depositPromise: row.depositPromise ?? false,
        depositPromiseNote: row.depositPromiseNote,
        depositWontPay: row.depositWontPay ?? false,
        depositWontPayNote: row.depositWontPayNote,
        settlementCodeLabel: row.settlementCode ? formatForeignWaterCode(row.settlementCode) : null,
        settlementAmount: liveByRegistration.get(row.registrationId)?.settlementAmount ?? (row.settlementAmount ? Number(row.settlementAmount) : null),
        settlementStatus: row.settlementStatus as EventPaymentPrescriptionStatus | null,
        settlementMatchedAmount: row.settlementMatchedAmount ? Number(row.settlementMatchedAmount) : null,
        settlementEmailSentAt: row.settlementEmailSentAt as unknown as Date | null,
        totalAmount: liveByRegistration.get(row.registrationId)?.totalAmount ?? null,
        };
    });
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export type RegistrationAuditEntry = {
    id: number;
    action: string;
    changes: Record<string, { old: string | null; new: string | null }>;
    changedBy: string;
    changedAt: Date;
};

export async function getRegistrationAuditLog(registrationId: number): Promise<RegistrationAuditEntry[]> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");

    const db = getDb();
    const rows = await db
        .select()
        .from(auditLog)
        .where(and(
            eq(auditLog.entityType, "event_registration"),
            eq(auditLog.entityId, registrationId),
        ))
        .orderBy(desc(auditLog.changedAt))
        .limit(50);

    return rows as unknown as RegistrationAuditEntry[];
}

// ── Audit celé akce (jen pro hospodáře) ───────────────────────────────────────

export type EventFullAuditEntry = {
    id: number;
    scope: "event" | "registration";
    registrationId: number | null;
    registrationName: string | null;
    action: string;
    changes: Record<string, { old: string | null; new: string | null }>;
    changedBy: string;
    changedAt: Date;
};

/**
 * Položkový audit celé akce — záznamy na úrovni akce (lock/unlock/regenerate) i všech jejích
 * přihlášek (vznik, úpravy, účastníci, propojení člena…). Jen pro hospodáře (TREASURER_EMAIL),
 * protože jde o citlivý forenzní pohled „kdo co kdy s přihláškami udělal".
 * (Pozn.: events.ts má jednodušší getEventAuditLog jen pro event-level pole v detailu akce.)
 */
export async function getEventFullAuditLog(eventId: number): Promise<EventFullAuditEntry[]> {
    const session = await auth();
    if (!session?.user?.email) throw new Error("Nepřihlášen");
    const treasurerEmail = process.env.TREASURER_EMAIL?.trim().toLowerCase();
    if (!treasurerEmail || session.user.email.toLowerCase() !== treasurerEmail) {
        throw new Error("Audit akce je dostupný jen hospodáři.");
    }

    const db = getDb();
    const regs = await db
        .select({ id: eventRegistrations.id, firstName: eventRegistrations.firstName, lastName: eventRegistrations.lastName })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.eventId, eventId));
    const nameById = new Map(regs.map(r => [r.id, `${r.firstName} ${r.lastName}`]));
    const regIds = regs.map(r => r.id);

    const rows = await db
        .select()
        .from(auditLog)
        .where(or(
            and(eq(auditLog.entityType, "event"), eq(auditLog.entityId, eventId)),
            and(eq(auditLog.entityType, "event_registration"), inArray(auditLog.entityId, regIds.length > 0 ? regIds : [-1])),
        ))
        .orderBy(desc(auditLog.changedAt))
        .limit(300);

    return rows.map(r => ({
        id: r.id,
        scope: r.entityType === "event" ? "event" : "registration",
        registrationId: r.entityType === "event_registration" ? r.entityId : null,
        registrationName: r.entityType === "event_registration" ? (nameById.get(r.entityId) ?? `#${r.entityId}`) : null,
        action: r.action,
        changes: (r.changes ?? {}) as Record<string, { old: string | null; new: string | null }>,
        changedBy: r.changedBy,
        changedAt: r.changedAt as Date,
    }));
}
