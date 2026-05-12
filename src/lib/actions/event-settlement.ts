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
    auditLog,
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
    subsidyTotal: number;           // celková dotace akce (uložena v events.subsidy_per_member)
    unitPrice: number;              // cena per osoba = Math.ceil(expensesSum / totalParticipants)
    totalParticipants: number;
    totalMemberParticipants: number;
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

    const subsidyTotal = parseFloat(event.subsidyPerMember ?? "0") || 0;

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
    const totalMemberParticipants = participants.filter(p => p.memberId !== null).length;

    const expensesSum = finalExpenses.reduce((s, e) => s + e.amount, 0);
    // unitPrice platí jen pro "split_all" náklady — rovnoměrné rozdělení na každého
    const splitAllSum = finalExpenses.filter(e => e.allocationMethod === "split_all").reduce((s, e) => s + e.amount, 0);
    const unitPrice = totalParticipants > 0 ? Math.ceil(splitAllSum / totalParticipants) : 0;

    // Per_registration náklady, které mají alespoň jednu alokaci v DB.
    // Pokud žádnou nemají → fallback: rovnoměrné rozdělení (všichni zahrnuti).
    const expensesWithAllocs = new Set(allocations.map(a => a.expenseId));

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

        // Podrobný rozpis nákladů — pro e-mail a zobrazení v záložce Náklady
        const expenseRows: SettlementExpenseRow[] = finalExpenses.map(expense => {
            let allocatedAmount = 0;
            if (expense.allocationMethod === "split_all") {
                allocatedAmount = totalParticipants > 0
                    ? (expense.amount / totalParticipants) * personsCount
                    : 0;
            } else if (!expensesWithAllocs.has(expense.id)) {
                // Žádné alokace v DB → fallback: rovnoměrné rozdělení na všechny (jako split_all)
                allocatedAmount = totalParticipants > 0
                    ? (expense.amount / totalParticipants) * personsCount
                    : 0;
            } else {
                const alloc = allocations.find(a => a.expenseId === expense.id && a.registrationId === reg.id);
                allocatedAmount = alloc ? parseFloat(alloc.amount) : 0;
            }
            return { expenseId: expense.id, purposeText: expense.purposeText, amount: expense.amount, allocationMethod: expense.allocationMethod, allocatedAmount };
        });

        // split_all: unitPrice × osoby (uniformní sazba); per_registration: explicitní alokace
        const perRegTotal = expenseRows
            .filter(e => e.allocationMethod === "per_registration")
            .reduce((s, e) => s + e.allocatedAmount, 0);
        const expensesTotal = unitPrice * personsCount + perRegTotal;
        // Dotace: poměrná část celkové dotace podle počtu členů v přihlášce
        const subsidy = totalMemberParticipants > 0
            ? Math.round(subsidyTotal * memberCount / totalMemberParticipants)
            : 0;
        const totalAmount = Math.max(0, expensesTotal - subsidy);

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

    const grandTotal = registrationRows.reduce((s, r) => s + r.totalAmount, 0);

    return { eventId, subsidyTotal, unitPrice, totalParticipants, totalMemberParticipants, finalExpenses, registrations: registrationRows, grandTotal, expensesSum };
}

// ── Billing status helpers ────────────────────────────────────────────────────

async function getBillingStatus(db: ReturnType<typeof getDb>, eventId: number): Promise<"draft" | "prescribed" | null> {
    const [row] = await db.select({ billingStatus: events.billingStatus }).from(events).where(eq(events.id, eventId));
    return (row?.billingStatus as "draft" | "prescribed") ?? null;
}

/** Uzamkne billing: vygeneruje předpisy a přepne stav na 'prescribed'. */
export async function lockBilling(eventId: number): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };

        const settlement = await getEventSettlement(eventId);
        await upsertPrescriptionAmounts(eventId, settlement, event.name, db);

        await db.update(events)
            .set({ billingStatus: "prescribed", updatedAt: new Date() })
            .where(eq(events.id, eventId));

        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při uzamčení vyúčtování" };
    }
}

/**
 * Odemkne billing: přepne stav zpět na 'draft'.
 * Pending předpisy smaže, paid/matched zachová (admin dostane varování).
 */
export async function unlockBilling(eventId: number): Promise<{ success: true; deletedPrescriptions: number } | { error: string }> {
    try {
        const db = getDb();

        // Smazat pouze pending předpisy (ne zaplacené/spárované)
        const regIds = (await db
            .select({ id: eventRegistrations.id })
            .from(eventRegistrations)
            .where(and(eq(eventRegistrations.eventId, eventId), isNull(eventRegistrations.cancelledAt)))
        ).map(r => r.id);

        let deletedPrescriptions = 0;
        if (regIds.length > 0) {
            const result = await db
                .delete(eventPaymentPrescriptions)
                .where(and(
                    inArray(eventPaymentPrescriptions.registrationId, regIds),
                    eq(eventPaymentPrescriptions.status, "pending"),
                ))
                .returning({ id: eventPaymentPrescriptions.id });
            deletedPrescriptions = result.length;
        }

        await db.update(events)
            .set({ billingStatus: "draft", updatedAt: new Date() })
            .where(eq(events.id, eventId));

        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true, deletedPrescriptions };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při odemknutí vyúčtování" };
    }
}

// ── Dotace akce ───────────────────────────────────────────────────────────────

export async function updateEventSubsidy(eventId: number, subsidyPerMember: number | null): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        if (await getBillingStatus(db, eventId) === "prescribed")
            return { error: "Vyúčtování je uzamčeno — nejdřív odemkněte" };
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
        const [exp] = await db.select({ eventId: eventExpenses.eventId }).from(eventExpenses).where(eq(eventExpenses.id, expenseId));
        if (!exp) return { error: "Náklad nenalezen" };
        if (await getBillingStatus(db, exp.eventId) === "prescribed")
            return { error: "Vyúčtování je uzamčeno — nejdřív odemkněte" };

        await db.update(eventExpenses)
            .set({ allocationMethod: method })
            .where(eq(eventExpenses.id, expenseId));

        if (method === "split_all") {
            await db.delete(eventExpenseAllocations).where(eq(eventExpenseAllocations.expenseId, expenseId));
        }

        revalidatePath(`/dashboard/events/${exp.eventId}`);
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

        const [exp] = await db.select({ amount: eventExpenses.amount, eventId: eventExpenses.eventId }).from(eventExpenses).where(eq(eventExpenses.id, expenseId));
        if (!exp?.amount) return { error: "Náklad nenalezen nebo nemá částku" };
        if (await getBillingStatus(db, exp.eventId) === "prescribed")
            return { error: "Vyúčtování je uzamčeno — nejdřív odemkněte" };

        // Ověření, že součet sedí k částce nákladu

        const expenseAmount = parseFloat(exp.amount);
        const allocSum = allocations.reduce((s, a) => s + a.amount, 0);
        // Povolíme mírný přebytek (Math.ceil na přihlášku může dát o pár Kč víc)
        if (allocSum < expenseAmount - 0.01) {
            return { error: `Součet alokací (${allocSum} Kč) je menší než náklad (${expenseAmount} Kč)` };
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

// ── Předpisy plateb ───────────────────────────────────────────────────────────

const EVENT_BANK_ACCOUNT = "351416278/0300";
const EVENT_VS = "20702"; // oddíl OVT v rámci TJ Bohemians — stejný VS jako u záloh za zahraniční akce

/**
 * Interní helper: vytvoří předpis pro jednu přihlášku s kódem Cnnn a prázdnou částkou.
 * Voláme hned při vzniku přihlášky — kód je trvalý, částka se spočítá při odeslání e-mailů.
 */
async function createPrescriptionForRegistration(
    tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
    eventId: number,
    registrationId: number,
    firstName: string,
    lastName: string,
    eventName: string,
): Promise<number> {
    // Kód přihlášky je trvalý — použijeme existující, nebo alokujeme nový a uložíme na přihlášku.
    const [reg] = await tx
        .select({ prescriptionCode: eventRegistrations.prescriptionCode })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.id, registrationId));

    let code = reg?.prescriptionCode ?? null;
    if (!code) {
        const seqResult = await tx.execute(sql`SELECT nextval('app.event_payment_prescription_code_seq')::int AS code`);
        code = (seqResult as unknown as { code: number }[])[0]?.code ?? null;
        if (!code) throw new Error("Nepodařilo se získat kód předpisu");
        // Uložit kód na přihlášku trvale
        await tx.update(eventRegistrations)
            .set({ prescriptionCode: code })
            .where(eq(eventRegistrations.id, registrationId));
    }

    await tx.insert(eventPaymentPrescriptions).values({
        eventId,
        registrationId,
        prescriptionCode: code,
        bankAccount: EVENT_BANK_ACCOUNT,
        variableSymbol: EVENT_VS,
        amount: "0",
        messageForRecipient: `C${code} ${firstName} ${lastName} ${eventName}`,
        status: "pending",
        paymentDue: null,
    });
    return code;
}

/** Přegeneruje předpisy (přepočítá částky) bez odeslání e-mailů. */
export async function regeneratePrescriptions(
    eventId: number,
): Promise<{ error: string } | { created: number; updated: number }> {
    try {
        const db = getDb();
        const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };
        const settlement = await getEventSettlement(eventId);
        const result = await upsertPrescriptionAmounts(eventId, settlement, event.name, db);
        revalidatePath(`/dashboard/events/${eventId}`);
        return result;
    } catch (e) {
        console.error(e);
        return { error: "Chyba při přegenerování předpisů" };
    }
}

/**
 * Interní helper: přepočítá a uloží částky do všech existujících předpisů.
 * Přihlášky bez předpisu dostanou nový kód a nový záznam.
 * Vrací počty pro informaci calleru.
 */
async function upsertPrescriptionAmounts(
    eventId: number,
    settlement: Awaited<ReturnType<typeof getEventSettlement>>,
    eventName: string,
    db: ReturnType<typeof getDb>,
): Promise<{ created: number; updated: number }> {
    const paymentDue = new Date();
    paymentDue.setDate(paymentDue.getDate() + 7);
    const paymentDueStr = paymentDue.toISOString().slice(0, 10);
    let created = 0, updated = 0;

    await db.transaction(async tx => {
        for (const reg of settlement.registrations) {
            const amount = String(reg.totalAmount);
            if (reg.existingPrescription) {
                await tx.update(eventPaymentPrescriptions)
                    .set({ amount, paymentDue: paymentDueStr, updatedAt: new Date() })
                    .where(eq(eventPaymentPrescriptions.id, reg.existingPrescription.id));
                updated++;
            } else {
                await createPrescriptionForRegistration(tx, eventId, reg.registrationId, reg.firstName, reg.lastName, eventName);
                created++;
            }
        }
    });
    return { created, updated };
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

        const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };

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

            // Přihláška dostane trvalý kód Cnnn hned při vzniku
            await createPrescriptionForRegistration(tx, eventId, reg.id, input.firstName, input.lastName, event.name);

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
    return db.select({
        id: members.id,
        fullName: members.fullName,
        firstName: members.firstName,
        lastName: members.lastName,
        email: members.email,
        phone: members.phone,
    }).from(members).orderBy(members.fullName);
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
        const db = getDb();
        const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };

        // Přepočítej a ulož aktuální částky do předpisů (+ vytvoř chybějící)
        const settlement = await getEventSettlement(eventId);
        await upsertPrescriptionAmounts(eventId, settlement, event.name, db);

        // Načti čerstvý stav po upsert
        const freshSettlement = await getEventSettlement(eventId);

        const resend = getResendClient();
        let sent = 0;
        let skipped = 0;
        const failed: { name: string; email: string; error: string }[] = [];

        for (const reg of freshSettlement.registrations) {
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
                unitPrice: reg.personsCount > 0 ? Math.round(reg.expensesTotal / reg.personsCount) : 0,
                participants: reg.participants.map(pt => ({
                    fullName: pt.fullName,
                    isMember: pt.memberId !== null,
                })),
                memberCount: reg.memberCount,
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

// ── Správa účastníků přihlášky ────────────────────────────────────────────────

export async function addParticipantToRegistration(
    registrationId: number,
    participant: { fullName: string; memberId: number | null },
): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };

        const db = getDb();
        let eventId: number | null = null;

        await db.transaction(async tx => {
            const [{ nextOrder }] = await tx
                .select({ nextOrder: sql<number>`COALESCE(MAX(${eventRegistrationParticipants.participantOrder}), 0) + 1` })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.registrationId, registrationId));

            await tx.insert(eventRegistrationParticipants).values({
                registrationId,
                participantOrder: nextOrder,
                fullName: participant.fullName.trim(),
                isPrimary: false,
                memberId: participant.memberId ?? null,
            });

            await tx.update(eventRegistrations)
                .set({ personsCount: sql`${eventRegistrations.personsCount} + 1` })
                .where(eq(eventRegistrations.id, registrationId));

            const [reg] = await tx.select({ eventId: eventRegistrations.eventId })
                .from(eventRegistrations)
                .where(eq(eventRegistrations.id, registrationId));
            eventId = reg?.eventId ?? null;
        });

        if (eventId) revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch {
        return { error: "Nepodařilo se přidat účastníka" };
    }
}

export async function removeParticipantFromRegistration(
    participantId: number,
): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };

        const db = getDb();
        let eventId: number | null = null;

        await db.transaction(async tx => {
            const [p] = await tx
                .select({ registrationId: eventRegistrationParticipants.registrationId })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.id, participantId));

            if (!p) throw new Error("Účastník nenalezen");

            const [{ cnt }] = await tx
                .select({ cnt: sql<number>`COUNT(*)::int` })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.registrationId, p.registrationId));

            if (cnt <= 1) throw new Error("Přihláška musí mít alespoň jednoho účastníka. Pro zrušení přihlášky použijte tlačítko Zrušit přihlášku.");

            await tx.delete(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.id, participantId));

            await tx.update(eventRegistrations)
                .set({ personsCount: sql`GREATEST(1, ${eventRegistrations.personsCount} - 1)` })
                .where(eq(eventRegistrations.id, p.registrationId));

            const [reg] = await tx.select({ eventId: eventRegistrations.eventId })
                .from(eventRegistrations)
                .where(eq(eventRegistrations.id, p.registrationId));
            eventId = reg?.eventId ?? null;
        });

        if (eventId) revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Nepodařilo se odebrat účastníka" };
    }
}

export async function cancelAdminRegistration(
    registrationId: number,
): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };

        const db = getDb();
        const now = new Date();
        let eventId: number | null = null;

        await db.transaction(async tx => {
            const [reg] = await tx
                .select({ eventId: eventRegistrations.eventId, cancelledAt: eventRegistrations.cancelledAt })
                .from(eventRegistrations)
                .where(eq(eventRegistrations.id, registrationId));

            if (!reg) throw new Error("Přihláška nenalezena");
            if (reg.cancelledAt) throw new Error("Přihláška je již zrušena");

            eventId = reg.eventId;

            await tx.update(eventRegistrations)
                .set({ cancelledAt: now })
                .where(eq(eventRegistrations.id, registrationId));

            await tx.update(eventPaymentPrescriptions)
                .set({ status: "cancelled", updatedAt: now })
                .where(eq(eventPaymentPrescriptions.registrationId, registrationId));

            await tx.insert(auditLog).values({
                entityType: "event_registration",
                entityId: registrationId,
                action: "cancel",
                changes: { cancelledAt: { old: null, new: now.toISOString() } },
                changedBy: session.user!.email!,
            });
        });

        if (eventId) revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Nepodařilo se zrušit přihlášku" };
    }
}
