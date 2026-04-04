import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { CONTRIBUTION_YEAR } from "@/lib/constants";
import { ContributionsClient } from "./contributions-client";

export type PeriodStatus = "draft" | "confirmed" | "collecting" | "closed";

export type PeriodTab = {
    id: number;
    year: number;
    status: PeriodStatus;
};

export type PeriodDetail = PeriodTab & {
    amountBase: number;
    amountBoat1: number;
    amountBoat2: number;
    amountBoat3: number;
    discountCommittee: number;
    discountTom: number;
    brigadeSurcharge: number;
    dueDate: string | null;
};

export type ContribRow = {
    contribId: number;
    memberId: number;
    fullName: string;
    variableSymbol: number | null;
    amountTotal: number | null;
    amountBase: number | null;
    amountBoat1: number | null;
    amountBoat2: number | null;
    amountBoat3: number | null;
    discountCommittee: number | null;
    discountTom: number | null;
    discountIndividual: number | null;
    brigadeSurcharge: number | null;
    paidAmount: number | null;
    paidAt: string | null;
    isPaid: boolean | null;
    note: string | null;
    status: "paid" | "overpaid" | "underpaid" | "unpaid";
};

function calcStatus(row: Pick<ContribRow, "isPaid" | "paidAmount" | "amountTotal">): ContribRow["status"] {
    if (!row.isPaid) return "unpaid";
    const paid  = row.paidAmount ?? 0;
    const total = row.amountTotal ?? 0;
    if (paid === total) return "paid";
    if (paid > total)  return "overpaid";
    return "underpaid";
}

export default async function ContributionsPage(props: {
    searchParams: Promise<{ year?: string }>;
}) {
    const searchParams = await props.searchParams;
    const db = getDb();

    const allPeriods = await db
        .select({
            id:               contributionPeriods.id,
            year:             contributionPeriods.year,
            status:           contributionPeriods.status,
            amountBase:       contributionPeriods.amountBase,
            amountBoat1:      contributionPeriods.amountBoat1,
            amountBoat2:      contributionPeriods.amountBoat2,
            amountBoat3:      contributionPeriods.amountBoat3,
            discountCommittee: contributionPeriods.discountCommittee,
            discountTom:      contributionPeriods.discountTom,
            brigadeSurcharge: contributionPeriods.brigadeSurcharge,
            dueDate:          contributionPeriods.dueDate,
        })
        .from(contributionPeriods)
        .orderBy(desc(contributionPeriods.year));

    if (allPeriods.length === 0) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-semibold text-gray-900">Příspěvky</h1>
                <p className="text-gray-500">Žádná období v databázi.</p>
            </div>
        );
    }

    const requestedYear = Number(searchParams.year) || CONTRIBUTION_YEAR;
    const period = (allPeriods.find(p => p.year === requestedYear) ?? allPeriods[0]) as PeriodDetail;

    const rows = await db
        .select({
            contribId:          memberContributions.id,
            memberId:           memberContributions.memberId,
            fullName:           members.fullName,
            variableSymbol:     members.variableSymbol,
            amountTotal:        memberContributions.amountTotal,
            amountBase:         memberContributions.amountBase,
            amountBoat1:        memberContributions.amountBoat1,
            amountBoat2:        memberContributions.amountBoat2,
            amountBoat3:        memberContributions.amountBoat3,
            discountCommittee:  memberContributions.discountCommittee,
            discountTom:        memberContributions.discountTom,
            discountIndividual: memberContributions.discountIndividual,
            brigadeSurcharge:   memberContributions.brigadeSurcharge,
            paidAmount:         memberContributions.paidAmount,
            paidAt:             memberContributions.paidAt,
            isPaid:             memberContributions.isPaid,
            note:               memberContributions.note,
        })
        .from(memberContributions)
        .innerJoin(members, eq(memberContributions.memberId, members.id))
        .where(eq(memberContributions.periodId, period.id))
        .orderBy(asc(members.fullName));

    const data: ContribRow[] = rows.map(r => ({ ...r, status: calcStatus(r) }));

    return (
        <ContributionsClient
            periods={allPeriods as PeriodTab[]}
            period={period}
            rows={data}
        />
    );
}
