import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods, payments } from "@/db/schema";
import { eq, asc, desc, inArray } from "drizzle-orm";
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

export type Payment = {
    id: number;
    amount: number;
    paidAt: string | null;
    note: string | null;
    createdBy: string;
};

export type ContribRow = {
    contribId: number;
    memberId: number;
    firstName: string;
    lastName: string;
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
    todoNote: string | null;
    // Derived from payments table
    payments: Payment[];
    paidTotal: number;
    lastPaidAt: string | null;
    status: "paid" | "overpaid" | "underpaid" | "unpaid";
};

function calcStatus(paidTotal: number, amountTotal: number | null): ContribRow["status"] {
    if (paidTotal === 0 || amountTotal === null) return "unpaid";
    if (paidTotal === amountTotal) return "paid";
    if (paidTotal > amountTotal) return "overpaid";
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

    const contribs = await db
        .select({
            contribId:          memberContributions.id,
            memberId:           memberContributions.memberId,
            firstName:          members.firstName,
            lastName:           members.lastName,
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
            todoNote:           memberContributions.todoNote,
        })
        .from(memberContributions)
        .innerJoin(members, eq(memberContributions.memberId, members.id))
        .where(eq(memberContributions.periodId, period.id))
        .orderBy(asc(members.lastName), asc(members.firstName));

    // Fetch all payments for these contributions in one query
    const contribIds = contribs.map(c => c.contribId);
    const paymentRows = contribIds.length > 0
        ? await db
            .select({
                id:        payments.id,
                contribId: payments.contribId,
                amount:    payments.amount,
                paidAt:    payments.paidAt,
                note:      payments.note,
                createdBy: payments.createdBy,
            })
            .from(payments)
            .where(inArray(payments.contribId, contribIds))
            .orderBy(asc(payments.paidAt))
        : [];

    // Group payments by contribId
    const paymentsByContrib = paymentRows.reduce((acc, p) => {
        (acc[p.contribId] ??= []).push(p);
        return acc;
    }, {} as Record<number, typeof paymentRows>);

    const data: ContribRow[] = contribs.map(c => {
        const pays = paymentsByContrib[c.contribId] ?? [];
        const paidTotal = pays.reduce((s, p) => s + p.amount, 0);
        const lastPaidAt = pays.length > 0
            ? pays.reduce((latest, p) => (p.paidAt && (!latest || p.paidAt > latest) ? p.paidAt : latest), null as string | null)
            : null;
        return {
            ...c,
            payments: pays,
            paidTotal,
            lastPaidAt,
            status: calcStatus(paidTotal, c.amountTotal),
        };
    });

    return (
        <ContributionsClient
            periods={allPeriods as PeriodTab[]}
            period={period}
            rows={data}
        />
    );
}
