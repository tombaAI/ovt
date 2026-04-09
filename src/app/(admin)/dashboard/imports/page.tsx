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

const RECURRING: ImportItem[] = [
    {
        href:        "/dashboard/imports/members-tj",
        title:       "Členové TJ Bohemians",
        description: "Data z evidence vodní turistiky přicházejí automaticky přes Power Automate → webhook.",
    },
];

const ONETIME: ImportItem[] = [
    {
        href:        "/dashboard/imports/csv",
        title:       "Import CSV / ČSK data",
        description: "Nahrát CSV soubor, namapovat sloupce a porovnat s databází členů. Podporuje uložená mapování.",
    },
];

const TOOLS: ImportItem[] = [
    {
        href:        "/dashboard/imports/profiles",
        title:       "Uložená mapování",
        description: "Správa profilů pro opakované CSV importy — název, poznámka, mapování sloupců.",
    },
    {
        href:        "/dashboard/imports/history",
        title:       "Historie importů",
        description: "Log provedených importů — čas, autor, přijaté změny.",
    },
];

function Section({ title, items }: { title: string; items: ImportItem[] }) {
    return (
        <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
                {items.map(item => <ImportCard key={item.href} item={item} />)}
            </div>
        </div>
    );
}

export default function ImportsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl font-semibold">Import dat</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Správa příchozích dat z externích zdrojů. Data se ukládají do importních tabulek
                    a do produkční databáze se přenášejí ručně po kontrole.
                </p>
            </div>

            <Section title="Pravidelné synchronizace" items={RECURRING} />
            <Section title="Jednorázové importy" items={ONETIME} />
            <Section title="Nástroje" items={TOOLS} />
        </div>
    );
}
