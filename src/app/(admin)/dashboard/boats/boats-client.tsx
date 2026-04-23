"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BoatSheet } from "./boat-sheet";
import { fmtBoatLocation } from "@/lib/boats-utils";
import type { BoatRow } from "@/lib/actions/boats";
import type { MemberOption } from "./page";

const GRID_FILTERS = [
    { label: "Všechny", value: null },
    { label: "Mříž 1",  value: "1" },
    { label: "Mříž 2",  value: "2" },
    { label: "Mříž 3",  value: "3" },
    { label: "Dlouhé",  value: "dlouhé" },
    { label: "Neznámé", value: "" },            // grid === null
    { label: "Chybí",   value: "__missing__" }, // is_present = false
] as const;

type GridFilter = typeof GRID_FILTERS[number]["value"];
type ExtraFilter = "todo" | "unreviewed" | null;

interface Props {
    boats: BoatRow[];
    allMembers: MemberOption[];
    includeArchived: boolean;
}

export function BoatsClient({ boats, allMembers, includeArchived }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [gridFilter, setGridFilter]   = useState<GridFilter>(null);
    const [extraFilter, setExtraFilter] = useState<ExtraFilter>(null);
    const [sheetOpen, setSheetOpen]     = useState(false);
    const [editBoat, setEditBoat]       = useState<BoatRow | null>(null);

    function toggleArchived() {
        startTransition(() => {
            router.push(`/dashboard/boats${includeArchived ? "" : "?archived=1"}`);
        });
    }

    const openNew = useCallback(() => {
        setEditBoat(null);
        setSheetOpen(true);
    }, []);

    const openDetail = useCallback((boat: BoatRow) => {
        setEditBoat(boat);
        setSheetOpen(true);
    }, []);

    const onSaved = useCallback(() => {
        router.refresh();
    }, [router]);

    const filtered = boats.filter(b => {
        const gridOk = gridFilter === null ? true
            : gridFilter === "__missing__" ? !b.isPresent
            : gridFilter === "" ? b.grid === null
            : b.grid === gridFilter;
        const extraOk = extraFilter === null ? true
            : extraFilter === "todo" ? Boolean(b.todoNote)
            : !b.reviewed;
        return gridOk && extraOk;
    });

    const todoCount       = boats.filter(b => Boolean(b.todoNote)).length;
    const unreviewedCount = boats.filter(b => !b.reviewed).length;
    const missingCount    = boats.filter(b => !b.isPresent).length;

    return (
        <div className="space-y-4">
            {/* ── Heading ── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">
                        Lodě v krakorcích {includeArchived ? "— archiv" : ""}
                    </h1>
                    <p className="text-gray-500 mt-0.5 text-sm">
                        {includeArchived
                            ? `${boats.length} archivovaných lodí`
                            : `${boats.length} aktivních lodí${missingCount > 0 ? `, ${missingCount} fyzicky chybí` : ""}`
                        }
                    </p>
                </div>
                <button
                    onClick={toggleArchived}
                    className="text-sm text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors shrink-0 mt-1">
                    {includeArchived ? "← Aktivní" : "Archiv"}
                </button>
            </div>

            {/* ── Filter pills ── */}
            <div className="flex gap-2 flex-wrap">
                {GRID_FILTERS.map(f => {
                    const count = f.value === null
                        ? boats.length
                        : f.value === "__missing__"
                            ? boats.filter(b => !b.isPresent).length
                            : f.value === ""
                                ? boats.filter(b => b.grid === null).length
                                : boats.filter(b => b.grid === f.value).length;

                    if (count === 0 && f.value !== null) return null;

                    return (
                        <button
                            key={String(f.value)}
                            onClick={() => setGridFilter(f.value)}
                            className={[
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                                gridFilter === f.value
                                    ? "bg-[#26272b] text-white"
                                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                            ].join(" ")}>
                            {f.label}
                            <span className={[
                                "text-xs font-semibold",
                                gridFilter === f.value ? "text-white/70" : "text-gray-400",
                            ].join(" ")}>
                                {count}
                            </span>
                        </button>
                    );
                })}

                {/* Extra filtry: úkol + bez revize */}
                {todoCount > 0 && (
                    <button
                        onClick={() => setExtraFilter(extraFilter === "todo" ? null : "todo")}
                        className={[
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                            extraFilter === "todo"
                                ? "bg-orange-500 text-white"
                                : "bg-orange-50 text-orange-700 border border-orange-300 hover:bg-orange-100",
                        ].join(" ")}>
                        S úkolem
                        <span className={`text-xs font-semibold ${extraFilter === "todo" ? "text-white/70" : "text-orange-500"}`}>
                            {todoCount}
                        </span>
                    </button>
                )}
                {unreviewedCount > 0 && (
                    <button
                        onClick={() => setExtraFilter(extraFilter === "unreviewed" ? null : "unreviewed")}
                        className={[
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                            extraFilter === "unreviewed"
                                ? "bg-violet-600 text-white"
                                : "bg-violet-50 text-violet-700 border border-violet-300 hover:bg-violet-100",
                        ].join(" ")}>
                        Bez revize
                        <span className={`text-xs font-semibold ${extraFilter === "unreviewed" ? "text-white/70" : "text-violet-500"}`}>
                            {unreviewedCount}
                        </span>
                    </button>
                )}
            </div>

            {/* ── Table ── */}
            <div className={`rounded-xl border bg-white overflow-hidden transition-opacity duration-150 ${isPending ? "opacity-25 pointer-events-none" : ""}`}>
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead className="w-32">Umístění</TableHead>
                            <TableHead>Majitel</TableHead>
                            <TableHead className="hidden sm:table-cell">Popis</TableHead>
                            <TableHead className="hidden md:table-cell w-24">Barva</TableHead>
                            <TableHead className="hidden lg:table-cell w-36">Příspěvky</TableHead>
                            <TableHead className="w-24 text-center">Přítomna</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-gray-400 py-10">
                                    Žádné lodě
                                </TableCell>
                            </TableRow>
                        )}
                        {filtered.map(b => (
                            <TableRow
                                key={b.id}
                                className="hover:bg-gray-50/60 cursor-pointer"
                                onClick={() => openDetail(b)}>
                                <TableCell className="font-mono text-sm text-gray-700 whitespace-nowrap">
                                    {fmtBoatLocation(b.grid, b.position)}
                                </TableCell>
                                <TableCell>
                                    <span className="font-medium text-gray-900">
                                        {b.ownerName ?? <span className="text-gray-400 italic">bez majitele</span>}
                                    </span>
                                    {b.note && (
                                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{b.note}</p>
                                    )}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell text-gray-600 text-sm">
                                    {b.description ?? <span className="text-gray-300">—</span>}
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-gray-600 text-sm">
                                    {b.color ?? <span className="text-gray-300">—</span>}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                    {b.ownerId ? (
                                        <div className="flex gap-1">
                                            {[2024, 2025, 2026].map(yr => (
                                                <span
                                                    key={yr}
                                                    className={[
                                                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none",
                                                        b.contribYears.includes(yr)
                                                            ? "bg-green-100 text-green-700"
                                                            : "bg-gray-100 text-gray-400",
                                                    ].join(" ")}>
                                                    {yr}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-gray-300 text-xs">—</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-center">
                                    {b.isPresent ? (
                                        <Badge className="bg-green-100 text-green-700 border-0 text-xs">ano</Badge>
                                    ) : (
                                        <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">chybí</Badge>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* FAB mobile */}
            {!includeArchived && (
                <>
                    <button
                        onClick={openNew}
                        className="md:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#327600] text-white text-2xl shadow-lg flex items-center justify-center active:scale-95 transition-transform">
                        +
                    </button>
                    <div className="hidden md:flex justify-end">
                        <Button onClick={openNew} size="sm" className="bg-[#327600] hover:bg-[#2a6400]">
                            + Přidat loď
                        </Button>
                    </div>
                </>
            )}

            <BoatSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                boat={editBoat}
                allMembers={allMembers}
                onSaved={onSaved}
            />
        </div>
    );
}
