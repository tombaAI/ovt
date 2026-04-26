"use client";

import { useState, useTransition } from "react";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, FileText, BarChart3 } from "lucide-react";
import { getImportLines } from "@/lib/actions/finance-tj";
import type { FinanceTjImport, ImportLine, HospodareniWithReconciliation } from "@/lib/actions/finance-tj";

interface Props {
    imports:     FinanceTjImport[];
    hospodareni: HospodareniWithReconciliation[];
}

const SOURCE_LABELS: Record<string, string> = {
    BV: "Banka", IN: "Interní", FP: "Fakt. přij.", FV: "Fakt. vyd.",
    PO: "Pokladna", OP: "Ost. pohled.", OZ: "Ost. závazek",
};

const FIELD_LABELS: Record<string, string> = {
    docDate: "datum", debit: "MD", credit: "D",
    description: "popis", accountCode: "účet", accountName: "název účtu",
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

function StatusBadge({ status, conflictFields }: { status: ImportLine["status"]; conflictFields: string[] }) {
    if (status === "added") return (
        <Badge className="bg-green-100 text-green-800 border-green-200 font-normal text-xs">Nové</Badge>
    );
    if (status === "matched") return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 font-normal text-xs">Shoduje se</Badge>
    );
    return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-normal text-xs" title={conflictFields.map(f => FIELD_LABELS[f] ?? f).join(", ")}>
            Konflikt: {conflictFields.map(f => FIELD_LABELS[f] ?? f).join(", ")}
        </Badge>
    );
}

// ── Řádek výsledovky (collapsible, lazy načítá lines) ─────────────────────────

function VysledovkaRow({ imp }: { imp: FinanceTjImport }) {
    const [expanded, setExpanded]      = useState(false);
    const [lines, setLines]            = useState<ImportLine[] | null>(null);
    const [isPending, startTransition] = useTransition();

    function toggle() {
        if (!expanded && lines === null) {
            startTransition(async () => setLines(await getImportLines(imp.id)));
        }
        setExpanded(v => !v);
    }

    const totalCount = imp.addedCount + imp.matchedCount + imp.conflictCount;

    return (
        <>
            <TableRow className="cursor-pointer hover:bg-gray-50" onClick={toggle}>
                <TableCell className="w-6 text-gray-400">
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800 text-sm">{imp.fileName ?? "—"}</span>
                                <Badge variant="outline" className="text-xs font-normal text-gray-500">výsledovka</Badge>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                                Sestava ze dne {formatDate(imp.reportDate)} · importováno {imp.importedAt.toLocaleDateString("cs-CZ")}
                                {imp.filterFrom && imp.filterTo && ` · období ${formatDate(imp.filterFrom)}–${formatDate(imp.filterTo)}`}
                            </div>
                        </div>
                    </div>
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">{totalCount} řádků</span>
                        {imp.addedCount > 0 && (
                            <Badge className="bg-green-100 text-green-800 border-green-200 font-normal text-xs">+{imp.addedCount} nových</Badge>
                        )}
                        {imp.matchedCount > 0 && (
                            <Badge className="bg-gray-100 text-gray-600 border-gray-200 font-normal text-xs">{imp.matchedCount} shodných</Badge>
                        )}
                        {imp.conflictCount > 0 && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-normal text-xs">{imp.conflictCount} konfliktů</Badge>
                        )}
                    </div>
                </TableCell>
            </TableRow>

            {expanded && (
                <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3} className="p-0 border-t border-gray-100">
                        {isPending ? (
                            <div className="p-4 text-sm text-gray-400 text-center">Načítám…</div>
                        ) : lines && lines.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-gray-50">
                                        <TableHead className="pl-8 w-24">Datum</TableHead>
                                        <TableHead className="w-28">Doklad</TableHead>
                                        <TableHead className="w-20">Zdroj</TableHead>
                                        <TableHead className="hidden md:table-cell">Účet</TableHead>
                                        <TableHead>Popis</TableHead>
                                        <TableHead className="text-right w-28">MD</TableHead>
                                        <TableHead className="text-right w-28">D</TableHead>
                                        <TableHead className="w-40">Výsledek</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lines.map(line => (
                                        <TableRow key={line.id} className={cn("text-sm", line.status === "conflict" && "bg-amber-50/60")}>
                                            <TableCell className="pl-8 tabular-nums text-gray-600">{formatDate(line.docDate)}</TableCell>
                                            <TableCell className="font-mono text-xs text-gray-600">{line.docNumber}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs font-normal">
                                                    {SOURCE_LABELS[line.sourceCode] ?? line.sourceCode}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell text-xs text-gray-500">{line.accountCode} {line.accountName}</TableCell>
                                            <TableCell className="text-gray-800">{line.description}</TableCell>
                                            <TableCell className={cn("text-right font-mono text-xs tabular-nums", parseFloat(line.debit) > 0 ? "text-red-700" : "text-gray-300")}>
                                                {formatAmount(line.debit)}
                                            </TableCell>
                                            <TableCell className={cn("text-right font-mono text-xs tabular-nums", parseFloat(line.credit) > 0 ? "text-green-700" : "text-gray-300")}>
                                                {formatAmount(line.credit)}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={line.status} conflictFields={line.conflictFields} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="p-4 text-sm text-gray-400 text-center">Žádné záznamy.</div>
                        )}
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}

// ── Řádek hospodaření (expandovatelný, zobrazí data našeho oddílu) ───────────

function HospodareniRow({ item }: { item: HospodareniWithReconciliation }) {
    const { imp, oddilRow } = item;
    const [expanded, setExpanded] = useState(false);

    function fmtKc(n: number): string {
        if (n === 0) return "—";
        return n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Kč";
    }

    return (
        <>
            <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(v => !v)}>
                <TableCell className="w-6 text-gray-400">
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-gray-400 shrink-0" />
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800 text-sm">{imp.fileName ?? "—"}</span>
                                <Badge variant="outline" className="text-xs font-normal text-gray-500">tabulka stavů</Badge>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                                Období {formatDate(imp.periodFrom)} – {formatDate(imp.periodTo)}
                                {imp.prevodYear && ` · přenos z roku ${imp.prevodYear}`}
                                {" · "}importováno {imp.importedAt.toLocaleDateString("cs-CZ")}
                            </div>
                        </div>
                    </div>
                </TableCell>
                <TableCell className="text-right">
                    <span className="text-xs text-gray-500">{imp.rowCount} oddílů</span>
                </TableCell>
            </TableRow>

            {expanded && oddilRow && (
                <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3} className="p-0 border-t border-gray-100 bg-gray-50/50">
                        <div className="px-8 py-3 text-sm">
                            <p className="font-medium text-gray-700 mb-2 text-xs">
                                Oddíl {oddilRow.oddilId} · {oddilRow.oddilName}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">Náklady</span>
                                    <span className={cn("font-mono tabular-nums", oddilRow.naklady > 0 ? "text-red-700" : "text-gray-400")}>{fmtKc(oddilRow.naklady)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">Výnosy</span>
                                    <span className={cn("font-mono tabular-nums", oddilRow.vynosy > 0 ? "text-green-700" : "text-gray-400")}>{fmtKc(oddilRow.vynosy)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">Výsledek</span>
                                    <span className={cn("font-mono tabular-nums font-medium", oddilRow.vysledek < 0 ? "text-red-700" : "text-green-700")}>{fmtKc(oddilRow.vysledek)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">Přenos {imp.prevodYear ? `z ${imp.prevodYear}` : ""}</span>
                                    <span className={cn("font-mono tabular-nums", oddilRow.prevod < 0 ? "text-red-700" : "text-gray-700")}>{fmtKc(oddilRow.prevod)}</span>
                                </div>
                                <div className="flex justify-between gap-4 sm:col-span-2">
                                    <span className="text-gray-700 font-semibold">Zůstatek na podúčtu</span>
                                    <span className={cn("font-mono tabular-nums font-bold", oddilRow.celkem < 0 ? "text-red-700" : "text-green-700")}>{fmtKc(oddilRow.celkem)}</span>
                                </div>
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}

// ── Export ────────────────────────────────────────────────────────────────────

type CombinedItem =
    | { kind: "vysledovka"; imp: FinanceTjImport }
    | { kind: "hospodareni"; item: HospodareniWithReconciliation };

export function ImportHistory({ imports, hospodareni }: Props) {
    const combined: CombinedItem[] = [
        ...imports.map(imp => ({ kind: "vysledovka" as const, imp })),
        ...hospodareni.map(item => ({ kind: "hospodareni" as const, item })),
    ].sort((a, b) => {
        const aT = a.kind === "vysledovka" ? a.imp.importedAt.getTime() : a.item.imp.importedAt.getTime();
        const bT = b.kind === "vysledovka" ? b.imp.importedAt.getTime() : b.item.imp.importedAt.getTime();
        return bT - aT;
    });

    if (combined.length === 0) {
        return (
            <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
                <p className="text-sm">Zatím žádné importy.</p>
                <p className="text-xs mt-1">Použijte tlačítka importu výše.</p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border bg-white overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-6" />
                        <TableHead>Soubor importu</TableHead>
                        <TableHead className="text-right">Výsledek</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {combined.map(item =>
                        item.kind === "vysledovka"
                            ? <VysledovkaRow key={`v-${item.imp.id}`} imp={item.imp} />
                            : <HospodareniRow key={`h-${item.item.imp.id}`} item={item.item} />
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
