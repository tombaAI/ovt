import { notFound } from "next/navigation";
import { getEventById } from "@/lib/actions/events";
import { auth } from "@/auth";
import { EventDetailClient } from "./event-detail-client";

export default async function EventDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const eventId = Number(id);
    if (isNaN(eventId) || eventId <= 0) notFound();

    const [event, session] = await Promise.all([getEventById(eventId), auth()]);
    if (!event) notFound();

    const treasurerEmail = process.env.TREASURER_EMAIL?.trim().toLowerCase();
    const isTreasurer = !!(treasurerEmail && session?.user?.email?.toLowerCase() === treasurerEmail);

    return <EventDetailClient event={event} isTreasurer={isTreasurer} />;
}
