import { getDb } from "@/lib/db";
import { members, brigades as brigadesSchema } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { getBrigades } from "@/lib/actions/brigades";
import { BrigadesClient } from "./brigades-client";

export type MemberOption = {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    nickname: string | null;
};

export default async function BrigadesPage(props: {
    searchParams: Promise<{ year?: string }>;
}) {
    const { year: yearParam } = await props.searchParams;
    const db = getDb();

    // Roky pro záložky: roky, ve kterých jsou brigády + aktuální rok + předchozí rok
    const currentYear = new Date().getFullYear();
    const existingYears = await db
        .selectDistinct({ year: brigadesSchema.year })
        .from(brigadesSchema);
    const yearsSet = new Set<number>(existingYears.map(r => Number(r.year)));
    yearsSet.add(currentYear);
    yearsSet.add(currentYear - 1);
    const years = Array.from(yearsSet).sort((a, b) => b - a);

    const selectedYear = Number(yearParam) || currentYear;

    const brigades = await getBrigades(selectedYear);

    const allMembers = await db
        .select({
            id:        members.id,
            firstName: members.firstName,
            lastName:  members.lastName,
            fullName:  members.fullName,
            nickname:  members.nickname,
        })
        .from(members)
        .orderBy(asc(members.lastName), asc(members.firstName));

    return (
        <BrigadesClient
            years={years}
            selectedYear={selectedYear}
            brigades={brigades}
            allMembers={allMembers}
        />
    );
}
