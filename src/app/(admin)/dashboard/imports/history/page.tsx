import { getImportHistory } from "@/lib/actions/import";
import { Badge } from "@/components/ui/badge";

type AppliedChange = { memberId: number; memberName: string; field: string; oldValue: string | null; newValue: string };

function fmtDate(d: Date) {
    return new Date(d).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
}

export default async function ImportHistoryPage() {
    const history = await getImportHistory(100);

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Historie importů</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Log všech provedených importů — čas, soubor, autor a přijaté změny.
                </p>
            </div>

            {history.length === 0 && (
                <div className="rounded-xl border px-6 py-10 text-center text-sm text-muted-foreground">
                    Zatím žádný import.
                </div>
            )}

            <div className="space-y-3">
                {history.map(h => {
                    const changes = (h.changesApplied as AppliedChange[]) ?? [];
                    return (
                        <details key={h.id} className="rounded-xl border overflow-hidden group">
                            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors list-none">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-sm truncate">{h.filename}</span>
                                        {h.profileNameSnapshot
                                            ? <Badge className="bg-sky-100 text-sky-700 border-0 text-xs font-normal shrink-0">profil: {h.profileNameSnapshot}</Badge>
                                            : <Badge className="bg-gray-100 text-gray-500 border-0 text-xs font-normal shrink-0">bez profilu</Badge>
                                        }
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {fmtDate(h.importedAt as unknown as Date)} · {h.importedBy}
                                    </p>
                                </div>
                                <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                                    <span>{h.recordsTotal} řádků</span>
                                    <span className="text-green-700 font-medium">{changes.length} změn</span>
                                </div>
                                <span className="text-gray-400 group-open:rotate-90 transition-transform text-xs">›</span>
                            </summary>

                            <div className="border-t px-4 py-3 space-y-3 bg-gray-50/50">
                                {/* Statistiky */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                    {[
                                        { label: "Řádků celkem",    val: h.recordsTotal },
                                        { label: "Spárováno",       val: h.recordsMatched },
                                        { label: "Noví kandidáti",  val: h.recordsNewCandidates },
                                        { label: "Chybí v souboru", val: h.recordsOnlyInDb },
                                    ].map(s => (
                                        <div key={s.label} className="rounded-lg border bg-white px-3 py-2 text-center">
                                            <p className="font-semibold text-base">{s.val}</p>
                                            <p className="text-muted-foreground">{s.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Přijaté změny */}
                                {changes.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Žádné změny nebyly přijaty.</p>
                                ) : (
                                    <div className="rounded-xl border overflow-hidden">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-gray-100 border-b font-semibold text-muted-foreground">
                                                    <th className="text-left px-3 py-1.5">Člen</th>
                                                    <th className="text-left px-3 py-1.5">Pole</th>
                                                    <th className="text-left px-3 py-1.5">Stará hodnota</th>
                                                    <th className="text-left px-3 py-1.5">Nová hodnota</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {changes.map((c, i) => (
                                                    <tr key={i} className="border-b last:border-0">
                                                        <td className="px-3 py-1.5 font-medium">{c.memberName}</td>
                                                        <td className="px-3 py-1.5 text-muted-foreground">{c.field}</td>
                                                        <td className="px-3 py-1.5 line-through text-red-400">{c.oldValue ?? "—"}</td>
                                                        <td className="px-3 py-1.5 text-green-700 font-medium">{c.newValue}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </details>
                    );
                })}
            </div>
        </div>
    );
}
