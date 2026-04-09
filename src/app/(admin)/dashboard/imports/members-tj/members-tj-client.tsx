"use client";

import { useTransition, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { importFromTj, updateMemberFieldFromTj, deleteImportRow } from "@/lib/actions/sync";
import type { UnmatchedRow, MatchedRow, OnlyOursRow, FieldDiff } from "./page";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: string | null): string {
    return v ?? "—";
}

function fmtDate(v: string | null): string {
    if (!v) return "—";
    return new Date(v).toLocaleDateString("cs-CZ");
}

// ── DiffSheet ─────────────────────────────────────────────────────────────────

function DiffSheet({ row, onClose }: { row: MatchedRow; onClose: () => void }) {
    const [pending, startTransition] = useTransition();
    const [done, setDone] = useState<Set<string>>(new Set());

    function applyField(diff: FieldDiff) {
        startTransition(async () => {
            const res = await updateMemberFieldFromTj(row.memberId, diff.field, diff.tjValue);
            if ("success" in res) setDone(prev => new Set([...prev, diff.field]));
        });
    }

    const remaining = row.diffs.filter(d => !done.has(d.field));

    return (
        <Sheet open onOpenChange={open => !open && onClose()}>
            <SheetContent className="sm:max-w-2xl px-5 pb-8">
                <SheetHeader className="px-0 pt-5 pb-4">
                    <SheetTitle>{row.firstName} {row.lastName}</SheetTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                        {row.cskNumber
                            ? <p className="text-sm text-muted-foreground">ČSK {row.cskNumber}</p>
                            : <p className="text-sm text-muted-foreground">Bez ČSK čísla</p>
                        }
                        {row.matchedByName && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                párováno podle jména
                            </span>
                        )}
                    </div>
                </SheetHeader>

                {remaining.length === 0 ? (
                    <p className="text-sm text-[#327600] font-medium mt-4">Vše synchronizováno.</p>
                ) : (
                    <div className="border rounded-md overflow-hidden mt-2">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/50 border-b">
                                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">Pole</th>
                                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Naše DB</th>
                                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">TJ Bohemians</th>
                                    <th className="w-16" />
                                </tr>
                            </thead>
                            <tbody>
                                {remaining.map(diff => (
                                    <tr key={diff.field} className="border-b last:border-0 hover:bg-muted/30">
                                        <td className="px-3 py-2.5 text-muted-foreground font-medium">{diff.label}</td>
                                        <td className="px-3 py-2.5 text-foreground/60">{fmt(diff.ourValue)}</td>
                                        <td className="px-3 py-2.5 font-medium">{fmt(diff.tjValue)}</td>
                                        <td className="px-3 py-2.5 text-right">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs"
                                                disabled={pending}
                                                onClick={() => applyField(diff)}
                                            >
                                                ← Použít
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

// ── DeleteImportButton ────────────────────────────────────────────────────────

function DeleteImportButton({ tjId }: { tjId: number }) {
    const [pending, startTransition] = useTransition();
    const [done, setDone] = useState(false);

    if (done) return <span className="text-xs text-muted-foreground">Odstraněno</span>;

    function handleDelete() {
        startTransition(async () => {
            const res = await deleteImportRow(tjId);
            if ("success" in res) setDone(true);
        });
    }

    return (
        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" disabled={pending} onClick={handleDelete}>
            {pending ? "…" : "Odstranit"}
        </Button>
    );
}

// ── ImportButton ──────────────────────────────────────────────────────────────

function ImportButton({ tjId }: { tjId: number }) {
    const [pending, startTransition] = useTransition();
    const [done, setDone] = useState(false);

    if (done) return <span className="text-xs text-[#327600] font-medium">Importováno</span>;

    function handleImport() {
        startTransition(async () => {
            const res = await importFromTj(tjId);
            if ("success" in res) setDone(true);
        });
    }

    return (
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={handleImport}>
            {pending ? "Importuji…" : "Import"}
        </Button>
    );
}

// ── Hlavní komponent ──────────────────────────────────────────────────────────

export function MembersTjClient({ unmatched, matched, onlyOurs }: {
    unmatched: UnmatchedRow[];
    matched:   MatchedRow[];
    onlyOurs:  OnlyOursRow[];
}) {
    const [diffRow, setDiffRow] = useState<MatchedRow | null>(null);

    return (
        <>
            <Tabs defaultValue="unmatched">
                <TabsList>
                    <TabsTrigger value="unmatched" className="gap-2">
                        K importu
                        {unmatched.length > 0 && <Badge variant="secondary">{unmatched.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="diffs" className="gap-2">
                        Odlišnosti
                        {matched.length > 0 && <Badge variant="secondary">{matched.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="onlyours" className="gap-2">
                        Jen v naší DB
                        {onlyOurs.length > 0 && <Badge variant="secondary">{onlyOurs.length}</Badge>}
                    </TabsTrigger>
                </TabsList>

                {/* ── K importu ──────────────────────────────────────────── */}
                <TabsContent value="unmatched" className="mt-4">
                    {unmatched.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">Všichni členové z TJ jsou již v naší DB.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted/50 border-b">
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Jméno</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">ČSK</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden lg:table-cell">Člen od</th>
                                        <th className="w-24" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {unmatched.map(row => (
                                        <tr key={row.tjId} className="border-b last:border-0 hover:bg-muted/30">
                                            <td className="px-3 py-2.5 font-medium">
                                                {[row.jmeno, row.prijmeni].filter(Boolean).join(" ") || "—"}
                                            </td>
                                            <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{fmt(row.cskNumber)}</td>
                                            <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{fmt(row.email)}</td>
                                            <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell">{fmtDate(row.radekOdeslan)}</td>
                                            <td className="px-3 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <DeleteImportButton tjId={row.tjId} />
                                                    <ImportButton tjId={row.tjId} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </TabsContent>

                {/* ── Odlišnosti ─────────────────────────────────────────── */}
                <TabsContent value="diffs" className="mt-4">
                    {matched.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">Žádné rozdíly — data jsou v souladu.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted/50 border-b">
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Člen</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">ČSK</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Rozdíly</th>
                                        <th className="w-24" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {matched.map(row => (
                                        <tr key={row.memberId} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                                            onClick={() => setDiffRow(row)}>
                                            <td className="px-3 py-2.5 font-medium">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {row.firstName} {row.lastName}
                                                    {row.matchedByName && (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                                            párováno jménem
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{row.cskNumber ?? "—"}</td>
                                            <td className="px-3 py-2.5">
                                                <div className="flex flex-wrap gap-1">
                                                    {row.diffs.map(d => (
                                                        <Badge key={d.field} variant="outline" className="text-xs font-normal">
                                                            {d.label}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                <Button size="sm" variant="ghost" className="h-7 text-xs">Zobrazit</Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </TabsContent>

                {/* ── Jen v naší DB ──────────────────────────────────────── */}
                <TabsContent value="onlyours" className="mt-4">
                    {onlyOurs.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">Všichni naši členové s ČSK číslem jsou i v TJ evidenci.</p>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground mb-3">
                                Tito členové mají ČSK číslo v naší DB, ale nejsou ve zdrojovém Excelu TJ. Žádná akce není vyžadována.
                            </p>
                            <div className="border rounded-md overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-muted/50 border-b">
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Člen</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">ČSK</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {onlyOurs.map(row => (
                                            <tr key={row.id} className="border-b last:border-0">
                                                <td className="px-3 py-2.5">{row.firstName} {row.lastName}</td>
                                                <td className="px-3 py-2.5 text-muted-foreground">{row.cskNumber}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </TabsContent>
            </Tabs>

            {diffRow && <DiffSheet row={diffRow} onClose={() => setDiffRow(null)} />}
        </>
    );
}
