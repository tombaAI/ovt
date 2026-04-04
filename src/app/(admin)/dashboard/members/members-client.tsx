"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MemberSheet } from "./member-sheet";
import type { MemberWithFlags, PeriodTab } from "./page";

type FilterKey = "all" | "committee" | "tom" | "individual" | "new" | "left";
type SortKey   = "firstName" | "lastName";

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all",        label: "Všichni"            },
    { key: "committee",  label: "Výbor"              },
    { key: "tom",        label: "Vedoucí TOM"        },
    { key: "individual", label: "Individuální sleva" },
    { key: "new",        label: "Noví"               },
    { key: "left",       label: "Ukončili"           },
];

function lastName(fullName: string) {
    const parts = fullName.trim().split(/\s+/);
    return parts.at(-1) ?? fullName;
}

function fmtDate(iso: string) {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

interface Props {
    members: MemberWithFlags[];
    periods: PeriodTab[];
    selectedYear: number;
    periodId: number | null;
    currentYearDiscounts: { committee: number; tom: number } | null;
}

function RoleBadges({ m }: { m: MemberWithFlags }) {
    return (
        <>
            {m.isCommittee && <Badge className="bg-amber-100 text-amber-700 border-0 text-xs font-normal">Výbor</Badge>}
            {m.isTom       && <Badge className="bg-blue-100 text-blue-700 border-0 text-xs font-normal">TOM</Badge>}
            {m.discountIndividual !== null && (
                <Badge className="bg-purple-100 text-purple-700 border-0 text-xs font-normal">
                    Sleva {Math.abs(m.discountIndividual)} Kč
                </Badge>
            )}
            {m.joinedAt && (
                <Badge className="bg-green-100 text-green-700 border-0 text-xs font-normal">
                    Nový od {fmtDate(m.joinedAt)}
                </Badge>
            )}
            {m.leftAt && (
                <Badge className="bg-red-100 text-red-700 border-0 text-xs font-normal">
                    Ukončil {fmtDate(m.leftAt)}
                </Badge>
            )}
        </>
    );
}

export function MembersClient({ members, periods, selectedYear, periodId, currentYearDiscounts }: Props) {
    const router = useRouter();
    const [filter, setFilter]           = useState<FilterKey>("all");
    const [sort, setSort]               = useState<SortKey>("firstName");
    const [sheetOpen, setSheetOpen]     = useState(false);
    const [editMemberId, setEditMemberId] = useState<number | null>(null);

    const editMember = editMemberId !== null ? (members.find(m => m.id === editMemberId) ?? null) : null;

    const onMemberUpdated = useCallback(() => { router.refresh(); }, [router]);

    function openDetail(m: MemberWithFlags) { setEditMemberId(m.id); setSheetOpen(true); router.refresh(); }
    function openAdd()                       { setEditMemberId(null); setSheetOpen(true); }

    const counts = useMemo(() => ({
        all:        members.length,
        committee:  members.filter(m => m.isCommittee).length,
        tom:        members.filter(m => m.isTom).length,
        individual: members.filter(m => m.discountIndividual !== null).length,
        new:        members.filter(m => m.joinedAt !== null).length,
        left:       members.filter(m => m.leftAt !== null).length,
    }), [members]);

    const filtered = useMemo(() => {
        let list: MemberWithFlags[];
        switch (filter) {
            case "committee":  list = members.filter(m => m.isCommittee); break;
            case "tom":        list = members.filter(m => m.isTom); break;
            case "individual": list = members.filter(m => m.discountIndividual !== null); break;
            case "new":        list = members.filter(m => m.joinedAt !== null); break;
            case "left":       list = members.filter(m => m.leftAt !== null); break;
            default:           list = [...members];
        }
        if (sort === "lastName") {
            list = [...list].sort((a, b) =>
                lastName(a.fullName).localeCompare(lastName(b.fullName), "cs")
            );
        }
        return list;
    }, [members, filter, sort]);

    return (
        <div className="space-y-4">
            {/* ── Year tabs ── */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
                {periods.map(p => (
                    <button key={p.year}
                        onClick={() => router.push(`/dashboard/members?year=${p.year}`)}
                        className={[
                            "inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold transition-colors shrink-0",
                            p.year === selectedYear
                                ? "bg-[#26272b] text-white"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                        ].join(" ")}>
                        {p.year}
                    </button>
                ))}
            </div>

            {/* ── Heading ── */}
            <div className="flex items-baseline justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Členové {selectedYear}</h1>
                    <p className="text-gray-500 mt-0.5 text-sm">{members.length} členů v tomto roce</p>
                </div>
            </div>

            {/* ── Filter + sort pills ── */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-none">
                {FILTERS.map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={[
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0",
                            filter === f.key
                                ? "bg-[#327600] text-white"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                        ].join(" ")}>
                        {f.label}
                        <span className={[
                            "text-xs rounded-full px-1.5",
                            filter === f.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
                        ].join(" ")}>
                            {counts[f.key]}
                        </span>
                    </button>
                ))}

                <div className="w-px bg-gray-200 shrink-0 mx-1 hidden md:block" />

                {(["firstName", "lastName"] as SortKey[]).map(s => (
                    <button key={s} onClick={() => setSort(s)}
                        className={[
                            "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0",
                            sort === s
                                ? "bg-gray-700 text-white"
                                : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50",
                        ].join(" ")}>
                        {s === "firstName" ? "↑ Jméno" : "↑ Příjmení"}
                    </button>
                ))}
            </div>

            {/* ── Mobile: cards ── */}
            <div className="md:hidden space-y-2">
                {filtered.length === 0 && (
                    <p className="text-center text-gray-400 py-12 text-sm">Žádní členové</p>
                )}
                {filtered.map(m => (
                    <button key={m.id} onClick={() => openDetail(m)}
                        className="w-full text-left bg-white rounded-xl border border-gray-200 p-3.5 active:bg-gray-50 transition-colors">
                        <p className="font-medium text-gray-900 leading-snug">{m.fullName}</p>
                        {m.email && <p className="text-sm text-gray-500 mt-0.5 truncate">{m.email}</p>}
                        {(m.isCommittee || m.isTom || m.discountIndividual !== null || m.joinedAt || m.leftAt) && (
                            <div className="flex flex-wrap gap-1 mt-2"><RoleBadges m={m} /></div>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Desktop: table ── */}
            <div className="hidden md:block rounded-xl border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead className="w-12 text-center">ID</TableHead>
                            <TableHead>Jméno</TableHead>
                            <TableHead className="hidden lg:table-cell">E-mail</TableHead>
                            <TableHead className="hidden xl:table-cell text-right">VS</TableHead>
                            <TableHead>Role / členství</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-gray-400 py-10">
                                    Žádní členové
                                </TableCell>
                            </TableRow>
                        )}
                        {filtered.map(m => (
                            <TableRow key={m.id} className="hover:bg-gray-50/60 cursor-pointer"
                                onClick={() => openDetail(m)}>
                                <TableCell className="text-center text-gray-400 text-xs font-mono">{m.id}</TableCell>
                                <TableCell className="font-medium">{m.fullName}</TableCell>
                                <TableCell className="hidden lg:table-cell text-gray-500 text-sm">{m.email ?? "—"}</TableCell>
                                <TableCell className="hidden xl:table-cell text-right font-mono text-sm text-gray-500">
                                    {m.variableSymbol ?? "—"}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1"><RoleBadges m={m} /></div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* FAB on mobile */}
            <button onClick={openAdd}
                className="md:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#327600] text-white text-2xl shadow-lg flex items-center justify-center active:scale-95 transition-transform">
                +
            </button>
            <div className="hidden md:flex justify-end">
                <Button onClick={openAdd} size="sm" className="bg-[#327600] hover:bg-[#2a6400]">
                    + Přidat člena
                </Button>
            </div>

            <MemberSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                member={editMember}
                periodId={periodId}
                currentYearDiscounts={currentYearDiscounts}
                onMemberUpdated={onMemberUpdated}
            />
        </div>
    );
}
