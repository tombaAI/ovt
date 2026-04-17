"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { importTjFinancePdf } from "@/lib/actions/finance-tj";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Result =
    | { success: true; importId: number; inserted: number; skipped: number }
    | { error: string }
    | null;

export function ImportDialog() {
    const [open, setOpen]       = useState(false);
    const [result, setResult]   = useState<Result>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const inputRef              = useRef<HTMLInputElement>(null);
    const [isPending, startTransition] = useTransition();

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        setFileName(f ? f.name : null);
        setResult(null);
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        startTransition(async () => {
            const res = await importTjFinancePdf(formData);
            setResult(res);
        });
    }

    function handleOpenChange(v: boolean) {
        if (!v) {
            setResult(null);
            setFileName(null);
            if (inputRef.current) inputRef.current.value = "";
        }
        setOpen(v);
    }

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
                        {fileName ? (
                            <p className="text-sm font-medium text-gray-700">{fileName}</p>
                        ) : (
                            <>
                                <p className="text-sm text-gray-500">Klikněte nebo přetáhněte PDF soubor</p>
                                <p className="text-xs text-gray-400 mt-1">Výsledovka po střediscích dokladově</p>
                            </>
                        )}
                        <input
                            ref={inputRef}
                            type="file"
                            name="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </div>

                    {result && (
                        "error" in result ? (
                            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                {result.error}
                            </div>
                        ) : (
                            <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
                                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>
                                    Importováno <strong>{result.inserted}</strong> transakcí
                                    {result.skipped > 0 && (
                                        <>, přeskočeno <strong>{result.skipped}</strong> duplicit</>
                                    )}
                                    .
                                </span>
                            </div>
                        )
                    )}

                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleOpenChange(false)}
                            disabled={isPending}
                        >
                            {result && "success" in result ? "Zavřít" : "Zrušit"}
                        </Button>
                        {!(result && "success" in result) && (
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
