import { renderToBuffer } from "@react-pdf/renderer";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { eventExpenses, events, eventTreasurerApprovalLog, members } from "@/db/schema";
import { buildPdfAttachmentDisposition } from "@/lib/content-disposition";
import { getDb } from "@/lib/db";
import { getOddilNazevPlny } from "@/lib/oddily-config";
import {
    VyuctovaniDocument,
    type VyuctovaniData,
    type VyuctovaniNaklady,
} from "@/lib/pdf/vyuctovani-template";

export const dynamic = "force-dynamic";

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
                eventType: events.eventType,
                oddil: events.oddil,
                leaderName: members.fullName,
            })
            .from(events)
            .leftJoin(members, eq(events.leaderId, members.id))
            .where(eq(events.id, eventId))
            .limit(1);

        if (!event) {
            return NextResponse.json({ error: "Akce nenalezena" }, { status: 404 });
        }

        // Provozní výdaj nemá vedoucího a schvalovací krok odpadá (zamyká sám hospodář
        // oddílu) — vyúčtoval i schválil proto odpovídá poslednímu schválení hospodáře,
        // ne DEFAULT_SCHVALIL, který je specifický pro OVT (spec 2026-08-31-provozni-vydaje-vice-oddilu.md).
        const isProvozni = event.eventType === "provozni";
        const [latestApproval] = isProvozni
            ? await db
                .select({ changedBy: eventTreasurerApprovalLog.changedBy })
                .from(eventTreasurerApprovalLog)
                .where(eq(eventTreasurerApprovalLog.eventId, eventId))
                .orderBy(desc(eventTreasurerApprovalLog.changedAt))
                .limit(1)
            : [];
        const provozniSchvalil = latestApproval?.changedBy ?? DEFAULT_SCHVALIL;

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
            oddi: getOddilNazevPlny(event.oddil),
            cisloZalohy: "",
            zaMesicLabel: "za akci",
            zaMesic: event.name,
            veVysi: 0,
            naklady,
            prijmy: {},
            vyuctoval: isProvozni ? provozniSchvalil : (event.leaderName ?? ""),
            schvalil: isProvozni ? provozniSchvalil : DEFAULT_SCHVALIL,
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