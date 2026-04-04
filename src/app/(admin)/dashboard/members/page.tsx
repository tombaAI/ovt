import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods, membershipYears } from "@/db/schema";
import { eq, asc, desc, and } from "drizzle-orm";
import { MembersClient } from "./members-client";
import { CONTRIBUTION_YEAR } from "@/lib/constants";

export type PeriodTab = {
    id: number;
    year: number;
};

export type MemberWithFlags = {
    id: number;
    fullName: string;
    userLogin: string | null;
    email: string | null;
    phone: string | null;
    variableSymbol: number | null;
    cskNumber: number | null;
    membershipReviewed: boolean;
    note: string | null;
    // Year-specific (from membership_years)
    fromDate: string | null;
    toDate: string | null;
    // Year-specific (from member_contributions — null if no contrib record)
    isCommittee: boolean;
    isTom: boolean;
    discountIndividual: number | null;
    isPaid: boolean | null;
    amountTotal: number | null;
    hasContrib: boolean;
};

export default async function MembersPage(props: {
    searchParams: Promise<{ year?: string }>;
}) {
    const { year: yearParam } = await props.searchParams;
    const db = getDb();

    const allPeriods = await db
        .select({ id: contributionPeriods.id, year: contributionPeriods.year })
        .from(contributionPeriods)
        .orderBy(desc(contributionPeriods.year));

    const selectedYear = Number(yearParam) || CONTRIBUTION_YEAR;
    const period = allPeriods.find(p => p.year === selectedYear) ?? allPeriods[0] ?? null;

    let rows: MemberWithFlags[] = [];
    let currentYearDiscounts: { committee: number; tom: number } | null = null;

    if (period) {
        const [pd] = await db
            .select({ discountCommittee: contributionPeriods.discountCommittee, discountTom: contributionPeriods.discountTom })
            .from(contributionPeriods)
            .where(eq(contributionPeriods.id, period.id));
        if (pd) currentYearDiscounts = { committee: pd.discountCommittee, tom: pd.discountTom };
    }

    const actualYear = period?.year ?? selectedYear;

    // Source of truth: membership_years — who was a member in this year
    const result = await db
        .select({
            id:                 members.id,
            fullName:           members.fullName,
            userLogin:          members.userLogin,
            email:              members.email,
            phone:              members.phone,
            variableSymbol:     members.variableSymbol,
            cskNumber:          members.cskNumber,
            membershipReviewed: members.membershipReviewed,
            note:               members.note,
            fromDate:           membershipYears.fromDate,
            toDate:             membershipYears.toDate,
            // Financial data — null when no contrib record (LEFT JOIN)
            discountCommittee:  memberContributions.discountCommittee,
            discountTom:        memberContributions.discountTom,
            discountIndividual: memberContributions.discountIndividual,
            isPaid:             memberContributions.isPaid,
            amountTotal:        memberContributions.amountTotal,
            contribId:          memberContributions.id,
        })
        .from(membershipYears)
        .innerJoin(members, eq(membershipYears.memberId, members.id))
        .leftJoin(
            memberContributions,
            and(
                eq(memberContributions.memberId, membershipYears.memberId),
                period ? eq(memberContributions.periodId, period.id) : eq(memberContributions.id, -1)
            )
        )
        .where(eq(membershipYears.year, actualYear))
        .orderBy(asc(members.fullName));

    rows = result.map(r => ({
        id:                 r.id,
        fullName:           r.fullName,
        userLogin:          r.userLogin,
        email:              r.email,
        phone:              r.phone,
        variableSymbol:     r.variableSymbol,
        cskNumber:          r.cskNumber,
        membershipReviewed: r.membershipReviewed,
        note:               r.note,
        fromDate:           r.fromDate,
        toDate:             r.toDate,
        isCommittee:        Boolean(r.discountCommittee),
        isTom:              Boolean(r.discountTom),
        discountIndividual: r.discountIndividual,
        isPaid:             r.isPaid,
        amountTotal:        r.amountTotal,
        hasContrib:         r.contribId !== null,
    }));

    return (
        <MembersClient
            members={rows}
            periods={allPeriods}
            selectedYear={actualYear}
            periodId={period?.id ?? null}
            currentYearDiscounts={currentYearDiscounts}
        />
    );
}
