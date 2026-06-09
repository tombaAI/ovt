import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
    events,
    eventRegistrations,
    eventRegistrationParticipants,
    eventPaymentPrescriptions,
} from "@/db/schema";
import { buildPdfAttachmentDisposition } from "@/lib/content-disposition";
import { getDb } from "@/lib/db";
import { UcastniciDocument, type UcastnikRow } from "@/lib/pdf/ucastnici-template";

export const dynamic = "force-dynamic";

function splitFullName(fullName: string): { lastName: string; firstName: string } {
    const trimmed = fullName.trim();
    const lastSpace = trimmed.lastIndexOf(" ");
    if (lastSpace === -1) return { lastName: trimmed, firstName: "" };
    return { lastName: trimmed.slice(lastSpace + 1), firstName: trimmed.slice(0, lastSpace) };
}

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

        // Aktivní přihlášky + jejich záloha (deposit má přednost)
        const activeRegs = await db
            .select({
                id: eventRegistrations.id,
                firstName: eventRegistrations.firstName,
                lastName: eventRegistrations.lastName,
                paymentStatus: eventPaymentPrescriptions.status,
            })
            .from(eventRegistrations)
            .leftJoin(
                eventPaymentPrescriptions,
                eq(eventPaymentPrescriptions.registrationId, eventRegistrations.id),
            )
            .where(and(eq(eventRegistrations.eventId, eventId), isNull(eventRegistrations.cancelledAt)))
            .orderBy(asc(eventRegistrations.id));

        // Deduplikace — pokud má reg víc předpisů (deposit + settlement), vezmi první (nižší ID = deposit)
        const seen = new Set<number>();
        const regMap = new Map<number, { firstName: string; lastName: string; paymentStatus: string | null }>();
        for (const r of activeRegs) {
            if (!seen.has(r.id)) {
                seen.add(r.id);
                regMap.set(r.id, { firstName: r.firstName, lastName: r.lastName, paymentStatus: r.paymentStatus });
            }
        }

        const regIds = [...regMap.keys()];

        // Účastníci
        const participants = regIds.length > 0
            ? await db
                .select({
                    registrationId: eventRegistrationParticipants.registrationId,
                    fullName: eventRegistrationParticipants.fullName,
                })
                .from(eventRegistrationParticipants)
                .where(inArray(eventRegistrationParticipants.registrationId, regIds))
                .orderBy(asc(eventRegistrationParticipants.participantOrder))
            : [];

        const participantsByReg = new Map<number, string[]>();
        for (const p of participants) {
            const list = participantsByReg.get(p.registrationId) ?? [];
            list.push(p.fullName);
            participantsByReg.set(p.registrationId, list);
        }

        const rows: UcastnikRow[] = [];
        for (const [regId, reg] of regMap) {
            const names = participantsByReg.get(regId);
            if (names && names.length > 0) {
                for (const fullName of names) {
                    rows.push({ ...splitFullName(fullName), paymentStatus: reg.paymentStatus });
                }
            } else {
                rows.push({ lastName: reg.lastName, firstName: reg.firstName, paymentStatus: reg.paymentStatus });
            }
        }

        rows.sort((a, b) => {
            const cmp = a.lastName.localeCompare(b.lastName, "cs");
            return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName, "cs");
        });

        const generatedAt = new Intl.DateTimeFormat("cs-CZ", {
            day: "numeric", month: "numeric", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        }).format(new Date());

        const buffer = await renderToBuffer(
            <UcastniciDocument data={{ eventName: event.name, generatedAt, rows }} />,
        );
        const disposition = buildPdfAttachmentDisposition("ucastnici", event.name);

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": disposition,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Interní chyba";
        console.error("[GET /api/events/[id]/ucastnici]", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
