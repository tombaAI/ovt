"use server";

import { getDb } from "@/lib/db";
import { eventExpenses, people } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import type { ExpenseCategory } from "@/lib/expense-categories";

export type { ExpenseCategory };

export type EventExpenseRow = {
    id: number;
    eventId: number;
    status: "draft" | "unconfirmed" | "final";
    amount: string | null;
    analyzedAmount: string | null;
    mismatchAcknowledgedAmount: string | null;
    mismatchAcknowledgedAnalyzedAmount: string | null;
    mismatchAcknowledgedBy: string | null;
    mismatchAcknowledgedAt: Date | null;
    purposeText: string | null;
    purposeCategory: ExpenseCategory | null;
    reimbursementPersonId: number | null;
    reimbursementMemberId: number | null;
    reimbursementPayeeName: string | null;
    reimbursementPayeeKind: "member" | "external" | null;
    reimbursementPayeeBankAccountNumber: string | null;
    reimbursementPayeeBankCode: string | null;
    fileUrl: string | null;
    fileName: string | null;
    fileMime: string | null;
    isPaid: boolean;
    invoicePayeeName: string | null;
    invoicePaymentSentAt: Date | null;
    uploadedBy: string;
    createdAt: Date;
};

export async function getEventExpenses(eventId: number): Promise<EventExpenseRow[]> {
    const db = getDb();
    const rows = await db
        .select({
            id: eventExpenses.id,
            eventId: eventExpenses.eventId,
            status: eventExpenses.status,
            amount: eventExpenses.amount,
            analyzedAmount: eventExpenses.analyzedAmount,
            mismatchAcknowledgedAmount: eventExpenses.mismatchAcknowledgedAmount,
            mismatchAcknowledgedAnalyzedAmount: eventExpenses.mismatchAcknowledgedAnalyzedAmount,
            mismatchAcknowledgedBy: eventExpenses.mismatchAcknowledgedBy,
            mismatchAcknowledgedAt: eventExpenses.mismatchAcknowledgedAt,
            purposeText: eventExpenses.purposeText,
            purposeCategory: eventExpenses.purposeCategory,
            reimbursementPersonId: eventExpenses.reimbursementPersonId,
            reimbursementMemberId: eventExpenses.reimbursementMemberId,
            reimbursementPayeeName: people.fullName,
            reimbursementPayeeMemberId: people.memberId,
            reimbursementPayeeBankAccountNumber: people.bankAccountNumber,
            reimbursementPayeeBankCode: people.bankCode,
            fileUrl: eventExpenses.fileUrl,
            fileName: eventExpenses.fileName,
            fileMime: eventExpenses.fileMime,
            isPaid: eventExpenses.isPaid,
            invoicePayeeName: eventExpenses.invoicePayeeName,
            invoicePaymentSentAt: eventExpenses.invoicePaymentSentAt,
            uploadedBy: eventExpenses.uploadedBy,
            createdAt: eventExpenses.createdAt,
        })
        .from(eventExpenses)
        .leftJoin(people, eq(eventExpenses.reimbursementPersonId, people.id))
        .where(eq(eventExpenses.eventId, eventId))
        .orderBy(asc(eventExpenses.createdAt));

    return rows.map(row => ({
        ...row,
        reimbursementPayeeKind: row.reimbursementPayeeName
            ? row.reimbursementPayeeMemberId === null ? "external" : "member"
            : null,
        isPaid: row.isPaid,
        invoicePayeeName: row.invoicePayeeName ?? null,
        invoicePaymentSentAt: row.invoicePaymentSentAt ?? null,
    })) as EventExpenseRow[];
}
