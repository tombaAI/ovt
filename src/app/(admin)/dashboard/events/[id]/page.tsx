import { notFound } from "next/navigation";
import { getEventById } from "@/lib/actions/events";
import { EventDetailClient } from "./event-detail-client";

export default async function EventDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const eventId = Number(id);
    if (isNaN(eventId) || eventId <= 0) notFound();

    const event = await getEventById(eventId);
    if (!event) notFound();

    return <EventDetailClient event={event} />;
}
