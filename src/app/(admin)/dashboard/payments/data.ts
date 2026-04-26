import { getDb } from "@/lib/db";
import {
    bankImportTransactions,
    contributionPeriods,
    importHistory,
    importProfiles,
    memberContributions,
    members,
    paymentAllocations,
    paymentLedger,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { ReconciliationStatus } from "@/lib/actions/reconciliation";

export type PaymentAllocation = {
    id: number;
    contribId: number;
    memberId: number;
    memberName: string;
    amount: number;
    isSuggested: boolean;
    confirmedBy: string | null;
    periodYear: number | null;
};

export type PaymentRow = {
    id: number;
    sourceType: string;
    fioBankTxId: number | null;
    profileId: number | null;
    profileName: string | null;
    importRunId: number | null;
    importFilename: string | null;
    importImportedAt: string | null;
    paidAt: string;
    amount: number;
    variableSymbol: string | null;
    counterpartyName: string | null;
    counterpartyAccount: string | null;
    message: string | null;
    note: string | null;
    reconciliationStatus: ReconciliationStatus;
    createdAt: string;
    allocations: PaymentAllocation[];
};

export type MemberOption = {
    id: number;
    fullName: string;
    nickname: string | null;
    variableSymbol: number | null;
};

async function loadPaymentAllocationsByLedgerIds(ledgerIds: number[]): Promise<Array<PaymentAllocation & { ledgerId: number }>> {
    if (ledgerIds.length === 0) return [];

    const db = getDb();

    const rows = await db
        .select({
            ledgerId: paymentAllocations.ledgerId,
            id: paymentAllocations.id,
            contribId: paymentAllocations.contribId,
            memberId: paymentAllocations.memberId,
            memberName: members.fullName,
            amount: paymentAllocations.amount,
            isSuggested: paymentAllocations.isSuggested,
            confirmedBy: paymentAllocations.confirmedBy,
            periodYear: contributionPeriods.year,
        })
        .from(paymentAllocations)
        .innerJoin(members, eq(paymentAllocations.memberId, members.id))
        .innerJoin(memberContributions, eq(paymentAllocations.contribId, memberContributions.id))
        .innerJoin(contributionPeriods, eq(memberContributions.periodId, contributionPeriods.id))
        .where(inArray(paymentAllocations.ledgerId, ledgerIds))
        .orderBy(asc(contributionPeriods.year), asc(members.fullName));

    return rows.map(row => ({
        ledgerId: row.ledgerId,
        id: row.id,
        contribId: row.contribId,
        memberId: row.memberId,
        memberName: row.memberName,
        amount: Number(row.amount),
        isSuggested: row.isSuggested,
        confirmedBy: row.confirmedBy,
        periodYear: row.periodYear ?? null,
    }));
}

function attachAllocations(
    rows: Array<Omit<PaymentRow, "allocations">>,
    allocationRows: Array<PaymentAllocation & { ledgerId: number }>,
): PaymentRow[] {
    const allocationsByLedger = allocationRows.reduce((acc, allocation) => {
        const bucket = acc.get(allocation.ledgerId) ?? [];
        bucket.push({
            id: allocation.id,
            contribId: allocation.contribId,
            memberId: allocation.memberId,
            memberName: allocation.memberName,
            amount: allocation.amount,
            isSuggested: allocation.isSuggested,
            confirmedBy: allocation.confirmedBy,
            periodYear: allocation.periodYear,
        });
        acc.set(allocation.ledgerId, bucket);
        return acc;
    }, new Map<number, PaymentAllocation[]>());

    return rows.map(row => ({
        ...row,
        allocations: allocationsByLedger.get(row.id) ?? [],
    }));
}

export async function loadPaymentMemberOptions(): Promise<MemberOption[]> {
    const db = getDb();

    return db
        .select({
            id: members.id,
            fullName: members.fullName,
            nickname: members.nickname,
            variableSymbol: members.variableSymbol,
        })
        .from(members)
        .orderBy(asc(members.fullName));
}

export async function loadPaymentRows(yearMode: number | "all"): Promise<PaymentRow[]> {
    const db = getDb();
    const conditions = [];

    if (yearMode !== "all") {
        conditions.push(sql`EXTRACT(YEAR FROM ${paymentLedger.paidAt}) = ${yearMode}`);
    }

    const rows = await db
        .select({
            id: paymentLedger.id,
            sourceType: paymentLedger.sourceType,
            fioBankTxId: paymentLedger.fioBankTxId,
            profileId: bankImportTransactions.profileId,
            profileName: importProfiles.name,
            importRunId: paymentLedger.importRunId,
            importFilename: importHistory.filename,
            importImportedAt: importHistory.importedAt,
            paidAt: paymentLedger.paidAt,
            amount: paymentLedger.amount,
            variableSymbol: paymentLedger.variableSymbol,
            counterpartyName: paymentLedger.counterpartyName,
            counterpartyAccount: paymentLedger.counterpartyAccount,
            message: paymentLedger.message,
            note: paymentLedger.note,
            reconciliationStatus: paymentLedger.reconciliationStatus,
            createdAt: paymentLedger.createdAt,
        })
        .from(paymentLedger)
        .leftJoin(bankImportTransactions, eq(paymentLedger.bankImportTxId, bankImportTransactions.id))
        .leftJoin(importProfiles, eq(bankImportTransactions.profileId, importProfiles.id))
        .leftJoin(importHistory, eq(paymentLedger.importRunId, importHistory.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(paymentLedger.paidAt), desc(paymentLedger.id));

    const baseRows = rows.map(row => ({
        id: row.id,
        sourceType: row.sourceType,
        fioBankTxId: row.fioBankTxId ?? null,
        profileId: row.profileId ?? null,
        profileName: row.profileName ?? null,
        importRunId: row.importRunId ?? null,
        importFilename: row.importFilename ?? null,
        importImportedAt: row.importImportedAt ? (row.importImportedAt as unknown as Date).toISOString() : null,
        paidAt: row.paidAt as unknown as string,
        amount: Number(row.amount),
        variableSymbol: row.variableSymbol,
        counterpartyName: row.counterpartyName,
        counterpartyAccount: row.counterpartyAccount,
        message: row.message,
        note: row.note,
        reconciliationStatus: row.reconciliationStatus as ReconciliationStatus,
        createdAt: (row.createdAt as unknown as Date).toISOString(),
    }));

    const allocations = await loadPaymentAllocationsByLedgerIds(baseRows.map(row => row.id));
    return attachAllocations(baseRows, allocations);
}

export async function loadPaymentDetail(ledgerId: number): Promise<PaymentRow | null> {
    const db = getDb();

    const [row] = await db
        .select({
            id: paymentLedger.id,
            sourceType: paymentLedger.sourceType,
            fioBankTxId: paymentLedger.fioBankTxId,
            profileId: bankImportTransactions.profileId,
            profileName: importProfiles.name,
            importRunId: paymentLedger.importRunId,
            importFilename: importHistory.filename,
            importImportedAt: importHistory.importedAt,
            paidAt: paymentLedger.paidAt,
            amount: paymentLedger.amount,
            variableSymbol: paymentLedger.variableSymbol,
            counterpartyName: paymentLedger.counterpartyName,
            counterpartyAccount: paymentLedger.counterpartyAccount,
            message: paymentLedger.message,
            note: paymentLedger.note,
            reconciliationStatus: paymentLedger.reconciliationStatus,
            createdAt: paymentLedger.createdAt,
        })
        .from(paymentLedger)
        .leftJoin(bankImportTransactions, eq(paymentLedger.bankImportTxId, bankImportTransactions.id))
        .leftJoin(importProfiles, eq(bankImportTransactions.profileId, importProfiles.id))
        .leftJoin(importHistory, eq(paymentLedger.importRunId, importHistory.id))
        .where(eq(paymentLedger.id, ledgerId));

    if (!row) return null;

    const [detail] = attachAllocations([
        {
            id: row.id,
            sourceType: row.sourceType,
            fioBankTxId: row.fioBankTxId ?? null,
            profileId: row.profileId ?? null,
            profileName: row.profileName ?? null,
            importRunId: row.importRunId ?? null,
            importFilename: row.importFilename ?? null,
            importImportedAt: row.importImportedAt ? (row.importImportedAt as unknown as Date).toISOString() : null,
            paidAt: row.paidAt as unknown as string,
            amount: Number(row.amount),
            variableSymbol: row.variableSymbol,
            counterpartyName: row.counterpartyName,
            counterpartyAccount: row.counterpartyAccount,
            message: row.message,
            note: row.note,
            reconciliationStatus: row.reconciliationStatus as ReconciliationStatus,
            createdAt: (row.createdAt as unknown as Date).toISOString(),
        },
    ], await loadPaymentAllocationsByLedgerIds([ledgerId]));

    return detail ?? null;
}