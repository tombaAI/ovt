"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; exact?: boolean }[] = [
    { href: "/dashboard", label: "Přehled", exact: true },
    { href: "/dashboard/members", label: "Členové" },
    { href: "/dashboard/contributions", label: "Příspěvky" },
    { href: "/dashboard/events", label: "Kalendář" },
    { href: "/dashboard/finance", label: "Finance" },
    { href: "/dashboard/brigades", label: "Brigády" },
    { href: "/dashboard/hamerak", label: "Hamerák" },
    { href: "/dashboard/boats", label: "Lodě" },
    { href: "/dashboard/informace", label: "Informace" },
    { href: "/dashboard/imports", label: "Import dat" },
];

function isNavActive(pathname: string, href: string, exact?: boolean): boolean {
    if (exact) return pathname === href;
    if (pathname.startsWith(href)) return true;
    // Platby jsou nyní součástí Finance
    if (href === "/dashboard/finance" && pathname.startsWith("/dashboard/payments")) return true;
    return false;
}

export function NavLinks({ showProvoz }: { showProvoz: boolean }) {
    const pathname = usePathname();

    const items = NAV_ITEMS.flatMap(item => [
        item,
        ...(item.href === "/dashboard/finance" && showProvoz
            ? [{ href: "/dashboard/provoz", label: "Provoz" }]
            : []),
    ]);

    return (
        <>
            {items.map(({ href, label, exact }) => {
                const isActive = isNavActive(pathname, href, exact);
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
