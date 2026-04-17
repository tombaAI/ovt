import { getNotes } from "@/lib/actions/notes";
import { InformaceClient } from "./informace-client";

export default async function InformacePage({
    searchParams,
}: {
    searchParams: Promise<{ archived?: string }>;
}) {
    const params = await searchParams;
    const includeArchived = params.archived === "1";
    const notes = await getNotes(includeArchived);

    return <InformaceClient notes={notes} includeArchived={includeArchived} />;
}
