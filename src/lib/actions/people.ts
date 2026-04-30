"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { members, people } from "@/db/schema";
import { getDb } from "@/lib/db";

export type PersonOption = {
    id: number;
    memberId: number | null;
    fullName: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    nickname: string | null;
    cskNumber: string | null;
    bankAccountNumber: string | null;
    bankCode: string | null;
    kind: "member" | "external";
};

function normalize(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export async function getPeopleForAutocomplete(): Promise<PersonOption[]> {
    const db = getDb();
    const rows = await db
        .select({
            id: people.id,
            memberId: people.memberId,
            firstName: people.firstName,
            lastName: people.lastName,
            fullName: people.fullName,
            email: people.email,
            phone: people.phone,
            nickname: members.nickname,
            cskNumber: members.cskNumber,
            bankAccountNumber: people.bankAccountNumber,
            bankCode: people.bankCode,
        })
        .from(people)
        .leftJoin(members, eq(people.memberId, members.id))
        .orderBy(asc(people.fullName));

    return rows.map(row => ({
        ...row,
        kind: row.memberId === null ? "external" : "member",
    }));
}

export async function createExternalPerson(input: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    bankAccountNumber?: string | null;
    bankCode?: string | null;
    note?: string | null;
}): Promise<{ success: true; person: PersonOption } | { error: string }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Nepřihlášen" };

    const fullName = normalize(input.fullName);
    if (!fullName) return { error: "Jméno osoby je povinné" };

    const db = getDb();
    const [created] = await db
        .insert(people)
        .values({
            fullName,
            email: normalize(input.email),
            phone: normalize(input.phone),
            bankAccountNumber: normalize(input.bankAccountNumber),
            bankCode: normalize(input.bankCode),
            note: normalize(input.note),
        })
        .returning({
            id: people.id,
            memberId: people.memberId,
            firstName: people.firstName,
            lastName: people.lastName,
            fullName: people.fullName,
            email: people.email,
            phone: people.phone,
            bankAccountNumber: people.bankAccountNumber,
            bankCode: people.bankCode,
        });

    if (!created) return { error: "Osobu se nepodařilo vytvořit" };

    revalidatePath("/dashboard/events");

    return {
        success: true,
        person: {
            ...created,
            nickname: null,
            cskNumber: null,
            kind: "external",
        },
    };
}
