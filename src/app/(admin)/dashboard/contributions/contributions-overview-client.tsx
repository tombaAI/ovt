"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Pencil, Search, SlidersHorizontal, X } from "lucide-react";
import { pushNavStack } from "@/lib/nav-stack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { PrepareDialog } from "./prepare-dialog";
import { EditPrescriptionDialog } from "./edit-prescription-dialog";
import type { PeriodFormData } from "@/lib/actions/contribution-periods";
import type { ContribRow, MemberOption, PeriodDetail } from "./data";

type FilterKey = "issues" | "unpaid" | "todo";
type PaymentStateFilter = "all" | "unpaid" | "underpaid" | "overpaid" | "paid";
type ProcessStateFilter = "all" | "new" | "reviewed" | "mailed";
type SortKey = "firstName" | "lastName" | "nickname" | "date" | "status";
type SortDir = "asc" | "desc";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
    { key: "issues", label: "Problémy" },
    { key: "unpaid", label: "Nezaplaceno" },
    { key: "todo", label: "S úkolem" },
];

const STATUS_BADGE: Record<ContribRow["status"], { label: string; className: string }> = {
    paid: {
        label: "V pořádku",
        className: "bg-[#327600]/10 text-[#327600] border-0",
    },
    overpaid: {
        label: "Více",
        className: "bg-orange-100 text-orange-700 border-0",
    },
    underpaid: {
        label: "Méně",
        className: "bg-red-100 text-red-700 border-0",
    },
    unpaid: {
        label: "Nezaplaceno",
        className: "bg-red-50 text-red-600 border border-red-200",
    },
};

const STATUS_ORDER: Record<ContribRow["status"], number> = {
    unpaid: 0,
    underpaid: 1,
    overpaid: 2,
    paid: 3,
};

function fmtAmount(value: number | null): string {
    if (value === null) return "—";
    return `${value.toLocaleString("cs-CZ")} Kč`;
}

function fmtDate(value: string | null): string {
    if (!value) return "—";
    const [year, month, day] = value.split("-");
    return `${Number(day)}. ${Number(month)}. ${year}`;
}

function processState(row: ContribRow): ProcessStateFilter {
    if (row.emailSent) return "mailed";
    if (row.reviewed) return "reviewed";
    return "new";
}

function contributionBadges(row: ContribRow, showYear: boolean): string[] {
    const badges: string[] = [];
    if (showYear) badges.push(String(row.periodYear));
    if (row.amountBoat1) badges.push("Loď");
    if (row.amountBoat2) badges.push("2. loď");
    if (row.amountBoat3) badges.push("3. loď");
    if (row.brigadeSurcharge && row.brigadeSurcharge > 0) badges.push("Bez brigády");
    if (row.discountCommittee) badges.push("Výbor");
    if (row.discountTom) badges.push("TOM");
    if (row.todoNote) badges.push("📋 úkol");
    return badges;
}

function normalizedMemberLabel(member: MemberOption | null): string {
    if (!member) return "";
    return [member.firstName, member.lastName].join(" ").trim();
}

function numericQuery(value: string): string {
    return value.replace(/\s/g, "");
}

function compareText(a: string | null, b: string | null, dir: SortDir): number {
    const left = a?.trim() || "";
    const right = b?.trim() || "";
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    const comparison = left.localeCompare(right, "cs");
    return dir === "asc" ? comparison : -comparison;
}

function compareDate(a: string | null, b: string | null, dir: SortDir): number {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const comparison = a.localeCompare(b);
    return dir === "asc" ? comparison : -comparison;
}

interface Props {
    period: PeriodDetail | null;
    rows: ContribRow[];
    memberOptions: MemberOption[];
    yearMode: number | "all";
    selectedYear: number;
    initialFilter: string;
    initialSort: string;
    initialSortDir: string;
    initialQ: string;
    initialMemberId: number | null;
    initialPaymentState: string;
    initialProcessState: string;
    canPrepare?: boolean;
    prepareDefaults?: Partial<PeriodFormData>;
}

export function ContributionsOverviewClient({
    period,
    rows,
    memberOptions,
    yearMode,
    selectedYear,
    initialFilter,
    initialSort,
    initialSortDir,
    initialQ,
    initialMemberId,
    initialPaymentState,
    initialProcessState,
    canPrepare = false,
    prepareDefaults = {},
}: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const [filter, setFilter] = useState<FilterKey>(
        initialFilter === "unpaid" || initialFilter === "todo" ? initialFilter : "issues"
    );
    const [sort, setSort] = useState<SortKey>(
        initialSort === "firstName" || initialSort === "nickname" || initialSort === "date" || initialSort === "status"
            ? initialSort
            : "lastName"
    );
    const [sortDir, setSortDir] = useState<SortDir>(initialSortDir === "desc" ? "desc" : "asc");
    const [searchDraft, setSearchDraft] = useState(initialQ);
    const [q, setQ] = useState(initialQ);
    const [memberId, setMemberId] = useState<number | null>(initialMemberId);
    const [paymentState, setPaymentState] = useState<PaymentStateFilter>(
        initialPaymentState === "unpaid" || initialPaymentState === "underpaid" || initialPaymentState === "overpaid" || initialPaymentState === "paid"
            ? initialPaymentState
            : "all"
    );
    const [process, setProcess] = useState<ProcessStateFilter>(
        initialProcessState === "new" || initialProcessState === "reviewed" || initialProcessState === "mailed"
            ? initialProcessState
            : "all"
    );
    const [prepareOpen, setPrepareOpen] = useState(false);
    const [editRow, setEditRow] = useState<ContribRow | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [memberSearch, setMemberSearch] = useState("");

    const updateUrl = useCallback((updates: Record<string, string | null>) => {
        const url = new URL(window.location.href);
        Object.entries(updates).forEach(([key, value]) => {
            if (!value) url.searchParams.delete(key);
            else url.searchParams.set(key, value);
        });
        window.history.replaceState({}, "", url.toString());
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setQ(searchDraft);
            updateUrl({ q: searchDraft || null });
        }, 250);

        return () => window.clearTimeout(timeout);
    }, [searchDraft, updateUrl]);

    const activeMember = useMemo(
        () => memberOptions.find(option => option.id === memberId) ?? null,
        [memberId, memberOptions]
    );

    const memberScopedRows = useMemo(
        () => (memberId ? rows.filter(row => row.memberId === memberId) : rows),
        [memberId, rows]
    );

    const badgeCounts = useMemo(() => ({
        issues: memberScopedRows.filter(row => row.status !== "paid").length,
        unpaid: memberScopedRows.filter(row => row.status === "unpaid").length,
        todo: memberScopedRows.filter(row => row.todoNote !== null).length,
    }), [memberScopedRows]);

    const summary = useMemo(() => {
        const collected = memberScopedRows.reduce((sum, row) => sum + row.paidTotal, 0);
        const expected = memberScopedRows.reduce((sum, row) => sum + (row.amountTotal ?? 0), 0);
        const confirmedPrescription = memberScopedRows.reduce(
            (sum, row) => sum + (row.reviewed || row.emailSent ? (row.amountTotal ?? 0) : 0),
            0
        );
        const problematic = memberScopedRows.filter(
            row => row.paidTotal > 0 && row.amountTotal !== null && row.paidTotal !== row.amountTotal
        ).length;

        return {
            collected,
            expected,
            confirmedPrescription,
            difference: Math.max(0, expected - confirmedPrescription),
            problematic,
            matchingCandidates: 0,
        };
    }, [memberScopedRows]);

    const filteredRows = useMemo(() => {
        const query = q.trim().toLowerCase();
        const queryDigits = numericQuery(query);

        let next = memberScopedRows.filter(row => {
            if (!query) return true;
            const fullName = `${row.firstName} ${row.lastName}`.toLowerCase();
            const nickname = row.nickname?.toLowerCase() ?? "";
            const amount = row.amountTotal === null ? "" : String(row.amountTotal);
            return fullName.includes(query) || nickname.includes(query) || (queryDigits !== "" && amount.includes(queryDigits));
        });

        if (filter === "issues") next = next.filter(row => row.status !== "paid");
        if (filter === "unpaid") next = next.filter(row => row.status === "unpaid");
        if (filter === "todo") next = next.filter(row => row.todoNote !== null);

        if (paymentState !== "all") next = next.filter(row => row.status === paymentState);
        if (process !== "all") next = next.filter(row => processState(row) === process);

        return [...next].sort((left, right) => {
            let comparison = 0;

            if (sort === "firstName") comparison = compareText(left.firstName, right.firstName, sortDir);
            if (sort === "lastName") comparison = compareText(left.lastName, right.lastName, sortDir);
            if (sort === "nickname") comparison = compareText(left.nickname, right.nickname, sortDir);
            if (sort === "date") comparison = compareDate(left.lastPaidAt, right.lastPaidAt, sortDir);
            if (sort === "status") {
                const statusDiff = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
                comparison = sortDir === "asc" ? statusDiff : -statusDiff;
            }

            if (comparison !== 0) return comparison;

            if (yearMode === "all" && left.periodYear !== right.periodYear) {
                return right.periodYear - left.periodYear;
            }

            const lastNameCmp = compareText(left.lastName, right.lastName, "asc");
            if (lastNameCmp !== 0) return lastNameCmp;
            return compareText(left.firstName, right.firstName, "asc");
        });
    }, [filter, memberScopedRows, paymentState, process, q, sort, sortDir, yearMode]);

    const filterMenuLabel = useMemo(() => {
        const labels: string[] = [];
        if (paymentState !== "all") {
            labels.push(
                paymentState === "paid" ? "Zaplaceno"
                    : paymentState === "underpaid" ? "Nedoplatek"
                    : paymentState === "overpaid" ? "Přeplatek"
                    : "Nezaplaceno"
            );
        }
        if (process !== "all") {
            labels.push(
                process === "new" ? "Nový"
                    : process === "reviewed" ? "Zkontrolováno"
                    : "Odeslán mail"
            );
        }
        if (yearMode === "all") labels.push("Všechny roky");

        if (labels.length === 0) return "Filtrovat";
        if (labels.length === 1) return labels[0] ?? "Filtrovat";
        return `Filtrovat (${labels.length})`;
    }, [paymentState, process, yearMode]);

    const hasActiveFilters = filter !== "issues"
        || paymentState !== "all"
        || process !== "all"
        || memberId !== null
        || q.trim() !== ""
        || yearMode === "all";

    const memberCandidates = useMemo(() => {
        const query = memberSearch.trim().toLowerCase();
        if (!query) return memberOptions.slice(0, 12);
        return memberOptions
            .filter(option => {
                const label = `${option.firstName} ${option.lastName} ${option.nickname ?? ""}`.toLowerCase();
                return label.includes(query);
            })
            .slice(0, 12);
    }, [memberOptions, memberSearch]);

    function handleSort(key: SortKey) {
        if (sort === key) {
            const nextDir: SortDir = sortDir === "asc" ? "desc" : "asc";
            setSortDir(nextDir);
            updateUrl({
                sort: key === "lastName" ? null : key,
                dir: nextDir === "asc" ? null : "desc",
            });
            return;
        }

        setSort(key);
        setSortDir("asc");
        updateUrl({ sort: key === "lastName" ? null : key, dir: null });
    }

    function handleFilter(next: FilterKey) {
        setFilter(next);
        updateUrl({ filter: next === "issues" ? null : next });
    }

    function handleMemberSelect(nextMemberId: number | null) {
        setMemberId(nextMemberId);
        setMemberSearch("");
        updateUrl({ member: nextMemberId ? String(nextMemberId) : null });
    }

    function handleYearModeChange(next: string) {
        const url = new URL(window.location.href);
        if (next === String(selectedYear)) url.searchParams.delete("year");
        else url.searchParams.set("year", next);
        router.push(`${pathname}${url.search}`);
    }

    function clearDropdownFilters() {
        setPaymentState("all");
        setProcess("all");
        updateUrl({ state: null, process: null });
        handleMemberSelect(null);
        if (yearMode === "all") {
            const url = new URL(window.location.href);
            url.searchParams.delete("year");
            router.push(`${pathname}${url.search}`);
            return;
        }
        updateUrl({ member: null });
    }

    function resetAllFilters() {
        setFilter("issues");
        setPaymentState("all");
        setProcess("all");
        setSearchDraft("");
        setQ("");
        setMemberId(null);
        setMemberSearch("");
        setSort("lastName");
        setSortDir("asc");

        const url = new URL(window.location.href);
        url.searchParams.delete("filter");
        url.searchParams.delete("state");
        url.searchParams.delete("process");
        url.searchParams.delete("q");
        url.searchParams.delete("member");
        url.searchParams.delete("sort");
        url.searchParams.delete("dir");

        if (yearMode === "all") {
            url.searchParams.delete("year");
            router.push(`${pathname}${url.search}`);
            return;
        }

        window.history.replaceState({}, "", url.toString());
    }

    function openEditPrescription(row: ContribRow, event: React.MouseEvent<HTMLButtonElement>) {
        event.stopPropagation();
        setEditRow(row);
        setEditOpen(true);
    }

    function openDetail(row: ContribRow) {
        const currentUrl = `${pathname}${window.location.search}`;
        const title = activeMember
            ? `Příspěvky: ${normalizedMemberLabel(activeMember)}`
            : yearMode === "all"
                ? "Příspěvky — všechny roky"
                : `Příspěvky ${row.periodYear}`;
        pushNavStack({ url: currentUrl, label: title });
        router.push(`/dashboard/contributions/${row.contribId}?year=${row.periodYear}`);
    }

    function renderSortArrow(key: SortKey) {
        if (sort !== key) return null;
        return <span className="text-xs text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>;
    }

    const headerTitle = yearMode === "all" ? "Příspěvky — všechny roky" : `Příspěvky ${period?.year ?? selectedYear}`;
    const showYearBadge = yearMode === "all";

    return (
        <div className="space-y-5">
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="mr-0.5 whitespace-nowrap text-xl font-semibold text-gray-900">{headerTitle}</h1>

                    <div className="relative w-72 max-w-full">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            type="search"
                            value={searchDraft}
                            onChange={event => setSearchDraft(event.target.value)}
                            placeholder="Hledat jméno, přezdívku, částku…"
                            className="h-8 pl-8 pr-8 text-sm"
                        />
                        {searchDraft && (
                            <button
                                type="button"
                                onClick={() => setSearchDraft("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {FILTERS.map(item => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => handleFilter(item.key)}
                                className={[
                                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                                    filter === item.key
                                        ? item.key === "todo"
                                            ? "border-orange-500 bg-orange-500 text-white"
                                            : "border-[#327600] bg-[#327600] text-white"
                                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                                ].join(" ")}
                            >
                                {item.label}
                                <span className={filter === item.key ? "text-xs text-white/80" : "text-xs text-gray-400"}>
                                    {badgeCounts[item.key]}
                                </span>
                            </button>
                        ))}
                    </div>

                    {activeMember && (
                        <button
                            type="button"
                            onClick={() => handleMemberSelect(null)}
                            className="inline-flex items-center gap-1 rounded-full border border-[#327600]/20 bg-[#327600]/10 px-3 py-1.5 text-sm text-[#327600]"
                        >
                            {normalizedMemberLabel(activeMember)}
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="h-8 gap-2 text-sm">
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                {filterMenuLabel}
                                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-96 space-y-4 p-4">
                            <div className="space-y-1.5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Stav platby</p>
                                <Select value={paymentState} onValueChange={value => {
                                    const next = value as PaymentStateFilter;
                                    setPaymentState(next);
                                    updateUrl({ state: next === "all" ? null : next });
                                }}>
                                    <SelectTrigger className="h-9 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Vše</SelectItem>
                                        <SelectItem value="unpaid">Nezaplaceno</SelectItem>
                                        <SelectItem value="underpaid">Nedoplatek</SelectItem>
                                        <SelectItem value="overpaid">Přeplatek</SelectItem>
                                        <SelectItem value="paid">Zaplaceno</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Stav zpracování</p>
                                <Select value={process} onValueChange={value => {
                                    const next = value as ProcessStateFilter;
                                    setProcess(next);
                                    updateUrl({ process: next === "all" ? null : next });
                                }}>
                                    <SelectTrigger className="h-9 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Vše</SelectItem>
                                        <SelectItem value="new">Nový</SelectItem>
                                        <SelectItem value="reviewed">Zkontrolováno</SelectItem>
                                        <SelectItem value="mailed">Odeslán mail</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rok</p>
                                <Select value={String(yearMode)} onValueChange={handleYearModeChange}>
                                    <SelectTrigger className="h-9 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={String(selectedYear)}>Aktuální rok ({selectedYear})</SelectItem>
                                        <SelectItem value="all">Všechny roky</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Člen</p>
                                <Input
                                    value={memberSearch}
                                    onChange={event => setMemberSearch(event.target.value)}
                                    placeholder="Hledat člena…"
                                    className="h-9 text-sm"
                                />
                                <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-1">
                                    {memberCandidates.length === 0 ? (
                                        <p className="px-2 py-1.5 text-sm text-gray-400">Žádný člen</p>
                                    ) : (
                                        memberCandidates.map(option => {
                                            const label = normalizedMemberLabel(option);
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => handleMemberSelect(option.id)}
                                                    className={[
                                                        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                                                        option.id === memberId
                                                            ? "bg-[#327600]/10 text-[#327600]"
                                                            : "hover:bg-gray-50",
                                                    ].join(" ")}
                                                >
                                                    <span>
                                                        {label}
                                                        {option.nickname && (
                                                            <span className="ml-1 text-gray-400">({option.nickname})</span>
                                                        )}
                                                    </span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button variant="ghost" onClick={clearDropdownFilters} className="h-8 px-2 text-sm text-gray-500">
                                    Zrušit filtry
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={resetAllFilters}
                            className="rounded px-2 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
                        >
                            × Zrušit vše
                        </button>
                    )}

                    {canPrepare && yearMode !== "all" && (
                        <div className="ml-auto">
                            <Button onClick={() => setPrepareOpen(true)} className="h-8 bg-[#327600] text-white hover:bg-[#327600]/90">
                                Připravit předpisy
                            </Button>
                        </div>
                    )}
                </div>

                <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                    <div className="flex min-w-max items-stretch gap-3 pb-1">
                        <div className="flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-3 text-sm text-gray-600">
                            {period ? (
                                <>
                                    <span className="whitespace-nowrap"><span className="text-gray-400">Člen</span> <strong className="text-gray-700">{period.amountBase.toLocaleString("cs-CZ")} Kč</strong></span>
                                    <span className="whitespace-nowrap"><span className="text-gray-400">Loď</span> <strong className="text-gray-700">{period.amountBoat1.toLocaleString("cs-CZ")} Kč / {period.amountBoat2.toLocaleString("cs-CZ")} Kč</strong></span>
                                    <span className="whitespace-nowrap"><span className="text-gray-400">Brigáda</span> <strong className="text-gray-700">+{period.brigadeSurcharge.toLocaleString("cs-CZ")} Kč</strong></span>
                                    <span className="whitespace-nowrap"><span className="text-gray-400">Sleva výbor</span> <strong className="text-gray-700">−{period.discountCommittee.toLocaleString("cs-CZ")} Kč</strong></span>
                                    <span className="whitespace-nowrap"><span className="text-gray-400">Sleva TOM</span> <strong className="text-gray-700">−{period.discountTom.toLocaleString("cs-CZ")} Kč</strong></span>
                                    {period.dueDate && (
                                        <span className="whitespace-nowrap"><span className="text-gray-400">Splatnost</span> <strong className="text-gray-700">{period.dueDate}</strong></span>
                                    )}
                                    <span className="whitespace-nowrap"><span className="text-gray-400">Účet</span> <strong className="font-mono text-gray-700">{period.bankAccount}</strong></span>
                                </>
                            ) : (
                                <span className="whitespace-nowrap text-gray-500">Historie všech roků — globální rok vpravo nahoře zůstává {selectedYear}</span>
                            )}
                        </div>

                        <SummaryCard
                            title="Vybráno / očekáváno"
                            value={fmtAmount(summary.collected)}
                            subvalue={`z ${fmtAmount(summary.expected)}`}
                        />
                        <SummaryCard
                            title="Potvrzený předpis"
                            value={fmtAmount(summary.confirmedPrescription)}
                            subvalue={`Rozdíl: ${fmtAmount(summary.difference)}`}
                        />
                        <SummaryCard
                            title="Problematické k řešení"
                            value={String(summary.problematic)}
                            subvalue="zaplaceno jinak, než čekáme"
                        />
                        <SummaryCard
                            title="Platby k párování"
                            value={String(summary.matchingCandidates)}
                            subvalue="zatím fixně 0"
                        />
                    </div>
                </div>
            </div>

            <div className="hidden md:block overflow-hidden rounded-xl border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead>
                                <button type="button" onClick={() => handleSort("firstName")} className="inline-flex items-center gap-1 font-medium">
                                    Jméno {renderSortArrow("firstName")}
                                </button>
                                <button type="button" onClick={() => handleSort("lastName")} className="ml-3 inline-flex items-center gap-1 font-medium">
                                    Příjmení {renderSortArrow("lastName")}
                                </button>
                                <button type="button" onClick={() => handleSort("nickname")} className="ml-3 inline-flex items-center gap-1 font-medium">
                                    Přezdívka {renderSortArrow("nickname")}
                                </button>
                            </TableHead>
                            <TableHead>Badges</TableHead>
                            <TableHead className="text-right">Předpis</TableHead>
                            <TableHead className="text-right">Zaplaceno</TableHead>
                            <TableHead className="text-right">Rozdíl</TableHead>
                            <TableHead>
                                <button type="button" onClick={() => handleSort("date")} className="inline-flex items-center gap-1 font-medium">
                                    Datum {renderSortArrow("date")}
                                </button>
                            </TableHead>
                            <TableHead>
                                <button type="button" onClick={() => handleSort("status")} className="inline-flex items-center gap-1 font-medium">
                                    Stav {renderSortArrow("status")}
                                </button>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="py-10 text-center text-gray-400">
                                    <div className="space-y-3">
                                        <p>Žádné výsledky</p>
                                        {hasActiveFilters && (
                                            <Button variant="outline" onClick={resetAllFilters} className="h-8 text-sm">
                                                Zrušit filtry
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                        {filteredRows.map(row => {
                            const balance = row.amountTotal === null ? null : row.paidTotal - row.amountTotal;
                            const badges = contributionBadges(row, showYearBadge);
                            const statusBadge = STATUS_BADGE[row.status];

                            return (
                                <TableRow key={row.contribId} className="cursor-pointer hover:bg-gray-50/70" onClick={() => openDetail(row)}>
                                    <TableCell className="font-medium text-gray-900">
                                        <div className="flex items-center gap-1">
                                            <span>{row.firstName}</span>
                                            <span>{row.lastName}</span>
                                            {row.nickname && <span className="text-gray-400">({row.nickname})</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {badges.length === 0 ? (
                                                <span className="text-sm text-gray-300">—</span>
                                            ) : (
                                                badges.map(badge => (
                                                    <span
                                                        key={badge}
                                                        className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                                                    >
                                                        {badge}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        <span className="inline-flex items-center gap-2">
                                            {fmtAmount(row.amountTotal)}
                                            <button
                                                type="button"
                                                onClick={event => openEditPrescription(row, event)}
                                                className="rounded p-0.5 text-gray-300 transition-colors hover:bg-gray-100 hover:text-[#327600]"
                                                title="Upravit částky"
                                            >
                                                <Pencil className="h-3 w-3" />
                                            </button>
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">{fmtAmount(row.paidTotal)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        {balance === null || balance === 0 ? "—" : (
                                            <span className={balance > 0 ? "text-orange-600" : "text-red-600"}>
                                                {balance > 0 ? "+" : ""}{balance.toLocaleString("cs-CZ")} Kč
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-500">{fmtDate(row.lastPaidAt)}</TableCell>
                                    <TableCell>
                                        <Badge className={`${statusBadge.className} text-xs font-normal`}>
                                            {statusBadge.label}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <div className="space-y-2 md:hidden">
                {filteredRows.length === 0 && (
                    <div className="space-y-3 py-12 text-center text-sm text-gray-400">
                        <p>Žádné výsledky</p>
                        {hasActiveFilters && (
                            <div>
                                <Button variant="outline" onClick={resetAllFilters} className="h-8 text-sm">
                                    Zrušit filtry
                                </Button>
                            </div>
                        )}
                    </div>
                )}
                {filteredRows.map(row => {
                    const badges = contributionBadges(row, showYearBadge);
                    const statusBadge = STATUS_BADGE[row.status];
                    const context = row.lastPaidAt
                        ? `Předpis ${fmtAmount(row.amountTotal)} · Datum ${fmtDate(row.lastPaidAt)}`
                        : `Předpis ${fmtAmount(row.amountTotal)} · Zaplaceno ${fmtAmount(row.paidTotal)}`;

                    return (
                        <button
                            key={row.contribId}
                            type="button"
                            onClick={() => openDetail(row)}
                            className="w-full rounded-xl border border-gray-200 bg-white p-3.5 text-left transition-colors active:bg-gray-50"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-medium text-gray-900">
                                        {row.firstName} {row.lastName}
                                        {row.nickname && <span className="text-gray-400"> ({row.nickname})</span>}
                                    </p>
                                    {badges.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {badges.map(badge => (
                                                <span key={badge} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                                    {badge}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <Badge className={`${statusBadge.className} text-xs font-normal`}>
                                    {statusBadge.label}
                                </Badge>
                            </div>
                            <p className="mt-2 text-sm text-gray-500">{context}</p>
                        </button>
                    );
                })}
            </div>

            {period === null && yearMode !== "all" ? null : (
                <PrepareDialog
                    open={prepareOpen}
                    onOpenChange={setPrepareOpen}
                    year={period?.year ?? selectedYear}
                    defaults={prepareDefaults}
                />
            )}

            <EditPrescriptionDialog open={editOpen} onOpenChange={setEditOpen} row={editRow} />
        </div>
    );
}

function SummaryCard({ title, value, subvalue }: { title: string; value: string; subvalue: string }) {
    return (
        <div className="min-w-[180px] rounded-xl border bg-white px-4 py-3">
            <p className="text-xs text-gray-500">{title}</p>
            <p className="text-lg font-semibold text-gray-900">{value}</p>
            <p className="text-xs text-gray-400">{subvalue}</p>
        </div>
    );
}