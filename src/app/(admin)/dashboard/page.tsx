import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods, events, boats, brigades, payments } from "@/db/schema";
import { eq, sql, isNull, lte, and, or } from "drizzle-orm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CONTRIBUTION_YEAR } from "@/lib/constants";

const PERIOD_STATUS: Record<string, { label: string; className: string }> = {
    draft:      { label: "Návrh",      className: "bg-gray-100 text-gray-600 border-gray-200" },
    confirmed:  { label: "Potvrzeno",  className: "bg-blue-100 text-blue-700 border-blue-200" },
    collecting: { label: "Vybírání",   className: "bg-green-100 text-green-800 border-green-200" },
    closed:     { label: "Uzavřeno",   className: "bg-zinc-200 text-zinc-600 border-zinc-300" },
};

function formatKc(amount: number): string {
    return new Intl.NumberFormat("cs-CZ").format(Math.round(amount)) + "\u00a0Kč";
}

export default async function DashboardPage() {
    const session = await auth();
    const name = session?.user?.name?.split(" ")[0] ?? "Správce";

    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const currentYear = new Date().getFullYear();

    // ── Členové ─────────────────────────────────────────────────────────────
    const [memberCounts] = await db.select({
        total: sql<number>`count(*)`,
    }).from(members);

    const [activeCounts] = await db.select({
        active: sql<number>`count(*)`,
    }).from(members).where(
        and(
            lte(members.memberFrom, `${CONTRIBUTION_YEAR}-12-31`),
            or(isNull(members.memberTo), sql`${members.memberTo} >= ${CONTRIBUTION_YEAR + '-01-01'}`)
        )
    );

    // ── Příspěvky ────────────────────────────────────────────────────────────
    const [period] = await db.select({ id: contributionPeriods.id, status: contributionPeriods.status })
        .from(contributionPeriods)
        .where(eq(contributionPeriods.year, CONTRIBUTION_YEAR));

    const [contribCounts] = period ? await db.select({
        total:       sql<number>`count(*)`,
        paid:        sql<number>`count(*) filter (where ${memberContributions.isPaid} = true)`,
        prescription: sql<number>`coalesce(sum(${memberContributions.amountTotal}), 0)`,
    }).from(memberContributions).where(eq(memberContributions.periodId, period.id))
    : [{ total: 0, paid: 0, prescription: 0 }];

    const [paidSum] = period ? await db.select({
        collected: sql<number>`coalesce(sum(${payments.amount}), 0)`,
    }).from(payments)
    .innerJoin(memberContributions, eq(payments.contribId, memberContributions.id))
    .where(eq(memberContributions.periodId, period.id))
    : [{ collected: 0 }];

    // ── Kalendář ─────────────────────────────────────────────────────────────
    const [eventCounts] = await db.select({
        total:    sql<number>`count(*)`,
        noDate:   sql<number>`count(*) filter (where ${events.dateFrom} is null)`,
        upcoming: sql<number>`count(*) filter (where ${events.dateFrom} >= ${today} and ${events.status} != 'cancelled')`,
    }).from(events).where(eq(events.year, currentYear));

    // ── Lodě ─────────────────────────────────────────────────────────────────
    const [boatCounts] = await db.select({
        total:  sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${boats.storedTo} is null)`,
    }).from(boats);

    // ── Brigády ───────────────────────────────────────────────────────────────
    const [brigadeCounts] = await db.select({
        total:    sql<number>`count(*)`,
        upcoming: sql<number>`count(*) filter (where ${brigades.date} >= ${today})`,
    }).from(brigades).where(eq(brigades.year, currentYear));

    const periodStatus = PERIOD_STATUS[period?.status ?? "draft"];
    const activeBoats = Number(boatCounts?.active ?? 0);
    const totalBoats  = Number(boatCounts?.total ?? 0);
    const upcomingEvents = Number(eventCounts?.upcoming ?? 0);
    const upcomingBrigades = Number(brigadeCounts?.upcoming ?? 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Vítej, {name}</h1>
                <p className="text-gray-500 mt-1 text-sm">Správa klubu OVT Bohemians</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Členové */}
                <Link href="/dashboard/members">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="pb-2">
                            <p className="text-sm font-medium text-gray-500">Členové</p>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold text-gray-900">{Number(activeCounts?.active ?? 0)}</p>
                            <p className="text-xs text-gray-400 mt-0.5">aktivních v {CONTRIBUTION_YEAR} z {Number(memberCounts?.total ?? 0)} celkem</p>
                        </CardContent>
                    </Card>
                </Link>

                {/* Příspěvky */}
                <Link href="/dashboard/contributions">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between">
                            <p className="text-sm font-medium text-gray-500">Příspěvky {CONTRIBUTION_YEAR}</p>
                            {period && (
                                <Badge className={periodStatus.className} variant="outline">
                                    {periodStatus.label}
                                </Badge>
                            )}
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold text-gray-900">
                                {Number(contribCounts?.paid ?? 0)}{" "}
                                <span className="text-base font-normal text-gray-400">/ {Number(contribCounts?.total ?? 0)}</span>
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {formatKc(Number(paidSum?.collected ?? 0))} / {formatKc(Number(contribCounts?.prescription ?? 0))}
                            </p>
                        </CardContent>
                    </Card>
                </Link>

                {/* Kalendář */}
                <Link href={`/dashboard/events?year=${currentYear}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="pb-2">
                            <p className="text-sm font-medium text-gray-500">Kalendář {currentYear}</p>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold text-gray-900">{Number(eventCounts?.total ?? 0)}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {upcomingEvents > 0
                                    ? `${upcomingEvents} nadcházejících`
                                    : Number(eventCounts?.noDate ?? 0) > 0
                                        ? `${Number(eventCounts.noDate)} bez termínu`
                                        : "akcí v plánu"}
                            </p>
                        </CardContent>
                    </Card>
                </Link>

                {/* Lodě */}
                <Link href="/dashboard/boats">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="pb-2">
                            <p className="text-sm font-medium text-gray-500">Lodě</p>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold text-gray-900">
                                {activeBoats}{" "}
                                {activeBoats !== totalBoats && (
                                    <span className="text-base font-normal text-gray-400">/ {totalBoats}</span>
                                )}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {activeBoats !== totalBoats
                                    ? "aktuálně uložených z celkem"
                                    : "uložených lodí"}
                            </p>
                        </CardContent>
                    </Card>
                </Link>

                {/* Brigády */}
                <Link href="/dashboard/brigades">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="pb-2">
                            <p className="text-sm font-medium text-gray-500">Brigády {currentYear}</p>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold text-gray-900">{Number(brigadeCounts?.total ?? 0)}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {upcomingBrigades > 0
                                    ? `${upcomingBrigades} nadcházejících`
                                    : "brigád v roce"}
                            </p>
                        </CardContent>
                    </Card>
                </Link>

                {/* Import */}
                <Link href="/dashboard/imports">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="pb-2">
                            <p className="text-sm font-medium text-gray-500">Import &amp; synchronizace</p>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-gray-400">CSV importy, TJ Bohemians, mapování, historie</p>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
