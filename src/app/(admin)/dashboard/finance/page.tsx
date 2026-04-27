import {
    getFinanceTjImports, getFinanceTjTransactions,
    getAllHospodareniWithReconciliation, getStavUctu,
    getAllTjAllocationSums, getContribsForAllocation,
} from "@/lib/actions/finance-tj";
import { FinanceClient } from "./finance-client";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
    const [imports, transactions, hospodareni, stavUctu] = await Promise.all([
        getFinanceTjImports(),
        getFinanceTjTransactions(),
        getAllHospodareniWithReconciliation(),
        getStavUctu(),
    ]);

    // Odolné — funguje i bez migrace import_fin_tj_allocations (tabulka nemusí existovat)
    const [allocSumsMap, contribs] = await Promise.all([
        getAllTjAllocationSums().catch(() => new Map<number, number>()),
        getContribsForAllocation().catch(() => []),
    ]);

    return (
        <FinanceClient
            imports={imports}
            transactions={transactions}
            hospodareni={hospodareni}
            stavUctu={stavUctu}
            allocSums={Object.fromEntries(allocSumsMap)}
            contribs={contribs}
        />
    );
}
