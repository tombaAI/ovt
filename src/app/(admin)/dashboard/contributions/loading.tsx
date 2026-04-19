import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSelectedYear } from "@/lib/year";

const FILTERS = ["Problémy", "Nezaplaceno", "Nedoplatek", "Přeplatek", "Zaplaceno", "S úkolem", "Všichni"];

export default async function Loading() {
    const selectedYear = await getSelectedYear();
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold text-gray-900">Příspěvky</h1>
                    <span className="inline-flex h-7 items-center px-3 rounded-full text-sm font-medium bg-[#327600]/10 text-[#327600] border border-[#327600]/20">
                        {selectedYear}
                    </span>
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
            </div>

            <div className="flex gap-2 flex-wrap">
                {FILTERS.map(label => (
                    <span key={label} className="inline-flex h-8 items-center px-3 rounded-full text-xs text-gray-400 bg-gray-100 border border-gray-200">
                        {label}
                    </span>
                ))}
            </div>

            <div className="rounded-lg border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Člen</TableHead>
                            <TableHead className="text-right">Předpis</TableHead>
                            <TableHead className="text-right">Zaplaceno</TableHead>
                            <TableHead className="text-right hidden lg:table-cell">Rozdíl</TableHead>
                            <TableHead className="hidden lg:table-cell">Datum</TableHead>
                            <TableHead>Stav</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                <TableCell className="hidden lg:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
