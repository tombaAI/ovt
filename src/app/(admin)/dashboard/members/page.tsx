import { getDb } from "@/lib/db";
import { members } from "@/db/schema";
import { asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export default async function MembersPage() {
    const db = getDb();
    const rows = await db
        .select()
        .from(members)
        .orderBy(asc(members.fullName));

    const active   = rows.filter(m => m.isActive).length;
    const inactive = rows.length - active;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Členové</h1>
                    <p className="text-gray-500 mt-1 text-sm">
                        {active} aktivních · {inactive} neaktivních · {rows.length} celkem
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead className="w-14 text-center">ID</TableHead>
                            <TableHead>Jméno</TableHead>
                            <TableHead className="hidden md:table-cell">Login</TableHead>
                            <TableHead className="hidden lg:table-cell">E-mail</TableHead>
                            <TableHead className="hidden xl:table-cell text-right">VS</TableHead>
                            <TableHead className="hidden xl:table-cell text-right">CSK</TableHead>
                            <TableHead className="text-center">Stav</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map(m => (
                            <TableRow key={m.id} className="hover:bg-gray-50/60">
                                <TableCell className="text-center text-gray-400 text-xs font-mono">
                                    {m.id}
                                </TableCell>
                                <TableCell className="font-medium">{m.fullName}</TableCell>
                                <TableCell className="hidden md:table-cell text-gray-500 text-sm">
                                    {m.userLogin ?? "—"}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-gray-500 text-sm">
                                    {m.email ?? "—"}
                                </TableCell>
                                <TableCell className="hidden xl:table-cell text-right font-mono text-sm text-gray-500">
                                    {m.variableSymbol ?? "—"}
                                </TableCell>
                                <TableCell className="hidden xl:table-cell text-right font-mono text-sm text-gray-500">
                                    {m.cskNumber ?? "—"}
                                </TableCell>
                                <TableCell className="text-center">
                                    {m.isActive
                                        ? <Badge className="bg-[#327600]/10 text-[#327600] border-0 text-xs">Aktivní</Badge>
                                        : <Badge variant="secondary" className="text-xs">Neaktivní</Badge>
                                    }
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
