import { getNotes, getExistingCategories } from "@/lib/actions/notes";
import { InformaceClient } from "./informace-client";

export default async function InformacePage({
    searchParams,
}: {
    searchParams: Promise<{ archived?: string }>;
}) {
    const params = await searchParams;
    const includeArchived = params.archived === "1";
    const [notes, allCategories] = await Promise.all([
        getNotes(includeArchived),
        getExistingCategories(),
    ]);

    return <InformaceClient notes={notes} allCategories={allCategories} includeArchived={includeArchived} />;
}
