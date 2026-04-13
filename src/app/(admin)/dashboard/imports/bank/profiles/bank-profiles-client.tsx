"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ColumnMapping, MatchKeyConfig } from "@/lib/import/types";

type BankProfileConfig = {
    filterColumn?:           string;
    filterValue?:            string;
    dateFormat?:             string;
    amountDecimalSeparator?: string;
};

type Profile = {
    id:              number;
    name:            string;
    note:            string | null;
    fileFormat:      string;
    delimiter:       string | null;
    encoding:        string | null;
    headerRowIndex:  number;
    matchKeys:       unknown;
    mappings:        unknown;
    config:          unknown;
    createdBy:       string;
    createdAt:       Date;
    updatedAt:       Date;
};

function fmt(d: Date) {
    return new Date(d).toLocaleDateString("cs-CZ");
}

function ProfileDetail({ profile, onClose }: { profile: Profile; onClose: () => void }) {
    const mappings  = (profile.mappings  as ColumnMapping[]  ) ?? [];
    const matchKeys = (profile.matchKeys as MatchKeyConfig[]) ?? [];
    const config    = (profile.config    as BankProfileConfig) ?? {};

    return (
        <Sheet open onOpenChange={open => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto px-5 pb-8">
                <SheetHeader className="px-0 pt-5 pb-4">
                    <SheetTitle>{profile.name}</SheetTitle>
                </SheetHeader>

                <div className="space-y-5">
                    {profile.note && (
                        <p className="text-sm text-muted-foreground">{profile.note}</p>
                    )}

                    {/* Meta */}
                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                        <span>Kódování: <strong className="text-foreground">{profile.encoding ?? "auto"}</strong></span>
                        <span>Oddělovač: <strong className="text-foreground">{profile.delimiter ?? "auto"}</strong></span>
                        <span>Řádek hlavičky: <strong className="text-foreground">{profile.headerRowIndex + 1}</strong></span>
                        <span>Vytvořen: <strong className="text-foreground">{fmt(profile.createdAt)}</strong></span>
                    </div>

                    {/* Config (bank-specific) */}
                    {(config.filterColumn || config.dateFormat || config.amountDecimalSeparator) && (
                        <div>
                            <p className="text-sm font-semibold mb-2">Konfigurace parsování</p>
                            <div className="rounded-xl border overflow-hidden">
                                <table className="w-full text-sm">
                                    <tbody>
                                        {config.filterColumn && (
                                            <tr className="border-b">
                                                <td className="px-3 py-1.5 text-muted-foreground w-48">Sloupec pro filtr směru</td>
                                                <td className="px-3 py-1.5 font-mono text-xs">{config.filterColumn}</td>
                                            </tr>
                                        )}
                                        {config.filterValue && (
                                            <tr className="border-b">
                                                <td className="px-3 py-1.5 text-muted-foreground">Hodnota (příchozí)</td>
                                                <td className="px-3 py-1.5 font-mono text-xs">{config.filterValue}</td>
                                            </tr>
                                        )}
                                        {config.dateFormat && (
                                            <tr className="border-b">
                                                <td className="px-3 py-1.5 text-muted-foreground">Formát datumu</td>
                                                <td className="px-3 py-1.5 font-mono text-xs">{config.dateFormat}</td>
                                            </tr>
                                        )}
                                        {config.amountDecimalSeparator && (
                                            <tr>
                                                <td className="px-3 py-1.5 text-muted-foreground">Desetinný oddělovač</td>
                                                <td className="px-3 py-1.5 font-mono text-xs">{config.amountDecimalSeparator}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Párovací klíče */}
                    <div>
                        <p className="text-sm font-semibold mb-2">Párovací klíče (external_key)</p>
                        {matchKeys.length === 0 ? (
                            <p className="text-sm text-muted-foreground">—</p>
                        ) : (
                            <div className="flex gap-2 flex-wrap">
                                {matchKeys.map(mk => (
                                    <Badge key={mk.targetField} className="bg-sky-100 text-sky-800 border-0">
                                        {mk.targetField} ← {mk.sourceCol}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Mapování */}
                    <div>
                        <p className="text-sm font-semibold mb-2">Mapování sloupců ({mappings.length})</p>
                        {mappings.length === 0 ? (
                            <p className="text-sm text-muted-foreground">—</p>
                        ) : (
                            <div className="rounded-xl border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                            <th className="text-left px-3 py-2">Sloupec v souboru</th>
                                            <th className="text-left px-3 py-2">Pole transakce</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mappings.map(m => (
                                            <tr key={m.sourceCol} className="border-b last:border-0">
                                                <td className="px-3 py-1.5 font-mono text-xs">{m.sourceCol}</td>
                                                <td className="px-3 py-1.5 text-xs">{m.targetField}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export function BankProfilesClient({ profiles }: { profiles: Profile[] }) {
    const [detail, setDetail] = useState<Profile | null>(null);

    if (profiles.length === 0) {
        return (
            <div className="rounded-xl border px-6 py-10 text-center text-sm text-muted-foreground">
                Zatím žádné bankovní importní profily.
            </div>
        );
    }

    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2">
                {profiles.map(p => (
                    <button key={p.id} onClick={() => setDetail(p)}
                        className="text-left rounded-xl border px-4 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm">{p.name}</p>
                            <Badge className="bg-sky-100 text-sky-700 border-0 text-xs font-normal shrink-0">
                                {(p.mappings as ColumnMapping[])?.length ?? 0} polí
                            </Badge>
                        </div>
                        {p.note && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.note}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                            Upraveno: {fmt(p.updatedAt)} · {p.createdBy}
                        </p>
                    </button>
                ))}
            </div>

            {detail && (
                <ProfileDetail profile={detail} onClose={() => setDetail(null)} />
            )}
        </>
    );
}
