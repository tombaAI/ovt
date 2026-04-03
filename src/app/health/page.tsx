import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { checkDatabase, checkEmail } from "@/lib/health";
import { getRuntimeFlags } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

function StatusBadge({ ok, configured }: { ok: boolean; configured: boolean }) {
    if (ok) return <Badge className="bg-[#327600] hover:bg-[#327600]">OK</Badge>;
    if (!configured) return <Badge variant="secondary">Nenastaveno</Badge>;
    return <Badge variant="destructive">Chyba</Badge>;
}

export default async function HealthPage() {
    const [db, email] = await Promise.all([checkDatabase(), checkEmail()]);
    const runtime = getRuntimeFlags();

    const checks = [
        { label: "Databáze", result: db },
        { label: "E-mail", result: email }
    ];

    return (
        <main className="min-h-screen bg-gray-50 p-4 md:p-8">
            <div className="max-w-2xl mx-auto space-y-6">
                <div>
                    <p className="text-xs font-bold tracking-widest text-[#327600] uppercase mb-1">
                        OVT Bohemians
                    </p>
                    <h1 className="text-2xl font-semibold text-gray-900">Stav aplikace</h1>
                </div>

                <div className="grid gap-3">
                    {checks.map(({ label, result }) => (
                        <Card key={label}>
                            <CardHeader className="py-3 flex flex-row items-center justify-between space-y-0">
                                <p className="font-medium text-sm">{label}</p>
                                <StatusBadge ok={result.ok} configured={result.configured} />
                            </CardHeader>
                            <CardContent className="pb-3">
                                <p className="text-sm text-gray-500">{result.detail}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card>
                    <CardHeader className="py-3">
                        <p className="font-medium text-sm">Runtime proměnné</p>
                    </CardHeader>
                    <CardContent className="pb-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {Object.entries(runtime).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between text-xs py-0.5">
                                    <span className="text-gray-500 font-mono">{key}</span>
                                    <span className={value ? "text-[#327600]" : "text-gray-300"}>
                                        {value ? "✓" : "–"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="flex gap-2 flex-wrap text-xs">
                    {["/api/health", "/api/health/db", "/api/health/email"].map((path) => (
                        <a
                            key={path}
                            href={path}
                            className="px-2 py-1 rounded bg-white border text-gray-500 hover:text-gray-700 font-mono"
                        >
                            {path}
                        </a>
                    ))}
                </div>
            </div>
        </main>
    );
}
