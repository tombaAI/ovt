"use client";

import { useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SlidersHorizontal, ChevronDown, Plus } from "lucide-react";
import { pushNavStack } from "@/lib/nav-stack";
import { AddMemberSheet } from "./add-member-sheet";
import { useState } from "react";
import type { MemberWithFlags } from "./page";

type FilterKey = "all" | "todo" | "unreviewed";
type SortKey   = "lastName" | "firstName";

function isActive(m: MemberWithFlags, year: number): boolean {
    return m.memberFrom <= `${year}-12-31` &&
        (m.memberTo === null || m.memberTo >= `${year}-01-01`);
}

function fmtDate(iso: string) {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y.slice(2)}`;
}

function contribColor(m: MemberWithFlags): string {
    if (!m.hasContrib) return "bg-gray-100 text-gray-500";
    if (m.isPaid === true)  return "bg-green-100 text-green-700";
    if (m.amountTotal === null) return "bg-gray-100 text-gray-400";
    // isPaid=false means underpaid or overpaid
    if (m.amountTotal !== null && (m.isPaid === false)) return "bg-orange-100 text-orange-700";
    return "bg-gray-100 text-gray-500";
}

function contribLabel(m: MemberWithFlags): string {
    if (!m.hasContrib) return "—";
    if (m.isPaid === true) return "zaplaceno";
    if (m.amountTotal === null) return "bez předpisu";
    return "nedoplatek";
}

function MemberInfoBadges({ m }: { m: MemberWithFlags }) {
    return (
        <div className="flex flex-wrap gap-1">
            {m.isCommittee && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700">Výbor</span>
            )}
            {m.isTom && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">TOM</span>
            )}
            {m.discountIndividual !== null && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                    Sleva {Math.abs(m.discountIndividual)} Kč
                </span>
            )}
            {m.fromDate && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                    vstup {fmtDate(m.fromDate)}
                </span>
            )}
            {m.toDate && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">
                    odchod {fmtDate(m.toDate)}
                </span>
            )}
            {!m.hasBrigade && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-600 border border-red-200">
                    bez brigády
                </span>
            )}
            {m.todoNote && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 border border-orange-200 max-w-[160px] truncate">
                    {m.todoNote}
                </span>
            )}
            {m.hasTjDiffs && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-sky-100 text-sky-700">
                    změny z TJ
                </span>
            )}
        </div>
    );
}

interface Props {
    members: MemberWithFlags[];
    selectedYear: number;
    periodId: number | null;
    currentYearDiscounts: { committee: number; tom: number } | null;
}

export function MembersClient({ members, selectedYear }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [addOpen, setAddOpen] = useState(false);

    // URL-driven state
    const filter   = (searchParams.get("filter")  ?? "all")      as FilterKey;
    const sort     = (searchParams.get("sort")    ?? "lastName")  as SortKey;
    const q        = searchParams.get("q") ?? "";
    const stav     = searchParams.get("stav") ?? "active";          // "active" | "inactive"
    const sleva    = searchParams.get("sleva") ?? "";               // "committee,tom,individual" csv
    const brigada  = searchParams.get("brigada") === "none";
    const castRoku = searchParams.get("cast") === "1";

    const slevaSet = useMemo(() => new Set(sleva ? sleva.split(",") : []), [sleva]);

    function setParam(key: string, value: string | null) {
        const p = new URLSearchParams(searchParams.toString());
        if (value === null || value === "") p.delete(key);
        else p.set(key, value);
        router.replace(`${pathname}?${p.toString()}`);
    }

    function toggleSleva(key: string) {
        const next = new Set(slevaSet);
        if (next.has(key)) next.delete(key); else next.add(key);
        setParam("sleva", [...next].join(",") || null);
    }

    // Active dropdown filter count + label
    const dropdownConditions: string[] = [];
    if (stav === "inactive") dropdownConditions.push("Neaktivní");
    if (slevaSet.has("committee")) dropdownConditions.push("Výbor");
    if (slevaSet.has("tom")) dropdownConditions.push("TOM");
    if (slevaSet.has("individual")) dropdownConditions.push("Individuální");
    if (brigada) dropdownConditions.push("Bez brigády");
    if (castRoku) dropdownConditions.push("Část roku");

    const filtrButtonLabel = dropdownConditions.length === 0
        ? "Filtrovat"
        : dropdownConditions.length === 1
            ? dropdownConditions[0]!
            : `Filtrovat (${dropdownConditions.length})`;

    const hasActiveFilters = filter !== "all" || dropdownConditions.length > 0 || q !== "";

    // Computed list
    const counts = useMemo(() => {
        const active = members.filter(m => isActive(m, selectedYear));
        return {
            all:        active.length,
            todo:       members.filter(m => m.todoNote !== null).length,
            unreviewed: members.filter(m => !m.membershipReviewed).length,
        };
    }, [members, selectedYear]);

    const filtered = useMemo(() => {
        let list: MemberWithFlags[];

        if (filter === "todo") {
            list = members.filter(m => m.todoNote !== null);
        } else if (filter === "unreviewed") {
            list = members.filter(m => !m.membershipReviewed);
        } else {
            // filter === "all"
            if (stav === "inactive") {
                list = members.filter(m => !isActive(m, selectedYear));
            } else {
                list = members.filter(m => isActive(m, selectedYear));
                if (slevaSet.has("committee"))  list = list.filter(m => m.isCommittee);
                if (slevaSet.has("tom"))         list = list.filter(m => m.isTom);
                if (slevaSet.has("individual"))  list = list.filter(m => m.discountIndividual !== null);
                if (brigada)   list = list.filter(m => !m.hasBrigade);
                if (castRoku)  list = list.filter(m => m.fromDate !== null || m.toDate !== null);
            }
        }

        if (q.trim()) {
            const lq = q.trim().toLowerCase();
            list = list.filter(m =>
                `${m.firstName} ${m.lastName}`.toLowerCase().includes(lq) ||
                m.lastName.toLowerCase().includes(lq) ||
                (m.nickname?.toLowerCase().includes(lq) ?? false) ||
                (m.cskNumber?.toLowerCase().includes(lq) ?? false) ||
                (m.userLogin?.toLowerCase().includes(lq) ?? false) ||
                (m.email?.toLowerCase().includes(lq) ?? false)
            );
        }

        return [...list].sort((a, b) =>
            sort === "firstName"
                ? a.firstName.localeCompare(b.firstName, "cs") || a.lastName.localeCompare(b.lastName, "cs")
                : a.lastName.localeCompare(b.lastName, "cs")   || a.firstName.localeCompare(b.firstName, "cs")
        );
    }, [members, filter, sort, q, stav, slevaSet, brigada, castRoku, selectedYear]);

    function openDetail(m: MemberWithFlags) {
        const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
        pushNavStack({ url: currentUrl, label: "Seznam členů" });
        router.push(`/dashboard/members/${m.id}`);
    }

    const pillBase = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 cursor-pointer";
    const pillActive = "bg-[#327600] text-white";
    const pillTodoActive = "bg-orange-500 text-white";
    const pillUnreviewedActive = "bg-violet-600 text-white";
    const pillInactive = "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50";
    const pillTodoInactive = counts.todo > 0 ? "bg-orange-50 text-orange-700 border border-orange-300 hover:bg-orange-100" : pillInactive;
    const pillUnreviewedInactive = counts.unreviewed > 0 ? "bg-violet-50 text-violet-700 border border-violet-300 hover:bg-violet-100" : pillInactive;

    function PillCount({ n }: { n: number }) {
        return <span className="text-xs rounded-full px-1.5 bg-white/25">{n}</span>;
    }

    return (
        <div className="space-y-4">
            {/* ── Header row ── */}
            <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900 mr-1">Členové {selectedYear}</h1>

                {/* Search */}
                <Input
                    placeholder="Hledat…"
                    value={q}
                    onChange={e => setParam("q", e.target.value || null)}
                    className="h-8 w-40 text-sm"
                />

                {/* Badge pills */}
                <button className={`${pillBase} ${filter === "all" ? pillActive : pillInactive}`}
                    onClick={() => setParam("filter", "all")}>
                    Aktivní <PillCount n={counts.all} />
                </button>
                <button className={`${pillBase} ${filter === "todo" ? pillTodoActive : pillTodoInactive}`}
                    onClick={() => setParam("filter", "todo")}>
                    S úkolem <PillCount n={counts.todo} />
                </button>
                <button className={`${pillBase} ${filter === "unreviewed" ? pillUnreviewedActive : pillUnreviewedInactive}`}
                    onClick={() => setParam("filter", "unreviewed")}>
                    Bez revize <PillCount n={counts.unreviewed} />
                </button>

                {/* Filtrovat dropdown */}
                <Popover>
                    <PopoverTrigger asChild>
                        <button className={`${pillBase} ${dropdownConditions.length > 0
                            ? "bg-blue-50 text-blue-700 border border-blue-300"
                            : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"} gap-1`}>
                            <SlidersHorizontal size={13} />
                            {filtrButtonLabel}
                            <ChevronDown size={12} />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-3 space-y-3">
                        {/* Stav */}
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Stav</p>
                            <div className="flex gap-3">
                                {(["active", "inactive"] as const).map(s => (
                                    <label key={s} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                        <input type="radio" name="stav" value={s} checked={stav === s}
                                            onChange={() => setParam("stav", s === "active" ? null : s)}
                                            className="accent-[#327600]" />
                                        {s === "active" ? "Aktivní" : "Neaktivní"}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Sleva */}
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Sleva</p>
                            <div className="space-y-1.5">
                                {([["committee", "Výbor"], ["tom", "Vedoucí TOM"], ["individual", "Individuální"]] as const).map(([key, label]) => (
                                    <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                                        <Checkbox checked={slevaSet.has(key)}
                                            onCheckedChange={() => toggleSleva(key)} id={`sleva-${key}`} />
                                        <Label htmlFor={`sleva-${key}`} className="cursor-pointer">{label}</Label>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Brigáda + Část roku */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                                <Checkbox checked={brigada}
                                    onCheckedChange={v => setParam("brigada", v ? "none" : null)}
                                    id="brigada-none" />
                                <Label htmlFor="brigada-none" className="cursor-pointer">Bez brigády</Label>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                                <Checkbox checked={castRoku}
                                    onCheckedChange={v => setParam("cast", v ? "1" : null)}
                                    id="cast-roku" />
                                <Label htmlFor="cast-roku" className="cursor-pointer">Vstup / ukončení</Label>
                            </label>
                        </div>

                        {dropdownConditions.length > 0 && (
                            <button
                                onClick={() => {
                                    setParam("stav", null);
                                    setParam("sleva", null);
                                    setParam("brigada", null);
                                    setParam("cast", null);
                                }}
                                className="text-xs text-gray-400 hover:text-gray-700 w-full text-left pt-1 border-t border-gray-100">
                                Zrušit filtry dropdownu
                            </button>
                        )}
                    </PopoverContent>
                </Popover>

                {/* Sort */}
                <Popover>
                    <PopoverTrigger asChild>
                        <button className={`${pillBase} bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 gap-1`}>
                            {sort === "lastName" ? "↑ Příjmení" : "↑ Jméno"}
                            <ChevronDown size={12} />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-40 p-2 space-y-0.5">
                        {(["lastName", "firstName"] as SortKey[]).map(s => (
                            <button key={s} onClick={() => setParam("sort", s)}
                                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${sort === s ? "bg-[#327600]/10 text-[#327600] font-medium" : "hover:bg-gray-50"}`}>
                                {s === "lastName" ? "Příjmení" : "Jméno"}
                            </button>
                        ))}
                    </PopoverContent>
                </Popover>

                {hasActiveFilters && (
                    <button onClick={() => router.replace(pathname)}
                        className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1.5 hover:bg-gray-50 rounded transition-colors">
                        × Zrušit vše
                    </button>
                )}

                <div className="ml-auto">
                    <Button size="sm" className="bg-[#327600] hover:bg-[#2a6400] h-8 gap-1"
                        onClick={() => setAddOpen(true)}>
                        <Plus size={14} />
                        <span className="hidden sm:inline">Přidat člena</span>
                        <span className="sm:hidden">Přidat</span>
                    </Button>
                </div>
            </div>

            {/* ── Mobile: cards ── */}
            <div className="md:hidden space-y-1.5">
                {filtered.length === 0 && (
                    <p className="text-center text-gray-400 py-10 text-sm">Žádní členové</p>
                )}
                {filtered.map(m => (
                    <button key={m.id} onClick={() => openDetail(m)}
                        className="w-full text-left bg-white rounded-xl border border-gray-200 px-4 py-3 active:bg-gray-50 transition-colors flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 leading-snug">
                                {m.lastName} {m.firstName}
                                {m.nickname && <span className="text-gray-400 font-normal"> ({m.nickname})</span>}
                            </p>
                            {m.cskNumber && <p className="text-xs text-gray-400 mt-0.5">ČSK {m.cskNumber}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${contribColor(m)}`}>
                                {contribLabel(m)}
                            </span>
                            {m.todoNote && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">úkol</span>}
                        </div>
                    </button>
                ))}
            </div>

            {/* ── Desktop: table ── */}
            <div className="hidden md:block rounded-xl border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead>Jméno</TableHead>
                            <TableHead className="w-28">ČSK</TableHead>
                            <TableHead>Info</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-gray-400 py-10">
                                    Žádní členové
                                </TableCell>
                            </TableRow>
                        )}
                        {filtered.map(m => (
                            <TableRow key={m.id}
                                className="hover:bg-gray-50/60 cursor-pointer"
                                onClick={() => openDetail(m)}>
                                <TableCell className="font-medium py-3">
                                    {m.lastName} {m.firstName}
                                    {m.nickname && (
                                        <span className="text-gray-400 font-normal ml-1">({m.nickname})</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-sm text-gray-500 font-mono">
                                    {m.cskNumber ?? <span className="text-gray-300">—</span>}
                                </TableCell>
                                <TableCell>
                                    <MemberInfoBadges m={m} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <AddMemberSheet
                open={addOpen}
                onOpenChange={setAddOpen}
                onAdded={() => { router.refresh(); }}
            />
        </div>
    );
}
