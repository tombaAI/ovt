import { getDb } from "@/lib/db";
import { members } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getEvents, getEventYears } from "@/lib/actions/events";
import { EventsClient } from "./events-client";
import type { MemberOption } from "@/app/(admin)/dashboard/brigades/page";

export default async function EventsPage({
    searchParams,
}: {
    searchParams: Promise<{ year?: string }>;
}) {
    const db = getDb();
    const sp = await searchParams;

    const years = await getEventYears();
    const currentYear = new Date().getFullYear();
    const selectedYear = sp.year ? Number(sp.year) : currentYear;

    const [eventRows, allMembers] = await Promise.all([
        getEvents(selectedYear),
        db.select({
            id: members.id,
            firstName: members.firstName,
            lastName: members.lastName,
            fullName: members.fullName,
            nickname: members.nickname,
        })
            .from(members)
            .orderBy(asc(members.lastName), asc(members.firstName)) as Promise<MemberOption[]>,
    ]);

    return (
        <EventsClient
            years={years}
            selectedYear={selectedYear}
            events={eventRows}
            allMembers={allMembers}
        />
    );
}
