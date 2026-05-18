"use client";

import { useState, useEffect, useTransition, useCallback, useRef, KeyboardEvent, DragEvent, ClipboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bold, Italic, Link, ImageIcon, List, Heading2 } from "lucide-react";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
    createNote, saveNoteVersion, archiveNote, unarchiveNote,
    getNoteVersions,
} from "@/lib/actions/notes";
import type { NoteWithLatest, NoteVersionRow } from "@/lib/actions/notes";

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    note: NoteWithLatest | null;
    allCategories: string[];
    includeArchived: boolean;
    onSaved: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function fmtDate(d: Date | string) {
    return new Date(d).toLocaleString("cs-CZ", {
        day: "numeric", month: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

// ── Vstup pro kategorie ───────────────────────────────────────────────────────
function CategoryInput({
    value,
    onChange,
    suggestions,
    onPendingChange,
}: {
    value: string[];
    onChange: (v: string[]) => void;
    suggestions: string[];
    onPendingChange: (pending: string) => void;
}) {
    const [input, setInput] = useState("");
    const [open, setOpen] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const lc = input.trim().toLowerCase();
    const available = suggestions.filter(s => !value.includes(s));
    const filtered = lc
        ? available.filter(s => s.includes(lc)).slice(0, 10)
        : available.slice(0, 10);

    function addCategory(raw: string) {
        const cat = raw.trim().toLowerCase();
        if (cat && !value.includes(cat)) onChange([...value, cat]);
        setInput("");
        onPendingChange("");
        setOpen(false);
        setHighlightIdx(-1);
    }

    function handleKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIdx(i => Math.max(i - 1, -1));
        } else if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (highlightIdx >= 0 && filtered[highlightIdx]) {
                addCategory(filtered[highlightIdx]);
            } else if (input.trim()) {
                addCategory(input);
            }
        } else if (e.key === "Escape") {
            setOpen(false);
            setHighlightIdx(-1);
        } else if (e.key === "Backspace" && input === "" && value.length > 0) {
            onChange(value.slice(0, -1));
        }
    }

    function handleInputChange(raw: string) {
        setInput(raw);
        onPendingChange(raw);
        setHighlightIdx(-1);
        setOpen(true);
    }

    // Zavřít při kliknutí mimo
    useEffect(() => {
        function onMouseDown(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, []);

    return (
        <div ref={containerRef} className="relative">
            <div
                className="flex flex-wrap gap-1.5 items-center px-2 py-1.5 rounded-lg border border-gray-200 bg-white min-h-[36px] cursor-text"
                onClick={() => { inputRef.current?.focus(); setOpen(true); }}>
                {value.map(cat => (
                    <span key={cat}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#327600]/10 text-[#327600]">
                        {cat}
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onChange(value.filter(c => c !== cat)); }}
                            className="text-[#327600]/60 hover:text-[#327600] leading-none">
                            ×
                        </button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    value={input}
                    onChange={e => handleInputChange(e.target.value)}
                    onKeyDown={handleKey}
                    onFocus={() => setOpen(true)}
                    placeholder={value.length === 0 ? "Přidat kategorii… (Enter)" : ""}
                    className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-gray-300"
                />
            </div>

            {/* Dropdown návrhů */}
            {open && filtered.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[200] overflow-hidden">
                    {filtered.map((s, i) => (
                        <button
                            key={s}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); addCategory(s); }}
                            className={[
                                "w-full text-left px-3 py-2 text-sm transition-colors",
                                i === highlightIdx
                                    ? "bg-[#327600]/10 text-[#327600] font-medium"
                                    : "text-gray-700 hover:bg-gray-50",
                            ].join(" ")}>
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Hlavní sheet ──────────────────────────────────────────────────────────────
export function NoteSheet({ open, onOpenChange, note, allCategories, includeArchived, onSaved }: Props) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [categories, setCategories] = useState<string[]>([]);
    const [pendingCategory, setPendingCategory] = useState("");
    const [currentNoteId, setCurrentNoteId] = useState<number | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [saveError, setSaveError] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [versionsOpen, setVersionsOpen] = useState(false);
    const [versions, setVersions] = useState<NoteVersionRow[]>([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null);

    const [archiveConfirm, setArchiveConfirm] = useState(false);
    const [, startTransition] = useTransition();

    const isNew = currentNoteId === null;
    const isArchived = !!note?.archivedAt;

    useEffect(() => {
        if (!open) return;
        if (note) {
            setTitle(note.title);
            setContent(note.latestContent);
            setCategories(note.categories ?? []);
            setCurrentNoteId(note.id);
            setIsEditing(false);
        } else {
            setTitle("");
            setContent("");
            setCategories([]);
            setCurrentNoteId(null);
            setIsEditing(true);
        }
        setSaveStatus("idle");
        setSaveError("");
        setPendingCategory("");
        setVersionsOpen(false);
        setVersions([]);
        setExpandedVersionId(null);
        setArchiveConfirm(false);
    }, [open, note]);

    const loadVersions = useCallback(async (noteId: number) => {
        setVersionsLoading(true);
        const v = await getNoteVersions(noteId);
        setVersions(v);
        setVersionsLoading(false);
    }, []);

    function toggleVersions() {
        if (!currentNoteId) return;
        if (!versionsOpen) {
            setVersionsOpen(true);
            loadVersions(currentNoteId);
        } else {
            setVersionsOpen(false);
        }
    }

    function insertAtCursor(before: string, after = "", placeholder = "") {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const selected = content.slice(start, end) || placeholder;
        const newContent = content.slice(0, start) + before + selected + after + content.slice(end);
        setContent(newContent);
        // Obnoví fokus a umístí kurzor za vložený text
        requestAnimationFrame(() => {
            el.focus();
            const cursor = start + before.length + selected.length + after.length;
            el.setSelectionRange(cursor, cursor);
        });
    }

    async function uploadImage(file: File) {
        if (isUploading) return;
        const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
        if (!allowed.has(file.type)) {
            setSaveError("Nepodporovaný formát obrázku (povoleno: JPEG, PNG, WebP, GIF)");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setSaveError("Obrázek je příliš velký (max 5 MB)");
            return;
        }
        setIsUploading(true);
        setSaveError("");
        try {
            const fd = new FormData();
            fd.append("image", file);
            const res = await fetch("/api/notes/upload-image", { method: "POST", body: fd });
            const data = await res.json() as { url?: string; error?: string };
            if (!res.ok || !data.url) {
                setSaveError(data.error ?? "Chyba při uploadu obrázku");
                return;
            }
            const altText = file.name.replace(/\.[^.]+$/, "");
            insertAtCursor(`![${altText}](${data.url})`);
        } catch {
            setSaveError("Chyba při uploadu obrázku");
        } finally {
            setIsUploading(false);
        }
    }

    function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
        const items = Array.from(e.clipboardData.items);
        const imageItem = items.find(i => i.type.startsWith("image/"));
        if (!imageItem) return;
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (file) uploadImage(file);
    }

    function handleDragOver(e: DragEvent<HTMLDivElement>) {
        const hasFiles = Array.from(e.dataTransfer.types).includes("Files");
        if (!hasFiles) return;
        e.preventDefault();
        setIsDragOver(true);
    }

    function handleDragLeave(e: DragEvent<HTMLDivElement>) {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false);
        }
    }

    function handleDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsDragOver(false);
        const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
        if (file) uploadImage(file);
    }

    async function handleSave() {
        if (!title.trim()) { setSaveError("Název nesmí být prázdný"); return; }
        if (pendingCategory.trim()) {
            setSaveError(`Kategorie „${pendingCategory.trim()}" není potvrzená — stiskněte Enter, nebo ji smažte`);
            return;
        }
        setSaveStatus("saving");
        setSaveError("");

        let result;
        if (isNew) {
            result = await createNote(title.trim(), content, categories);
            if ("success" in result && result.id) setCurrentNoteId(result.id);
        } else {
            result = await saveNoteVersion(currentNoteId!, title.trim(), content, categories);
        }

        if ("error" in result) {
            setSaveStatus("error");
            setSaveError(result.error);
        } else {
            setSaveStatus("saved");
            onSaved();
            setIsEditing(false);
            setTimeout(() => setSaveStatus("idle"), 2000);
        }
    }

    function handleCancelEdit() {
        if (note) {
            setTitle(note.title);
            setContent(note.latestContent);
            setCategories(note.categories ?? []);
        }
        setSaveError("");
        setIsEditing(false);
    }

    async function handleArchive() {
        if (!currentNoteId) return;
        startTransition(async () => {
            const result = includeArchived
                ? await unarchiveNote(currentNoteId)
                : await archiveNote(currentNoteId);
            if ("success" in result) {
                onSaved();
                onOpenChange(false);
            }
        });
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-4xl flex flex-col gap-0 p-0" side="right">

                {/* ── Header ── */}
                <SheetHeader className="px-5 pt-5 pb-3 border-b shrink-0">
                    <SheetTitle className="sr-only">{isNew ? "Nová poznámka" : title}</SheetTitle>

                    {isEditing ? (
                        <div className="space-y-2">
                            {/* Název + tlačítka */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Název poznámky…"
                                    autoFocus
                                    className="flex-1 text-lg font-semibold text-gray-900 bg-transparent border-0 outline-none placeholder:text-gray-300 focus:ring-0"
                                />
                                <Button
                                    onClick={handleSave}
                                    disabled={saveStatus === "saving"}
                                    size="sm"
                                    className={[
                                        "min-w-[90px] shrink-0 transition-colors",
                                        saveStatus === "saved"
                                            ? "bg-green-600 hover:bg-green-700"
                                            : "bg-[#327600] hover:bg-[#2a6400]",
                                    ].join(" ")}>
                                    {saveStatus === "saving" ? "Ukládám…" : saveStatus === "saved" ? "Uloženo ✓" : "Uložit"}
                                </Button>
                                {!isNew && (
                                    <button
                                        onClick={handleCancelEdit}
                                        className="shrink-0 text-sm text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                                        Zrušit
                                    </button>
                                )}
                            </div>
                            {/* Kategorie — vstup */}
                            <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-400 mt-2 shrink-0">Kategorie:</span>
                                <div className="flex-1">
                                    <CategoryInput
                                        value={categories}
                                        onChange={setCategories}
                                        suggestions={allCategories}
                                        onPendingChange={setPendingCategory}
                                    />
                                </div>
                            </div>
                            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-3">
                                <h2 className="flex-1 text-lg font-semibold text-gray-900 leading-tight">{title}</h2>
                                {!isArchived && (
                                    <Button onClick={() => setIsEditing(true)} variant="outline" size="sm" className="shrink-0">
                                        Upravit
                                    </Button>
                                )}
                            </div>
                            {/* Kategorie — zobrazení */}
                            {categories.length > 0 && (
                                <div className="flex gap-1.5 flex-wrap">
                                    {categories.map(t => (
                                        <span key={t}
                                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#327600]/10 text-[#327600]">
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Meta info */}
                    {!isNew && (
                        <p className="text-xs text-gray-400 mt-0.5">
                            Upraveno {fmtDate(note?.updatedAt ?? new Date())} · {note?.createdByEmail}
                            {note && note.versionCount > 0 && (
                                <> · {note.versionCount} {note.versionCount === 1 ? "verze" : note.versionCount < 5 ? "verze" : "verzí"}</>
                            )}
                        </p>
                    )}
                </SheetHeader>

                {/* Skrytý input pro výběr souboru */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) uploadImage(file);
                        e.target.value = "";
                    }}
                />

                {/* ── Tělo ── */}
                {isEditing ? (
                    <div className="flex-1 flex overflow-hidden min-h-0" style={{ minHeight: 0 }}>
                        <div
                            className={["flex-1 flex flex-col border-r min-w-0 transition-colors", isDragOver ? "bg-[#327600]/5 border-[#327600]/40" : ""].join(" ")}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            {/* Toolbar */}
                            <div className="px-2 py-1 bg-gray-50 border-b flex items-center gap-0.5">
                                <span className="text-xs text-gray-400 font-medium tracking-wide uppercase mr-2 pl-1">Markdown</span>
                                <div className="w-px h-4 bg-gray-200 mx-1" />
                                {[
                                    { icon: <Heading2 size={14} />, title: "Nadpis (##)", action: () => insertAtCursor("## ", "", "Nadpis") },
                                    { icon: <Bold size={14} />, title: "Tučně (**)", action: () => insertAtCursor("**", "**", "tučně") },
                                    { icon: <Italic size={14} />, title: "Kurzíva (*)", action: () => insertAtCursor("*", "*", "kurzíva") },
                                    { icon: <Link size={14} />, title: "Odkaz", action: () => insertAtCursor("[", "](https://)", "text odkazu") },
                                    { icon: <List size={14} />, title: "Seznam", action: () => insertAtCursor("\n- ", "", "položka") },
                                ].map(({ icon, title, action }) => (
                                    <button
                                        key={title}
                                        type="button"
                                        title={title}
                                        onMouseDown={e => { e.preventDefault(); action(); }}
                                        className="p-1.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors"
                                    >
                                        {icon}
                                    </button>
                                ))}
                                <div className="w-px h-4 bg-gray-200 mx-1" />
                                <button
                                    type="button"
                                    title="Vložit obrázek"
                                    onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click(); }}
                                    disabled={isUploading}
                                    className="p-1.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors disabled:opacity-40"
                                >
                                    {isUploading ? (
                                        <span className="text-xs text-gray-400 px-1">Nahrávám…</span>
                                    ) : (
                                        <ImageIcon size={14} />
                                    )}
                                </button>
                                {isDragOver && (
                                    <span className="ml-2 text-xs text-[#327600] font-medium">Pusťte obrázek…</span>
                                )}
                            </div>
                            <textarea
                                ref={textareaRef}
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                onPaste={handlePaste}
                                placeholder={"Začněte psát v Markdown formátu…\n\n# Nadpis\n**tučně**, *kurzíva*, `kód`\n- seznam\n1. číslovaný seznam\n\nObrázek: přetáhněte nebo vložte ze schránky"}
                                className="flex-1 resize-none font-mono text-sm text-gray-800 p-4 outline-none bg-white placeholder:text-gray-300 leading-relaxed"
                                spellCheck={false}
                            />
                        </div>
                        <div className="flex-1 flex-col min-w-0 hidden md:flex">
                            <div className="px-3 py-1.5 bg-gray-50 border-b text-xs text-gray-400 font-medium tracking-wide uppercase">
                                Náhled
                            </div>
                            <div className="flex-1 overflow-y-auto p-5">
                                {content ? (
                                    <div className="md-content">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <p className="text-gray-300 text-sm italic">Náhled se zobrazí zde…</p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-6">
                        {content ? (
                            <div className="md-content max-w-2xl">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                            </div>
                        ) : (
                            <p className="text-gray-400 text-sm italic">Žádný obsah</p>
                        )}
                    </div>
                )}

                {/* ── Verze ── */}
                {currentNoteId !== null && (
                    <div className="border-t shrink-0">
                        <button
                            onClick={toggleVersions}
                            className="w-full flex items-center justify-between px-5 py-2.5 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors">
                            <span className="font-medium text-xs uppercase tracking-wide">Historie verzí</span>
                            <span className="text-gray-400 text-xs">{versionsOpen ? "▲ Skrýt" : "▼ Zobrazit"}</span>
                        </button>
                        {versionsOpen && (
                            <div className="border-t max-h-56 overflow-y-auto">
                                {versionsLoading ? (
                                    <div className="px-5 py-3 text-sm text-gray-400">Načítám…</div>
                                ) : versions.length === 0 ? (
                                    <div className="px-5 py-3 text-sm text-gray-400">Žádné verze</div>
                                ) : (
                                    <div className="divide-y">
                                        {versions.map((v, idx) => (
                                            <div key={v.id} className="px-5 py-2.5">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-semibold text-gray-500 w-6">v{versions.length - idx}</span>
                                                        <span className="text-xs text-gray-400">{fmtDate(v.createdAt)} · {v.createdByEmail}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setExpandedVersionId(expandedVersionId === v.id ? null : v.id)}
                                                        className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 shrink-0">
                                                        {expandedVersionId === v.id ? "Skrýt" : "Zobrazit"}
                                                    </button>
                                                </div>
                                                {expandedVersionId === v.id && (
                                                    <div className="mt-2 rounded-lg bg-gray-50 border p-3 md-content text-xs">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{v.content}</ReactMarkdown>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Patička — archivace ── */}
                {currentNoteId !== null && (
                    <div className="border-t px-5 py-3 flex items-center justify-end shrink-0 bg-gray-50">
                        {archiveConfirm ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">
                                    {isArchived ? "Opravdu obnovit?" : "Opravdu archivovat?"}
                                </span>
                                <button onClick={handleArchive}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50">
                                    Ano
                                </button>
                                <button onClick={() => setArchiveConfirm(false)}
                                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
                                    Ne
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setArchiveConfirm(true)}
                                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">
                                {isArchived ? "Obnovit z archivu" : "Archivovat"}
                            </button>
                        )}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
