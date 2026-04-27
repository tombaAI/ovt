import { getSelectedYear } from "@/lib/actions/year";
import { getDefaultsFromPrevYear } from "@/lib/actions/contribution-periods";
import { ContributionsOverviewClient } from "./contributions-overview-client";
import { NoPeriodView } from "./prepare-dialog";
import {
    loadContributionMemberOptions,
    loadContributionPeriods,
    loadContributionRows,
} from "./data";

export type {
    ContribRow,
    MemberOption,
    Payment,
    PeriodDetail,
    PeriodTab,
} from "./data";

export default async function ContributionsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [selectedYear, params, periods, memberOptions] = await Promise.all([
        getSelectedYear(),
        searchParams,
        loadContributionPeriods(),
        loadContributionMemberOptions(),
    ]);

    const yearParam = typeof params.year === "string" ? params.year : null;
    const parsedYear = yearParam && yearParam !== "all" ? Number(yearParam) : NaN;
    const yearMode: number | "all" = yearParam === "all"
        ? "all"
        : Number.isInteger(parsedYear) && parsedYear > 0
            ? parsedYear
            : selectedYear;

    const period = yearMode === "all"
        ? null
        : periods.find(item => item.year === yearMode) ?? null;

    if (yearMode !== "all" && !period) {
        const prepareDefaults = await getDefaultsFromPrevYear(yearMode);
        return <NoPeriodView year={yearMode} defaults={prepareDefaults} />;
    }

    const rows = await loadContributionRows(yearMode);
    const prepareDefaults = period ? await getDefaultsFromPrevYear(period.year) : {};

    const initialMemberParam = typeof params.member === "string" ? Number(params.member) : NaN;

    return (
        <ContributionsOverviewClient
            period={period}
            rows={rows}
            memberOptions={memberOptions}
            yearMode={yearMode}
            selectedYear={selectedYear}
            initialFilter={(params.filter as string) ?? "all"}
            initialSort={(params.sort as string) ?? "lastName"}
            initialSortDir={(params.dir as string) ?? "asc"}
            initialQ={(params.q as string) ?? ""}
            initialMemberId={Number.isInteger(initialMemberParam) && initialMemberParam > 0 ? initialMemberParam : null}
            initialPaymentState={(params.state as string) ?? "all"}
            initialProcessState={(params.process as string) ?? "all"}
            initialBadgeFilters={(params.badges as string) ?? ""}
            canPrepare={period !== null}
            prepareDefaults={prepareDefaults}
        />
    );
}
