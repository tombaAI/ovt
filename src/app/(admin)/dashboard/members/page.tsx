import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { MembersClient } from "./members-client";
import { CONTRIBUTION_YEAR } from "@/lib/constants";

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
    // 2026 contribution data
    isCommittee: boolean;
    isTom: boolean;
    discountIndividual: number | null;
    isPaid2026: boolean | null;
    amountTotal2026: number | null;
    hasContrib2026: boolean;
};

export default async function MembersPage() {
    const db = getDb();

    // Load current period
    const [period] = await db.select()
        .from(contributionPeriods)
        .where(eq(contributionPeriods.year, CONTRIBUTION_YEAR));

    // Fetch all members
    const allMembers = await db.select().from(members).orderBy(asc(members.fullName));

    // Fetch 2026 contributions
    const contributions = period
        ? await db.select().from(memberContributions).where(eq(memberContributions.periodId, period.id))
        : [];

    const contribMap = new Map(contributions.map(c => [c.memberId, c]));

    const rows: MemberWithFlags[] = allMembers.map(m => {
        const c = contribMap.get(m.id) ?? null;
        return {
            id:               m.id,
            fullName:         m.fullName,
            userLogin:        m.userLogin,
            email:            m.email,
            phone:            m.phone,
            variableSymbol:   m.variableSymbol,
            cskNumber:        m.cskNumber,
            isActive:         m.isActive,
            note:             m.note,
            isCommittee:      Boolean(c?.discountCommittee),
            isTom:            Boolean(c?.discountTom),
            discountIndividual: c?.discountIndividual ?? null,
            isPaid2026:       c?.isPaid ?? null,
            amountTotal2026:  c?.amountTotal ?? null,
            hasContrib2026:   Boolean(c),
        };
    });

    const currentYearDiscounts = period
        ? { committee: period.discountCommittee, tom: period.discountTom }
        : null;

    const active   = rows.filter(m => m.isActive).length;
    const inactive = rows.length - active;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Členové</h1>
                <p className="text-gray-500 mt-1 text-sm">
                    {active} aktivních · {inactive} neaktivních · {rows.length} celkem
                </p>
            </div>

            <MembersClient
                members={rows}
                periodId={period?.id ?? null}
                currentYearDiscounts={currentYearDiscounts}
            />
        </div>
    );
}
