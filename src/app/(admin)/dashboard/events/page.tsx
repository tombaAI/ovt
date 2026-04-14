import { getDb } from "@/lib/db";
import { events, members } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getEvents } from "@/lib/actions/events";
import { EventsClient } from "./events-client";
import type { MemberOption } from "@/app/(admin)/dashboard/brigades/page";

export default async function EventsPage(props: {
    searchParams: Promise<{ year?: string }>;
}) {
    const { year: yearParam } = await props.searchParams;
    const db = getDb();

    const currentYear = new Date().getFullYear();

    // Roky pro záložky: roky s akcemi + aktuální + příští
    const existingYears = await db
        .selectDistinct({ year: events.year })
        .from(events);
    const yearsSet = new Set<number>(existingYears.map(r => Number(r.year)));
    yearsSet.add(currentYear);
    yearsSet.add(currentYear + 1);
    const years = Array.from(yearsSet).sort((a, b) => b - a);

    const selectedYear = Number(yearParam) || currentYear;

    const eventRows = await getEvents(selectedYear);

    const allMembers: MemberOption[] = await db
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
        <EventsClient
            years={years}
            selectedYear={selectedYear}
            events={eventRows}
            allMembers={allMembers}
        />
    );
}
