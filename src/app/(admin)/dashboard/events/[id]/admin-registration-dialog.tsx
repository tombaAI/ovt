"use client";

import { useState, useTransition, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCheck, X, ChevronDown, ChevronRight } from "lucide-react";
import {
    addAdminEventRegistration,
    linkParticipantToMember,
    getMembersForSettlement,
} from "@/lib/actions/event-settlement";
import type { SettlementParticipant } from "@/lib/actions/event-settlement";

// ── Přidání přihlášky ─────────────────────────────────────────────────────────

type MemberOption = {
    id: number;
    fullName: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
};

type NonMemberDraft = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
};

interface AddRegistrationDialogProps {
    eventId: number;
    open: boolean;
    onClose: () => void;
    onAdded: () => void;
}

export function AddRegistrationDialog({ eventId, open, onClose, onAdded }: AddRegistrationDialogProps) {
    const [allMembers, setAllMembers] = useState<MemberOption[] | null>(null);
    const [search, setSearch] = useState("");
    const [selectedMembers, setSelectedMembers] = useState<MemberOption[]>([]);
    const [showNonMember, setShowNonMember] = useState(false);
    const [nonMember, setNonMember] = useState<NonMemberDraft>({ firstName: "", lastName: "", email: "", phone: "" });
    const [saving, startSave] = useTransition();
    const [error, setError] = useState<string | null>(null);

    // načíst členy při prvním otevření
    useEffect(() => {
        if (open && !allMembers) getMembersForSettlement().then(setAllMembers);
    }, [open, allMembers]);

    // reset při zavření
    useEffect(() => {
        if (!open) {
            setSearch("");
            setSelectedMembers([]);
            setShowNonMember(false);
            setNonMember({ firstName: "", lastName: "", email: "", phone: "" });
            setError(null);
        }
    }, [open]);

    const filtered = (allMembers ?? [])
        .filter(m =>
            !selectedMembers.some(s => s.id === m.id) &&
            m.fullName.toLowerCase().includes(search.toLowerCase())
        )
        .slice(0, 8);

    function addMember(m: MemberOption) {
        setSelectedMembers(prev => [...prev, m]);
        setSearch("");
    }

    function removeMember(id: number) {
        setSelectedMembers(prev => prev.filter(m => m.id !== id));
    }

    function handleSubmit() {
        setError(null);
        const hasMember = selectedMembers.length > 0;
        const hasNonMember = showNonMember && nonMember.firstName.trim();

        if (!hasMember && !showNonMember) {
            setError("Vyberte alespoň jednoho člena OVT");
            return;
        }
        if (showNonMember && !nonMember.firstName.trim() && !hasMember) {
            setError("Vyplňte jméno nečlena");
            return;
        }

        // kontaktní e-mail: z profilu prvního člena, nebo z pole nečlena
        const email = hasMember ? (selectedMembers[0].email ?? "") : nonMember.email.trim();
        const phone = hasMember ? (selectedMembers[0].phone ?? "") : nonMember.phone.trim();

        if (!email) {
            setError("Vyplňte e-mail kontaktní osoby");
            return;
        }

        // kontaktní osoba = první člen, nebo nečlen
        const firstName = hasMember ? selectedMembers[0].firstName : nonMember.firstName.trim();
        const lastName = hasMember ? selectedMembers[0].lastName : nonMember.lastName.trim();

        // sestavit účastníky
        const participants: Array<{ fullName: string; isPrimary: boolean; memberId: number | null }> = [
            ...selectedMembers.map((m, i) => ({
                fullName: m.fullName,
                isPrimary: i === 0,
                memberId: m.id,
            })),
        ];
        if (hasNonMember) {
            participants.push({
                fullName: `${nonMember.firstName.trim()} ${nonMember.lastName.trim()}`.trim(),
                isPrimary: !hasMember,
                memberId: null,
            });
        }

        startSave(async () => {
            const res = await addAdminEventRegistration(eventId, {
                email,
                phone: phone || undefined,
                firstName,
                lastName,
                participants,
            });
            if ("error" in res) { setError(res.error); }
            else { onAdded(); onClose(); }
        });
    }

    const canSubmit = selectedMembers.length > 0 || (showNonMember && !!nonMember.firstName.trim());

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Přidat přihlášku</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-2">

                    {/* ── Výběr člena OVT ── */}
                    <div>
                        <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Člen OVT</p>

                        {selectedMembers.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {selectedMembers.map(m => (
                                    <span key={m.id}
                                        className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full px-2.5 py-1">
                                        <UserCheck size={11} />
                                        {m.fullName}
                                        <button onClick={() => removeMember(m.id)}
                                            className="ml-0.5 text-emerald-500 hover:text-red-500 transition-colors">
                                            <X size={11} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter" && filtered.length > 0) {
                                    e.preventDefault();
                                    addMember(filtered[0]);
                                }
                            }}
                            placeholder={selectedMembers.length === 0 ? "Hledat člena OVT…" : "Přidat dalšího člena…"}
                            className="h-8 text-sm"
                            autoFocus
                        />

                        {search && (
                            <div className="mt-1 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                                {allMembers === null && (
                                    <p className="text-xs text-gray-400 px-3 py-2">Načítám…</p>
                                )}
                                {allMembers !== null && filtered.length === 0 && (
                                    <p className="text-xs text-gray-400 px-3 py-2">Nic nenalezeno</p>
                                )}
                                {filtered.map(m => (
                                    <button key={m.id} onClick={() => addMember(m)}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors border-b border-gray-100 last:border-0">
                                        {m.fullName}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Kontaktní údaje z profilu člena (read-only) ── */}
                    {selectedMembers.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-xs text-gray-500 mb-0.5">E-mail</p>
                                {selectedMembers[0].email
                                    ? <p className="text-gray-800 truncate">{selectedMembers[0].email}</p>
                                    : <p className="text-amber-600 text-xs">Člen nemá e-mail v systému</p>
                                }
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-0.5">Telefon</p>
                                <p className="text-gray-800">{selectedMembers[0].phone ?? "—"}</p>
                            </div>
                        </div>
                    )}

                    {/* ── Sekce nečlen ── */}
                    <div>
                        <button
                            onClick={() => setShowNonMember(!showNonMember)}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                            {showNonMember
                                ? <ChevronDown size={12} />
                                : <ChevronRight size={12} />}
                            {selectedMembers.length > 0 ? "Přidat nečlena" : "Přihlásit nečlena"}
                        </button>

                        {showNonMember && (
                            <div className="mt-2 border border-dashed border-gray-200 rounded-lg p-3 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-xs text-gray-600">Jméno</Label>
                                        <Input value={nonMember.firstName}
                                            onChange={e => setNonMember(f => ({ ...f, firstName: e.target.value }))}
                                            className="mt-1 h-8 text-sm" placeholder="Jana" />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-gray-600">Příjmení</Label>
                                        <Input value={nonMember.lastName}
                                            onChange={e => setNonMember(f => ({ ...f, lastName: e.target.value }))}
                                            className="mt-1 h-8 text-sm" placeholder="Nováková" />
                                    </div>
                                </div>
                                {/* E-mail + telefon jen pokud není vybraný žádný člen (nečlen = kontaktní osoba) */}
                                {selectedMembers.length === 0 && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-xs text-gray-600">E-mail *</Label>
                                            <Input type="email" value={nonMember.email}
                                                onChange={e => setNonMember(f => ({ ...f, email: e.target.value }))}
                                                className="mt-1 h-8 text-sm" placeholder="jana@example.cz" />
                                        </div>
                                        <div>
                                            <Label className="text-xs text-gray-600">Telefon</Label>
                                            <Input value={nonMember.phone}
                                                onChange={e => setNonMember(f => ({ ...f, phone: e.target.value }))}
                                                className="mt-1 h-8 text-sm" placeholder="+420…" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {error && <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={onClose}>Zrušit</Button>
                        <Button size="sm" onClick={handleSubmit} disabled={saving || !canSubmit}>
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
