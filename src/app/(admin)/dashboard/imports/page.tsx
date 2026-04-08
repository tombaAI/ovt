import Link from "next/link";
import { ArrowRight } from "lucide-react";

const IMPORTS = [
    {
        href:        "/dashboard/imports/members-tj",
        title:       "Členové TJ Bohemians",
        description: "Synchronizace dat z evidence vodní turistiky (Power Automate → webhook).",
    },
] as const;

export default function ImportsPage() {
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Import dat</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Správa příchozích dat z externích zdrojů. Data se ukládají do importních tabulek
                    a do produkční databáze se přenášejí ručně po kontrole.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {IMPORTS.map(item => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3 hover:bg-gray-50 transition-colors group"
                    >
                        <div>
                            <p className="font-medium text-sm">{item.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        </div>
                        <ArrowRight size={16} className="mt-0.5 shrink-0 text-gray-400 group-hover:text-gray-700 transition-colors" />
                    </Link>
                ))}
            </div>
        </div>
    );
}
