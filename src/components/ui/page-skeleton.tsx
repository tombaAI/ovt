import { Skeleton } from "@/components/ui/skeleton";

/** Kostra pro stránky s filtry + tabulkou (Členové, Příspěvky, Platby, …) */
export function TablePageSkeleton() {
    return (
        <div className="space-y-4">
            {/* Nadpis + akce */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-9 w-28" />
            </div>

            {/* Filter pills */}
            <div className="flex gap-2 flex-wrap">
                {[72, 88, 64, 96, 76, 80].map((w, i) => (
                    <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
                ))}
            </div>

            {/* Tabulka */}
            <div className="rounded-lg border bg-white overflow-hidden">
                <div className="flex gap-6 px-4 py-3 border-b bg-gray-50/80">
                    {[140, 100, 120, 80, 70].map((w, i) => (
                        <Skeleton key={i} className="h-3.5" style={{ width: w }} />
                    ))}
                </div>
                {Array.from({ length: 9 }).map((_, row) => (
                    <div key={row} className="flex gap-6 px-4 py-3 border-b last:border-0">
                        {[140, 100, 120, 80, 70].map((w, col) => (
                            <Skeleton
                                key={col}
                                className="h-3.5"
                                style={{ width: w * (0.6 + Math.random() * 0.7) }}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Kostra pro dashboard — mřížka dlaždic */
export function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <Skeleton className="h-7 w-44" />
                <Skeleton className="h-4 w-52" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-white p-4 space-y-3">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-3 w-36" />
                    </div>
                ))}
            </div>
        </div>
    );
}
