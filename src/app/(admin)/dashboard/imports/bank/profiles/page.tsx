import { getImportProfiles } from "@/lib/actions/import";
import { BankProfilesClient } from "./bank-profiles-client";

export default async function BankProfilesPage() {
    const profiles = await getImportProfiles("bank");
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Profily — bankovní importy</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Uložená mapování sloupců pro CSV soubory z jednotlivých bank (Air Bank, Raiffeisen…).
                </p>
            </div>
            <BankProfilesClient profiles={profiles} />
        </div>
    );
}
