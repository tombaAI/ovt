"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
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
import type { MemberOption, PaymentRow } from "./data";
import type { ReconciliationStatus } from "@/lib/actions/reconciliation";

type StatusFilter = "open" | ReconciliationStatus;
type SourceFilter = "all" | "fio_bank" | "file_import" | "cash";
type SortKey = "paidAt" | "amount" | "status" | "source";
type SortDir = "asc" | "desc";

const STATUS_LABELS: Record<StatusFilter, string> = {
    open: "K řešení",
    unmatched: "Nespárováno",
    suggested: "Ke kontrole",
    confirmed: "Potvrzeno",
    ignored: "Ignorováno",
};

const STATUS_BADGE: Record<ReconciliationStatus, string> = {
    unmatched: "bg-gray-100 text-gray-600 border-gray-200",
    suggested: "bg-blue-100 text-blue-700 border-blue-200",
    confirmed: "bg-green-100 text-green-800 border-green-200",
    ignored: "bg-amber-100 text-amber-700 border-amber-200",
};

const SOURCE_LABELS: Record<string, string> = {
    fio_bank: "Fio banka",
    file_import: "Soubor",
    cash: "Hotovost",
};

const SOURCE_BADGE: Record<string, string> = {
    fio_bank: "bg-violet-100 text-violet-700 border-violet-200",
    file_import: "bg-sky-100 text-sky-700 border-sky-200",
    cash: "bg-orange-100 text-orange-700 border-orange-200",
};

const STATUS_ORDER: Record<ReconciliationStatus, number> = {
    unmatched: 0,
    suggested: 1,
    confirmed: 2,
    ignored: 3,
};

function formatAmount(value: number): string {
    return new Intl.NumberFormat("cs-CZ", {
        style: "currency",
        currency: "CZK",
        maximumFractionDigits: 2,
    }).format(value);
}

function formatDate(value: string): string {
    const [year, month, day] = value.split("-");
    return `${Number(day)}. ${Number(month)}. ${year}`;
}

function sourceLabel(row: PaymentRow): string {
    if (row.sourceType === "file_import" && row.profileName) return row.profileName;
    return SOURCE_LABELS[row.sourceType] ?? row.sourceType;
}

function pairingLabel(row: PaymentRow): string {
    if (row.allocations.length === 0) return "—";
    if (row.allocations.length === 1) {
        const allocation = row.allocations[0];
        if (!allocation) return "—";
        return allocation.periodYear
            ? `${allocation.memberName} — ${allocation.periodYear}`
            : allocation.memberName;
    }
    return `${row.allocations.length} alokace`;
}

function compareDate(left: string, right: string, dir: SortDir): number {
    const comparison = left.localeCompare(right);
    return dir === "asc" ? comparison : -comparison;
}

function compareNumber(left: number, right: number, dir: SortDir): number {
    const comparison = left - right;
    return dir === "asc" ? comparison : -comparison;
}

function compareText(left: string, right: string, dir: SortDir): number {
    const comparison = left.localeCompare(right, "cs");
    return dir === "asc" ? comparison : -comparison;
}

function matchesStatus(row: PaymentRow, status: StatusFilter): boolean {
    if (status === "open") {
        return row.reconciliationStatus === "unmatched" || row.reconciliationStatus === "suggested";
    }
    return row.reconciliationStatus === status;
}

interface Props {
    rows: PaymentRow[];
    memberOptions: MemberOption[];
    yearMode: number | "all";
    selectedYear: number;
    initialStatus: string;
    initialSource: string;
    initialProfileId: number | null;
    initialQ: string;
    initialMemberId: number | null;
    initialSort: string;
    initialSortDir: string;
    initialWithoutVs: string;
}

export function PaymentsOverviewClient({
    rows,
    memberOptions,
    yearMode,
    selectedYear,
    initialStatus,
    initialSource,
    initialProfileId,
    initialQ,
    initialMemberId,
    initialSort,
    initialSortDir,
    initialWithoutVs,
}: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const [status, setStatus] = useState<StatusFilter>(
        initialStatus === "unmatched" || initialStatus === "suggested" || initialStatus === "confirmed" || initialStatus === "ignored"
            ? initialStatus
            : "open"
    );
    const [source, setSource] = useState<SourceFilter>(
        initialSource === "fio_bank" || initialSource === "file_import" || initialSource === "cash"
            ? initialSource
            : "all"
    );
    const [profileId, setProfileId] = useState<number | null>(initialProfileId);
    const [searchDraft, setSearchDraft] = useState(initialQ);
    const [q, setQ] = useState(initialQ);
    const [memberId, setMemberId] = useState<number | null>(initialMemberId);
    const [withoutVs, setWithoutVs] = useState(initialWithoutVs === "1");
    const [sort, setSort] = useState<SortKey>(
        initialSort === "amount" || initialSort === "status" || initialSort === "source"
            ? initialSort
            : "paidAt"
    );
    const [sortDir, setSortDir] = useState<SortDir>(() => {
        if (initialSortDir === "asc" || initialSortDir === "desc") return initialSortDir;
        return initialSort === "amount" || initialSort === "status" || initialSort === "source" ? "asc" : "desc";
    });
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
            updateUrl({ q: searchDraft.trim() ? searchDraft.trim() : null });
        }, 250);

        return () => window.clearTimeout(timeout);
    }, [searchDraft, updateUrl]);

    const activeMember = useMemo(
        () => memberOptions.find(option => option.id === memberId) ?? null,
        [memberId, memberOptions]
    );

    const normalizedQuery = q.trim().toLowerCase();
    const queryDigits = normalizedQuery.replace(/\s/g, "");

    const rowMatchesQuery = useCallback((row: PaymentRow): boolean => {
        if (!normalizedQuery) return true;
        const haystack = [
            row.variableSymbol ?? "",
            row.counterpartyName ?? "",
            row.counterpartyAccount ?? "",
            row.message ?? "",
            row.note ?? "",
            row.allocations.map(allocation => allocation.memberName).join(" "),
        ].join(" ").toLowerCase();

        return haystack.includes(normalizedQuery) || (queryDigits !== "" && (row.variableSymbol ?? "").includes(queryDigits));
    }, [normalizedQuery, queryDigits]);

    const rowMatchesMember = useCallback((row: PaymentRow): boolean => {
        if (memberId === null) return true;
        return row.allocations.some(allocation => allocation.memberId === memberId);
    }, [memberId]);

    const rowMatchesWithoutVs = useCallback((row: PaymentRow): boolean => {
        if (!withoutVs) return true;
        return !row.variableSymbol?.trim();
    }, [withoutVs]);

    const rowMatchesSource = useCallback((row: PaymentRow): boolean => {
        if (source !== "all" && row.sourceType !== source) return false;
        if (profileId !== null && row.profileId !== profileId) return false;
        return true;
    }, [profileId, source]);

    const rowsForSourceCounts = useMemo(
        () => rows.filter(row => rowMatchesQuery(row) && rowMatchesMember(row) && rowMatchesWithoutVs(row)),
        [rows, rowMatchesMember, rowMatchesQuery, rowMatchesWithoutVs]
    );

    const rowsForStatusCounts = useMemo(
        () => rowsForSourceCounts.filter(row => rowMatchesSource(row)),
        [rowMatchesSource, rowsForSourceCounts]
    );

    const filteredRows = useMemo(() => {
        const next = rows
            .filter(row => rowMatchesQuery(row) && rowMatchesMember(row) && rowMatchesWithoutVs(row) && rowMatchesSource(row) && matchesStatus(row, status))
            .sort((left, right) => {
                let comparison = 0;

                if (sort === "paidAt") comparison = compareDate(left.paidAt, right.paidAt, sortDir);
                if (sort === "amount") comparison = compareNumber(left.amount, right.amount, sortDir);
                if (sort === "status") comparison = compareNumber(STATUS_ORDER[left.reconciliationStatus], STATUS_ORDER[right.reconciliationStatus], sortDir);
                if (sort === "source") comparison = compareText(sourceLabel(left), sourceLabel(right), sortDir);

                if (comparison !== 0) return comparison;

                if (sort !== "paidAt") {
                    const dateComparison = compareDate(left.paidAt, right.paidAt, "desc");
                    if (dateComparison !== 0) return dateComparison;
                }

                const amountComparison = compareNumber(left.amount, right.amount, "desc");
                if (amountComparison !== 0) return amountComparison;

                return right.id - left.id;
            });

        return next;
    }, [rowMatchesMember, rowMatchesQuery, rowMatchesSource, rowMatchesWithoutVs, rows, sort, sortDir, status]);

    const statusCounts = useMemo(() => ({
        open: rowsForStatusCounts.filter(row => matchesStatus(row, "open")).length,
        unmatched: rowsForStatusCounts.filter(row => row.reconciliationStatus === "unmatched").length,
        suggested: rowsForStatusCounts.filter(row => row.reconciliationStatus === "suggested").length,
        confirmed: rowsForStatusCounts.filter(row => row.reconciliationStatus === "confirmed").length,
        ignored: rowsForStatusCounts.filter(row => row.reconciliationStatus === "ignored").length,
    }), [rowsForStatusCounts]);

    const sourceCounts = useMemo(() => {
        const profiles = new Map<number, { id: number; name: string; count: number }>();

        for (const row of rowsForSourceCounts) {
            if (row.sourceType === "file_import" && row.profileId !== null && row.profileName) {
                const existing = profiles.get(row.profileId) ?? { id: row.profileId, name: row.profileName, count: 0 };
                existing.count += 1;
                profiles.set(row.profileId, existing);
            }
        }

        return {
            all: rowsForSourceCounts.length,
            fio_bank: rowsForSourceCounts.filter(row => row.sourceType === "fio_bank").length,
            file_import: rowsForSourceCounts.filter(row => row.sourceType === "file_import").length,
            cash: rowsForSourceCounts.filter(row => row.sourceType === "cash").length,
            profiles: Array.from(profiles.values()).sort((left, right) => left.name.localeCompare(right.name, "cs")),
        };
    }, [rowsForSourceCounts]);

    const memberCandidates = useMemo(() => {
        const query = memberSearch.trim().toLowerCase();
        if (!query) return memberOptions.slice(0, 12);

        return memberOptions
            .filter(option => {
                const label = `${option.fullName} ${option.nickname ?? ""} ${option.variableSymbol ?? ""}`.toLowerCase();
                return label.includes(query);
            })
            .slice(0, 12);
    }, [memberOptions, memberSearch]);

    const filterMenuLabel = useMemo(() => {
        const labels: string[] = [];
        if (status !== "open") labels.push(STATUS_LABELS[status]);
        if (profileId !== null) {
            const profile = sourceCounts.profiles.find(item => item.id === profileId);
            labels.push(profile?.name ?? "Profil");
        } else if (source !== "all") {
            labels.push(source === "fio_bank" ? "Fio banka" : source === "cash" ? "Hotovost" : "Soubor");
        }
        if (withoutVs) labels.push("Bez VS");
        if (yearMode === "all") labels.push("Všechny roky");

        if (labels.length === 0) return "Filtrovat";
        if (labels.length === 1) return labels[0] ?? "Filtrovat";
        return `Filtrovat (${labels.length})`;
    }, [profileId, source, sourceCounts.profiles, status, withoutVs, yearMode]);

    const hasActiveFilters = status !== "open"
        || source !== "all"
        || profileId !== null
        || memberId !== null
        || withoutVs
        || q.trim() !== ""
        || yearMode === "all"
        || sort !== "paidAt"
        || sortDir !== "desc";

    function handleStatusChange(next: StatusFilter) {
        setStatus(next);
        updateUrl({ status: next === "open" ? null : next });
    }

    function handleSourceChange(value: string) {
        if (value === "all") {
            setSource("all");
            setProfileId(null);
            updateUrl({ source: null, profileId: null });
            return;
        }

        if (value.startsWith("profile:")) {
            const nextProfileId = Number(value.slice("profile:".length));
            setSource("file_import");
            setProfileId(Number.isInteger(nextProfileId) && nextProfileId > 0 ? nextProfileId : null);
            updateUrl({ source: "file_import", profileId: String(nextProfileId) });
            return;
        }

        const nextSource = value as SourceFilter;
        setSource(nextSource);
        setProfileId(null);
        updateUrl({ source: nextSource === "all" ? null : nextSource, profileId: null });
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

    function handleSort(key: SortKey) {
        if (sort === key) {
            const nextDir: SortDir = sortDir === "asc" ? "desc" : "asc";
            setSortDir(nextDir);
            updateUrl({
                sort: key === "paidAt" && nextDir === "desc" ? null : key,
                dir: key === "paidAt" && nextDir === "desc" ? null : nextDir,
            });
            return;
        }

        setSort(key);
        setSortDir("asc");
        updateUrl({ sort: key === "paidAt" ? key : key, dir: "asc" });
    }

    function clearDropdownFilters() {
        setStatus("open");
        setSource("all");
        setProfileId(null);
        setMemberId(null);
        setMemberSearch("");
        setWithoutVs(false);
        updateUrl({ status: null, source: null, profileId: null, member: null, withoutVs: null });

        if (yearMode === "all") {
            const url = new URL(window.location.href);
            url.searchParams.delete("year");
            router.push(`${pathname}${url.search}`);
        }
    }

    function resetAllFilters() {
        setStatus("open");
        setSource("all");
        setProfileId(null);
        setSearchDraft("");
        setQ("");
        setMemberId(null);
        setMemberSearch("");
        setWithoutVs(false);
        setSort("paidAt");
        setSortDir("desc");

        const url = new URL(window.location.href);
        url.searchParams.delete("status");
        url.searchParams.delete("source");
        url.searchParams.delete("profileId");
        url.searchParams.delete("q");
        url.searchParams.delete("member");
        url.searchParams.delete("withoutVs");
        url.searchParams.delete("sort");
        url.searchParams.delete("dir");

        if (yearMode === "all") {
            url.searchParams.delete("year");
            router.push(`${pathname}${url.search}`);
            return;
        }

        window.history.replaceState({}, "", url.toString());
    }

    function openDetail(row: PaymentRow) {
        const currentUrl = `${pathname}${window.location.search}`;
        const label = activeMember
            ? `Platby: ${activeMember.fullName}`
            : yearMode === "all"
                ? "Platby — všechny roky"
                : `Platby ${yearMode}`;
        pushNavStack({ url: currentUrl, label });
        router.push(`/dashboard/payments/${row.id}?year=${row.paidAt.slice(0, 4)}`);
    }

    function openHistory() {
        const currentUrl = `${pathname}${window.location.search}`;
        const label = activeMember
            ? `Platby: ${activeMember.fullName}`
            : yearMode === "all"
                ? "Platby — všechny roky"
                : `Platby ${yearMode}`;
        pushNavStack({ url: currentUrl, label });
        router.push("/dashboard/payments/history");
    }

    function renderSortArrow(key: SortKey) {
        if (sort !== key) return null;
        return <span className="text-xs text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>;
    }

    const headerTitle = yearMode === "all" ? "Platby — všechny roky" : `Platby ${yearMode}`;
    const noData = rows.length === 0;

    return (
        <div className="space-y-5">
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <div className="flex min-w-max items-stretch gap-3 pb-1">
                    <div className="flex items-center gap-3 rounded-xl border bg-white px-3 py-3">
                        <h1 className="whitespace-nowrap text-2xl font-semibold text-gray-900">{headerTitle}</h1>

                        <div className="relative w-72">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                            <Input
                                type="search"
                                value={searchDraft}
                                onChange={event => setSearchDraft(event.target.value)}
                                placeholder="Hledat VS, člena, protistranu, zprávu…"
                                className="h-9 pl-8 pr-8 text-sm"
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

                        <div className="flex items-center gap-2">
                            {(["open", "unmatched", "suggested"] as StatusFilter[]).map(filterKey => (
                                <button
                                    key={filterKey}
                                    type="button"
                                    onClick={() => handleStatusChange(filterKey)}
                                    className={[
                                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                                        status === filterKey
                                            ? "border-[#26272b] bg-[#26272b] text-white"
                                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                                    ].join(" ")}
                                >
                                    {STATUS_LABELS[filterKey]}
                                    <span className={status === filterKey ? "text-xs text-white/80" : "text-xs text-gray-400"}>
                                        {statusCounts[filterKey]}
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
                                {activeMember.fullName}
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="h-9 gap-2 text-sm">
                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                    {filterMenuLabel}
                                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-96 space-y-4 p-4">
                                <div className="space-y-1.5">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Stav</p>
                                    <Select value={status} onValueChange={value => handleStatusChange(value as StatusFilter)}>
                                        <SelectTrigger className="h-9 text-sm">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="open">K řešení</SelectItem>
                                            <SelectItem value="unmatched">Nespárováno</SelectItem>
                                            <SelectItem value="suggested">Ke kontrole</SelectItem>
                                            <SelectItem value="confirmed">Potvrzeno</SelectItem>
                                            <SelectItem value="ignored">Ignorováno</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Zdroj</p>
                                    <Select
                                        value={profileId !== null ? `profile:${profileId}` : source}
                                        onValueChange={handleSourceChange}
                                    >
                                        <SelectTrigger className="h-9 text-sm">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Vše</SelectItem>
                                            <SelectItem value="fio_bank">Fio banka ({sourceCounts.fio_bank})</SelectItem>
                                            <SelectItem value="file_import">Soubor ({sourceCounts.file_import})</SelectItem>
                                            {sourceCounts.profiles.map(profile => (
                                                <SelectItem key={profile.id} value={`profile:${profile.id}`}>
                                                    {profile.name} ({profile.count})
                                                </SelectItem>
                                            ))}
                                            <SelectItem value="cash">Hotovost ({sourceCounts.cash})</SelectItem>
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
                                            memberCandidates.map(option => (
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
                                                        {option.fullName}
                                                        {option.nickname && <span className="ml-1 text-gray-400">({option.nickname})</span>}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-gray-700">
                                    <span>Bez VS</span>
                                    <input
                                        type="checkbox"
                                        checked={withoutVs}
                                        onChange={event => {
                                            const next = event.target.checked;
                                            setWithoutVs(next);
                                            updateUrl({ withoutVs: next ? "1" : null });
                                        }}
                                        className="h-4 w-4"
                                    />
                                </label>

                                <div className="flex justify-end">
                                    <Button variant="ghost" onClick={clearDropdownFilters} className="h-8 px-2 text-sm text-gray-500">
                                        Zrušit filtry
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>

                        <Button variant="outline" className="h-9 text-sm" onClick={openHistory}>
                            Historie importů
                        </Button>
                    </div>
                </div>
            </div>

            {noData ? (
                <div className="rounded-xl border bg-white px-6 py-12 text-center">
                    <p className="text-sm text-gray-500">
                        {yearMode === "all"
                            ? "Zatím nejsou evidované žádné platby."
                            : `Pro rok ${yearMode} zatím nejsou evidované žádné platby.`}
                    </p>
                    <div className="mt-3">
                        <Button variant="outline" onClick={() => router.push("/dashboard/imports/bank/file")} className="h-8 text-sm">
                            Nahrát výpis
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50">
                                    <TableHead>
                                        <button type="button" onClick={() => handleSort("paidAt")} className="inline-flex items-center gap-1 font-medium">
                                            Datum {renderSortArrow("paidAt")}
                                        </button>
                                    </TableHead>
                                    <TableHead className="text-right">
                                        <button type="button" onClick={() => handleSort("amount")} className="inline-flex items-center gap-1 font-medium">
                                            Částka {renderSortArrow("amount")}
                                        </button>
                                    </TableHead>
                                    <TableHead>VS</TableHead>
                                    <TableHead>Protistrana / Zpráva</TableHead>
                                    <TableHead>
                                        <button type="button" onClick={() => handleSort("source")} className="inline-flex items-center gap-1 font-medium">
                                            Zdroj {renderSortArrow("source")}
                                        </button>
                                    </TableHead>
                                    <TableHead>
                                        <button type="button" onClick={() => handleSort("status")} className="inline-flex items-center gap-1 font-medium">
                                            Stav {renderSortArrow("status")}
                                        </button>
                                    </TableHead>
                                    <TableHead>Párování</TableHead>
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
                                {filteredRows.map(row => (
                                    <TableRow key={row.id} className="cursor-pointer hover:bg-gray-50/70" onClick={() => openDetail(row)}>
                                        <TableCell className="whitespace-nowrap text-sm text-gray-600">{formatDate(row.paidAt)}</TableCell>
                                        <TableCell className="text-right font-mono text-sm font-medium text-green-700">{formatAmount(row.amount)}</TableCell>
                                        <TableCell className="font-mono text-xs text-gray-600">{row.variableSymbol ?? "—"}</TableCell>
                                        <TableCell className="max-w-[280px] text-sm">
                                            <div className="truncate font-medium text-gray-900">{row.counterpartyName ?? "—"}</div>
                                            <div className="truncate text-xs text-gray-500">{row.message ?? row.counterpartyAccount ?? "—"}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`border text-xs font-normal ${SOURCE_BADGE[row.sourceType] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                                {sourceLabel(row)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`border text-xs font-normal ${STATUS_BADGE[row.reconciliationStatus]}`}>
                                                {STATUS_LABELS[row.reconciliationStatus]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-gray-700">{pairingLabel(row)}</TableCell>
                                    </TableRow>
                                ))}
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
                        {filteredRows.map(row => (
                            <button
                                key={row.id}
                                type="button"
                                onClick={() => openDetail(row)}
                                className="w-full rounded-xl border border-gray-200 bg-white p-3.5 text-left transition-colors active:bg-gray-50"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-gray-900">{formatAmount(row.amount)}</p>
                                        <p className="mt-1 text-sm text-gray-500">
                                            {formatDate(row.paidAt)}{row.variableSymbol ? ` · VS ${row.variableSymbol}` : ""}
                                        </p>
                                    </div>
                                    <Badge className={`border text-xs font-normal ${STATUS_BADGE[row.reconciliationStatus]}`}>
                                        {STATUS_LABELS[row.reconciliationStatus]}
                                    </Badge>
                                </div>
                                <p className="mt-2 text-sm text-gray-600">{sourceLabel(row)} · {row.counterpartyName ?? "Bez protistrany"}</p>
                                <p className="mt-1 text-xs text-gray-500">{pairingLabel(row)}</p>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {!noData && (
                <p className="text-xs text-gray-500">
                    {filteredRows.length} {filteredRows.length === 1 ? "platba" : filteredRows.length >= 2 && filteredRows.length <= 4 ? "platby" : "plateb"}
                    {activeMember ? ` · člen ${activeMember.fullName}` : ""}
                </p>
            )}
        </div>
    );
}