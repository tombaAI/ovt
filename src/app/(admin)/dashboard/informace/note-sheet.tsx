"use client";

import { useState, useEffect, useTransition, useCallback, useRef, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
    allTags: string[];
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
}: {
    value: string[];
    onChange: (v: string[]) => void;
    suggestions: string[];
}) {
    const [input, setInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = "category-suggestions";

    function addCategory(raw: string) {
        const cat = raw.trim().toLowerCase();
        if (cat && !value.includes(cat)) {
            onChange([...value, cat]);
        }
        setInput("");
    }

    function handleKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addCategory(input);
        } else if (e.key === "Backspace" && input === "" && value.length > 0) {
            onChange(value.slice(0, -1));
        }
    }

    // Pokud uživatel vybral z datalist (onChange dostane celou hodnotu)
    function handleChange(raw: string) {
        if (suggestions.includes(raw.trim().toLowerCase())) {
            addCategory(raw);
        } else {
            setInput(raw);
        }
    }

    const remaining = suggestions.filter(s => !value.includes(s));

    return (
        <div
            className="flex flex-wrap gap-1.5 items-center px-2 py-1.5 rounded-lg border border-gray-200 bg-white min-h-[36px] cursor-text"
            onClick={() => inputRef.current?.focus()}>
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
                list={listId}
                value={input}
                onChange={e => handleChange(e.target.value)}
                onKeyDown={handleKey}
                placeholder={value.length === 0 ? "Přidat kategorii… (Enter)" : ""}
                className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-gray-300"
            />
            <datalist id={listId}>
                {remaining.map(s => <option key={s} value={s} />)}
            </datalist>
        </div>
    );
}

// ── Hlavní sheet ──────────────────────────────────────────────────────────────
export function NoteSheet({ open, onOpenChange, note, allTags, includeArchived, onSaved }: Props) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [currentNoteId, setCurrentNoteId] = useState<number | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [saveError, setSaveError] = useState("");

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
            setTags(note.tags ?? []);
            setCurrentNoteId(note.id);
            setIsEditing(false);
        } else {
            setTitle("");
            setContent("");
            setTags([]);
            setCurrentNoteId(null);
            setIsEditing(true);
        }
        setSaveStatus("idle");
        setSaveError("");
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

    async function handleSave() {
        if (!title.trim()) { setSaveError("Název nesmí být prázdný"); return; }
        setSaveStatus("saving");
        setSaveError("");

        let result;
        if (isNew) {
            result = await createNote(title.trim(), content, tags);
            if ("success" in result && result.id) setCurrentNoteId(result.id);
        } else {
            result = await saveNoteVersion(currentNoteId!, title.trim(), content, tags);
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
            setTags(note.tags ?? []);
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
            <SheetContent className="sm:max-w-4xl flex flex-col gap-0 p-0 overflow-hidden" side="right">

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
                                        value={tags}
                                        onChange={setTags}
                                        suggestions={allTags}
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
                            {tags.length > 0 && (
                                <div className="flex gap-1.5 flex-wrap">
                                    {tags.map(t => (
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

                {/* ── Tělo ── */}
                {isEditing ? (
                    <div className="flex-1 flex overflow-hidden min-h-0">
                        <div className="flex-1 flex flex-col border-r min-w-0">
                            <div className="px-3 py-1.5 bg-gray-50 border-b text-xs text-gray-400 font-medium tracking-wide uppercase">
                                Markdown
                            </div>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder={"Začněte psát v Markdown formátu…\n\n# Nadpis\n**tučně**, *kurzíva*, `kód`\n- seznam\n1. číslovaný seznam"}
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
