"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Paperclip, Pencil, RotateCw, Trash2, Upload, FileText, ImageIcon, Crop as CropIcon, Sparkles, CircleAlert, Send, Replace, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getEventExpenses } from "@/lib/actions/event-expenses";
import type { EventExpenseRow } from "@/lib/actions/event-expenses";
import { getPeopleForAutocomplete, type PersonOption } from "@/lib/actions/people";
import { expenseCategoryEnum, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/expense-categories";
import { setTreasurerApproval, getVyuctovaniActivityLog, type VyuctovaniActivity } from "@/lib/actions/events";
import { lockForReimbursement, unlockForReimbursement } from "@/lib/actions/event-settlement";
import { EventExpenseActions, EventExpenseDocForms } from "./event-expense-actions";
import { PersonAutocomplete } from "./person-autocomplete";
import { analyzedMatchesAmount, hasAmountMismatch, isMismatchAcknowledged } from "@/lib/expense-mismatch";
import { Mail, Check } from "lucide-react";


const CATEGORIES = expenseCategoryEnum as readonly ExpenseCategory[];
const MAX_PX = 1600;
const JPEG_QUALITY = 0.85;

function fmtAmount(amount: string | null) {
    if (!amount) return "–";
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
    document_type: "receipt" | "invoice" | null;
    payee_name: string | null;
    merchant: string;
    date: string | null;
    total_amount: number | null;
    currency: string;
    account_code: ExpenseCategory | null;
    category_name: string;
    reasoning: string;
    confidence: number;
};

// ── Analysis card ─────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.round(value * 100);
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
                {/* Typ dokladu + příjemce faktury */}
                <div className="flex flex-wrap gap-2 items-center">
                    {analysis.document_type === "invoice" ? (
                        <span className="text-[11px] font-semibold uppercase tracking-wide rounded px-2 py-0.5 border text-orange-700 bg-orange-50 border-orange-200">
                            Faktura
                        </span>
                    ) : analysis.document_type === "receipt" ? (
                        <span className="text-[11px] font-semibold uppercase tracking-wide rounded px-2 py-0.5 border text-green-700 bg-green-50 border-green-200">
                            Účtenka
                        </span>
                    ) : null}
                    {analysis.payee_name && (
                        <span className="text-xs text-gray-700 font-medium">{analysis.payee_name}</span>
                    )}
                </div>

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

// ── Náhled dokladu (lightbox) ─────────────────────────────────────────────────

function DocPreviewDialog({ url, mime, fileName, open, onClose }: {
    url: string;
    mime: string | null;
    fileName: string | null;
    open: boolean;
    onClose: () => void;
}) {
    const isPdf = mime === "application/pdf";
    const isImg = isImage(mime);

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-4xl max-h-[92vh] p-0 overflow-hidden flex flex-col">
                <DialogHeader className="px-4 py-3 border-b shrink-0">
                    <DialogTitle className="text-sm font-medium truncate">{fileName ?? "Doklad"}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-auto min-h-0 bg-gray-50">
                    {isImg && (
                        <div className="min-h-full min-w-full flex items-center justify-center p-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={fileName ?? "doklad"}
                                className="max-h-[80vh] rounded shadow" />
                        </div>
                    )}
                    {isPdf && (
                        <iframe src={url} className="w-full rounded" style={{ height: "78vh" }}
                            title={fileName ?? "doklad"} />
                    )}
                    {!isImg && !isPdf && (
                        <div className="text-center space-y-3 py-8">
                            <FileText size={48} className="text-gray-300 mx-auto" />
                            <p className="text-sm text-gray-600">{fileName}</p>
                            <a href={url} target="_blank" rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:underline">
                                Otevřít soubor
                            </a>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Resize image for Gemini (client-side, before API call) ───────────────────

function resizeForGemini(file: File, maxPx = 1024): Promise<File> {
    return new Promise((resolve, reject) => {
        const srcUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
            if (scale === 1) {
                URL.revokeObjectURL(srcUrl);
                resolve(file);
                return;
            } // už je dost malý

            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.naturalWidth * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                URL.revokeObjectURL(srcUrl);
                resolve(file);
                return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                blob => {
                    URL.revokeObjectURL(srcUrl);
                    if (!blob) { resolve(file); return; }
                    resolve(new File([blob], file.name, { type: "image/jpeg" }));
                },
                "image/jpeg",
                0.92,
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(srcUrl);
            reject(new Error("Resize failed"));
        };
        img.src = srcUrl;
    });
}

async function prepareFileForGemini(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) {
        return file;
    }

    try {
        return await resizeForGemini(file, 1024);
    } catch {
        // Fallback: keep full-size original when resize fails.
        return file;
    }
}

// ── Expand crop outward as safety margin ─────────────────────────────────────

function expandCrop(crop: Crop, paddingPct: number): Crop {
    if (crop.unit !== "%") return crop;
    const x = Math.max(0, crop.x - paddingPct);
    const y = Math.max(0, crop.y - paddingPct);
    const right = Math.min(100, crop.x + crop.width + paddingPct);
    const bottom = Math.min(100, crop.y + crop.height + paddingPct);
    return { unit: "%", x, y, width: right - x, height: bottom - y };
}

// ── Image rotate via canvas ───────────────────────────────────────────────────

function rotateImage(srcUrl: string, angleDeg: number, originalName: string): Promise<File> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const rad = (angleDeg * Math.PI) / 180;
            const sin = Math.abs(Math.sin(rad));
            const cos = Math.abs(Math.cos(rad));
            const w = img.naturalWidth;
            const h = img.naturalHeight;

            // Canvas musí být dost velký aby pojal otočený obrázek
            const canvasW = Math.round(w * cos + h * sin);
            const canvasH = Math.round(w * sin + h * cos);

            const canvas = document.createElement("canvas");
            canvas.width = canvasW;
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
            const sw = crop ? crop.width : img.naturalWidth;
            const sh = crop ? crop.height : img.naturalHeight;

            const scale = Math.min(1, MAX_PX / Math.max(sw, sh));
            const dw = Math.round(sw * scale);
            const dh = Math.round(sh * scale);

            const canvas = document.createElement("canvas");
            canvas.width = dw;
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

// ── Custom vertical slider (pointer events — CSS rotate nefunguje správně) ────

function VerticalSlider({ value, min, max, onChange, onCommit, disabled, height = 150 }: {
    value: number;
    min: number;
    max: number;
    onChange: (v: number) => void;
    onCommit: () => void;
    disabled?: boolean;
    height?: number;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    function valueFromY(clientY: number): number {
        const rect = trackRef.current!.getBoundingClientRect();
        // Nahoře = max, dole = min
        const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        return Math.round(min + pct * (max - min));
    }

    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (disabled) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(valueFromY(e.clientY));
    }

    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!dragging.current) return;
        onChange(valueFromY(e.clientY));
    }

    function onPointerUp() {
        if (!dragging.current) return;
        dragging.current = false;
        onCommit();
    }

    const thumbPct = 1 - (value - min) / (max - min); // 0 = nahoře (max), 1 = dole (min)

    return (
        <div
            ref={trackRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
                width: 28, height, position: "relative", touchAction: "none",
                cursor: disabled ? "default" : "ns-resize", userSelect: "none"
            }}
        >
            {/* Track */}
            <div style={{
                position: "absolute", left: "50%", top: 6, bottom: 6,
                width: 4, background: "#d1d5db", transform: "translateX(-50%)", borderRadius: 2
            }} />
            {/* Střed — 0° indikátor */}
            <div style={{
                position: "absolute", left: "50%", top: "50%",
                width: 10, height: 2, background: "#9ca3af", transform: "translate(-50%, -50%)", borderRadius: 1
            }} />
            {/* Thumb */}
            <div style={{
                position: "absolute", left: "50%",
                top: `${thumbPct * 100}%`,
                width: 20, height: 20,
                background: disabled ? "#d1d5db" : value !== 0 ? "#3b82f6" : "#6b7280",
                borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                transition: "background 0.15s",
            }} />
        </div>
    );
}

type GeminiCropInfo = {
    confidence: number;
    fields_check: {
        company_name: boolean;
        ico: boolean | null;
        dic: boolean | null;
        total_amount: boolean;
    };
};

function ImageCropModal({ srcUrl, originalName, onDone, onCancel, suggestedCrop, geminiInfo }: {
    srcUrl: string;
    originalName: string;
    onDone: (file: File) => void;
    onCancel: () => void;
    suggestedCrop?: Crop;
    geminiInfo?: GeminiCropInfo;
}) {
    const [currentUrl, setCurrentUrl] = useState(srcUrl);
    const [crop, setCrop] = useState<Crop | undefined>(suggestedCrop);
    const [pixelCrop, setPixelCrop] = useState<PixelCrop>();
    const [processing, setProcessing] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [sizeInfo, setSizeInfo] = useState<string | null>(null);
    const [sliderVal, setSliderVal] = useState(0);
    const [totalRot, setTotalRot] = useState(0);
    const imgRef = useRef<HTMLImageElement>(null);
    const ownedUrls = useRef<string[]>([]);

    // Revoke any URLs we created during rotation when modal closes
    useEffect(() => {
        const urls = ownedUrls.current;
        return () => { urls.forEach(u => URL.revokeObjectURL(u)); };
    }, []);

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        const scale = Math.min(1, MAX_PX / Math.max(w, h));
        setSizeInfo(`${w}×${h}px → výstup max ${Math.round(w * scale)}×${Math.round(h * scale)}px`);
    }

    async function applyRotation(deg: number) {
        if (rotating || deg === 0) return;
        setRotating(true);
        try {
            const rotated = await rotateImage(currentUrl, deg, originalName);
            const newUrl = URL.createObjectURL(rotated);
            ownedUrls.current.push(newUrl);
            // Revoke previous intermediate URL (but never the original srcUrl)
            if (currentUrl !== srcUrl) URL.revokeObjectURL(currentUrl);
            setCurrentUrl(newUrl);
            setCrop(undefined);
            setPixelCrop(undefined);
            setTotalRot(r => ((r + deg) % 360 + 360) % 360);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Chyba rotace");
        } finally {
            setRotating(false);
        }
    }

    function handleSliderMove(val: number) {
        setSliderVal(val);
        if (val !== 0) { setCrop(undefined); setPixelCrop(undefined); }
    }

    function handleSliderCommit() {
        if (sliderVal === 0) return;
        const deg = sliderVal;
        setSliderVal(0);
        applyRotation(deg);
    }

    async function apply(useCrop: boolean) {
        setProcessing(true);
        try {
            let activeCrop: PixelCrop | null = null;
            if (useCrop && pixelCrop?.width && pixelCrop?.height && imgRef.current) {
                const img = imgRef.current;
                const scaleX = img.naturalWidth / img.width;
                const scaleY = img.naturalHeight / img.height;
                activeCrop = {
                    unit: "px",
                    x: Math.round(pixelCrop.x * scaleX),
                    y: Math.round(pixelCrop.y * scaleY),
                    width: Math.round(pixelCrop.width * scaleX),
                    height: Math.round(pixelCrop.height * scaleY),
                };
            }
            const result = await compressImage(currentUrl, activeCrop, originalName);
            onDone(result);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Chyba zpracování");
        } finally {
            setProcessing(false);
        }
    }

    const hasCrop = !!pixelCrop?.width && !!pixelCrop?.height;
    const busyNow = processing || rotating;
    const rotLabel = totalRot === 0 ? "" : `${totalRot}°`;

    return (
        <Dialog open onOpenChange={open => { if (!open) onCancel(); }}>
            <DialogContent
                className="max-w-2xl w-full p-0 gap-0 overflow-hidden"
                onPointerDownOutside={e => e.preventDefault()}
                onInteractOutside={e => e.preventDefault()}
            >
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

                {/* Rotation controls — desktop only */}
                <div className="hidden sm:flex items-center gap-2 px-4 py-2 border-b bg-white">
                    <span className="text-xs text-gray-500 shrink-0">Otočit:</span>
                    <button
                        type="button" disabled={busyNow}
                        onClick={() => applyRotation(90)}
                        className="h-8 w-8 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-colors shrink-0"
                        title="Otočit 90° doprava">
                        <RotateCw size={15} />
                    </button>
                    <span className="text-xs text-gray-400 tabular-nums w-8 text-right shrink-0">
                        {sliderVal > 0 ? `+${sliderVal}°` : sliderVal === 0 ? "0°" : `${sliderVal}°`}
                    </span>
                    <input
                        type="range" min={-30} max={30} step={1}
                        value={sliderVal}
                        onChange={e => handleSliderMove(Number(e.target.value))}
                        onPointerUp={handleSliderCommit}
                        disabled={busyNow}
                        className="flex-1 accent-gray-600 disabled:opacity-40"
                    />
                    <span className="text-xs text-gray-400 shrink-0 w-24 text-right">
                        {rotating ? "otáčím…"
                            : sliderVal !== 0 ? "pusť pro aplikovat"
                                : rotLabel ? `celkem ${rotLabel}`
                                    : ""}
                    </span>
                </div>

                {/* Image area — s vertikálním sliderem vpravo na mobilu */}
                <div className="flex bg-gray-100 overflow-hidden" style={{ maxHeight: "55vh" }}>
                    {/* Obrázek */}
                    <div className="flex-1 overflow-auto flex items-center justify-center p-3">
                        <div className="relative">
                            <ReactCrop
                                crop={sliderVal !== 0 ? undefined : crop}
                                onChange={(_, pct) => setCrop(pct)}
                                onComplete={c => setPixelCrop(c)}
                                disabled={sliderVal !== 0}
                                className="max-w-full"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    ref={imgRef}
                                    src={currentUrl}
                                    alt="Náhled dokladu"
                                    onLoad={onImageLoad}
                                    style={{
                                        maxWidth: "100%", maxHeight: "48vh", objectFit: "contain",
                                        transform: `rotate(${sliderVal}deg)`,
                                        transition: "none",
                                    }}
                                />
                            </ReactCrop>

                            {/* Crosshair — vodorovná 70% shora, svislá 60% zleva */}
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute top-[70%] left-0 right-0 h-px -translate-y-px"
                                    style={{ background: "rgba(255,255,255,0.55)", boxShadow: "0 0 2px rgba(0,0,0,0.4)" }} />
                                <div className="absolute left-[60%] top-0 bottom-0 w-px -translate-x-px"
                                    style={{ background: "rgba(255,255,255,0.55)", boxShadow: "0 0 2px rgba(0,0,0,0.4)" }} />
                            </div>
                        </div>
                    </div>

                    {/* Vertikální slider — mobil only, vpravo */}
                    <div className="sm:hidden flex flex-col items-center gap-2 bg-gray-200/60 px-1 py-3 w-10 shrink-0">
                        {/* Úhel */}
                        <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
                            {sliderVal > 0 ? `+${sliderVal}°` : `${sliderVal}°`}
                        </span>

                        {/* Custom vertikální slider — drag nahoru = +°, dolu = -° */}
                        <div className="flex-1 flex items-center justify-center" style={{ minHeight: 140 }}>
                            <VerticalSlider
                                value={sliderVal} min={-30} max={30}
                                onChange={handleSliderMove}
                                onCommit={handleSliderCommit}
                                disabled={busyNow}
                                height={150}
                            />
                        </div>

                        {/* Stav */}
                        {sliderVal !== 0 && !rotating && (
                            <span className="text-[9px] text-blue-500 text-center leading-tight shrink-0">pusť</span>
                        )}
                        {rotating && (
                            <span className="text-[9px] text-gray-400 animate-pulse shrink-0">…</span>
                        )}

                        {/* 90° tlačítko — ikona bez textu */}
                        <button
                            type="button" disabled={busyNow}
                            onClick={() => applyRotation(90)}
                            className="w-8 h-8 flex items-center justify-center rounded border border-gray-400 bg-white hover:bg-gray-50 disabled:opacity-40 shrink-0"
                            title="Otočit 90° doprava">
                            <RotateCw size={14} className="text-gray-600" />
                        </button>
                    </div>
                </div>

                {/* Info + actions */}
                <div className="px-5 py-3 border-t bg-gray-50 space-y-3">
                    {sizeInfo && (
                        <p className="text-xs text-gray-500">{sizeInfo} · JPEG {Math.round(JPEG_QUALITY * 100)}%</p>
                    )}

                    {/* Gemini info panel */}
                    {geminiInfo && (
                        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-violet-500 font-medium uppercase tracking-wide">Gemini</span>
                                <div className="flex-1 h-1 rounded-full bg-gray-200 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${geminiInfo.confidence >= 0.8 ? "bg-green-500" : geminiInfo.confidence >= 0.55 ? "bg-amber-400" : "bg-red-400"}`}
                                        style={{ width: `${Math.round(geminiInfo.confidence * 100)}%` }}
                                    />
                                </div>
                                <span className="text-[10px] tabular-nums text-gray-500">
                                    {Math.round(geminiInfo.confidence * 100)}%
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                {([
                                    ["Firma", geminiInfo.fields_check.company_name],
                                    ["Částka", geminiInfo.fields_check.total_amount],
                                    ["IČ", geminiInfo.fields_check.ico],
                                    ["DIČ", geminiInfo.fields_check.dic],
                                ] as [string, boolean | null][]).map(([label, ok]) => (
                                    <span key={label} className={`text-[10px] ${ok === null ? "text-gray-300" : ok ? "text-green-600" : "text-red-500 font-semibold"}`}>
                                        {ok === null ? `— ${label}` : ok ? `✓ ${label}` : `⚠ ${label}`}
                                    </span>
                                ))}
                            </div>
                            {Object.entries(geminiInfo.fields_check).some(([, v]) => v === false) && (
                                <p className="text-[10px] text-red-500">Uprav ořez tak, aby označená pole zůstala uvnitř.</p>
                            )}
                        </div>
                    )}

                    <p className="text-xs text-gray-400">
                        {hasCrop
                            ? "Oblast vybrána — klikni Oříznout a použít."
                            : "Tažením vyber oblast, nebo pokračuj bez ořezu."}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            disabled={busyNow || !hasCrop}
                            onClick={() => apply(true)}
                            className="bg-[#327600] hover:bg-[#2a6400] text-white">
                            {processing ? "Zpracovávám…" : "Oříznout a použít"}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busyNow}
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
    | { tag: "analyzed"; file: File; analysis: ExpenseAnalysis }
    | { tag: "uploading"; file: File };

function AddExpenseForm({
    eventId,
    personOptions,
    peopleLoaded,
    onPersonCreated,
    onAdded,
}: {
    eventId: number;
    personOptions: PersonOption[];
    peopleLoaded: boolean;
    onPersonCreated: (person: PersonOption) => void;
    onAdded: () => void;
}) {
    const [state, setState]  = useState<FlowState>({ tag: "idle" });
    const [error, setError]  = useState<string | null>(null);
    const [amount, setAmount]     = useState("");
    const [category, setCategory] = useState<ExpenseCategory>("501/004");
    const [purposeText, setPurposeText] = useState("");
    const [reimbursementPersonId, setReimbursementPersonId] = useState("");
    const [isPaid, setIsPaid] = useState(true);
    const [invoicePayeeName, setInvoicePayeeName] = useState("");
    const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
    const fileInputRef   = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const purposeRef     = useRef<HTMLInputElement>(null);
    const abandonRef     = useRef(false);

    function resetToIdle() {
        setState({ tag: "idle" });
        setError(null);
        setAmount(""); setCategory("501/004"); setPurposeText(""); setReimbursementPersonId(""); setIsPaid(true); setInvoicePayeeName("");
        if (fileInputRef.current)   fileInputRef.current.value   = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
    }

    async function runAnalysis(file: File) {
        abandonRef.current = false;
        setState({ tag: "analyzing", file });
        setError(null);
        try {
            const small = await prepareFileForGemini(file);
            const fd = new FormData();
            fd.append("file", small);
            const analysisRes = await fetch("/api/expenses/analyze", { method: "POST", body: fd });
            const analysisData: ExpenseAnalysis & { error?: string } = await analysisRes.json();
            if (!analysisRes.ok) throw new Error(analysisData.error ?? "Chyba analýzy");

            const amt = analysisData.total_amount !== null && analysisData.total_amount !== undefined
                ? String(analysisData.total_amount).replace(".", ",")
                : "";
            const cat = analysisData.account_code ?? "501/004";
            setAmount(amt);
            setCategory(cat);
            if (analysisData.document_type === "invoice") {
                setIsPaid(false);
                setInvoicePayeeName(analysisData.payee_name ?? "");
            }

            if (abandonRef.current) {
                // User clicked "Nahrát další" during analysis — auto-save as unconfirmed in background
                void autoSaveUnconfirmed(file, analysisData);
            } else {
                setState({ tag: "analyzed", file, analysis: analysisData });
                setTimeout(() => purposeRef.current?.focus(), 50);
            }
        } catch (err) {
            if (!abandonRef.current) {
                setError(err instanceof Error ? err.message : "Analýza selhala");
                setState({ tag: "idle" });
            }
        }
    }

    async function autoSaveUnconfirmed(file: File, analysisData: ExpenseAnalysis) {
        try {
            const saveFd = new FormData();
            saveFd.append("status", "unconfirmed");
            saveFd.append("file", file);
            if (analysisData.total_amount !== null && analysisData.total_amount !== undefined) {
                saveFd.append("amount", String(analysisData.total_amount));
                saveFd.append("analyzedAmount", String(analysisData.total_amount));
            }
            if (analysisData.account_code) {
                saveFd.append("purposeCategory", analysisData.account_code);
            }
            await fetch(`/api/events/${eventId}/expenses`, { method: "POST", body: saveFd });
            onAdded();
        } catch {
            // silently ignore — user has moved on
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

    function handleUploadAnother() {
        abandonRef.current = true;  // analysis continues in bg → auto-saves as unconfirmed
        setState({ tag: "idle" });
        setError(null);
        if (fileInputRef.current)   fileInputRef.current.value   = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
    }

    async function handleSave() {
        if (state.tag !== "analyzed") return;
        setError(null);
        const amountNum = parseFloat(amount.replace(",", "."));
        if (isNaN(amountNum) || amountNum <= 0) { setError("Oprav částku"); return; }
        if (!purposeText.trim()) { setError("Doplň účel dokladu"); purposeRef.current?.focus(); return; }

        const savedFile = state.file;
        const savedAnalysis = state.analysis;
        setState({ tag: "uploading", file: savedFile });
        try {
            const fd = new FormData();
            fd.append("status", "final");
            fd.append("amount", String(amountNum));
            if (savedAnalysis?.total_amount !== null && savedAnalysis?.total_amount !== undefined) {
                fd.append("analyzedAmount", String(savedAnalysis.total_amount));
            }
            fd.append("purposeText", purposeText.trim());
            fd.append("purposeCategory", category);
            fd.append("isPaid", String(isPaid));
            if (!isPaid && invoicePayeeName.trim()) fd.append("invoicePayeeName", invoicePayeeName.trim());
            if (isPaid && reimbursementPersonId) fd.append("reimbursementPersonId", reimbursementPersonId);
            fd.append("file", savedFile);

            const res = await fetch(`/api/events/${eventId}/expenses`, { method: "POST", body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Chyba uložení");

            resetToIdle();
            onAdded();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chyba uložení");
            setState({ tag: "analyzed", file: savedFile, analysis: savedAnalysis });
        }
    }

    // ── Render ──

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

    if (state.tag === "analyzing") {
        return (
            <div className="rounded-xl border bg-white p-6 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                        <Sparkles size={15} className="text-violet-600 animate-pulse" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">Analyzuji doklad…</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{state.file.name}</p>
                    </div>
                    <button type="button" onClick={handleUploadAnother}
                        className="text-xs text-gray-400 hover:text-gray-600 shrink-0 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 transition-colors">
                        Nahrát další
                    </button>
                </div>
                <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
            </div>
        );
    }

    if (state.tag === "analyzed" || state.tag === "uploading") {
        const analysis = state.tag === "analyzed" ? state.analysis : null;
        const isUploading = state.tag === "uploading";
        return (
            <div className="space-y-3">
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

                {analysis && <AnalysisCard analysis={analysis} />}

                <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Zkontroluj a doplň</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                Částka (Kč)
                                <span className="text-violet-400">✦</span>
                            </label>
                            <input type="text" inputMode="decimal"
                                value={amount} onChange={e => setAmount(e.target.value)}
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
                            value={purposeText} onChange={e => setPurposeText(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
                            disabled={isUploading}
                            className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>

                    <div className="flex rounded-lg border overflow-hidden text-sm">
                        <button type="button" onClick={() => setIsPaid(true)} disabled={isUploading}
                            className={`flex-1 px-3 py-2 transition-colors ${isPaid ? "bg-gray-800 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                            Účtenka (zaplacená)
                        </button>
                        <button type="button" onClick={() => setIsPaid(false)} disabled={isUploading}
                            className={`flex-1 px-3 py-2 border-l transition-colors ${!isPaid ? "bg-orange-600 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                            Faktura (k proplacení)
                        </button>
                    </div>

                    {isPaid && (
                        <PersonAutocomplete
                            people={personOptions}
                            peopleLoaded={peopleLoaded}
                            value={reimbursementPersonId}
                            disabled={isUploading}
                            onChange={person => setReimbursementPersonId(person ? String(person.id) : "")}
                            onPersonCreated={onPersonCreated}
                        />
                    )}
                    {!isPaid && (
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-500">Příjemce faktury</label>
                            <input type="text" placeholder="Název firmy nebo osoby z faktury"
                                value={invoicePayeeName}
                                onChange={e => setInvoicePayeeName(e.target.value)}
                                disabled={isUploading}
                                className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                        </div>
                    )}

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button onClick={handleSave} disabled={isUploading} size="sm"
                            className="bg-[#327600] hover:bg-[#2a6400] text-white">
                            {isUploading ? "Ukládám…" : "Přidat doklad"}
                        </Button>
                        <button type="button" onClick={handleUploadAnother} disabled={isUploading}
                            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 transition-colors">
                            Nahrát další (uložit tento jako nepotvrzený)
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Idle — upload area
    return (
        <>
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center space-y-3">
                <div className="flex justify-center">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <Upload size={18} className="text-gray-400" />
                    </div>
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-700">Nahrát doklad</p>
                    <p className="text-xs text-gray-400 mt-0.5">PDF, Excel nebo fotka — Gemini automaticky vyčte částku a kategorii</p>
                </div>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer h-9 px-4 rounded-md bg-[#327600] text-white text-sm font-medium hover:bg-[#2a6400] transition-colors">
                        <Upload size={14} />
                        <span>Vybrat soubor</span>
                        <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.xls,.xlsx"
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
                <button type="button" onClick={() => setShowInvoiceDialog(true)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors">
                    Přidat fakturu (bez dokladu)
                </button>
            </div>
            <AddInvoiceWithoutDocDialog
                eventId={eventId}
                open={showInvoiceDialog}
                onOpenChange={setShowInvoiceDialog}
                onAdded={onAdded}
            />
        </>
    );
}

// ── Add invoice without document dialog ──────────────────────────────────────

function AddInvoiceWithoutDocDialog({
    eventId,
    open,
    onOpenChange,
    onAdded,
}: {
    eventId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdded: () => void;
}) {
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState<ExpenseCategory>("501/004");
    const [purposeText, setPurposeText] = useState("");
    const [invoicePayeeName, setInvoicePayeeName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) { setAmount(""); setCategory("501/004"); setPurposeText(""); setInvoicePayeeName(""); setError(null); }
    }, [open]);

    async function handleSave() {
        const amountNum = parseFloat(amount.replace(",", "."));
        if (isNaN(amountNum) || amountNum <= 0) { setError("Zadej platnou částku"); return; }
        if (!purposeText.trim()) { setError("Zadej účel / popis"); return; }

        setSaving(true); setError(null);
        try {
            const fd = new FormData();
            fd.append("status", "final");
            fd.append("amount", String(amountNum));
            fd.append("purposeText", purposeText.trim());
            fd.append("purposeCategory", category);
            fd.append("isPaid", "false");
            if (invoicePayeeName.trim()) fd.append("invoicePayeeName", invoicePayeeName.trim());

            const res = await fetch(`/api/events/${eventId}/expenses`, { method: "POST", body: fd });
            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error ?? "Chyba uložení");

            onOpenChange(false);
            onAdded();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chyba uložení");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Přidat fakturu bez dokladu</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Částka (Kč) *</label>
                            <input type="text" inputMode="decimal"
                                value={amount} onChange={e => setAmount(e.target.value)}
                                placeholder="8 000"
                                disabled={saving}
                                className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Účetní kód *</label>
                            <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)}
                                disabled={saving}
                                className="w-full h-9 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                {CATEGORIES.map(c => (
                                    <option key={c} value={c}>{c} · {EXPENSE_CATEGORY_LABELS[c]}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Účel / popis *</label>
                        <input type="text"
                            placeholder="Např. doprava autobusem Praha–Brno"
                            value={purposeText} onChange={e => setPurposeText(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void handleSave(); } }}
                            disabled={saving}
                            className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Příjemce faktury</label>
                        <input type="text"
                            placeholder="Název firmy nebo osoby"
                            value={invoicePayeeName} onChange={e => setInvoicePayeeName(e.target.value)}
                            disabled={saving}
                            className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
                            Zrušit
                        </Button>
                        <Button size="sm" onClick={() => void handleSave()} disabled={saving}
                            className="bg-[#327600] hover:bg-[#2a6400] text-white">
                            {saving ? "Ukládám…" : "Přidat fakturu"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Porovnání zapsané vs. zjištěné částky ─────────────────────────────────────

function AmountComparison({ written, detected }: { written: string | null; detected: number | null }) {
    const match = analyzedMatchesAmount(written, detected);
    return (
        <div className={`rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-3 ${
            match ? "border-green-200 bg-green-50" : "border-red-300 bg-red-50"
        }`}>
            <span className="text-gray-600">
                Zapsáno: <span className="font-semibold text-gray-900 tabular-nums">{fmtAmount(written)}</span>
            </span>
            <span className={match ? "text-green-700" : "text-red-700 font-medium"}>
                Zjištěno: <span className="font-semibold tabular-nums">
                    {detected != null ? `${new Intl.NumberFormat("cs-CZ").format(detected)} Kč` : "nečitelné"}
                </span>
            </span>
        </div>
    );
}

function PayeeComparison({ written, detected }: { written: string; detected: string | null }) {
    if (!detected) return null;
    const match = written.trim().toLowerCase() === detected.trim().toLowerCase();
    return (
        <div className={`rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-3 ${
            match ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"
        }`}>
            <span className="text-gray-600 truncate">
                Zapsáno: <span className="font-medium text-gray-900">{written || "—"}</span>
            </span>
            <span className={match ? "text-green-700" : "text-amber-700"}>
                Na faktuře: <span className="font-medium">{detected}</span>
            </span>
        </div>
    );
}

// ── Attach / swap file dialog ─────────────────────────────────────────────────

function AttachFileDialog({
    expense,
    eventId,
    open,
    onOpenChange,
    onUpdated,
    lockedForParticipants = false,
    isTreasurer = false,
}: {
    expense: EventExpenseRow;
    eventId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdated: () => void;
    lockedForParticipants?: boolean;
    isTreasurer?: boolean;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
    const [amount, setAmount] = useState("");
    const [purposeText, setPurposeText] = useState("");
    const [invoicePayeeName, setInvoicePayeeName] = useState("");
    const [confirmChecked, setConfirmChecked] = useState(false);
    const [fileSaved, setFileSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasFile = expense.fileUrl != null;

    useEffect(() => {
        if (!open) return;
        setFile(null); setAnalysis(null); setError(null); setConfirmChecked(false); setSaving(false);
        setAmount(expense.amount ? expense.amount.replace(".", ",") : "");
        setPurposeText(expense.purposeText ?? "");
        setInvoicePayeeName(expense.invoicePayeeName ?? "");
        setFileSaved(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [open, expense]);

    // Частka pro porovnání: zamčeno → vždy z DB; odemčeno → z editovatelného pole
    const compareAmount = lockedForParticipants
        ? expense.amount
        : (amount.replace(",", ".").trim() || null);
    const detected = analysis ? analysis.total_amount : null;
    const match = analyzedMatchesAmount(compareAmount, detected);
    const mismatch = analysis != null && !match;

    async function handleFile(picked: File | undefined) {
        if (!picked) return;
        setFile(picked); setAnalyzing(true); setError(null); setAnalysis(null); setConfirmChecked(false);
        setFileSaved(false);
        try {
            const small = await prepareFileForGemini(picked);
            const fd = new FormData();
            fd.append("file", small);
            const res = await fetch("/api/expenses/analyze", { method: "POST", body: fd });
            const data: ExpenseAnalysis & { error?: string } = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Chyba analýzy");
            setAnalysis(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analýza selhala");
        } finally {
            setAnalyzing(false);
        }
    }

    async function handleSave() {
        if (!file) return;
        if (!purposeText.trim()) { setError("Doplň účel dokladu"); return; }
        setSaving(true); setError(null);
        try {
            if (!fileSaved) {
                const fd = new FormData();
                fd.append("file", file);
                fd.append("amount", amount.replace(",", "."));
                if (mismatch && isTreasurer && confirmChecked) fd.append("confirmMismatch", "true");
                const res = await fetch(
                    `/api/events/${eventId}/expenses/${expense.id}/attach-file`,
                    { method: "POST", body: fd },
                );
                const data = await res.json() as { error?: string };
                if (!res.ok) throw new Error(data.error ?? "Chyba nahrávání");
                setFileSaved(true);
            }

            const trimmedPurpose = purposeText.trim();
            const trimmedPayee = invoicePayeeName.trim();
            const purposeChanged = trimmedPurpose !== (expense.purposeText ?? "");
            const payeeChanged = !expense.isPaid && trimmedPayee !== (expense.invoicePayeeName ?? "");
            if (purposeChanged || payeeChanged) {
                const patchBody: Record<string, unknown> = { expenseId: expense.id };
                if (purposeChanged) patchBody.purposeText = trimmedPurpose;
                if (payeeChanged) patchBody.invoicePayeeName = trimmedPayee || null;
                const patchRes = await fetch(`/api/events/${eventId}/expenses`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patchBody),
                });
                if (!patchRes.ok) {
                    const patchData = await patchRes.json() as { error?: string };
                    throw new Error(patchData.error ?? "Doklad byl uložen, ale popis/příjemce se nepodařilo uložit — zkus to znovu.");
                }
            }

            onOpenChange(false);
            onUpdated();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chyba ukládání");
            if (fileSaved) onUpdated(); // soubor a částka se uložily i přes chybu v druhém kroku
        } finally {
            setSaving(false);
        }
    }

    const busy = analyzing || saving;
    // Kdy lze uložit
    const lockedBlockedByTreasurer = lockedForParticipants && mismatch && !isTreasurer;
    const needsConfirm = lockedForParticipants && mismatch && isTreasurer;
    const canSave = file != null && !busy && !lockedBlockedByTreasurer && (!needsConfirm || confirmChecked);

    return (
        <Dialog open={open} onOpenChange={open => { if (!busy) onOpenChange(open); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{hasFile ? "Vyměnit doklad" : "Přiložit doklad"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-1">
                    {expense.purposeText && (
                        <p className="text-sm text-gray-600">{expense.purposeText}</p>
                    )}

                    <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-5 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50 transition-colors ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                        <Paperclip size={20} className="text-amber-500" />
                        <span className="text-sm text-gray-700">
                            {analyzing ? "Analyzuji…" : file ? file.name : "Vybrat soubor dokladu"}
                        </span>
                        <span className="text-xs text-gray-400">PDF, Excel nebo fotka, max 10 MB</span>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,application/pdf,.xls,.xlsx"
                            className="sr-only"
                            onChange={e => { void handleFile(e.target.files?.[0]); }}
                            disabled={busy}
                        />
                    </label>

                    {analysis && (
                        <>
                            <AnalysisCard analysis={analysis} />
                            <AmountComparison written={compareAmount} detected={detected} />

                            {lockedForParticipants ? (
                                <div className="text-xs text-gray-500">
                                    Předpisy jsou uzamčené — částka <span className="font-medium tabular-nums">{fmtAmount(expense.amount)}</span> se nemění.
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-600">Zapsaná částka (Kč)</label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={amount}
                                            onChange={e => setAmount(e.target.value)}
                                            inputMode="decimal"
                                            className="tabular-nums"
                                            disabled={busy}
                                        />
                                        {detected != null && (
                                            <Button type="button" variant="outline" size="sm"
                                                onClick={() => setAmount(String(detected).replace(".", ","))}
                                                disabled={busy}>
                                                Použít zjištěnou
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {lockedBlockedByTreasurer && (
                                <p className="text-xs text-red-600 flex items-start gap-1.5">
                                    <TriangleAlert size={13} className="shrink-0 mt-0.5" />
                                    Dokud jsou předpisy uzamčené, výměnu s neshodující se částkou může provést jen hospodář.
                                </p>
                            )}
                            {needsConfirm && (
                                <label className="flex items-start gap-2 text-xs text-red-700 cursor-pointer">
                                    <input type="checkbox" checked={confirmChecked}
                                        onChange={e => setConfirmChecked(e.target.checked)}
                                        className="mt-0.5" disabled={busy} />
                                    <span>Rozumím, že se zjištěná částka neshoduje se zapsanou, přesto uložit.</span>
                                </label>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-gray-600">Popis / účel</label>
                                <Input
                                    value={purposeText}
                                    onChange={e => setPurposeText(e.target.value)}
                                    disabled={busy}
                                />
                            </div>

                            {!expense.isPaid && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-600">Příjemce faktury</label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={invoicePayeeName}
                                            onChange={e => setInvoicePayeeName(e.target.value)}
                                            disabled={busy}
                                        />
                                        {analysis.payee_name && (
                                            <Button type="button" variant="outline" size="sm"
                                                onClick={() => setInvoicePayeeName(analysis.payee_name ?? "")}
                                                disabled={busy}>
                                                Použít
                                            </Button>
                                        )}
                                    </div>
                                    <PayeeComparison written={invoicePayeeName} detected={analysis.payee_name} />
                                </div>
                            )}
                        </>
                    )}

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
                            Zrušit
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={!canSave}>
                            {saving ? "Ukládám…" : "Uložit"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Reanalyze dialog (přeanalyzovat existující přílohu) ───────────────────────

function ReanalyzeDialog({
    expense,
    eventId,
    open,
    onOpenChange,
    onUpdated,
    isTreasurer = false,
}: {
    expense: EventExpenseRow;
    eventId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdated: () => void;
    isTreasurer?: boolean;
}) {
    const [running, setRunning] = useState(false);
    const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
    const [code, setCode] = useState<"needs_treasurer" | "needs_confirmation" | null>(null);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const call = useCallback(async (confirmMismatch: boolean) => {
        setRunning(true); setError(null);
        try {
            const url = `/api/events/${eventId}/expenses/${expense.id}/reanalyze${confirmMismatch ? "?confirmMismatch=true" : ""}`;
            const res = await fetch(url, { method: "POST" });
            const data = await res.json() as { success?: true; error?: string; code?: "needs_treasurer" | "needs_confirmation"; analysis?: ExpenseAnalysis };
            if (res.ok) {
                setAnalysis(data.analysis ?? null); setCode(null); setDone(true);
                onUpdated();
                return;
            }
            if (res.status === 409 && data.code) {
                setAnalysis(data.analysis ?? null); setCode(data.code);
                return;
            }
            throw new Error(data.error ?? "Analýza selhala");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analýza selhala");
        } finally {
            setRunning(false);
        }
    }, [eventId, expense.id, onUpdated]);

    // Auto-spuštění při otevření
    useEffect(() => {
        if (!open) { setAnalysis(null); setCode(null); setDone(false); setError(null); return; }
        void call(false);
    }, [open, call]);

    const detected = analysis ? analysis.total_amount : null;

    return (
        <Dialog open={open} onOpenChange={o => { if (!running) onOpenChange(o); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Přeanalyzovat přílohu</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-1">
                    {running && !analysis && (
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                            <RefreshCw size={14} className="animate-spin" /> Analyzuji přílohu…
                        </p>
                    )}

                    {analysis && (
                        <>
                            <AnalysisCard analysis={analysis} />
                            <AmountComparison written={expense.amount} detected={detected} />
                        </>
                    )}

                    {done && (
                        <p className="text-sm text-green-700 flex items-center gap-1.5">
                            <Check size={14} /> Analýza uložena.
                        </p>
                    )}

                    {code === "needs_treasurer" && (
                        <p className="text-xs text-red-600 flex items-start gap-1.5">
                            <TriangleAlert size={13} className="shrink-0 mt-0.5" />
                            Zjištěná částka se neshoduje se zapsanou. Dokud jsou předpisy uzamčené, uložit to může jen hospodář.
                        </p>
                    )}
                    {code === "needs_confirmation" && (
                        <p className="text-xs text-red-700">
                            Zjištěná částka se neshoduje se zapsanou — potvrďte uložení.
                        </p>
                    )}

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={running}>
                            {done ? "Zavřít" : "Zrušit"}
                        </Button>
                        {code === "needs_confirmation" && isTreasurer && (
                            <Button size="sm" onClick={() => call(true)} disabled={running}>
                                {running ? "Ukládám…" : "Přesto uložit"}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Draft processing dialog ───────────────────────────────────────────────────

function DraftProcessDialog({
    expense,
    eventId,
    open,
    people,
    peopleLoaded,
    onOpenChange,
    onPersonCreated,
    onSaved,
}: {
    expense: EventExpenseRow;
    eventId: number;
    open: boolean;
    people: PersonOption[];
    peopleLoaded: boolean;
    onOpenChange: (open: boolean) => void;
    onPersonCreated: (person: PersonOption) => void;
    onSaved: () => void | Promise<void>;
}) {
    const [amount, setAmount] = useState("");
    const [purposeText, setPurposeText] = useState("");
    const [purposeCategory, setPurposeCategory] = useState<ExpenseCategory>("501/004");
    const [reimbursementPersonId, setReimbursementPersonId] = useState("");
    const [isPaid, setIsPaid] = useState(expense.isPaid);
    const [invoicePayeeName, setInvoicePayeeName] = useState(expense.invoicePayeeName ?? "");
    const [analyzing, setAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        // Pre-fill from saved Gemini data (unconfirmed items have amount/category)
        setAmount(expense.amount ? expense.amount.replace(".", ",") : "");
        setPurposeText(expense.purposeText ?? "");
        setPurposeCategory(expense.purposeCategory ?? "501/004");
        setReimbursementPersonId(expense.reimbursementPersonId ? String(expense.reimbursementPersonId) : "");
        setIsPaid(expense.isPaid);
        setInvoicePayeeName(expense.invoicePayeeName ?? "");
        setAnalysis(null); setError(null);
    }, [open, expense]);

    async function runGeminiAnalysis() {
        if (!expense.fileUrl) return;
        setAnalyzing(true); setError(null);
        try {
            const blobRes = await fetch(`/api/blob-file?url=${encodeURIComponent(expense.fileUrl)}`);
            if (!blobRes.ok) throw new Error("Nepodařilo se načíst soubor");
            const blob = await blobRes.blob();
            const file = new File([blob], expense.fileName ?? "document", { type: expense.fileMime ?? blob.type });
            const small = await prepareFileForGemini(file);

            const fd = new FormData();
            fd.append("file", small);
            const res = await fetch("/api/expenses/analyze", { method: "POST", body: fd });
            const data: ExpenseAnalysis & { error?: string } = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Chyba analýzy");

            setAnalysis(data);
            if (data.total_amount !== null && data.total_amount !== undefined) {
                setAmount(String(data.total_amount).replace(".", ","));
            }
            if (data.account_code) setPurposeCategory(data.account_code);
            if (data.document_type === "invoice") {
                setIsPaid(false);
                if (data.payee_name) setInvoicePayeeName(data.payee_name);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analýza selhala");
        } finally {
            setAnalyzing(false);
        }
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSaving(true); setError(null);
        try {
            const amountNum = parseFloat(amount.replace(",", "."));
            if (isNaN(amountNum) || amountNum <= 0) throw new Error("Oprav částku");
            if (!purposeText.trim()) throw new Error("Doplň účel dokladu");

            const response = await fetch(`/api/events/${eventId}/expenses`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    expenseId: expense.id,
                    amount: amountNum,
                    // Baseline pro kontrolu shody — jen když v dialogu proběhla čerstvá analýza
                    ...(analysis?.total_amount != null && { analyzedAmount: analysis.total_amount }),
                    purposeText: purposeText.trim(),
                    purposeCategory,
                    isPaid,
                    reimbursementPersonId: isPaid ? (reimbursementPersonId || null) : null,
                    invoicePayeeName: !isPaid ? (invoicePayeeName.trim() || null) : null,
                }),
            });
            const payload = await response.json() as { error?: string };
            if (!response.ok) throw new Error(payload.error ?? "Chyba uložení");
            await onSaved();
            onOpenChange(false);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Chyba uložení");
        } finally {
            setSaving(false);
        }
    }

    const blobProxyUrl = expense.fileUrl
        ? `/api/blob-file?url=${encodeURIComponent(expense.fileUrl)}`
        : null;

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Sparkles size={16} className="text-violet-500" />
                        {expense.status === "unconfirmed" ? "Potvrdit náklad" : "Zpracovat návrh"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Image preview */}
                    {blobProxyUrl && isImage(expense.fileMime) && (
                        <div className="flex gap-3 items-start">
                            <button onClick={() => setPreviewOpen(true)} title="Zobrazit doklad"
                                className="shrink-0 rounded-lg border border-gray-200 overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={blobProxyUrl} alt="doklad"
                                    className="w-28 h-36 object-cover" />
                            </button>
                            <div className="flex-1">
                                <p className="text-xs text-gray-500 mb-2">{expense.fileName}</p>
                                <Button type="button" size="sm" onClick={runGeminiAnalysis} disabled={analyzing}
                                    className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 w-full sm:w-auto">
                                    <Sparkles size={13} />
                                    {analyzing ? "Analyzuji…" : "Analyzovat Gemini"}
                                </Button>
                            </div>
                        </div>
                    )}
                    {blobProxyUrl && !isImage(expense.fileMime) && (
                        <div className="flex items-center gap-3">
                            <button onClick={() => setPreviewOpen(true)} title="Zobrazit doklad"
                                className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                                <FileText size={20} />
                            </button>
                            <div className="flex-1">
                                <button onClick={() => setPreviewOpen(true)}
                                    className="text-xs text-blue-600 hover:underline text-left">
                                    {expense.fileName}
                                </button>
                                <div className="mt-2">
                                    <Button type="button" size="sm" onClick={runGeminiAnalysis} disabled={analyzing}
                                        className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
                                        <Sparkles size={13} />
                                        {analyzing ? "Analyzuji…" : "Analyzovat Gemini"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {analysis && <AnalysisCard analysis={analysis} />}

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-500">Částka (Kč) *</label>
                                <input type="text" inputMode="decimal"
                                    value={amount} onChange={e => setAmount(e.target.value)}
                                    className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-500">Účetní kód *</label>
                                <select value={purposeCategory} onChange={e => setPurposeCategory(e.target.value as ExpenseCategory)}
                                    className="w-full h-9 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                    {CATEGORIES.map(c => (
                                        <option key={c} value={c}>{c} · {EXPENSE_CATEGORY_LABELS[c]}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-500">Účel / popis *</label>
                            <input type="text"
                                value={purposeText} onChange={e => setPurposeText(e.target.value)}
                                className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        </div>
                        <div className="flex rounded-lg border overflow-hidden text-sm">
                            <button type="button" onClick={() => setIsPaid(true)} disabled={saving}
                                className={`flex-1 px-3 py-2 transition-colors ${isPaid ? "bg-gray-800 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                                Účtenka (zaplacená)
                            </button>
                            <button type="button" onClick={() => setIsPaid(false)} disabled={saving}
                                className={`flex-1 px-3 py-2 border-l transition-colors ${!isPaid ? "bg-orange-600 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                                Faktura (k proplacení)
                            </button>
                        </div>
                        {isPaid && (
                            <PersonAutocomplete
                                people={people}
                                peopleLoaded={peopleLoaded}
                                value={reimbursementPersonId}
                                disabled={saving}
                                onChange={person => setReimbursementPersonId(person ? String(person.id) : "")}
                                onPersonCreated={onPersonCreated}
                            />
                        )}
                        {!isPaid && (
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-500">Příjemce faktury</label>
                                <input type="text" placeholder="Název firmy nebo osoby z faktury"
                                    value={invoicePayeeName}
                                    onChange={e => setInvoicePayeeName(e.target.value)}
                                    disabled={saving}
                                    className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                            </div>
                        )}
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                                Zrušit
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? "Ukládám…" : "Uložit náklad"}
                            </Button>
                        </div>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
        {blobProxyUrl && (
            <DocPreviewDialog
                url={blobProxyUrl}
                mime={expense.fileMime}
                fileName={expense.fileName}
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
            />
        )}
        </>
    );
}

// ── Non-member person edit dialog ─────────────────────────────────────────────

function PersonEditDialog({
    personId,
    initialFullName,
    initialBankAccountNumber,
    initialBankCode,
    open,
    onOpenChange,
    onSaved,
}: {
    personId: number;
    initialFullName: string;
    initialBankAccountNumber: string | null;
    initialBankCode: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void | Promise<void>;
}) {
    const [fullName, setFullName] = useState(initialFullName);
    const [bankAccountNumber, setBankAccountNumber] = useState(initialBankAccountNumber ?? "");
    const [bankCode, setBankCode] = useState(initialBankCode ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setFullName(initialFullName);
        setBankAccountNumber(initialBankAccountNumber ?? "");
        setBankCode(initialBankCode ?? "");
        setError(null);
    }, [open, initialFullName, initialBankAccountNumber, initialBankCode]);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!fullName.trim()) { setError("Jméno je povinné"); return; }
        setSaving(true); setError(null);
        try {
            const res = await fetch(`/api/people/${personId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fullName: fullName.trim(), bankAccountNumber: bankAccountNumber.trim() || null, bankCode: bankCode.trim() || null }),
            });
            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error ?? "Chyba uložení");
            await onSaved();
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chyba uložení");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Pencil size={16} className="text-gray-500" />
                        Upravit nečlena
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                        <label className="text-xs text-gray-500">Jméno *</label>
                        <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-500">Číslo účtu</label>
                            <input type="text" value={bankAccountNumber} onChange={e => setBankAccountNumber(e.target.value)}
                                placeholder="123456789"
                                className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-500">Kód banky</label>
                            <input type="text" value={bankCode} onChange={e => setBankCode(e.target.value)}
                                placeholder="0800"
                                className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Zrušit</Button>
                        <Button type="submit" disabled={saving}>{saving ? "Ukládám…" : "Uložit"}</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Expense row ───────────────────────────────────────────────────────────────

function ExpenseEditDialog({
    expense,
    eventId,
    open,
    people,
    peopleLoaded,
    onOpenChange,
    onPersonCreated,
    onSaved,
    readonlyAmount,
}: {
    expense: EventExpenseRow;
    eventId: number;
    open: boolean;
    people: PersonOption[];
    peopleLoaded: boolean;
    readonlyAmount?: boolean;
    onOpenChange: (open: boolean) => void;
    onPersonCreated: (person: PersonOption) => void;
    onSaved: () => void | Promise<void>;
}) {
    const [amount, setAmount] = useState((expense.amount ?? "").replace(".", ","));
    const [purposeText, setPurposeText] = useState(expense.purposeText ?? "");
    const [purposeCategory, setPurposeCategory] = useState<ExpenseCategory>(expense.purposeCategory ?? "501/004");
    const [reimbursementPersonId, setReimbursementPersonId] = useState(expense.reimbursementPersonId ? String(expense.reimbursementPersonId) : "");
    const [isPaid, setIsPaid] = useState(expense.isPaid);
    const [invoicePayeeName, setInvoicePayeeName] = useState(expense.invoicePayeeName ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setAmount((expense.amount ?? "").replace(".", ","));
        setPurposeText(expense.purposeText ?? "");
        setPurposeCategory(expense.purposeCategory ?? "501/004");
        setReimbursementPersonId(expense.reimbursementPersonId ? String(expense.reimbursementPersonId) : "");
        setIsPaid(expense.isPaid);
        setInvoicePayeeName(expense.invoicePayeeName ?? "");
        setError(null);
    }, [open, expense]);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError(null);

        try {
            if (!purposeText.trim()) throw new Error("Doplň účel dokladu");

            const body: Record<string, unknown> = {
                expenseId: expense.id,
                purposeText: purposeText.trim(),
                purposeCategory,
                isPaid,
                reimbursementPersonId: isPaid ? (reimbursementPersonId || null) : null,
                invoicePayeeName: !isPaid ? (invoicePayeeName.trim() || null) : null,
            };

            if (!readonlyAmount) {
                const amountNum = parseFloat(amount.replace(",", "."));
                if (isNaN(amountNum) || amountNum <= 0) throw new Error("Oprav částku");
                body.amount = amountNum;
            }

            const response = await fetch(`/api/events/${eventId}/expenses`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const payload = await response.json() as { error?: string };
            if (!response.ok) throw new Error(payload.error ?? "Chyba uložení");

            await onSaved();
            onOpenChange(false);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Chyba uložení");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Pencil size={16} className="text-gray-500" />
                        Upravit náklad
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {readonlyAmount && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                            Příjmový zámek je aktivní — částku nelze měnit. Lze upravit kategorii, popis a příjemce.
                        </p>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {!readonlyAmount && (
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-500">Částka (Kč) *</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={event => setAmount(event.target.value)}
                                    className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                            </div>
                        )}
                        <div className={`space-y-1.5 ${readonlyAmount ? "sm:col-span-2" : ""}`}>
                            <label className="text-xs text-gray-500">Účetní kód *</label>
                            <select
                                value={purposeCategory}
                                onChange={event => setPurposeCategory(event.target.value as ExpenseCategory)}
                                className="w-full h-9 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                {CATEGORIES.map(category => (
                                    <option key={category} value={category}>{category} · {EXPENSE_CATEGORY_LABELS[category]}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs text-gray-500">Účel / popis *</label>
                        <input
                            type="text"
                            value={purposeText}
                            onChange={event => setPurposeText(event.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>

                    <div className="flex rounded-lg border overflow-hidden text-sm">
                        <button type="button" onClick={() => setIsPaid(true)} disabled={saving}
                            className={`flex-1 px-3 py-2 transition-colors ${isPaid ? "bg-gray-800 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                            Účtenka (zaplacená)
                        </button>
                        <button type="button" onClick={() => setIsPaid(false)} disabled={saving}
                            className={`flex-1 px-3 py-2 border-l transition-colors ${!isPaid ? "bg-orange-600 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                            Faktura (k proplacení)
                        </button>
                    </div>

                    {isPaid && (
                        <PersonAutocomplete
                            people={people}
                            peopleLoaded={peopleLoaded}
                            value={reimbursementPersonId}
                            disabled={saving}
                            onChange={person => setReimbursementPersonId(person ? String(person.id) : "")}
                            onPersonCreated={onPersonCreated}
                        />
                    )}
                    {!isPaid && (
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-500">Příjemce faktury</label>
                            <input type="text" placeholder="Název firmy nebo osoby z faktury"
                                value={invoicePayeeName}
                                onChange={e => setInvoicePayeeName(e.target.value)}
                                disabled={saving}
                                className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                        </div>
                    )}

                    {expense.fileUrl && (
                        <p className="text-xs text-gray-400">
                            Příloha zůstane beze změny: {expense.fileName ?? "přiložený doklad"}
                        </p>
                    )}
                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                            Zrušit
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Ukládám…" : "Uložit změny"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ExpenseItem({
    expense,
    eventId,
    personOptions,
    peopleLoaded,
    onPersonCreated,
    onDeleted,
    onUpdated,
    lockedForParticipants,
    lockedForReimbursement,
    isTreasurer,
}: {
    expense: EventExpenseRow;
    eventId: number;
    personOptions: PersonOption[];
    peopleLoaded: boolean;
    onPersonCreated: (person: PersonOption) => void;
    onDeleted: () => void;
    onUpdated: () => void;
    lockedForParticipants?: boolean;
    lockedForReimbursement?: boolean;
    isTreasurer?: boolean;
}) {
    const [deleting, setDeleting] = useState(false);
    const [editing, setEditing] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [editingPerson, setEditingPerson] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [sendingInstr, setSendingInstr] = useState(false);
    const [instrSentAt, setInstrSentAt] = useState(expense.invoicePaymentSentAt);
    const [attachingFile, setAttachingFile] = useState(false);
    const [reanalyzing, setReanalyzing] = useState(false);
    const [instrError, setInstrError] = useState<string | null>(null);
    const [acknowledging, setAcknowledging] = useState(false);
    const [ackError, setAckError] = useState<string | null>(null);

    const isDraft = expense.status === "draft";
    const isUnconfirmed = expense.status === "unconfirmed";
    const needsAction = isDraft || isUnconfirmed;
    const rawMismatch = hasAmountMismatch(expense.amount, expense.analyzedAmount);
    const mismatchAcknowledged = rawMismatch && isMismatchAcknowledged(expense.amount, expense.analyzedAmount, {
        mismatchAcknowledgedAmount: expense.mismatchAcknowledgedAmount,
        mismatchAcknowledgedAnalyzedAmount: expense.mismatchAcknowledgedAnalyzedAmount,
    });
    const amountMismatch = rawMismatch && !mismatchAcknowledged;

    async function handleAcknowledgeMismatch() {
        setAcknowledging(true); setAckError(null);
        try {
            const res = await fetch(`/api/events/${eventId}/expenses/${expense.id}/acknowledge-mismatch`, { method: "POST" });
            const data = await res.json() as { success?: true; error?: string };
            if (!res.ok) throw new Error(data.error ?? "Potvrzení selhalo");
            onUpdated();
        } catch (err) {
            setAckError(err instanceof Error ? err.message : "Potvrzení selhalo");
        } finally {
            setAcknowledging(false);
        }
    }
    const isExternalPayee = expense.reimbursementPayeeKind === "external" && expense.reimbursementPersonId !== null;
    const blobProxyUrl = expense.fileUrl
        ? `/api/blob-file?url=${encodeURIComponent(expense.fileUrl)}`
        : null;

    async function handleSendInvoicePayment() {
        setSendingInstr(true);
        setInstrError(null);
        try {
            const res = await fetch(
                `/api/events/${eventId}/expenses/${expense.id}/send-invoice-payment`,
                { method: "POST" },
            );
            const data = await res.json() as { success?: true; error?: string };
            if (!res.ok) throw new Error(data.error ?? "Odeslání selhalo");
            setInstrSentAt(new Date());
        } catch (err) {
            setInstrError(err instanceof Error ? err.message : "Odeslání selhalo");
        } finally {
            setSendingInstr(false);
        }
    }

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

    const categoryLabel = expense.purposeCategory
        ? (EXPENSE_CATEGORY_LABELS[expense.purposeCategory] ?? expense.purposeCategory)
        : null;

    return (
        <div className={`flex items-start gap-3 py-3 border-b last:border-0 ${needsAction ? "opacity-80" : ""}`}>
            {/* Thumbnail for images, icon for others */}
            <div className="shrink-0">
                {blobProxyUrl && isImage(expense.fileMime) ? (
                    <button onClick={() => setPreviewOpen(true)} title="Zobrazit doklad"
                        className="block rounded border border-gray-200 overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={blobProxyUrl} alt="doklad"
                            className="w-12 h-14 object-cover" />
                    </button>
                ) : (
                    <div className="mt-0.5 text-gray-400">
                        {blobProxyUrl
                            ? (
                                <button onClick={() => setPreviewOpen(true)} title="Zobrazit doklad"
                                    className="text-red-400 hover:text-red-600 transition-colors">
                                    <FileText size={16} />
                                </button>
                            )
                            : (!expense.isPaid && !needsAction)
                                ? <CircleAlert size={16} className="text-amber-400" />
                                : <Paperclip size={16} />
                        }
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    {needsAction ? (
                        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-px border ${isUnconfirmed
                                ? "text-amber-700 bg-amber-100 border-amber-200"
                                : "text-gray-600 bg-gray-100 border-gray-200"
                            }`}>
                            {isUnconfirmed ? "Nepotvrzeno" : "Návrh"}
                        </span>
                    ) : null}
                    {expense.amount && (
                        <span className="text-sm font-medium text-gray-900 tabular-nums">
                            {fmtAmount(expense.amount)}
                        </span>
                    )}
                    {categoryLabel && (
                        <span className="text-[11px] text-gray-500 border border-gray-200 rounded px-1.5 py-px bg-gray-50 shrink-0">
                            {categoryLabel}
                        </span>
                    )}
                </div>
                {expense.purposeText && (
                    <p className="text-sm text-gray-700 mt-0.5">{expense.purposeText}</p>
                )}
                {amountMismatch ? (
                    <div className="mt-1 flex flex-col gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                        <div className="flex items-start gap-1.5">
                            <TriangleAlert size={13} className="shrink-0 mt-0.5" />
                            <span>
                                Zjištěná částka z dokladu (<span className="font-semibold tabular-nums">{fmtAmount(expense.analyzedAmount)}</span>)
                                neodpovídá zapsané (<span className="font-semibold tabular-nums">{fmtAmount(expense.amount)}</span>).
                            </span>
                        </div>
                        {isTreasurer && (
                            <div className="flex items-center gap-2 pl-[19px]">
                                <button
                                    onClick={handleAcknowledgeMismatch}
                                    disabled={acknowledging}
                                    className="text-[11px] font-medium text-red-700 hover:text-red-900 border border-red-300 rounded px-2 py-0.5 hover:bg-red-100 disabled:opacity-40 transition-colors"
                                >
                                    {acknowledging ? "Potvrzuji…" : "Označit jako v pořádku (jiná měna)"}
                                </button>
                                {ackError && <span className="text-[11px]">{ackError}</span>}
                            </div>
                        )}
                    </div>
                ) : mismatchAcknowledged ? (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500"
                        title={expense.mismatchAcknowledgedBy ? `Potvrdil ${expense.mismatchAcknowledgedBy}${expense.mismatchAcknowledgedAt ? ` · ${fmtDate(expense.mismatchAcknowledgedAt)}` : ""}` : undefined}>
                        <Check size={11} className="text-gray-400" />
                        <span>
                            Neshoda potvrzena jako v pořádku (zjištěno {fmtAmount(expense.analyzedAmount)}, jiná měna)
                        </span>
                    </div>
                ) : expense.analyzedAmount != null && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-green-600" title="Zjištěná částka z dokladu odpovídá zapsané">
                        <Check size={11} />
                        <span>Shoda s dokladem</span>
                    </div>
                )}
                {!needsAction && expense.isPaid && (
                    <div className={`flex items-center gap-1 flex-wrap text-xs mt-0.5 ${expense.reimbursementPayeeName ? "text-gray-500" : "text-amber-600"}`}>
                        <span>
                            Proplatit: {expense.reimbursementPayeeName ?? "zatím neurčeno"}
                            {expense.reimbursementPayeeKind === "external" && <span className="text-gray-400"> · nečlen</span>}
                            {expense.reimbursementPayeeName && (!expense.reimbursementPayeeBankAccountNumber || !expense.reimbursementPayeeBankCode) && (
                                <span className="text-amber-600"> · chybí účet</span>
                            )}
                        </span>
                        {isExternalPayee && (
                            <button onClick={() => setEditingPerson(true)}
                                className="text-gray-400 hover:text-gray-700 transition-colors"
                                title="Upravit nečlena">
                                <Pencil size={11} />
                            </button>
                        )}
                    </div>
                )}
                {!needsAction && !expense.isPaid && !expense.fileUrl && (
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-px border text-amber-700 bg-amber-50 border-amber-300">
                            Čeká na doklad
                        </span>
                        {expense.invoicePayeeName && (
                            <span className="text-xs text-gray-700">{expense.invoicePayeeName}</span>
                        )}
                    </div>
                )}
                {!needsAction && !expense.isPaid && expense.fileUrl && (
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-px border text-orange-700 bg-orange-50 border-orange-200">
                            Faktura k úhradě
                        </span>
                        {expense.invoicePayeeName && (
                            <span className="text-xs text-gray-700">{expense.invoicePayeeName}</span>
                        )}
                        {instrSentAt ? (
                            <span className="text-[10px] text-green-700 flex items-center gap-1">
                                <Check size={10} />
                                Pokyn odeslán {fmtDate(instrSentAt)}
                            </span>
                        ) : (
                            <button
                                onClick={handleSendInvoicePayment}
                                disabled={sendingInstr}
                                title="Odeslat pokyn k úhradě hospodáři TJ"
                                className="text-[11px] font-medium text-orange-700 hover:text-orange-900 border border-orange-200 rounded px-2 py-0.5 hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                            >
                                <Send size={10} />
                                {sendingInstr ? "Odesílám…" : "Odeslat pokyn"}
                            </button>
                        )}
                        {instrError && <span className="text-[11px] text-red-600">{instrError}</span>}
                    </div>
                )}
                {expense.fileUrl && !isImage(expense.fileMime) && (
                    <button onClick={() => setPreviewOpen(true)}
                        className="text-xs text-blue-600 hover:underline mt-0.5 block truncate text-left">
                        {expense.fileName ?? "Příloha"}
                    </button>
                )}
                {!needsAction && !lockedForReimbursement && (
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                        <button
                            onClick={() => setAttachingFile(true)}
                            className="text-[11px] font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-50 transition-colors flex items-center gap-1"
                        >
                            {expense.fileUrl ? <Replace size={10} /> : <Paperclip size={10} />}
                            {expense.fileUrl ? "Vyměnit doklad" : "Přiložit doklad"}
                        </button>
                        {expense.fileUrl && (
                            <button
                                onClick={() => setReanalyzing(true)}
                                title="Znovu přečíst částku z přílohy (Gemini)"
                                className="text-[11px] font-medium text-violet-600 hover:text-violet-900 border border-violet-200 rounded px-2 py-0.5 hover:bg-violet-50 transition-colors flex items-center gap-1"
                            >
                                <Sparkles size={10} />
                                Přeanalyzovat
                            </button>
                        )}
                    </div>
                )}
                <p className="text-xs text-gray-400 mt-1">{fmtDate(expense.createdAt)}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1 mt-0.5">
                {needsAction ? (
                    <button onClick={() => setProcessing(true)}
                        className="text-[11px] font-medium text-violet-600 hover:text-violet-800 border border-violet-200 rounded px-2 py-0.5 hover:bg-violet-50 transition-colors"
                        title={isUnconfirmed ? "Potvrdit náklad" : "Zpracovat návrh"}>
                        {isUnconfirmed ? "Potvrdit" : "Zpracovat"}
                    </button>
                ) : null}
                {!lockedForReimbursement && (
                    <button onClick={() => needsAction ? setProcessing(true) : setEditing(true)}
                        className="text-gray-300 hover:text-gray-600 transition-colors"
                        title="Upravit">
                        <Pencil size={15} />
                    </button>
                )}
                {!(lockedForParticipants || lockedForReimbursement) && (
                    <button onClick={handleDelete} disabled={deleting}
                        className="text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                        title="Smazat doklad">
                        <Trash2 size={15} />
                    </button>
                )}
            </div>

            <DraftProcessDialog
                expense={expense}
                eventId={eventId}
                open={processing}
                people={personOptions}
                peopleLoaded={peopleLoaded}
                onOpenChange={setProcessing}
                onPersonCreated={onPersonCreated}
                onSaved={onUpdated}
            />
            <ExpenseEditDialog
                expense={expense}
                eventId={eventId}
                open={editing}
                people={personOptions}
                peopleLoaded={peopleLoaded}
                onOpenChange={setEditing}
                onPersonCreated={onPersonCreated}
                onSaved={onUpdated}
                readonlyAmount={lockedForParticipants}
            />
            {isExternalPayee && (
                <PersonEditDialog
                    personId={expense.reimbursementPersonId!}
                    initialFullName={expense.reimbursementPayeeName ?? ""}
                    initialBankAccountNumber={expense.reimbursementPayeeBankAccountNumber}
                    initialBankCode={expense.reimbursementPayeeBankCode}
                    open={editingPerson}
                    onOpenChange={setEditingPerson}
                    onSaved={onUpdated}
                />
            )}
            {!needsAction && (
                <AttachFileDialog
                    expense={expense}
                    eventId={eventId}
                    open={attachingFile}
                    onOpenChange={setAttachingFile}
                    onUpdated={onUpdated}
                    lockedForParticipants={lockedForParticipants}
                    isTreasurer={isTreasurer}
                />
            )}
            {!needsAction && expense.fileUrl && (
                <ReanalyzeDialog
                    expense={expense}
                    eventId={eventId}
                    open={reanalyzing}
                    onOpenChange={setReanalyzing}
                    onUpdated={onUpdated}
                    isTreasurer={isTreasurer}
                />
            )}
            {blobProxyUrl && (
                <DocPreviewDialog
                    url={blobProxyUrl}
                    mime={expense.fileMime}
                    fileName={expense.fileName}
                    open={previewOpen}
                    onClose={() => setPreviewOpen(false)}
                />
            )}
        </div>
    );
}

// ── PoC: Gemini auto-crop ────────────────────────────────────────────────────

type AutoCropState =
    | { tag: "idle" }
    | { tag: "detecting"; previewUrl: string; file: File }
    | { tag: "cropping"; previewUrl: string; file: File; suggestedCrop?: Crop; geminiInfo?: GeminiCropInfo }
    | { tag: "done"; result: File; sizeKb: number };

function AutoCropPoc() {
    const [state, setState] = useState<AutoCropState>({ tag: "idle" });
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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
            const small = await resizeForGemini(f, 1024);
            const fd = new FormData();
            fd.append("file", small);
            const res = await fetch("/api/expenses/detect-crop", { method: "POST", body: fd });
            const data: {
                detected: boolean;
                x_pct: number | null; y_pct: number | null;
                width_pct: number | null; height_pct: number | null;
                confidence: number;
                fields_check?: GeminiCropInfo["fields_check"];
                error?: string;
            } = await res.json();

            if (!res.ok) throw new Error(data.error ?? "Chyba detekce");

            let suggested: Crop | undefined;
            if (data.detected && data.x_pct !== null && data.y_pct !== null && data.width_pct !== null && data.height_pct !== null) {
                const raw: Crop = {
                    unit: "%",
                    x: data.x_pct * 100,
                    y: data.y_pct * 100,
                    width: data.width_pct * 100,
                    height: data.height_pct * 100,
                };
                // Klientský safety margin: expand 3 % na každou stranu
                // Prompt Gemini už instruuje přidat 2-3 % sám, toto je pojistka
                suggested = expandCrop(raw, 3);
            }

            const geminiInfo: GeminiCropInfo | undefined = data.fields_check
                ? { confidence: data.confidence, fields_check: data.fields_check }
                : undefined;

            setState({ tag: "cropping", previewUrl, file: f, suggestedCrop: suggested, geminiInfo });
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
                geminiInfo={state.geminiInfo}
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

type GeminiRotation = {
    angle_degrees: number;
    text_direction: string;
    text_samples: string[];
    confidence: number;
};

type RotateState =
    | { tag: "idle" }
    | { tag: "detecting"; previewUrl: string; file: File }
    | { tag: "rotating"; previewUrl: string; file: File; gemini: GeminiRotation }
    | { tag: "done"; resultUrl: string; resultFile: File; gemini: GeminiRotation };

function AutoRotatePoc() {
    const [state, setState] = useState<RotateState>({ tag: "idle" });
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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
            // 1. Gemini detekuje rotaci — zmenšit před odesláním
            const small = await resizeForGemini(f, 1024);
            const fd = new FormData();
            fd.append("file", small);
            const res = await fetch("/api/expenses/detect-rotation", { method: "POST", body: fd });
            const data: {
                rotation_needed: boolean; angle_degrees: number; confidence: number;
                text_direction?: string; text_samples?: string[]; error?: string;
            } = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Chyba detekce");

            const angle = data.angle_degrees ?? 0;
            const gemini: GeminiRotation = {
                angle_degrees: angle,
                text_direction: data.text_direction ?? "unknown",
                text_samples: data.text_samples ?? [],
                confidence: data.confidence,
            };

            if (!data.rotation_needed || Math.abs(angle) < 1) {
                setState({ tag: "done", resultUrl: previewUrl, resultFile: f, gemini });
                return;
            }

            // 2. Canvas rotace
            setState({ tag: "rotating", previewUrl, file: f, gemini });
            const rotated = await rotateImage(previewUrl, angle, f.name);
            const rotatedUrl = URL.createObjectURL(rotated);
            URL.revokeObjectURL(previewUrl);
            setState({ tag: "done", resultUrl: rotatedUrl, resultFile: rotated, gemini });
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
                            ? "Gemini čte text a určuje orientaci…"
                            : `Otáčím o ${fmtAngle(state.gemini.angle_degrees)}…`}
                    </p>
                </div>
            )}

            {state.tag === "done" && (() => {
                const { gemini } = state;
                const pct = Math.round(gemini.confidence * 100);
                const dirLabels: Record<string, string> = {
                    correct: "✓ správně",
                    rotated_cw90: "otočeno 90° doprava",
                    rotated_ccw90: "otočeno 90° doleva",
                    upside_down: "vzhůru nohama (180°)",
                    slight_tilt: "mírně nakloněno",
                };
                return (
                    <div className="space-y-3">
                        {/* Gemini analýza */}
                        <div className="rounded-lg border border-amber-200 bg-white px-3 py-2.5 space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-amber-500 font-medium uppercase tracking-wide">Gemini detekce</span>
                                <div className="flex-1 h-1 rounded-full bg-gray-200 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${pct >= 80 ? "bg-green-500" : pct >= 55 ? "bg-amber-400" : "bg-red-400"}`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <span className="text-[10px] tabular-nums text-gray-500">{pct}%</span>
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                <span className="text-gray-500">
                                    Směr textu: <span className="font-medium text-gray-800">{dirLabels[gemini.text_direction] ?? gemini.text_direction}</span>
                                </span>
                                <span className="text-gray-500">
                                    Otočení: <span className={`font-medium ${gemini.angle_degrees === 0 ? "text-green-600" : "text-amber-700"}`}>
                                        {gemini.angle_degrees === 0 ? "žádné" : fmtAngle(gemini.angle_degrees)}
                                    </span>
                                </span>
                            </div>

                            {gemini.text_samples.length > 0 && (
                                <div>
                                    <p className="text-[10px] text-gray-400 mb-1">Nalezený text (ukázky):</p>
                                    <div className="flex flex-wrap gap-1">
                                        {gemini.text_samples.map((s, i) => (
                                            <span key={i} className="text-[11px] font-mono bg-gray-100 rounded px-1.5 py-px text-gray-700">
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Výsledný obrázek */}
                        <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 inline-block max-w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={state.resultUrl} alt="Výsledek rotace"
                                className="max-w-full max-h-64 object-contain" />
                        </div>
                        <p className="text-xs text-gray-400">{Math.round(state.resultFile.size / 1024)} kB</p>

                        <button onClick={reset} className="text-xs text-amber-600 hover:underline block">
                            Zkusit znovu
                        </button>
                    </div>
                );
            })()}
        </div>
    );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function EventExpensesTab({
    eventId,
    eventName,
    leaderName,
    leaderCskNumber,
    billingStatus,
    lockForReimbursement: initialLockForReimbursement,
    treasurerApproved: initialTreasurerApproved,
    isTreasurer,
}: {
    eventId: number;
    eventName: string;
    leaderName: string | null;
    leaderCskNumber: string | null;
    billingStatus: "draft" | "prescribed";
    lockForReimbursement: boolean;
    treasurerApproved: boolean;
    isTreasurer: boolean;
}) {
    const isPrescribed = billingStatus === "prescribed";
    const lockedForParticipants = isPrescribed;
    const [lockedForReimbursement, setLockedForReimbursement] = useState(initialLockForReimbursement);
    const [reimbursementLocking, setReimbursementLocking] = useState(false);
    const [expenses, setExpenses] = useState<EventExpenseRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [personOptions, setPersonOptions] = useState<PersonOption[]>([]);
    const [peopleLoaded, setPeopleLoaded] = useState(false);
    const [treasurerApproved, setTreasurerApproved] = useState(initialTreasurerApproved);
    const [approvalSaving, setApprovalSaving] = useState(false);
    const [activityLog, setActivityLog] = useState<VyuctovaniActivity[]>([]);

    const load = useCallback(async () => {
        // Bez setLoading(true) zde: při refetchi po uložení (onUpdated) by "loading" na chvíli
        // odmontovalo celý seznam ExpenseItem — a s ním i právě otevřený dialog (Přeanalyzovat/
        // Vyměnit), který by tak zmizel bez zobrazení výsledku. Spinner "Načítám doklady…" tedy
        // patří jen prvnímu načtení (loading začíná na true a už se zpátky nenastavuje).
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
    useEffect(() => {
        getPeopleForAutocomplete()
            .then(people => setPersonOptions(people))
            .finally(() => setPeopleLoaded(true));
    }, []);
    useEffect(() => {
        if (isPrescribed) getVyuctovaniActivityLog(eventId).then(setActivityLog);
    }, [eventId, isPrescribed]);

    async function handleTreasurerApproval(checked: boolean) {
        setApprovalSaving(true);
        const res = await setTreasurerApproval(eventId, checked);
        if (!("error" in res)) {
            setTreasurerApproved(checked);
            getVyuctovaniActivityLog(eventId).then(setActivityLog);
        }
        setApprovalSaving(false);
    }

    async function handleToggleReimbursementLock() {
        setReimbursementLocking(true);
        const res = lockedForReimbursement
            ? await unlockForReimbursement(eventId)
            : await lockForReimbursement(eventId);
        if (!("error" in res)) {
            setLockedForReimbursement(v => !v);
        }
        setReimbursementLocking(false);
    }

    function handlePersonCreated(person: PersonOption) {
        setPersonOptions(prev => [...prev, person].sort((a, b) => a.fullName.localeCompare(b.fullName, "cs")));
    }

    const total = expenses?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;

    const fmtDateTime = (d: Date) =>
        new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

    return (
        <div className="space-y-4">
            {isPrescribed && (
                <div className="rounded-xl border border-[#327600]/30 bg-[#327600]/5 px-4 py-4 space-y-4">
                    {/* Status řádek */}
                    <p className="text-sm text-[#327600] flex items-center gap-2">
                        <span>🔒</span>
                        <span>Příjmový zámek je aktivní — předpisy byly vygenerovány. Částky a rozdělení nelze měnit. Pro úpravy přejděte na záložku <strong>Vyúčtování</strong> a odemkněte.</span>
                    </p>

                    {/* Souhlas hospodáře */}
                    <label className={`flex items-center gap-3 cursor-${isTreasurer ? "pointer" : "default"}`}>
                        <div className="relative shrink-0">
                            <input
                                type="checkbox"
                                checked={treasurerApproved}
                                disabled={!isTreasurer || approvalSaving}
                                onChange={e => handleTreasurerApproval(e.target.checked)}
                                className="sr-only"
                            />
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                treasurerApproved
                                    ? "bg-[#327600] border-[#327600]"
                                    : "bg-white border-gray-300"
                            } ${!isTreasurer ? "opacity-60" : ""}`}>
                                {treasurerApproved && <Check size={12} strokeWidth={3} className="text-white" />}
                            </div>
                        </div>
                        <span className="text-sm text-gray-700">
                            Hospodář zkontroloval a souhlasí s vyúčtováním
                            {!isTreasurer && <span className="text-xs text-gray-400 ml-1">(pouze hospodář)</span>}
                        </span>
                        {approvalSaving && <span className="text-xs text-gray-400">Ukládám…</span>}
                    </label>

                    {/* Vyúčtování akce — tlačítka */}
                    <div className="border-t border-[#327600]/10 pt-3">
                        <EventExpenseActions
                            eventId={eventId}
                            expenses={expenses ?? []}
                            onSent={() => getVyuctovaniActivityLog(eventId).then(setActivityLog)}
                            treasurerApproved={treasurerApproved}
                        />
                    </div>

                    {/* Log odeslaných vyúčtování */}
                    {activityLog.length > 0 && (
                        <div className="border-t border-[#327600]/10 pt-3 space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Historie vyúčtování</p>
                            {activityLog.map(entry => (
                                <div key={`${entry.kind}-${entry.id}`} className="flex items-start gap-2 text-xs text-gray-500">
                                    {entry.kind === "approval" ? (
                                        <Check size={11} className={`mt-0.5 shrink-0 ${entry.action === "approved" ? "text-[#327600]" : "text-red-400"}`} />
                                    ) : (
                                        <Mail size={11} className="mt-0.5 shrink-0 text-gray-300" />
                                    )}
                                    <span>
                                        {entry.kind === "approval" ? (
                                            <>
                                                <span className={`font-medium ${entry.action === "approved" ? "text-[#327600]" : "text-red-600"}`}>
                                                    {entry.action === "approved" ? "Hospodář udělil souhlas" : "Hospodář odvolal souhlas"}
                                                </span>
                                                {" · "}{fmtDateTime(entry.at)}{" · "}{entry.changedBy}
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-gray-700 font-medium">Odesláno: {entry.recipients.join(", ") || "—"}</span>
                                                {" · "}{fmtDateTime(entry.at)}{" · "}{entry.sentBy}
                                                {entry.testTo && <span className="text-amber-600 ml-1">· TEST → {entry.testTo}</span>}
                                            </>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Výdajový zámek */}
            <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${
                lockedForReimbursement
                    ? "border-orange-300 bg-orange-50"
                    : "border-gray-200 bg-white"
            }`}>
                <div>
                    <p className="text-sm font-medium text-gray-800">
                        {lockedForReimbursement ? "🔒 Výdajový zámek aktivní" : "Výdajový zámek"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {lockedForReimbursement
                            ? "Nelze měnit kategorii, popis, příjemce ani přikládat soubory."
                            : "Po uzamčení nelze měnit kategorii, popis, příjemce ani přikládat soubory k fakturám."}
                    </p>
                </div>
                <button
                    onClick={handleToggleReimbursementLock}
                    disabled={reimbursementLocking}
                    className={`shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                        lockedForReimbursement
                            ? "border-orange-300 text-orange-700 bg-orange-100 hover:bg-orange-200"
                            : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                    }`}
                >
                    {reimbursementLocking ? "…" : lockedForReimbursement ? "Odemknout doklady" : "Uzamknout doklady"}
                </button>
            </div>

            {!(lockedForParticipants || lockedForReimbursement) && (
                <AddExpenseForm
                    eventId={eventId}
                    personOptions={personOptions}
                    peopleLoaded={peopleLoaded}
                    onPersonCreated={handlePersonCreated}
                    onAdded={load}
                />
            )}

            {loading && <p className="text-sm text-gray-400 py-4 text-center">Načítám doklady…</p>}
            {error && <p className="text-sm text-red-500 py-4">{error}</p>}

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
                                    personOptions={personOptions}
                                    peopleLoaded={peopleLoaded}
                                    onPersonCreated={handlePersonCreated}
                                    onDeleted={load}
                                    onUpdated={load}
                                    lockedForParticipants={lockedForParticipants}
                                    lockedForReimbursement={lockedForReimbursement}
                                    isTreasurer={isTreasurer}
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

            <EventExpenseDocForms
                eventId={eventId}
                eventName={eventName}
                leaderName={leaderName}
                leaderCskNumber={leaderCskNumber}
                personOptions={personOptions}
                peopleLoaded={peopleLoaded}
                onPersonCreated={handlePersonCreated}
                onExpenseCreated={load}
            />
        </div>
    );
}
