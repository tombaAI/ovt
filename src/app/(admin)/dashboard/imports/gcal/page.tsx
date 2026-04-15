import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GcalImportClient } from "./gcal-import-client";

export default function GcalImportPage() {
    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/dashboard/imports"
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3"
                >
                    <ArrowLeft size={14} />
                    Import dat
                </Link>
                <h1 className="text-xl font-semibold">Google Kalendář — import akcí</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Načte akce z Google Kalendáře a importuje vybrané do sekce Kalendář.
                    Akce s existujícím GCal ID se přeskočí (idempotentní).
                </p>
            </div>

            <GcalImportClient />
        </div>
    );
}
