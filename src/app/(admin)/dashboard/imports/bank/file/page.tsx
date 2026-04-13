import { getBankImportProfiles } from "@/lib/actions/bank-file-import";
import { BankFileClient } from "./bank-file-client";

export const dynamic = "force-dynamic";

export default async function BankFileImportPage() {
    const profiles = await getBankImportProfiles();
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Import bankovního souboru</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Nahrát CSV exportovaný z Air Bank nebo jiné banky.
                    Příchozí transakce se uloží do staging tabulky a automaticky se párují s platebním ledgerem.
                </p>
            </div>
            <BankFileClient profiles={profiles} />
        </div>
    );
}
