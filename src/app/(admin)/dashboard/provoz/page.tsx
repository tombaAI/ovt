import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isTreasurer } from "@/lib/treasurer";
import { getProvozniVydaje, getMembersForAutocomplete } from "@/lib/actions/events";
import { ProvozClient } from "./provoz-client";

export default async function ProvozPage() {
    const session = await auth();
    if (!isTreasurer(session?.user?.email)) redirect("/dashboard");

    const [rows, allMembers] = await Promise.all([
        getProvozniVydaje(),
        getMembersForAutocomplete(),
    ]);

    return <ProvozClient rows={rows} allMembers={allMembers} />;
}
