import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
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
    isActive: boolean;
    note: string | null;
    // Year-specific
    isCommittee: boolean;
    isTom: boolean;
    discountIndividual: number | null;
    isPaid: boolean | null;
    amountTotal: number | null;
    joinedAt: string | null;
    leftAt: string | null;
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

        const contributions = await db
            .select({
                id:                 members.id,
                fullName:           members.fullName,
                userLogin:          members.userLogin,
                email:              members.email,
                phone:              members.phone,
                variableSymbol:     members.variableSymbol,
                cskNumber:          members.cskNumber,
                isActive:           members.isActive,
                note:               members.note,
                discountCommittee:  memberContributions.discountCommittee,
                discountTom:        memberContributions.discountTom,
                discountIndividual: memberContributions.discountIndividual,
                isPaid:             memberContributions.isPaid,
                amountTotal:        memberContributions.amountTotal,
                joinedAt:           memberContributions.joinedAt,
                leftAt:             memberContributions.leftAt,
            })
            .from(memberContributions)
            .innerJoin(members, eq(memberContributions.memberId, members.id))
            .where(eq(memberContributions.periodId, period.id))
            .orderBy(asc(members.fullName));

        rows = contributions.map(c => ({
            ...c,
            isCommittee: Boolean(c.discountCommittee),
            isTom:       Boolean(c.discountTom),
            hasContrib:  true,
        }));
    }

    return (
        <MembersClient
            members={rows}
            periods={allPeriods}
            selectedYear={period?.year ?? CONTRIBUTION_YEAR}
            periodId={period?.id ?? null}
            currentYearDiscounts={currentYearDiscounts}
        />
    );
}
