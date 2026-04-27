import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { members } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getEventById } from "@/lib/actions/events";
import { EventDetailClient } from "./event-detail-client";
import type { MemberOption } from "@/app/(admin)/dashboard/brigades/page";

export default async function EventDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const eventId = Number(id);
    if (isNaN(eventId) || eventId <= 0) notFound();

    const db = getDb();
    const [event, allMembers] = await Promise.all([
        getEventById(eventId),
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

    if (!event) notFound();

    return <EventDetailClient event={event} allMembers={allMembers} />;
}
