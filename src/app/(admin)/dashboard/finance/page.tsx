import { getFinanceTjImports, getFinanceTjTransactions, getAllHospodareniWithReconciliation, getStavUctu } from "@/lib/actions/finance-tj";
import { FinanceClient } from "./finance-client";

export default async function FinancePage() {
    const [imports, transactions, hospodareni, stavUctu] = await Promise.all([
        getFinanceTjImports(),
        getFinanceTjTransactions(),
        getAllHospodareniWithReconciliation(),
        getStavUctu(),
    ]);

    return <FinanceClient imports={imports} transactions={transactions} hospodareni={hospodareni} stavUctu={stavUctu} />;
}
