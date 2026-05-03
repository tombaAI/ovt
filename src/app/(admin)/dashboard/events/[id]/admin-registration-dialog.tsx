"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, UserCheck } from "lucide-react";
import {
    addAdminEventRegistration,
    linkParticipantToMember,
    getMembersForSettlement,
} from "@/lib/actions/event-settlement";
import type { SettlementParticipant } from "@/lib/actions/event-settlement";

// ── Přidání přihlášky ─────────────────────────────────────────────────────────

type ParticipantDraft = {
    fullName: string;
    isPrimary: boolean;
    memberId: number | null;
    memberName: string | null;
};

interface AddRegistrationDialogProps {
    eventId: number;
    open: boolean;
    onClose: () => void;
    onAdded: () => void;
}

export function AddRegistrationDialog({ eventId, open, onClose, onAdded }: AddRegistrationDialogProps) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [participants, setParticipants] = useState<ParticipantDraft[]>([
        { fullName: "", isPrimary: true, memberId: null, memberName: null },
    ]);
    const [members, setMembers] = useState<{ id: number; fullName: string }[] | null>(null);
    const [memberSearch, setMemberSearch] = useState<Record<number, string>>({});
    const [memberPickerOpen, setMemberPickerOpen] = useState<number | null>(null);
    const [saving, startSave] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function ensureMembers() {
        if (!members) getMembersForSettlement().then(setMembers);
    }

    function addParticipant() {
        setParticipants(prev => [...prev, { fullName: "", isPrimary: false, memberId: null, memberName: null }]);
    }

    function removeParticipant(i: number) {
        setParticipants(prev => {
            const next = prev.filter((_, idx) => idx !== i);
            if (next.length > 0 && !next.some(p => p.isPrimary)) next[0].isPrimary = true;
            return next;
        });
    }

    function updateParticipant(i: number, patch: Partial<ParticipantDraft>) {
        setParticipants(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
    }

    function selectMember(participantIdx: number, member: { id: number; fullName: string } | null) {
        if (member) {
            updateParticipant(participantIdx, {
                memberId: member.id,
                memberName: member.fullName,
                fullName: participants[participantIdx].fullName || member.fullName,
            });
        } else {
            updateParticipant(participantIdx, { memberId: null, memberName: null });
        }
        setMemberPickerOpen(null);
        setMemberSearch(prev => ({ ...prev, [participantIdx]: "" }));
    }

    function handleSubmit() {
        if (!firstName.trim() || !lastName.trim() || !email.trim()) {
            setError("Vyplňte jméno, příjmení a e-mail kontaktní osoby");
            return;
        }
        if (participants.some(p => !p.fullName.trim())) {
            setError("Vyplňte jméno všech účastníků");
            return;
        }
        setError(null);
        startSave(async () => {
            const res = await addAdminEventRegistration(eventId, {
                email: email.trim(),
                phone: phone.trim() || undefined,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                participants: participants.map(p => ({
                    fullName: p.fullName.trim(),
                    isPrimary: p.isPrimary,
                    memberId: p.memberId,
                })),
            });
            if ("error" in res) { setError(res.error); }
            else {
                // Reset
                setFirstName(""); setLastName(""); setEmail(""); setPhone("");
                setParticipants([{ fullName: "", isPrimary: true, memberId: null, memberName: null }]);
                onAdded();
                onClose();
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Přidat přihlášku</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                    {/* Kontaktní osoba */}
                    <div>
                        <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Kontaktní osoba</p>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs text-gray-600">Jméno</Label>
                                <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1 h-8 text-sm" placeholder="Jana" />
                            </div>
                            <div>
                                <Label className="text-xs text-gray-600">Příjmení</Label>
                                <Input value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1 h-8 text-sm" placeholder="Nováková" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <Label className="text-xs text-gray-600">E-mail *</Label>
                                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 h-8 text-sm" placeholder="jana@example.cz" />
                            </div>
                            <div>
                                <Label className="text-xs text-gray-600">Telefon</Label>
                                <Input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1 h-8 text-sm" placeholder="+420…" />
                            </div>
                        </div>
                    </div>

                    {/* Účastníci */}
                    <div>
                        <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Účastníci</p>
                        <div className="space-y-2">
                            {participants.map((p, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={p.fullName}
                                                onChange={e => updateParticipant(i, { fullName: e.target.value })}
                                                className="h-8 text-sm"
                                                placeholder={`Účastník ${i + 1}`}
                                            />
                                            {participants.length > 1 && (
                                                <button onClick={() => removeParticipant(i)}
                                                    className="shrink-0 text-gray-400 hover:text-red-500 transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                        {/* Párování s členem */}
                                        <div className="relative">
                                            {p.memberId ? (
                                                <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                                                    <UserCheck size={11} />
                                                    <span>{p.memberName}</span>
                                                    <button onClick={() => selectMember(i, null)} className="ml-auto text-gray-400 hover:text-gray-600">×</button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => { ensureMembers(); setMemberPickerOpen(memberPickerOpen === i ? null : i); setMemberSearch(prev => ({ ...prev, [i]: "" })); }}
                                                    className="text-xs text-gray-400 hover:text-emerald-600 transition-colors flex items-center gap-1">
                                                    <UserCheck size={11} /> Spárovat s členem OVT
                                                </button>
                                            )}
                                            {memberPickerOpen === i && (
                                                <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-64 max-h-52 overflow-y-auto">
                                                    <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                                                        <Input
                                                            value={memberSearch[i] ?? ""}
                                                            onChange={e => setMemberSearch(prev => ({ ...prev, [i]: e.target.value }))}
                                                            placeholder="Hledat člena…"
                                                            className="h-7 text-xs"
                                                            autoFocus
                                                        />
                                                    </div>
                                                    <div className="py-1">
                                                        {members === null && <p className="text-xs text-gray-400 px-3 py-2">Načítám…</p>}
                                                        {members && members
                                                            .filter(m => m.fullName.toLowerCase().includes((memberSearch[i] ?? "").toLowerCase()))
                                                            .map(m => (
                                                                <button key={m.id} onClick={() => selectMember(i, m)}
                                                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-50 transition-colors">
                                                                    {m.fullName}
                                                                </button>
                                                            ))
                                                        }
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={addParticipant}
                            className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 transition-colors">
                            <Plus size={12} /> Přidat účastníka
                        </button>
                    </div>

                    {error && <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={onClose}>Zrušit</Button>
                        <Button size="sm" onClick={handleSubmit} disabled={saving}>
                            {saving ? "Ukládám…" : "Přidat přihlášku"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Párování účastníka s členem (standalone) ──────────────────────────────────

interface LinkParticipantDialogProps {
    participant: SettlementParticipant & { registrationId: number };
    open: boolean;
    onClose: () => void;
    onLinked: () => void;
}

export function LinkParticipantDialog({ participant, open, onClose, onLinked }: LinkParticipantDialogProps) {
    const [members, setMembers] = useState<{ id: number; fullName: string }[] | null>(null);
    const [search, setSearch] = useState("");
    const [saving, startSave] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function ensureMembers() {
        if (!members) getMembersForSettlement().then(setMembers);
    }

    function handleSelect(memberId: number | null) {
        startSave(async () => {
            const res = await linkParticipantToMember(participant.id, memberId);
            if ("error" in res) setError(res.error);
            else { onLinked(); onClose(); }
        });
    }

    const filtered = members?.filter(m => m.fullName.toLowerCase().includes(search.toLowerCase())) ?? [];

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }} >
            <DialogContent className="sm:max-w-sm" onOpenAutoFocus={() => ensureMembers()}>
                <DialogHeader>
                    <DialogTitle>Spárovat: {participant.fullName}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-1">
                    {participant.memberId && (
                        <div className="flex items-center justify-between text-xs bg-emerald-50 rounded px-3 py-2">
                            <span className="text-emerald-700">Spárováno: <strong>{participant.memberName}</strong></span>
                            <button onClick={() => handleSelect(null)} disabled={saving}
                                className="text-gray-400 hover:text-red-500 transition-colors">Zrušit párování</button>
                        </div>
                    )}
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Hledat člena OVT…"
                        className="h-8 text-sm"
                        autoFocus
                    />
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                        {members === null && <p className="text-xs text-gray-400 px-3 py-3">Načítám…</p>}
                        {members !== null && filtered.length === 0 && <p className="text-xs text-gray-400 px-3 py-3">Nic nenalezeno</p>}
                        {filtered.map(m => (
                            <button key={m.id} onClick={() => handleSelect(m.id)} disabled={saving}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors border-b border-gray-100 last:border-0 ${m.id === participant.memberId ? "bg-emerald-50 font-medium" : ""}`}>
                                {m.fullName}
                                {m.id === participant.memberId && <span className="ml-2 text-emerald-600 text-xs">✓</span>}
                            </button>
                        ))}
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={onClose}>Zavřít</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
