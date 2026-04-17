import { getNotes, getExistingTags } from "@/lib/actions/notes";
import { InformaceClient } from "./informace-client";

export default async function InformacePage({
    searchParams,
}: {
    searchParams: Promise<{ archived?: string }>;
}) {
    const params = await searchParams;
    const includeArchived = params.archived === "1";
    const [notes, allTags] = await Promise.all([
        getNotes(includeArchived),
        getExistingTags(),
    ]);

    return <InformaceClient notes={notes} allTags={allTags} includeArchived={includeArchived} />;
}
