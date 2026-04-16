import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FILTERS = ["Aktivní", "Výbor", "Vedoucí TOM", "Individuální sleva", "Vstup / ukončení", "Bez brigády", "S úkolem", "Změny z TJ"];

export default function Loading() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">Členové</h1>
                <span className="inline-flex h-9 items-center px-3 rounded-md text-sm bg-gray-100 text-gray-400 border">
                    Nový člen
                </span>
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
                            <TableHead className="w-12 text-center">ID</TableHead>
                            <TableHead>Jméno</TableHead>
                            <TableHead className="hidden lg:table-cell">E-mail</TableHead>
                            <TableHead className="hidden xl:table-cell text-right">VS</TableHead>
                            <TableHead>Role / členství</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-7 mx-auto" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-44" /></TableCell>
                                <TableCell className="hidden xl:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
