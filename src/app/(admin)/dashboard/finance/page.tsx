import { getFinanceTjImports, getFinanceTjTransactions } from "@/lib/actions/finance-tj";
import { FinanceClient } from "./finance-client";

export default async function FinancePage() {
    const [imports, transactions] = await Promise.all([
        getFinanceTjImports(),
        getFinanceTjTransactions(),
    ]);

    return <FinanceClient imports={imports} transactions={transactions} />;
}
