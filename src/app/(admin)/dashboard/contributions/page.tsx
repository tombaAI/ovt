import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { CONTRIBUTION_YEAR } from "@/lib/constants";
import { ContributionsClient } from "./contributions-client";

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
    /** Vypočítaný stav platby */
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

export default async function ContributionsPage() {
    const db = getDb();

    const [period] = await db.select()
        .from(contributionPeriods)
        .where(eq(contributionPeriods.year, CONTRIBUTION_YEAR));

    if (!period) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-semibold text-gray-900">Příspěvky {CONTRIBUTION_YEAR}</h1>
                <p className="text-gray-500">Období nenalezeno v databázi.</p>
            </div>
        );
    }

    // Fetch contributions joined with member name
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

    const data: ContribRow[] = rows.map(r => ({
        ...r,
        status: calcStatus(r),
    }));

    const stats = {
        total:     data.length,
        paid:      data.filter(r => r.status === "paid").length,
        overpaid:  data.filter(r => r.status === "overpaid").length,
        underpaid: data.filter(r => r.status === "underpaid").length,
        unpaid:    data.filter(r => r.status === "unpaid").length,
        collected: data.reduce((s, r) => s + (r.paidAmount ?? 0), 0),
        expected:  data.reduce((s, r) => s + (r.amountTotal ?? 0), 0),
    };

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Příspěvky {CONTRIBUTION_YEAR}</h1>
                <p className="text-gray-500 mt-1 text-sm">
                    Základní: {period.amountBase} Kč · Loď 1: {period.amountBoat1} Kč ·
                    Splatnost: {period.dueDate ?? "—"}
                </p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Zaplaceno správně</p>
                    <p className="text-2xl font-semibold text-[#327600]">{stats.paid}</p>
                </div>
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Nezaplaceno</p>
                    <p className="text-2xl font-semibold text-red-600">{stats.unpaid}</p>
                </div>
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Nedoplatek / přeplatek</p>
                    <p className="text-2xl font-semibold text-orange-500">{stats.underpaid + stats.overpaid}</p>
                </div>
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Vybráno / očekáváno</p>
                    <p className="text-lg font-semibold text-gray-800">
                        {stats.collected.toLocaleString("cs-CZ")} Kč
                    </p>
                    <p className="text-xs text-gray-400">
                        z {stats.expected.toLocaleString("cs-CZ")} Kč
                    </p>
                </div>
            </div>

            <ContributionsClient rows={data} />
        </div>
    );
}
