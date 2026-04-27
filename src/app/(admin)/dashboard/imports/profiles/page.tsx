import { getImportProfiles } from "@/lib/actions/import";
import { ProfilesClient } from "./profiles-client";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
    const profiles = await getImportProfiles("member");
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Profily — import členů</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Uložená mapování sloupců pro CSV soubory s daty členů (ČSK, TJ Bohemians…).
                </p>
            </div>
            <ProfilesClient profiles={profiles} />
        </div>
    );
}
