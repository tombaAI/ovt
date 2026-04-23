import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <div className="max-w-2xl mx-auto">
            {/* Page header */}
            <div className="flex items-center gap-3 mb-6">
                <Skeleton className="h-5 w-32" />
                <div className="flex-1">
                    <Skeleton className="h-7 w-48" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-24 rounded-md" />
                    <Skeleton className="h-8 w-16 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                </div>
            </div>

            {/* Fields card */}
            <div className="rounded-xl border bg-white px-4 mb-4 divide-y">
                {["Příjmení", "Jméno", "Přezdívka", "GDPR", "E-mail", "Telefon", "Adresa", "Var. symbol", "Číslo ČSK", "Člen od", "Pohlaví", "Poznámka"].map(label => (
                    <div key={label} className="py-3 flex gap-4">
                        <Skeleton className="h-4 w-24 shrink-0" />
                        <Skeleton className="h-4 w-40" />
                    </div>
                ))}
            </div>

            {/* Todo card */}
            <div className="rounded-xl border bg-white px-4 py-3 mb-4 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-16 w-full rounded-md" />
            </div>

            {/* Členství card */}
            <div className="rounded-xl border bg-white px-4 py-3 mb-4 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-28" />
            </div>
        </div>
    );
}
