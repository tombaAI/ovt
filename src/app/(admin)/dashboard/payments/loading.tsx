import { Skeleton } from "@/components/ui/skeleton";

const STATUS_FILTERS = ["Nespárováno", "Ke kontrole", "Potvrzeno", "Ignorováno"];

export default function Loading() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">Platby</h1>
                <Skeleton className="h-9 w-32 rounded-md" />
            </div>

            <div className="flex gap-2 flex-wrap">
                {STATUS_FILTERS.map(label => (
                    <span key={label} className="inline-flex h-8 items-center px-3 rounded-full text-xs text-gray-400 bg-gray-100 border border-gray-200">
                        {label}
                    </span>
                ))}
            </div>

            <div className="rounded-lg border bg-white overflow-hidden text-sm">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Datum</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Částka</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">VS</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Protistrana / Zpráva</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Zdroj</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Stav</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Člen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 12 }).map((_, i) => (
                            <tr key={i} className="border-b last:border-0">
                                <td className="px-3 py-2.5"><Skeleton className="h-4 w-20" /></td>
                                <td className="px-3 py-2.5 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                                <td className="px-3 py-2.5"><Skeleton className="h-4 w-16" /></td>
                                <td className="px-3 py-2.5"><Skeleton className="h-4 w-44" /></td>
                                <td className="px-3 py-2.5"><Skeleton className="h-5 w-20 rounded-full" /></td>
                                <td className="px-3 py-2.5"><Skeleton className="h-5 w-24 rounded-full" /></td>
                                <td className="px-3 py-2.5"><Skeleton className="h-4 w-28" /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
