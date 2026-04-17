"use client";

import { useState } from "react";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ImportDialog } from "./import-dialog";
import type { FinanceTjImport, FinanceTjTransaction } from "@/lib/actions/finance-tj";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
    imports:      FinanceTjImport[];
    transactions: FinanceTjTransaction[];
}

const SOURCE_LABELS: Record<string, string> = {
    BV: "Banka",
    IN: "Interní",
    FP: "Fakt. přij.",
    FV: "Fakt. vyd.",
    PO: "Pokladna",
    OP: "Ost. pohled.",
    OZ: "Ost. závazek",
};

function formatAmount(val: string): string {
    const n = parseFloat(val);
    if (n === 0) return "—";
    return n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Kč";
}

function formatDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
}

// ── Import řádek (collapsible) ────────────────────────────────────────────────

function ImportRow({
    imp,
    transactions,
}: {
    imp: FinanceTjImport;
    transactions: FinanceTjTransaction[];
}) {
    const [expanded, setExpanded] = useState(false);
    const mine = transactions.filter(t => t.importId === imp.id);

    return (
        <>
            <TableRow
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(v => !v)}
            >
                <TableCell className="w-6 text-gray-400">
                    {expanded
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />}
                </TableCell>
                <TableCell className="font-medium">{formatDate(imp.reportDate)}</TableCell>
                <TableCell className="text-gray-600">Středisko {imp.costCenter}</TableCell>
                <TableCell className="text-gray-500 text-sm hidden md:table-cell">
                    {imp.filterFrom && imp.filterTo
                        ? `${formatDate(imp.filterFrom)} – ${formatDate(imp.filterTo)}`
                        : imp.filterRaw ?? "—"}
                </TableCell>
                <TableCell>
                    <Badge variant="secondary">{imp.txCount} tx</Badge>
                </TableCell>
                <TableCell className="text-gray-400 text-xs hidden lg:table-cell">
                    {imp.fileName ?? "—"}
                </TableCell>
                <TableCell className="text-gray-400 text-xs hidden lg:table-cell">
                    {imp.importedAt.toLocaleDateString("cs-CZ")}
                </TableCell>
            </TableRow>

            {expanded && mine.length > 0 && (
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableCell colSpan={7} className="p-0">
                        <div className="border-t border-gray-100">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-gray-100">
                                        <TableHead className="pl-10 w-28">Datum</TableHead>
                                        <TableHead className="w-32">Doklad</TableHead>
                                        <TableHead className="w-24">Zdroj</TableHead>
                                        <TableHead>Účet</TableHead>
                                        <TableHead>Popis</TableHead>
                                        <TableHead className="text-right w-32">MD</TableHead>
                                        <TableHead className="text-right w-32">D</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mine.map(tx => (
                                        <TableRow key={tx.id} className="text-sm">
                                            <TableCell className="pl-10 text-gray-600">
                                                {formatDate(tx.docDate)}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-gray-700">
                                                {tx.docNumber}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs font-normal">
                                                    {SOURCE_LABELS[tx.sourceCode] ?? tx.sourceCode}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-gray-500 text-xs">
                                                {tx.accountCode} {tx.accountName}
                                            </TableCell>
                                            <TableCell className="text-gray-800">
                                                {tx.description}
                                            </TableCell>
                                            <TableCell className={cn(
                                                "text-right font-mono text-sm",
                                                parseFloat(tx.debit) > 0 ? "text-red-700" : "text-gray-300"
                                            )}>
                                                {formatAmount(tx.debit)}
                                            </TableCell>
                                            <TableCell className={cn(
                                                "text-right font-mono text-sm",
                                                parseFloat(tx.credit) > 0 ? "text-green-700" : "text-gray-300"
                                            )}>
                                                {formatAmount(tx.credit)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}

// ── Hlavní klient ─────────────────────────────────────────────────────────────

export function FinanceClient({ imports, transactions }: Props) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">Finance z TJ</h1>
                <ImportDialog />
            </div>

            {imports.length === 0 ? (
                <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
                    <p className="text-sm">Zatím žádné importy.</p>
                    <p className="text-xs mt-1">Nahrajte PDF výsledovky pomocí tlačítka výše.</p>
                </div>
            ) : (
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
                            {imports.map(imp => (
                                <ImportRow
                                    key={imp.id}
                                    imp={imp}
                                    transactions={transactions}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}
