"use client";

import { useState, useEffect, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    createBrigade, updateBrigade, deleteBrigade,
    addBrigadeMember, removeBrigadeMember,
} from "@/lib/actions/brigades";
import type { BrigadeRow, BrigadeMemberRow } from "@/lib/actions/brigades";
import type { MemberOption } from "./page";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    brigade: BrigadeRow | null;        // null = nová brigáda
    members: BrigadeMemberRow[];
    membersLoading: boolean;
    allMembers: MemberOption[];
    brigadeYear: number;
    onSaved: () => void;
}

function defaultDate(year: number) {
    return `${year}-06-01`;
}

export function BrigadeSheet({
    open, onOpenChange, brigade, members, membersLoading, allMembers, brigadeYear, onSaved,
}: Props) {
    const isNew = brigade === null;

    const [date, setDate]     = useState("");
    const [name, setName]     = useState("");
    const [leaderId, setLeaderId] = useState<number | "">("");
    const [note, setNote]     = useState("");

    const [memberSearch, setMemberSearch] = useState("");
    const [localMembers, setLocalMembers] = useState<BrigadeMemberRow[]>([]);

    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    // Sync form when opening
    useEffect(() => {
        if (!open) return;
        if (brigade) {
            setDate(brigade.date);
            setName(brigade.name ?? "");
            setLeaderId(brigade.leaderId ?? "");
            setNote(brigade.note ?? "");
        } else {
            setDate(defaultDate(brigadeYear));
            setName("");
            setLeaderId("");
            setNote("");
        }
        setMemberSearch("");
        setError(null);
    }, [open, brigade, brigadeYear]);

    // Sync members list when prop changes
    useEffect(() => {
        setLocalMembers(members);
    }, [members]);

    // When leader changes on new brigade, pre-fill them in participants
    useEffect(() => {
        if (!isNew || !open) return;
        if (leaderId === "") {
            setLocalMembers([]);
            return;
        }
        const leader = allMembers.find(m => m.id === leaderId);
        if (leader) {
            setLocalMembers([{
                brigadeId: 0,
                memberId: leader.id,
                firstName: leader.firstName,
                lastName: leader.lastName,
                note: null,
            }]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leaderId, isNew]);

    const memberIds = new Set(localMembers.map(m => m.memberId));

    const filteredSuggestions = allMembers.filter(m =>
        !memberIds.has(m.id) &&
        (memberSearch.trim() === "" ||
            `${m.firstName} ${m.lastName}`.toLowerCase().includes(memberSearch.toLowerCase()))
    ).slice(0, 8);

    function addLocalMember(m: MemberOption) {
        setLocalMembers(prev => [...prev, {
            brigadeId: brigade?.id ?? 0,
            memberId: m.id,
            firstName: m.firstName,
            lastName: m.lastName,
            note: null,
        }]);
        setMemberSearch("");
    }

    async function removeLocalMember(memberId: number) {
        if (brigade) {
            startTransition(async () => {
                await removeBrigadeMember(brigade.id, memberId);
                setLocalMembers(prev => prev.filter(m => m.memberId !== memberId));
                onSaved();
            });
        } else {
            setLocalMembers(prev => prev.filter(m => m.memberId !== memberId));
        }
    }

    async function handleAddMemberToExisting(m: MemberOption) {
        if (!brigade) { addLocalMember(m); return; }
        startTransition(async () => {
            await addBrigadeMember(brigade.id, m.id);
            setLocalMembers(prev => [...prev, {
                brigadeId: brigade.id,
                memberId: m.id,
                firstName: m.firstName,
                lastName: m.lastName,
                note: null,
            }]);
            setMemberSearch("");
            onSaved();
        });
    }

    function handleSave() {
        setError(null);
        if (!date) { setError("Datum je povinné"); return; }

        startTransition(async () => {
            try {
                if (isNew) {
                    await createBrigade({
                        date,
                        year: brigadeYear,
                        name: name.trim() || null,
                        leaderId: leaderId === "" ? null : Number(leaderId),
                        note: note.trim() || null,
                        initialMemberIds: localMembers.map(m => m.memberId),
                    });
                } else {
                    await updateBrigade(brigade.id, {
                        date,
                        year: brigadeYear,
                        name: name.trim() || null,
                        leaderId: leaderId === "" ? null : Number(leaderId),
                        note: note.trim() || null,
                    });
                }
                onSaved();
                onOpenChange(false);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Chyba při ukládání");
            }
        });
    }

    function handleDelete() {
        if (!brigade) return;
        if (!confirm(`Smazat brigádu${brigade.name ? ` „${brigade.name}"` : ""}? Tato akce je nevratná.`)) return;
        startTransition(async () => {
            await deleteBrigade(brigade.id);
            onSaved();
            onOpenChange(false);
        });
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl px-5 pb-8 overflow-y-auto">
                <SheetHeader className="px-0 pt-5 pb-4">
                    <SheetTitle>{isNew ? "Nová brigáda" : `Brigáda ${brigade?.date ? brigade.date.split("-").reverse().join(". ") : ""}`}</SheetTitle>
                </SheetHeader>

                <div className="space-y-5">
                    {/* ── Základní data ── */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="brigade-date">Datum *</Label>
                            <Input
                                id="brigade-date"
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="brigade-name">Název / popis</Label>
                            <Input
                                id="brigade-name"
                                placeholder="např. Úprava tábořiště"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="brigade-leader">Vedoucí</Label>
                        <select
                            id="brigade-leader"
                            value={leaderId}
                            onChange={e => setLeaderId(e.target.value === "" ? "" : Number(e.target.value))}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                            <option value="">— bez vedoucího —</option>
                            {allMembers.map(m => (
                                <option key={m.id} value={m.id}>{m.lastName} {m.firstName}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="brigade-note">Poznámka</Label>
                        <Textarea
                            id="brigade-note"
                            placeholder="Volitelná poznámka…"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={2}
                        />
                    </div>

                    {/* ── Účastníci ── */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Účastníci ({localMembers.length})</Label>
                        </div>

                        {membersLoading ? (
                            <p className="text-sm text-gray-400">Načítám…</p>
                        ) : (
                            <div className="rounded-lg border bg-gray-50 divide-y">
                                {localMembers.length === 0 && (
                                    <p className="text-sm text-gray-400 px-3 py-2 italic">Žádní účastníci</p>
                                )}
                                {localMembers.map(m => (
                                    <div key={m.memberId} className="flex items-center justify-between px-3 py-2">
                                        <span className="text-sm text-gray-800">
                                            {m.lastName} {m.firstName}
                                            {m.memberId === (leaderId === "" ? null : Number(leaderId)) && (
                                                <span className="ml-1.5 text-xs text-amber-600 font-medium">(vedoucí)</span>
                                            )}
                                        </span>
                                        <button
                                            onClick={() => removeLocalMember(m.memberId)}
                                            disabled={isPending}
                                            className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none px-1">
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Přidání člena */}
                        <div className="relative">
                            <Input
                                placeholder="Přidat účastníka — začni psát jméno…"
                                value={memberSearch}
                                onChange={e => setMemberSearch(e.target.value)}
                                className="text-sm"
                            />
                            {memberSearch.trim() !== "" && filteredSuggestions.length > 0 && (
                                <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-lg border shadow-md divide-y max-h-48 overflow-y-auto">
                                    {filteredSuggestions.map(m => (
                                        <button
                                            key={m.id}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                                            onMouseDown={e => { e.preventDefault(); handleAddMemberToExisting(m); }}>
                                            {m.lastName} {m.firstName}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {memberSearch.trim() !== "" && filteredSuggestions.length === 0 && (
                                <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-lg border shadow-sm px-3 py-2 text-sm text-gray-400">
                                    Žádný odpovídající člen
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Chyba ── */}
                    {error && (
                        <p className="text-sm text-red-500">{error}</p>
                    )}

                    {/* ── Akce ── */}
                    <div className="flex items-center gap-2 pt-2">
                        <Button
                            onClick={handleSave}
                            disabled={isPending}
                            className="bg-[#327600] hover:bg-[#2a6400]">
                            {isPending ? "Ukládám…" : isNew ? "Vytvořit brigádu" : "Uložit změny"}
                        </Button>
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Zrušit
                        </Button>
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
