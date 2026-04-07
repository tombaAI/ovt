import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { members, memberContributions, contributionPeriods } from "@/db/schema";
import { eq, sql, isNull, lte, and, or } from "drizzle-orm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { CONTRIBUTION_YEAR } from "@/lib/constants";

export default async function DashboardPage() {
    const session = await auth();
    const name = session?.user?.name?.split(" ")[0] ?? "Správce";

    const db = getDb();
    const [memberCounts] = await db.select({
        total:  sql<number>`count(*)`,
    }).from(members);

    // Aktivní v daném roce: member_from <= rok-12-31 AND (member_to IS NULL OR member_to >= rok-01-01)
    const [activeCounts] = await db.select({
        active: sql<number>`count(*)`,
    }).from(members).where(
        and(
            lte(members.memberFrom, `${CONTRIBUTION_YEAR}-12-31`),
            or(isNull(members.memberTo), sql`${members.memberTo} >= ${CONTRIBUTION_YEAR + '-01-01'}`)
        )
    );

    const [period] = await db.select({ id: contributionPeriods.id })
        .from(contributionPeriods)
        .where(eq(contributionPeriods.year, CONTRIBUTION_YEAR));

    const [contribCounts] = period ? await db.select({
        total:  sql<number>`count(*)`,
        paid:   sql<number>`count(*) filter (where ${memberContributions.isPaid} = true)`,
    }).from(memberContributions).where(eq(memberContributions.periodId, period.id))
    : [{ total: 0, paid: 0 }];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Vítej, {name}</h1>
                <p className="text-gray-500 mt-1 text-sm">Správa klubu OVT Bohemians</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link href="/dashboard/members">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="pb-2">
                            <p className="text-sm font-medium text-gray-500">Členové</p>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold text-gray-900">{Number(activeCounts?.active ?? 0)}</p>
                            <p className="text-xs text-gray-400 mt-0.5">v {CONTRIBUTION_YEAR} z {Number(memberCounts?.total ?? 0)} celkem</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/dashboard/contributions">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="pb-2">
                            <p className="text-sm font-medium text-gray-500">Příspěvky {CONTRIBUTION_YEAR}</p>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold text-gray-900">{Number(contribCounts?.paid ?? 0)}</p>
                            <p className="text-xs text-gray-400 mt-0.5">zaplaceno z {Number(contribCounts?.total ?? 0)} členů</p>
                        </CardContent>
                    </Card>
                </Link>

                <Card className="opacity-50">
                    <CardHeader className="pb-2">
                        <p className="text-sm font-medium text-gray-500">Finance</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-400">Připravujeme…</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
