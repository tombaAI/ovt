"use server";

import { getDb } from "@/lib/db";
import { eventExpenses } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
    expenseCategoryEnum,
    EXPENSE_CATEGORY_LABELS,
    type ExpenseCategory,
} from "@/lib/expense-categories";

export { expenseCategoryEnum, EXPENSE_CATEGORY_LABELS };
export type { ExpenseCategory };

export type EventExpenseRow = {
    id:              number;
    eventId:         number;
    amount:          string;
    purposeText:     string;
    purposeCategory: ExpenseCategory;
    fileUrl:         string | null;
    fileName:        string | null;
    fileMime:        string | null;
    uploadedBy:      string;
    createdAt:       Date;
};

export async function getEventExpenses(eventId: number): Promise<EventExpenseRow[]> {
    const db = getDb();
    return db
        .select()
        .from(eventExpenses)
        .where(eq(eventExpenses.eventId, eventId))
        .orderBy(asc(eventExpenses.createdAt)) as Promise<EventExpenseRow[]>;
}
