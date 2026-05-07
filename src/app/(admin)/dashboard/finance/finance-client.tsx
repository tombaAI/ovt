"use client";

import { useState, useTransition } from "react";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ImportDialog } from "./import-dialog";
import { ImportHospodareniDialog } from "./import-hospodareni-dialog";
import { ImportHistory } from "./import-history";
import { StavUctuTab } from "./stav-uctu-tab";
import { AllocDialog } from "./alloc-dialog";
import type { FinanceTjImport, FinanceTjTransaction, HospodareniWithReconciliation, StavUctuData, ContribOption } from "@/lib/actions/finance-tj";
import { deleteSuspectTjTransaction, dismissSuspectTjTransaction } from "@/lib/actions/finance-tj";
import { FileText, Link2, AlertTriangle, Trash2, X } from "lucide-react";

interface Props {
    imports:      FinanceTjImport[];
    transactions: FinanceTjTransaction[];
    hospodareni:  HospodareniWithReconciliation[];
    stavUctu:     StavUctuData;
    allocSums:    Record<number, number>;   // txId → součet alokací
    contribs:     ContribOption[];          // všechny předpisy pro dialog
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

function TransactionsTable({
    transactions, imports, allocSums, contribs,
}: {
    transactions: FinanceTjTransaction[];
    imports:      FinanceTjImport[];
    allocSums:    Record<number, number>;
    contribs:     ContribOption[];
}) {
    const importMap = new Map(imports.map(i => [i.id, i]));
    const sorted = [...transactions].sort((a, b) => b.docDate.localeCompare(a.docDate));
    const [allocTx, setAllocTx] = useState<FinanceTjTransaction | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isPendingAction, startActionTransition] = useTransition();

    function handleDelete(txId: number) {
        setActionError(null);
        startActionTransition(async () => {
            const result = await deleteSuspectTjTransaction(txId);
            if ("error" in result) setActionError(result.error);
        });
    }

    function handleDismiss(txId: number) {
        setActionError(null);
        startActionTransition(async () => {
            const result = await dismissSuspectTjTransaction(txId);
            if ("error" in result) setActionError(result.error);
        });
    }

    const suspectCount = sorted.filter(tx => tx.isSuspect).length;

    if (sorted.length === 0) {
        return (
            <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
                <p className="text-sm">Zatím žádné transakce.</p>
                <p className="text-xs mt-1">Nahrajte PDF výsledovky pomocí tlačítka výše.</p>
            </div>
        );
    }

    return (
        <>
            {suspectCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                        <span className="font-medium">{suspectCount} podezřelá transakce{suspectCount > 1 ? "  " : ""}</span>
                        {" "}— nalezena v naší databázi, ale v posledním importu PDF za stejné období chybí.
                        Účetní ji pravděpodobně odebral ze sestavy. Zkontrolujte níže označené řádky.
                    </div>
                </div>
            )}
            {actionError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    {actionError}
                </div>
            )}

            <div className="rounded-lg border bg-white overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-24 shrink-0">Datum</TableHead>
                            <TableHead className="w-28 shrink-0">Doklad</TableHead>
                            <TableHead className="w-20 shrink-0">Zdroj</TableHead>
                            <TableHead className="hidden lg:table-cell w-40 shrink-0">Účet</TableHead>
                            <TableHead className="max-w-xs">Popis</TableHead>
                            <TableHead className="text-right w-28 shrink-0">MD</TableHead>
                            <TableHead className="text-right w-28 shrink-0">D</TableHead>
                            <TableHead className="w-44 text-center shrink-0">Párování</TableHead>
                            <TableHead className="w-16 text-center hidden xl:table-cell shrink-0">Import</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sorted.map(tx => {
                            const imp = importMap.get(tx.importId);
                            const credit = parseFloat(tx.credit);
                            const allocated = allocSums[tx.id] ?? 0;
                            const isPaired = credit > 0 && Math.abs(allocated - credit) < 0.01;
                            const isPartial = credit > 0 && allocated > 0 && !isPaired;
                            const hasAllocations = allocated > 0;

                            return (
                                <TableRow key={tx.id} className={cn(tx.isSuspect && "bg-red-50/70")}>
                                    <TableCell className="text-gray-700 tabular-nums">{formatDate(tx.docDate)}</TableCell>
                                    <TableCell className="font-mono text-xs text-gray-600">{tx.docNumber}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-xs font-normal">
                                            {SOURCE_LABELS[tx.sourceCode] ?? tx.sourceCode}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell text-gray-500 text-xs">
                                        {tx.accountCode} {tx.accountName}
                                    </TableCell>
                                    <TableCell className="text-gray-800 max-w-xs">
                                        <span className="block truncate" title={tx.description}>{tx.description}</span>
                                    </TableCell>
                                    <TableCell className={cn(
                                        "text-right font-mono text-sm tabular-nums",
                                        parseFloat(tx.debit) > 0 ? "text-red-700" : "text-gray-300"
                                    )}>
                                        {formatAmount(tx.debit)}
                                    </TableCell>
                                    <TableCell className={cn(
                                        "text-right font-mono text-sm tabular-nums",
                                        credit > 0 ? "text-green-700" : "text-gray-300"
                                    )}>
                                        {formatAmount(tx.credit)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {tx.isSuspect ? (
                                            <div className="flex items-center justify-center gap-1 flex-wrap">
                                                <Badge className="bg-red-100 text-red-800 border-red-200 font-normal text-xs gap-1">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    Podezřelá
                                                </Badge>
                                                {!hasAllocations && (
                                                    <Button size="sm" variant="ghost"
                                                        className="h-6 text-xs px-1.5 text-red-700 hover:text-red-900 hover:bg-red-100"
                                                        disabled={isPendingAction}
                                                        onClick={() => handleDelete(tx.id)}
                                                        title="Smazat transakci">
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                )}
                                                <Button size="sm" variant="ghost"
                                                    className="h-6 text-xs px-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                                                    disabled={isPendingAction}
                                                    onClick={() => handleDismiss(tx.id)}
                                                    title="Zamítnout příznak (ponechat transakci)">
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ) : credit > 0 ? (
                                            isPaired ? (
                                                <Badge className="bg-green-100 text-green-800 border-green-200 font-normal text-xs cursor-pointer"
                                                    onClick={() => setAllocTx(tx)}>
                                                    Napárováno
                                                </Badge>
                                            ) : isPartial ? (
                                                <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-normal text-xs cursor-pointer"
                                                    onClick={() => setAllocTx(tx)}>
                                                    Částečně
                                                </Badge>
                                            ) : (
                                                <Button size="sm" variant="outline"
                                                    className="h-6 text-xs px-2 gap-1"
                                                    onClick={() => setAllocTx(tx)}>
                                                    <Link2 className="h-3 w-3" />
                                                    Napárovat
                                                </Button>
                                            )
                                        ) : <span className="text-gray-300">—</span>}
                                    </TableCell>
                                    <TableCell className="text-center hidden xl:table-cell">
                                        {imp && <ImportPopover imp={imp} />}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {allocTx && (
                <AllocDialog
                    tx={allocTx}
                    contribs={contribs}
                    open={true}
                    onClose={() => setAllocTx(null)}
                />
            )}
        </>
    );
}

// ── Hlavní klient ─────────────────────────────────────────────────────────────

export function FinanceClient({ imports, transactions, hospodareni, stavUctu, allocSums, contribs }: Props) {
    const conflictCount = imports.reduce((s, i) => s + i.conflictCount, 0);
    const suspectCount  = transactions.filter(tx => tx.isSuspect).length;

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
                    <TabsTrigger value="prehled">
                        Přehled účetnictví
                        {suspectCount > 0 && (
                            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                                {suspectCount}
                            </span>
                        )}
                    </TabsTrigger>
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
                    <TransactionsTable transactions={transactions} imports={imports} allocSums={allocSums} contribs={contribs} />
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
