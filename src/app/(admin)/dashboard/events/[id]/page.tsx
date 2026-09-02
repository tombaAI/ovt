import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/actions/events";
import { auth } from "@/auth";
import { isAnyOddilTreasurer, isTreasurerOfOddil } from "@/lib/treasurer";
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

    if (event.eventType === "provozni" && !isAnyOddilTreasurer(session?.user?.email)) {
        redirect("/dashboard");
    }

    // isTreasurerOfOddil(email, 'ovt') je identické s dnešním isTreasurer() — u běžných
    // akcí (oddil vždy 'ovt') se chování oproti dnešku nemění vůbec.
    const isTreasurer = isTreasurerOfOddil(session?.user?.email, event.oddil);

    return <EventDetailClient event={event} isTreasurer={isTreasurer} />;
}
