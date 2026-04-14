"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrigadeSheet } from "./brigade-sheet";
import type { BrigadeRow, BrigadeMemberRow } from "@/lib/actions/brigades";
import type { PeriodTab, MemberOption } from "./page";
import { getBrigadeMembers } from "@/lib/actions/brigades";

function fmtDate(iso: string) {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

interface Props {
    periods: PeriodTab[];
    selectedYear: number;
    brigadeYear: number;
    brigades: BrigadeRow[];
    allMembers: MemberOption[];
}

export function BrigadesClient({ periods, selectedYear, brigadeYear, brigades, allMembers }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [pendingYear, setPendingYear] = useState<number | null>(null);

    const [sheetOpen, setSheetOpen]         = useState(false);
    const [editBrigade, setEditBrigade]     = useState<BrigadeRow | null>(null);
    const [sheetMembers, setSheetMembers]   = useState<BrigadeMemberRow[]>([]);
    const [sheetLoading, setSheetLoading]   = useState(false);

    const displayYear = isPending && pendingYear !== null ? pendingYear : selectedYear;

    function navigateYear(year: number) {
        setPendingYear(year);
        startTransition(() => {
            router.push(`/dashboard/brigades?year=${year}`);
        });
    }

    const openNew = useCallback(() => {
        setEditBrigade(null);
        setSheetMembers([]);
        setSheetOpen(true);
    }, []);

    const openDetail = useCallback(async (brigade: BrigadeRow) => {
        setEditBrigade(brigade);
        setSheetOpen(true);
        setSheetLoading(true);
        try {
            const m = await getBrigadeMembers(brigade.id);
            setSheetMembers(m);
        } finally {
            setSheetLoading(false);
        }
    }, []);

    const onSaved = useCallback(() => {
        router.refresh();
    }, [router]);

    return (
        <div className="space-y-4">
            {/* ── Year tabs ── */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
                {periods.map(p => (
                    <button key={p.year}
                        onClick={() => navigateYear(p.year)}
                        className={[
                            "inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold transition-colors shrink-0",
                            p.year === displayYear
                                ? "bg-[#26272b] text-white"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                        ].join(" ")}>
                        {p.year}
                    </button>
                ))}
            </div>

            {/* ── Heading ── */}
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Brigády {brigadeYear}</h1>
                <p className="text-gray-500 mt-0.5 text-sm">
                    Brigády za rok {brigadeYear} — ovlivní příspěvky roku {selectedYear}.
                    Celkem: {brigades.length} brigád, {brigades.reduce((s, b) => s + b.memberCount, 0)} účastí.
                </p>
            </div>

            {/* ── Table ── */}
            <div className={`rounded-xl border bg-white overflow-hidden transition-opacity duration-150 ${isPending ? "opacity-25 pointer-events-none" : ""}`}>
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead className="w-32">Datum</TableHead>
                            <TableHead>Název / popis</TableHead>
                            <TableHead className="hidden md:table-cell">Vedoucí</TableHead>
                            <TableHead className="text-center w-28">Účastníci</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {brigades.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-gray-400 py-10">
                                    Žádné brigády za rok {brigadeYear}
                                </TableCell>
                            </TableRow>
                        )}
                        {brigades.map(b => (
                            <TableRow key={b.id}
                                className="hover:bg-gray-50/60 cursor-pointer"
                                onClick={() => openDetail(b)}>
                                <TableCell className="font-mono text-sm text-gray-700">
                                    {fmtDate(b.date)}
                                </TableCell>
                                <TableCell>
                                    <span className="font-medium text-gray-900">
                                        {b.name ?? <span className="text-gray-400 italic">bez názvu</span>}
                                    </span>
                                    {b.note && (
                                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{b.note}</p>
                                    )}
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-gray-600 text-sm">
                                    {b.leaderName ?? <span className="text-gray-300">—</span>}
                                </TableCell>
                                <TableCell className="text-center">
                                    <Badge className="bg-green-100 text-green-700 border-0 font-semibold">
                                        {b.memberCount}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* FAB mobile */}
            <button onClick={openNew}
                className="md:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#327600] text-white text-2xl shadow-lg flex items-center justify-center active:scale-95 transition-transform">
                +
            </button>
            <div className="hidden md:flex justify-end">
                <Button onClick={openNew} size="sm" className="bg-[#327600] hover:bg-[#2a6400]">
                    + Nová brigáda
                </Button>
            </div>

            <BrigadeSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                brigade={editBrigade}
                members={sheetMembers}
                membersLoading={sheetLoading}
                allMembers={allMembers}
                brigadeYear={brigadeYear}
                onSaved={onSaved}
            />
        </div>
    );
}
