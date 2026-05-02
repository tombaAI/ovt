import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods, importMembersTjBohemians } from "@/db/schema";
import { eq, asc, desc, and, sql } from "drizzle-orm";
import { getBrigadeMemberIdsByYear } from "@/lib/actions/brigades";
import { MembersClient } from "./members-client";
import { getSelectedYear } from "@/lib/actions/year";
import type { SyncUpdatableField } from "@/lib/sync-config";

export type PeriodTab = {
    id: number;
    year: number;
};

export type MemberWithFlags = {
    id: number;
    firstName: string;
    lastName: string;
    userLogin: string | null;
    email: string | null;
    phone: string | null;
    variableSymbol: number | null;
    cskNumber: string | null;
    nickname: string | null;
    gender: string | null;
    address: string | null;
    birthDate: string | null;
    birthNumber: string | null;
    bankAccountNumber: string | null;
    bankCode: string | null;
    note: string | null;
    todoNote: string | null;
    membershipReviewed: boolean;
    // Member date range (always present)
    memberFrom: string;
    memberTo: string | null;
    memberToNote: string | null;
    // Per-year badge: set only when the event (entry/exit) falls in selectedYear
    fromDate: string | null;
    toDate: string | null;
    // Year-specific (from member_contributions — null if no contrib record)
    isCommittee: boolean;
    isTom: boolean;
    discountIndividual: number | null;
    isPaid: boolean | null;
    amountTotal: number | null;
    hasContrib: boolean;
    hasTjDiffs: boolean;
    hasBrigade: boolean;    // má splněnou brigádu v selectedYear
};


export default async function MembersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const db = getDb();
    const [selectedYear, params] = await Promise.all([getSelectedYear(), searchParams]);

    const allPeriods = await db
        .select({ id: contributionPeriods.id, year: contributionPeriods.year })
        .from(contributionPeriods)
        .orderBy(desc(contributionPeriods.year));

    const period = allPeriods.find(p => p.year === selectedYear) ?? null;

    let currentYearDiscounts: { committee: number; tom: number } | null = null;

    if (period) {
        const [pd] = await db
            .select({ discountCommittee: contributionPeriods.discountCommittee, discountTom: contributionPeriods.discountTom })
            .from(contributionPeriods)
            .where(eq(contributionPeriods.id, period.id));
        if (pd) currentYearDiscounts = { committee: pd.discountCommittee, tom: pd.discountTom };
    }

    const actualYear = period?.year ?? selectedYear;

    // Brigády: členové, kteří splnili brigádu v roce selectedYear (ovlivní příspěvky selectedYear+1)
    // V pohledu daného roku zobrazujeme, zda člen splnil brigádu pro TENTO rok (tj. má brigádu z předchozího roku)
    const brigadeMembers = await getBrigadeMemberIdsByYear(actualYear > 0 ? actualYear - 1 : actualYear);

    // Načíst TJ import tabulku pro výpočet hasTjDiffs
    const tjAll = await db.select().from(importMembersTjBohemians);
    const tjByCsk = new Map(tjAll.filter(r => r.cskNumber).map(r => [r.cskNumber!, r]));
    const tjByName = new Map(tjAll.map(r => [
        [r.jmeno, r.prijmeni].filter(Boolean).join(" ").trim().toLowerCase(), r
    ]));

    function computeHasTjDiffs(m: {
        id: number; firstName: string; lastName: string; cskNumber: string | null;
        email: string | null; phone: string | null; address: string | null;
        birthDate: string | null; birthNumber: string | null;
        gender: string | null; nickname: string | null;
    }): boolean {
        const nameLower = `${m.firstName} ${m.lastName}`.trim().toLowerCase();
        const tj = m.cskNumber
            ? tjByCsk.get(m.cskNumber)
            : tjByName.get(nameLower);
        if (!tj) return false;
        const checks: Array<[SyncUpdatableField, unknown, unknown]> = [
            ["firstName", tj.jmeno, m.firstName],
            ["lastName", tj.prijmeni, m.lastName],
            ["email", tj.email, m.email],
            ["phone", tj.phone, m.phone],
            ["address", tj.address, m.address],
            ["birthDate", tj.birthDate, m.birthDate],
            ["birthNumber", tj.birthNumber, m.birthNumber],
            ["gender", tj.gender, m.gender],
            ["nickname", tj.nickname, m.nickname],
            ["cskNumber", tj.cskNumber, m.cskNumber],
        ];
        return checks.some(([, tjVal, mVal]) => {
            const a = tjVal === null || tjVal === undefined ? null : String(tjVal);
            const b = mVal === null || mVal === undefined ? null : String(mVal);
            return a !== b;
        });
    }
    // Všichni členové — filtrování aktivní/neaktivní probíhá klientsky
    const result = await db
        .select({
            id: members.id,
            firstName: members.firstName,
            lastName: members.lastName,
            userLogin: members.userLogin,
            email: members.email,
            phone: members.phone,
            variableSymbol: members.variableSymbol,
            cskNumber: members.cskNumber,
            nickname: members.nickname,
            gender: members.gender,
            address: members.address,
            birthDate: members.birthDate,
            birthNumber: members.birthNumber,
            bankAccountNumber: members.bankAccountNumber,
            bankCode: members.bankCode,
            note: members.note,
            todoNote: members.todoNote,
            membershipReviewed: members.membershipReviewed,
            memberFrom: members.memberFrom,
            memberTo: members.memberTo,
            memberToNote: members.memberToNote,
            isCommitteeMember: members.isCommitteeMember,
            isTomLeader: members.isTomLeader,
            discountIndividual: memberContributions.discountIndividual,
            isPaid: memberContributions.isPaid,
            amountTotal: memberContributions.amountTotal,
            contribId: memberContributions.id,
        })
        .from(members)
        .leftJoin(
            memberContributions,
            and(
                eq(memberContributions.memberId, members.id),
                period ? eq(memberContributions.periodId, period.id) : sql`false`
            )
        )
        .orderBy(asc(members.lastName), asc(members.firstName));

    const rows: MemberWithFlags[] = result.map(r => {
        const mFrom = r.memberFrom as unknown as string;
        const mTo = r.memberTo as unknown as string | null;
        const fromDate = mFrom && mFrom.startsWith(`${actualYear}`) ? mFrom : null;
        const toDate = mTo && mTo.startsWith(`${actualYear}`) ? mTo : null;
        return {
            id: r.id,
            firstName: r.firstName,
            lastName: r.lastName,
            userLogin: r.userLogin,
            email: r.email,
            phone: r.phone,
            variableSymbol: r.variableSymbol,
            cskNumber: r.cskNumber,
            nickname: r.nickname,
            gender: r.gender,
            address: r.address,
            birthDate: r.birthDate as unknown as string | null,
            birthNumber: r.birthNumber,
            bankAccountNumber: r.bankAccountNumber,
            bankCode: r.bankCode,
            note: r.note,
            todoNote: r.todoNote,
            membershipReviewed: r.membershipReviewed,
            memberFrom: mFrom,
            memberTo: mTo,
            memberToNote: r.memberToNote,
            fromDate,
            toDate,
            isCommittee: r.isCommitteeMember,
            isTom: r.isTomLeader,
            discountIndividual: r.discountIndividual,
            isPaid: r.isPaid,
            amountTotal: r.amountTotal,
            hasContrib: r.contribId !== null,
            hasBrigade: brigadeMembers.has(r.id),
            hasTjDiffs: computeHasTjDiffs({
                id: r.id, firstName: r.firstName, lastName: r.lastName, cskNumber: r.cskNumber,
                email: r.email, phone: r.phone, address: r.address,
                birthDate: r.birthDate as unknown as string | null,
                birthNumber: r.birthNumber, gender: r.gender, nickname: r.nickname,
            }),
        };
    });

    return (
        <MembersClient
            members={rows}
            selectedYear={actualYear}
            periodId={period?.id ?? null}
            currentYearDiscounts={currentYearDiscounts}
            initialFilter={(params.filter as string) ?? "all"}
            initialSort={(params.sort as string) ?? "lastName"}
            initialSortDir={(params.dir as string) ?? "asc"}
            initialQ={(params.q as string) ?? ""}
            initialStav={(params.stav as string) ?? "active"}
            initialSleva={(params.sleva as string) ?? ""}
            initialBrigada={params.brigada === "none"}
            initialCastRoku={params.cast === "1"}
        />
    );
}
