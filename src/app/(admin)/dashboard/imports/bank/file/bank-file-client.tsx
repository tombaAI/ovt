"use client";

import { useState, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";
import { importBankFileAction, type BankImportResult } from "@/lib/actions/bank-file-import";

type Profile = { id: number; name: string; note: string | null };

interface Props {
    profiles: Profile[];
}

function ResultCard({ result }: { result: BankImportResult }) {
    return (
        <div className="rounded-xl border bg-green-50 border-green-200 p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-800">
                <CheckCircle size={16} />
                <span className="font-medium text-sm">Import dokončen</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
                {[
                    { label: "Řádků v souboru", val: result.total,               color: "" },
                    { label: "Přeskočeno",       val: result.filtered,            color: "text-muted-foreground" },
                    { label: "Nových transakcí", val: result.inserted,            color: "text-green-700 font-semibold" },
                    { label: "Duplikátů",        val: result.duplicates,          color: "text-amber-600" },
                    { label: "Auto-potvrzeno",   val: result.autoMatch.confirmed, color: "text-green-700 font-semibold" },
                    { label: "Ke kontrole",      val: result.autoMatch.suggested, color: "text-amber-600" },
                ].map(s => (
                    <div key={s.label} className="rounded-lg border bg-white px-3 py-2 text-center">
                        <p className={`font-semibold text-base ${s.color}`}>{s.val}</p>
                        <p className="text-muted-foreground leading-tight">{s.label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function BankFileClient({ profiles }: Props) {
    const [profileId, setProfileId] = useState<number | "">(profiles[0]?.id ?? "");
    const [file,      setFile]      = useState<File | null>(null);
    const [result,    setResult]    = useState<BankImportResult | null>(null);
    const [error,     setError]     = useState<string | null>(null);
    const [pending,   startTransition] = useTransition();
    const fileRef = useRef<HTMLInputElement>(null);

    function handleSubmit() {
        if (!profileId || !file) return;
        setResult(null);
        setError(null);

        const formData = new FormData();
        formData.append("file", file);

        startTransition(async () => {
            const res = await importBankFileAction(formData, Number(profileId));
            if ("error" in res) {
                setError(res.error);
            } else {
                setResult(res.result);
                setFile(null);
                if (fileRef.current) fileRef.current.value = "";
            }
        });
    }

    if (profiles.length === 0) {
        return (
            <div className="rounded-xl border px-6 py-10 text-center text-sm text-muted-foreground">
                Nejsou k dispozici žádné bankovní importní profily.
                Vytvořte profil nejprve v sekci <strong>Profily (bankovní importy)</strong>.
            </div>
        );
    }

    return (
        <div className="space-y-5 max-w-xl">
            {/* Profil */}
            <div className="space-y-1.5">
                <Label htmlFor="profile">Importní profil</Label>
                <select
                    id="profile"
                    value={profileId}
                    onChange={e => setProfileId(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                    {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
                {profiles.find(p => p.id === profileId)?.note && (
                    <p className="text-xs text-muted-foreground">
                        {profiles.find(p => p.id === profileId)?.note}
                    </p>
                )}
            </div>

            {/* Soubor */}
            <div className="space-y-1.5">
                <Label htmlFor="csvfile">Soubor CSV</Label>
                <input
                    ref={fileRef}
                    id="csvfile"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm file:border-0 file:bg-transparent file:text-sm file:font-medium cursor-pointer"
                />
                {file && (
                    <p className="text-xs text-muted-foreground">
                        {file.name} ({(file.size / 1024).toFixed(0)} kB)
                    </p>
                )}
            </div>

            {/* Submit */}
            <Button
                onClick={handleSubmit}
                disabled={!profileId || !file || pending}
                className="bg-[#327600] hover:bg-[#2a6400]"
            >
                <Upload size={14} className="mr-1.5" />
                {pending ? "Importuji…" : "Spustit import"}
            </Button>

            {/* Výsledek */}
            {result && <ResultCard result={result} />}

            {/* Chyba */}
            {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    {error}
                </div>
            )}
        </div>
    );
}
