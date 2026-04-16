import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const currentYear = new Date().getFullYear();

export default function Loading() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold text-gray-900">Brigády</h1>
                    <span className="inline-flex h-7 items-center px-3 rounded-full text-sm font-medium bg-[#327600]/10 text-[#327600] border border-[#327600]/20">
                        {currentYear}
                    </span>
                </div>
                <span className="inline-flex h-9 items-center px-3 rounded-md text-sm bg-gray-100 text-gray-400 border">
                    Nová brigáda
                </span>
            </div>

            <div className="rounded-lg border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-32">Datum</TableHead>
                            <TableHead>Název / popis</TableHead>
                            <TableHead className="hidden md:table-cell">Vedoucí</TableHead>
                            <TableHead className="text-center w-28">Účastníci</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: 8 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                                <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                                <TableCell className="text-center"><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
