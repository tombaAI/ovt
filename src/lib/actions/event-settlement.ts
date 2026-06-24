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
    eventSettlementEmailSends,
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

export type DepositForfeitPolicy = "forfeit_to_expense" | "forfeit_split" | "forfeit_to_club";

export type SettlementParticipant = {
    id: number;
    fullName: string;
    isPrimary: boolean;
    memberId: number | null;
    personId: number | null;
    memberName: string | null;
    cancelledAt: Date | null;
    depositRefundAmount: number | null;
    depositForfeitPolicy: DepositForfeitPolicy | null;
    depositForfeitExpenseId: number | null;
    /** Plnou přesností počítaný náklad přes všechny finální náklady (krok 4–5), 0 pro odhlášené. */
    totalCost: number;
    /** Dotace připsaná tomuto účastníkovi (0 pokud nečlen) — plná přesnost (krok 6). */
    subsidyAmount: number;
    /** Jediné místo zaokrouhlení v celém výpočtu — ceil(max(0, totalCost − subsidyAmount)) (krok 7). */
    finalAmount: number;
};

export type SettlementExpenseRow = {
    expenseId: number;
    purposeText: string | null;
    amount: number;
    allocationMethod: "split_all" | "per_registration" | "with_coefficients";
    allocatedAmount: number; // pro tuto přihlášku
};

export type PrescriptionInfo = {
    id: number;
    prescriptionCode: number;
    variableSymbol: string;
    bankAccount: string;
    status: string;
    amount: number;
    matchedAmount: number | null;
    paymentDue: string | null;
    depositPromise: boolean;
    depositPromiseNote: string | null;
};

/** Efektivní záloha pro výpočet doplatku — odečítáme jen co skutečně přišlo nebo je přislíbeno. */
function effectiveDepositAmount(dep: PrescriptionInfo | null): number {
    if (!dep) return 0;
    if (dep.status === "matched" || dep.status === "paid")
        return dep.matchedAmount ?? dep.amount;
    if (dep.depositPromise)
        return dep.amount;
    return 0;
}

export type SettlementRegistrationRow = {
    registrationId: number;
    firstName: string;
    lastName: string;
    email: string;
    personsCount: number;
    activePersonsCount: number; // personsCount mínus individuálně odhlášení účastníci
    participants: SettlementParticipant[];
    memberCount: number;
    expenses: SettlementExpenseRow[];
    expensesTotal: number;
    subsidy: number;
    totalAmount: number;
    /** Doplatek (krok 8) = max(0, totalAmount − effectiveDepositAmount) — počítáno živě, nezávisle na tom, zda už existuje settlementPrescription. */
    settlementAmount: number;
    /** Záloha — předpis platby vytvořený při podání přihlášky. Množství je fixní, billing ho nemění. */
    depositPrescription: PrescriptionInfo | null;
    /** Doplatek — předpis platby vytvořený při lockBilling. Částka = totalAmount − depositAmount. */
    settlementPrescription: PrescriptionInfo | null;
};

export type FinalExpenseRow = {
    id: number;
    purposeText: string | null;
    amount: number;
    effectiveAmount: number; // amount − propadlé zálohy napojené na tento náklad
    totalForfeit: number;    // Kč propadlých záloh odečtených z tohoto nákladu
    allocationMethod: "split_all" | "per_registration" | "with_coefficients";
    participantCoefficients: Record<string, number> | null;
};

export type EventSettlement = {
    eventId: number;
    subsidyTotal: number;           // celková dotace akce (uložena v events.subsidy_per_member)
    unitPrice: number;              // cena per osoba = Math.ceil(efektivní splitAll / totalParticipants)
    totalParticipants: number;      // počet aktivních (neodhlášených) účastníků
    totalMemberParticipants: number;
    finalExpenses: FinalExpenseRow[];
    registrations: SettlementRegistrationRow[];
    grandTotal: number;
    expensesSum: number;
};

// ── Klíče osob — sdílená identifikace účastníka pro koeficienty/váhy ──────────
// "p{participantId}" pro jmenované účastníky, "r{regId}-{idx}" pro bezejmenné
// (fallback dle personsCount, když přihláška nemá záznamy v event_registration_participants).
// Stejná logika musí platit v getEventSettlement i při ukládání koeficientů (setExpenseParticipantCoefficients),
// jinak se klíče v participantCoefficients neshodují s tím, co se čte při výpočtu.
function activePersonKeysForRegistration(
    regId: number,
    personsCount: number | null,
    regParticipants: { id: number; cancelledAt: Date | null }[],
): string[] {
    if (regParticipants.length > 0) {
        return regParticipants
            .map((p, i) => ({ key: p.id > 0 ? `p${p.id}` : `r${regId}-${i}`, active: !p.cancelledAt }))
            .filter(pk => pk.active)
            .map(pk => pk.key);
    }
    return Array.from({ length: personsCount ?? 1 }, (_, i) => `r${regId}-${i}`);
}

/** Zaokrouhlení nahoru na celé Kč s tolerancí na chyby plovoucí desetinné čárky (krok 7 — jediné místo zaokrouhlení). */
function ceilMoney(value: number): number {
    return Math.ceil(value - 1e-9);
}

// ── Výpočet vyúčtování ────────────────────────────────────────────────────────
//
// Postup přesně dle zadani/ZADANI_VYPOCET_NAKLADU_AKCE.md — počítá se s plnou
// přesností (žádné mezivýsledkové Math.ceil/Math.round) a zaokrouhluje se
// JEDNOU, na úplném konci, pro finální částku JEDNOHO ÚČASTNÍKA (krok 7).
// Přihláška je jen platební obálka — její doplatek je součet už zaokrouhlených
// částek jejích účastníků (krok 8), ne ceil() součtu celé přihlášky.

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
            participantCoefficients: eventExpenses.participantCoefficients,
        })
        .from(eventExpenses)
        .where(and(eq(eventExpenses.eventId, eventId), eq(eventExpenses.status, "final"), isNotNull(eventExpenses.amount)));

    const finalExpenses = expenses.map(e => ({
        id: e.id,
        purposeText: e.purposeText,
        amount: parseFloat(e.amount!),
        allocationMethod: e.allocationMethod as "split_all" | "per_registration" | "with_coefficients",
        participantCoefficients: (e.participantCoefficients as Record<string, number> | null) ?? null,
    }));

    // Manuální Kč alokace per registrace — jen pro "per_registration" (bez koeficientů; "with_coefficients"
    // se čte přímo z participantCoefficients výše, nepotřebuje derivovanou tabulku).
    const perRegExpenseIds = finalExpenses
        .filter(e => e.allocationMethod === "per_registration")
        .map(e => e.id);
    const manualAllocations = perRegExpenseIds.length > 0
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

    // Účastníci přihlášek — včetně individuálně odhlášených (cancelled_at NOT NULL)
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
                cancelledAt: eventRegistrationParticipants.cancelledAt,
                depositRefundAmount: eventRegistrationParticipants.depositRefundAmount,
                depositForfeitPolicy: eventRegistrationParticipants.depositForfeitPolicy,
                depositForfeitExpenseId: eventRegistrationParticipants.depositForfeitExpenseId,
            })
            .from(eventRegistrationParticipants)
            .leftJoin(members, eq(eventRegistrationParticipants.memberId, members.id))
            .where(inArray(eventRegistrationParticipants.registrationId, regIds))
        : [];

    // Existující předpisy — načítáme oba typy (deposit + settlement)
    const prescriptions = regIds.length > 0
        ? await db
            .select({
                id: eventPaymentPrescriptions.id,
                registrationId: eventPaymentPrescriptions.registrationId,
                type: eventPaymentPrescriptions.type,
                prescriptionCode: eventPaymentPrescriptions.prescriptionCode,
                bankAccount: eventPaymentPrescriptions.bankAccount,
                variableSymbol: eventPaymentPrescriptions.variableSymbol,
                status: eventPaymentPrescriptions.status,
                amount: eventPaymentPrescriptions.amount,
                matchedAmount: eventPaymentPrescriptions.matchedAmount,
                paymentDue: eventPaymentPrescriptions.paymentDue,
                depositPromise: eventPaymentPrescriptions.depositPromise,
                depositPromiseNote: eventPaymentPrescriptions.depositPromiseNote,
            })
            .from(eventPaymentPrescriptions)
            .where(inArray(eventPaymentPrescriptions.registrationId, regIds))
        : [];

    // ── Krok 1: klíče aktivních účastníků (per přihláška a globálně) ──────────
    type PersonKey = { key: string; registrationId: number; memberId: number | null };
    const personKeysByReg = new Map<number, PersonKey[]>();
    for (const reg of regs) {
        const regParts = participants.filter(p => p.registrationId === reg.id);
        const keys = activePersonKeysForRegistration(reg.id, reg.personsCount, regParts);
        personKeysByReg.set(
            reg.id,
            keys.map(key => {
                const participant = regParts.find((p, i) => (p.id > 0 ? `p${p.id}` : `r${reg.id}-${i}`) === key);
                return { key, registrationId: reg.id, memberId: participant?.memberId ?? null };
            }),
        );
    }
    const allPersonKeys = Array.from(personKeysByReg.values()).flat();

    const totalParticipants = allPersonKeys.length;
    const totalMemberParticipants = allPersonKeys.filter(k => k.memberId !== null).length;

    const expensesSum = finalExpenses.reduce((s, e) => s + e.amount, 0);

    // ── Krok 2: propadlé zálohy per náklad ─────────────────────────────────────
    // depositPerParticipant = depositPrescription.amount / personsCount (fixní sazba)
    function calcForfeitForExpense(expenseId: number): number {
        return participants
            .filter(p =>
                p.cancelledAt !== null &&
                p.depositForfeitPolicy === "forfeit_to_expense" &&
                p.depositForfeitExpenseId === expenseId
            )
            .reduce((sum, p) => {
                const reg = regs.find(r => r.id === p.registrationId);
                const depositRaw = prescriptions.find(pr => pr.registrationId === p.registrationId && pr.type === "deposit");
                if (!reg || !depositRaw) return sum;
                const depositPerPerson = parseFloat(depositRaw.amount) / (reg.personsCount ?? 1);
                const refund = parseFloat(p.depositRefundAmount ?? "0") || 0;
                return sum + Math.max(0, depositPerPerson - refund);
            }, 0);
    }

    const finalExpenseRows: FinalExpenseRow[] = finalExpenses.map(e => {
        const totalForfeit = calcForfeitForExpense(e.id);
        return {
            id: e.id,
            purposeText: e.purposeText,
            amount: e.amount,
            effectiveAmount: Math.max(0, e.amount - totalForfeit),
            totalForfeit,
            allocationMethod: e.allocationMethod,
            participantCoefficients: e.participantCoefficients,
        };
    });

    // ── Krok 1 (váhy) + krok 3 (cena za jednotku váhy) — per náklad, plná přesnost ──
    const weightsByExpense = new Map<number, Map<string, number>>(); // expenseId -> personKey -> weight
    const unitPriceByExpense = new Map<number, number>();

    for (const expense of finalExpenseRows) {
        const weights = new Map<string, number>();

        if (expense.allocationMethod === "split_all") {
            for (const k of allPersonKeys) weights.set(k.key, 1);
        } else if (expense.allocationMethod === "with_coefficients") {
            // Koeficienty jsou jediný zdroj pravdy — žádná derivovaná tabulka. Chybějící klíč
            // (účastník přidaný po uložení koeficientů) = váha 0, dokud admin nedoplní.
            // Bez koeficientů vůbec (teoretický stav, with_coefficients se vždy ukládá s nimi) → rovnoměrně.
            const coeffs = expense.participantCoefficients;
            for (const k of allPersonKeys) weights.set(k.key, coeffs ? (coeffs[k.key] ?? 0) : 1);
        } else {
            // per_registration (manuální Kč částka per přihláška, bez koeficientů): váha = částka
            // z eventExpenseAllocations, rozpočtená rovným dílem na aktivní účastníky té přihlášky.
            // Bez jakýchkoli zadaných alokací → fallback: rovnoměrně na všechny (jako split_all).
            const allocsForExpense = manualAllocations.filter(a => a.expenseId === expense.id);
            if (allocsForExpense.length === 0) {
                for (const k of allPersonKeys) weights.set(k.key, 1);
            } else {
                for (const [regId, keys] of personKeysByReg) {
                    const alloc = allocsForExpense.find(a => a.registrationId === regId);
                    const regWeight = alloc ? parseFloat(alloc.amount) : 0;
                    const per = keys.length > 0 ? regWeight / keys.length : 0;
                    for (const k of keys) weights.set(k.key, per);
                }
            }
        }

        weightsByExpense.set(expense.id, weights);
        const totalWeight = allPersonKeys.reduce((s, k) => s + (weights.get(k.key) ?? 0), 0);
        unitPriceByExpense.set(expense.id, totalWeight > 0 ? expense.effectiveAmount / totalWeight : 0);
    }

    // unitPrice — souhrnné informativní pole, jen pro "split_all" náklady. Plná přesnost (krok 3).
    const splitAllSum = finalExpenseRows
        .filter(e => e.allocationMethod === "split_all")
        .reduce((s, e) => s + e.effectiveAmount, 0);
    const unitPrice = totalParticipants > 0 ? splitAllSum / totalParticipants : 0;

    // ── Krok 4–7: náklad na účastníka přes všechny náklady, dotace, JEDINÉ zaokrouhlení NAHORU ──
    // Dotace na člena se zaokrouhluje DOLŮ na celé Kč už tady (výjimka z "zaokrouhli jen jednou") —
    // součet skutečně přiznané dotace tak nikdy nepřekročí schválenou částku event.subsidyPerMember.
    const subsidyPerMember = totalMemberParticipants > 0 ? Math.floor(subsidyTotal / totalMemberParticipants) : 0;

    type ParticipantCalc = {
        key: string;
        registrationId: number;
        memberId: number | null;
        totalCost: number;
        subsidyAmount: number;
        finalAmount: number;
        perExpense: Map<number, number>; // expenseId -> plná přesnost příspěvek (rozpis pro UI/e-mail)
    };

    const participantCalcs: ParticipantCalc[] = allPersonKeys.map(k => {
        const perExpense = new Map<number, number>();
        let totalCost = 0;
        for (const expense of finalExpenseRows) {
            const weight = weightsByExpense.get(expense.id)?.get(k.key) ?? 0;
            const cost = (unitPriceByExpense.get(expense.id) ?? 0) * weight;
            perExpense.set(expense.id, cost);
            totalCost += cost;
        }
        const subsidyAmount = k.memberId !== null ? subsidyPerMember : 0;
        const finalAmount = ceilMoney(Math.max(0, totalCost - subsidyAmount));
        return { key: k.key, registrationId: k.registrationId, memberId: k.memberId, totalCost, subsidyAmount, finalAmount, perExpense };
    });

    const calcsByReg = new Map<number, ParticipantCalc[]>();
    for (const c of participantCalcs) {
        const arr = calcsByReg.get(c.registrationId) ?? [];
        arr.push(c);
        calcsByReg.set(c.registrationId, arr);
    }

    // ── Krok 8: doplatek přihlášky = součet už zaokrouhlených částek jejích účastníků ──
    const registrationRows: SettlementRegistrationRow[] = regs.map(reg => {
        const calcs = calcsByReg.get(reg.id) ?? [];

        const regParticipants = participants.filter(p => p.registrationId === reg.id).map((p, i) => {
            const key = p.id > 0 ? `p${p.id}` : `r${reg.id}-${i}`;
            const calc = calcs.find(c => c.key === key);
            return {
                id: p.id,
                fullName: p.fullName,
                isPrimary: p.isPrimary,
                memberId: p.memberId,
                personId: p.personId,
                memberName: p.memberName ?? null,
                cancelledAt: p.cancelledAt as Date | null,
                depositRefundAmount: p.depositRefundAmount ? parseFloat(p.depositRefundAmount) : null,
                depositForfeitPolicy: p.depositForfeitPolicy as DepositForfeitPolicy | null,
                depositForfeitExpenseId: p.depositForfeitExpenseId,
                totalCost: calc?.totalCost ?? 0,
                subsidyAmount: calc?.subsidyAmount ?? 0,
                finalAmount: calc?.finalAmount ?? 0,
            };
        });
        const memberCount = regParticipants.filter(p => p.memberId !== null && !p.cancelledAt).length;
        const personsCount = reg.personsCount ?? 1;
        const activePersonsCount = calcs.length > 0 ? calcs.length : personsCount;

        // Rozpis nákladů pro zobrazení (Náklady/Platby tab, e-mail) — plná přesnost,
        // sečteno přes aktivní účastníky této přihlášky. Informativní; doplatek (totalAmount)
        // se počítá ze zaokrouhlených finalAmount jednotlivých účastníků, ne z tohoto součtu.
        const expenseRows: SettlementExpenseRow[] = finalExpenseRows.map(expense => {
            const allocatedAmount = calcs.reduce((s, c) => s + (c.perExpense.get(expense.id) ?? 0), 0);
            return {
                expenseId: expense.id,
                purposeText: expense.purposeText,
                amount: expense.amount,
                allocationMethod: expense.allocationMethod,
                allocatedAmount,
            };
        });

        const expensesTotal = calcs.reduce((s, c) => s + c.totalCost, 0);
        const subsidy = calcs.reduce((s, c) => s + c.subsidyAmount, 0);
        const totalAmount = calcs.reduce((s, c) => s + c.finalAmount, 0);

        const regPrescriptions = prescriptions.filter(p => p.registrationId === reg.id);
        const depositRaw = regPrescriptions.find(p => p.type === "deposit") ?? null;
        const settlementRaw = regPrescriptions.find(p => p.type === "settlement") ?? null;

        const toPrescriptionInfo = (p: typeof depositRaw): PrescriptionInfo | null =>
            p ? {
                id: p.id,
                prescriptionCode: p.prescriptionCode,
                bankAccount: p.bankAccount,
                variableSymbol: p.variableSymbol,
                status: p.status,
                amount: parseFloat(p.amount),
                matchedAmount: p.matchedAmount ? parseFloat(p.matchedAmount) : null,
                paymentDue: p.paymentDue,
                depositPromise: p.depositPromise,
                depositPromiseNote: p.depositPromiseNote,
            } : null;

        const depositPrescription = toPrescriptionInfo(depositRaw);

        return {
            registrationId: reg.id,
            firstName: reg.firstName,
            lastName: reg.lastName,
            email: reg.email,
            personsCount,
            activePersonsCount,
            participants: regParticipants,
            memberCount,
            expenses: expenseRows,
            expensesTotal,
            subsidy,
            totalAmount,
            settlementAmount: Math.max(0, totalAmount - effectiveDepositAmount(depositPrescription)),
            depositPrescription,
            settlementPrescription: toPrescriptionInfo(settlementRaw),
        };
    });

    const grandTotal = registrationRows.reduce((s, r) => s + r.totalAmount, 0);

    return { eventId, subsidyTotal, unitPrice, totalParticipants, totalMemberParticipants, finalExpenses: finalExpenseRows, registrations: registrationRows, grandTotal, expensesSum };
}

// ── Billing status helpers ────────────────────────────────────────────────────

type EventLocks = {
    billingStatus: "draft" | "prescribed";
    lockForParticipants: boolean;
    lockForReimbursement: boolean;
};

async function getEventLocks(db: ReturnType<typeof getDb>, eventId: number): Promise<EventLocks | null> {
    const [row] = await db
        .select({ billingStatus: events.billingStatus, lockForParticipants: events.lockForParticipants, lockForReimbursement: events.lockForReimbursement })
        .from(events)
        .where(eq(events.id, eventId));
    if (!row) return null;
    return { billingStatus: row.billingStatus as "draft" | "prescribed", lockForParticipants: row.lockForParticipants, lockForReimbursement: row.lockForReimbursement };
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
            .set({ billingStatus: "prescribed", lockForParticipants: true, updatedAt: new Date() })
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
 * Předpisy plateb se NIKDY nemažou — zálohy z přihlášek musí zůstat platné
 * bez ohledu na stav nákladů. Při dalším lockBilling upsertPrescriptionAmounts
 * existující předpisy aktualizuje (nepřepisuje kód, jen částku a splatnost).
 */
export async function unlockBilling(eventId: number): Promise<{ success: true; deletedPrescriptions: number } | { error: string }> {
    try {
        const db = getDb();

        await db.update(events)
            .set({ billingStatus: "draft", lockForParticipants: false, updatedAt: new Date() })
            .where(eq(events.id, eventId));

        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true, deletedPrescriptions: 0 };
    } catch (e) {
        console.error(e);
        return { error: "Chyba při odemknutí vyúčtování" };
    }
}

/** Uzamkne doklady pro proplacení — zamkne metadata nákladů (kategorie, popis, příjemce, soubor). */
export async function lockForReimbursement(eventId: number): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        const [ev] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
        if (!ev) return { error: "Akce nenalezena" };
        await db.update(events)
            .set({ lockForReimbursement: true, updatedAt: new Date() })
            .where(eq(events.id, eventId));
        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch {
        return { error: "Chyba při uzamčení dokladů" };
    }
}

/** Odemkne doklady pro proplacení. */
export async function unlockForReimbursement(eventId: number): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        await db.update(events)
            .set({ lockForReimbursement: false, updatedAt: new Date() })
            .where(eq(events.id, eventId));
        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch {
        return { error: "Chyba při odemčení dokladů" };
    }
}

// ── Dotace akce ───────────────────────────────────────────────────────────────

export async function updateEventSubsidy(eventId: number, subsidyPerMember: number | null): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        if ((await getEventLocks(db, eventId))?.lockForParticipants)
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
        if ((await getEventLocks(db, exp.eventId))?.lockForParticipants)
            return { error: "Vyúčtování je uzamčeno — nejdřív odemkněte" };

        // participantCoefficients záměrně nezahazujeme — zachováme je pro obnovu při přepnutí zpět
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
        if ((await getEventLocks(db, exp.eventId))?.lockForParticipants)
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

// ── Koeficienty účastníků ─────────────────────────────────────────────────────

/**
 * Uloží koeficienty účastníků a přepne metodu na with_coefficients.
 * Klíče: "p{participantId}" pro jmenované účastníky, "r{regId}-{idx}" pro bezejmenné —
 * stejná identifikace jako activePersonKeysForRegistration v getEventSettlement.
 *
 * Žádná derivovaná Kč alokace se neukládá — getEventSettlement čte participantCoefficients
 * přímo a počítá s plnou přesností (krok 1+3 v ZADANI_VYPOCET_NAKLADU_AKCE.md). Staré
 * alokace (např. z dřívějšího per_registration) se smažou, aby nezůstaly jako mrtvá data.
 */
export async function setExpenseParticipantCoefficients(
    expenseId: number,
    coefficients: Record<string, number>,
): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();

        const [exp] = await db
            .select({ amount: eventExpenses.amount, eventId: eventExpenses.eventId })
            .from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));
        if (!exp?.amount) return { error: "Náklad nenalezen nebo nemá částku" };
        if ((await getEventLocks(db, exp.eventId))?.lockForParticipants)
            return { error: "Vyúčtování je uzamčeno — nejdřív odemkněte" };

        await db.transaction(async tx => {
            await tx.update(eventExpenses)
                .set({ allocationMethod: "with_coefficients", participantCoefficients: coefficients })
                .where(eq(eventExpenses.id, expenseId));
            await tx.delete(eventExpenseAllocations).where(eq(eventExpenseAllocations.expenseId, expenseId));
        });

        revalidatePath(`/dashboard/events/${exp.eventId}`);
        return { success: true };
    } catch (e) {
        console.error("[setExpenseParticipantCoefficients]", e);
        return { error: "Nepodařilo se uložit koeficienty" };
    }
}

// ── Předpisy plateb ───────────────────────────────────────────────────────────

const EVENT_BANK_ACCOUNT = "351416278/0300";
const EVENT_VS = "20702"; // oddíl OVT v rámci TJ Bohemians — stejný VS jako u záloh za zahraniční akce

/**
 * Interní helper: vytvoří settlement (doplatek) předpis s amount=0 jako placeholder.
 * Volá se při vzniku admin přihlášky nebo při lockBilling pro přihlášky bez settlement předpisu.
 * Kód se alokuje vždy nový ze sekvence — settlement se nesmaže (od opravy unlockBilling).
 */
async function createSettlementPrescription(
    tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
    eventId: number,
    registrationId: number,
    firstName: string,
    lastName: string,
    eventName: string,
): Promise<number> {
    const seqResult = await tx.execute(sql`SELECT nextval('app.event_payment_prescription_code_seq')::int AS code`);
    const code = (seqResult as unknown as { code: number }[])[0]?.code ?? null;
    if (!code) throw new Error("Nepodařilo se získat kód settlement předpisu");

    await tx.insert(eventPaymentPrescriptions).values({
        eventId,
        registrationId,
        type: "settlement",
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
 * Interní helper: vytvoří nebo aktualizuje settlement (doplatek) předpisy.
 * Deposit předpisy (zálohy) se NIKDY nemění — jejich částka je fixní od přihlášky.
 * Settlement částka = max(0, totalAmount − depositAmount).
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
            const depositAmount = effectiveDepositAmount(reg.depositPrescription);
            const settlementAmount = String(Math.max(0, reg.totalAmount - depositAmount));

            if (reg.settlementPrescription) {
                await tx.update(eventPaymentPrescriptions)
                    .set({ amount: settlementAmount, paymentDue: paymentDueStr, updatedAt: new Date() })
                    .where(eq(eventPaymentPrescriptions.id, reg.settlementPrescription.id));
                updated++;
            } else {
                await createSettlementPrescription(tx, eventId, reg.registrationId, reg.firstName, reg.lastName, eventName);
                // Při prvním vytvoření nastavíme správnou částku a splatnost
                await tx.update(eventPaymentPrescriptions)
                    .set({ amount: settlementAmount, paymentDue: paymentDueStr })
                    .where(and(
                        eq(eventPaymentPrescriptions.registrationId, reg.registrationId),
                        eq(eventPaymentPrescriptions.type, "settlement"),
                    ));
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
    note?: string | null;
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
        if ((await getEventLocks(db, eventId))?.lockForParticipants) return { error: "Nelze přidávat přihlášky — náklady jsou uzamčeny." };

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
                note: input.note ?? null,
                publicToken,
                personsCount: input.participants.length,
            }).returning({ id: eventRegistrations.id });

            for (let i = 0; i < input.participants.length; i++) {
                const p = input.participants[i];
                await tx.insert(eventRegistrationParticipants).values({
                    registrationId: reg.id,
                    eventId,
                    participantOrder: i + 1,
                    fullName: p.fullName,
                    isPrimary: p.isPrimary,
                    memberId: p.memberId ?? null,
                    personId: p.personId ?? null,
                });
            }

            // Přihláška dostane settlement předpis hned při vzniku (amount=0, přepočítá se při lockBilling)
            await createSettlementPrescription(tx, eventId, reg.id, input.firstName, input.lastName, event.name);

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
    input: Partial<Pick<AdminRegistrationInput, "email" | "phone" | "firstName" | "lastName"> & { note: string | null }>,
): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        const [reg] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, registrationId));
        if (!reg) return { error: "Přihláška nenalezena" };
        if ((await getEventLocks(db, reg.eventId))?.lockForParticipants) return { error: "Nelze měnit přihlášky — náklady jsou uzamčeny." };
        await db.update(eventRegistrations).set(input).where(eq(eventRegistrations.id, registrationId));
        if (reg) revalidatePath(`/dashboard/events/${reg.eventId}`);
        return { success: true };
    } catch {
        return { error: "Nepodařilo se upravit přihlášku" };
    }
}

export async function updateParticipantFullName(
    participantId: number,
    fullName: string,
): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        const [pRow] = await db
            .select({ registrationId: eventRegistrationParticipants.registrationId })
            .from(eventRegistrationParticipants)
            .where(eq(eventRegistrationParticipants.id, participantId));
        if (!pRow) return { error: "Účastník nenalezen" };
        const [regRow] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, pRow.registrationId));
        if (regRow && (await getEventLocks(db, regRow.eventId))?.lockForParticipants) return { error: "Nelze měnit účastníky — náklady jsou uzamčeny." };
        await db.update(eventRegistrationParticipants)
            .set({ fullName: fullName.trim() })
            .where(eq(eventRegistrationParticipants.id, participantId));
        if (regRow) revalidatePath(`/dashboard/events/${regRow.eventId}`);
        return { success: true };
    } catch {
        return { error: "Nepodařilo se přejmenovat účastníka" };
    }
}

export async function linkParticipantToMember(
    participantId: number,
    memberId: number | null,
): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();
        const [pRow] = await db
            .select({ registrationId: eventRegistrationParticipants.registrationId })
            .from(eventRegistrationParticipants)
            .where(eq(eventRegistrationParticipants.id, participantId));
        if (pRow) {
            const [regRow] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, pRow.registrationId));
            if (regRow && (await getEventLocks(db, regRow.eventId))?.lockForParticipants) return { error: "Nelze měnit účastníky — náklady jsou uzamčeny." };
        }
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
        if (memberId) revalidatePath(`/dashboard/members/${memberId}`);
        return { success: true };
    } catch (e) {
        console.error("[linkParticipantToMember]", e);
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("event_reg_participants_event_member_uq")) {
            return { error: "Tento člen je již propojen s jiným účastníkem této akce." };
        }
        return { error: `Nepodařilo se spárovat účastníka: ${msg}` };
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

export type EmailSendLogEntry = {
    id: number;
    sentAt: Date;
    sentBy: string;
    sentCount: number;
    skippedCount: number;
    failedCount: number;
    message: string | null;
    registrationId: number | null;
    registrationName: string | null;
    testTo: string | null;
};

export async function getEventSettlementEmailLog(eventId: number): Promise<EmailSendLogEntry[]> {
    const db = getDb();
    const rows = await db
        .select({
            id: eventSettlementEmailSends.id,
            sentAt: eventSettlementEmailSends.sentAt,
            sentBy: eventSettlementEmailSends.sentBy,
            sentCount: eventSettlementEmailSends.sentCount,
            skippedCount: eventSettlementEmailSends.skippedCount,
            failedCount: eventSettlementEmailSends.failedCount,
            message: eventSettlementEmailSends.message,
            registrationId: eventSettlementEmailSends.registrationId,
            testTo: eventSettlementEmailSends.testTo,
            firstName: eventRegistrations.firstName,
            lastName: eventRegistrations.lastName,
        })
        .from(eventSettlementEmailSends)
        .leftJoin(eventRegistrations, eq(eventSettlementEmailSends.registrationId, eventRegistrations.id))
        .where(eq(eventSettlementEmailSends.eventId, eventId))
        .orderBy(sql`${eventSettlementEmailSends.sentAt} DESC`);

    return rows.map(r => ({
        id: r.id,
        sentAt: r.sentAt,
        sentBy: r.sentBy,
        sentCount: r.sentCount,
        skippedCount: r.skippedCount,
        failedCount: r.failedCount,
        message: r.message,
        registrationId: r.registrationId ?? null,
        registrationName: r.firstName ? `${r.firstName} ${r.lastName}` : null,
        testTo: r.testTo ?? null,
    }));
}

function buildSettlementEmailPayload(
    reg: SettlementRegistrationRow,
    eventName: string,
    message: string | undefined,
    senderName: string | undefined,
    senderEmail: string | undefined,
) {
    // E-mail s vyúčtováním odesíláme pro settlement (doplatek) předpis
    const p = reg.settlementPrescription!;
    return buildEventSettlementEmail({
        firstName: reg.firstName,
        lastName: reg.lastName,
        email: reg.email,
        eventName,
        prescriptionCode: p.prescriptionCode,
        variableSymbol: p.variableSymbol,
        amount: p.amount,
        bankAccount: p.bankAccount,
        paymentDue: p.paymentDue,
        participants: reg.participants.filter(pt => !pt.cancelledAt).map(pt => ({ fullName: pt.fullName, isMember: pt.memberId !== null, cost: pt.totalCost })),
        memberCount: reg.memberCount,
        subsidy: reg.subsidy,
        depositAmount: effectiveDepositAmount(reg.depositPrescription),
        message: message || undefined,
        senderName,
        senderEmail,
    });
}

export async function sendEventSettlementEmails(
    eventId: number,
    opts?: { message?: string },
): Promise<{ sent: number; skipped: number; failed: { name: string; email: string; error: string }[] } | { error: string }> {
    const emailSettings = getEmailSettings();
    if (!emailSettings.configured) return { error: "E-mail není nakonfigurován (chybí RESEND_API_KEY)" };

    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };

    try {
        const db = getDb();
        const [event] = await db.select({ name: events.name, treasurerApproved: events.treasurerApproved }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };
        if (!event.treasurerApproved) return { error: "Předpisy nelze odeslat — hospodář ještě neudělil souhlas s vyúčtováním." };

        const settlement = await getEventSettlement(eventId);
        await upsertPrescriptionAmounts(eventId, settlement, event.name, db);
        const freshSettlement = await getEventSettlement(eventId);

        const resend = getResendClient();
        let sent = 0;
        let skipped = 0;
        const failed: { name: string; email: string; error: string }[] = [];
        const senderName = session.user.name ?? undefined;
        const senderEmail = session.user.email;

        for (const reg of freshSettlement.registrations) {
            const p = reg.settlementPrescription;
            if (!p || p.status === "cancelled") { skipped++; continue; }

            const to = emailSettings.testTo ?? reg.email;
            const fullName = `${reg.firstName} ${reg.lastName}`;
            const { subject, html } = buildSettlementEmailPayload(reg, event.name, opts?.message, senderName, senderEmail);

            try {
                const result = await resend.emails.send({ from: emailSettings.from, to, replyTo: emailSettings.replyTo, subject, html });
                if (result.error) { failed.push({ name: fullName, email: to, error: result.error.message }); }
                else { sent++; }
            } catch (e) {
                failed.push({ name: fullName, email: to, error: e instanceof Error ? e.message : "Neznámá chyba" });
            }
            await new Promise(r => setTimeout(r, 250));
        }

        await db.insert(eventSettlementEmailSends).values({
            eventId,
            sentBy: senderEmail,
            sentCount: sent,
            skippedCount: skipped,
            failedCount: failed.length,
            message: opts?.message || null,
            registrationId: null,
            testTo: emailSettings.testTo ?? null,
        });

        return { sent, skipped, failed };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Chyba při odesílání e-mailů" };
    }
}

export async function sendSingleRegistrationEmail(
    registrationId: number,
    opts?: { message?: string },
): Promise<{ success: true } | { error: string }> {
    const emailSettings = getEmailSettings();
    if (!emailSettings.configured) return { error: "E-mail není nakonfigurován (chybí RESEND_API_KEY)" };

    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };

    try {
        const db = getDb();

        const [reg] = await db
            .select({ eventId: eventRegistrations.eventId, cancelledAt: eventRegistrations.cancelledAt })
            .from(eventRegistrations).where(eq(eventRegistrations.id, registrationId));
        if (!reg) return { error: "Přihláška nenalezena" };
        if (reg.cancelledAt) return { error: "Přihláška je zrušena" };
        if ((await getEventLocks(db, reg.eventId))?.billingStatus !== "prescribed") return { error: "Náklady nejsou uzamčeny — nejdříve vygenerujte předpisy." };

        const [event] = await db.select({ name: events.name, treasurerApproved: events.treasurerApproved }).from(events).where(eq(events.id, reg.eventId));
        if (!event) return { error: "Akce nenalezena" };
        if (!event.treasurerApproved) return { error: "Předpis nelze odeslat — hospodář ještě neudělil souhlas s vyúčtováním." };

        const settlement = await getEventSettlement(reg.eventId);
        await upsertPrescriptionAmounts(reg.eventId, settlement, event.name, db);
        const freshSettlement = await getEventSettlement(reg.eventId);
        const regRow = freshSettlement.registrations.find(r => r.registrationId === registrationId);
        if (!regRow) return { error: "Přihláška není ve vyúčtování" };
        if (!regRow.settlementPrescription) return { error: "Přihláška nemá doplatek předpis — nejdříve uzamkněte náklady." };

        const to = emailSettings.testTo ?? regRow.email;
        const senderName = session.user.name ?? undefined;
        const senderEmail = session.user.email;
        const { subject, html } = buildSettlementEmailPayload(regRow, event.name, opts?.message, senderName, senderEmail);

        const result = await getResendClient().emails.send({ from: emailSettings.from, to, replyTo: emailSettings.replyTo, subject, html });
        if (result.error) return { error: result.error.message };

        await db.insert(eventSettlementEmailSends).values({
            eventId: reg.eventId,
            sentBy: senderEmail,
            sentCount: 1,
            skippedCount: 0,
            failedCount: 0,
            message: opts?.message || null,
            registrationId,
            testTo: emailSettings.testTo ?? null,
        });

        revalidatePath(`/dashboard/events/${reg.eventId}`);
        return { success: true };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Chyba při odesílání e-mailu" };
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
        const [regRow] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, registrationId));
        if (!regRow) return { error: "Přihláška nenalezena" };
        if ((await getEventLocks(db, regRow.eventId))?.lockForParticipants) return { error: "Nelze přidávat účastníky — náklady jsou uzamčeny." };

        let eventId: number | null = null;

        await db.transaction(async tx => {
            const [{ nextOrder }] = await tx
                .select({ nextOrder: sql<number>`COALESCE(MAX(${eventRegistrationParticipants.participantOrder}), 0) + 1` })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.registrationId, registrationId));

            await tx.insert(eventRegistrationParticipants).values({
                registrationId,
                eventId: regRow.eventId,
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
        const [pRow] = await db
            .select({ registrationId: eventRegistrationParticipants.registrationId })
            .from(eventRegistrationParticipants)
            .where(eq(eventRegistrationParticipants.id, participantId));
        if (!pRow) return { error: "Účastník nenalezen" };
        const [regRow] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, pRow.registrationId));
        if (regRow && (await getEventLocks(db, regRow.eventId))?.lockForParticipants) return { error: "Nelze odebírat účastníky — náklady jsou uzamčeny." };

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

// ── Finální náklady akce (pro select v dialogu propadlé zálohy) ───────────────

export async function getEventFinalExpenses(
    eventId: number,
): Promise<{ id: number; purposeText: string | null; amount: number }[]> {
    const db = getDb();
    const rows = await db
        .select({ id: eventExpenses.id, purposeText: eventExpenses.purposeText, amount: eventExpenses.amount })
        .from(eventExpenses)
        .where(and(eq(eventExpenses.eventId, eventId), eq(eventExpenses.status, "final"), isNotNull(eventExpenses.amount)));
    return rows.map(r => ({ id: r.id, purposeText: r.purposeText, amount: parseFloat(r.amount!) }));
}

// ── Odhlášení konkrétního účastníka (bez zrušení celé přihlášky) ──────────────

export interface CancelParticipantData {
    depositRefundAmount?: number;
    depositForfeitPolicy?: DepositForfeitPolicy;
    depositForfeitExpenseId?: number | null;
}

export async function cancelParticipant(
    participantId: number,
    data: CancelParticipantData,
): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };

        const db = getDb();
        const now = new Date();
        let eventId: number | null = null;

        await db.transaction(async tx => {
            const [participant] = await tx
                .select({
                    id: eventRegistrationParticipants.id,
                    registrationId: eventRegistrationParticipants.registrationId,
                    fullName: eventRegistrationParticipants.fullName,
                    cancelledAt: eventRegistrationParticipants.cancelledAt,
                })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.id, participantId));

            if (!participant) throw new Error("Účastník nenalezen");
            if (participant.cancelledAt) throw new Error("Účastník je již odhlášen");

            const [reg] = await tx
                .select({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, cancelledAt: eventRegistrations.cancelledAt, personsCount: eventRegistrations.personsCount })
                .from(eventRegistrations)
                .where(eq(eventRegistrations.id, participant.registrationId));

            if (!reg) throw new Error("Přihláška nenalezena");
            if (reg.cancelledAt) throw new Error("Přihláška je již zrušena");

            eventId = reg.eventId;

            // Označit účastníka jako odhlášeného
            await tx.update(eventRegistrationParticipants)
                .set({
                    cancelledAt: now,
                    depositRefundAmount: data.depositRefundAmount != null ? String(data.depositRefundAmount) : null,
                    depositForfeitPolicy: data.depositForfeitPolicy ?? null,
                    depositForfeitExpenseId: data.depositForfeitExpenseId ?? null,
                })
                .where(eq(eventRegistrationParticipants.id, participantId));

            // Zkontrolovat: pokud jsou nyní VŠICHNI účastníci odhlášeni, přihláška se stává zrušenou
            const remaining = await tx
                .select({ id: eventRegistrationParticipants.id })
                .from(eventRegistrationParticipants)
                .where(and(
                    eq(eventRegistrationParticipants.registrationId, participant.registrationId),
                    isNull(eventRegistrationParticipants.cancelledAt),
                ));

            if (remaining.length === 0) {
                await tx.update(eventRegistrations)
                    .set({ cancelledAt: now })
                    .where(eq(eventRegistrations.id, participant.registrationId));

                await tx.update(eventPaymentPrescriptions)
                    .set({ status: "cancelled", updatedAt: now })
                    .where(and(
                        eq(eventPaymentPrescriptions.registrationId, participant.registrationId),
                        inArray(eventPaymentPrescriptions.status, ["pending"]),
                    ));

                await tx.insert(auditLog).values({
                    entityType: "event_registration",
                    entityId: participant.registrationId,
                    action: "cancel",
                    changes: { cancelledAt: { old: null, new: now.toISOString() }, reason: { old: null, new: "Všichni účastníci odhlášeni" } },
                    changedBy: session.user!.email!,
                });
            }

            await tx.insert(auditLog).values({
                entityType: "event_registration",
                entityId: participant.registrationId,
                action: "cancel_participant",
                changes: {
                    participant: { old: null, new: participant.fullName },
                    cancelledAt: { old: null, new: now.toISOString() },
                    ...(data.depositRefundAmount != null ? { depositRefundAmount: { old: null, new: String(data.depositRefundAmount) } } : {}),
                    ...(data.depositForfeitPolicy ? { depositForfeitPolicy: { old: null, new: data.depositForfeitPolicy } } : {}),
                },
                changedBy: session.user!.email!,
            });
        });

        if (eventId) {
            // with_coefficients váhy se počítají vždy živě z aktivních účastníků (getEventSettlement),
            // odhlášený účastník se tedy automaticky vyřadí — žádný přepočet alokací není potřeba.

            // Pokud je billing uzamčen, přepočítáme i settlement předpisy — jinak payments tab ukazuje
            // stará čísla z doby před odhlášením účastníka.
            const [ev] = await db
                .select({ billingStatus: events.billingStatus, name: events.name })
                .from(events)
                .where(eq(events.id, eventId));
            if (ev?.billingStatus === "prescribed") {
                const settlement = await getEventSettlement(eventId);
                await upsertPrescriptionAmounts(eventId, settlement, ev.name, db);
            }
            revalidatePath(`/dashboard/events/${eventId}`);
        }
        return { success: true };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Nepodařilo se odhlásit účastníka" };
    }
}

export async function restoreParticipant(
    participantId: number,
): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };

        const db = getDb();
        let eventId: number | null = null;

        await db.transaction(async tx => {
            const [participant] = await tx
                .select({
                    id: eventRegistrationParticipants.id,
                    registrationId: eventRegistrationParticipants.registrationId,
                    fullName: eventRegistrationParticipants.fullName,
                    cancelledAt: eventRegistrationParticipants.cancelledAt,
                })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.id, participantId));

            if (!participant) throw new Error("Účastník nenalezen");
            if (!participant.cancelledAt) throw new Error("Účastník není odhlášen");

            const [reg] = await tx
                .select({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, cancelledAt: eventRegistrations.cancelledAt })
                .from(eventRegistrations)
                .where(eq(eventRegistrations.id, participant.registrationId));

            if (!reg) throw new Error("Přihláška nenalezena");

            eventId = reg.eventId;

            // Zjistit, zda jsou všichni účastníci odhlášeni (auto-cancel přihlášky)
            const activeParticipants = await tx
                .select({ id: eventRegistrationParticipants.id })
                .from(eventRegistrationParticipants)
                .where(and(
                    eq(eventRegistrationParticipants.registrationId, participant.registrationId),
                    isNull(eventRegistrationParticipants.cancelledAt),
                ));

            const wasAutoCancel = activeParticipants.length === 0 && !!reg.cancelledAt;

            // Obnovit účastníka
            await tx.update(eventRegistrationParticipants)
                .set({
                    cancelledAt: null,
                    depositRefundAmount: null,
                    depositForfeitPolicy: null,
                    depositForfeitExpenseId: null,
                })
                .where(eq(eventRegistrationParticipants.id, participantId));

            // Pokud byla přihláška auto-zrušena (všichni účastníci odhlášeni), obnovit i přihlášku
            if (wasAutoCancel) {
                await tx.update(eventRegistrations)
                    .set({ cancelledAt: null })
                    .where(eq(eventRegistrations.id, participant.registrationId));

                await tx.update(eventPaymentPrescriptions)
                    .set({ status: "pending", updatedAt: new Date() })
                    .where(and(
                        eq(eventPaymentPrescriptions.registrationId, participant.registrationId),
                        eq(eventPaymentPrescriptions.status, "cancelled"),
                    ));

                await tx.insert(auditLog).values({
                    entityType: "event_registration",
                    entityId: participant.registrationId,
                    action: "restore",
                    changes: { cancelledAt: { old: reg.cancelledAt!.toISOString(), new: null } },
                    changedBy: session.user!.email!,
                });
            }

            await tx.insert(auditLog).values({
                entityType: "event_registration",
                entityId: participant.registrationId,
                action: "restore_participant",
                changes: {
                    participant: { old: participant.fullName, new: null },
                    cancelledAt: { old: participant.cancelledAt.toISOString(), new: null },
                },
                changedBy: session.user!.email!,
            });
        });

        if (eventId) {
            const [ev] = await db
                .select({ billingStatus: events.billingStatus, name: events.name })
                .from(events)
                .where(eq(events.id, eventId));
            if (ev?.billingStatus === "prescribed") {
                const settlement = await getEventSettlement(eventId);
                await upsertPrescriptionAmounts(eventId, settlement, ev.name, db);
            }
            revalidatePath(`/dashboard/events/${eventId}`);
        }
        return { success: true };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Nepodařilo se obnovit účastníka" };
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

            const [paidPrescription] = await tx
                .select({ id: eventPaymentPrescriptions.id })
                .from(eventPaymentPrescriptions)
                .where(and(
                    eq(eventPaymentPrescriptions.registrationId, registrationId),
                    inArray(eventPaymentPrescriptions.status, ["matched", "paid"]),
                ))
                .limit(1);
            if (paidPrescription) throw new Error("Nelze zrušit přihlášku — záloha byla přijata. Pro ruční storno kontaktuj pokladníka.");

            eventId = reg.eventId;

            await tx.update(eventRegistrations)
                .set({ cancelledAt: now })
                .where(eq(eventRegistrations.id, registrationId));

            await tx.update(eventPaymentPrescriptions)
                .set({ status: "cancelled", updatedAt: now })
                .where(eq(eventPaymentPrescriptions.registrationId, registrationId));

            // Odlinkovat členy — uvolní unique constraint pro případnou jinou aktivní přihlášku
            await tx.update(eventRegistrationParticipants)
                .set({ memberId: null })
                .where(eq(eventRegistrationParticipants.registrationId, registrationId));

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

export async function restoreAdminRegistration(
    registrationId: number,
): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };

        const db = getDb();
        let eventId: number | null = null;

        await db.transaction(async tx => {
            const [reg] = await tx
                .select({ eventId: eventRegistrations.eventId, cancelledAt: eventRegistrations.cancelledAt })
                .from(eventRegistrations)
                .where(eq(eventRegistrations.id, registrationId));

            if (!reg) throw new Error("Přihláška nenalezena");
            if (!reg.cancelledAt) throw new Error("Přihláška není zrušena");

            eventId = reg.eventId;

            await tx.update(eventRegistrations)
                .set({ cancelledAt: null })
                .where(eq(eventRegistrations.id, registrationId));

            // Obnov pouze prescriptions které byly zrušeny — matched/paid necháváme
            await tx.update(eventPaymentPrescriptions)
                .set({ status: "pending", updatedAt: new Date() })
                .where(and(
                    eq(eventPaymentPrescriptions.registrationId, registrationId),
                    eq(eventPaymentPrescriptions.status, "cancelled"),
                ));

            await tx.insert(auditLog).values({
                entityType: "event_registration",
                entityId: registrationId,
                action: "restore",
                changes: { cancelledAt: { old: reg.cancelledAt.toISOString(), new: null } },
                changedBy: session.user!.email!,
            });
        });

        if (eventId) revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Nepodařilo se obnovit přihlášku" };
    }
}

// ── Příslib zálohy ────────────────────────────────────────────────────────────

export async function setDepositPromise(
    prescriptionId: number,
    promise: boolean,
    note: string,
): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };

        const db = getDb();
        const [p] = await db
            .select({
                type: eventPaymentPrescriptions.type,
                status: eventPaymentPrescriptions.status,
                eventId: eventPaymentPrescriptions.eventId,
            })
            .from(eventPaymentPrescriptions)
            .where(eq(eventPaymentPrescriptions.id, prescriptionId));

        if (!p) return { error: "Předpis nenalezen" };
        if (p.type !== "deposit") return { error: "Příslib lze nastavit jen u zálohy" };
        if (p.status === "cancelled") return { error: "Záloha je zrušena — příslib nedává smysl" };

        await db.update(eventPaymentPrescriptions)
            .set({
                depositPromise: promise,
                depositPromiseNote: promise ? (note || null) : null,
                depositPromiseBy: promise ? session.user.email : null,
                depositPromiseAt: promise ? new Date() : null,
                updatedAt: new Date(),
            })
            .where(eq(eventPaymentPrescriptions.id, prescriptionId));

        revalidatePath(`/dashboard/events/${p.eventId}`);
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Nepodařilo se nastavit příslib zálohy" };
    }
}
