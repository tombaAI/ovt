"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Users, CreditCard, Wallet, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const PRIMARY_ITEMS = [
    { href: "/dashboard/members", label: "Členové", icon: Users },
    { href: "/dashboard/contributions", label: "Příspěvky", icon: CreditCard },
    { href: "/dashboard/payments", label: "Platby", icon: Wallet },
] as const;

const MORE_ITEMS = [
    { href: "/dashboard/forms", label: "Vyúčtování" },
    { href: "/dashboard/boats", label: "Lodě" },
    { href: "/dashboard/brigades", label: "Brigády" },
    { href: "/dashboard/events", label: "Kalendář" },
    { href: "/dashboard/finance", label: "Finance z TJ" },
    { href: "/dashboard/imports", label: "Import dat" },
    { href: "/dashboard/informace", label: "Informace" },
] as const;

export function MobileNav() {
    const pathname = usePathname();
    const [moreOpen, setMoreOpen] = useState(false);

    const isMoreActive = MORE_ITEMS.some(item => pathname.startsWith(item.href));

    return (
        <>
            <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#26272b] border-t border-white/10 flex safe-bottom">
                {PRIMARY_ITEMS.map(({ href, label, icon: Icon }) => {
                    const active = pathname.startsWith(href);
                    return (
                        <Link key={href} href={href}
                            className={cn(
                                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors",
                                active ? "text-[#82b965]" : "text-white/50 hover:text-white/80"
                            )}>
                            <Icon size={20} />
                            <span>{label}</span>
                        </Link>
                    );
                })}

                {/* ··· More */}
                <button
                    onClick={() => setMoreOpen(true)}
                    className={cn(
                        "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors",
                        isMoreActive ? "text-[#82b965]" : "text-white/50 hover:text-white/80"
                    )}>
                    <MoreHorizontal size={20} />
                    <span>Více</span>
                </button>
            </nav>

            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetContent side="bottom" className="pb-safe rounded-t-2xl bg-[#26272b] border-white/10">
                    <div className="pt-2 pb-6">
                        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
                        <div className="grid grid-cols-3 gap-1">
                            {MORE_ITEMS.map(({ href, label }) => {
                                const active = pathname.startsWith(href);
                                return (
                                    <Link key={href} href={href}
                                        onClick={() => setMoreOpen(false)}
                                        className={cn(
                                            "flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl text-xs transition-colors",
                                            active
                                                ? "bg-[#82b965]/20 text-[#82b965]"
                                                : "text-white/70 hover:bg-white/10 hover:text-white"
                                        )}>
                                        {label}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
