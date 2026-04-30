"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Paperclip, Trash2, Upload, FileText, ImageIcon, Crop as CropIcon, Sparkles, CircleAlert } from "lucide-react";
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

// ── Gemini analysis result type ───────────────────────────────────────────────

type ExpenseAnalysis = {
    merchant:      string;
    date:          string | null;
    total_amount:  number | null;
    currency:      string;
    account_code:  ExpenseCategory | null;
    category_name: string;
    reasoning:     string;
    confidence:    number;
};

// ── Analysis card ─────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
    const pct   = Math.round(value * 100);
    const color = pct >= 80 ? "bg-green-500" : pct >= 55 ? "bg-amber-400" : "bg-red-400";
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs tabular-nums text-gray-500 w-8 text-right">{pct}%</span>
        </div>
    );
}

function AnalysisCard({ analysis }: { analysis: ExpenseAnalysis }) {
    const pct = Math.round(analysis.confidence * 100);
    const confidenceColor = pct >= 80 ? "text-green-600" : pct >= 55 ? "text-amber-500" : "text-red-500";

    function fmtDocDate(iso: string | null) {
        if (!iso) return "—";
        try {
            const [y, m, d] = iso.split("-");
            return `${Number(d)}. ${Number(m)}. ${y}`;
        } catch { return iso; }
    }

    return (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 overflow-hidden">
            {/* Hlavička */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-violet-200 bg-violet-100/60">
                <Sparkles size={14} className="text-violet-600 shrink-0" />
                <span className="text-xs font-medium text-violet-700">Analýza Gemini</span>
            </div>

            <div className="px-4 py-3 space-y-3">
                {/* Obchodník + datum */}
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <div>
                        <p className="text-[10px] text-violet-500 uppercase tracking-wide mb-0.5">Obchodník</p>
                        <p className="text-sm font-medium text-gray-900">{analysis.merchant}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-violet-500 uppercase tracking-wide mb-0.5">Datum dokladu</p>
                        <p className="text-sm text-gray-900">{fmtDocDate(analysis.date)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-violet-500 uppercase tracking-wide mb-0.5">Částka</p>
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">
                            {analysis.total_amount !== null
                                ? `${new Intl.NumberFormat("cs-CZ").format(analysis.total_amount)} ${analysis.currency}`
                                : "—"}
                        </p>
                    </div>
                </div>

                {/* Účetní kód */}
                <div className="flex items-start gap-3 rounded-lg border border-violet-200 bg-white px-3 py-2.5">
                    <div className="flex-1">
                        <p className="text-[10px] text-violet-500 uppercase tracking-wide mb-0.5">Účetní kód</p>
                        <p className="text-sm font-mono font-semibold text-gray-900">
                            {analysis.account_code ?? "—"}
                            {analysis.account_code && (
                                <span className="ml-2 font-sans font-normal text-gray-500">
                                    {analysis.category_name}
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="shrink-0 text-right min-w-[80px]">
                        <p className="text-[10px] text-violet-500 uppercase tracking-wide mb-0.5">Jistota</p>
                        <p className={`text-sm font-semibold tabular-nums ${confidenceColor}`}>{pct}%</p>
                    </div>
                </div>

                {/* Confidence bar */}
                <ConfidenceBar value={analysis.confidence} />

                {/* Zdůvodnění */}
                {analysis.reasoning && (
                    <div className="flex gap-2">
                        <CircleAlert size={13} className="text-violet-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-gray-600 leading-relaxed">{analysis.reasoning}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Image rotate via canvas ───────────────────────────────────────────────────

function rotateImage(srcUrl: string, angleDeg: number, originalName: string): Promise<File> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const rad = (angleDeg * Math.PI) / 180;
            const sin = Math.abs(Math.sin(rad));
            const cos = Math.abs(Math.cos(rad));
            const w   = img.naturalWidth;
            const h   = img.naturalHeight;

            // Canvas musí být dost velký aby pojal otočený obrázek
            const canvasW = Math.round(w * cos + h * sin);
            const canvasH = Math.round(w * sin + h * cos);

            const canvas = document.createElement("canvas");
            canvas.width  = canvasW;
            canvas.height = canvasH;
            const ctx = canvas.getContext("2d");
            if (!ctx) { reject(new Error("Canvas context unavailable")); return; }

            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvasW, canvasH);
            ctx.translate(canvasW / 2, canvasH / 2);
            ctx.rotate(rad);
            ctx.drawImage(img, -w / 2, -h / 2);

            canvas.toBlob(
                blob => {
                    if (!blob) { reject(new Error("Canvas toBlob failed")); return; }
                    const base = originalName.replace(/\.[^.]+$/, "");
                    resolve(new File([blob], `${base}_rotated.jpg`, { type: "image/jpeg" }));
                },
                "image/jpeg",
                0.92,
            );
        };
        img.onerror = () => reject(new Error("Obrázek se nepodařilo načíst"));
        img.src = srcUrl;
    });
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

function ImageCropModal({ srcUrl, originalName, onDone, onCancel, suggestedCrop }: {
    srcUrl: string;
    originalName: string;
    onDone: (file: File) => void;
    onCancel: () => void;
    suggestedCrop?: Crop; // procentuální crop z Gemini detekce
}) {
    const [crop, setCrop]               = useState<Crop | undefined>(suggestedCrop);
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
            let activeCrop: PixelCrop | null = null;

            if (useCrop && pixelCrop?.width && pixelCrop?.height && imgRef.current) {
                // ReactCrop vrací koordináty v CSS pixelech zobrazené img.
                // Canvas potřebuje souřadnice v přirozených pixelech originálu.
                const img = imgRef.current;
                const scaleX = img.naturalWidth  / img.width;
                const scaleY = img.naturalHeight / img.height;
                activeCrop = {
                    unit: "px",
                    x:      Math.round(pixelCrop.x      * scaleX),
                    y:      Math.round(pixelCrop.y      * scaleY),
                    width:  Math.round(pixelCrop.width  * scaleX),
                    height: Math.round(pixelCrop.height * scaleY),
                };
            }

            const result = await compressImage(srcUrl, activeCrop, originalName);
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
                        {suggestedCrop && (
                            <span className="ml-1 text-[11px] font-normal text-violet-600 border border-violet-200 bg-violet-50 rounded px-1.5 py-px">
                                ✦ Gemini návrh
                            </span>
                        )}
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

// ── Automatic upload flow (state machine) ────────────────────────────────────

type FlowState =
    | { tag: "idle" }
    | { tag: "cropping"; file: File; previewUrl: string }
    | { tag: "analyzing"; file: File }
    | { tag: "analyzed"; file: File; analysis: ExpenseAnalysis; amount: string; category: ExpenseCategory }
    | { tag: "uploading"; file: File; analysis: ExpenseAnalysis; amount: string; category: ExpenseCategory; purposeText: string };

function AddExpenseForm({ eventId, onAdded }: { eventId: number; onAdded: () => void }) {
    const [state, setState]       = useState<FlowState>({ tag: "idle" });
    const [purposeText, setPurposeText] = useState("");
    const [error, setError]       = useState<string | null>(null);
    const fileInputRef            = useRef<HTMLInputElement>(null);
    const cameraInputRef          = useRef<HTMLInputElement>(null);
    const purposeRef              = useRef<HTMLInputElement>(null);

    // Override fields after analysis
    const [amount, setAmount]     = useState("");
    const [category, setCategory] = useState<ExpenseCategory>("501/004");

    function resetToIdle() {
        setState({ tag: "idle" });
        setPurposeText("");
        setAmount("");
        setCategory("501/004");
        setError(null);
        if (fileInputRef.current)   fileInputRef.current.value   = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
    }

    async function runAnalysis(file: File) {
        setState({ tag: "analyzing", file });
        setError(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/expenses/analyze", { method: "POST", body: fd });
            const data: ExpenseAnalysis & { error?: string } = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Chyba analýzy");

            const amt = data.total_amount !== null && data.total_amount !== undefined
                ? String(data.total_amount).replace(".", ",")
                : "";
            const cat = data.account_code ?? "501/004";
            setAmount(amt);
            setCategory(cat);
            setState({ tag: "analyzed", file, analysis: data, amount: amt, category: cat });
            // Focus purpose input after analysis
            setTimeout(() => purposeRef.current?.focus(), 50);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analýza selhala");
            setState({ tag: "idle" });
        }
    }

    function handleFileSelect(f: File | undefined) {
        if (!f) return;
        if (f.type.startsWith("image/")) {
            setState({ tag: "cropping", file: f, previewUrl: URL.createObjectURL(f) });
        } else {
            runAnalysis(f);
        }
    }

    function handleCropDone(processed: File) {
        if (state.tag === "cropping") URL.revokeObjectURL(state.previewUrl);
        if (fileInputRef.current)   fileInputRef.current.value   = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        runAnalysis(processed);
    }

    function handleCropCancel() {
        if (state.tag === "cropping") URL.revokeObjectURL(state.previewUrl);
        if (fileInputRef.current)   fileInputRef.current.value   = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        setState({ tag: "idle" });
    }

    async function handleSave() {
        if (state.tag !== "analyzed") return;
        setError(null);

        const amountNum = parseFloat(amount.replace(",", "."));
        if (isNaN(amountNum) || amountNum <= 0) { setError("Oprav částku"); return; }
        if (!purposeText.trim()) { setError("Doplň účel dokladu"); purposeRef.current?.focus(); return; }

        setState({ tag: "uploading", file: state.file, analysis: state.analysis, amount, category, purposeText });
        try {
            const fd = new FormData();
            fd.append("amount", String(amountNum));
            fd.append("purposeText", purposeText.trim());
            fd.append("purposeCategory", category);
            fd.append("file", state.file);

            const res = await fetch(`/api/events/${eventId}/expenses`, { method: "POST", body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Chyba uložení");

            resetToIdle();
            onAdded();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chyba");
            setState({ tag: "analyzed", file: state.file, analysis: state.analysis, amount, category });
        }
    }

    const isUploading = state.tag === "uploading";

    // ── Render ──

    // Crop modal
    if (state.tag === "cropping") {
        return (
            <ImageCropModal
                srcUrl={state.previewUrl}
                originalName={state.file.name}
                onDone={handleCropDone}
                onCancel={handleCropCancel}
            />
        );
    }

    // Idle — upload area
    if (state.tag === "idle") {
        return (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center space-y-3">
                <div className="flex justify-center">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <Upload size={18} className="text-gray-400" />
                    </div>
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-700">Nahrát doklad</p>
                    <p className="text-xs text-gray-400 mt-0.5">PDF nebo fotka — Gemini automaticky vyčte částku a kategorii</p>
                </div>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer h-9 px-4 rounded-md bg-[#327600] text-white text-sm font-medium hover:bg-[#2a6400] transition-colors">
                        <Upload size={14} />
                        <span>Vybrat soubor</span>
                        <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
                            className="sr-only" onChange={e => handleFileSelect(e.target.files?.[0])} />
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer h-9 px-4 rounded-md border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition-colors sm:hidden">
                        <ImageIcon size={14} />
                        <span>Vyfoť</span>
                        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
                            className="sr-only" onChange={e => handleFileSelect(e.target.files?.[0])} />
                    </label>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <p className="text-xs text-gray-400">
                    Fotky jsou automaticky komprimovány (max {MAX_PX}px, JPEG {Math.round(JPEG_QUALITY * 100)}%)
                </p>
            </div>
        );
    }

    // Analyzing
    if (state.tag === "analyzing") {
        return (
            <div className="rounded-xl border bg-white p-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                        <Sparkles size={15} className="text-violet-600 animate-pulse" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-800">Analyzuji doklad…</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{state.file.name}</p>
                    </div>
                </div>
                <div className="mt-4 h-1 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
            </div>
        );
    }

    // Analyzed + uploading
    const analysis = state.tag === "analyzed" ? state.analysis
                   : state.tag === "uploading" ? state.analysis
                   : null;

    return (
        <div className="space-y-3">
            {/* File info + cancel */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
                {isImage(state.file.type) ? <ImageIcon size={13} /> : <FileText size={13} />}
                <span className="truncate">{state.file.name}</span>
                <span className="text-gray-300">·</span>
                <span>{Math.round(state.file.size / 1024)} kB</span>
                <button type="button" onClick={resetToIdle} disabled={isUploading}
                    className="ml-auto text-gray-400 hover:text-gray-600 disabled:opacity-40 text-xs shrink-0">
                    Zrušit
                </button>
            </div>

            {/* Gemini analysis card */}
            {analysis && <AnalysisCard analysis={analysis} />}

            {/* Editable fields */}
            <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Zkontroluj a doplň</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                            Částka (Kč)
                            <span className="text-violet-400">✦</span>
                        </label>
                        <input type="text" inputMode="decimal"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="w-full h-9 rounded-md border border-violet-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-300"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                            Účetní kód
                            <span className="text-violet-400">✦</span>
                        </label>
                        <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)}
                            className="w-full h-9 rounded-md border border-violet-200 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-300">
                            {CATEGORIES.map(c => (
                                <option key={c} value={c}>{c} · {EXPENSE_CATEGORY_LABELS[c]}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                        Účel / popis <span className="text-red-400">*</span>
                    </label>
                    <input ref={purposeRef} type="text"
                        placeholder="Např. jízdenky Praha–Brno, oběd pro závodníky…"
                        value={purposeText}
                        onChange={e => setPurposeText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
                        className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                <Button onClick={handleSave} disabled={isUploading} size="sm"
                    className="bg-[#327600] hover:bg-[#2a6400] text-white w-full sm:w-auto">
                    {isUploading ? "Ukládám…" : "Přidat doklad"}
                </Button>
            </div>
        </div>
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

// ── PoC: Gemini auto-crop ────────────────────────────────────────────────────

type AutoCropState =
    | { tag: "idle" }
    | { tag: "detecting"; previewUrl: string; file: File }
    | { tag: "cropping";  previewUrl: string; file: File; suggestedCrop?: Crop; confidence?: number; note?: string }
    | { tag: "done";      result: File; sizeKb: number };

function AutoCropPoc() {
    const [state, setState] = useState<AutoCropState>({ tag: "idle" });
    const [error, setError] = useState<string | null>(null);
    const inputRef          = useRef<HTMLInputElement>(null);

    function reset() {
        if (state.tag === "detecting" || state.tag === "cropping") {
            URL.revokeObjectURL(state.previewUrl);
        }
        setState({ tag: "idle" });
        setError(null);
        if (inputRef.current) inputRef.current.value = "";
    }

    async function handleFile(f: File | undefined) {
        if (!f) return;
        setError(null);
        const previewUrl = URL.createObjectURL(f);
        setState({ tag: "detecting", previewUrl, file: f });

        try {
            const fd = new FormData();
            fd.append("file", f);
            const res  = await fetch("/api/expenses/detect-crop", { method: "POST", body: fd });
            const data: { detected: boolean; x_pct: number | null; y_pct: number | null; width_pct: number | null; height_pct: number | null; confidence: number; note?: string; error?: string } = await res.json();

            if (!res.ok) throw new Error(data.error ?? "Chyba detekce");

            let suggested: Crop | undefined;
            if (data.detected && data.x_pct !== null && data.y_pct !== null && data.width_pct !== null && data.height_pct !== null) {
                // Gemini vrátí relativní 0–1, ReactCrop chce procenta 0–100
                suggested = {
                    unit:   "%",
                    x:      Math.max(0, data.x_pct      * 100),
                    y:      Math.max(0, data.y_pct      * 100),
                    width:  Math.min(100 - data.x_pct * 100, data.width_pct  * 100),
                    height: Math.min(100 - data.y_pct * 100, data.height_pct * 100),
                };
            }

            setState({ tag: "cropping", previewUrl, file: f, suggestedCrop: suggested, confidence: data.confidence, note: data.note });
        } catch (err) {
            URL.revokeObjectURL(previewUrl);
            setError(err instanceof Error ? err.message : "Chyba");
            setState({ tag: "idle" });
        }
    }

    function handleCropDone(result: File) {
        if (state.tag === "cropping") URL.revokeObjectURL(state.previewUrl);
        setState({ tag: "done", result, sizeKb: Math.round(result.size / 1024) });
        if (inputRef.current) inputRef.current.value = "";
    }

    function handleCropCancel() {
        if (state.tag === "cropping") URL.revokeObjectURL(state.previewUrl);
        setState({ tag: "idle" });
        if (inputRef.current) inputRef.current.value = "";
    }

    // Crop modal
    if (state.tag === "cropping") {
        return (
            <ImageCropModal
                srcUrl={state.previewUrl}
                originalName={state.file.name}
                suggestedCrop={state.suggestedCrop}
                onDone={handleCropDone}
                onCancel={handleCropCancel}
            />
        );
    }

    return (
        <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-violet-500" />
                <p className="text-xs font-medium text-violet-700">PoC — Gemini auto-ořez</p>
                <span className="text-[10px] text-violet-400 border border-violet-200 rounded px-1">experiment</span>
            </div>

            {state.tag === "idle" && (
                <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                        Nahraj fotku — Gemini detekuje ořez a předvybere oblast v crop modalu.
                    </p>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer h-8 px-3 rounded-md border border-violet-300 bg-white text-violet-700 text-xs font-medium hover:bg-violet-50 transition-colors">
                        <Upload size={12} />
                        Vybrat fotku
                        <input ref={inputRef} type="file" accept="image/*" className="sr-only"
                            onChange={e => handleFile(e.target.files?.[0])} />
                    </label>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
            )}

            {state.tag === "detecting" && (
                <div className="flex items-center gap-2">
                    <Sparkles size={13} className="text-violet-500 animate-pulse" />
                    <p className="text-xs text-violet-600">Gemini detekuje polohu dokladu…</p>
                </div>
            )}

            {state.tag === "done" && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-green-600">
                        <span>✓ Hotovo</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500">{state.sizeKb} kB výsledný soubor</span>
                    </div>
                    <div className="rounded-lg overflow-hidden border border-gray-200 inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={URL.createObjectURL(state.result)} alt="Výsledek ořezu"
                            className="max-w-full max-h-48 object-contain" />
                    </div>
                    <div>
                        <button onClick={reset} className="text-xs text-violet-600 hover:underline">
                            Zkusit znovu
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── PoC: Gemini auto-rotate ───────────────────────────────────────────────────

type RotateState =
    | { tag: "idle" }
    | { tag: "detecting"; previewUrl: string; file: File }
    | { tag: "rotating";  previewUrl: string; file: File; angleDeg: number }
    | { tag: "done";      resultUrl: string; resultFile: File; angleDeg: number; confidence: number };

function AutoRotatePoc() {
    const [state, setState] = useState<RotateState>({ tag: "idle" });
    const [error, setError] = useState<string | null>(null);
    const inputRef          = useRef<HTMLInputElement>(null);

    function reset() {
        if (state.tag === "detecting" || state.tag === "rotating") URL.revokeObjectURL(state.previewUrl);
        if (state.tag === "done") URL.revokeObjectURL(state.resultUrl);
        setState({ tag: "idle" });
        setError(null);
        if (inputRef.current) inputRef.current.value = "";
    }

    async function handleFile(f: File | undefined) {
        if (!f) return;
        setError(null);
        const previewUrl = URL.createObjectURL(f);
        setState({ tag: "detecting", previewUrl, file: f });

        try {
            // 1. Gemini detekuje rotaci
            const fd = new FormData();
            fd.append("file", f);
            const res  = await fetch("/api/expenses/detect-rotation", { method: "POST", body: fd });
            const data: { rotation_needed: boolean; angle_degrees: number; confidence: number; note?: string; error?: string } = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Chyba detekce");

            const angle = data.angle_degrees ?? 0;

            if (!data.rotation_needed || Math.abs(angle) < 1) {
                // Není potřeba otáčet
                setState({ tag: "done", resultUrl: previewUrl, resultFile: f, angleDeg: 0, confidence: data.confidence });
                return;
            }

            // 2. Canvas rotace
            setState({ tag: "rotating", previewUrl, file: f, angleDeg: angle });
            const rotated    = await rotateImage(previewUrl, angle, f.name);
            const rotatedUrl = URL.createObjectURL(rotated);
            URL.revokeObjectURL(previewUrl);
            setState({ tag: "done", resultUrl: rotatedUrl, resultFile: rotated, angleDeg: angle, confidence: data.confidence });
        } catch (err) {
            URL.revokeObjectURL(previewUrl);
            setError(err instanceof Error ? err.message : "Chyba");
            setState({ tag: "idle" });
        }
    }

    const fmtAngle = (deg: number) => {
        if (deg === 0) return "bez rotace";
        const dir = deg > 0 ? "po směru" : "proti směru";
        return `${Math.abs(deg)}° ${dir} hodinových ručiček`;
    };

    return (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-amber-500" />
                <p className="text-xs font-medium text-amber-700">PoC — Gemini auto-rotace</p>
                <span className="text-[10px] text-amber-400 border border-amber-200 rounded px-1">experiment</span>
            </div>

            {state.tag === "idle" && (
                <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                        Nahraj fotku — Gemini určí natočení, aplikace obrázek pootočí.
                    </p>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer h-8 px-3 rounded-md border border-amber-300 bg-white text-amber-700 text-xs font-medium hover:bg-amber-50 transition-colors">
                        <Upload size={12} />
                        Vybrat fotku
                        <input ref={inputRef} type="file" accept="image/*" className="sr-only"
                            onChange={e => handleFile(e.target.files?.[0])} />
                    </label>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
            )}

            {(state.tag === "detecting" || state.tag === "rotating") && (
                <div className="flex items-center gap-2">
                    <Sparkles size={13} className="text-amber-500 animate-pulse" />
                    <p className="text-xs text-amber-600">
                        {state.tag === "detecting"
                            ? "Gemini analyzuje orientaci…"
                            : `Otáčím o ${fmtAngle(state.angleDeg)}…`}
                    </p>
                </div>
            )}

            {state.tag === "done" && (
                <div className="space-y-3">
                    {/* Info o rotaci */}
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className={state.angleDeg === 0 ? "text-green-600" : "text-amber-700"}>
                            {state.angleDeg === 0 ? "✓ Obrázek je správně orientovaný" : `↻ Pootočeno: ${fmtAngle(state.angleDeg)}`}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400">jistota {Math.round(state.confidence * 100)}%</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400">{Math.round(state.resultFile.size / 1024)} kB</span>
                    </div>

                    {/* Výsledný obrázek */}
                    <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 inline-block max-w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={state.resultUrl} alt="Výsledek rotace"
                            className="max-w-full max-h-64 object-contain" />
                    </div>

                    <button onClick={reset} className="text-xs text-amber-600 hover:underline block">
                        Zkusit znovu
                    </button>
                </div>
            )}
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

            <AutoCropPoc />
            <AutoRotatePoc />
        </div>
    );
}
