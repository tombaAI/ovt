import { getFinanceTjImports, getFinanceTjTransactions, getAllHospodareniWithReconciliation } from "@/lib/actions/finance-tj";
import { FinanceClient } from "./finance-client";

export default async function FinancePage() {
    const [imports, transactions, hospodareni] = await Promise.all([
        getFinanceTjImports(),
        getFinanceTjTransactions(),
        getAllHospodareniWithReconciliation(),
    ]);

    return <FinanceClient imports={imports} transactions={transactions} hospodareni={hospodareni} />;
}
