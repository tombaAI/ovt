import { ImportWizard } from "./import-wizard";
import { getImportProfiles } from "@/lib/actions/import";

export default async function CsvImportPage() {
    const profiles = await getImportProfiles();
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Import CSV / členská základna</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Nahrajte soubor CSV s daty členů, namapujte sloupce a porovnejte s naší databází.
                    Změny jsou přijímány ručně, po jedné hodnotě nebo po celém členovi.
                </p>
            </div>
            <ImportWizard profiles={profiles} />
        </div>
    );
}
