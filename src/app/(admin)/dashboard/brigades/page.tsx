import { getDb } from "@/lib/db";
import { contributionPeriods, members } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { getBrigades } from "@/lib/actions/brigades";
import { BrigadesClient } from "./brigades-client";

export type PeriodTab = {
    id: number;
    year: number;
};

export type MemberOption = {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
};

export default async function BrigadesPage(props: {
    searchParams: Promise<{ year?: string }>;
}) {
    const { year: yearParam } = await props.searchParams;
    const db = getDb();

    const allPeriods = await db
        .select({ id: contributionPeriods.id, year: contributionPeriods.year })
        .from(contributionPeriods)
        .orderBy(desc(contributionPeriods.year));

    if (allPeriods.length === 0) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-semibold text-gray-900">Brigády</h1>
                <p className="text-gray-500">Žádná příspěvková období v databázi.</p>
            </div>
        );
    }

    const selectedYear = Number(yearParam) || allPeriods[0].year;
    const brigadeYear  = selectedYear - 1; // brigády roku X ovlivní příspěvky roku X+1

    const rows = await getBrigades(brigadeYear);

    const allMembers = await db
        .select({ id: members.id, firstName: members.firstName, lastName: members.lastName, fullName: members.fullName })
        .from(members)
        .orderBy(asc(members.lastName), asc(members.firstName));

    return (
        <BrigadesClient
            periods={allPeriods}
            selectedYear={selectedYear}
            brigadeYear={brigadeYear}
            brigades={rows}
            allMembers={allMembers}
        />
    );
}
