import { getDb } from "@/lib/db";
import { members } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getBrigades } from "@/lib/actions/brigades";
import { BrigadesClient } from "./brigades-client";
import { getSelectedYear } from "@/lib/actions/year";

export type MemberOption = {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    nickname: string | null;
};

export default async function BrigadesPage() {
    const db = getDb();
    const selectedYear = await getSelectedYear();

    const [brigades, allMembers] = await Promise.all([
        getBrigades(selectedYear),
        db.select({
            id:        members.id,
            firstName: members.firstName,
            lastName:  members.lastName,
            fullName:  members.fullName,
            nickname:  members.nickname,
        })
        .from(members)
        .orderBy(asc(members.lastName), asc(members.firstName)),
    ]);

    return (
        <BrigadesClient
            selectedYear={selectedYear}
            brigades={brigades}
            allMembers={allMembers}
        />
    );
}
