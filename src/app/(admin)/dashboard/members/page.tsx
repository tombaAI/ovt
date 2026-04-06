import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods, membershipYears } from "@/db/schema";
import { eq, asc, desc, and, inArray } from "drizzle-orm";
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
    todoNote: string | null;
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
    memberYears?: number[]; // only in all-years view
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

    const isAllYears = yearParam === "all";
    const selectedYear = isAllYears ? 0 : (Number(yearParam) || CONTRIBUTION_YEAR);
    const period = isAllYears ? null : (allPeriods.find(p => p.year === selectedYear) ?? allPeriods[0] ?? null);

    let rows: MemberWithFlags[] = [];
    let currentYearDiscounts: { committee: number; tom: number } | null = null;

    if (period) {
        const [pd] = await db
            .select({ discountCommittee: contributionPeriods.discountCommittee, discountTom: contributionPeriods.discountTom })
            .from(contributionPeriods)
            .where(eq(contributionPeriods.id, period.id));
        if (pd) currentYearDiscounts = { committee: pd.discountCommittee, tom: pd.discountTom };
    }

    const actualYear = isAllYears ? 0 : (period?.year ?? selectedYear);

    if (isAllYears) {
        // Fetch all membership_year rows to build year list per member
        const allMemberYearRows = await db
            .select({ memberId: membershipYears.memberId, year: membershipYears.year })
            .from(membershipYears)
            .orderBy(asc(membershipYears.year));

        const yearsByMember = new Map<number, number[]>();
        for (const row of allMemberYearRows) {
            const arr = yearsByMember.get(row.memberId) ?? [];
            arr.push(row.year);
            yearsByMember.set(row.memberId, arr);
        }

        if (yearsByMember.size > 0) {
            const membersResult = await db
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
                    todoNote:           members.todoNote,
                })
                .from(members)
                .where(inArray(members.id, [...yearsByMember.keys()]))
                .orderBy(asc(members.fullName));

            rows = membersResult.map(r => ({
                id:                 r.id,
                fullName:           r.fullName,
                userLogin:          r.userLogin,
                email:              r.email,
                phone:              r.phone,
                variableSymbol:     r.variableSymbol,
                cskNumber:          r.cskNumber,
                membershipReviewed: r.membershipReviewed,
                note:               r.note,
                todoNote:           r.todoNote,
                fromDate:           null,
                toDate:             null,
                isCommittee:        false,
                isTom:              false,
                discountIndividual: null,
                isPaid:             null,
                amountTotal:        null,
                hasContrib:         false,
                memberYears:        yearsByMember.get(r.id) ?? [],
            }));
        }
    } else {
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
                todoNote:           members.todoNote,
                fromDate:           membershipYears.fromDate,
                toDate:             membershipYears.toDate,
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
            todoNote:           r.todoNote,
            fromDate:           r.fromDate,
            toDate:             r.toDate,
            isCommittee:        Boolean(r.discountCommittee),
            isTom:              Boolean(r.discountTom),
            discountIndividual: r.discountIndividual,
            isPaid:             r.isPaid,
            amountTotal:        r.amountTotal,
            hasContrib:         r.contribId !== null,
        }));
    }

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
