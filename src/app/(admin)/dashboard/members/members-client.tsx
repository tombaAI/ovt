"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SlidersHorizontal, ChevronDown, Plus } from "lucide-react";
import { pushNavStack } from "@/lib/nav-stack";
import { AddMemberSheet } from "./add-member-sheet";
import { MemberDetailClient } from "./[id]/member-detail-client";
import type { MemberWithFlags } from "./page";

// Modul-level cache — žije po celou dobu session v záložce, sdílí se mezi rendery
const memberDataCache = new Map<number, MemberWithFlags>();

type FilterKey = "all" | "todo" | "unreviewed";
type MemberBadgeFilterKey = "todo" | "partialYear" | "committee" | "tom" | "individual" | "noBrigade";
type SortKey   = "lastName" | "firstName" | "nickname" | "cskNumber" | "variableSymbol" | "email" | "phone";
type SortDir   = "asc" | "desc";

const MEMBER_BADGE_FILTERS: Array<{ key: MemberBadgeFilterKey; label: string }> = [
    { key: "todo", label: "S úkolem" },
    { key: "partialYear", label: "Noví" },
    { key: "committee", label: "Výbor" },
    { key: "tom", label: "TOM" },
    { key: "individual", label: "Indiv" },
    { key: "noBrigade", label: "Bez brigády" },
];

interface Props {
    members: MemberWithFlags[];
    selectedYear: number;
    periodId: number | null;
    currentYearDiscounts: { committee: number; tom: number } | null;
    // Initial values from server searchParams — no client re-render on change
    initialFilter: string;
    initialSort: string;
    initialSortDir: string;
    initialQ: string;
    initialStav: string;
    initialSleva: string;
    initialBrigada: boolean;
    initialCastRoku: boolean;
}

// Null-safe comparison: nulls always sort last, direction only affects non-null values
function cmpField(a: string | number | null, b: string | number | null, dir: SortDir): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const cmp = typeof a === "string" && typeof b === "string"
        ? a.localeCompare(b, "cs")
        : (a as number) - (b as number);
    return dir === "asc" ? cmp : -cmp;
}

// Aktivní DNES = memberTo je null nebo v budoucnosti
const TODAY = new Date().toISOString().slice(0, 10);
function isActiveToday(m: MemberWithFlags): boolean {
    return m.memberFrom <= TODAY && (m.memberTo === null || m.memberTo >= TODAY);
}
// Byl v tomto roce členem (ale možná dnes již není)
function wasActiveInYear(m: MemberWithFlags, year: number): boolean {
    return m.memberFrom <= `${year}-12-31` &&
        (m.memberTo === null || m.memberTo >= `${year}-01-01`);
}

function fmtDate(iso: string) {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y!.slice(2)}`;
}

function hasMemberBadge(member: MemberWithFlags, key: MemberBadgeFilterKey): boolean {
    if (key === "todo") return member.todoNote !== null;
    if (key === "committee") return member.isCommittee;
    if (key === "tom") return member.isTom;
    if (key === "individual") return member.discountIndividual !== null;
    if (key === "noBrigade") return !member.hasBrigade;
    return member.fromDate !== null || member.toDate !== null;
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
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 border border-orange-200 max-w-[180px] truncate">
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

export function MembersClient({
    members, selectedYear, periodId,
    initialFilter, initialSort, initialSortDir, initialQ, initialStav, initialSleva, initialBrigada, initialCastRoku,
}: Props) {
    const router = useRouter();
    const pathname = usePathname();

    // ── Local state — no server re-renders on change ──
    const [filter, setFilter]     = useState<FilterKey>(initialFilter as FilterKey);
    const [sort, setSort]         = useState<SortKey>(initialSort as SortKey);
    const [sortDir, setSortDir]   = useState<SortDir>(initialSortDir as SortDir);
    const [searchDraft, setSearchDraft] = useState(initialQ);  // input value (immediate)
    const [q, setQ]               = useState(initialQ);        // debounced value (used for filtering)
    const [stav, setStav]         = useState(initialStav);
    const [slevaSet, setSlevaSet] = useState<Set<string>>(() =>
        new Set(initialSleva ? initialSleva.split(",").filter(Boolean) : [])
    );
    const [brigada, setBrigada]   = useState(initialBrigada);
    const [castRoku, setCastRoku] = useState(initialCastRoku);
    const [addOpen, setAddOpen]   = useState(false);
    const [inlineDetailId, setInlineDetailId] = useState<number | null>(null);

    // Naplnit cache při načtení seznamu
    useEffect(() => {
        members.forEach(m => memberDataCache.set(m.id, m));
    }, [members]);

    // Vrátit se na seznam při browser back
    useEffect(() => {
        function onPopState(e: PopStateEvent) {
            if (typeof e.state?.memberId === "number") {
                setInlineDetailId(e.state.memberId as number);
            } else {
                setInlineDetailId(null);
            }
        }
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    // Debounce search — update URL and filtering state after 250ms idle
    useEffect(() => {
        const t = setTimeout(() => {
            setQ(searchDraft);
            updateUrl({ q: searchDraft || null });
        }, 250);
        return () => clearTimeout(t);
    }, [searchDraft]);  // eslint-disable-line react-hooks/exhaustive-deps

    // ── URL sync helper — no Next.js navigation ──
    const updateUrl = useCallback((updates: Record<string, string | null>) => {
        const url = new URL(window.location.href);
        for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === "") url.searchParams.delete(key);
            else url.searchParams.set(key, value);
        }
        window.history.replaceState({}, "", url.toString());
    }, []);

    function setFilterAndUrl(f: FilterKey) {
        setFilter(f);
        updateUrl({ filter: f === "all" ? null : f });
    }

    function handleSort(key: SortKey) {
        if (sort === key) {
            const newDir: SortDir = sortDir === "asc" ? "desc" : "asc";
            setSortDir(newDir);
            updateUrl({ sort: key === "lastName" ? null : key, dir: newDir === "asc" ? null : "desc" });
        } else {
            setSort(key);
            setSortDir("asc");
            updateUrl({ sort: key === "lastName" ? null : key, dir: null });
        }
    }

    function setStavAndUrl(s: string) {
        setStav(s);
        updateUrl({ stav: s === "active" ? null : s });
    }

    function toggleSleva(key: string) {
        setSlevaSet(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            updateUrl({ sleva: [...next].join(",") || null });
            return next;
        });
    }

    function setBrigadaAndUrl(v: boolean) {
        setBrigada(v);
        updateUrl({ brigada: v ? "none" : null });
    }

    function setCastRokuAndUrl(v: boolean) {
        setCastRoku(v);
        updateUrl({ cast: v ? "1" : null });
    }

    function resetAll() {
        setFilter("all"); setSort("lastName"); setSortDir("asc"); setSearchDraft(""); setQ("");
        setStav("active"); setSlevaSet(new Set()); setBrigada(false); setCastRoku(false);
        window.history.replaceState({}, "", pathname);
    }

    // ── Dropdown active conditions ──
    const dropdownConditions: string[] = [];
    if (stav === "terminated") dropdownConditions.push("Letos ukončení");
    if (stav === "inactive")   dropdownConditions.push("Neaktivní");
    if (slevaSet.has("committee"))  dropdownConditions.push("Výbor");
    if (slevaSet.has("tom"))         dropdownConditions.push("TOM");
    if (slevaSet.has("individual"))  dropdownConditions.push("Individuální");
    if (brigada)  dropdownConditions.push("Bez brigády");
    if (castRoku) dropdownConditions.push("Vstup / ukončení");

    const filtrLabel = dropdownConditions.length === 0
        ? "Filtrovat"
        : dropdownConditions.length === 1
            ? dropdownConditions[0]!
            : `Filtrovat (${dropdownConditions.length})`;

    const hasActiveFilters = filter !== "all" || dropdownConditions.length > 0 || q !== "";
    const selectedBadgeFilters = useMemo<MemberBadgeFilterKey[]>(() => {
        const next: MemberBadgeFilterKey[] = [];
        if (filter === "todo") next.push("todo");
        if (castRoku) next.push("partialYear");
        if (slevaSet.has("committee")) next.push("committee");
        if (slevaSet.has("tom")) next.push("tom");
        if (slevaSet.has("individual")) next.push("individual");
        if (brigada) next.push("noBrigade");
        return next;
    }, [brigada, castRoku, filter, slevaSet]);

    // ── Computed counts and filtered list ──
    const counts = useMemo(() => ({
        all:        members.filter(m => isActiveToday(m)).length,
        unreviewed: members.filter(m => !m.membershipReviewed).length,
    }), [members]);

    const filtered = useMemo(() => {
        let list: MemberWithFlags[];

        if (stav === "terminated") {
            list = members.filter(m => wasActiveInYear(m, selectedYear) && !isActiveToday(m));
        } else if (stav === "inactive") {
            list = members.filter(m => !wasActiveInYear(m, selectedYear));
        } else {
            list = members.filter(m => isActiveToday(m));
        }

        if (filter === "todo") {
            list = list.filter(m => m.todoNote !== null);
        } else if (filter === "unreviewed") {
            list = list.filter(m => !m.membershipReviewed);
        }

        if (selectedBadgeFilters.length > 0) {
            list = list.filter(member => selectedBadgeFilters.every(key => hasMemberBadge(member, key)));
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

        const sec = (a: MemberWithFlags, b: MemberWithFlags) =>
            a.lastName.localeCompare(b.lastName, "cs") || a.firstName.localeCompare(b.firstName, "cs");

        return [...list].sort((a, b) => {
            switch (sort) {
                case "firstName":
                    return cmpField(a.firstName, b.firstName, sortDir) || sec(a, b);
                case "nickname":
                    return cmpField(a.nickname, b.nickname, sortDir) || sec(a, b);
                case "cskNumber":
                    return cmpField(a.cskNumber, b.cskNumber, sortDir) || sec(a, b);
                case "variableSymbol":
                    return cmpField(a.variableSymbol, b.variableSymbol, sortDir) || sec(a, b);
                case "email":
                    return cmpField(a.email, b.email, sortDir) || sec(a, b);
                case "phone":
                    return cmpField(a.phone, b.phone, sortDir) || sec(a, b);
                default: // lastName
                    return cmpField(a.lastName, b.lastName, sortDir) || a.firstName.localeCompare(b.firstName, "cs");
            }
        });
    }, [members, filter, sort, sortDir, q, selectedBadgeFilters, stav, selectedYear]);

    function toggleHeaderBadgeFilter(key: MemberBadgeFilterKey) {
        if (key === "todo") {
            setFilterAndUrl(filter === "todo" ? "all" : "todo");
            return;
        }
        if (key === "noBrigade") {
            setBrigadaAndUrl(!brigada);
            return;
        }
        if (key === "partialYear") {
            setCastRokuAndUrl(!castRoku);
            return;
        }
        toggleSleva(key);
    }

    function openDetail(m: MemberWithFlags) {
        memberDataCache.set(m.id, m);
        const currentUrl = window.location.pathname + window.location.search;
        pushNavStack({ url: currentUrl, label: "Seznam členů" });
        // Změnit URL bez Next.js navigace → okamžitý render z cache
        window.history.pushState({ memberId: m.id }, "", `/dashboard/members/${m.id}`);
        setInlineDetailId(m.id);
    }

    function closeInlineDetail() {
        window.history.back(); // spustí popstate → setInlineDetailId(null)
    }

    // ── Inline detail render — okamžitě z cache ──
    const inlineMember = inlineDetailId !== null ? (memberDataCache.get(inlineDetailId) ?? null) : null;
    if (inlineMember) {
        return (
            <MemberDetailClient
                member={inlineMember}
                selectedYear={selectedYear}
                periodId={periodId}
                onBack={closeInlineDetail}
                onNavigatedAway={() => setInlineDetailId(null)}
            />
        );
    }

    // ── Pill styles ──
    const pill = (active: boolean, activeClass: string, inactiveClass: string) =>
        `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 cursor-pointer ${active ? activeClass : inactiveClass}`;

    return (
        <div className="space-y-3">
            {/* ── Header row ── */}
            <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900 mr-0.5">Členové {selectedYear}</h1>
                <span className="text-sm text-gray-400">Zobrazeno {filtered.length}</span>

                <Input
                    placeholder="Hledat…"
                    value={searchDraft}
                    onChange={e => setSearchDraft(e.target.value)}
                    className="h-8 w-36 text-sm"
                />

                {/* Badge pills */}
                <button className={pill(filter === "all" && stav === "active", "bg-[#327600] text-white", "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50")}
                    onClick={() => { setFilterAndUrl("all"); setStavAndUrl("active"); }}>
                    Aktivní <PillCount n={counts.all} active={filter === "all"} />
                </button>
                <button className={pill(
                    filter === "unreviewed",
                    "bg-violet-600 text-white",
                    counts.unreviewed > 0 ? "bg-violet-50 text-violet-700 border border-violet-300 hover:bg-violet-100" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                )} onClick={() => setFilterAndUrl("unreviewed")}>
                    Bez revize <PillCount n={counts.unreviewed} active={filter === "unreviewed"} />
                </button>

                {/* Filtrovat popover */}
                <Popover>
                    <PopoverTrigger asChild>
                        <button className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 cursor-pointer ${
                            dropdownConditions.length > 0
                                ? "bg-blue-50 text-blue-700 border border-blue-300"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                        }`}>
                            <SlidersHorizontal size={13} />
                            {filtrLabel}
                            <ChevronDown size={12} />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-60 p-3 space-y-3">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Stav</p>
                            <div className="space-y-1.5">
                                {([
                                    ["active",     "Aktivní dnes"],
                                    ["terminated", "Letos ukončení"],
                                    ["inactive",   "Neaktivní (letos vůbec)"],
                                ] as const).map(([s, label]) => (
                                    <label key={s} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                        <input type="radio" name="stav" value={s} checked={stav === s}
                                            onChange={() => setStavAndUrl(s)}
                                            className="accent-[#327600]" />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Sleva</p>
                            <div className="space-y-1.5">
                                {([["committee", "Výbor"], ["tom", "Vedoucí TOM"], ["individual", "Individuální"]] as const).map(([key, label]) => (
                                    <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                                        <Checkbox checked={slevaSet.has(key)} onCheckedChange={() => toggleSleva(key)} id={`sl-${key}`} />
                                        <Label htmlFor={`sl-${key}`} className="cursor-pointer font-normal">{label}</Label>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                                <Checkbox checked={brigada} onCheckedChange={v => setBrigadaAndUrl(Boolean(v))} id="no-brigade" />
                                <Label htmlFor="no-brigade" className="cursor-pointer font-normal">Bez brigády</Label>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                                <Checkbox checked={castRoku} onCheckedChange={v => setCastRokuAndUrl(Boolean(v))} id="cast" />
                                <Label htmlFor="cast" className="cursor-pointer font-normal">Vstup / ukončení</Label>
                            </label>
                        </div>
                        {dropdownConditions.length > 0 && (
                            <button onClick={() => { setStavAndUrl("active"); setSlevaSet(new Set()); setBrigadaAndUrl(false); setCastRokuAndUrl(false); updateUrl({ stav: null, sleva: null, brigada: null, cast: null }); }}
                                className="text-xs text-gray-400 hover:text-gray-700 w-full text-left pt-1 border-t border-gray-100">
                                Zrušit filtry
                            </button>
                        )}
                    </PopoverContent>
                </Popover>

                {hasActiveFilters && (
                    <button onClick={resetAll}
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
                                {m.firstName} {m.lastName}
                                {m.nickname && <span className="text-gray-400 font-normal"> ({m.nickname})</span>}
                            </p>
                            {m.cskNumber && <p className="text-xs text-gray-400 mt-0.5">ČSK {m.cskNumber}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {m.hasContrib && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${m.isPaid ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                                    {m.isPaid ? "zapl." : "nedopl."}
                                </span>
                            )}
                            {m.todoNote && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">úkol</span>}
                        </div>
                    </button>
                ))}
            </div>

            {/* ── Desktop: table ── */}
            <div className="hidden md:block rounded-xl border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50 text-sm">
                            <TableHead className="py-2">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                    <SortBtn field="firstName" label="Jméno"       sort={sort} dir={sortDir} onSort={handleSort} />
                                    <SortBtn field="lastName"  label="Příjmení"    sort={sort} dir={sortDir} onSort={handleSort} />
                                    <SortBtn field="nickname"  label="(přezdívka)" sort={sort} dir={sortDir} onSort={handleSort} dim />
                                </div>
                            </TableHead>
                            <TableHead className="w-20 py-2">
                                <SortBtn field="cskNumber" label="ČSK" sort={sort} dir={sortDir} onSort={handleSort} />
                            </TableHead>
                            <TableHead className="w-24 py-2">
                                <SortBtn field="variableSymbol" label="VS" sort={sort} dir={sortDir} onSort={handleSort} />
                            </TableHead>
                            <TableHead className="py-2">
                                <SortBtn field="email" label="E-mail" sort={sort} dir={sortDir} onSort={handleSort} />
                            </TableHead>
                            <TableHead className="py-2">
                                <SortBtn field="phone" label="Telefon" sort={sort} dir={sortDir} onSort={handleSort} />
                            </TableHead>
                            <TableHead className="w-[380px] py-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {MEMBER_BADGE_FILTERS.map(item => {
                                        const isActive = selectedBadgeFilters.includes(item.key);
                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                aria-pressed={isActive}
                                                onClick={() => toggleHeaderBadgeFilter(item.key)}
                                                className={[
                                                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                                                    isActive
                                                        ? "border-[#327600] bg-[#327600]/10 text-[#327600] hover:bg-[#327600]/15"
                                                        : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200",
                                                ].join(" ")}
                                            >
                                                {item.label}
                                                {isActive && (
                                                    <span className="rounded-full bg-[#327600]/10 px-1.5 py-0.5 text-[10px] leading-none text-[#327600]">
                                                        {filtered.length}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-gray-400 py-10">Žádní členové</TableCell>
                            </TableRow>
                        )}
                        {filtered.map(m => (
                            <TableRow key={m.id} className="hover:bg-gray-50/60 cursor-pointer" onClick={() => openDetail(m)}>
                                <TableCell className="font-medium py-3">
                                    {m.firstName} {m.lastName}
                                    {m.nickname && <span className="text-gray-400 font-normal ml-1">({m.nickname})</span>}
                                </TableCell>
                                <TableCell className="text-sm text-gray-500 font-mono w-20">
                                    {m.cskNumber ?? <span className="text-gray-300">—</span>}
                                </TableCell>
                                <TableCell className="text-sm text-gray-500 font-mono w-24">
                                    {m.variableSymbol ?? <span className="text-gray-300">—</span>}
                                </TableCell>
                                <TableCell className="text-sm text-gray-600 max-w-[180px] truncate">
                                    {m.email ?? <span className="text-gray-300">—</span>}
                                </TableCell>
                                <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                                    {m.phone ?? <span className="text-gray-300">—</span>}
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
                onAdded={() => router.refresh()}
            />
        </div>
    );
}

function PillCount({ n, active }: { n: number; active: boolean }) {
    return (
        <span className={`text-xs rounded-full px-1.5 ${active ? "bg-white/25" : "bg-gray-100 text-gray-500"}`}>
            {n}
        </span>
    );
}

function SortBtn({ field, label, sort, dir, onSort, dim }: {
    field: SortKey; label: string;
    sort: SortKey; dir: SortDir;
    onSort: (f: SortKey) => void;
    dim?: boolean;
}) {
    const active = sort === field;
    return (
        <button
            onClick={() => onSort(field)}
            className={`transition-colors hover:text-gray-900 ${active ? "text-gray-900 font-medium" : dim ? "text-gray-400" : "text-gray-500"}`}
        >
            {label}
            {active && (
                <span className="ml-0.5 text-[#327600] font-normal">{dir === "asc" ? "↑" : "↓"}</span>
            )}
        </button>
    );
}
