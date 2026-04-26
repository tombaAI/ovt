import { getDb } from "@/lib/db";
import {
    contributionPeriods,
    memberContributions,
    members,
    paymentAllocations,
    paymentLedger,
} from "@/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

export type PeriodTab = {
    id: number;
    year: number;
};

export type PeriodDetail = PeriodTab & {
    amountBase: number;
    amountBoat1: number;
    amountBoat2: number;
    amountBoat3: number;
    discountCommittee: number;
    discountTom: number;
    brigadeSurcharge: number;
    dueDate: string | null;
    bankAccount: string;
};

export type Payment = {
    allocationId: number;
    ledgerId: number;
    sourceType: string;
    amount: number;
    paidAt: string | null;
    note: string | null;
    confirmedBy: string | null;
};

export type ContribRow = {
    contribId: number;
    periodId: number;
    periodYear: number;
    memberId: number;
    firstName: string;
    lastName: string;
    nickname: string | null;
    email: string | null;
    variableSymbol: number | null;
    amountTotal: number | null;
    amountBase: number | null;
    amountBoat1: number | null;
    amountBoat2: number | null;
    amountBoat3: number | null;
    discountCommittee: number | null;
    discountTom: number | null;
    discountIndividual: number | null;
    discountIndividualNote: string | null;
    discountIndividualValidUntil: number | null;
    brigadeSurcharge: number | null;
    todoNote: string | null;
    reviewed: boolean;
    emailSent: boolean;
    payments: Payment[];
    paidTotal: number;
    lastPaidAt: string | null;
    status: "paid" | "overpaid" | "underpaid" | "unpaid";
};

export type MemberOption = {
    id: number;
    firstName: string;
    lastName: string;
    nickname: string | null;
};

type BaseContribRow = Omit<ContribRow, "payments" | "paidTotal" | "lastPaidAt" | "status">;

function calcStatus(paidTotal: number, amountTotal: number | null): ContribRow["status"] {
    if (paidTotal === 0 || amountTotal === null) return "unpaid";
    if (paidTotal === amountTotal) return "paid";
    if (paidTotal > amountTotal) return "overpaid";
    return "underpaid";
}

async function loadConfirmedPaymentsByContribIds(contribIds: number[]) {
    if (contribIds.length === 0) return [];

    const db = getDb();

    return db
        .select({
            allocationId: paymentAllocations.id,
            ledgerId: paymentLedger.id,
            sourceType: paymentLedger.sourceType,
            contribId: paymentAllocations.contribId,
            amount: paymentAllocations.amount,
            paidAt: paymentLedger.paidAt,
            note: paymentAllocations.note,
            confirmedBy: paymentAllocations.confirmedBy,
        })
        .from(paymentAllocations)
        .innerJoin(paymentLedger, eq(paymentAllocations.ledgerId, paymentLedger.id))
        .where(and(
            inArray(paymentAllocations.contribId, contribIds),
            eq(paymentLedger.reconciliationStatus, "confirmed"),
        ))
        .orderBy(asc(paymentLedger.paidAt));
}

function attachPayments(rows: BaseContribRow[], paymentRows: Awaited<ReturnType<typeof loadConfirmedPaymentsByContribIds>>): ContribRow[] {
    const paymentsByContrib = paymentRows.reduce((acc, payment) => {
        const bucket = acc[payment.contribId] ?? [];
        bucket.push(payment);
        acc[payment.contribId] = bucket;
        return acc;
    }, {} as Record<number, typeof paymentRows>);

    return rows.map(row => {
        const payments = paymentsByContrib[row.contribId] ?? [];
        const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        const lastPaidAt = payments.length > 0
            ? payments.reduce((latest, payment) => {
                if (!payment.paidAt) return latest;
                if (!latest) return payment.paidAt as unknown as string;
                return payment.paidAt > latest ? payment.paidAt as unknown as string : latest;
            }, null as string | null)
            : null;

        return {
            ...row,
            payments: payments.map(payment => ({
                allocationId: payment.allocationId,
                ledgerId: payment.ledgerId,
                sourceType: payment.sourceType,
                amount: Number(payment.amount),
                paidAt: payment.paidAt as unknown as string | null,
                note: payment.note,
                confirmedBy: payment.confirmedBy,
            })),
            paidTotal,
            lastPaidAt,
            status: calcStatus(paidTotal, row.amountTotal),
        };
    });
}

export async function loadContributionPeriods(): Promise<PeriodDetail[]> {
    const db = getDb();

    const periods = await db
        .select({
            id: contributionPeriods.id,
            year: contributionPeriods.year,
            amountBase: contributionPeriods.amountBase,
            amountBoat1: contributionPeriods.amountBoat1,
            amountBoat2: contributionPeriods.amountBoat2,
            amountBoat3: contributionPeriods.amountBoat3,
            discountCommittee: contributionPeriods.discountCommittee,
            discountTom: contributionPeriods.discountTom,
            brigadeSurcharge: contributionPeriods.brigadeSurcharge,
            dueDate: contributionPeriods.dueDate,
            bankAccount: contributionPeriods.bankAccount,
        })
        .from(contributionPeriods)
        .orderBy(desc(contributionPeriods.year));

    return periods.map(period => ({
        ...period,
        dueDate: period.dueDate as unknown as string | null,
    }));
}

export async function loadContributionMemberOptions(): Promise<MemberOption[]> {
    const db = getDb();

    return db
        .select({
            id: members.id,
            firstName: members.firstName,
            lastName: members.lastName,
            nickname: members.nickname,
        })
        .from(members)
        .orderBy(asc(members.lastName), asc(members.firstName));
}

export async function loadContributionRows(yearMode: number | "all"): Promise<ContribRow[]> {
    const db = getDb();

    const baseQuery = db
        .select({
            contribId: memberContributions.id,
            periodId: memberContributions.periodId,
            periodYear: contributionPeriods.year,
            memberId: memberContributions.memberId,
            firstName: members.firstName,
            lastName: members.lastName,
            nickname: members.nickname,
            email: members.email,
            variableSymbol: members.variableSymbol,
            amountTotal: memberContributions.amountTotal,
            amountBase: memberContributions.amountBase,
            amountBoat1: memberContributions.amountBoat1,
            amountBoat2: memberContributions.amountBoat2,
            amountBoat3: memberContributions.amountBoat3,
            discountCommittee: memberContributions.discountCommittee,
            discountTom: memberContributions.discountTom,
            discountIndividual: memberContributions.discountIndividual,
            discountIndividualNote: memberContributions.discountIndividualNote,
            discountIndividualValidUntil: memberContributions.discountIndividualValidUntil,
            brigadeSurcharge: memberContributions.brigadeSurcharge,
            todoNote: memberContributions.todoNote,
            reviewed: memberContributions.reviewed,
            emailSent: memberContributions.emailSent,
        })
        .from(memberContributions)
        .innerJoin(members, eq(memberContributions.memberId, members.id))
        .innerJoin(contributionPeriods, eq(memberContributions.periodId, contributionPeriods.id));

    const baseRows = yearMode === "all"
        ? await baseQuery.orderBy(desc(contributionPeriods.year), asc(members.lastName), asc(members.firstName))
        : await baseQuery
            .where(eq(contributionPeriods.year, yearMode))
            .orderBy(asc(members.lastName), asc(members.firstName));

    const paymentRows = await loadConfirmedPaymentsByContribIds(baseRows.map(row => row.contribId));
    return attachPayments(baseRows, paymentRows);
}

export async function loadContributionDetail(contribId: number): Promise<{ row: ContribRow; period: PeriodDetail } | null> {
    const db = getDb();

    const [baseRow] = await db
        .select({
            contribId: memberContributions.id,
            periodId: memberContributions.periodId,
            periodYear: contributionPeriods.year,
            memberId: memberContributions.memberId,
            firstName: members.firstName,
            lastName: members.lastName,
            nickname: members.nickname,
            email: members.email,
            variableSymbol: members.variableSymbol,
            amountTotal: memberContributions.amountTotal,
            amountBase: memberContributions.amountBase,
            amountBoat1: memberContributions.amountBoat1,
            amountBoat2: memberContributions.amountBoat2,
            amountBoat3: memberContributions.amountBoat3,
            discountCommittee: memberContributions.discountCommittee,
            discountTom: memberContributions.discountTom,
            discountIndividual: memberContributions.discountIndividual,
            discountIndividualNote: memberContributions.discountIndividualNote,
            discountIndividualValidUntil: memberContributions.discountIndividualValidUntil,
            brigadeSurcharge: memberContributions.brigadeSurcharge,
            todoNote: memberContributions.todoNote,
            reviewed: memberContributions.reviewed,
            emailSent: memberContributions.emailSent,
            amountBasePeriod: contributionPeriods.amountBase,
            amountBoat1Period: contributionPeriods.amountBoat1,
            amountBoat2Period: contributionPeriods.amountBoat2,
            amountBoat3Period: contributionPeriods.amountBoat3,
            discountCommitteePeriod: contributionPeriods.discountCommittee,
            discountTomPeriod: contributionPeriods.discountTom,
            brigadeSurchargePeriod: contributionPeriods.brigadeSurcharge,
            dueDate: contributionPeriods.dueDate,
            bankAccount: contributionPeriods.bankAccount,
        })
        .from(memberContributions)
        .innerJoin(members, eq(memberContributions.memberId, members.id))
        .innerJoin(contributionPeriods, eq(memberContributions.periodId, contributionPeriods.id))
        .where(eq(memberContributions.id, contribId));

    if (!baseRow) return null;

    const [row] = attachPayments([{
        contribId: baseRow.contribId,
        periodId: baseRow.periodId,
        periodYear: baseRow.periodYear,
        memberId: baseRow.memberId,
        firstName: baseRow.firstName,
        lastName: baseRow.lastName,
        nickname: baseRow.nickname,
        email: baseRow.email,
        variableSymbol: baseRow.variableSymbol,
        amountTotal: baseRow.amountTotal,
        amountBase: baseRow.amountBase,
        amountBoat1: baseRow.amountBoat1,
        amountBoat2: baseRow.amountBoat2,
        amountBoat3: baseRow.amountBoat3,
        discountCommittee: baseRow.discountCommittee,
        discountTom: baseRow.discountTom,
        discountIndividual: baseRow.discountIndividual,
        discountIndividualNote: baseRow.discountIndividualNote,
        discountIndividualValidUntil: baseRow.discountIndividualValidUntil,
        brigadeSurcharge: baseRow.brigadeSurcharge,
        todoNote: baseRow.todoNote,
        reviewed: baseRow.reviewed,
        emailSent: baseRow.emailSent,
    }], await loadConfirmedPaymentsByContribIds([contribId]));

    return {
        row,
        period: {
            id: baseRow.periodId,
            year: baseRow.periodYear,
            amountBase: baseRow.amountBasePeriod,
            amountBoat1: baseRow.amountBoat1Period,
            amountBoat2: baseRow.amountBoat2Period,
            amountBoat3: baseRow.amountBoat3Period,
            discountCommittee: baseRow.discountCommitteePeriod,
            discountTom: baseRow.discountTomPeriod,
            brigadeSurcharge: baseRow.brigadeSurchargePeriod,
            dueDate: baseRow.dueDate as unknown as string | null,
            bankAccount: baseRow.bankAccount,
        },
    };
}