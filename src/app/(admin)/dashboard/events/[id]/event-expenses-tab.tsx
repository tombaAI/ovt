"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Paperclip, Trash2, Upload, FileText, ImageIcon, Crop as CropIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getEventExpenses } from "@/lib/actions/event-expenses";
import type { EventExpenseRow } from "@/lib/actions/event-expenses";
import { expenseCategoryEnum, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/expense-categories";

const CATEGORIES = expenseCategoryEnum as readonly ExpenseCategory[];
const MAX_PX = 1600;
const JPEG_QUALITY = 0.85;

function fmtAmount(amount: string) {
    return new Intl.NumberFormat("cs-CZ").format(Number(amount)) + " Kč";
}

function fmtDate(d: Date) {
    return new Intl.DateTimeFormat("cs-CZ", {
        day: "2-digit", month: "2-digit", year: "numeric",
    }).format(new Date(d));
}

function isImage(mime: string | null) {
    return mime?.startsWith("image/") ?? false;
}

// ── Image compress + crop via canvas ──────────────────────────────────────────

function compressImage(srcUrl: string, crop: PixelCrop | null, originalName: string): Promise<File> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const sx = crop ? crop.x : 0;
            const sy = crop ? crop.y : 0;
            const sw = crop ? crop.width  : img.naturalWidth;
            const sh = crop ? crop.height : img.naturalHeight;

            const scale = Math.min(1, MAX_PX / Math.max(sw, sh));
            const dw = Math.round(sw * scale);
            const dh = Math.round(sh * scale);

            const canvas = document.createElement("canvas");
            canvas.width  = dw;
            canvas.height = dh;
            const ctx = canvas.getContext("2d");
            if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

            canvas.toBlob(
                blob => {
                    if (!blob) { reject(new Error("Canvas toBlob failed")); return; }
                    const base = originalName.replace(/\.[^.]+$/, "");
                    resolve(new File([blob], `${base}.jpg`, { type: "image/jpeg" }));
                },
                "image/jpeg",
                JPEG_QUALITY,
            );
        };
        img.onerror = () => reject(new Error("Obrázek se nepodařilo načíst"));
        img.src = srcUrl;
    });
}

// ── Crop modal ────────────────────────────────────────────────────────────────

function ImageCropModal({ srcUrl, originalName, onDone, onCancel }: {
    srcUrl: string;
    originalName: string;
    onDone: (file: File) => void;
    onCancel: () => void;
}) {
    const [crop, setCrop]               = useState<Crop>();
    const [pixelCrop, setPixelCrop]     = useState<PixelCrop>();
    const [processing, setProcessing]   = useState(false);
    const [sizeInfo, setSizeInfo]       = useState<string | null>(null);
    const imgRef                        = useRef<HTMLImageElement>(null);

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        const scale = Math.min(1, MAX_PX / Math.max(w, h));
        setSizeInfo(`${w}×${h}px → výstup max ${Math.round(w * scale)}×${Math.round(h * scale)}px`);
    }

    async function apply(useCrop: boolean) {
        setProcessing(true);
        try {
            const activeCrop = useCrop && pixelCrop?.width && pixelCrop?.height ? pixelCrop : null;
            const result = await compressImage(srcUrl, activeCrop, originalName);
            const kb = Math.round(result.size / 1024);
            // brief visual feedback — just pass through
            void kb;
            onDone(result);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Chyba zpracování");
        } finally {
            setProcessing(false);
        }
    }

    const hasCrop = !!pixelCrop?.width && !!pixelCrop?.height;

    return (
        <Dialog open onOpenChange={open => { if (!open) onCancel(); }}>
            <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-5 pt-4 pb-3 border-b">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <CropIcon size={16} className="text-gray-500" />
                        Oříznout obrázek
                    </DialogTitle>
                </DialogHeader>

                {/* Scrollable image area */}
                <div className="overflow-auto max-h-[60vh] bg-gray-100 flex items-center justify-center p-3">
                    <ReactCrop
                        crop={crop}
                        onChange={(_, pct) => setCrop(pct)}
                        onComplete={c => setPixelCrop(c)}
                        className="max-w-full"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            ref={imgRef}
                            src={srcUrl}
                            alt="Náhled dokladu"
                            onLoad={onImageLoad}
                            style={{ maxWidth: "100%", maxHeight: "55vh", objectFit: "contain" }}
                        />
                    </ReactCrop>
                </div>

                {/* Info + actions */}
                <div className="px-5 py-3 border-t bg-gray-50 space-y-3">
                    {sizeInfo && (
                        <p className="text-xs text-gray-500">{sizeInfo} · JPEG {Math.round(JPEG_QUALITY * 100)}%</p>
                    )}
                    <p className="text-xs text-gray-400">
                        {hasCrop
                            ? "Oblast vybrána — klikni Oříznout a použít."
                            : "Tažením vyber oblast, nebo pokračuj bez ořezu."}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            disabled={processing || !hasCrop}
                            onClick={() => apply(true)}
                            className="bg-[#327600] hover:bg-[#2a6400] text-white">
                            {processing ? "Zpracovávám…" : "Oříznout a použít"}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={processing}
                            onClick={() => apply(false)}>
                            Použít bez ořezu
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={processing}
                            onClick={onCancel}
                            className="ml-auto text-gray-500">
                            Zrušit
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Add expense form ──────────────────────────────────────────────────────────

function AddExpenseForm({ eventId, onAdded }: { eventId: number; onAdded: () => void }) {
    const [amount, setAmount]             = useState("");
    const [purposeText, setPurposeText]   = useState("");
    const [category, setCategory]         = useState<ExpenseCategory>("doprava");
    const [file, setFile]                 = useState<File | null>(null);
    const [uploading, setUploading]       = useState(false);
    const [error, setError]               = useState<string | null>(null);
    const [cropSource, setCropSource]     = useState<{ url: string; name: string } | null>(null);
    const [analyzing, setAnalyzing]       = useState(false);
    const [aiFields, setAiFields]         = useState<Set<string>>(new Set());
    const fileInputRef                    = useRef<HTMLInputElement>(null);
    const cameraInputRef                  = useRef<HTMLInputElement>(null);

    async function analyzeFile(f: File) {
        setAnalyzing(true);
        setAiFields(new Set());
        try {
            const fd = new FormData();
            fd.append("file", f);
            const res = await fetch("/api/expenses/analyze", { method: "POST", body: fd });
            if (!res.ok) return;
            const data: { amount: number | null; category: string | null } = await res.json();
            const filled = new Set<string>();
            if (data.amount !== null && data.amount !== undefined) {
                setAmount(String(data.amount).replace(".", ","));
                filled.add("amount");
            }
            if (data.category) {
                setCategory(data.category as ExpenseCategory);
                filled.add("category");
            }
            setAiFields(filled);
        } catch {
            // Gemini selhalo — uživatel vyplní ručně, nic se nezobrazí
        } finally {
            setAnalyzing(false);
        }
    }

    function handleFileSelect(f: File | undefined) {
        if (!f) return;
        if (f.type.startsWith("image/")) {
            setCropSource({ url: URL.createObjectURL(f), name: f.name });
        } else {
            setFile(f);
            analyzeFile(f);
        }
    }

    function handleCropDone(processed: File) {
        if (cropSource) URL.revokeObjectURL(cropSource.url);
        setCropSource(null);
        setFile(processed);
        if (fileInputRef.current)   fileInputRef.current.value   = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        analyzeFile(processed);
    }

    function handleCropCancel() {
        if (cropSource) URL.revokeObjectURL(cropSource.url);
        setCropSource(null);
        if (fileInputRef.current)   fileInputRef.current.value   = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
    }

    function clearFile() {
        setFile(null);
        setAiFields(new Set());
        if (fileInputRef.current)   fileInputRef.current.value   = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        const amountNum = parseFloat(amount.replace(",", "."));
        if (isNaN(amountNum) || amountNum <= 0) { setError("Zadejte platnou částku"); return; }
        if (!purposeText.trim()) { setError("Zadejte účel dokladu"); return; }

        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("amount", String(amountNum));
            fd.append("purposeText", purposeText.trim());
            fd.append("purposeCategory", category);
            if (file) fd.append("file", file);

            const res = await fetch(`/api/events/${eventId}/expenses`, {
                method: "POST",
                body: fd,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Chyba uploadu");

            setAmount("");
            setPurposeText("");
            setCategory("doprava");
            setFile(null);
            if (fileInputRef.current)   fileInputRef.current.value   = "";
            if (cameraInputRef.current) cameraInputRef.current.value = "";
            onAdded();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chyba");
        } finally {
            setUploading(false);
        }
    }

    const fileSizeKb = file ? Math.round(file.size / 1024) : null;

    return (
        <>
            {cropSource && (
                <ImageCropModal
                    srcUrl={cropSource.url}
                    originalName={cropSource.name}
                    onDone={handleCropDone}
                    onCancel={handleCropCancel}
                />
            )}

            <form onSubmit={handleSubmit} className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">Přidat doklad</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                            Částka (Kč)
                            {analyzing && <span className="text-[10px] text-violet-500 animate-pulse">✦ analyzuji…</span>}
                            {!analyzing && aiFields.has("amount") && <span className="text-[10px] text-violet-500">✦ Gemini</span>}
                        </label>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0,00"
                            value={amount}
                            onChange={e => { setAmount(e.target.value); setAiFields(s => { const n = new Set(s); n.delete("amount"); return n; }); }}
                            required
                            className={`w-full h-9 rounded-md border px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-white ${aiFields.has("amount") ? "border-violet-300 ring-1 ring-violet-200" : "border-input"}`}
                        />
                    </div>

                    <div>
                        <label className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                            Kategorie nákladu
                            {!analyzing && aiFields.has("category") && <span className="text-[10px] text-violet-500">✦ Gemini</span>}
                        </label>
                        <select
                            value={category}
                            onChange={e => { setCategory(e.target.value as ExpenseCategory); setAiFields(s => { const n = new Set(s); n.delete("category"); return n; }); }}
                            className={`w-full h-9 rounded-md border px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-white ${aiFields.has("category") ? "border-violet-300 ring-1 ring-violet-200" : "border-input"}`}
                        >
                            {CATEGORIES.map(c => (
                                <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Účel / popis</label>
                    <input
                        type="text"
                        placeholder="Např. jízdenky Praha–Brno, oběd účastníci…"
                        value={purposeText}
                        onChange={e => setPurposeText(e.target.value)}
                        required
                        className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </div>

                <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                        Doklad (volitelné — PDF nebo fotka)
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Výběr souboru — desktop + mobil */}
                        <label className="flex items-center gap-1.5 cursor-pointer h-9 px-3 rounded-md border border-input bg-white text-sm shadow-sm hover:bg-gray-50 transition-colors">
                            <Upload size={14} className="text-gray-500" />
                            <span className="text-gray-700">Vybrat soubor</span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,application/pdf"
                                className="sr-only"
                                onChange={e => handleFileSelect(e.target.files?.[0])}
                            />
                        </label>

                        {/* Přímá kamera — jen mobil */}
                        <label className="flex items-center gap-1.5 cursor-pointer h-9 px-3 rounded-md border border-input bg-white text-sm shadow-sm hover:bg-gray-50 transition-colors sm:hidden">
                            <ImageIcon size={14} className="text-gray-500" />
                            <span className="text-gray-700">Vyfoť</span>
                            <input
                                ref={cameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="sr-only"
                                onChange={e => handleFileSelect(e.target.files?.[0])}
                            />
                        </label>

                        {file && (
                            <span className="text-xs text-gray-600 flex items-center gap-1 flex-wrap">
                                <Paperclip size={12} />
                                {file.name}
                                {fileSizeKb !== null && (
                                    <span className="text-gray-400">({fileSizeKb} kB)</span>
                                )}
                                {analyzing
                                    ? <span className="text-violet-500 animate-pulse">✦ analyzuji…</span>
                                    : aiFields.size > 0 && <span className="text-violet-500">✦ Gemini</span>
                                }
                                <button type="button" onClick={clearFile}
                                    className="text-gray-400 hover:text-gray-600 ml-0.5">×</button>
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                        Fotka bude automaticky komprimována a uložena jako JPEG (max {MAX_PX}px, {Math.round(JPEG_QUALITY * 100)}%).
                    </p>
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                <Button type="submit" disabled={uploading} size="sm"
                    className="bg-[#327600] hover:bg-[#2a6400] text-white">
                    {uploading ? "Ukládám…" : "Přidat doklad"}
                </Button>
            </form>
        </>
    );
}

// ── Expense row ───────────────────────────────────────────────────────────────

function ExpenseItem({ expense, eventId, onDeleted }: {
    expense: EventExpenseRow;
    eventId: number;
    onDeleted: () => void;
}) {
    const [deleting, setDeleting] = useState(false);

    async function handleDelete() {
        if (!confirm("Smazat tento doklad?")) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/events/${eventId}/expenses`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expenseId: expense.id }),
            });
            if (!res.ok) {
                const d = await res.json();
                alert(d.error ?? "Chyba smazání");
                return;
            }
            onDeleted();
        } finally {
            setDeleting(false);
        }
    }

    const categoryLabel = EXPENSE_CATEGORY_LABELS[expense.purposeCategory] ?? expense.purposeCategory;

    return (
        <div className="flex items-start gap-3 py-3 border-b last:border-0">
            <div className="mt-0.5 shrink-0 text-gray-400">
                {expense.fileUrl
                    ? (isImage(expense.fileMime)
                        ? <ImageIcon size={16} className="text-blue-400" />
                        : <FileText size={16} className="text-red-400" />)
                    : <Paperclip size={16} />
                }
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 tabular-nums">
                        {fmtAmount(expense.amount)}
                    </span>
                    <span className="text-[11px] text-gray-500 border border-gray-200 rounded px-1.5 py-px bg-gray-50 shrink-0">
                        {categoryLabel}
                    </span>
                </div>
                <p className="text-sm text-gray-700 mt-0.5">{expense.purposeText}</p>
                {expense.fileUrl && (
                    <a href={`/api/blob-file?url=${encodeURIComponent(expense.fileUrl)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-0.5 block truncate">
                        {expense.fileName ?? "Příloha"}
                    </a>
                )}
                <p className="text-xs text-gray-400 mt-1">{fmtDate(expense.createdAt)}</p>
            </div>

            <button onClick={handleDelete} disabled={deleting}
                className="shrink-0 text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors mt-0.5"
                title="Smazat doklad">
                <Trash2 size={15} />
            </button>
        </div>
    );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function EventExpensesTab({ eventId }: { eventId: number }) {
    const [expenses, setExpenses] = useState<EventExpenseRow[] | null>(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await getEventExpenses(eventId);
            setExpenses(rows);
            setError(null);
        } catch {
            setError("Nepodařilo se načíst doklady");
        } finally {
            setLoading(false);
        }
    }, [eventId]);

    useEffect(() => { load(); }, [load]);

    const total = expenses?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;

    return (
        <div className="space-y-4">
            <AddExpenseForm eventId={eventId} onAdded={load} />

            {loading && <p className="text-sm text-gray-400 py-4 text-center">Načítám doklady…</p>}
            {error   && <p className="text-sm text-red-500 py-4">{error}</p>}

            {!loading && expenses !== null && (
                <>
                    {expenses.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">Žádné doklady k akci</p>
                    ) : (
                        <div className="rounded-xl border bg-white px-4">
                            {expenses.map(e => (
                                <ExpenseItem
                                    key={e.id}
                                    expense={e}
                                    eventId={eventId}
                                    onDeleted={load}
                                />
                            ))}
                        </div>
                    )}

                    {expenses.length > 0 && (
                        <div className="flex items-center justify-between px-1 text-sm">
                            <span className="text-gray-500">
                                Celkem {expenses.length} {expenses.length === 1 ? "doklad" : expenses.length < 5 ? "doklady" : "dokladů"}
                            </span>
                            <span className="font-semibold text-gray-900 tabular-nums">
                                {new Intl.NumberFormat("cs-CZ").format(total)} Kč
                            </span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
