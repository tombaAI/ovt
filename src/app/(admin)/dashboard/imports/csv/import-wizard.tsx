"use client";

import { useState, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    parseImportFile, computeImportDiff, applyImportFieldChange,
    saveImportHistory, saveImportProfile,
    type ParseFileResult, type ComputeDiffResult,
} from "@/lib/actions/import";
import type { ParseResult, ColumnMapping, MatchKeyConfig, DiffResult, DiffRow, FieldDiff } from "@/lib/import/types";
import { IMPORTABLE_FIELDS, MATCH_KEY_FIELDS } from "@/lib/import/types";
import type { ImportMapping } from "@/db/schema";

type Step = 1 | 2 | 3 | 4;

type ProfileRow = {
    id: number;
    name: string;
    note: string | null;
    delimiter: string | null;
    encoding: string | null;
    headerRowIndex: number;
    matchKeys: unknown;
    mappings: unknown;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function encLabel(e: string) {
    if (e === "utf-8")   return "UTF-8";
    if (e === "win-1250") return "Windows-1250 (středoevropské)";
    return e;
}

function delimLabel(d: string) {
    if (d === ";") return "středník  ;";
    if (d === ",") return "čárka  ,";
    if (d === "\t") return "tabulátor  ⇥";
    if (d === "|") return "svislítko  |";
    return d;
}

// ── Step 1: Upload ─────────────────────────────────────────────────────────────

function Step1Upload({
    profiles,
    onParsed,
}: {
    profiles: ProfileRow[];
    onParsed: (result: ParseResult, mappings: ColumnMapping[], filename: string, profileId: number | null) => void;
}) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [selectedProfile, setSelectedProfile] = useState<string>("none");
    const fileRef = useRef<HTMLInputElement>(null);

    function submit() {
        const file = fileRef.current?.files?.[0];
        if (!file) { setError("Vyberte soubor"); return; }
        setError(null);

        startTransition(async () => {
            const fd = new FormData();
            fd.set("file", file);
            const res: ParseFileResult = await parseImportFile(fd);
            if ("error" in res) { setError(res.error); return; }
            const profileId = selectedProfile !== "none" ? Number(selectedProfile) : null;
            onParsed(res.data, res.suggestedMappings, res.filename, profileId);
        });
    }

    return (
        <div className="space-y-5 max-w-xl">
            <div className="space-y-2">
                <Label htmlFor="csv-file">Soubor CSV</Label>
                <Input id="csv-file" type="file" accept=".csv,.tsv,.txt" ref={fileRef} />
                <p className="text-xs text-muted-foreground">Podporované formáty: CSV, TSV. Max 5 MB.</p>
            </div>

            {profiles.length > 0 && (
                <div className="space-y-2">
                    <Label>Použít uložené mapování (volitelné)</Label>
                    <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                        <SelectTrigger>
                            <SelectValue placeholder="— bez profilu, mapování ručně —" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">— bez profilu —</SelectItem>
                            {profiles.map(p => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                    {p.name}
                                    {p.note && <span className="text-muted-foreground ml-2 text-xs">{p.note}</span>}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        Profil s odpovídajícími názvy sloupců přeskočí krok mapování.
                    </p>
                </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button onClick={submit} disabled={pending} className="bg-[#327600] hover:bg-[#2a6400]">
                {pending ? "Načítám…" : "Načíst soubor →"}
            </Button>
        </div>
    );
}

// ── Step 2: Mapping ────────────────────────────────────────────────────────────

function Step2Mapping({
    parseResult,
    initialMappings,
    onConfirm,
    onBack,
}: {
    parseResult: ParseResult;
    initialMappings: ColumnMapping[];
    onConfirm: (mappings: ColumnMapping[], matchKeys: MatchKeyConfig[]) => void;
    onBack: () => void;
}) {
    const allFields = Object.keys(IMPORTABLE_FIELDS) as Array<keyof typeof IMPORTABLE_FIELDS>;

    // Stav mapování: sourceCol → targetField | "" (nemapováno)
    const [mappings, setMappings] = useState<Record<string, string>>(() => {
        const m: Record<string, string> = {};
        for (const col of parseResult.columns) {
            const found = initialMappings.find(x => x.sourceCol === col.name);
            m[col.name] = found?.targetField ?? "";
        }
        return m;
    });

    // Párovací klíče
    const [matchField, setMatchField] = useState<string>(() => {
        // Preferuj cskNumber nebo birthNumber pokud jsou namapované
        for (const k of MATCH_KEY_FIELDS) {
            if (Object.values(mappings).includes(k)) return k;
        }
        return "";
    });

    const [error, setError] = useState<string | null>(null);

    function setMapping(col: string, field: string) {
        setMappings(prev => {
            const next = { ...prev };
            // Zruš existující mapování tohoto pole na jiném sloupci
            if (field) {
                for (const [k, v] of Object.entries(next)) {
                    if (v === field && k !== col) next[k] = "";
                }
            }
            next[col] = field;
            return next;
        });
    }

    function confirm() {
        if (!matchField) { setError("Vyberte párovací klíč"); return; }
        const matchSourceCol = Object.entries(mappings).find(([, v]) => v === matchField)?.[0];
        if (!matchSourceCol) { setError(`Párovací klíč „${IMPORTABLE_FIELDS[matchField as keyof typeof IMPORTABLE_FIELDS]}" musí být namapován`); return; }

        const finalMappings: ColumnMapping[] = Object.entries(mappings)
            .filter(([, v]) => v !== "")
            .map(([sourceCol, targetField]) => ({ sourceCol, targetField: targetField as keyof typeof IMPORTABLE_FIELDS }));

        if (finalMappings.length === 0) { setError("Namapujte alespoň jedno pole"); return; }

        const matchKeys: MatchKeyConfig[] = [{ sourceCol: matchSourceCol, targetField: matchField as keyof typeof IMPORTABLE_FIELDS }];
        setError(null);
        onConfirm(finalMappings, matchKeys);
    }

    const usedFields = new Set(Object.values(mappings).filter(Boolean));

    return (
        <div className="space-y-5">
            {/* Encoding / delimiter info */}
            <div className="rounded-xl border px-4 py-3 text-sm space-y-1 bg-gray-50">
                <div className="flex gap-6 flex-wrap text-xs text-muted-foreground">
                    <span>Kódování: <strong className="text-foreground">{encLabel(parseResult.encoding)}</strong>
                        {!parseResult.encodingConfident && <Badge className="ml-2 bg-amber-100 text-amber-700 border-0 text-[10px]">neověřeno</Badge>}
                    </span>
                    <span>Oddělovač: <strong className="text-foreground">{delimLabel(parseResult.delimiter)}</strong></span>
                    <span>Hlavička: řádek <strong className="text-foreground">{parseResult.headerRowIndex + 1}</strong></span>
                    <span>Celkem řádků: <strong className="text-foreground">{parseResult.totalRows}</strong></span>
                </div>
                {!parseResult.encodingConfident && (
                    <p className="text-xs text-amber-700">
                        ⚠ Kódování se nepodařilo spolehlivě určit. Níže vidíte ukázku dat — ověřte, zda jsou znaky čitelné.
                        Pokud ne, vraťte se a zvolte jiné kódování.
                    </p>
                )}
            </div>

            {/* Mapovací tabulka */}
            <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            <th className="text-left px-3 py-2.5 w-1/3">Sloupec v souboru</th>
                            <th className="text-left px-3 py-2.5 w-1/4">Ukázka hodnot</th>
                            <th className="text-left px-3 py-2.5">Mapovat na pole</th>
                        </tr>
                    </thead>
                    <tbody>
                        {parseResult.columns.map(col => (
                            <tr key={col.name} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-3 py-2 font-mono text-xs text-gray-700">{col.name}</td>
                                <td className="px-3 py-2 text-xs text-muted-foreground max-w-[180px]">
                                    <span className="truncate block" title={col.samples.join(", ")}>
                                        {col.samples.slice(0, 2).join(", ") || "—"}
                                    </span>
                                </td>
                                <td className="px-3 py-2">
                                    <Select value={mappings[col.name] || "none"} onValueChange={(v: string) => setMapping(col.name, v === "none" ? "" : v)}>
                                        <SelectTrigger className="h-8 text-sm">
                                            <SelectValue placeholder="— nemapovat —" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">— nemapovat —</SelectItem>
                                            {allFields.map(f => (
                                                <SelectItem key={f} value={f} disabled={usedFields.has(f) && mappings[col.name] !== f}>
                                                    {IMPORTABLE_FIELDS[f]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Párovací klíč */}
            <div className="space-y-2 max-w-sm">
                <Label>Párovací klíč <span className="text-red-500">*</span></Label>
                <Select value={matchField || "none"} onValueChange={(v: string) => setMatchField(v === "none" ? "" : v)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Vyberte pole pro párování se členy v DB" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">— nevybráno —</SelectItem>
                        {Object.entries(mappings)
                            .filter(([, v]) => v !== "")
                            .map(([col, field]) => (
                                <SelectItem key={field} value={field}>
                                    {IMPORTABLE_FIELDS[field as keyof typeof IMPORTABLE_FIELDS]} (ze sloupce: {col})
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    Pole, podle kterého se řádky souboru párují s členy v naší DB. Ideálně číslo ČSK nebo rodné číslo.
                </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
                <Button variant="outline" onClick={onBack}>← Zpět</Button>
                <Button onClick={confirm} className="bg-[#327600] hover:bg-[#2a6400]">
                    Porovnat s databází →
                </Button>
            </div>
        </div>
    );
}

// ── Step 3: Diff view ─────────────────────────────────────────────────────────

function FieldDiffRow({
    diff, memberId, filename,
    applied, onApplied,
}: {
    diff: FieldDiff;
    memberId: number;
    filename: string;
    applied: boolean;
    onApplied: (field: string) => void;
}) {
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    function apply() {
        if (!diff.importValue) return;
        startTransition(async () => {
            const r = await applyImportFieldChange(memberId, diff.field, diff.importValue!, filename);
            if ("error" in r) { setErr(r.error); return; }
            onApplied(diff.field);
        });
    }

    if (applied) {
        return (
            <tr className="border-b last:border-0 bg-green-50/40">
                <td className="px-3 py-2 text-muted-foreground text-xs">{diff.label}</td>
                <td className="px-3 py-2 text-xs text-green-700 font-medium" colSpan={3}>✓ Přijato: {diff.importValue}</td>
            </tr>
        );
    }

    return (
        <tr className="border-b last:border-0 hover:bg-muted/20">
            <td className="px-3 py-2 text-xs text-muted-foreground font-medium">{diff.label}</td>
            <td className="px-3 py-2 text-xs line-through text-red-400">{diff.ourValue ?? "—"}</td>
            <td className="px-3 py-2 text-xs font-medium text-sky-700">{diff.importValue ?? "—"}</td>
            <td className="px-3 py-2 text-right">
                {err ? <span className="text-xs text-red-600">{err}</span> : (
                    <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                        disabled={pending} onClick={apply}>
                        ← Přijmout
                    </Button>
                )}
            </td>
        </tr>
    );
}

function MemberDiffCard({
    row, filename, onAllApplied,
}: {
    row: DiffRow;
    filename: string;
    onAllApplied: () => void;
}) {
    const [applied, setApplied] = useState<Set<string>>(new Set());

    function onApplied(field: string) {
        const next = new Set([...applied, field]);
        setApplied(next);
        if (next.size === row.diffs.length) onAllApplied();
    }

    const remaining = row.diffs.filter(d => !applied.has(d.field));

    return (
        <div className="rounded-xl border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b">
                <div>
                    <span className="font-medium text-sm">{row.memberName}</span>
                    {row.memberName !== row.importName && (
                        <span className="text-xs text-muted-foreground ml-2">(import: {row.importName})</span>
                    )}
                </div>
                <span className="text-xs text-muted-foreground">
                    {remaining.length > 0 ? `${remaining.length} rozdíl${remaining.length === 1 ? "" : "y"}` : "Vše přijato"}
                </span>
            </div>
            <table className="w-full">
                <thead>
                    <tr className="border-b text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-gray-50/50">
                        <th className="text-left px-3 py-1.5 w-28">Pole</th>
                        <th className="text-left px-3 py-1.5">Naše data</th>
                        <th className="text-left px-3 py-1.5">Import</th>
                        <th className="w-20" />
                    </tr>
                </thead>
                <tbody>
                    {row.diffs.map(diff => (
                        <FieldDiffRow key={diff.field} diff={diff}
                            memberId={row.memberId!} filename={filename}
                            applied={applied.has(diff.field)} onApplied={onApplied} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Step3Diff({
    diff, filename, totalImportRows,
    onBack, onFinish,
}: {
    diff: DiffResult;
    filename: string;
    totalImportRows: number;
    onBack: () => void;
    onFinish: () => void;
}) {
    const [tab, setTab] = useState<"diffs" | "new" | "duplicates" | "only_db" | "empty">("diffs");
    const [resolvedRows, setResolvedRows] = useState<Set<number>>(new Set());

    function markResolved(memberId: number) {
        setResolvedRows(prev => new Set([...prev, memberId]));
    }

    const tabs: { key: typeof tab; label: string; count: number; cls?: string }[] = [
        { key: "diffs",      label: "Rozdíly",              count: diff.matched.length },
        { key: "new",        label: "Noví v souboru",       count: diff.newCandidates.length, cls: "text-blue-700" },
        { key: "duplicates", label: "Duplicity v souboru",  count: diff.duplicates.length,    cls: "text-red-700" },
        { key: "only_db",    label: "Chybí v souboru",      count: diff.onlyInDb.length,       cls: "text-amber-700" },
        { key: "empty",      label: "Prázdné hodnoty",      count: Object.keys(diff.emptyValueFields).length },
    ];

    return (
        <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                    { label: "Řádků v souboru", val: totalImportRows },
                    { label: "Spárováno s DB",  val: diff.matched.length + (diff.matched.length - resolvedRows.size) },
                    { label: "Nových kandidátů", val: diff.newCandidates.length },
                    { label: "Chybí v souboru", val: diff.onlyInDb.length },
                ].map(s => (
                    <div key={s.label} className="rounded-xl border px-3 py-2">
                        <p className="text-xl font-semibold">{s.val}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 flex-wrap">
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={[
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                            tab === t.key ? "bg-[#26272b] text-white border-transparent" : "bg-white border-gray-200 hover:bg-gray-50",
                        ].join(" ")}>
                        <span className={tab !== t.key ? (t.cls ?? "") : ""}>{t.label}</span>
                        {t.count > 0 && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tab === t.key ? "bg-white/20" : "bg-gray-100 text-gray-600"}`}>
                                {t.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {tab === "diffs" && (
                <div className="space-y-3">
                    {diff.matched.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">Žádné rozdíly — data jsou shodná.</p>
                    )}
                    {diff.matched.map(row => (
                        <MemberDiffCard key={row.memberId} row={row} filename={filename}
                            onAllApplied={() => markResolved(row.memberId!)} />
                    ))}
                </div>
            )}

            {tab === "new" && (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Tito lidé jsou v importovaném souboru, ale nenašli se v naší databázi.
                        Databáze členů se <strong>nikdy neupravuje automaticky</strong> — případné přidání je nutné provést ručně.
                    </p>
                    {diff.newCandidates.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">Žádní noví kandidáti.</p>
                    )}
                    <div className="rounded-xl border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    <th className="text-left px-3 py-2">Jméno z importu</th>
                                    <th className="text-left px-3 py-2 hidden sm:table-cell">Data</th>
                                </tr>
                            </thead>
                            <tbody>
                                {diff.newCandidates.map(row => (
                                    <tr key={row.sourceIndex} className="border-b last:border-0">
                                        <td className="px-3 py-2 font-medium">{row.importName}</td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                                            {row.diffs.slice(0, 3).map(d => `${d.label}: ${d.importValue}`).join(" · ")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === "duplicates" && (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Tyto řádky mají v souboru duplicitní párovací klíč. Pravděpodobně jde o chybu ve zdrojovém systému.
                    </p>
                    {diff.duplicates.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">Žádné duplicity.</p>
                    )}
                    <div className="rounded-xl border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    <th className="text-left px-3 py-2">Jméno v souboru</th>
                                    <th className="text-left px-3 py-2">Řádek v souboru</th>
                                    <th className="text-left px-3 py-2">Duplicitní s řádkem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {diff.duplicates.map(row => (
                                    <tr key={row.sourceIndex} className="border-b last:border-0">
                                        <td className="px-3 py-2">{row.importName}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{row.sourceIndex + 1}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{(row.duplicateOf ?? 0) + 1}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === "only_db" && (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Tito členové jsou v naší DB (mají hodnotu párovacího klíče), ale v importovaném souboru chybí.
                        Může jít o odhlášené nebo o chybu ve zdrojovém systému.
                    </p>
                    {diff.onlyInDb.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">Všichni naši členové jsou v souboru.</p>
                    )}
                    <div className="rounded-xl border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    <th className="text-left px-3 py-2">Člen</th>
                                    <th className="text-left px-3 py-2">ČSK</th>
                                    <th className="text-left px-3 py-2 hidden sm:table-cell">E-mail</th>
                                </tr>
                            </thead>
                            <tbody>
                                {diff.onlyInDb.map(row => (
                                    <tr key={row.memberId} className="border-b last:border-0">
                                        <td className="px-3 py-2 font-medium">{row.firstName} {row.lastName}</td>
                                        <td className="px-3 py-2 text-muted-foreground">{row.cskNumber ?? "—"}</td>
                                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{row.email ?? "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === "empty" && (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Pole s prázdnými hodnotami v souboru. Prázdné hodnoty se nepřijímají do DB.
                        Tato informace slouží k identifikaci nedostatků ve zdrojovém systému.
                    </p>
                    {Object.keys(diff.emptyValueFields).length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">Žádná prázdná pole.</p>
                    )}
                    <div className="rounded-xl border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    <th className="text-left px-3 py-2">Pole</th>
                                    <th className="text-left px-3 py-2">Počet prázdných</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(diff.emptyValueFields).map(([field, count]) => (
                                    <tr key={field} className="border-b last:border-0">
                                        <td className="px-3 py-2">{IMPORTABLE_FIELDS[field as keyof typeof IMPORTABLE_FIELDS] ?? field}</td>
                                        <td className="px-3 py-2 font-mono">{count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={onBack}>← Zpět na mapování</Button>
                <Button onClick={onFinish} className="bg-[#327600] hover:bg-[#2a6400]">
                    Dokončit import →
                </Button>
            </div>
        </div>
    );
}

// ── Step 4: Finish / save profile ─────────────────────────────────────────────

function Step4Finish({
    mappings, matchKeys, parseResult,
    onRestart,
}: {
    mappings: ColumnMapping[];
    matchKeys: MatchKeyConfig[];
    parseResult: ParseResult;
    onRestart: () => void;
}) {
    const [saveProfile, setSaveProfile] = useState(false);
    const [profileName, setProfileName] = useState("");
    const [profileNote, setProfileNote] = useState("");
    const [saved, setSaved] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function doSave() {
        if (!profileName.trim()) { setError("Název profilu je povinný"); return; }
        startTransition(async () => {
            const r = await saveImportProfile({
                name: profileName.trim(),
                note: profileNote.trim() || null,
                delimiter: parseResult.delimiter,
                encoding: parseResult.encoding,
                headerRowIndex: parseResult.headerRowIndex,
                matchKeys,
                mappings,
            });
            if ("error" in r) { setError(r.error); return; }
            setSaved(true);
        });
    }

    return (
        <div className="space-y-5 max-w-xl">
            <div className="rounded-xl border border-green-200 bg-green-50/40 px-4 py-3">
                <p className="font-semibold text-green-800">Import dokončen</p>
                <p className="text-sm text-green-700 mt-0.5">
                    Všechny přijaté změny byly uloženy do databáze.
                </p>
            </div>

            {!saved && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="save-profile" checked={saveProfile}
                            onChange={e => setSaveProfile(e.target.checked)}
                            className="rounded border-gray-300" />
                        <Label htmlFor="save-profile" className="cursor-pointer">
                            Uložit toto mapování jako profil pro příští import
                        </Label>
                    </div>

                    {saveProfile && (
                        <div className="space-y-3 pl-6 border-l-2 border-gray-200">
                            <div className="space-y-1.5">
                                <Label htmlFor="pname">Název profilu *</Label>
                                <Input id="pname" value={profileName} onChange={e => setProfileName(e.target.value)}
                                    placeholder="např. Import z ČSK" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="pnote">Poznámka</Label>
                                <Textarea id="pnote" rows={2} value={profileNote}
                                    onChange={e => setProfileNote(e.target.value)}
                                    placeholder="např. Stahuj z webu csk.cz ve formátu CSV v UTF-8" />
                            </div>
                            {error && <p className="text-sm text-red-600">{error}</p>}
                            <Button onClick={doSave} disabled={pending} size="sm">
                                {pending ? "Ukládám…" : "Uložit profil"}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {saved && (
                <p className="text-sm text-green-700">✓ Profil uložen.</p>
            )}

            <Button variant="outline" onClick={onRestart}>Nový import</Button>
        </div>
    );
}

// ── Main wizard ────────────────────────────────────────────────────────────────

export function ImportWizard({ profiles }: { profiles: ProfileRow[] }) {
    const [step, setStep] = useState<Step>(1);
    const [pending, startTransition] = useTransition();
    const [parseResult, setParseResult]   = useState<ParseResult | null>(null);
    const [mappings, setMappings]         = useState<ColumnMapping[]>([]);
    const [matchKeys, setMatchKeys]       = useState<MatchKeyConfig[]>([]);
    const [diffResult, setDiffResult]     = useState<DiffResult | null>(null);
    const [filename, setFilename]         = useState("");
    const [diffError, setDiffError]       = useState<string | null>(null);

    const stepLabels = ["Nahrát soubor", "Mapování sloupců", "Porovnání dat", "Dokončení"];

    function restart() {
        setStep(1);
        setParseResult(null);
        setMappings([]);
        setMatchKeys([]);
        setDiffResult(null);
        setFilename("");
        setDiffError(null);
    }

    function onParsed(result: ParseResult, suggestedMappings: ColumnMapping[], fname: string, profileId: number | null) {
        setParseResult(result);
        setFilename(fname);

        // Pokud byl zvolen profil a názvy sloupců se shodují, přeskočíme mapování
        if (profileId !== null) {
            const profile = profiles.find(p => p.id === profileId);
            if (profile) {
                const profileMappings = (profile.mappings as ImportMapping[]) ?? [];
                const profileMatchKeys = (profile.matchKeys as MatchKeyConfig[]) ?? [];
                const colNames = new Set(result.columns.map(c => c.name));
                const allMatch = profileMappings.every(m => colNames.has(m.sourceCol));
                if (allMatch && profileMappings.length > 0 && profileMatchKeys.length > 0) {
                    setMappings(profileMappings as ColumnMapping[]);
                    setMatchKeys(profileMatchKeys);
                    runDiff(result.rows, profileMappings as ColumnMapping[], profileMatchKeys);
                    return;
                }
            }
        }

        setMappings(suggestedMappings);
        setStep(2);
    }

    function runDiff(rows: Record<string, string>[], m: ColumnMapping[], mk: MatchKeyConfig[]) {
        setDiffError(null);
        startTransition(async () => {
            const r: ComputeDiffResult = await computeImportDiff(rows, m, mk);
            if ("error" in r) { setDiffError(r.error); setStep(2); return; }
            setDiffResult(r.diff);
            setStep(3);
        });
    }

    function onMappingConfirmed(m: ColumnMapping[], mk: MatchKeyConfig[]) {
        setMappings(m);
        setMatchKeys(mk);
        if (!parseResult) return;
        runDiff(parseResult.rows, m, mk);
    }

    function onFinish() {
        if (parseResult && diffResult) {
            saveImportHistory({
                profileId: null,
                profileName: null,
                filename,
                encodingDetected: parseResult.encoding,
                recordsTotal: parseResult.totalRows,
                recordsMatched: diffResult.matched.length,
                recordsNewCandidates: diffResult.newCandidates.length,
                recordsWithDiffs: diffResult.matched.filter(r => r.diffs.length > 0).length,
                recordsOnlyInDb: diffResult.onlyInDb.length,
                changesApplied: [],   // individuální změny se logují přímo v applyImportFieldChange
                membersAdded: [],
            });
        }
        setStep(4);
    }

    return (
        <div className="space-y-6">
            {/* Step indicator */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {stepLabels.map((label, i) => {
                    const s = (i + 1) as Step;
                    return (
                        <div key={s} className="flex items-center gap-2 shrink-0">
                            {i > 0 && <span className="text-gray-300">›</span>}
                            <div className={[
                                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
                                s === step
                                    ? "bg-[#26272b] text-white"
                                    : s < step
                                        ? "bg-green-100 text-green-800"
                                        : "bg-gray-100 text-gray-500",
                            ].join(" ")}>
                                <span className="font-mono">{s}</span>
                                <span className="hidden sm:inline">{label}</span>
                            </div>
                        </div>
                    );
                })}
                {pending && <span className="text-xs text-muted-foreground ml-2 animate-pulse">Načítám…</span>}
            </div>

            {diffError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {diffError}
                </div>
            )}

            {step === 1 && (
                <Step1Upload profiles={profiles} onParsed={onParsed} />
            )}
            {step === 2 && parseResult && (
                <Step2Mapping
                    parseResult={parseResult}
                    initialMappings={mappings}
                    onConfirm={onMappingConfirmed}
                    onBack={() => setStep(1)}
                />
            )}
            {step === 3 && diffResult && parseResult && (
                <Step3Diff
                    diff={diffResult}
                    filename={filename}
                    totalImportRows={parseResult.totalRows}
                    onBack={() => setStep(2)}
                    onFinish={onFinish}
                />
            )}
            {step === 4 && parseResult && (
                <Step4Finish
                    mappings={mappings}
                    matchKeys={matchKeys}
                    parseResult={parseResult}
                    onRestart={restart}
                />
            )}
        </div>
    );
}
