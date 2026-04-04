import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { members } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";

export default async function DashboardPage() {
    const session = await auth();
    const name = session?.user?.name?.split(" ")[0] ?? "Správce";

    const db = getDb();
    const [counts] = await db.select({
        total:  sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${members.isActive})`,
    }).from(members);

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
                            <p className="text-2xl font-semibold text-gray-900">{Number(counts?.active ?? 0)}</p>
                            <p className="text-xs text-gray-400 mt-0.5">aktivních z {Number(counts?.total ?? 0)} celkem</p>
                        </CardContent>
                    </Card>
                </Link>

                <Card className="opacity-50">
                    <CardHeader className="pb-2">
                        <p className="text-sm font-medium text-gray-500">Příspěvky</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-400">Připravujeme…</p>
                    </CardContent>
                </Card>

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
