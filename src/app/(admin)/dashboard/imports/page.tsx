import Link from "next/link";
import { ArrowRight } from "lucide-react";

type ImportItem = { href: string; title: string; description: string };

function ImportCard({ item }: { item: ImportItem }) {
    return (
        <Link
            href={item.href}
            className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3 hover:bg-gray-50 transition-colors group"
        >
            <div>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
            </div>
            <ArrowRight size={16} className="mt-0.5 shrink-0 text-gray-400 group-hover:text-gray-700 transition-colors" />
        </Link>
    );
}

function Section({ title, description, items }: { title: string; description?: string; items: ImportItem[] }) {
    return (
        <div className="space-y-2">
            <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                {items.map(item => <ImportCard key={item.href} item={item} />)}
            </div>
        </div>
    );
}

const PAYMENTS: ImportItem[] = [
    {
        href:        "/dashboard/imports/bank",
        title:       "Platby z banky (Fio)",
        description: "Inkrementální synchronizace plateb z Fio bankovního účtu. Cron každý den v 6:00, ruční sync k dispozici.",
    },
    {
        href:        "/dashboard/imports/bank/file",
        title:       "Import bankovního souboru",
        description: "Nahrát CSV exportovaný z Air Bank nebo jiné banky. Transakce se uloží do platebního ledgeru.",
    },
    {
        href:        "/dashboard/imports/bank/profiles",
        title:       "Profily (bankovní importy)",
        description: "Správa mapování sloupců pro CSV soubory z jednotlivých bank.",
    },
    {
        href:        "/dashboard/imports/bank/history",
        title:       "Historie bankovních importů",
        description: "Log provedených importů bankovních souborů — čas, autor, počty transakcí.",
    },
];

const MEMBERS: ImportItem[] = [
    {
        href:        "/dashboard/imports/members-tj",
        title:       "Členové TJ Bohemians",
        description: "Porovnání a přenos dat z evidence vodní turistiky TJ Bohemians Praha.",
    },
    {
        href:        "/dashboard/imports/csv",
        title:       "Import CSV / ČSK data",
        description: "Nahrát CSV soubor s daty členů, namapovat sloupce a porovnat s databází.",
    },
    {
        href:        "/dashboard/imports/profiles",
        title:       "Profily (import členů)",
        description: "Správa uložených mapování sloupců pro CSV soubory s daty členů.",
    },
    {
        href:        "/dashboard/imports/history",
        title:       "Historie importů členů",
        description: "Log provedených importů členské základny — čas, autor, přijaté změny.",
    },
];

const CALENDAR: ImportItem[] = [
    {
        href:        "/dashboard/imports/gcal",
        title:       "Import z Google Kalendáře",
        description: "Načte akce z Google Kalendáře a importuje vybrané do sekce Kalendář. Idempotentní — duplicity se přeskočí.",
    },
];

export default function ImportsPage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-xl font-semibold">Import dat</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Správa příchozích dat z externích zdrojů.
                </p>
            </div>

            <Section
                title="Platby"
                description="Příchozí platby z bankovního účtu a souborových exportů."
                items={PAYMENTS}
            />
            <Section
                title="Členská základna"
                description="Import a synchronizace dat členů z externích registrů."
                items={MEMBERS}
            />
            <Section
                title="Kalendář"
                description="Synchronizace akcí s Google Kalendářem."
                items={CALENDAR}
            />
        </div>
    );
}
