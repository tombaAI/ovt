"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
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

export function NoteSheet({ open, onOpenChange, note, includeArchived, onSaved }: Props) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [saveError, setSaveError] = useState("");
    const [currentNoteId, setCurrentNoteId] = useState<number | null>(null);

    // Verze
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [versions, setVersions] = useState<NoteVersionRow[]>([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null);

    // Archivace
    const [archiveConfirm, setArchiveConfirm] = useState(false);
    const [, startTransition] = useTransition();

    // Načti data při otevření / změně poznámky
    useEffect(() => {
        if (!open) return;
        if (note) {
            setTitle(note.title);
            setContent(note.latestContent);
            setCurrentNoteId(note.id);
        } else {
            setTitle("");
            setContent("");
            setCurrentNoteId(null);
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
        if (currentNoteId === null) {
            result = await createNote(title.trim(), content);
            if ("success" in result && result.id) {
                setCurrentNoteId(result.id);
            }
        } else {
            result = await saveNoteVersion(currentNoteId, title.trim(), content);
        }

        if ("error" in result) {
            setSaveStatus("error");
            setSaveError(result.error);
        } else {
            setSaveStatus("saved");
            onSaved();
            // Refresh verzí pokud jsou otevřené
            if (versionsOpen && currentNoteId) {
                loadVersions(currentNoteId ?? (result as { success: true; id?: number }).id ?? 0);
            }
            setTimeout(() => setSaveStatus("idle"), 2000);
        }
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

    const isNew = currentNoteId === null;
    const isArchived = !!note?.archivedAt;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                className="sm:max-w-5xl flex flex-col gap-0 p-0 overflow-hidden"
                side="right">

                {/* ── Header ── */}
                <SheetHeader className="px-5 pt-5 pb-3 border-b shrink-0">
                    <div className="flex items-center gap-3">
                        <SheetTitle className="sr-only">
                            {isNew ? "Nová poznámka" : title}
                        </SheetTitle>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Název poznámky..."
                            className="flex-1 text-lg font-semibold text-gray-900 bg-transparent border-0 outline-none placeholder:text-gray-300 focus:ring-0"
                            readOnly={isArchived}
                        />
                        <div className="flex items-center gap-2 shrink-0">
                            {!isArchived && (
                                <Button
                                    onClick={handleSave}
                                    disabled={saveStatus === "saving"}
                                    size="sm"
                                    className={[
                                        "min-w-[90px] transition-colors",
                                        saveStatus === "saved"
                                            ? "bg-green-600 hover:bg-green-700"
                                            : "bg-[#327600] hover:bg-[#2a6400]",
                                    ].join(" ")}>
                                    {saveStatus === "saving" ? "Ukládám…" : saveStatus === "saved" ? "Uloženo ✓" : "Uložit"}
                                </Button>
                            )}
                            {currentNoteId !== null && (
                                archiveConfirm ? (
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-gray-500">Opravdu?</span>
                                        <button
                                            onClick={handleArchive}
                                            className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50">
                                            Ano
                                        </button>
                                        <button
                                            onClick={() => setArchiveConfirm(false)}
                                            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
                                            Ne
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setArchiveConfirm(true)}
                                        className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors">
                                        {isArchived ? "Obnovit" : "Archivovat"}
                                    </button>
                                )
                            )}
                        </div>
                    </div>
                    {saveError && (
                        <p className="text-xs text-red-600 mt-1">{saveError}</p>
                    )}
                </SheetHeader>

                {/* ── Split-view editor ── */}
                <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Levá strana — zdrojový MD */}
                    <div className="flex-1 flex flex-col border-r min-w-0">
                        <div className="px-3 py-1.5 bg-gray-50 border-b text-xs text-gray-400 font-medium tracking-wide uppercase">
                            Markdown
                        </div>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            readOnly={isArchived}
                            placeholder="Začněte psát v Markdown formátu…&#10;&#10;# Nadpis&#10;**tučně**, *kurzíva*, `kód`&#10;- seznam&#10;1. číslovaný seznam"
                            className="flex-1 resize-none font-mono text-sm text-gray-800 p-4 outline-none bg-white placeholder:text-gray-300 leading-relaxed"
                            spellCheck={false}
                        />
                    </div>

                    {/* Pravá strana — náhled */}
                    <div className="flex-1 flex flex-col min-w-0 hidden md:flex">
                        <div className="px-3 py-1.5 bg-gray-50 border-b text-xs text-gray-400 font-medium tracking-wide uppercase">
                            Náhled
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {content ? (
                                <div className="prose prose-sm prose-gray max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {content}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                <p className="text-gray-300 text-sm italic">Náhled se zobrazí zde…</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Verze (collapsible) ── */}
                {currentNoteId !== null && (
                    <div className="border-t shrink-0">
                        <button
                            onClick={toggleVersions}
                            className="w-full flex items-center justify-between px-5 py-3 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors">
                            <span className="font-medium">Historie verzí</span>
                            <span className="text-gray-400 text-xs">
                                {versionsOpen ? "▲ Skrýt" : "▼ Zobrazit"}
                            </span>
                        </button>

                        {versionsOpen && (
                            <div className="border-t max-h-64 overflow-y-auto">
                                {versionsLoading ? (
                                    <div className="px-5 py-4 text-sm text-gray-400">Načítám…</div>
                                ) : versions.length === 0 ? (
                                    <div className="px-5 py-4 text-sm text-gray-400">Žádné verze</div>
                                ) : (
                                    <div className="divide-y">
                                        {versions.map((v, idx) => (
                                            <div key={v.id} className="px-5 py-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-medium text-gray-500">
                                                            v{versions.length - idx}
                                                        </span>
                                                        <span className="text-xs text-gray-400">
                                                            {fmtDate(v.createdAt)} · {v.createdByEmail}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => setExpandedVersionId(
                                                            expandedVersionId === v.id ? null : v.id
                                                        )}
                                                        className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors">
                                                        {expandedVersionId === v.id ? "Skrýt" : "Zobrazit"}
                                                    </button>
                                                </div>
                                                {expandedVersionId === v.id && (
                                                    <div className="mt-2 rounded-lg bg-gray-50 border p-3 prose prose-sm prose-gray max-w-none">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                            {v.content}
                                                        </ReactMarkdown>
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
            </SheetContent>
        </Sheet>
    );
}
