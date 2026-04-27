import {
    getFinanceTjImports, getFinanceTjTransactions,
    getAllHospodareniWithReconciliation, getStavUctu,
    getAllTjAllocationSums, getContribsForAllocation,
} from "@/lib/actions/finance-tj";
import { FinanceClient } from "./finance-client";

export default async function FinancePage() {
    const [imports, transactions, hospodareni, stavUctu, allocSums, contribs] = await Promise.all([
        getFinanceTjImports(),
        getFinanceTjTransactions(),
        getAllHospodareniWithReconciliation(),
        getStavUctu(),
        getAllTjAllocationSums(),
        getContribsForAllocation(),
    ]);

    return (
        <FinanceClient
            imports={imports}
            transactions={transactions}
            hospodareni={hospodareni}
            stavUctu={stavUctu}
            allocSums={Object.fromEntries(allocSums)}
            contribs={contribs}
        />
    );
}
