import { getDb } from "@/lib/db";
import { members } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getEvents } from "@/lib/actions/events";
import { EventsClient } from "./events-client";
import { getSelectedYear } from "@/lib/actions/year";
import type { MemberOption } from "@/app/(admin)/dashboard/brigades/page";

export default async function EventsPage() {
    const db = getDb();
    const selectedYear = await getSelectedYear();

    const [eventRows, allMembers] = await Promise.all([
        getEvents(selectedYear),
        db.select({
            id:        members.id,
            firstName: members.firstName,
            lastName:  members.lastName,
            fullName:  members.fullName,
            nickname:  members.nickname,
        })
        .from(members)
        .orderBy(asc(members.lastName), asc(members.firstName)) as Promise<MemberOption[]>,
    ]);

    return (
        <EventsClient
            selectedYear={selectedYear}
            events={eventRows}
            allMembers={allMembers}
        />
    );
}
