"use server";

import { getDb } from "@/lib/db";
import {
    memberContributions, members, contributionPeriods, mailEvents,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { getResendClient, getEmailSettings } from "@/lib/email";
import {
    buildContributionPrescriptionEmail,
    type ContribEmailData,
} from "@/lib/email-templates/contribution-prescription";

export type SendEmailResult = {
    sent:    number;
    failed:  number;
    noEmail: number;
    errors:  string[];
};

export type ContribMailEvent = {
    id:        string;
    emailType: string | null;
    subject:   string | null;
    toEmail:   string | null;
    sentAt:    string;   // ISO timestamp
};

// ── Odeslat emaily s předpisem příspěvků ──────────────────────────────────────

export async function sendContributionEmails(
    contribIds: number[],
    emailType: "prescription" | "reminder" = "prescription",
): Promise<{ error: string } | ({ success: true } & SendEmailResult)> {
    const session = await auth();
    if (!session?.user) return { error: "Nepřihlášen" };

    if (contribIds.length === 0) return { error: "Žádné příspěvky k odeslání" };

    const db  = getDb();
    const settings = getEmailSettings();

    // ── 1. Načíst předpisy + členy + období ──────────────────────────────────
    const rows = await db
        .select({
            contribId:          memberContributions.id,
            memberId:           memberContributions.memberId,
            periodId:           memberContributions.periodId,
            reviewed:           memberContributions.reviewed,
            amountTotal:        memberContributions.amountTotal,
            amountBase:         memberContributions.amountBase,
            amountBoat1:        memberContributions.amountBoat1,
            amountBoat2:        memberContributions.amountBoat2,
            amountBoat3:        memberContributions.amountBoat3,
            discountCommittee:  memberContributions.discountCommittee,
            discountTom:        memberContributions.discountTom,
            discountIndividual: memberContributions.discountIndividual,
            brigadeSurcharge:   memberContributions.brigadeSurcharge,
            firstName:          members.firstName,
            lastName:           members.lastName,
            email:              members.email,
            variableSymbol:     members.variableSymbol,
        })
        .from(memberContributions)
        .innerJoin(members, eq(memberContributions.memberId, members.id))
        .where(inArray(memberContributions.id, contribIds));

    if (rows.length === 0) return { error: "Předpisy nenalezeny" };

    // Blokovat odeslání na nerevidované předpisy
    const unreviewed = rows.filter(r => !r.reviewed);
    if (unreviewed.length > 0) {
        const names = unreviewed.map(r => `${r.firstName} ${r.lastName}`).join(", ");
        return { error: `Nelze odeslat email na nerevidované předpisy: ${names}` };
    }

    // Načíst info o období (bankAccount, dueDate, year)
    const periodId = rows[0].periodId;
    const [period] = await db
        .select({
            year:        contributionPeriods.year,
            bankAccount: contributionPeriods.bankAccount,
            dueDate:     contributionPeriods.dueDate,
        })
        .from(contributionPeriods)
        .where(eq(contributionPeriods.id, periodId));

    if (!period) return { error: "Období nenalezeno" };

    // ── 2. Odeslat každému členovi ─────────────────────────────────────────
    const resend  = settings.configured ? getResendClient() : null;
    let sent    = 0;
    let failed  = 0;
    let noEmail = 0;
    const errors: string[] = [];

    for (const row of rows) {
        // Přeskočit členy bez emailu
        if (!row.email) {
            noEmail++;
            continue;
        }

        const emailData: ContribEmailData = {
            firstName:          row.firstName,
            lastName:           row.lastName,
            year:               period.year,
            amountTotal:        row.amountTotal ?? 0,
            amountBase:         row.amountBase,
            amountBoat1:        row.amountBoat1,
            amountBoat2:        row.amountBoat2,
            amountBoat3:        row.amountBoat3,
            discountCommittee:  row.discountCommittee,
            discountTom:        row.discountTom,
            discountIndividual: row.discountIndividual,
            brigadeSurcharge:   row.brigadeSurcharge,
            variableSymbol:     row.variableSymbol,
            bankAccount:        period.bankAccount,
            dueDate:            period.dueDate as unknown as string | null,
        };

        const { subject, html } = buildContributionPrescriptionEmail(emailData);

        // V test módu posílat na testovací adresu
        const toEmail = settings.testTo ?? row.email;

        let messageId: string | null = null;
        let sendError: string | null = null;

        if (resend) {
            try {
                const result = await resend.emails.send({
                    from:    settings.from,
                    to:      toEmail,
                    subject,
                    html,
                    ...(settings.replyTo ? { replyTo: settings.replyTo } : {}),
                });
                if (result.error) {
                    sendError = result.error.message;
                } else {
                    messageId = result.data?.id ?? null;
                    sent++;
                }
            } catch (e) {
                sendError = e instanceof Error ? e.message : "Neznámá chyba";
            }
        } else {
            // Email není nakonfigurován — zalogovat bez odeslání
            messageId = null;
            sent++;
        }

        if (sendError) {
            failed++;
            errors.push(`${row.firstName} ${row.lastName}: ${sendError}`);
        } else {
            // Úspěšně odesláno — nastavit emailSent příznak na předpisu
            await db.update(memberContributions)
                .set({ emailSent: true })
                .where(eq(memberContributions.id, row.contribId));
        }

        // Logovat do mail_events vždy (i při chybě)
        await db.insert(mailEvents).values({
            provider:  "resend",
            direction: "outbound",
            eventType: sendError ? "send_failed" : "sent",
            emailType,
            messageId,
            fromEmail: settings.from,
            toEmail,
            subject,
            payload:   { configured: settings.configured, error: sendError },
            memberId:  row.memberId,
            contribId: row.contribId,
            periodId:  row.periodId,
        });

        // max. 4 maily za vteřinu — Resend limit je 5/s
        await new Promise(r => setTimeout(r, 250));
    }

    return { success: true, sent, failed, noEmail, errors };
}

// ── Historie mailů pro konkrétní předpis ─────────────────────────────────────

export async function getContribEmailHistory(
    contribId: number,
): Promise<ContribMailEvent[]> {
    const session = await auth();
    if (!session?.user) return [];

    const db = getDb();
    const rows = await db
        .select({
            id:        mailEvents.id,
            emailType: mailEvents.emailType,
            subject:   mailEvents.subject,
            toEmail:   mailEvents.toEmail,
            sentAt:    mailEvents.createdAt,
        })
        .from(mailEvents)
        .where(eq(mailEvents.contribId, contribId))
        .orderBy(mailEvents.createdAt);

    return rows.map(r => ({
        id:        r.id,
        emailType: r.emailType,
        subject:   r.subject,
        toEmail:   r.toEmail,
        sentAt:    r.sentAt.toISOString(),
    }));
}
