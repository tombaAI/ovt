import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">Informace</h1>
                <span className="inline-flex h-9 items-center px-3 rounded-md text-sm bg-gray-100 text-gray-400 border">
                    + Nová poznámka
                </span>
            </div>

            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-white p-5 space-y-2">
                        <Skeleton className="h-5 w-64" />
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                    </div>
                ))}
            </div>
        </div>
    );
}
