"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelForeignWaterRegistrationByToken } from "@/lib/actions/event-registrations";

type Props = {
    token: string;
    registrationStatus: "active" | "cancelled";
    editHref: string;
};

export function ForeignWaterRegistrationActions({ token, registrationStatus, editHref }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [info, setInfo] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    function cancelRegistration() {
        const confirmed = window.confirm("Opravdu chceš zrušit tuto přihlášku? Tuto akci lze případně změnit přes úpravu přihlášky.");
        if (!confirmed) return;

        setInfo(null);
        setError(null);

        startTransition(async () => {
            const result = await cancelForeignWaterRegistrationByToken(token);
            if ("error" in result) {
                setError(result.error);
                return;
            }

            setInfo("Přihláška byla zrušena.");
            router.refresh();
        });
    }

    return (
        <section className="rounded-xl border border-[#d1e4c3] bg-[#f6fbf2] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[#244217]">Správa přihlášky</h2>
            <div className="flex flex-wrap gap-2">
                <Link
                    href={editHref}
                    className="inline-flex items-center justify-center rounded-md border border-[#98bf7c] bg-white px-4 py-2 text-sm font-medium text-[#2f4f1e] hover:bg-[#f0f7e8]"
                >
                    Upravit přihlášku
                </Link>

                <button
                    type="button"
                    onClick={cancelRegistration}
                    disabled={isPending || registrationStatus === "cancelled"}
                    className="inline-flex items-center justify-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Ruším..." : registrationStatus === "cancelled" ? "Přihláška je zrušená" : "Zrušit přihlášku"}
                </button>
            </div>

            {info && (
                <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    {info}
                </p>
            )}

            {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            )}
        </section>
    );
}
