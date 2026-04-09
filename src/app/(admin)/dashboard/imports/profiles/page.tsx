import { getImportProfiles } from "@/lib/actions/import";
import { ProfilesClient } from "./profiles-client";

export default async function ProfilesPage() {
    const profiles = await getImportProfiles();
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Uložená mapování importu</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Profily urychlují opakované importy se stejnou strukturou souboru.
                </p>
            </div>
            <ProfilesClient profiles={profiles} />
        </div>
    );
}
