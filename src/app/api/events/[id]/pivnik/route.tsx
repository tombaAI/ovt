import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
    events,
    eventRegistrations,
    eventRegistrationParticipants,
} from "@/db/schema";
import { buildPdfAttachmentDisposition } from "@/lib/content-disposition";
import { getDb } from "@/lib/db";
import { PivnikDocument, type PivnikData, type PivnikRegistration } from "@/lib/pdf/pivnik-template";

export const dynamic = "force-dynamic";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
        }

        const { id } = await params;
        const eventId = Number(id);
        if (Number.isNaN(eventId) || eventId <= 0) {
            return NextResponse.json({ error: "Neplatné ID akce" }, { status: 400 });
        }

        const db = getDb();

        const [event] = await db
            .select({ name: events.name })
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1);

        if (!event) {
            return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        }

        const [regs, allParticipants] = await Promise.all([
            db
                .select({
                    id: eventRegistrations.id,
                    firstName: eventRegistrations.firstName,
                    lastName: eventRegistrations.lastName,
                })
                .from(eventRegistrations)
                .where(and(
                    eq(eventRegistrations.eventId, eventId),
                    isNull(eventRegistrations.cancelledAt),
                ))
                .orderBy(asc(eventRegistrations.id)),
            db
                .select({
                    registrationId: eventRegistrationParticipants.registrationId,
                    fullName: eventRegistrationParticipants.fullName,
                    participantOrder: eventRegistrationParticipants.participantOrder,
                })
                .from(eventRegistrationParticipants)
                .where(eq(eventRegistrationParticipants.eventId, eventId))
                .orderBy(
                    asc(eventRegistrationParticipants.registrationId),
                    asc(eventRegistrationParticipants.participantOrder),
                ),
        ]);

        const participantsByReg = new Map<number, string[]>();
        for (const p of allParticipants) {
            const list = participantsByReg.get(p.registrationId) ?? [];
            list.push(p.fullName);
            participantsByReg.set(p.registrationId, list);
        }

        const registrations: PivnikRegistration[] = regs.map((reg) => {
            const names = participantsByReg.get(reg.id);
            return {
                registrationId: reg.id,
                participants: (names && names.length > 0)
                    ? names.map((n) => ({ fullName: n }))
                    : [{ fullName: `${reg.firstName} ${reg.lastName}` }],
            };
        });

        const totalParticipants = registrations.reduce((s, r) => s + r.participants.length, 0);

        const generatedAt = new Intl.DateTimeFormat("cs-CZ", {
            day: "numeric", month: "numeric", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        }).format(new Date());

        const data: PivnikData = {
            eventName: event.name,
            generatedAt,
            registrations,
            totalParticipants,
        };

        const buffer = await renderToBuffer(<PivnikDocument data={data} />);
        const disposition = buildPdfAttachmentDisposition("pivnik", event.name);

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": disposition,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Interní chyba";
        console.error("[GET /api/events/[id]/pivnik]", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
