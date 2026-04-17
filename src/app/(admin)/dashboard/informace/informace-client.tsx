"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NoteSheet } from "./note-sheet";
import type { NoteWithLatest } from "@/lib/actions/notes";

interface Props {
    notes: NoteWithLatest[];
    includeArchived: boolean;
}

function fmtDate(d: Date | string) {
    return new Date(d).toLocaleString("cs-CZ", {
        day: "numeric", month: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

export function InformaceClient({ notes, includeArchived }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [sheetOpen, setSheetOpen] = useState(false);
    const [editNote, setEditNote] = useState<NoteWithLatest | null>(null);

    function toggleArchived() {
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
                            : `${notes.length} ${notes.length === 1 ? "poznámka" : notes.length < 5 ? "poznámky" : "poznámek"}`
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
                        <Button
                            onClick={openNew}
                            size="sm"
                            className="bg-[#327600] hover:bg-[#2a6400]">
                            + Nová poznámka
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Note cards ── */}
            <div className={`space-y-3 transition-opacity duration-150 ${isPending ? "opacity-25 pointer-events-none" : ""}`}>
                {notes.length === 0 && (
                    <div className="rounded-xl border bg-white p-10 text-center text-gray-400 text-sm">
                        {includeArchived ? "Žádné archivované poznámky" : "Zatím žádné poznámky — vytvořte první"}
                    </div>
                )}
                {notes.map(note => (
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
                includeArchived={includeArchived}
                onSaved={onSaved}
            />
        </div>
    );
}
