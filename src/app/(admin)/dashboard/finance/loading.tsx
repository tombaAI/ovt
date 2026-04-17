import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Loading() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">Finance z TJ</h1>
                <span className="inline-flex h-9 items-center px-3 rounded-md text-sm bg-gray-100 text-gray-400 border">
                    Importovat PDF
                </span>
            </div>

            <div className="rounded-lg border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-6" />
                            <TableHead className="w-28">Datum sestavy</TableHead>
                            <TableHead className="w-32">Středisko</TableHead>
                            <TableHead className="hidden md:table-cell">Období filtru</TableHead>
                            <TableHead className="w-20">Počet</TableHead>
                            <TableHead className="hidden lg:table-cell">Soubor</TableHead>
                            <TableHead className="hidden lg:table-cell w-28">Importováno</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-40" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-48" /></TableCell>
                                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
