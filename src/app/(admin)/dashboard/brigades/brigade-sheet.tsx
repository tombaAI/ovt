"use client";

import { useState, useEffect, useRef, useTransition } from "react";
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
    brigade: BrigadeRow | null;
    members: BrigadeMemberRow[];
    membersLoading: boolean;
    allMembers: MemberOption[];
    brigadeYear: number;
    onSaved: () => void;
}

function memberLabel(m: MemberOption) {
    return m.nickname
        ? `${m.lastName} ${m.firstName} (${m.nickname})`
        : `${m.lastName} ${m.firstName}`;
}

function matchesMember(m: MemberOption, q: string) {
    const lq = q.toLowerCase();
    return (
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(lq) ||
        `${m.lastName} ${m.firstName}`.toLowerCase().includes(lq) ||
        (m.nickname?.toLowerCase().includes(lq) ?? false)
    );
}

export function BrigadeSheet({
    open, onOpenChange, brigade, members, membersLoading, allMembers, brigadeYear, onSaved,
}: Props) {
    const isNew = brigade === null;

    const [date, setDate]       = useState("");
    const [name, setName]       = useState("");
    const [leaderId, setLeaderId] = useState<number | null>(null);
    const [note, setNote]       = useState("");

    // Leader autocomplete
    const [leaderText, setLeaderText]           = useState("");
    const [leaderFocused, setLeaderFocused]     = useState(false);

    // Participants
    const [memberSearch, setMemberSearch]       = useState("");
    const [localMembers, setLocalMembers]       = useState<BrigadeMemberRow[]>([]);

    // Track which member was auto-added as leader (so we can swap on leader change)
    const autoAddedLeaderRef = useRef<number | null>(null);

    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    // ── Init on open ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        autoAddedLeaderRef.current = null;
        if (brigade) {
            setDate(brigade.date);
            setName(brigade.name ?? "");
            setLeaderId(brigade.leaderId);
            const leader = brigade.leaderId ? allMembers.find(m => m.id === brigade.leaderId) : null;
            setLeaderText(leader ? `${leader.lastName} ${leader.firstName}` : "");
            setNote(brigade.note ?? "");
        } else {
            setDate(`${brigadeYear}-06-01`);
            setName("");
            setLeaderId(null);
            setLeaderText("");
            setNote("");
        }
        setMemberSearch("");
        setError(null);
    }, [open, brigade, brigadeYear, allMembers]);

    // Sync participants from prop (when opening existing brigade)
    useEffect(() => {
        setLocalMembers(members);
    }, [members]);

    // ── Auto-add/swap leader in participants (new brigade only) ───────────────
    useEffect(() => {
        if (!isNew || !open) return;

        const prevAutoLeader = autoAddedLeaderRef.current;

        setLocalMembers(prev => {
            // Remove previously auto-added leader
            let next = prevAutoLeader !== null
                ? prev.filter(m => m.memberId !== prevAutoLeader)
                : prev;
            // Add new leader if not already present
            if (leaderId !== null && !next.some(m => m.memberId === leaderId)) {
                const leader = allMembers.find(m => m.id === leaderId);
                if (leader) {
                    next = [...next, {
                        brigadeId: 0,
                        memberId: leader.id,
                        firstName: leader.firstName,
                        lastName: leader.lastName,
                        note: null,
                    }];
                }
            }
            return next;
        });

        autoAddedLeaderRef.current = leaderId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leaderId]);

    // ── Leader autocomplete ───────────────────────────────────────────────────
    const leaderSuggestions = leaderFocused && leaderText.trim() !== ""
        ? allMembers.filter(m => matchesMember(m, leaderText)).slice(0, 6)
        : [];

    function selectLeader(m: MemberOption) {
        setLeaderId(m.id);
        setLeaderText(`${m.lastName} ${m.firstName}`);
        setLeaderFocused(false);
    }

    function onLeaderKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && leaderSuggestions.length > 0) {
            e.preventDefault();
            selectLeader(leaderSuggestions[0]);
        }
        if (e.key === "Escape") {
            // Reset to current leader name
            const leader = leaderId ? allMembers.find(m => m.id === leaderId) : null;
            setLeaderText(leader ? `${leader.lastName} ${leader.firstName}` : "");
            setLeaderFocused(false);
        }
    }

    function onLeaderBlur() {
        // Slight delay so click on suggestion fires first
        setTimeout(() => {
            const leader = leaderId ? allMembers.find(m => m.id === leaderId) : null;
            setLeaderText(leader ? `${leader.lastName} ${leader.firstName}` : "");
            setLeaderFocused(false);
        }, 150);
    }

    function clearLeader() {
        setLeaderId(null);
        setLeaderText("");
    }

    // ── Member search ─────────────────────────────────────────────────────────
    const memberIds = new Set(localMembers.map(m => m.memberId));

    const memberSuggestions = memberSearch.trim() !== ""
        ? allMembers
            .filter(m => !memberIds.has(m.id) && matchesMember(m, memberSearch))
            .slice(0, 8)
        : [];

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

    function removeLocalMember(memberId: number) {
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

    function handleAddMemberToExisting(m: MemberOption) {
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

    function onMemberSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && memberSuggestions.length > 0) {
            e.preventDefault();
            handleAddMemberToExisting(memberSuggestions[0]);
        }
    }

    // ── Save / Delete ─────────────────────────────────────────────────────────
    function handleSave() {
        setError(null);
        if (!date) { setError("Datum je povinné"); return; }

        // Rok brigády vždy z datumu, ne ze záložky
        const yearFromDate = parseInt(date.slice(0, 4), 10);

        startTransition(async () => {
            try {
                if (isNew) {
                    await createBrigade({
                        date,
                        year: yearFromDate,
                        name: name.trim() || null,
                        leaderId,
                        note: note.trim() || null,
                        initialMemberIds: localMembers.map(m => m.memberId),
                    });
                } else {
                    await updateBrigade(brigade.id, {
                        date,
                        year: yearFromDate,
                        name: name.trim() || null,
                        leaderId,
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

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl px-5 pb-8 overflow-y-auto">
                <SheetHeader className="px-0 pt-5 pb-4">
                    <SheetTitle>
                        {isNew
                            ? "Nová brigáda"
                            : `Brigáda ${brigade.date.split("-").reverse().join(". ")}`}
                    </SheetTitle>
                </SheetHeader>

                <div className="space-y-5">
                    {/* ── Datum + název ── */}
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

                    {/* ── Vedoucí autocomplete ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="brigade-leader">Vedoucí</Label>
                        <div className="relative">
                            <Input
                                id="brigade-leader"
                                placeholder="Začni psát příjmení nebo přezdívku…"
                                value={leaderText}
                                autoComplete="off"
                                onChange={e => {
                                    setLeaderText(e.target.value);
                                    if (e.target.value.trim() === "") setLeaderId(null);
                                }}
                                onFocus={() => setLeaderFocused(true)}
                                onBlur={onLeaderBlur}
                                onKeyDown={onLeaderKeyDown}
                            />
                            {leaderId !== null && (
                                <button
                                    type="button"
                                    onClick={clearLeader}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none px-1">
                                    ×
                                </button>
                            )}
                            {leaderSuggestions.length > 0 && (
                                <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-lg border shadow-md divide-y max-h-48 overflow-y-auto">
                                    {leaderSuggestions.map((m, i) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            className={[
                                                "w-full text-left px-3 py-2 text-sm transition-colors",
                                                i === 0 ? "bg-gray-50 font-medium" : "hover:bg-gray-50",
                                            ].join(" ")}
                                            onMouseDown={e => { e.preventDefault(); selectLeader(m); }}>
                                            {memberLabel(m)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-gray-400">Enter potvrdí první nabídku</p>
                    </div>

                    {/* ── Poznámka ── */}
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
                        <Label>Účastníci ({localMembers.length})</Label>

                        {membersLoading ? (
                            <p className="text-sm text-gray-400">Načítám…</p>
                        ) : (
                            <div className="rounded-lg border bg-gray-50 divide-y">
                                {localMembers.length === 0 && (
                                    <p className="text-sm text-gray-400 px-3 py-2 italic">Žádní účastníci</p>
                                )}
                                {[...localMembers]
                                    .sort((a, b) => a.lastName.localeCompare(b.lastName, "cs") || a.firstName.localeCompare(b.firstName, "cs"))
                                    .map(m => (
                                    <div key={m.memberId} className="flex items-center justify-between px-3 py-2">
                                        <span className="text-sm text-gray-800">
                                            {m.lastName} {m.firstName}
                                            {m.memberId === leaderId && (
                                                <span className="ml-1.5 text-xs text-amber-600 font-medium">(vedoucí)</span>
                                            )}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removeLocalMember(m.memberId)}
                                            disabled={isPending}
                                            className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none px-1">
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Přidání účastníka */}
                        <div className="relative">
                            <Input
                                placeholder="Přidat účastníka — příjmení, jméno nebo přezdívka…"
                                value={memberSearch}
                                onChange={e => setMemberSearch(e.target.value)}
                                onKeyDown={onMemberSearchKeyDown}
                                className="text-sm"
                            />
                            {memberSearch.trim() !== "" && memberSuggestions.length > 0 && (
                                <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-lg border shadow-md divide-y max-h-48 overflow-y-auto">
                                    {memberSuggestions.map((m, i) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            className={[
                                                "w-full text-left px-3 py-2 text-sm transition-colors",
                                                i === 0 ? "bg-gray-50 font-medium" : "hover:bg-gray-50",
                                            ].join(" ")}
                                            onMouseDown={e => { e.preventDefault(); handleAddMemberToExisting(m); }}>
                                            {memberLabel(m)}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {memberSearch.trim() !== "" && memberSuggestions.length === 0 && (
                                <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-lg border shadow-sm px-3 py-2 text-sm text-gray-400">
                                    Žádný odpovídající člen
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-gray-400">Enter přidá první nabídku</p>
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

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
