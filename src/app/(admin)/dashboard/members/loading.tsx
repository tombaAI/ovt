import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Loading() {
    return (
        <div className="space-y-3">
            {/* Header row — matches new layout */}
            <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900 mr-0.5">Členové …</h1>
                <Skeleton className="h-8 w-36 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
                <div className="ml-auto">
                    <Skeleton className="h-8 w-28 rounded-md" />
                </div>
            </div>

            {/* Table */}
            <div className="hidden md:block rounded-xl border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead>Jméno</TableHead>
                            <TableHead className="w-24">ČSK</TableHead>
                            <TableHead>Info</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: 12 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell className="py-3"><Skeleton className="h-4 w-40" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell>
                                    <div className="flex gap-1.5">
                                        {i % 3 === 0 && <Skeleton className="h-5 w-14 rounded" />}
                                        {i % 4 === 0 && <Skeleton className="h-5 w-10 rounded" />}
                                        {i % 5 === 0 && <Skeleton className="h-5 w-20 rounded" />}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-4 w-36" />
                            <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-5 w-14 rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}
