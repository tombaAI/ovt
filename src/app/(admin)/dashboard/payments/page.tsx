import { getSelectedYear } from "@/lib/actions/year";
import { loadPaymentMemberOptions, loadPaymentRows } from "./data";
import { PaymentsOverviewClient } from "./payments-overview-client";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [selectedYear, params, memberOptions] = await Promise.all([
        getSelectedYear(),
        searchParams,
        loadPaymentMemberOptions(),
    ]);

    const yearParam = typeof params.year === "string" ? params.year : null;
    const parsedYear = yearParam && yearParam !== "all" ? Number(yearParam) : NaN;
    const yearMode: number | "all" = yearParam === "all"
        ? "all"
        : Number.isInteger(parsedYear) && parsedYear > 0
            ? parsedYear
            : selectedYear;

    const rows = await loadPaymentRows(yearMode);
    const initialMemberParam = typeof params.member === "string" ? Number(params.member) : NaN;
    const initialProfileParam = typeof params.profileId === "string" ? Number(params.profileId) : NaN;

    return (
        <PaymentsOverviewClient
                rows={rows}
            memberOptions={memberOptions}
            yearMode={yearMode}
                selectedYear={selectedYear}
            initialStatus={(params.status as string) ?? "open"}
            initialSource={(params.source as string) ?? "all"}
            initialProfileId={Number.isInteger(initialProfileParam) && initialProfileParam > 0 ? initialProfileParam : null}
            initialQ={(params.q as string) ?? ""}
            initialMemberId={Number.isInteger(initialMemberParam) && initialMemberParam > 0 ? initialMemberParam : null}
            initialSort={(params.sort as string) ?? "paidAt"}
            initialSortDir={(params.dir as string) ?? "desc"}
            initialWithoutVs={(params.withoutVs as string) ?? "0"}
        />
    );
}
