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
    eventTreasurerApprovalLog,
} from "@/db/schema";
import { eq, and, or, isNull, isNotNull, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { getEmailSettings, getResendClient } from "@/lib/email";
import { buildEventSettlementEmail } from "@/lib/email-templates/event-settlement";
import { isTreasurer, isTreasurerOfOddil } from "@/lib/treasurer";
import { ODDIL_LABELS } from "@/lib/oddily-config";
import { logBlockedAttempt, BlockedError, blockedOrError } from "@/lib/audit";
import {
    activePersonKeysForRegistration,
    calcEffectiveAmount,
    calcForfeitForExpense,
    calcParticipantForfeit,
    computeCoefficientWeights,
    computeParticipantFinalAmount,
    computePerRegistrationWeights,
    computeSettlementAmount,
    computeSplitAllWeights,
    computeSubsidyAmounts,
    computeUnitPrice,
    effectiveDepositAmount,
    sumRegistrationTotal,
    sumWeights,
    type PersonKey,
    type RegistrationDeposit,
} from "@/lib/settlement-calc";
import { decideProposalAction } from "@/lib/prescription-proposal";

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
    depositWontPay: boolean;
    depositWontPayNote: string | null;
    emailSentAt: Date | null;
    /** Návrh přepočtené částky, čeká na potvrzení (mechanismus schvalování změny) — null = žádný nevyřízený návrh. */
    proposedAmount: number | null;
    proposedAt: Date | null;
};

/** Záloha nemá žádné rozhodnutí (zaplaceno/příslib/nebude platit) — blokuje generování doplatku. */
function isDepositUnresolved(dep: PrescriptionInfo | null): boolean {
    if (!dep) return false; // přihláška bez zálohy (např. admin přidaná) — nic k vyřešení
    if (dep.status === "matched" || dep.status === "paid" || dep.status === "cancelled") return false;
    return !dep.depositPromise && !dep.depositWontPay;
}

/**
 * Část zálohy téže přihlášky, která už propadla (forfeit_to_expense) a snížila effectiveAmount
 * nějakého nákladu v kroku 2 — tu samou korunu nelze započítat podruhé jako "zaplaceno" proti
 * doplatku zbylých (stále aktivních) účastníků téže přihlášky.
 */
function calcOwnForfeitedAmount(
    personsCount: number | null,
    depositAmount: number | null,
    regParticipants: { cancelledAt: Date | null; depositForfeitPolicy: DepositForfeitPolicy | null; depositRefundAmount: number | null }[],
): number {
    if (!depositAmount) return 0;
    const depositPerPerson = depositAmount / (personsCount ?? 1);
    return regParticipants
        .filter(p => p.cancelledAt !== null && p.depositForfeitPolicy === "forfeit_to_expense")
        .reduce((sum, p) => sum + calcParticipantForfeit(depositPerPerson, p.depositRefundAmount ?? 0), 0);
}

/**
 * Součet nevrácených (propadlých) částí zálohy přes odhlášené účastníky s rozhodnutou
 * politikou — na rozdíl od calcOwnForfeitedAmount (jen forfeit_to_expense, používá se
 * pro odpočet v Kroku 8) tady jde o JAKOUKOLI rozhodnutou politiku, čistě pro zobrazení
 * (e-mail s vyúčtováním, tabulka na záložce Platby) — viz 2026-06-24-vypocet-nakladu-akce.md.
 */
function registrationForfeitTotal(reg: { depositPrescription: PrescriptionInfo | null; personsCount: number; participants: SettlementParticipant[] }): number {
    if (!reg.depositPrescription) return 0;
    const depositPerPerson = reg.depositPrescription.amount / reg.personsCount;
    return reg.participants
        .filter(p => p.cancelledAt && p.depositForfeitPolicy)
        .reduce((sum, p) => sum + calcParticipantForfeit(depositPerPerson, p.depositRefundAmount ?? 0), 0);
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
    /** Doplatek (krok 8) = max(0, totalAmount − effectiveDepositForSettlement) — počítáno živě, nezávisle na tom, zda už existuje settlementPrescription. */
    settlementAmount: number;
    /**
     * Efektivní záloha použitá pro výpočet doplatku = effectiveDepositAmount minus ta část,
     * která už propadla (forfeit_to_expense) a snížila náklad v kroku 2 — jinak by se stejná
     * koruna započítala dvakrát (issue 2026-06-24, viz 2026-06-24-vypocet-nakladu-akce.md).
     */
    effectiveDepositForSettlement: number;
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

/**
 * Aktivní účastník, který u některého with_coefficients nákladu NEMÁ explicitně nastavený
 * koeficient (klíč chybí v participantCoefficients). Při výpočtu mu padne váha 0 (`?? 0`) —
 * ale tiše, takže jeho reálný náklad se rozpustí mezi ostatní, aniž si toho kdokoli všimne
 * (issue: Marie Blechová / Bivoj, akce Berounka, 2026-06-25). Proto se tyto případy hlásí
 * jako blokující stav v lockBilling/regeneratePrescriptions — admin musí koeficient doplnit
 * (0 = vědomě neplatí, 1 = platí jako ostatní). "Chybějící klíč" jde odlišit od explicitní 0.
 */
export type MissingCoefficientWarning = {
    expenseId: number;
    purposeText: string | null;
    participants: { key: string; name: string }[];
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
    /** Náklady s vlastními podíly, kde některý aktivní účastník nemá nastavený koeficient — blokuje generování předpisů. */
    missingCoefficients: MissingCoefficientWarning[];
    /** Akce už vybírá peníze (odeslaný předpis nebo přijatá platba) — odemknout/upravovat smí jen hospodář. */
    isCollecting: boolean;
};

// ── Výpočet vyúčtování ────────────────────────────────────────────────────────
//
// Postup přesně dle zadani/2026-06-24-vypocet-nakladu-akce.md — samotné výpočetní
// kroky žijí jako čisté (unit testované) funkce v src/lib/settlement-calc.ts,
// tady se jen načítají data z DB a adaptují na jejich vstupy. Počítá se s plnou
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
                depositWontPay: eventPaymentPrescriptions.depositWontPay,
                depositWontPayNote: eventPaymentPrescriptions.depositWontPayNote,
                emailSentAt: eventPaymentPrescriptions.emailSentAt,
                proposedAmount: eventPaymentPrescriptions.proposedAmount,
                proposedAt: eventPaymentPrescriptions.proposedAt,
            })
            .from(eventPaymentPrescriptions)
            .where(inArray(eventPaymentPrescriptions.registrationId, regIds))
        : [];

    // ── Krok 1: klíče aktivních účastníků (per přihláška a globálně) ──────────
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
    const cancelledForfeitingParticipants = participants
        .filter(p => p.cancelledAt !== null)
        .map(p => ({
            registrationId: p.registrationId,
            depositForfeitPolicy: p.depositForfeitPolicy as DepositForfeitPolicy | null,
            depositForfeitExpenseId: p.depositForfeitExpenseId,
            depositRefundAmount: parseFloat(p.depositRefundAmount ?? "0") || 0,
        }));
    const depositByRegistration = new Map<number, RegistrationDeposit>();
    for (const reg of regs) {
        const dep = prescriptions.find(pr => pr.registrationId === reg.id && pr.type === "deposit");
        if (dep) depositByRegistration.set(reg.id, { amount: parseFloat(dep.amount), personsCount: reg.personsCount ?? 1 });
    }

    const finalExpenseRows: FinalExpenseRow[] = finalExpenses.map(e => {
        const totalForfeit = calcForfeitForExpense(e.id, cancelledForfeitingParticipants, depositByRegistration);
        return {
            id: e.id,
            purposeText: e.purposeText,
            amount: e.amount,
            effectiveAmount: calcEffectiveAmount(e.amount, totalForfeit),
            totalForfeit,
            allocationMethod: e.allocationMethod,
            participantCoefficients: e.participantCoefficients,
        };
    });

    // ── Krok 1 (váhy) + krok 3 (cena za jednotku váhy) — per náklad, plná přesnost ──
    const weightsByExpense = new Map<number, Map<string, number>>(); // expenseId -> personKey -> weight
    const unitPriceByExpense = new Map<number, number>();

    for (const expense of finalExpenseRows) {
        let weights: Map<string, number>;

        if (expense.allocationMethod === "split_all") {
            weights = computeSplitAllWeights(allPersonKeys);
        } else if (expense.allocationMethod === "with_coefficients") {
            weights = computeCoefficientWeights(allPersonKeys, expense.participantCoefficients);
        } else {
            const allocationsByRegistration = new Map<number, number>();
            for (const a of manualAllocations) {
                if (a.expenseId === expense.id) allocationsByRegistration.set(a.registrationId, parseFloat(a.amount));
            }
            weights = computePerRegistrationWeights(personKeysByReg, allocationsByRegistration);
        }

        weightsByExpense.set(expense.id, weights);
        unitPriceByExpense.set(expense.id, computeUnitPrice(expense.effectiveAmount, sumWeights(allPersonKeys, weights)));
    }

    // unitPrice — souhrnné informativní pole, jen pro "split_all" náklady. Plná přesnost (krok 3).
    const splitAllSum = finalExpenseRows
        .filter(e => e.allocationMethod === "split_all")
        .reduce((s, e) => s + e.effectiveAmount, 0);
    const unitPrice = totalParticipants > 0 ? splitAllSum / totalParticipants : 0;

    // ── Krok 4–7: náklad na účastníka přes všechny náklady, dotace, JEDINÉ zaokrouhlení NAHORU ──
    // Krok 6: dotace per člen — water-filling redistribuce (computeSubsidyAmounts)

    // Nejdřív spočítáme náklady všech účastníků
    type ParticipantCalc = {
        key: string;
        registrationId: number;
        memberId: number | null;
        totalCost: number;
        subsidyAmount: number;
        finalAmount: number;
        perExpense: Map<number, number>; // expenseId -> plná přesnost příspěvek (rozpis pro UI/e-mail)
    };

    const participantTotalCosts: Array<{
        key: string;
        registrationId: number;
        memberId: number | null;
        totalCost: number;
        perExpense: Map<number, number>;
    }> = allPersonKeys.map(k => {
        const perExpense = new Map<number, number>();
        let totalCost = 0;
        for (const expense of finalExpenseRows) {
            const weight = weightsByExpense.get(expense.id)?.get(k.key) ?? 0;
            const cost = (unitPriceByExpense.get(expense.id) ?? 0) * weight;
            perExpense.set(expense.id, cost);
            totalCost += cost;
        }
        return { key: k.key, registrationId: k.registrationId, memberId: k.memberId, totalCost, perExpense };
    });

    // Pak vyberme členy a jejich náklady pro water-filling
    const membersWithCosts = participantTotalCosts
        .filter(p => p.memberId !== null)
        .map(p => ({ key: p.key, totalCost: p.totalCost }));

    // Spočítáme dotace water-filling algoritmem
    const subsidyMap = computeSubsidyAmounts(subsidyTotal, membersWithCosts);

    // Nakonec sestavíme finální výpočty s dotacemi a zaokrouhlením
    const participantCalcs: ParticipantCalc[] = participantTotalCosts.map(p => {
        const subsidyAmount = subsidyMap.get(p.key) ?? 0;
        const finalAmount = computeParticipantFinalAmount(p.totalCost, subsidyAmount);
        return { key: p.key, registrationId: p.registrationId, memberId: p.memberId, totalCost: p.totalCost, subsidyAmount, finalAmount, perExpense: p.perExpense };
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
        const totalAmount = sumRegistrationTotal(calcs.map(c => c.finalAmount));

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
                depositWontPay: p.depositWontPay,
                depositWontPayNote: p.depositWontPayNote,
                emailSentAt: p.emailSentAt,
                proposedAmount: p.proposedAmount ? parseFloat(p.proposedAmount) : null,
                proposedAt: p.proposedAt,
            } : null;

        const depositPrescription = toPrescriptionInfo(depositRaw);

        const ownForfeitedAmount = calcOwnForfeitedAmount(
            reg.personsCount,
            depositRaw ? parseFloat(depositRaw.amount) : null,
            regParticipants,
        );
        const effectiveDepositForSettlement = Math.max(0, effectiveDepositAmount(depositPrescription) - ownForfeitedAmount);

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
            settlementAmount: computeSettlementAmount(totalAmount, effectiveDepositForSettlement),
            effectiveDepositForSettlement,
            depositPrescription,
            settlementPrescription: toPrescriptionInfo(settlementRaw),
        };
    });

    const grandTotal = registrationRows.reduce((s, r) => s + r.totalAmount, 0);

    // Jméno per personKey — stejná indexace jako activePersonKeysForRegistration (kvůli r{regId}-{i} fallbacku).
    const nameByKey = new Map<string, string>();
    for (const reg of regs) {
        participants
            .filter(p => p.registrationId === reg.id)
            .forEach((p, i) => {
                if (!p.cancelledAt) nameByKey.set(p.id > 0 ? `p${p.id}` : `r${reg.id}-${i}`, p.fullName);
            });
    }

    // Aktivní účastníci bez explicitního koeficientu u with_coefficients nákladu (klíč chybí → tichá váha 0).
    // participantCoefficients === null řešit nemusíme — tam výpočet padá na rovnoměrné váhy 1, ne na tiché 0.
    const missingCoefficients: MissingCoefficientWarning[] = finalExpenseRows
        .filter(e => e.allocationMethod === "with_coefficients" && e.participantCoefficients)
        .map(e => ({
            expenseId: e.id,
            purposeText: e.purposeText,
            participants: allPersonKeys
                .filter(k => !Object.prototype.hasOwnProperty.call(e.participantCoefficients!, k.key))
                .map(k => ({ key: k.key, name: nameByKey.get(k.key) ?? k.key })),
        }))
        .filter(w => w.participants.length > 0);

    const isCollecting = prescriptions.some(p => p.emailSentAt !== null || p.status === "matched" || p.status === "paid");

    return { eventId, subsidyTotal, unitPrice, totalParticipants, totalMemberParticipants, finalExpenses: finalExpenseRows, registrations: registrationRows, grandTotal, expensesSum, missingCoefficients, isCollecting };
}

// ── Billing status helpers ────────────────────────────────────────────────────

type EventLocks = {
    billingStatus: "draft" | "prescribed";
    lockForParticipants: boolean;
    lockForReimbursement: boolean;
};

/**
 * "Akce už vybírá peníze" — alespoň jeden předpis byl odeslán (emailSentAt) NEBO je
 * spárovaný/zaplacený (matched/paid). V tomto stavu smí odemknout/upravovat jen hospodář
 * (TREASURER_EMAIL), protože změna by zasáhla do už vybíraných prostředků.
 */
async function isEventCollecting(db: ReturnType<typeof getDb>, eventId: number): Promise<boolean> {
    const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(eventPaymentPrescriptions)
        .where(and(
            eq(eventPaymentPrescriptions.eventId, eventId),
            or(
                isNotNull(eventPaymentPrescriptions.emailSentAt),
                inArray(eventPaymentPrescriptions.status, ["matched", "paid"]),
            ),
        ));
    return (row?.n ?? 0) > 0;
}

// logBlockedAttempt / BlockedError / BlockedAttempt / blockedOrError přesunuty do src/lib/audit.ts
// (poprvé je potřebují i API routy pro náklady, ne jen server actions). Importováno nahoře.

/** Gate před generováním předpisů (nevyřešená záloha / nenastavený koeficient) — vrací chybu + zaloguje blokaci. */
async function prescriptionGateError(
    db: ReturnType<typeof getDb>,
    eventId: number,
    settlement: Awaited<ReturnType<typeof getEventSettlement>>,
    attemptedAction: string,
    changedBy: string,
): Promise<string | null> {
    const unresolved = findUnresolvedDeposits(settlement);
    if (unresolved.length > 0) {
        const reason = `Nevyřešená záloha u: ${unresolved.join(", ")}. Nejdřív v záložce Platby u každé označte příslib nebo "nebude platit".`;
        await logBlockedAttempt(db, { attemptedAction, reason, changedBy, eventId });
        return reason;
    }
    const coefError = missingCoefficientsError(settlement);
    if (coefError) {
        await logBlockedAttempt(db, { attemptedAction, reason: coefError, changedBy, eventId });
        return coefError;
    }
    return null;
}

/**
 * Jednotná brána pro úpravy přihlášek/účastníků akce. Vrací chybovou hlášku, nebo null když smí.
 * Dva prahy:
 *  - lockForParticipants (náklady uzamčeny) → blokováno pro všechny, napřed odemknout vyúčtování.
 *  - akce už vybírá peníze (isEventCollecting) → smí jen hospodář; běžný admin dostane stopku
 *    s informací, že to zvládne hospodář. Pokrývá i akci ve stavu draft, která už ale vybírá
 *    (např. spárované zálohy) — tam zámek lockForParticipants nestačí.
 */
async function registrationEditBlock(
    db: ReturnType<typeof getDb>,
    eventId: number,
    userEmail: string | null | undefined,
    attempt: { action: string; registrationId?: number; participantId?: number; memberId?: number | null },
): Promise<string | null> {
    let reason: string | null = null;
    if ((await getEventLocks(db, eventId))?.lockForParticipants) {
        reason = "Náklady jsou uzamčeny — pro úpravu nejdřív odemkněte vyúčtování (záložka Platby). Pokud už akce vybírá platby, odemkne ji jen hospodář.";
    } else if (await isEventCollecting(db, eventId) && !isTreasurer(userEmail)) {
        reason = "Akce už vybírá peníze (odeslané předpisy nebo přijaté platby) — úpravu přihlášek může provést jen hospodář.";
    }
    if (reason) {
        await logBlockedAttempt(db, {
            attemptedAction: attempt.action, reason, changedBy: userEmail ?? "unknown",
            eventId, registrationId: attempt.registrationId, participantId: attempt.participantId, memberId: attempt.memberId,
        });
    }
    return reason;
}

async function getEventLocks(db: ReturnType<typeof getDb>, eventId: number): Promise<EventLocks | null> {
    const [row] = await db
        .select({ billingStatus: events.billingStatus, lockForParticipants: events.lockForParticipants, lockForReimbursement: events.lockForReimbursement })
        .from(events)
        .where(eq(events.id, eventId));
    if (!row) return null;
    return { billingStatus: row.billingStatus as "draft" | "prescribed", lockForParticipants: row.lockForParticipants, lockForReimbursement: row.lockForReimbursement };
}

/** Uzamkne billing: vygeneruje předpisy a přepne stav na 'prescribed'. */
/**
 * Seznam aktivních přihlášek, jejichž záloha nemá žádné rozhodnutí (zaplaceno/příslib/nebude
 * platit) — generování doplatku je blokované, dokud admin každou z nich nevyřeší (záložka Platby).
 */
function findUnresolvedDeposits(settlement: Awaited<ReturnType<typeof getEventSettlement>>): string[] {
    return settlement.registrations
        .filter(reg => isDepositUnresolved(reg.depositPrescription))
        .map(reg => `${reg.firstName} ${reg.lastName}`);
}

/**
 * Chybová hláška pro gate „nenastavený koeficient" — vrací null, když je vše doplněno.
 * Brání generování předpisů, dokud má některý aktivní účastník u with_coefficients nákladu
 * chybějící koeficient (tichá váha 0). Analogicky k findUnresolvedDeposits.
 */
function missingCoefficientsError(settlement: Awaited<ReturnType<typeof getEventSettlement>>): string | null {
    if (settlement.missingCoefficients.length === 0) return null;
    const detail = settlement.missingCoefficients
        .map(m => `${m.purposeText ?? "náklad"} (${m.participants.map(p => p.name).join(", ")})`)
        .join("; ");
    return `Nenastavený koeficient u nákladů s vlastními podíly — ${detail}. U každého doplňte podíl v záložce Vyúčtování (0 = neplatí, 1 = platí jako ostatní).`;
}

export async function lockBilling(eventId: number): Promise<{ success: true; proposed: number } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [event] = await db
            .select({ name: events.name, eventType: events.eventType, treasurerApproved: events.treasurerApproved, oddil: events.oddil })
            .from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };

        const isProvozni = event.eventType === "provozni";
        if (isProvozni && !isTreasurerOfOddil(session.user.email, event.oddil)) {
            const reason = `Provozní výdaj oddílu ${ODDIL_LABELS[event.oddil]} může uzamknout jen jeho hospodář.`;
            await logBlockedAttempt(db, { attemptedAction: "lock_billing", reason, changedBy: session.user.email, eventId });
            return { error: reason };
        }

        const settlement = await getEventSettlement(eventId);
        const gateError = await prescriptionGateError(db, eventId, settlement, "lock_billing", session.user.email);
        if (gateError) return { error: gateError };
        const result = await upsertPrescriptionAmounts(eventId, settlement, event.name, db);

        await db.update(events)
            .set({ billingStatus: "prescribed", lockForParticipants: true, updatedAt: new Date() })
            .where(eq(events.id, eventId));

        await db.insert(auditLog).values({
            entityType: "event",
            entityId: eventId,
            action: "lock_billing",
            changes: {
                billingStatus: { old: "draft", new: "prescribed" },
                ...(result.proposed > 0 ? { proposed: { old: null, new: String(result.proposed) } } : {}),
            },
            metadata: { eventId },
            changedBy: session.user.email,
        });

        // Provozní výdaj: zamyká sám hospodář — samostatný krok souhlasu odpadá,
        // souhlas se uděluje automaticky při zamčení (spec 2026-08-05-provozni-vydaje.md).
        if (isProvozni && !event.treasurerApproved) {
            await db.transaction(async tx => {
                await tx.update(events).set({ treasurerApproved: true }).where(eq(events.id, eventId));
                await tx.insert(eventTreasurerApprovalLog).values({
                    eventId,
                    action: "approved",
                    changedBy: session.user!.name?.trim() || session.user!.email!,
                });
                await tx.insert(auditLog).values({
                    entityType: "event",
                    entityId: eventId,
                    action: "treasurer_approve",
                    changes: { treasurerApproved: { old: "false", new: "true" } },
                    metadata: { eventId, auto: "provozni_lock" },
                    changedBy: session.user!.email!,
                });
            });
        }

        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true, proposed: result.proposed };
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
export async function unlockBilling(
    eventId: number,
    opts?: { confirmed?: boolean },
): Promise<{ success: true; deletedPrescriptions: number } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };

        const db = getDb();
        const [ev] = await db.select({ eventType: events.eventType, oddil: events.oddil }).from(events).where(eq(events.id, eventId));
        if (!ev) return { error: "Akce nenalezena" };
        const isProvozni = ev.eventType === "provozni";
        if (isProvozni && !isTreasurerOfOddil(session.user.email, ev.oddil)) {
            const reason = `Provozní výdaj oddílu ${ODDIL_LABELS[ev.oddil]} může odemknout jen jeho hospodář.`;
            await logBlockedAttempt(db, { attemptedAction: "unlock_billing", reason, changedBy: session.user.email, eventId });
            return { error: reason };
        }

        const collecting = await isEventCollecting(db, eventId);

        // Když už akce vybírá peníze, odemčení je citlivý zásah: smí ho udělat jen hospodář,
        // s výslovným potvrzením, a odemčení zruší jeho souhlas (musí znovu schválit). Audit níže.
        if (collecting) {
            const treasurerEmail = process.env.TREASURER_EMAIL?.trim().toLowerCase();
            if (!treasurerEmail || session.user.email.toLowerCase() !== treasurerEmail) {
                const reason = "Akce už vybírá peníze (odeslané předpisy nebo přijaté platby) — odemknout může jen hospodář.";
                await logBlockedAttempt(db, { attemptedAction: "unlock_billing", reason, changedBy: session.user.email, eventId });
                return { error: reason };
            }
            if (!opts?.confirmed) {
                return { error: "Odemčení vyžaduje potvrzení — tato akce už vybírá peníze a změna ovlivní vystavené předpisy." };
            }
        }

        await db.transaction(async tx => {
            await tx.update(events)
                .set({
                    billingStatus: "draft",
                    lockForParticipants: false,
                    // Po odemčení akce, která vybírá, padá souhlas hospodáře — po úpravách musí znovu schválit.
                    // U provozního výdaje padá souhlas při každém odemčení (odpadá samostatný krok schválení).
                    ...(collecting || isProvozni ? { treasurerApproved: false } : {}),
                    updatedAt: new Date(),
                })
                .where(eq(events.id, eventId));

            await tx.insert(auditLog).values({
                entityType: "event",
                entityId: eventId,
                action: "unlock_billing",
                changes: (collecting || isProvozni)
                    ? {
                        billingStatus: { old: "prescribed", new: "draft" },
                        ...(collecting ? { collecting: { old: "true", new: "true" } } : {}),
                        treasurerApproved: { old: "true", new: "false" },
                      }
                    : { billingStatus: { old: "prescribed", new: "draft" } },
                metadata: { eventId },
                changedBy: session.user!.email!,
            });

            if (isProvozni) {
                await tx.insert(eventTreasurerApprovalLog).values({
                    eventId,
                    action: "revoked",
                    changedBy: session.user!.name?.trim() || session.user!.email!,
                });
            }
        });

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
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [ev] = await db.select({ id: events.id, lockForReimbursement: events.lockForReimbursement }).from(events).where(eq(events.id, eventId));
        if (!ev) return { error: "Akce nenalezena" };
        await db.update(events)
            .set({ lockForReimbursement: true, updatedAt: new Date() })
            .where(eq(events.id, eventId));
        await db.insert(auditLog).values({
            entityType: "event",
            entityId: eventId,
            action: "lock_reimbursement",
            changes: { lockForReimbursement: { old: String(ev.lockForReimbursement), new: "true" } },
            metadata: { eventId },
            changedBy: session.user.email,
        });
        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch {
        return { error: "Chyba při uzamčení dokladů" };
    }
}

/** Odemkne doklady pro proplacení. */
export async function unlockForReimbursement(eventId: number): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [ev] = await db.select({ lockForReimbursement: events.lockForReimbursement }).from(events).where(eq(events.id, eventId));
        await db.update(events)
            .set({ lockForReimbursement: false, updatedAt: new Date() })
            .where(eq(events.id, eventId));
        await db.insert(auditLog).values({
            entityType: "event",
            entityId: eventId,
            action: "unlock_reimbursement",
            changes: { lockForReimbursement: { old: String(ev?.lockForReimbursement ?? true), new: "false" } },
            metadata: { eventId },
            changedBy: session.user.email,
        });
        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch {
        return { error: "Chyba při odemčení dokladů" };
    }
}

// ── Dotace akce ───────────────────────────────────────────────────────────────

export async function updateEventSubsidy(eventId: number, subsidyPerMember: number | null): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        if ((await getEventLocks(db, eventId))?.lockForParticipants) {
            const reason = "Vyúčtování je uzamčeno — nejdřív odemkněte";
            await logBlockedAttempt(db, { attemptedAction: "update_subsidy", reason, changedBy: session.user.email, eventId });
            return { error: reason };
        }
        const [prev] = await db.select({ subsidyPerMember: events.subsidyPerMember }).from(events).where(eq(events.id, eventId));
        const newVal = subsidyPerMember !== null ? String(subsidyPerMember) : null;
        await db.update(events)
            .set({ subsidyPerMember: newVal, updatedAt: new Date() })
            .where(eq(events.id, eventId));
        await db.insert(auditLog).values({
            entityType: "event",
            entityId: eventId,
            action: "update_subsidy",
            changes: { subsidyPerMember: { old: prev?.subsidyPerMember ?? null, new: newVal } },
            metadata: { eventId },
            changedBy: session.user.email,
        });
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
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [exp] = await db.select({ eventId: eventExpenses.eventId, allocationMethod: eventExpenses.allocationMethod, purposeText: eventExpenses.purposeText }).from(eventExpenses).where(eq(eventExpenses.id, expenseId));
        if (!exp) return { error: "Náklad nenalezen" };
        if ((await getEventLocks(db, exp.eventId))?.lockForParticipants) {
            const reason = "Vyúčtování je uzamčeno — nejdřív odemkněte";
            await logBlockedAttempt(db, { attemptedAction: "update_expense_allocation_method", reason, changedBy: session.user.email, eventId: exp.eventId, expenseId });
            return { error: reason };
        }

        // participantCoefficients záměrně nezahazujeme — zachováme je pro obnovu při přepnutí zpět
        await db.update(eventExpenses)
            .set({ allocationMethod: method })
            .where(eq(eventExpenses.id, expenseId));

        // Přepnutí na split_all maže ruční alokace — před smazáním je zachytíme do snapshotu (rekonstrukce).
        let deletedAllocations: { registrationId: number; amount: string }[] = [];
        if (method === "split_all") {
            deletedAllocations = await db
                .select({ registrationId: eventExpenseAllocations.registrationId, amount: eventExpenseAllocations.amount })
                .from(eventExpenseAllocations)
                .where(eq(eventExpenseAllocations.expenseId, expenseId));
            await db.delete(eventExpenseAllocations).where(eq(eventExpenseAllocations.expenseId, expenseId));
        }

        await db.insert(auditLog).values({
            entityType: "event_expense",
            entityId: expenseId,
            action: "update_expense_allocation_method",
            changes: { allocationMethod: { old: exp.allocationMethod, new: method } },
            metadata: { eventId: exp.eventId, expenseId, purposeText: exp.purposeText, ...(deletedAllocations.length > 0 ? { deletedAllocations } : {}) },
            changedBy: session.user.email,
        });

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
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();

        const [exp] = await db.select({ amount: eventExpenses.amount, eventId: eventExpenses.eventId, purposeText: eventExpenses.purposeText }).from(eventExpenses).where(eq(eventExpenses.id, expenseId));
        if (!exp?.amount) return { error: "Náklad nenalezen nebo nemá částku" };
        if ((await getEventLocks(db, exp.eventId))?.lockForParticipants) {
            const reason = "Vyúčtování je uzamčeno — nejdřív odemkněte";
            await logBlockedAttempt(db, { attemptedAction: "set_expense_registration_allocations", reason, changedBy: session.user.email, eventId: exp.eventId, expenseId });
            return { error: reason };
        }

        // Ověření, že součet sedí k částce nákladu

        const expenseAmount = parseFloat(exp.amount);
        const allocSum = allocations.reduce((s, a) => s + a.amount, 0);
        // Povolíme mírný přebytek (Math.ceil na přihlášku může dát o pár Kč víc)
        if (allocSum < expenseAmount - 0.01) {
            return { error: `Součet alokací (${allocSum} Kč) je menší než náklad (${expenseAmount} Kč)` };
        }

        // Starý stav pro diff (per registrationId).
        const before = await db
            .select({ registrationId: eventExpenseAllocations.registrationId, amount: eventExpenseAllocations.amount })
            .from(eventExpenseAllocations)
            .where(eq(eventExpenseAllocations.expenseId, expenseId));
        const oldByReg = new Map(before.map(a => [a.registrationId, a.amount]));
        const newByReg = new Map(allocations.map(a => [a.registrationId, String(a.amount)]));

        await db.transaction(async tx => {
            await tx.delete(eventExpenseAllocations).where(eq(eventExpenseAllocations.expenseId, expenseId));
            if (allocations.length > 0) {
                await tx.insert(eventExpenseAllocations).values(
                    allocations.map(a => ({ expenseId, registrationId: a.registrationId, amount: String(a.amount) }))
                );
            }
        });

        // Diff jen změněných přihlášek + plný snapshot po uložení (rekonstrukce).
        const changes: Record<string, { old: string | null; new: string | null }> = {};
        for (const regId of new Set([...oldByReg.keys(), ...newByReg.keys()])) {
            const oldA = oldByReg.get(regId) ?? null;
            const newA = newByReg.get(regId) ?? null;
            if (oldA !== newA) changes[`reg${regId}`] = { old: oldA, new: newA };
        }
        await db.insert(auditLog).values({
            entityType: "event_expense",
            entityId: expenseId,
            action: "set_expense_registration_allocations",
            changes,
            metadata: { eventId: exp.eventId, expenseId, purposeText: exp.purposeText, allocationsAfter: allocations.map(a => ({ registrationId: a.registrationId, amount: String(a.amount) })) },
            changedBy: session.user.email,
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
 * přímo a počítá s plnou přesností (krok 1+3 v 2026-06-24-vypocet-nakladu-akce.md). Staré
 * alokace (např. z dřívějšího per_registration) se smažou, aby nezůstaly jako mrtvá data.
 */
export async function setExpenseParticipantCoefficients(
    expenseId: number,
    coefficients: Record<string, number>,
): Promise<{ success: true } | { error: string }> {
    try {
        const db = getDb();

        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };

        const [exp] = await db
            .select({ amount: eventExpenses.amount, eventId: eventExpenses.eventId, purposeText: eventExpenses.purposeText, participantCoefficients: eventExpenses.participantCoefficients })
            .from(eventExpenses)
            .where(eq(eventExpenses.id, expenseId));
        if (!exp?.amount) return { error: "Náklad nenalezen nebo nemá částku" };
        if ((await getEventLocks(db, exp.eventId))?.lockForParticipants) {
            const reason = "Vyúčtování je uzamčeno — nejdřív odemkněte";
            await logBlockedAttempt(db, { attemptedAction: "set_expense_coefficients", reason, changedBy: session.user.email, eventId: exp.eventId, expenseId });
            return { error: reason };
        }

        await db.transaction(async tx => {
            await tx.update(eventExpenses)
                .set({ allocationMethod: "with_coefficients", participantCoefficients: coefficients })
                .where(eq(eventExpenses.id, expenseId));
            await tx.delete(eventExpenseAllocations).where(eq(eventExpenseAllocations.expenseId, expenseId));
        });

        // Diff jen změněných klíčů + plná mapa koeficientů po uložení (rekonstrukce).
        const oldCoeffs = (exp.participantCoefficients as Record<string, number> | null) ?? {};
        const changes: Record<string, { old: string | null; new: string | null }> = {};
        for (const key of new Set([...Object.keys(oldCoeffs), ...Object.keys(coefficients)])) {
            const oldV = key in oldCoeffs ? String(oldCoeffs[key]) : null;
            const newV = key in coefficients ? String(coefficients[key]) : null;
            if (oldV !== newV) changes[key] = { old: oldV, new: newV };
        }
        await db.insert(auditLog).values({
            entityType: "event_expense",
            entityId: expenseId,
            action: "set_expense_coefficients",
            changes,
            metadata: { eventId: exp.eventId, expenseId, purposeText: exp.purposeText, coefficientsAfter: coefficients },
            changedBy: session.user.email,
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
): Promise<{ error: string } | { created: number; updated: number; proposed: number }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
        if (!event) return { error: "Akce nenalezena" };
        const settlement = await getEventSettlement(eventId);
        const gateError = await prescriptionGateError(db, eventId, settlement, "regenerate_prescriptions", session.user.email);
        if (gateError) return { error: gateError };
        const result = await upsertPrescriptionAmounts(eventId, settlement, event.name, db);
        await db.insert(auditLog).values({
            entityType: "event",
            entityId: eventId,
            action: "regenerate_prescriptions",
            changes: {
                created: { old: null, new: String(result.created) },
                updated: { old: null, new: String(result.updated) },
                proposed: { old: null, new: String(result.proposed) },
            },
            metadata: { eventId },
            changedBy: session.user.email,
        });
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
 *
 * Jednou vygenerovaná částka se nikdy nepřepíše potichu (viz
 * docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md) — o tom,
 * co přesně se stane, rozhoduje decideProposalAction. Platí i pro matched/paid
 * předpisy: rozdíl se ukáže jako návrh, `amount` (co bylo skutečně zaplaceno/dohodnuto)
 * se nezmění, dokud ho admin výslovně nepotvrdí.
 */
async function upsertPrescriptionAmounts(
    eventId: number,
    settlement: Awaited<ReturnType<typeof getEventSettlement>>,
    eventName: string,
    db: ReturnType<typeof getDb>,
): Promise<{ created: number; updated: number; proposed: number }> {
    const paymentDue = new Date();
    paymentDue.setDate(paymentDue.getDate() + 7);
    const paymentDueStr = paymentDue.toISOString().slice(0, 10);
    let created = 0, updated = 0, proposed = 0;

    await db.transaction(async tx => {
        for (const reg of settlement.registrations) {
            const newAmount = Math.max(0, reg.totalAmount - reg.effectiveDepositForSettlement);

            if (!reg.settlementPrescription) {
                await createSettlementPrescription(tx, eventId, reg.registrationId, reg.firstName, reg.lastName, eventName);
                // Při prvním vytvoření nastavíme správnou částku a splatnost — nikdy návrh,
                // amount = 0 před tímto zápisem znamená "nic nebylo vygenerováno", není co chránit.
                await tx.update(eventPaymentPrescriptions)
                    .set({ amount: String(newAmount), paymentDue: paymentDueStr })
                    .where(and(
                        eq(eventPaymentPrescriptions.registrationId, reg.registrationId),
                        eq(eventPaymentPrescriptions.type, "settlement"),
                    ));
                created++;
                continue;
            }

            const decision = decideProposalAction(
                reg.settlementPrescription.amount,
                newAmount,
                reg.settlementPrescription.proposedAmount !== null,
            );

            switch (decision.kind) {
                case "write_amount":
                    await tx.update(eventPaymentPrescriptions)
                        .set({ amount: String(decision.amount), paymentDue: paymentDueStr, updatedAt: new Date() })
                        .where(eq(eventPaymentPrescriptions.id, reg.settlementPrescription.id));
                    updated++;
                    break;
                case "clear_proposal":
                    await tx.update(eventPaymentPrescriptions)
                        .set({ proposedAmount: null, proposedAt: null })
                        .where(eq(eventPaymentPrescriptions.id, reg.settlementPrescription.id));
                    break;
                case "set_proposal":
                    await tx.update(eventPaymentPrescriptions)
                        .set({ proposedAmount: String(decision.proposedAmount), proposedAt: new Date() })
                        .where(eq(eventPaymentPrescriptions.id, reg.settlementPrescription.id));
                    proposed++;
                    break;
                case "no_op":
                    break;
            }
        }
    });
    return { created, updated, proposed };
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
        { const block = await registrationEditBlock(db, eventId, session.user.email, { action: "create_registration" }); if (block) return { error: block }; }

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

            await tx.insert(auditLog).values({
                entityType: "event_registration",
                entityId: reg.id,
                action: "create",
                changes: { created: { old: null, new: `${input.firstName} ${input.lastName} (${input.participants.length} os.)` } },
                metadata: { eventId, registrationId: reg.id },
                changedBy: session.user!.email!,
            });

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
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [reg] = await db
            .select({
                eventId: eventRegistrations.eventId,
                email: eventRegistrations.email,
                phone: eventRegistrations.phone,
                firstName: eventRegistrations.firstName,
                lastName: eventRegistrations.lastName,
                note: eventRegistrations.note,
            })
            .from(eventRegistrations).where(eq(eventRegistrations.id, registrationId));
        if (!reg) return { error: "Přihláška nenalezena" };
        { const block = await registrationEditBlock(db, reg.eventId, session.user.email, { action: "update_registration", registrationId }); if (block) return { error: block }; }
        await db.update(eventRegistrations).set(input).where(eq(eventRegistrations.id, registrationId));

        // Audit jen reálně změněných polí (old → new).
        const fields: (keyof typeof input)[] = ["email", "phone", "firstName", "lastName", "note"];
        const changes: Record<string, { old: string | null; new: string | null }> = {};
        for (const f of fields) {
            if (f in input) {
                const oldVal = (reg as Record<string, unknown>)[f] as string | null ?? null;
                const newVal = (input[f] ?? null) as string | null;
                if (oldVal !== newVal) changes[f] = { old: oldVal, new: newVal };
            }
        }
        if (Object.keys(changes).length > 0) {
            await db.insert(auditLog).values({
                entityType: "event_registration",
                entityId: registrationId,
                action: "update",
                changes,
                metadata: { eventId: reg.eventId, registrationId },
                changedBy: session.user.email,
            });
        }
        revalidatePath(`/dashboard/events/${reg.eventId}`);
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
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [pRow] = await db
            .select({ registrationId: eventRegistrationParticipants.registrationId, oldName: eventRegistrationParticipants.fullName })
            .from(eventRegistrationParticipants)
            .where(eq(eventRegistrationParticipants.id, participantId));
        if (!pRow) return { error: "Účastník nenalezen" };
        const [regRow] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, pRow.registrationId));
        if (regRow) { const block = await registrationEditBlock(db, regRow.eventId, session.user.email, { action: "rename_participant", registrationId: pRow.registrationId, participantId }); if (block) return { error: block }; }
        await db.update(eventRegistrationParticipants)
            .set({ fullName: fullName.trim() })
            .where(eq(eventRegistrationParticipants.id, participantId));
        if (pRow.oldName !== fullName.trim()) {
            await db.insert(auditLog).values({
                entityType: "event_registration",
                entityId: pRow.registrationId,
                action: "rename_participant",
                changes: { fullName: { old: pRow.oldName, new: fullName.trim() } },
                metadata: { eventId: regRow?.eventId, registrationId: pRow.registrationId, participantId },
                changedBy: session.user.email,
            });
        }
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
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();
        const [pRow] = await db
            .select({ registrationId: eventRegistrationParticipants.registrationId, oldMemberId: eventRegistrationParticipants.memberId })
            .from(eventRegistrationParticipants)
            .where(eq(eventRegistrationParticipants.id, participantId));
        if (pRow) {
            const [regRow] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, pRow.registrationId));
            if (regRow) { const block = await registrationEditBlock(db, regRow.eventId, session.user.email, { action: "link_member", registrationId: pRow.registrationId, participantId, memberId }); if (block) return { error: block }; }
        }
        await db.update(eventRegistrationParticipants)
            .set({ memberId, personId: null })
            .where(eq(eventRegistrationParticipants.id, participantId));

        // Propojení člena mění dotaci (počítá se jen členům) → auditujeme jako settlement-affecting změnu.
        if (pRow && pRow.oldMemberId !== memberId) {
            await db.insert(auditLog).values({
                entityType: "event_registration",
                entityId: pRow.registrationId,
                action: "link_member",
                changes: { memberId: { old: pRow.oldMemberId != null ? String(pRow.oldMemberId) : null, new: memberId != null ? String(memberId) : null } },
                metadata: { registrationId: pRow.registrationId, participantId, memberId, previousMemberId: pRow.oldMemberId },
                changedBy: session.user.email,
            });
        }

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
        // cost = finalAmount + subsidyAmount (gross cena před dotací, odvozená ze zaokrouhleného finalAmount) —
        // ne raw totalCost, aby Cena/os. − Dotace v mailu vždy přesně dalo finalAmount (žádný zbytkový Kč navíc/míň).
        participants: [
            ...reg.participants.filter(pt => !pt.cancelledAt).map(pt => ({ fullName: pt.fullName, isMember: pt.memberId !== null, cost: pt.finalAmount + pt.subsidyAmount })),
            // Odhlášení účastníci s nevrácenou (propadlou) zálohou — čistě informativní řádek,
            // bez rozpisu/vysvětlení (na rozdíl od tabulky na záložce Platby). Na výpočet doplatku
            // ani na celkový finanční výsledek akce to nemá žádný vliv — forfeitTotal se proto
            // přidává i k zobrazené záloze níž (Cena/os. i Záloha z přihlášky se vykrátí stejně).
            ...reg.participants.filter(pt => pt.cancelledAt && pt.depositForfeitPolicy && reg.depositPrescription).map(pt => {
                const depositPerPerson = reg.depositPrescription!.amount / reg.personsCount;
                const forfeitAmount = Math.max(0, depositPerPerson - (pt.depositRefundAmount ?? 0));
                return forfeitAmount > 0 ? { fullName: pt.fullName, isMember: pt.memberId !== null, cost: forfeitAmount } : null;
            }).filter((row): row is { fullName: string; isMember: boolean; cost: number } => row !== null),
        ],
        memberCount: reg.memberCount,
        subsidy: reg.subsidy,
        depositAmount: reg.effectiveDepositForSettlement + registrationForfeitTotal(reg),
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

        // Nevyřízený návrh přepočtu = platná částka (`amount`) v hlavičce e-mailu i v QR kódu
        // by nesouhlasila s rozpisem ceny/dotace/zálohy, který se do e-mailu počítá živě.
        // Radši nerozeslat nic a nechat admina návrhy nejdřív potvrdit (viz decideProposalAction).
        const withProposal = freshSettlement.registrations.filter(r =>
            r.settlementPrescription?.proposedAmount != null && r.settlementPrescription.status !== "cancelled");
        if (withProposal.length > 0) {
            return { error: `Nelze rozeslat e-maily — ${withProposal.length} ${withProposal.length === 1 ? "přihláška má" : "přihlášek má"} nevyřízený návrh přepočtu částky. Nejdřív návrhy potvrďte (Potvrdit vše).` };
        }

        const resend = getResendClient();
        let sent = 0;
        let skipped = 0;
        const failed: { name: string; email: string; error: string }[] = [];
        const sentPrescriptionIds: number[] = [];
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
                else { sent++; sentPrescriptionIds.push(p.id); }
            } catch (e) {
                failed.push({ name: fullName, email: to, error: e instanceof Error ? e.message : "Neznámá chyba" });
            }
            await new Promise(r => setTimeout(r, 250));
        }

        if (sentPrescriptionIds.length > 0) {
            await db.update(eventPaymentPrescriptions)
                .set({ emailSentAt: new Date() })
                .where(inArray(eventPaymentPrescriptions.id, sentPrescriptionIds));
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

        // Paralelní zápis do jednotného auditu (vedle specifické eventSettlementEmailSends tabulky).
        await db.insert(auditLog).values({
            entityType: "event",
            entityId: eventId,
            action: "send_settlement_emails",
            changes: {},
            metadata: { eventId, sent, skipped, failed: failed.length },
            changedBy: senderEmail,
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
        // Viz sendEventSettlementEmails — s nevyřízeným návrhem by hlavička e-mailu (platná
        // částka) neseděla s živě počítaným rozpisem ani s QR kódem.
        if (regRow.settlementPrescription.proposedAmount !== null) {
            return { error: "Nelze odeslat e-mail — přihláška má nevyřízený návrh přepočtu částky, nejdřív ho potvrďte." };
        }

        const to = emailSettings.testTo ?? regRow.email;
        const senderName = session.user.name ?? undefined;
        const senderEmail = session.user.email;
        const { subject, html } = buildSettlementEmailPayload(regRow, event.name, opts?.message, senderName, senderEmail);

        const result = await getResendClient().emails.send({ from: emailSettings.from, to, replyTo: emailSettings.replyTo, subject, html });
        if (result.error) return { error: result.error.message };

        await db.update(eventPaymentPrescriptions)
            .set({ emailSentAt: new Date() })
            .where(eq(eventPaymentPrescriptions.id, regRow.settlementPrescription.id));

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

        // Paralelní zápis do jednotného auditu — e-mail jedné konkrétní přihlášce → scope event_registration.
        await db.insert(auditLog).values({
            entityType: "event_registration",
            entityId: registrationId,
            action: "send_settlement_email_single",
            changes: {},
            metadata: { eventId: reg.eventId, registrationId, prescriptionId: regRow.settlementPrescription.id },
            changedBy: senderEmail,
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
        { const block = await registrationEditBlock(db, regRow.eventId, session.user.email, { action: "add_participant", registrationId }); if (block) return { error: block }; }

        let eventId: number | null = null;

        await db.transaction(async tx => {
            const [{ nextOrder }] = await tx
                .select({ nextOrder: sql<number>`COALESCE(MAX(${eventRegistrationParticipants.participantOrder}), 0) + 1` })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.registrationId, registrationId));

            const [newParticipant] = await tx.insert(eventRegistrationParticipants).values({
                registrationId,
                eventId: regRow.eventId,
                participantOrder: nextOrder,
                fullName: participant.fullName.trim(),
                isPrimary: false,
                memberId: participant.memberId ?? null,
            }).returning({ id: eventRegistrationParticipants.id });

            await tx.update(eventRegistrations)
                .set({ personsCount: sql`${eventRegistrations.personsCount} + 1` })
                .where(eq(eventRegistrations.id, registrationId));

            await tx.insert(auditLog).values({
                entityType: "event_registration",
                entityId: registrationId,
                action: "add_participant",
                changes: { participant: { old: null, new: participant.fullName.trim() } },
                metadata: { eventId: regRow.eventId, registrationId, participantId: newParticipant.id, memberId: participant.memberId ?? null },
                changedBy: session.user!.email!,
            });

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
        if (regRow) { const block = await registrationEditBlock(db, regRow.eventId, session.user.email, { action: "remove_participant", registrationId: pRow.registrationId, participantId }); if (block) return { error: block }; }

        let eventId: number | null = null;

        await db.transaction(async tx => {
            const [p] = await tx
                .select({ registrationId: eventRegistrationParticipants.registrationId, fullName: eventRegistrationParticipants.fullName, memberId: eventRegistrationParticipants.memberId })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.id, participantId));

            if (!p) throw new Error("Účastník nenalezen");

            const [{ cnt }] = await tx
                .select({ cnt: sql<number>`COUNT(*)::int` })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.registrationId, p.registrationId));

            if (cnt <= 1) throw new BlockedError("Přihláška musí mít alespoň jednoho účastníka. Pro zrušení přihlášky použijte tlačítko Zrušit přihlášku.", { attemptedAction: "remove_participant", eventId: regRow?.eventId, registrationId: p.registrationId, participantId, memberId: p.memberId });

            await tx.delete(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.id, participantId));

            await tx.update(eventRegistrations)
                .set({ personsCount: sql`GREATEST(1, ${eventRegistrations.personsCount} - 1)` })
                .where(eq(eventRegistrations.id, p.registrationId));

            await tx.insert(auditLog).values({
                entityType: "event_registration",
                entityId: p.registrationId,
                action: "remove_participant",
                changes: { participant: { old: p.fullName, new: null } },
                metadata: { eventId: regRow?.eventId, registrationId: p.registrationId, participantId, memberId: p.memberId },
                changedBy: session.user!.email!,
            });

            const [reg] = await tx.select({ eventId: eventRegistrations.eventId })
                .from(eventRegistrations)
                .where(eq(eventRegistrations.id, p.registrationId));
            eventId = reg?.eventId ?? null;
        });

        if (eventId) revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch (e) {
        return await blockedOrError(e, getDb(), (await auth())?.user?.email ?? "unknown", "Nepodařilo se odebrat účastníka");
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

        // Zámek: odhlášení účastníka mění aktivní podíly → mění vyúčtování. Po uzamčení nákladů
        // (lockForParticipants) je proto blokované úplně stejně jako přidání/odebrání — jinak by
        // tahle cesta tiše přepočítala a přepsala už vystavené (i zaplacené) předpisy.
        const [pre] = await db
            .select({ eventId: eventRegistrations.eventId, registrationId: eventRegistrationParticipants.registrationId })
            .from(eventRegistrationParticipants)
            .innerJoin(eventRegistrations, eq(eventRegistrations.id, eventRegistrationParticipants.registrationId))
            .where(eq(eventRegistrationParticipants.id, participantId));
        if (pre) { const block = await registrationEditBlock(db, pre.eventId, session.user.email, { action: "cancel_participant", registrationId: pre.registrationId, participantId }); if (block) return { error: block }; }

        await db.transaction(async tx => {
            const [participant] = await tx
                .select({
                    id: eventRegistrationParticipants.id,
                    registrationId: eventRegistrationParticipants.registrationId,
                    fullName: eventRegistrationParticipants.fullName,
                    memberId: eventRegistrationParticipants.memberId,
                    cancelledAt: eventRegistrationParticipants.cancelledAt,
                })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.id, participantId));

            if (!participant) throw new Error("Účastník nenalezen");
            if (participant.cancelledAt) throw new BlockedError("Účastník je již odhlášen", { attemptedAction: "cancel_participant", registrationId: participant.registrationId, participantId: participant.id, memberId: participant.memberId });

            const [reg] = await tx
                .select({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, cancelledAt: eventRegistrations.cancelledAt, personsCount: eventRegistrations.personsCount })
                .from(eventRegistrations)
                .where(eq(eventRegistrations.id, participant.registrationId));

            if (!reg) throw new Error("Přihláška nenalezena");
            if (reg.cancelledAt) throw new BlockedError("Přihláška je již zrušena", { attemptedAction: "cancel_participant", eventId: reg.eventId, registrationId: participant.registrationId, participantId: participant.id, memberId: participant.memberId });

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
                    metadata: { eventId: reg.eventId, registrationId: participant.registrationId },
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
                metadata: { eventId: reg.eventId, registrationId: participant.registrationId, participantId: participant.id, memberId: participant.memberId },
                changedBy: session.user!.email!,
            });
        });

        if (eventId) {
            // with_coefficients váhy se počítají vždy živě z aktivních účastníků (getEventSettlement),
            // odhlášený účastník se tedy automaticky vyřadí — žádný přepočet alokací není potřeba.

            // Pokud je billing uzamčen, projedeme i settlement předpisy — odhlášení účastníka mění
            // doplatek. Platná částka se ale nepřepíše potichu: upsertPrescriptionAmounts u už
            // vygenerovaného předpisu jen založí návrh přepočtu (proposedAmount), který admin
            // potvrdí na záložce Platby. Do té doby všude platí původní částka.
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
        return await blockedOrError(e, getDb(), (await auth())?.user?.email ?? "unknown", "Nepodařilo se odhlásit účastníka");
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

        // Zámek — stejně jako u cancelParticipant: obnovení účastníka mění vyúčtování, po uzamčení blokováno.
        const [pre] = await db
            .select({ eventId: eventRegistrations.eventId, registrationId: eventRegistrationParticipants.registrationId })
            .from(eventRegistrationParticipants)
            .innerJoin(eventRegistrations, eq(eventRegistrations.id, eventRegistrationParticipants.registrationId))
            .where(eq(eventRegistrationParticipants.id, participantId));
        if (pre) { const block = await registrationEditBlock(db, pre.eventId, session.user.email, { action: "restore_participant", registrationId: pre.registrationId, participantId }); if (block) return { error: block }; }

        await db.transaction(async tx => {
            const [participant] = await tx
                .select({
                    id: eventRegistrationParticipants.id,
                    registrationId: eventRegistrationParticipants.registrationId,
                    fullName: eventRegistrationParticipants.fullName,
                    memberId: eventRegistrationParticipants.memberId,
                    cancelledAt: eventRegistrationParticipants.cancelledAt,
                })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.id, participantId));

            if (!participant) throw new Error("Účastník nenalezen");
            if (!participant.cancelledAt) throw new BlockedError("Účastník není odhlášen", { attemptedAction: "restore_participant", registrationId: participant.registrationId, participantId: participant.id, memberId: participant.memberId });

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
                    metadata: { eventId: reg.eventId, registrationId: participant.registrationId },
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
                metadata: { eventId: reg.eventId, registrationId: participant.registrationId, participantId: participant.id, memberId: participant.memberId },
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
        return await blockedOrError(e, getDb(), (await auth())?.user?.email ?? "unknown", "Nepodařilo se obnovit účastníka");
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

        {
            const [pre] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, registrationId));
            if (pre) { const block = await registrationEditBlock(db, pre.eventId, session.user.email, { action: "cancel_registration", registrationId }); if (block) return { error: block }; }
        }

        await db.transaction(async tx => {
            const [reg] = await tx
                .select({ eventId: eventRegistrations.eventId, cancelledAt: eventRegistrations.cancelledAt })
                .from(eventRegistrations)
                .where(eq(eventRegistrations.id, registrationId));

            if (!reg) throw new Error("Přihláška nenalezena");
            if (reg.cancelledAt) throw new BlockedError("Přihláška je již zrušena", { attemptedAction: "cancel_registration", eventId: reg.eventId, registrationId });

            const [paidPrescription] = await tx
                .select({ id: eventPaymentPrescriptions.id })
                .from(eventPaymentPrescriptions)
                .where(and(
                    eq(eventPaymentPrescriptions.registrationId, registrationId),
                    inArray(eventPaymentPrescriptions.status, ["matched", "paid"]),
                ))
                .limit(1);
            if (paidPrescription) throw new BlockedError("Nelze zrušit přihlášku — záloha byla přijata. Pro ruční storno kontaktuj pokladníka.", { attemptedAction: "cancel_registration", eventId: reg.eventId, registrationId });

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
                metadata: { eventId: reg.eventId, registrationId },
                changedBy: session.user!.email!,
            });
        });

        if (eventId) revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch (e) {
        return await blockedOrError(e, getDb(), (await auth())?.user?.email ?? "unknown", "Nepodařilo se zrušit přihlášku");
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

        {
            const [pre] = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.id, registrationId));
            if (pre) { const block = await registrationEditBlock(db, pre.eventId, session.user.email, { action: "restore_registration", registrationId }); if (block) return { error: block }; }
        }

        await db.transaction(async tx => {
            const [reg] = await tx
                .select({ eventId: eventRegistrations.eventId, cancelledAt: eventRegistrations.cancelledAt })
                .from(eventRegistrations)
                .where(eq(eventRegistrations.id, registrationId));

            if (!reg) throw new Error("Přihláška nenalezena");
            if (!reg.cancelledAt) throw new BlockedError("Přihláška není zrušena", { attemptedAction: "restore_registration", eventId: reg.eventId, registrationId });

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
                metadata: { eventId: reg.eventId, registrationId },
                changedBy: session.user!.email!,
            });
        });

        if (eventId) revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true };
    } catch (e) {
        return await blockedOrError(e, getDb(), (await auth())?.user?.email ?? "unknown", "Nepodařilo se obnovit přihlášku");
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
                registrationId: eventPaymentPrescriptions.registrationId,
                depositPromise: eventPaymentPrescriptions.depositPromise,
                depositPromiseNote: eventPaymentPrescriptions.depositPromiseNote,
            })
            .from(eventPaymentPrescriptions)
            .where(eq(eventPaymentPrescriptions.id, prescriptionId));

        if (!p) return { error: "Předpis nenalezen" };
        if (p.type !== "deposit") return { error: "Příslib lze nastavit jen u zálohy" };
        if (p.status === "cancelled") return { error: "Záloha je zrušena — příslib nedává smysl" };
        if ((await getEventLocks(db, p.eventId))?.lockForParticipants) {
            const reason = "Předpisy jsou uzamčené — nejdřív odemkněte vyúčtování (záložka Platby).";
            await logBlockedAttempt(db, { attemptedAction: "set_deposit_promise", reason, changedBy: session.user.email, eventId: p.eventId, registrationId: p.registrationId });
            return { error: reason };
        }

        const newNote = promise ? (note || null) : null;
        await db.update(eventPaymentPrescriptions)
            .set({
                depositPromise: promise,
                depositPromiseNote: newNote,
                depositPromiseBy: promise ? session.user.email : null,
                depositPromiseAt: promise ? new Date() : null,
                // Příslib a "nebude platit" se vylučují — nastavení příslibu zruší případné "nebude platit".
                ...(promise ? { depositWontPay: false, depositWontPayNote: null, depositWontPayBy: null, depositWontPayAt: null } : {}),
                updatedAt: new Date(),
            })
            .where(eq(eventPaymentPrescriptions.id, prescriptionId));

        await db.insert(auditLog).values({
            entityType: "event_registration",
            entityId: p.registrationId,
            action: "set_deposit_promise",
            changes: {
                value: { old: String(p.depositPromise), new: String(promise) },
                note: { old: p.depositPromiseNote ?? null, new: newNote },
            },
            metadata: { eventId: p.eventId, registrationId: p.registrationId, prescriptionId },
            changedBy: session.user.email,
        });

        revalidatePath(`/dashboard/events/${p.eventId}`);
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Nepodařilo se nastavit příslib zálohy" };
    }
}

/** Explicitní rozhodnutí "záloha se nebude vybírat" — celá částka jde do doplatku. */
export async function setDepositWontPay(
    prescriptionId: number,
    wontPay: boolean,
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
                registrationId: eventPaymentPrescriptions.registrationId,
                depositWontPay: eventPaymentPrescriptions.depositWontPay,
                depositWontPayNote: eventPaymentPrescriptions.depositWontPayNote,
            })
            .from(eventPaymentPrescriptions)
            .where(eq(eventPaymentPrescriptions.id, prescriptionId));

        if (!p) return { error: "Předpis nenalezen" };
        if (p.type !== "deposit") return { error: "\"Nebude platit\" lze nastavit jen u zálohy" };
        if (p.status === "cancelled") return { error: "Záloha je zrušena — rozhodnutí nedává smysl" };
        if ((await getEventLocks(db, p.eventId))?.lockForParticipants) {
            const reason = "Předpisy jsou uzamčené — nejdřív odemkněte vyúčtování (záložka Platby).";
            await logBlockedAttempt(db, { attemptedAction: "set_deposit_wont_pay", reason, changedBy: session.user.email, eventId: p.eventId, registrationId: p.registrationId });
            return { error: reason };
        }

        const newNote = wontPay ? (note || null) : null;
        await db.update(eventPaymentPrescriptions)
            .set({
                depositWontPay: wontPay,
                depositWontPayNote: newNote,
                depositWontPayBy: wontPay ? session.user.email : null,
                depositWontPayAt: wontPay ? new Date() : null,
                // Vzájemné vyloučení s příslibem.
                ...(wontPay ? { depositPromise: false, depositPromiseNote: null, depositPromiseBy: null, depositPromiseAt: null } : {}),
                updatedAt: new Date(),
            })
            .where(eq(eventPaymentPrescriptions.id, prescriptionId));

        await db.insert(auditLog).values({
            entityType: "event_registration",
            entityId: p.registrationId,
            action: "set_deposit_wont_pay",
            changes: {
                value: { old: String(p.depositWontPay), new: String(wontPay) },
                note: { old: p.depositWontPayNote ?? null, new: newNote },
            },
            metadata: { eventId: p.eventId, registrationId: p.registrationId, prescriptionId },
            changedBy: session.user.email,
        });

        revalidatePath(`/dashboard/events/${p.eventId}`);
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Nepodařilo se nastavit rozhodnutí o záloze" };
    }
}

/**
 * Potvrdí návrh přepočtené částky jedné přihlášky — `amount = proposedAmount`, vyčistí
 * proposedAmount/proposedAt. Viz docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md.
 */
export async function confirmProposedAmount(prescriptionId: number): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const db = getDb();

        const [p] = await db
            .select({
                type: eventPaymentPrescriptions.type,
                eventId: eventPaymentPrescriptions.eventId,
                registrationId: eventPaymentPrescriptions.registrationId,
                amount: eventPaymentPrescriptions.amount,
                proposedAmount: eventPaymentPrescriptions.proposedAmount,
            })
            .from(eventPaymentPrescriptions)
            .where(eq(eventPaymentPrescriptions.id, prescriptionId));

        if (!p) return { error: "Předpis nenalezen" };
        if (p.type !== "settlement") return { error: "Návrh lze potvrdit jen u doplatku" };
        if (p.proposedAmount === null) return { error: "Žádný návrh k potvrzení" };

        await db.update(eventPaymentPrescriptions)
            .set({ amount: p.proposedAmount, proposedAmount: null, proposedAt: null, updatedAt: new Date() })
            .where(eq(eventPaymentPrescriptions.id, prescriptionId));

        await db.insert(auditLog).values({
            entityType: "event_registration",
            entityId: p.registrationId,
            action: "confirm_proposed_amount",
            changes: { amount: { old: p.amount, new: p.proposedAmount } },
            metadata: { eventId: p.eventId, registrationId: p.registrationId, prescriptionId },
            changedBy: session.user.email,
        });

        revalidatePath(`/dashboard/events/${p.eventId}`);
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: "Nepodařilo se potvrdit návrh" };
    }
}

/**
 * Hromadně potvrdí návrhy přepočtu — bez `prescriptionIds` všechny nevyřízené návrhy
 * akce, s `prescriptionIds` jen vybranou podmnožinu (scénář "část lidí už zaplatila,
 * u nich změnu nechci, zbytek přepočítám").
 */
export async function confirmProposedAmounts(
    eventId: number,
    prescriptionIds?: number[],
): Promise<{ success: true; confirmed: number } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.email) return { error: "Nepřihlášen" };
        const changedBy = session.user.email;
        const db = getDb();

        const rows = await db
            .select({
                id: eventPaymentPrescriptions.id,
                registrationId: eventPaymentPrescriptions.registrationId,
                amount: eventPaymentPrescriptions.amount,
                proposedAmount: eventPaymentPrescriptions.proposedAmount,
            })
            .from(eventPaymentPrescriptions)
            .where(and(
                eq(eventPaymentPrescriptions.eventId, eventId),
                eq(eventPaymentPrescriptions.type, "settlement"),
                isNotNull(eventPaymentPrescriptions.proposedAmount),
                ...(prescriptionIds ? [inArray(eventPaymentPrescriptions.id, prescriptionIds)] : []),
            ));

        if (rows.length === 0) return { success: true, confirmed: 0 };

        await db.transaction(async tx => {
            for (const p of rows) {
                await tx.update(eventPaymentPrescriptions)
                    .set({ amount: p.proposedAmount!, proposedAmount: null, proposedAt: null, updatedAt: new Date() })
                    .where(eq(eventPaymentPrescriptions.id, p.id));

                await tx.insert(auditLog).values({
                    entityType: "event_registration",
                    entityId: p.registrationId,
                    action: "confirm_proposed_amount",
                    changes: { amount: { old: p.amount, new: p.proposedAmount } },
                    metadata: { eventId, registrationId: p.registrationId, prescriptionId: p.id },
                    changedBy,
                });
            }
        });

        revalidatePath(`/dashboard/events/${eventId}`);
        return { success: true, confirmed: rows.length };
    } catch (e) {
        console.error(e);
        return { error: "Nepodařilo se potvrdit návrhy" };
    }
}
