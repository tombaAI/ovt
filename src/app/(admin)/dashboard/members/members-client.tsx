"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MemberSheet } from "./member-sheet";
import type { MemberWithFlags, PeriodTab } from "./page";

type FilterKey = "all" | "committee" | "tom" | "individual" | "partial" | "review" | "todo";
type SortKey   = "firstName" | "lastName";

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all",        label: "Všichni"            },
    { key: "committee",  label: "Výbor"              },
    { key: "tom",        label: "Vedoucí TOM"        },
    { key: "individual", label: "Individuální sleva" },
    { key: "partial",    label: "Část roku"          },
    { key: "review",     label: "Ke kontrole"        },
    { key: "todo",       label: "S úkolem"           },
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

function MemberBadges({ m }: { m: MemberWithFlags }) {
    return (
        <>
            {m.isCommittee && <Badge className="bg-amber-100 text-amber-700 border-0 text-xs font-normal">Výbor</Badge>}
            {m.isTom       && <Badge className="bg-blue-100 text-blue-700 border-0 text-xs font-normal">TOM</Badge>}
            {m.discountIndividual !== null && (
                <Badge className="bg-purple-100 text-purple-700 border-0 text-xs font-normal">
                    Sleva {Math.abs(m.discountIndividual)} Kč
                </Badge>
            )}
            {m.fromDate && (
                <Badge className="bg-green-100 text-green-700 border-0 text-xs font-normal">
                    od {fmtDate(m.fromDate)}
                </Badge>
            )}
            {m.toDate && (
                <Badge className="bg-orange-100 text-orange-700 border-0 text-xs font-normal">
                    do {fmtDate(m.toDate)}
                </Badge>
            )}
            {!m.membershipReviewed && (
                <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-200 text-xs font-normal">
                    Ke kontrole
                </Badge>
            )}
            {m.todoNote && (
                <Badge className="bg-orange-100 text-orange-700 border border-orange-200 text-xs font-normal max-w-[200px] truncate">
                    {m.todoNote}
                </Badge>
            )}
        </>
    );
}

export function MembersClient({ members, periods, selectedYear, periodId, currentYearDiscounts }: Props) {
    const router = useRouter();
    const [filter, setFilter]             = useState<FilterKey>("all");
    const [sort, setSort]                 = useState<SortKey>("firstName");
    const [searchText, setSearchText]     = useState("");
    const [sheetOpen, setSheetOpen]       = useState(false);
    const [editMemberId, setEditMemberId] = useState<number | null>(null);

    const isAllYears = selectedYear === 0;

    const editMember = editMemberId !== null ? (members.find(m => m.id === editMemberId) ?? null) : null;

    const onMemberUpdated = useCallback(() => { router.refresh(); }, [router]);

    function openDetail(m: MemberWithFlags) { setEditMemberId(m.id); setSheetOpen(true); router.refresh(); }
    function openAdd()                       { setEditMemberId(null); setSheetOpen(true); }

    const counts = useMemo(() => ({
        all:        members.length,
        committee:  members.filter(m => m.isCommittee).length,
        tom:        members.filter(m => m.isTom).length,
        individual: members.filter(m => m.discountIndividual !== null).length,
        partial:    members.filter(m => m.fromDate !== null || m.toDate !== null).length,
        review:     members.filter(m => !m.membershipReviewed).length,
        todo:       members.filter(m => m.todoNote !== null).length,
    }), [members]);

    const filtered = useMemo(() => {
        let list: MemberWithFlags[];
        switch (filter) {
            case "committee":  list = members.filter(m => m.isCommittee); break;
            case "tom":        list = members.filter(m => m.isTom); break;
            case "individual": list = members.filter(m => m.discountIndividual !== null); break;
            case "partial":    list = members.filter(m => m.fromDate !== null || m.toDate !== null); break;
            case "review":     list = members.filter(m => !m.membershipReviewed); break;
            case "todo":       list = members.filter(m => m.todoNote !== null); break;
            default:           list = [...members];
        }
        if (searchText.trim()) {
            const q = searchText.trim().toLowerCase();
            list = list.filter(m =>
                m.fullName.toLowerCase().includes(q) ||
                (m.userLogin?.toLowerCase().includes(q) ?? false) ||
                (m.email?.toLowerCase().includes(q) ?? false)
            );
        }
        if (sort === "lastName") {
            list = [...list].sort((a, b) =>
                lastName(a.fullName).localeCompare(lastName(b.fullName), "cs")
            );
        }
        return list;
    }, [members, filter, sort, searchText]);

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
                <button
                    onClick={() => router.push("/dashboard/members?year=all")}
                    className={[
                        "inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold transition-colors shrink-0",
                        isAllYears
                            ? "bg-[#26272b] text-white"
                            : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                    ].join(" ")}>
                    Všichni
                </button>
            </div>

            {/* ── Heading ── */}
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                    {isAllYears ? "Všichni členové" : `Členové ${selectedYear}`}
                </h1>
                <p className="text-gray-500 mt-0.5 text-sm">
                    {members.length} členů
                    {counts.review > 0 && (
                        <span className="ml-2 text-yellow-700 font-medium">· {counts.review} ke kontrole</span>
                    )}
                </p>
            </div>

            {/* ── Text search ── */}
            <Input
                placeholder="Hledat podle jména, loginu nebo e-mailu…"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="max-w-sm"
            />

            {/* ── Filter + sort pills ── */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-none">
                {FILTERS.filter(f => !isAllYears || ["all", "review", "todo"].includes(f.key)).map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={[
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0",
                            filter === f.key
                                ? f.key === "review" ? "bg-yellow-500 text-white"
                                  : f.key === "todo" ? "bg-orange-500 text-white"
                                  : "bg-[#327600] text-white"
                                : f.key === "review" && counts.review > 0
                                    ? "bg-yellow-50 text-yellow-700 border border-yellow-300 hover:bg-yellow-100"
                                : f.key === "todo" && counts.todo > 0
                                    ? "bg-orange-50 text-orange-700 border border-orange-300 hover:bg-orange-100"
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
                        <div className="flex flex-wrap gap-1 mt-2">
                            {isAllYears
                                ? m.memberYears?.map(y => (
                                    <Badge key={y} className="bg-gray-100 text-gray-600 border-0 text-xs font-normal">{y}</Badge>
                                ))
                                : <MemberBadges m={m} />
                            }
                        </div>
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
                            <TableHead>{isAllYears ? "Roky" : "Role / členství"}</TableHead>
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
                                    <div className="flex flex-wrap gap-1">
                                        {isAllYears
                                            ? m.memberYears?.map(y => (
                                                <Badge key={y} className="bg-gray-100 text-gray-600 border-0 text-xs font-normal">{y}</Badge>
                                            ))
                                            : <MemberBadges m={m} />
                                        }
                                    </div>
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
                selectedYear={selectedYear}
                periodId={periodId}
                currentYearDiscounts={currentYearDiscounts}
                onMemberUpdated={onMemberUpdated}
            />
        </div>
    );
}
