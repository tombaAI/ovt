import { auth } from "@/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default async function DashboardPage() {
    const session = await auth();
    const name = session?.user?.name?.split(" ")[0] ?? "Správce";

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Vítej, {name}</h1>
                <p className="text-gray-500 mt-1 text-sm">Správa klubu OVT Bohemians</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <a href="/health" className="contents">
                    <Card className="hover:border-[#327600]/40 transition-colors cursor-pointer">
                        <CardHeader className="pb-2">
                            <p className="text-sm font-medium text-gray-500">Stav aplikace</p>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-gray-400">Health check → /health</p>
                        </CardContent>
                    </Card>
                </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="opacity-50">
                    <CardHeader className="pb-2">
                        <p className="text-sm font-medium text-gray-500">Členové</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-400">Připravujeme…</p>
                    </CardContent>
                </Card>
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
