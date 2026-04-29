"use server";

import { getDb } from "@/lib/db";
import { eventExpenses } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import type { ExpenseCategory } from "@/db/schema";

export type { ExpenseCategory };

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
    doprava:            "Doprava",
    jidlo:              "Jídlo",
    ubytovani:          "Ubytování",
    pronajem:           "Pronájem",
    kancelarske:        "Kancelářské potřeby a ostatní materiál",
    sportovni_material: "Spotřeba sportovního materiálu",
    postovni:           "Poštovní služby",
    startovne:          "Startovné a registrace",
    priprava:           "Náklady na přípravu",
    sluzby_mezinarodni: "Služby – mezinárodní činnost",
    odmeny_rozhodcim:   "Odměny rozhodčím",
    ostatni:            "Ostatní",
};

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
