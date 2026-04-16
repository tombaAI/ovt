import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const GRID_FILTERS = ["Všechny", "Mříž 1", "Mříž 2", "Mříž 3", "Dlouhé", "Neznámé", "Chybí"];

export default function Loading() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">Lodě</h1>
                <span className="inline-flex h-9 items-center px-3 rounded-md text-sm bg-gray-100 text-gray-400 border">
                    Přidat loď
                </span>
            </div>

            <div className="flex gap-2 flex-wrap">
                {GRID_FILTERS.map(label => (
                    <span key={label} className="inline-flex h-8 items-center px-3 rounded-full text-xs text-gray-400 bg-gray-100 border border-gray-200">
                        {label}
                    </span>
                ))}
            </div>

            <div className="rounded-lg border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-32">Umístění</TableHead>
                            <TableHead>Majitel</TableHead>
                            <TableHead className="hidden sm:table-cell">Popis</TableHead>
                            <TableHead className="hidden md:table-cell w-24">Barva</TableHead>
                            <TableHead className="hidden lg:table-cell w-36">Příspěvky</TableHead>
                            <TableHead className="w-24 text-center">Přítomna</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-40" /></TableCell>
                                <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell className="text-center"><Skeleton className="h-4 w-4 mx-auto rounded" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
