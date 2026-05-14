import { signOut } from "@/auth";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { NavLinks } from "./nav-links";
import { YearSelector } from "./year-selector";
import { MobileNav } from "./mobile-nav";
import { getSelectedYear } from "@/lib/actions/year";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const [session, selectedYear] = await Promise.all([auth(), getSelectedYear()]);
    const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            {/* Top bar */}
            <header className={`h-12 flex items-center px-4 gap-2 shrink-0 ${isStaging ? "bg-blue-700" : "bg-[#26272b]"}`}>
                <span className="font-bold text-[#82b965] text-base tracking-tight">OVT</span>
                <span className="text-white/40 font-light hidden sm:inline text-sm">Bohemians</span>

                <div className="flex-1" />

                <span className="text-white/50 text-xs hidden md:inline truncate max-w-[180px]">
                    {session?.user?.name ?? session?.user?.email}
                </span>

                <YearSelector year={selectedYear} />

                <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
                    <Button type="submit" variant="ghost" size="sm"
                        className="text-white/70 hover:text-white hover:bg-white/10 h-7 px-2 text-xs">
                        Odhlásit
                    </Button>
                </form>
            </header>

            {/* Desktop nav tab bar */}
            <nav className={`hidden md:flex border-t border-white/10 px-2 overflow-x-auto ${isStaging ? "bg-blue-800" : "bg-[#26272b]"}`}>
                <NavLinks />
            </nav>

            {/* Staging banner */}
            {isStaging && (
                <div className="bg-blue-600 text-white text-center py-2 font-bold tracking-widest text-sm uppercase">
                    ⚠ TESTOVACÍ STAGING PROSTŘEDÍ ⚠
                </div>
            )}

            {/* Main content — extra bottom padding on mobile for the nav bar */}
            <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto pb-20 md:pb-6">
                {children}
            </main>

            {/* Mobile bottom navigation */}
            <MobileNav />
        </div>
    );
}
