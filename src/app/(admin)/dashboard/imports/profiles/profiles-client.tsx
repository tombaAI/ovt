"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { deleteImportProfile, saveImportProfile } from "@/lib/actions/import";
import { IMPORTABLE_FIELDS } from "@/lib/import/types";
import type { ColumnMapping, MatchKeyConfig } from "@/lib/import/types";

type Profile = {
    id: number;
    name: string;
    note: string | null;
    fileFormat: string;
    delimiter: string | null;
    encoding: string | null;
    headerRowIndex: number;
    matchKeys: unknown;
    mappings: unknown;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
};

function fmt(d: Date) {
    return new Date(d).toLocaleDateString("cs-CZ");
}

function ProfileDetail({ profile, onClose, onDeleted }: {
    profile: Profile;
    onClose: () => void;
    onDeleted: () => void;
}) {
    const [pending, startTransition] = useTransition();
    const [editMode, setEditMode]    = useState(false);
    const [name, setName]            = useState(profile.name);
    const [note, setNote]            = useState(profile.note ?? "");
    const [saveError, setSaveError]  = useState<string | null>(null);
    const router = useRouter();

    const mappings  = (profile.mappings  as ColumnMapping[]  ) ?? [];
    const matchKeys = (profile.matchKeys as MatchKeyConfig[]) ?? [];

    function doDelete() {
        if (!confirm(`Smazat profil „${profile.name}"?`)) return;
        startTransition(async () => {
            const r = await deleteImportProfile(profile.id);
            if ("error" in r) { alert(r.error); return; }
            onDeleted();
        });
    }

    function doSave() {
        if (!name.trim()) { setSaveError("Název je povinný"); return; }
        startTransition(async () => {
            const r = await saveImportProfile({
                name: name.trim(),
                note: note.trim() || null,
                delimiter: profile.delimiter,
                encoding: profile.encoding,
                headerRowIndex: profile.headerRowIndex,
                matchKeys,
                mappings,
            }, profile.id);
            if ("error" in r) { setSaveError(r.error); return; }
            setEditMode(false);
            router.refresh();
        });
    }

    return (
        <Sheet open onOpenChange={open => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto px-5 pb-8">
                <SheetHeader className="px-0 pt-5 pb-4">
                    <SheetTitle>
                        {editMode ? (
                            <Input value={name} onChange={e => setName(e.target.value)}
                                className="text-base font-semibold h-8" />
                        ) : profile.name}
                    </SheetTitle>
                </SheetHeader>

                <div className="space-y-5">
                    {/* Poznámka */}
                    <div className="space-y-1.5">
                        <Label>Poznámka</Label>
                        {editMode ? (
                            <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
                                placeholder="Kde soubor stáhnout, v jakém formátu…" />
                        ) : (
                            <p className="text-sm text-muted-foreground">{profile.note ?? "—"}</p>
                        )}
                    </div>

                    {/* Meta */}
                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                        <span>Kódování: <strong className="text-foreground">{profile.encoding ?? "auto"}</strong></span>
                        <span>Oddělovač: <strong className="text-foreground">{profile.delimiter ?? "auto"}</strong></span>
                        <span>Řádek hlavičky: <strong className="text-foreground">{profile.headerRowIndex + 1}</strong></span>
                        <span>Vytvořen: <strong className="text-foreground">{fmt(profile.createdAt)}</strong></span>
                    </div>

                    {/* Párovací klíče */}
                    <div>
                        <p className="text-sm font-semibold mb-2">Párovací klíče</p>
                        {matchKeys.length === 0 ? (
                            <p className="text-sm text-muted-foreground">—</p>
                        ) : (
                            <div className="flex gap-2 flex-wrap">
                                {matchKeys.map(mk => (
                                    <Badge key={mk.targetField} className="bg-sky-100 text-sky-800 border-0">
                                        {IMPORTABLE_FIELDS[mk.targetField]} ← {mk.sourceCol}
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
                                            <th className="text-left px-3 py-2">Pole v DB</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mappings.map(m => (
                                            <tr key={m.sourceCol} className="border-b last:border-0">
                                                <td className="px-3 py-1.5 font-mono text-xs">{m.sourceCol}</td>
                                                <td className="px-3 py-1.5">{IMPORTABLE_FIELDS[m.targetField]}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {saveError && <p className="text-sm text-red-600">{saveError}</p>}

                    {/* Akce */}
                    <div className="flex gap-3 pt-2">
                        {editMode ? (
                            <>
                                <Button onClick={doSave} disabled={pending} className="bg-[#327600] hover:bg-[#2a6400]">
                                    {pending ? "Ukládám…" : "Uložit"}
                                </Button>
                                <Button variant="outline" onClick={() => { setEditMode(false); setName(profile.name); setNote(profile.note ?? ""); }}>
                                    Zrušit
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" onClick={() => setEditMode(true)}>Upravit</Button>
                                <Button variant="outline" onClick={doDelete} disabled={pending}
                                    className="text-red-600 border-red-200 hover:bg-red-50">
                                    Smazat
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export function ProfilesClient({ profiles }: { profiles: Profile[] }) {
    const [detail, setDetail] = useState<Profile | null>(null);
    const router = useRouter();

    if (profiles.length === 0) {
        return (
            <div className="rounded-xl border px-6 py-10 text-center text-sm text-muted-foreground">
                Zatím žádná uložená mapování. Vytvořte je při dokončení importu.
            </div>
        );
    }

    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2">
                {profiles.map(p => (
                    <button key={p.id} onClick={() => setDetail(p)}
                        className="text-left rounded-xl border px-4 py-3 hover:bg-gray-50 transition-colors group">
                        <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm">{p.name}</p>
                            <Badge className="bg-gray-100 text-gray-500 border-0 text-xs font-normal shrink-0">
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
                <ProfileDetail
                    profile={detail}
                    onClose={() => setDetail(null)}
                    onDeleted={() => { setDetail(null); router.refresh(); }}
                />
            )}
        </>
    );
}
