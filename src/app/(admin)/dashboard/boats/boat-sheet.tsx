"use client";

import { useState, useEffect, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createBoat, updateBoat, deleteBoat, setBoatTodo, setBoatReviewed } from "@/lib/actions/boats";
import type { BoatRow } from "@/lib/actions/boats";
import type { MemberOption } from "./page";
import { Checkbox } from "@/components/ui/checkbox";

// ── Todo section ─────────────────────────────────────────────────────────────
function TodoSection({ currentNote, onSave }: {
    currentNote: string | null;
    onSave: (note: string | null) => Promise<void>;
}) {
    const [text, setText]     = useState(currentNote ?? "");
    const [saving, setSaving] = useState(false);

    useEffect(() => { setText(currentNote ?? ""); }, [currentNote]);

    async function handleSave()    { setSaving(true); await onSave(text.trim() || null); setSaving(false); }
    async function handleResolve() { setSaving(true); await onSave(null);                setSaving(false); }

    return (
        <div className={["rounded-xl border px-4 py-3 space-y-2", currentNote ? "border-orange-200 bg-orange-50/40" : ""].join(" ")}>
            <p className="text-sm font-semibold text-gray-700">Úkol k řešení</p>
            <Textarea value={text} onChange={e => setText(e.target.value)}
                placeholder="Popište co je potřeba udělat…" rows={3} className="text-sm resize-none" />
            <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[#327600] hover:bg-[#2a6400]">
                    {saving ? "Ukládám…" : "Uložit"}
                </Button>
                {currentNote && (
                    <Button size="sm" variant="outline" onClick={handleResolve} disabled={saving}>
                        ✓ Vyřešeno
                    </Button>
                )}
            </div>
        </div>
    );
}

const GRID_OPTIONS = [
    { value: "",       label: "— neznámé —" },
    { value: "1",      label: "Mříž 1" },
    { value: "2",      label: "Mříž 2" },
    { value: "3",      label: "Mříž 3" },
    { value: "dlouhé", label: "Dlouhé" },
];

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    boat: BoatRow | null;   // null = nová loď
    allMembers: MemberOption[];
    onSaved: () => void;
}

export function BoatSheet({ open, onOpenChange, boat, allMembers, onSaved }: Props) {
    const isNew = boat === null;

    const [ownerId,     setOwnerId]     = useState<number | "">("");
    const [description, setDescription] = useState("");
    const [color,       setColor]       = useState("");
    const [grid,        setGrid]        = useState("");
    const [position,    setPosition]    = useState("");
    const [isPresent,     setIsPresent]     = useState(true);
    const [storedFrom,    setStoredFrom]    = useState("");
    const [storedTo,      setStoredTo]      = useState("");
    const [lastCheckedAt, setLastCheckedAt] = useState("");
    const [note,          setNote]          = useState("");
    const [todoNote,      setTodoNote]      = useState("");
    const [reviewed,      setReviewed]      = useState(false);

    const [isPending,        startTransition] = useTransition();
    const [reviewedPending,  startRevTrans]   = useTransition();
    const [error,            setError]        = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (boat) {
            setOwnerId(boat.ownerId ?? "");
            setDescription(boat.description ?? "");
            setColor(boat.color ?? "");
            setGrid(boat.grid ?? "");
            setPosition(boat.position != null ? String(boat.position) : "");
            setIsPresent(boat.isPresent);
            setStoredFrom(boat.storedFrom ?? "");
            setStoredTo(boat.storedTo ?? "");
            setLastCheckedAt(boat.lastCheckedAt ?? "");
            setNote(boat.note ?? "");
            setTodoNote(boat.todoNote ?? "");
            setReviewed(boat.reviewed);
        } else {
            setOwnerId("");
            setDescription("");
            setColor("");
            setGrid("");
            setPosition("");
            setIsPresent(true);
            setStoredFrom("");
            setStoredTo("");
            setLastCheckedAt("");
            setNote("");
            setTodoNote("");
            setReviewed(false);
        }
        setError(null);
    }, [open, boat]);

    const showPosition = grid !== "" && grid !== "dlouhé";

    function handleSave() {
        setError(null);
        startTransition(async () => {
            try {
                const data = {
                    ownerId:     ownerId === "" ? null : Number(ownerId),
                    description: description.trim() || null,
                    color:       color.trim() || null,
                    grid:        grid.trim() || null,
                    position:    showPosition && position.trim() ? Number(position) : null,
                    isPresent,
                    storedFrom:    storedFrom || null,
                    storedTo:      storedTo || null,
                    lastCheckedAt: lastCheckedAt || null,
                    note:          note.trim() || null,
                };
                if (isNew) {
                    await createBoat(data);
                } else {
                    await updateBoat(boat.id, { ...data, todoNote: todoNote.trim() || null, reviewed });
                }
                onSaved();
                onOpenChange(false);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Chyba při ukládání");
            }
        });
    }

    function handleDelete() {
        if (!boat) return;
        const label = boat.description ?? boat.ownerName ?? `#${boat.id}`;
        if (!confirm(`Smazat loď „${label}"? Tato akce je nevratná.`)) return;
        startTransition(async () => {
            await deleteBoat(boat.id);
            onSaved();
            onOpenChange(false);
        });
    }

    function handleArchive() {
        if (!boat) return;
        const today = new Date().toISOString().slice(0, 10);
        startTransition(async () => {
            await updateBoat(boat.id, {
                ownerId:       boat.ownerId,
                description:   boat.description,
                color:         boat.color,
                grid:          boat.grid,
                position:      boat.position,
                isPresent:     boat.isPresent,
                storedFrom:    boat.storedFrom,
                storedTo:      today,
                lastCheckedAt: boat.lastCheckedAt,
                note:          boat.note,
                todoNote:      boat.todoNote,
                reviewed:      boat.reviewed,
            });
            onSaved();
            onOpenChange(false);
        });
    }

    const title = isNew
        ? "Nová loď"
        : (boat.description ?? boat.ownerName ?? `Loď #${boat.id}`);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl px-5 pb-8 overflow-y-auto">
                <SheetHeader className="px-0 pt-5 pb-4">
                    <SheetTitle>{title}</SheetTitle>
                </SheetHeader>

                <div className="space-y-5">
                    {/* ── Majitel ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="boat-owner">Majitel</Label>
                        <select
                            id="boat-owner"
                            value={ownerId}
                            onChange={e => setOwnerId(e.target.value === "" ? "" : Number(e.target.value))}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                            <option value="">— bez majitele —</option>
                            {allMembers.map(m => (
                                <option key={m.id} value={m.id}>{m.lastName} {m.firstName}</option>
                            ))}
                        </select>
                    </div>

                    {/* ── Popis + barva ── */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="boat-desc">Popis</Label>
                            <Input
                                id="boat-desc"
                                placeholder="např. Dagger GTX 8.1"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="boat-color">Barva</Label>
                            <Input
                                id="boat-color"
                                placeholder="např. žluto-červená"
                                value={color}
                                onChange={e => setColor(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* ── Umístění ── */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="boat-grid">Mříž</Label>
                            <select
                                id="boat-grid"
                                value={grid}
                                onChange={e => { setGrid(e.target.value); setPosition(""); }}
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                {GRID_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        {showPosition && (
                            <div className="space-y-1.5">
                                <Label htmlFor="boat-pos">Pozice</Label>
                                <Input
                                    id="boat-pos"
                                    type="number"
                                    min={1}
                                    max={99}
                                    placeholder="např. 15"
                                    value={position}
                                    onChange={e => setPosition(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    {/* ── Je přítomna ── */}
                    <div className="flex items-center gap-3">
                        <input
                            id="boat-present"
                            type="checkbox"
                            checked={isPresent}
                            onChange={e => setIsPresent(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 accent-[#327600]"
                        />
                        <Label htmlFor="boat-present" className="cursor-pointer font-normal">
                            Loď je fyzicky přítomna na místě
                        </Label>
                    </div>

                    {/* ── Datum od/do + poslední kontrola ── */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="boat-from">Uložena od</Label>
                            <Input
                                id="boat-from"
                                type="date"
                                value={storedFrom}
                                onChange={e => setStoredFrom(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="boat-checked">Poslední kontrola</Label>
                            <Input
                                id="boat-checked"
                                type="date"
                                value={lastCheckedAt}
                                onChange={e => setLastCheckedAt(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="boat-to">Archivována</Label>
                            <Input
                                id="boat-to"
                                type="date"
                                value={storedTo}
                                onChange={e => setStoredTo(e.target.value)}
                            />
                            <p className="text-xs text-gray-400">Vyplň pro archivaci</p>
                        </div>
                    </div>

                    {/* ── Poznámka ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="boat-note">Poznámka</Label>
                        <Textarea
                            id="boat-note"
                            placeholder="Volitelná poznámka…"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={2}
                        />
                    </div>

                    {/* ── Úkol k řešení (pouze u existující lodě) ── */}
                    {!isNew && (
                        <TodoSection
                            currentNote={boat?.todoNote ?? null}
                            onSave={async (note) => {
                                const r = await setBoatTodo(boat!.id, note);
                                if ("success" in r) onSaved();
                            }}
                        />
                    )}

                    {/* ── Provedena revize ── */}
                    {!isNew && (
                        <div className="flex items-center gap-2 rounded-xl border px-4 py-3">
                            <Checkbox
                                id="boat-reviewed"
                                checked={reviewed}
                                disabled={reviewedPending}
                                onCheckedChange={v => {
                                    setReviewed(Boolean(v));
                                    startRevTrans(async () => {
                                        await setBoatReviewed(boat!.id, Boolean(v));
                                        onSaved();
                                    });
                                }}
                            />
                            <Label htmlFor="boat-reviewed" className="cursor-pointer text-sm font-medium">
                                Provedena revize
                            </Label>
                        </div>
                    )}

                    {/* ── Chyba ── */}
                    {error && (
                        <p className="text-sm text-red-500">{error}</p>
                    )}

                    {/* ── Akce ── */}
                    <div className="flex items-center gap-2 pt-2 flex-wrap">
                        <Button
                            onClick={handleSave}
                            disabled={isPending}
                            className="bg-[#327600] hover:bg-[#2a6400]">
                            {isPending ? "Ukládám…" : isNew ? "Přidat loď" : "Uložit změny"}
                        </Button>
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Zrušit
                        </Button>
                        {!isNew && !boat.storedTo && (
                            <Button
                                variant="ghost"
                                onClick={handleArchive}
                                disabled={isPending}
                                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100">
                                Archivovat
                            </Button>
                        )}
                        {!isNew && (
                            <Button
                                variant="ghost"
                                onClick={handleDelete}
                                disabled={isPending}
                                className="ml-auto text-red-500 hover:text-red-700 hover:bg-red-50">
                                Smazat
                            </Button>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
