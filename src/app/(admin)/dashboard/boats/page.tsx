import { getDb } from "@/lib/db";
import { members } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getBoats } from "@/lib/actions/boats";
import { BoatsClient } from "./boats-client";

export type MemberOption = {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
};

export default async function BoatsPage(props: {
    searchParams: Promise<{ archived?: string }>;
}) {
    const { archived } = await props.searchParams;
    const includeArchived = archived === "1";

    const db = getDb();

    const [rows, allMembers] = await Promise.all([
        getBoats(includeArchived),
        db
            .select({
                id:        members.id,
                firstName: members.firstName,
                lastName:  members.lastName,
                fullName:  members.fullName,
            })
            .from(members)
            .orderBy(asc(members.lastName), asc(members.firstName)),
    ]);

    return (
        <BoatsClient
            boats={rows}
            allMembers={allMembers}
            includeArchived={includeArchived}
        />
    );
}
