"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; exact?: boolean }[] = [
    { href: "/dashboard", label: "Přehled", exact: true },
    { href: "/dashboard/members", label: "Členové" },
    { href: "/dashboard/contributions", label: "Příspěvky" },
    { href: "/dashboard/payments", label: "Platby" },
    { href: "/dashboard/vyuctovani", label: "Vyúčtování" },
    { href: "/dashboard/events", label: "Kalendář" },
    { href: "/dashboard/brigades", label: "Brigády" },
    { href: "/dashboard/boats", label: "Lodě" },
    { href: "/dashboard/finance", label: "Finance z TJ" },
    { href: "/dashboard/imports", label: "Import dat" },
    { href: "/dashboard/informace", label: "Informace" },
];

export function NavLinks() {
    const pathname = usePathname();

    return (
        <>
            {NAV_ITEMS.map(({ href, label, exact }) => {
                const isActive = exact ? pathname === href : pathname.startsWith(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        className={cn(
                            "text-sm px-3 py-2 border-b-2 transition-colors whitespace-nowrap",
                            isActive
                                ? "text-white border-[#82b965]"
                                : "text-white/60 hover:text-white border-transparent hover:border-[#82b965]"
                        )}
                    >
                        {label}
                    </Link>
                );
            })}
        </>
    );
}
