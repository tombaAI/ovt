"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { importTjHospodareniPdf } from "@/lib/actions/finance-tj";
import { BarChart3, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Result =
    | { success: true; importId: number; rowCount: number }
    | { error: string }
    | null;

export function ImportHospodareniDialog() {
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
            setResult(await importTjHospodareniPdf(new FormData(e.currentTarget)));
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
                <Button size="sm" variant="outline" className="gap-1.5">
                    <BarChart3 className="h-4 w-4" />
                    Import tabulka stavů
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Import výsledků hospodaření oddílů</DialogTitle>
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
                                <p className="text-xs text-gray-400 mt-1">Výsledky hospodaření oddílů</p>
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
                                <p className="text-xs text-green-700 pl-6">
                                    Importováno {success!.rowCount} oddílů
                                </p>
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
