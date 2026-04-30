"use server";

import { getDb } from "@/lib/db";
import { eventExpenses, members } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import type { ExpenseCategory } from "@/lib/expense-categories";

export type { ExpenseCategory };

export type EventExpenseRow = {
    id:              number;
    eventId:         number;
    amount:          string;
    purposeText:     string;
    purposeCategory: ExpenseCategory;
    reimbursementMemberId: number | null;
    reimbursementMemberName: string | null;
    reimbursementMemberBankAccountNumber: string | null;
    reimbursementMemberBankCode: string | null;
    fileUrl:         string | null;
    fileName:        string | null;
    fileMime:        string | null;
    uploadedBy:      string;
    createdAt:       Date;
};

export async function getEventExpenses(eventId: number): Promise<EventExpenseRow[]> {
    const db = getDb();
    const rows = await db
        .select({
            id: eventExpenses.id,
            eventId: eventExpenses.eventId,
            amount: eventExpenses.amount,
            purposeText: eventExpenses.purposeText,
            purposeCategory: eventExpenses.purposeCategory,
            reimbursementMemberId: eventExpenses.reimbursementMemberId,
            reimbursementMemberName: members.fullName,
            reimbursementMemberBankAccountNumber: members.bankAccountNumber,
            reimbursementMemberBankCode: members.bankCode,
            fileUrl: eventExpenses.fileUrl,
            fileName: eventExpenses.fileName,
            fileMime: eventExpenses.fileMime,
            uploadedBy: eventExpenses.uploadedBy,
            createdAt: eventExpenses.createdAt,
        })
        .from(eventExpenses)
        .leftJoin(members, eq(eventExpenses.reimbursementMemberId, members.id))
        .where(eq(eventExpenses.eventId, eventId))
        .orderBy(asc(eventExpenses.createdAt));

    return rows as EventExpenseRow[];
}
