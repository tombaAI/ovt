"use server";

import { getDb } from "@/lib/db";
import { auth } from "@/auth";
import {
    events,
    eventExpenses,
    eventExpenseAllocations,
    eventRegistrations,
    eventRegistrationParticipants,
    eventPaymentPrescriptions,
    members,
    people,
} from "@/db/schema";
import { eq, and, isNull, isNotNull, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { getEmailSettings, getResendClient } from "@/lib/email";
import { buildEventSettlementEmail } from "@/lib/email-templates/event-settlement";

// ── Typy ─────────────────────────────────────────────────────────────────────

export type SettlementParticipant = {
    id: number;
    fullName: string;
    isPrimary: boolean;
    memberId: number | null;
    personId: number | null;
    memberName: string | null;
};

export type SettlementExpenseRow = {
    expenseId: number;
    purposeText: string | null;
    amount: number;
    allocationMethod: "split_all" | "per_registration";
    allocatedAmount: number; // pro tuto přihlášku
};

export type SettlementRegistrationRow = {
    registrationId: number;
    firstName: string;
    lastName: string;
    email: string;
    personsCount: number;
    participants: SettlementParticipant[];
    memberCount: number;
    expenses: SettlementExpenseRow[];
    expensesTotal: number;
    subsidy: number;
    totalAmount: number;
    existingPrescription: {
        id: number;
        prescriptionCode: number;
        variableSymbol: string;
        status: string;
        amount: number;
        matchedAmount: number | null;
        paymentDue: string | null;
    } | null;
};

export type EventSettlement = {
    eventId: number;
    subsidyPerMember: number;
    totalParticipants: number;
    finalExpenses: { id: number; purposeText: string | null; amount: number; allocationMethod: "split_all" | "per_registration" }[];
    registrations: SettlementRegistrationRow[];
    grandTotal: number;
    expensesSum: number;
};

// ── Výpočet vyúčtování ────────────────────────────────────────────────────────

export async function getEventSettlement(eventId: number): Promise<EventSettlement> {
    const db = getDb();

    // Event + dotace
    const [event] = await db
        .select({ id: events.id, subsidyPerMember: events.subsidyPerMember })
        .from(events)
        .where(eq(events.id, eventId));

    if (!event) throw new Error(`Akce ${eventId} nenalezena`);

    const subsidyPerMember = parseFloat(event.subsidyPerMember ?? "0") || 0;

    // Náklady ve stavu final
    const expenses = await db
        .select({
            id: eventExpenses.id,
            purposeText: eventExpenses.purposeText,
            amount: eventExpenses.amount,
            allocationMethod: eventExpenses.allocationMethod,
        })
        .from(eventExpenses)
        .where(and(eq(eventExpenses.eventId, eventId), eq(eventExpenses.status, "final"), isNotNull(eventExpenses.amount)));

    const finalExpenses = expenses.map(e => ({
        id: e.id,
        purposeText: e.purposeText,
        amount: parseFloat(e.amount!),
        allocationMethod: e.allocationMethod as "split_all" | "per_registration",
    }));

    // Alokace per registrace pro per_registration náklady
    const perRegExpenseIds = finalExpenses.filter(e => e.allocationMethod === "per_registration").map(e => e.id);
    const allocations = perRegExpenseIds.length > 0
        ? await db
            .select({ expenseId: eventExpenseAllocations.expenseId, registrationId: eventExpenseAllocations.registrationId, amount: eventExpenseAllocations.amount })
            .from(eventExpenseAllocations)
            .where(inArray(eventExpenseAllocations.expenseId, perRegExpenseIds))
        : [];

    // Aktivní přihlášky (nezrušené)
    const regs = await db
        .select({
            id: eventRegistrations.id,
            firstName: eventRegistrations.firstName,
            lastName: eventRegistrations.lastName,
            email: eventRegistrations.email,
            personsCount: eventRegistrations.personsCount,
        })
        .from(eventRegistrations)
        .where(and(eq(eventRegistrations.eventId, eventId), isNull(eventRegistrations.cancelledAt)));

    // Účastníci přihlášek
    const regIds = regs.map(r => r.id);
    const participants = regIds.length > 0
        ? await db
            .select({
                id: eventRegistrationParticipants.id,
                registrationId: eventRegistrationParticipants.registrationId,
                fullName: eventRegistrationParticipants.fullName,
                isPrimary: eventRegistrationParticipants.isPrimary,
                memberId: eventRegistrationParticipants.memberId,
                personId: eventRegistrationParticipants.personId,
                memberName: members.fullName,
            })
            .from(eventRegistrationParticipants)
            .leftJoin(members, eq(eventRegistrationParticipants.memberId, members.id))
            .where(inArray(eventRegistrationParticipants.registrationId, regIds))
        : [];

    // Existující předpisy
    const prescriptions = regIds.length > 0
        ? await db
            .select({
                id: eventPaymentPrescriptions.id,
                registrationId: eventPaymentPrescriptions.registrationId,
                prescriptionCode: eventPaymentPrescriptions.prescriptionCode,
                variableSymbol: eventPaymentPrescriptions.variableSymbol,
                status: eventPaymentPrescriptions.status,
                amount: eventPaymentPrescriptions.amount,
                matchedAmount: eventPaymentPrescriptions.matchedAmount,
                paymentDue: eventPaymentPrescriptions.paymentDue,
            })
            .from(eventPaymentPrescriptions)
            .where(inArray(eventPaymentPrescriptions.registrationId, regIds))
        : [];

    const totalParticipants = regs.reduce((s, r) => s + (r.personsCount ?? 1), 0);

    const registrationRows: SettlementRegistrationRow[] = regs.map(reg => {
        const regParticipants = participants.filter(p => p.registrationId === reg.id).map(p => ({
            id: p.id,
            fullName: p.fullName,
            isPrimary: p.isPrimary,
            memberId: p.memberId,
            personId: p.personId,
            memberName: p.memberName ?? null,
        }));
        const memberCount = regParticipants.filter(p => p.memberId !== null).length;
        const personsCount = reg.personsCount ?? 1;

        const expenseRows: SettlementExpenseRow[] = finalExpenses.map(expense => {
            let allocatedAmount = 0;
            if (expense.allocationMethod === "split_all") {
                allocatedAmount = totalParticipants > 0
                    ? (expense.amount / totalParticipants) * personsCount  // přesný zlomek, zaokrouhlíme až jednou na konci
                    : 0;
            } else {
                const alloc = allocations.find(a => a.expenseId === expense.id && a.registrationId === reg.id);
                allocatedAmount = alloc ? parseFloat(alloc.amount) : 0;
            }
            return { expenseId: expense.id, purposeText: expense.purposeText, amount: expense.amount, allocationMethod: expense.allocationMethod, allocatedAmount };
        });

        const expensesTotal = expenseRows.reduce((s, e) => s + e.allocatedAmount, 0);
        const subsidy = memberCount * subsidyPerMember;
        // Math.ceil jednou na celkové sumě — max. odchylka 1 Kč na přihlášku
        const totalAmount = Math.max(0, Math.ceil(expensesTotal - subsidy));

        const prescription = prescriptions.find(p => p.registrationId === reg.id) ?? null;

        return {
            registrationId: reg.id,
            firstName: reg.firstName,
            lastName: reg.lastName,
            email: reg.email,
            personsCount,
            participants: regParticipants,
            memberCount,
            expenses: expenseRows,
            expensesTotal,
            subsidy,
            totalAmount,
            existingPrescription: prescription ? {
                id: prescription.id,
                prescriptionCode: prescription.prescriptionCode,
                variableSymbol: prescription.variableSymbol,
                status: prescription.status,
                amount: parseFloat(prescription.amount),
                matchedAmount: prescription.matchedAmount ? parseFloat(prescription.matchedAmount) : null,
                paymentDue: prescription.paymentDue,
            } : null,
        };
    });

    const expensesSum = finalExpenses.reduce((s, e) => s + e.amount, 0);
    const grandTotal = registrationRows.reduce((s, r) => s + r.totalAmount, 0);

    return { eventId, subsidyPerMember, totalParticipants, finalExpenses, registrations: registrationRows, grandTotal, expensesSum };
}

// ── Dotace akce ───────────────────────────────────────────────────────────────

export async function updateEventSubsidy(eventId: number, subsidyPerMember: number | null): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        await db.update(events)
            .set({ subsidyPerMember: subsidyPerMember !== null ? String(subsidyPerMember) : null, updatedAt: new Date() })
            .where(eq(events.id, eventId));
        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch {
        return { error: "Nepodařilo se uložit dotaci" };
    }
}

// ── Způsob rozdělení nákladu ──────────────────────────────────────────────────

export async function updateExpenseAllocationMethod(
    expenseId: number,
    method: "split_all" | "per_registration",
): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        await db.update(eventExpenses)
            .set({ allocationMethod: method })
            .where(eq(eventExpenses.id, expenseId));

        if (method === "split_all") {
            // Smazat případné ruční alokace
            await db.delete(eventExpenseAllocations).where(eq(eventExpenseAllocations.expenseId, expenseId));
        }

        // Revalidace přes eventId
        const [exp] = await db.select({ eventId: eventExpenses.eventId }).from(eventExpenses).where(eq(eventExpenses.id, expenseId));
        if (exp) revalidatePath(`/dashboard/events/${exp.eventId}`);

        return { success: true };
    } catch {
        return { error: "Nepodařilo se uložit způsob rozdělení" };
    }
}

// ── Alokace per registrace ────────────────────────────────────────────────────

export async function setExpenseRegistrationAllocations(
    expenseId: number,
    allocations: { registrationId: number; amount: number }[],
): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();

        // Ověření, že součet sedí k částce nákladu
        const [exp] = await db.select({ amount: eventExpenses.amount, eventId: eventExpenses.eventId }).from(eventExpenses).where(eq(eventExpenses.id, expenseId));
        if (!exp?.amount) return { error: "Náklad nenalezen nebo nemá částku" };

        const expenseAmount = parseFloat(exp.amount);
        const allocSum = allocations.reduce((s, a) => s + a.amount, 0);
        if (Math.abs(allocSum - expenseAmount) > 0.01) {
            return { error: `Součet alokací (${allocSum} Kč) neodpovídá částce nákladu (${expenseAmount} Kč)` };
        }

        await db.transaction(async tx => {
            await tx.delete(eventExpenseAllocations).where(eq(eventExpenseAllocations.expenseId, expenseId));
            if (allocations.length > 0) {
                await tx.insert(eventExpenseAllocations).values(
                    allocations.map(a => ({ expenseId, registrationId: a.registrationId, amount: String(a.amount) }))
                );
            }
        });

        revalidatePath(`/dashboard/events/${exp.eventId}`);
        return { success: true };
    } catch {
        return { error: "Nepodařilo se uložit alokace" };
    }
}

// ── Generování předpisů plateb ────────────────────────────────────────────────

const EVENT_BANK_ACCOUNT = "351416278/0300";
const EVENT_VS = "20702"; // oddíl OVT v rámci TJ Bohemians — stejný VS jako u záloh za zahraniční akce

export async function generateEventPrescriptions(eventId: number): Promise<{ success: true; created: number; updated: number } | { error: string }> {
    try {
        const db = getDb();
        const settlement = await getEventSettlement(eventId);

        const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };

        const paymentDue = new Date();
        paymentDue.setDate(paymentDue.getDate() + 7);
        const paymentDueStr = paymentDue.toISOString().slice(0, 10);

        let created = 0;
        let updated = 0;

        await db.transaction(async tx => {
            for (const reg of settlement.registrations) {
                const amount = String(reg.totalAmount);
                const fullName = `${reg.firstName} ${reg.lastName}`;

                if (reg.existingPrescription) {
                    await tx.update(eventPaymentPrescriptions)
                        .set({ amount, paymentDue: paymentDueStr, updatedAt: new Date() })
                        .where(eq(eventPaymentPrescriptions.id, reg.existingPrescription.id));
                    updated++;
                } else {
                    const seqResult = await tx.execute(sql`SELECT nextval('app.event_payment_prescription_code_seq')::int AS code`);
                    const code = (seqResult as unknown as { code: number }[])[0]?.code;
                    if (!code) throw new Error("Nepodařilo se získat kód předpisu");

                    await tx.insert(eventPaymentPrescriptions).values({
                        eventId,
                        registrationId: reg.registrationId,
                        prescriptionCode: code,
                        bankAccount: EVENT_BANK_ACCOUNT,
                        variableSymbol: EVENT_VS,
                        amount,
                        messageForRecipient: `C${code} ${fullName} ${event.name}`,
                        status: "pending",
                        paymentDue: paymentDueStr,
                    });
                    created++;
                }
            }
        });

        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true, created, updated };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Nepodařilo se vygenerovat předpisy" };
    }
}

// ── Správa přihlášek v adminu ─────────────────────────────────────────────────

export type AdminRegistrationInput = {
    email: string;
    phone?: string;
    firstName: string;
    lastName: string;
    participants: {
        fullName: string;
        isPrimary: boolean;
        memberId?: number | null;
        personId?: number | null;
    }[];
};

export async function addAdminEventRegistration(
    eventId: number,
    input: AdminRegistrationInput,
): Promise<{ success: true; registrationId: number } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };

        const db = getDb();
        const publicToken = randomBytes(24).toString("hex");

        const registrationId = await db.transaction(async tx => {
            const [reg] = await tx.insert(eventRegistrations).values({
                eventId,
                formSlug: "admin",
                email: input.email,
                phone: input.phone ?? null,
                firstName: input.firstName,
                lastName: input.lastName,
                publicToken,
                personsCount: input.participants.length,
            }).returning({ id: eventRegistrations.id });

            for (let i = 0; i < input.participants.length; i++) {
                const p = input.participants[i];
                await tx.insert(eventRegistrationParticipants).values({
                    registrationId: reg.id,
                    participantOrder: i + 1,
                    fullName: p.fullName,
                    isPrimary: p.isPrimary,
                    memberId: p.memberId ?? null,
                    personId: p.personId ?? null,
                });
            }
            return reg.id;
        });

        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true, registrationId };
    } catch {
        return { error: "Nepodařilo se přidat přihlášku" };
    }
}

export async function updateAdminRegistration(
    registrationId: number,
    input: Partial<Pick<AdminRegistrationInput, "email" | "phone" | "firstName" | "lastName">>,
): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        await db.update(eventRegistrations).set(input).where(eq(eventRegistrations.id, registrationId));
        const [reg] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, registrationId));
        if (reg) revalidatePath(`/dashboard/events/${reg.eventId}`);
        return { success: true };
    } catch {
        return { error: "Nepodařilo se upravit přihlášku" };
    }
}

export async function linkParticipantToMember(
    participantId: number,
    memberId: number | null,
): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        await db.update(eventRegistrationParticipants)
            .set({ memberId, personId: null })
            .where(eq(eventRegistrationParticipants.id, participantId));

        const [p] = await db
            .select({ registrationId: eventRegistrationParticipants.registrationId })
            .from(eventRegistrationParticipants)
            .where(eq(eventRegistrationParticipants.id, participantId));
        if (p) {
            const [reg] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, p.registrationId));
            if (reg) revalidatePath(`/dashboard/events/${reg.eventId}`);
        }
        return { success: true };
    } catch {
        return { error: "Nepodařilo se spárovat účastníka" };
    }
}

export async function getMembersForSettlement() {
    const db = getDb();
    return db.select({ id: members.id, fullName: members.fullName }).from(members).orderBy(members.fullName);
}

export async function getPeopleForSettlement() {
    const db = getDb();
    return db.select({ id: people.id, fullName: people.fullName, memberId: people.memberId }).from(people).orderBy(people.fullName);
}

// ── Odeslání e-mailů s předpisy ───────────────────────────────────────────────

export async function sendEventSettlementEmails(
    eventId: number,
): Promise<{ sent: number; skipped: number; failed: { name: string; email: string; error: string }[] } | { error: string }> {
    const emailSettings = getEmailSettings();
    if (!emailSettings.configured) return { error: "E-mail není nakonfigurován (chybí RESEND_API_KEY)" };

    try {
        const settlement = await getEventSettlement(eventId);
        const [event] = await getDb().select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };

        const resend = getResendClient();
        let sent = 0;
        let skipped = 0;
        const failed: { name: string; email: string; error: string }[] = [];

        for (const reg of settlement.registrations) {
            const p = reg.existingPrescription;
            if (!p || p.status === "cancelled") { skipped++; continue; }

            const to = emailSettings.testTo ?? reg.email;
            const fullName = `${reg.firstName} ${reg.lastName}`;

            const { subject, html } = buildEventSettlementEmail({
                firstName: reg.firstName,
                lastName: reg.lastName,
                email: reg.email,
                eventName: event.name,
                prescriptionCode: p.prescriptionCode,
                variableSymbol: p.variableSymbol,
                amount: p.amount,
                bankAccount: EVENT_BANK_ACCOUNT,
                paymentDue: p.paymentDue,
                expenses: reg.expenses.map(e => ({
                    purposeText: e.purposeText,
                    allocatedAmount: e.allocatedAmount,
                })),
                subsidy: reg.subsidy,
            });

            try {
                const result = await resend.emails.send({
                    from: emailSettings.from,
                    to,
                    replyTo: emailSettings.replyTo,
                    subject,
                    html,
                });
                if (result.error) {
                    failed.push({ name: fullName, email: to, error: result.error.message });
                } else {
                    sent++;
                }
            } catch (e) {
                failed.push({ name: fullName, email: to, error: e instanceof Error ? e.message : "Neznámá chyba" });
            }

            // max. 4 maily za vteřinu — Resend limit je 5/s
            await new Promise(r => setTimeout(r, 250));
        }

        return { sent, skipped, failed };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Chyba při odesílání e-mailů" };
    }
}
