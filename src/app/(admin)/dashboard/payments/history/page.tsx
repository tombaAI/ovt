import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { Badge } from "@/components/ui/badge";
import { getPaymentHistoryRuns } from "@/lib/actions/reconciliation";
import type { ImportRunSummary } from "@/lib/actions/reconciliation";

export const dynamic = "force-dynamic";

function fmtDatetime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("cs-CZ", {
        day: "numeric", month: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function ReconcBadge({ count, variant }: { count: number; variant: "confirmed" | "suggested" | "unmatched" | "ignored" }) {
    if (count === 0) return null;
    const cls = {
        confirmed: "bg-green-100 text-green-800 border-green-200",
        suggested: "bg-blue-100 text-blue-700 border-blue-200",
        unmatched: "bg-gray-100 text-gray-600 border-gray-200",
        ignored:   "bg-amber-100 text-amber-700 border-amber-200",
    }[variant];
    const label = {
        confirmed: "Potvrzeno",
        suggested: "Ke kontrole",
        unmatched: "Nespárováno",
        ignored:   "Ignorováno",
    }[variant];
    return (
        <Badge className={`text-xs font-normal border ${cls}`}>
            {count} {label}
        </Badge>
    );
}

function RunRow({ run }: { run: ImportRunSummary }) {
    const allDone = run.unmatched === 0 && run.suggested === 0;
    return (
        <tr className="border-b hover:bg-gray-50/60 transition-colors">
            <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {fmtDatetime(run.importedAt)}
            </td>
            <td className="px-3 py-2.5 text-sm font-medium">
                {run.profileName}
            </td>
            <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[220px]">
                <span className="truncate block">{run.filename}</span>
            </td>
            <td className="px-3 py-2.5 text-sm text-right tabular-nums">
                {run.total}
            </td>
            <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                    <ReconcBadge count={run.confirmed} variant="confirmed" />
                    <ReconcBadge count={run.suggested} variant="suggested" />
                    <ReconcBadge count={run.unmatched} variant="unmatched" />
                    <ReconcBadge count={run.ignored}   variant="ignored"   />
                    {run.total === 0 && <span className="text-xs text-muted-foreground">—</span>}
                </div>
            </td>
            <td className="px-3 py-2.5 text-center">
                {run.total > 0 && (
                    allDone
                        ? <span className="text-xs text-green-700">✓ hotovo</span>
                        : <Link
                            href={`/dashboard/payments?status=unmatched`}
                            className="text-xs text-blue-600 hover:underline">
                            Spárovat →
                          </Link>
                )}
            </td>
        </tr>
    );
}

export default async function PaymentHistoryPage() {
    const runs = await getPaymentHistoryRuns();

    return (
        <div className="space-y-4">
            <BackButton />

            <div>
                <h1 className="text-xl font-semibold">Historie importů plateb</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Přehled nahraných bankovních výpisů a stav jejich spárování
                </p>
            </div>

            {runs.length === 0 ? (
                <div className="rounded-lg border bg-white px-6 py-12 text-center text-sm text-muted-foreground">
                    Zatím žádné importy bankovních výpisů.{" "}
                    <Link href="/dashboard/imports/bank/file" className="text-blue-600 hover:underline">
                        Nahrát výpis →
                    </Link>
                </div>
            ) : (
                <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-gray-50 text-xs text-muted-foreground">
                                <th className="text-left px-3 py-2 font-medium">Datum importu</th>
                                <th className="text-left px-3 py-2 font-medium">Profil</th>
                                <th className="text-left px-3 py-2 font-medium">Soubor</th>
                                <th className="text-right px-3 py-2 font-medium">Celkem</th>
                                <th className="text-left px-3 py-2 font-medium">Stav párování</th>
                                <th className="text-center px-3 py-2 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {runs.map(run => (
                                <RunRow key={run.runId} run={run} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <p className="text-xs text-muted-foreground">
                {runs.length} {runs.length === 1 ? "import" : "importů"} celkem
                {runs.some(r => r.unmatched > 0) && (
                    <> · <Link href="/dashboard/payments?status=unmatched" className="text-blue-600 hover:underline">
                        Zobrazit nespárované platby →
                    </Link></>
                )}
            </p>
        </div>
    );
}
