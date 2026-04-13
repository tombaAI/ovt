import { signOut } from "@/auth";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const session = await auth();

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            {/* Top bar */}
            <header className="h-12 bg-[#26272b] flex items-center px-4 gap-2 shrink-0">
                <span className="font-bold text-[#82b965] text-base tracking-tight">OVT</span>
                <span className="text-white/40 font-light hidden sm:inline text-sm">Bohemians</span>

                <div className="flex-1" />

                <span className="text-white/50 text-xs hidden md:inline truncate max-w-[180px]">
                    {session?.user?.name ?? session?.user?.email}
                </span>

                <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
                    <Button type="submit" variant="ghost" size="sm"
                        className="text-white/70 hover:text-white hover:bg-white/10 h-7 px-2 text-xs">
                        Odhlásit
                    </Button>
                </form>
            </header>

            {/* Nav tab bar */}
            <nav className="bg-[#26272b] border-t border-white/10 flex px-2 overflow-x-auto">
                <Link href="/dashboard"
                    className="text-white/60 hover:text-white text-sm px-3 py-2 border-b-2 border-transparent hover:border-[#82b965] transition-colors whitespace-nowrap">
                    Přehled
                </Link>
                <Link href="/dashboard/members"
                    className="text-white/60 hover:text-white text-sm px-3 py-2 border-b-2 border-transparent hover:border-[#82b965] transition-colors whitespace-nowrap">
                    Členové
                </Link>
                <Link href="/dashboard/contributions"
                    className="text-white/60 hover:text-white text-sm px-3 py-2 border-b-2 border-transparent hover:border-[#82b965] transition-colors whitespace-nowrap">
                    Příspěvky
                </Link>
                <Link href="/dashboard/payments"
                    className="text-white/60 hover:text-white text-sm px-3 py-2 border-b-2 border-transparent hover:border-[#82b965] transition-colors whitespace-nowrap">
                    Platby
                </Link>
                <Link href="/dashboard/imports"
                    className="text-white/60 hover:text-white text-sm px-3 py-2 border-b-2 border-transparent hover:border-[#82b965] transition-colors whitespace-nowrap">
                    Import dat
                </Link>
            </nav>

            <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
                {children}
            </main>
        </div>
    );
}
