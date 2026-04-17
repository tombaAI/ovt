"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NoteSheet } from "./note-sheet";
import type { NoteWithLatest } from "@/lib/actions/notes";

interface Props {
    notes: NoteWithLatest[];
    allTags: string[];
    includeArchived: boolean;
}

function fmtDate(d: Date | string) {
    return new Date(d).toLocaleString("cs-CZ", {
        day: "numeric", month: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

export function InformaceClient({ notes, allTags, includeArchived }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [sheetOpen, setSheetOpen] = useState(false);
    const [editNote, setEditNote] = useState<NoteWithLatest | null>(null);
    const [activeTag, setActiveTag] = useState<string | null>(null);

    // Tagy přítomné v aktuálním výpisu (pro pill počty)
    const tagCounts = notes.reduce<Record<string, number>>((acc, n) => {
        for (const t of n.tags) acc[t] = (acc[t] ?? 0) + 1;
        return acc;
    }, {});

    // Tagy ke zobrazení = ty, co se vyskytují v aktuálním výpisu + allTags ze serveru (pro konzistenci)
    const visibleCategories = [...new Set([...allTags, ...Object.keys(tagCounts)])].sort();

    const filtered = activeTag
        ? notes.filter(n => n.tags.includes(activeTag))
        : notes;

    function toggleArchived() {
        setActiveTag(null);
        startTransition(() => {
            router.push(`/dashboard/informace${includeArchived ? "" : "?archived=1"}`);
        });
    }

    const openNew = useCallback(() => {
        setEditNote(null);
        setSheetOpen(true);
    }, []);

    const openDetail = useCallback((note: NoteWithLatest) => {
        setEditNote(note);
        setSheetOpen(true);
    }, []);

    const onSaved = useCallback(() => {
        router.refresh();
    }, [router]);

    return (
        <div className="space-y-4">
            {/* ── Heading ── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">
                        Informace {includeArchived ? "— archiv" : ""}
                    </h1>
                    <p className="text-gray-500 mt-0.5 text-sm">
                        {includeArchived
                            ? `${notes.length} archivovaných poznámek`
                            : `${filtered.length} z ${notes.length} ${notes.length === 1 ? "poznámky" : notes.length < 5 ? "poznámek" : "poznámek"}`
                        }
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 mt-1">
                    <button
                        onClick={toggleArchived}
                        className="text-sm text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors">
                        {includeArchived ? "← Aktivní" : "Archiv"}
                    </button>
                    {!includeArchived && (
                        <Button onClick={openNew} size="sm" className="bg-[#327600] hover:bg-[#2a6400]">
                            + Nová poznámka
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Tag filter pills ── */}
            {visibleCategories.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setActiveTag(null)}
                        className={[
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                            activeTag === null
                                ? "bg-[#26272b] text-white"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                        ].join(" ")}>
                        Vše
                        <span className={["text-xs font-semibold", activeTag === null ? "text-white/70" : "text-gray-400"].join(" ")}>
                            {notes.length}
                        </span>
                    </button>
                    {visibleCategories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveTag(activeTag === cat ? null : cat)}
                            className={[
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                                activeTag === cat
                                    ? "bg-[#26272b] text-white"
                                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
                            ].join(" ")}>
                            {cat}
                            {tagCounts[cat] !== undefined && (
                                <span className={["text-xs font-semibold", activeTag === cat ? "text-white/70" : "text-gray-400"].join(" ")}>
                                    {tagCounts[cat]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Note cards ── */}
            <div className={`space-y-3 transition-opacity duration-150 ${isPending ? "opacity-25 pointer-events-none" : ""}`}>
                {filtered.length === 0 && (
                    <div className="rounded-xl border bg-white p-10 text-center text-gray-400 text-sm">
                        {activeTag
                            ? `Žádné poznámky v kategorii "${activeTag}"`
                            : includeArchived ? "Žádné archivované poznámky" : "Zatím žádné poznámky — vytvořte první"}
                    </div>
                )}
                {filtered.map(note => (
                    <div
                        key={note.id}
                        onClick={() => openDetail(note)}
                        className="rounded-xl border bg-white p-5 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all">
                        <div className="flex items-start justify-between gap-3">
                            <h2 className="font-semibold text-gray-900 text-base leading-tight">
                                {note.title}
                            </h2>
                            <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                                {note.versionCount} {note.versionCount === 1 ? "verze" : note.versionCount < 5 ? "verze" : "verzí"}
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Upraveno {fmtDate(note.updatedAt)} · {note.createdByEmail}
                        </p>
                        {note.tags.length > 0 && (
                            <div className="flex gap-1.5 flex-wrap mt-2">
                                {note.tags.map(tag => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#327600]/10 text-[#327600]">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        {note.latestContent && (
                            <p className="text-sm text-gray-500 mt-2 line-clamp-2 leading-relaxed">
                                {note.latestContent.replace(/[#*`_\[\]]/g, "").slice(0, 200)}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            <NoteSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                note={editNote}
                allTags={allTags}
                includeArchived={includeArchived}
                onSaved={onSaved}
            />
        </div>
    );
}
