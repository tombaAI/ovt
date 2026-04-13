import { getImportHistory } from "@/lib/actions/import";
import { Badge } from "@/components/ui/badge";

function fmtDate(d: Date) {
    return new Date(d).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
}

export const dynamic = "force-dynamic";

export default async function BankImportHistoryPage() {
    const history = await getImportHistory("bank", 100);

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Historie — bankovní importy</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Log provedených importů bankovních souborů — čas, profil, počty transakcí.
                </p>
            </div>

            {history.length === 0 && (
                <div className="rounded-xl border px-6 py-10 text-center text-sm text-muted-foreground">
                    Zatím žádný bankovní import ze souboru.
                </div>
            )}

            <div className="space-y-3">
                {history.map(h => (
                    <div key={h.id} className="rounded-xl border overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm truncate">{h.filename}</span>
                                    {h.profileNameSnapshot
                                        ? <Badge className="bg-sky-100 text-sky-700 border-0 text-xs font-normal shrink-0">
                                            {h.profileNameSnapshot}
                                          </Badge>
                                        : <Badge className="bg-gray-100 text-gray-500 border-0 text-xs font-normal shrink-0">
                                            bez profilu
                                          </Badge>
                                    }
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {fmtDate(h.importedAt as unknown as Date)} · {h.importedBy}
                                </p>
                            </div>
                            <div className="grid grid-cols-4 gap-4 text-xs text-right shrink-0">
                                <div>
                                    <p className="font-semibold">{h.recordsTotal}</p>
                                    <p className="text-muted-foreground">řádků</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-green-700">{h.recordsNewCandidates}</p>
                                    <p className="text-muted-foreground">nových</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-amber-600">{h.recordsMatched}</p>
                                    <p className="text-muted-foreground">duplikátů</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-muted-foreground">{h.recordsOnlyInDb}</p>
                                    <p className="text-muted-foreground">přeskočeno</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
