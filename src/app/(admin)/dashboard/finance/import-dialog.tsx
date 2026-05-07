"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { importTjFinancePdf } from "@/lib/actions/finance-tj";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Result =
    | { success: true; importId: number; added: number; matched: number; conflicts: number; suspicious: number }
    | { error: string }
    | null;

export function ImportDialog() {
    const [open, setOpen]         = useState(false);
    const [result, setResult]     = useState<Result>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const inputRef                = useRef<HTMLInputElement>(null);
    const [isPending, startTransition] = useTransition();

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        setFileName(e.target.files?.[0]?.name ?? null);
        setResult(null);
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        startTransition(async () => {
            setResult(await importTjFinancePdf(new FormData(e.currentTarget)));
        });
    }

    function handleOpenChange(v: boolean) {
        if (!v) { setResult(null); setFileName(null); if (inputRef.current) inputRef.current.value = ""; }
        setOpen(v);
    }

    const success = result && "success" in result ? result : null;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                    <Upload className="h-4 w-4" />
                    Importovat PDF
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Import výsledovky TJ</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div
                        className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gray-300 transition-colors"
                        onClick={() => inputRef.current?.click()}
                    >
                        <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                        {fileName
                            ? <p className="text-sm font-medium text-gray-700">{fileName}</p>
                            : <>
                                <p className="text-sm text-gray-500">Klikněte nebo přetáhněte PDF soubor</p>
                                <p className="text-xs text-gray-400 mt-1">Výsledovka po střediscích dokladově</p>
                            </>
                        }
                        <input ref={inputRef} type="file" name="file" accept=".pdf"
                            className="hidden" onChange={handleFileChange} />
                    </div>

                    {result && (
                        "error" in result
                            ? <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                {result.error}
                            </div>
                            : <div className="bg-green-50 rounded-md px-3 py-3 space-y-1">
                                <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    Import dokončen
                                </div>
                                <div className="grid grid-cols-4 gap-2 pt-1">
                                    <div className="text-center bg-white rounded p-2 border border-green-100">
                                        <div className="text-xl font-bold text-green-700">{success!.added}</div>
                                        <div className="text-xs text-gray-500">nových</div>
                                    </div>
                                    <div className="text-center bg-white rounded p-2 border border-green-100">
                                        <div className="text-xl font-bold text-gray-600">{success!.matched}</div>
                                        <div className="text-xs text-gray-500">shoduje se</div>
                                    </div>
                                    <div className="text-center bg-white rounded p-2 border border-green-100">
                                        <div className={`text-xl font-bold ${success!.conflicts > 0 ? "text-amber-600" : "text-gray-400"}`}>
                                            {success!.conflicts}
                                        </div>
                                        <div className="text-xs text-gray-500">konfliktů</div>
                                    </div>
                                    <div className="text-center bg-white rounded p-2 border border-green-100">
                                        <div className={`text-xl font-bold ${success!.suspicious > 0 ? "text-red-600" : "text-gray-400"}`}>
                                            {success!.suspicious}
                                        </div>
                                        <div className="text-xs text-gray-500">podezřelých</div>
                                    </div>
                                </div>
                                {success!.suspicious > 0 && (
                                    <p className="text-xs text-red-700 pt-1">
                                        V databázi máme transakce, které v importovaném PDF chybí. Zkontrolujte záložku Přehled účetnictví.
                                    </p>
                                )}
                            </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost"
                            onClick={() => handleOpenChange(false)} disabled={isPending}>
                            {success ? "Zavřít" : "Zrušit"}
                        </Button>
                        {!success && (
                            <Button type="submit" disabled={!fileName || isPending}>
                                {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                                Importovat
                            </Button>
                        )}
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
