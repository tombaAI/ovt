"use client";

import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ImportDialog } from "./import-dialog";
import { ImportHospodareniDialog } from "./import-hospodareni-dialog";
import { ImportHistory } from "./import-history";
import { StavUctuTab } from "./stav-uctu-tab";
import type { FinanceTjImport, FinanceTjTransaction, HospodareniWithReconciliation, StavUctuData } from "@/lib/actions/finance-tj";
import { FileText } from "lucide-react";

interface Props {
    imports:      FinanceTjImport[];
    transactions: FinanceTjTransaction[];
    hospodareni:  HospodareniWithReconciliation[];
    stavUctu:     StavUctuData;
}

const SOURCE_LABELS: Record<string, string> = {
    BV: "Banka", IN: "Interní", FP: "Fakt. přij.", FV: "Fakt. vyd.",
    PO: "Pokladna", OP: "Ost. pohled.", OZ: "Ost. závazek",
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

// ── Detail importu výsledovky v popoveru ──────────────────────────────────────

function ImportPopover({ imp }: { imp: FinanceTjImport }) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors group">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:text-gray-600" />
                    <span className="hidden sm:inline">{formatDate(imp.reportDate)}</span>
                </button>
            </PopoverTrigger>
            <PopoverContent side="left" align="start" className="w-72 text-sm">
                <p className="font-medium text-gray-900 mb-2">Detail importu</p>
                <dl className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                        <dt className="text-gray-500">Datum sestavy</dt>
                        <dd className="text-gray-800 font-medium">{formatDate(imp.reportDate)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-gray-500">Středisko</dt>
                        <dd className="text-gray-800">{imp.costCenter}</dd>
                    </div>
                    {imp.filterFrom && imp.filterTo && (
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-500">Filtr období</dt>
                            <dd className="text-gray-800">{formatDate(imp.filterFrom)} – {formatDate(imp.filterTo)}</dd>
                        </div>
                    )}
                    {imp.fileName && (
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-500">Soubor</dt>
                            <dd className="text-gray-800 truncate max-w-[160px]" title={imp.fileName}>{imp.fileName}</dd>
                        </div>
                    )}
                    <div className="flex justify-between gap-2">
                        <dt className="text-gray-500">Importováno</dt>
                        <dd className="text-gray-800">{imp.importedAt.toLocaleDateString("cs-CZ")}</dd>
                    </div>
                    <div className="flex gap-4 pt-1 border-t border-gray-100 mt-1">
                        <span className="text-green-700 font-medium">+{imp.addedCount} nových</span>
                        <span className="text-gray-500">{imp.matchedCount} shodných</span>
                        {imp.conflictCount > 0 && (
                            <span className="text-amber-700 font-medium">{imp.conflictCount} konfliktů</span>
                        )}
                    </div>
                </dl>
            </PopoverContent>
        </Popover>
    );
}

// ── Přehled transakcí z výsledovek ───────────────────────────────────────────

function TransactionsTable({ transactions, imports }: { transactions: FinanceTjTransaction[]; imports: FinanceTjImport[] }) {
    const importMap = new Map(imports.map(i => [i.id, i]));
    const sorted = [...transactions].sort((a, b) => b.docDate.localeCompare(a.docDate));

    if (sorted.length === 0) {
        return (
            <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
                <p className="text-sm">Zatím žádné transakce.</p>
                <p className="text-xs mt-1">Nahrajte PDF výsledovky pomocí tlačítka výše.</p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border bg-white overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-24">Datum</TableHead>
                        <TableHead className="w-28">Doklad</TableHead>
                        <TableHead className="w-20">Zdroj</TableHead>
                        <TableHead className="hidden md:table-cell">Účet</TableHead>
                        <TableHead>Popis</TableHead>
                        <TableHead className="text-right w-32">MD</TableHead>
                        <TableHead className="text-right w-32">D</TableHead>
                        <TableHead className="w-24 text-center hidden sm:table-cell">Import</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sorted.map(tx => {
                        const imp = importMap.get(tx.importId);
                        return (
                            <TableRow key={tx.id}>
                                <TableCell className="text-gray-700 tabular-nums">{formatDate(tx.docDate)}</TableCell>
                                <TableCell className="font-mono text-xs text-gray-600">{tx.docNumber}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="text-xs font-normal">
                                        {SOURCE_LABELS[tx.sourceCode] ?? tx.sourceCode}
                                    </Badge>
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-gray-500 text-xs">
                                    {tx.accountCode} {tx.accountName}
                                </TableCell>
                                <TableCell className="text-gray-800">{tx.description}</TableCell>
                                <TableCell className={cn(
                                    "text-right font-mono text-sm tabular-nums",
                                    parseFloat(tx.debit) > 0 ? "text-red-700" : "text-gray-300"
                                )}>
                                    {formatAmount(tx.debit)}
                                </TableCell>
                                <TableCell className={cn(
                                    "text-right font-mono text-sm tabular-nums",
                                    parseFloat(tx.credit) > 0 ? "text-green-700" : "text-gray-300"
                                )}>
                                    {formatAmount(tx.credit)}
                                </TableCell>
                                <TableCell className="text-center hidden sm:table-cell">
                                    {imp && <ImportPopover imp={imp} />}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

// ── Hlavní klient ─────────────────────────────────────────────────────────────

export function FinanceClient({ imports, transactions, hospodareni, stavUctu }: Props) {
    const conflictCount = imports.reduce((s, i) => s + i.conflictCount, 0);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold text-gray-900">Finance z TJ</h1>
                <div className="flex items-center gap-2">
                    <ImportHospodareniDialog />
                    <ImportDialog />
                </div>
            </div>

            <Tabs defaultValue="prehled">
                <TabsList>
                    <TabsTrigger value="prehled">Přehled účetnictví</TabsTrigger>
                    <TabsTrigger value="stav">Stav účtu</TabsTrigger>
                    <TabsTrigger value="historie">
                        Historie importů
                        {conflictCount > 0 && (
                            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-medium text-white">
                                {conflictCount}
                            </span>
                        )}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="prehled" className="mt-4">
                    <TransactionsTable transactions={transactions} imports={imports} />
                </TabsContent>

                <TabsContent value="stav" className="mt-4">
                    <StavUctuTab data={stavUctu} />
                </TabsContent>

                <TabsContent value="historie" className="mt-4">
                    <ImportHistory imports={imports} hospodareni={hospodareni} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
