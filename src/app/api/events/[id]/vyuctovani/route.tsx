import { renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { eventExpenses, events, members } from "@/db/schema";
import { buildPdfAttachmentDisposition } from "@/lib/content-disposition";
import { getDb } from "@/lib/db";
import {
    VyuctovaniDocument,
    type VyuctovaniData,
    type VyuctovaniNaklady,
} from "@/lib/pdf/vyuctovani-template";

export const dynamic = "force-dynamic";

const DEFAULT_ODDIL = "207 Oddíl vodní turistiky";
const DEFAULT_SCHVALIL = "Tomáš Bauer";

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
            .select({
                id: events.id,
                name: events.name,
                leaderName: members.fullName,
            })
            .from(events)
            .leftJoin(members, eq(events.leaderId, members.id))
            .where(eq(events.id, eventId))
            .limit(1);

        if (!event) {
            return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        }

        const expenses = await db
            .select({
                amount: eventExpenses.amount,
                purposeCategory: eventExpenses.purposeCategory,
            })
            .from(eventExpenses)
            .where(eq(eventExpenses.eventId, eventId));

        const naklady: VyuctovaniNaklady = {};
        for (const expense of expenses) {
            const category = expense.purposeCategory as keyof VyuctovaniNaklady;
            naklady[category] = (naklady[category] ?? 0) + Number(expense.amount);
        }

        const data: VyuctovaniData = {
            oddi: DEFAULT_ODDIL,
            cisloZalohy: "",
            zaMesicLabel: "za akci",
            zaMesic: event.name,
            veVysi: 0,
            naklady,
            prijmy: {},
            vyuctoval: event.leaderName ?? "",
            schvalil: DEFAULT_SCHVALIL,
            datum: new Intl.DateTimeFormat("cs-CZ").format(new Date()),
        };

        const buffer = await renderToBuffer(<VyuctovaniDocument data={data} />);
        const disposition = buildPdfAttachmentDisposition("vyuctovani-oddilu", event.name);

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": disposition,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Interní chyba";
        console.error("[GET /api/events/[id]/vyuctovani]", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}