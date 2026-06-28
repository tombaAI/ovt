"use client";

import Link from "next/link";

type Props = {
    token: string;
    registrationStatus: "active" | "cancelled";
    editHref: string;
};

export function ForeignWaterRegistrationActions({ editHref }: Props) {
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
            </div>

            <p className="text-sm text-[#3f5a2c]">
                Potřebuješ přihlášku zrušit? Napiš prosím organizátorovi akce — online to kvůli
                vyúčtování (zálohy a doplatky) už není možné.
            </p>
        </section>
    );
}
