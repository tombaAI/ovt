import { signOut } from "@/auth";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const session = await auth();

    return (
        <div className="min-h-screen flex flex-col">
            <header className="h-14 bg-[#26272b] flex items-center px-4 md:px-6 gap-3 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-[#82b965] text-lg tracking-tight">OVT</span>
                    <span className="text-white/50 font-light hidden sm:inline">Bohemians</span>
                </div>

                <nav className="flex-1 flex items-center gap-1 ml-4">
                    <Link
                        href="/dashboard"
                        className="text-white/70 hover:text-white text-sm px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors"
                    >
                        Přehled
                    </Link>
                    <Link
                        href="/dashboard/members"
                        className="text-white/70 hover:text-white text-sm px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors"
                    >
                        Členové
                    </Link>
                </nav>

                <div className="flex items-center gap-3 ml-auto">
                    <span className="text-white/60 text-sm hidden md:inline truncate max-w-[200px]">
                        {session?.user?.name ?? session?.user?.email}
                    </span>
                    <form
                        action={async () => {
                            "use server";
                            await signOut({ redirectTo: "/login" });
                        }}
                    >
                        <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="text-white/70 hover:text-white hover:bg-white/10"
                        >
                            Odhlásit
                        </Button>
                    </form>
                </div>
            </header>

            <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
                {children}
            </main>
        </div>
    );
}
