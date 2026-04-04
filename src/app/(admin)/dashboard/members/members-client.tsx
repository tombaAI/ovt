"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { MemberSheet } from "./member-sheet";
import type { MemberWithFlags } from "./page";

type FilterKey = "active" | "inactive" | "all" | "committee" | "tom" | "individual";

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "active",     label: "Aktivní"            },
    { key: "committee",  label: "Výbor"              },
    { key: "tom",        label: "Vedoucí TOM"        },
    { key: "individual", label: "Individuální sleva"  },
    { key: "inactive",   label: "Neaktivní"          },
    { key: "all",        label: "Všichni"            },
];

interface Props {
    members: MemberWithFlags[];
    currentYearDiscounts: { committee: number; tom: number } | null;
}

function RoleBadges({ m }: { m: MemberWithFlags }) {
    return (
        <>
            {m.isCommittee && (
                <Badge className="bg-amber-100 text-amber-700 border-0 text-xs font-normal">Výbor</Badge>
            )}
            {m.isTom && (
                <Badge className="bg-blue-100 text-blue-700 border-0 text-xs font-normal">TOM</Badge>
            )}
            {m.discountIndividual !== null && (
                <Badge className="bg-purple-100 text-purple-700 border-0 text-xs font-normal">
                    Sleva {Math.abs(m.discountIndividual)} Kč
                </Badge>
            )}
        </>
    );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
    return isActive
        ? <Badge className="bg-[#327600]/10 text-[#327600] border-0 text-xs font-normal">Aktivní</Badge>
        : <Badge variant="secondary" className="text-xs font-normal">Neaktivní</Badge>;
}

export function MembersClient({ members, currentYearDiscounts }: Props) {
    const [filter, setFilter]         = useState<FilterKey>("active");
    const [sheetOpen, setSheetOpen]   = useState(false);
    const [editMember, setEditMember] = useState<MemberWithFlags | null>(null);

    const counts = useMemo(() => ({
        active:     members.filter(m => m.isActive).length,
        inactive:   members.filter(m => !m.isActive).length,
        all:        members.length,
        committee:  members.filter(m => m.isCommittee).length,
        tom:        members.filter(m => m.isTom).length,
        individual: members.filter(m => m.discountIndividual !== null).length,
    }), [members]);

    const filtered = useMemo(() => {
        switch (filter) {
            case "active":     return members.filter(m => m.isActive);
            case "inactive":   return members.filter(m => !m.isActive);
            case "committee":  return members.filter(m => m.isCommittee);
            case "tom":        return members.filter(m => m.isTom);
            case "individual": return members.filter(m => m.discountIndividual !== null);
            default:           return members;
        }
    }, [members, filter]);

    function openEdit(m: MemberWithFlags) { setEditMember(m); setSheetOpen(true); }
    function openAdd()                    { setEditMember(null); setSheetOpen(true); }

    return (
        <div className="space-y-3">

            {/* Filter pills — horizontal scroll on mobile */}
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
            </div>

            {/* ── Mobile: card list ─────────────────────────────────── */}
            <div className="md:hidden space-y-2">
                {filtered.length === 0 && (
                    <div className="text-center text-gray-400 py-12 text-sm">
                        Žádní členové pro tento filtr
                    </div>
                )}
                {filtered.map(m => (
                    <button key={m.id} onClick={() => openEdit(m)}
                        className="w-full text-left bg-white rounded-xl border border-gray-200 p-3.5 active:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="font-medium text-gray-900 leading-snug">{m.fullName}</p>
                                {(m.email || m.userLogin) && (
                                    <p className="text-sm text-gray-500 mt-0.5 truncate">
                                        {m.email ?? m.userLogin}
                                    </p>
                                )}
                            </div>
                            <StatusBadge isActive={m.isActive} />
                        </div>
                        {(m.isCommittee || m.isTom || m.discountIndividual !== null) && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                <RoleBadges m={m} />
                            </div>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Desktop: table ────────────────────────────────────── */}
            <div className="hidden md:block rounded-xl border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead className="w-12 text-center">ID</TableHead>
                            <TableHead>Jméno</TableHead>
                            <TableHead>Login</TableHead>
                            <TableHead className="hidden lg:table-cell">E-mail</TableHead>
                            <TableHead className="hidden xl:table-cell text-right">VS</TableHead>
                            <TableHead>Role / sleva</TableHead>
                            <TableHead className="text-center">Stav</TableHead>
                            <TableHead className="w-20" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center text-gray-400 py-10">
                                    Žádní členové pro tento filtr
                                </TableCell>
                            </TableRow>
                        )}
                        {filtered.map(m => (
                            <TableRow key={m.id} className="hover:bg-gray-50/60">
                                <TableCell className="text-center text-gray-400 text-xs font-mono">{m.id}</TableCell>
                                <TableCell className="font-medium">{m.fullName}</TableCell>
                                <TableCell className="text-gray-500 text-sm">{m.userLogin ?? "—"}</TableCell>
                                <TableCell className="hidden lg:table-cell text-gray-500 text-sm">{m.email ?? "—"}</TableCell>
                                <TableCell className="hidden xl:table-cell text-right font-mono text-sm text-gray-500">
                                    {m.variableSymbol ?? "—"}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1"><RoleBadges m={m} /></div>
                                </TableCell>
                                <TableCell className="text-center"><StatusBadge isActive={m.isActive} /></TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="sm"
                                        className="text-gray-400 hover:text-gray-700 h-7 px-2"
                                        onClick={() => openEdit(m)}>
                                        Upravit
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* FAB — mobile only */}
            <button onClick={openAdd}
                className="md:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#327600] text-white text-2xl shadow-lg flex items-center justify-center active:scale-95 transition-transform">
                +
            </button>

            {/* Desktop add button */}
            <div className="hidden md:flex justify-end -mt-1">
                <Button onClick={openAdd} size="sm" className="bg-[#327600] hover:bg-[#2a6400]">
                    + Přidat člena
                </Button>
            </div>

            <MemberSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                member={editMember}
                currentYearDiscounts={currentYearDiscounts}
            />
        </div>
    );
}
