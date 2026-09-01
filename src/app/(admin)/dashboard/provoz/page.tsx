import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAnyOddilTreasurer } from "@/lib/treasurer";
import { getProvozniVydaje, getMembersForAutocomplete, type Oddil } from "@/lib/actions/events";
import { ODDIL_VALUES } from "@/lib/oddily-config";
import { ProvozClient } from "./provoz-client";

export default async function ProvozPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();
    if (!isAnyOddilTreasurer(session?.user?.email)) redirect("/dashboard");

    const params = await searchParams;
    const requestedOddil = typeof params.oddil === "string" ? params.oddil : undefined;
    const initialOddil: Oddil = (ODDIL_VALUES as string[]).includes(requestedOddil ?? "")
        ? (requestedOddil as Oddil)
        : "ovt";

    const [rows, allMembers] = await Promise.all([
        getProvozniVydaje(),
        getMembersForAutocomplete(),
    ]);

    return <ProvozClient rows={rows} allMembers={allMembers} initialOddil={initialOddil} />;
}
