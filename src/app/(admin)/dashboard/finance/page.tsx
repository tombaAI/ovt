import {
    getFinanceTjImports, getFinanceTjTransactions,
    getAllHospodareniWithReconciliation, getStavUctu,
    getAllTjAllocationSums, getContribsForAllocation,
} from "@/lib/actions/finance-tj";
import { getSelectedYear } from "@/lib/actions/year";
import { loadPaymentMemberOptions, loadPaymentRows } from "../payments/data";
import { FinanceClient } from "./finance-client";

export const dynamic = "force-dynamic";

export default async function FinancePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;

    const [imports, transactions, hospodareni, stavUctu, selectedYear, memberOptions] = await Promise.all([
        getFinanceTjImports(),
        getFinanceTjTransactions(),
        getAllHospodareniWithReconciliation(),
        getStavUctu(),
        getSelectedYear(),
        loadPaymentMemberOptions(),
    ]);

    const [allocSumsMap, contribs] = await Promise.all([
        getAllTjAllocationSums().catch(() => new Map<number, number>()),
        getContribsForAllocation().catch(() => []),
    ]);

    const yearParam = typeof params.year === "string" ? params.year : null;
    const parsedYear = yearParam && yearParam !== "all" ? Number(yearParam) : NaN;
    const yearMode: number | "all" = yearParam === "all"
        ? "all"
        : Number.isInteger(parsedYear) && parsedYear > 0
            ? parsedYear
            : selectedYear;

    const paymentRows = await loadPaymentRows(yearMode);

    return (
        <FinanceClient
            imports={imports}
            transactions={transactions}
            hospodareni={hospodareni}
            stavUctu={stavUctu}
            allocSums={Object.fromEntries(allocSumsMap)}
            contribs={contribs}
            paymentRows={paymentRows}
            memberOptions={memberOptions}
            yearMode={yearMode}
            selectedYear={selectedYear}
            initialStatus={(params.status as string) ?? "open"}
            initialSource={(params.source as string) ?? "all"}
            initialQ={(params.q as string) ?? ""}
            initialSort={(params.sort as string) ?? "paidAt"}
            initialSortDir={(params.dir as string) ?? "desc"}
            initialWithoutVs={(params.withoutVs as string) ?? "0"}
            initialMemberId={
                typeof params.member === "string" && Number.isInteger(Number(params.member)) && Number(params.member) > 0
                    ? Number(params.member)
                    : null
            }
            initialProfileId={
                typeof params.profileId === "string" && Number.isInteger(Number(params.profileId)) && Number(params.profileId) > 0
                    ? Number(params.profileId)
                    : null
            }
            initialTab={(params.tab as string) ?? "platby"}
        />
    );
}
