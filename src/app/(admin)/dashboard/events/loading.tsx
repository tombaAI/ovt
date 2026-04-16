import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FILTERS = ["Vše", "V plánu", "Potvrzeno", "Proběhlo", "Zrušeno", "Bez termínu", "Bez vedoucího"];
const currentYear = new Date().getFullYear();

export default function Loading() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold text-gray-900">Kalendář</h1>
                    <span className="inline-flex h-7 items-center px-3 rounded-full text-sm font-medium bg-[#327600]/10 text-[#327600] border border-[#327600]/20">
                        {currentYear}
                    </span>
                </div>
                <span className="inline-flex h-9 items-center px-3 rounded-md text-sm bg-gray-100 text-gray-400 border">
                    Nová akce
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
                            <TableHead className="w-44">Termín</TableHead>
                            <TableHead>Akce</TableHead>
                            <TableHead className="hidden md:table-cell w-36">Typ</TableHead>
                            <TableHead className="hidden lg:table-cell">Vedoucí</TableHead>
                            <TableHead className="w-28">Stav</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
