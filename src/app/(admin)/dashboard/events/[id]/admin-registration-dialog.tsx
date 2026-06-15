"use client";

import { useState, useTransition, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserCheck, X, ChevronDown, ChevronRight, Pencil, Check } from "lucide-react";
import {
    addAdminEventRegistration,
    linkParticipantToMember,
    getMembersForSettlement,
    addParticipantToRegistration,
    updateAdminRegistration,
    updateParticipantFullName,
} from "@/lib/actions/event-settlement";
import type { SettlementParticipant } from "@/lib/actions/event-settlement";

// ── Typy ─────────────────────────────────────────────────────────────────────

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
};

// ── Přidání přihlášky (#3 oprava: více nečlenů, #7: poznámka) ────────────────

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
    // #3: pole nečlenů místo jednoho objektu
    const [nonMembers, setNonMembers] = useState<NonMemberDraft[]>([]);
    const [showNonMemberForm, setShowNonMemberForm] = useState(false);
    const [newNonMember, setNewNonMember] = useState<NonMemberDraft & { email: string; phone: string }>({
        firstName: "", lastName: "", email: "", phone: "",
    });
    // #7: poznámka
    const [note, setNote] = useState("");
    const [showNote, setShowNote] = useState(false);
    const [saving, startSave] = useTransition();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open && !allMembers) getMembersForSettlement()
            .then(setAllMembers)
            .catch(() => setError("Nepodařilo se načíst seznam členů. Zkus obnovit stránku."));
    }, [open, allMembers]);

    useEffect(() => {
        if (!open) {
            setSearch(""); setSelectedMembers([]); setNonMembers([]);
            setShowNonMemberForm(false);
            setNewNonMember({ firstName: "", lastName: "", email: "", phone: "" });
            setNote(""); setShowNote(false); setError(null);
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

    function addNonMember() {
        if (!newNonMember.firstName.trim()) return;
        setNonMembers(prev => [...prev, { firstName: newNonMember.firstName.trim(), lastName: newNonMember.lastName.trim() }]);
        setNewNonMember(prev => ({ ...prev, firstName: "", lastName: "" }));
        setShowNonMemberForm(false);
    }

    function removeNonMember(index: number) {
        setNonMembers(prev => prev.filter((_, i) => i !== index));
    }

    function handleSubmit() {
        setError(null);
        const hasMember = selectedMembers.length > 0;
        const hasNonMembers = nonMembers.length > 0;
        const hasNewNonMember = showNonMemberForm && newNonMember.firstName.trim();

        if (!hasMember && !hasNonMembers && !hasNewNonMember) {
            setError("Vyberte alespoň jednoho člena OVT nebo přidejte nečlena");
            return;
        }

        // Kontaktní údaje: z profilu prvního člena, nebo z pole nečlena
        const email = hasMember ? (selectedMembers[0].email ?? "") : newNonMember.email.trim();
        const phone = hasMember ? (selectedMembers[0].phone ?? "") : newNonMember.phone.trim();

        if (!email) {
            setError("Vyplňte e-mail kontaktní osoby");
            return;
        }

        const firstName = hasMember ? selectedMembers[0].firstName : (nonMembers[0]?.firstName ?? newNonMember.firstName.trim());
        const lastName  = hasMember ? selectedMembers[0].lastName  : (nonMembers[0]?.lastName  ?? newNonMember.lastName.trim());

        // Sestavit finální seznam nečlenů (přidaní + případně rozpracovaný)
        const allNonMembers = hasNewNonMember
            ? [...nonMembers, { firstName: newNonMember.firstName.trim(), lastName: newNonMember.lastName.trim() }]
            : nonMembers;

        const participants: Array<{ fullName: string; isPrimary: boolean; memberId: number | null }> = [
            ...selectedMembers.map((m, i) => ({ fullName: m.fullName, isPrimary: i === 0, memberId: m.id })),
            ...allNonMembers.map((nm, i) => ({
                fullName: `${nm.firstName} ${nm.lastName}`.trim(),
                isPrimary: !hasMember && i === 0,
                memberId: null,
            })),
        ];

        startSave(async () => {
            const res = await addAdminEventRegistration(eventId, {
                email, phone: phone || undefined,
                firstName, lastName,
                note: note.trim() || null,
                participants,
            });
            if ("error" in res) { setError(res.error); }
            else { onAdded(); onClose(); }
        });
    }

    const canSubmit = selectedMembers.length > 0
        || nonMembers.length > 0
        || (showNonMemberForm && !!newNonMember.firstName.trim());

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
                                    e.preventDefault(); addMember(filtered[0]);
                                }
                            }}
                            placeholder={selectedMembers.length === 0 ? "Hledat člena OVT…" : "Přidat dalšího člena…"}
                            className="h-8 text-sm"
                            autoFocus
                        />

                        {search && (
                            <div className="mt-1 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                                {allMembers === null && <p className="text-xs text-gray-400 px-3 py-2">Načítám…</p>}
                                {allMembers !== null && filtered.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">Nic nenalezeno</p>}
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

                    {/* ── Sekce nečlenů ── */}
                    <div>
                        {/* Přidaní nečlenové jako chipy */}
                        {nonMembers.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {nonMembers.map((nm, i) => (
                                    <span key={i}
                                        className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-700 border border-gray-200 rounded-full px-2.5 py-1">
                                        {nm.firstName} {nm.lastName}
                                        <button onClick={() => removeNonMember(i)}
                                            className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors">
                                            <X size={11} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Tlačítko pro rozbalení formuláře — vždy viditelné (#3 fix) */}
                        <button
                            onClick={() => setShowNonMemberForm(!showNonMemberForm)}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                            {showNonMemberForm ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            {selectedMembers.length > 0 || nonMembers.length > 0 ? "Přidat nečlena" : "Přihlásit nečlena"}
                        </button>

                        {showNonMemberForm && (
                            <div className="mt-2 border border-dashed border-gray-200 rounded-lg p-3 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-xs text-gray-600">Jméno</Label>
                                        <Input value={newNonMember.firstName}
                                            onChange={e => setNewNonMember(f => ({ ...f, firstName: e.target.value }))}
                                            className="mt-1 h-8 text-sm" placeholder="Jana" />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-gray-600">Příjmení</Label>
                                        <Input value={newNonMember.lastName}
                                            onChange={e => setNewNonMember(f => ({ ...f, lastName: e.target.value }))}
                                            className="mt-1 h-8 text-sm" placeholder="Nováková" />
                                    </div>
                                </div>
                                {/* E-mail + telefon jen pokud není žádný člen ani přidaný nečlen */}
                                {selectedMembers.length === 0 && nonMembers.length === 0 && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-xs text-gray-600">E-mail *</Label>
                                            <Input type="email" value={newNonMember.email}
                                                onChange={e => setNewNonMember(f => ({ ...f, email: e.target.value }))}
                                                className="mt-1 h-8 text-sm" placeholder="jana@example.cz" />
                                        </div>
                                        <div>
                                            <Label className="text-xs text-gray-600">Telefon</Label>
                                            <Input value={newNonMember.phone}
                                                onChange={e => setNewNonMember(f => ({ ...f, phone: e.target.value }))}
                                                className="mt-1 h-8 text-sm" placeholder="+420…" />
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-end">
                                    <Button size="sm" variant="outline"
                                        onClick={addNonMember}
                                        disabled={!newNonMember.firstName.trim()}
                                        className="h-7 text-xs">
                                        Přidat
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Poznámka (#7) ── */}
                    <div>
                        <button
                            onClick={() => setShowNote(!showNote)}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                            {showNote ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            Poznámka k přihlášce
                        </button>
                        {showNote && (
                            <Textarea
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                placeholder="Jedu vlastní dopravou, odjíždím v sobotu ráno…"
                                className="mt-2 text-sm resize-none"
                                rows={2}
                            />
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

// ── Přidání účastníka do existující přihlášky (#5 oprava: dvě pole) ──────────

interface AddParticipantDialogProps {
    registrationId: number;
    open: boolean;
    onClose: () => void;
    onAdded: () => void;
}

export function AddParticipantDialog({ registrationId, open, onClose, onAdded }: AddParticipantDialogProps) {
    const [allMembers, setAllMembers] = useState<MemberOption[] | null>(null);
    const [search, setSearch] = useState("");
    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null);
    const [showNonMember, setShowNonMember] = useState(false);
    // #5: dvě pole místo jednoho fullName
    const [nmFirstName, setNmFirstName] = useState("");
    const [nmLastName, setNmLastName] = useState("");
    const [saving, startSave] = useTransition();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open && !allMembers) getMembersForSettlement()
            .then(setAllMembers)
            .catch(() => setError("Nepodařilo se načíst seznam členů. Zkus obnovit stránku."));
    }, [open, allMembers]);

    useEffect(() => {
        if (!open) {
            setSearch(""); setSelectedMember(null);
            setShowNonMember(false); setNmFirstName(""); setNmLastName(""); setError(null);
        }
    }, [open]);

    const filtered = (allMembers ?? [])
        .filter(m => m.fullName.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 8);

    function handleSubmit() {
        setError(null);
        const fullName = selectedMember
            ? selectedMember.fullName
            : `${nmFirstName.trim()} ${nmLastName.trim()}`.trim();
        const memberId = selectedMember ? selectedMember.id : null;

        if (!fullName) {
            setError("Vyberte člena nebo zadejte jméno nečlena");
            return;
        }
        startSave(async () => {
            const res = await addParticipantToRegistration(registrationId, { fullName, memberId });
            if ("error" in res) { setError(res.error); }
            else { onAdded(); onClose(); }
        });
    }

    const canSubmit = !!selectedMember || !!nmFirstName.trim();

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Přidat účastníka</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                    {/* Člen OVT */}
                    <div>
                        <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Člen OVT</p>
                        {selectedMember ? (
                            <div className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full px-2.5 py-1.5 w-fit">
                                <UserCheck size={11} />
                                {selectedMember.fullName}
                                <button onClick={() => { setSelectedMember(null); setSearch(""); }}
                                    className="ml-1 text-emerald-500 hover:text-red-500 transition-colors">
                                    <X size={11} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <Input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === "Enter" && filtered.length > 0) {
                                            e.preventDefault();
                                            setSelectedMember(filtered[0]); setSearch("");
                                        }
                                    }}
                                    placeholder="Hledat člena OVT…"
                                    className="h-8 text-sm"
                                    autoFocus
                                />
                                {search && (
                                    <div className="mt-1 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                                        {allMembers === null && <p className="text-xs text-gray-400 px-3 py-2">Načítám…</p>}
                                        {allMembers !== null && filtered.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">Nic nenalezeno</p>}
                                        {filtered.map(m => (
                                            <button key={m.id} onClick={() => { setSelectedMember(m); setSearch(""); }}
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors border-b border-gray-100 last:border-0">
                                                {m.fullName}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Nečlen — #5: dvě pole Jméno + Příjmení */}
                    {!selectedMember && (
                        <div>
                            <button onClick={() => setShowNonMember(!showNonMember)}
                                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                                {showNonMember ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                Přidat nečlena
                            </button>
                            {showNonMember && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-xs text-gray-600">Jméno</Label>
                                        <Input value={nmFirstName}
                                            onChange={e => setNmFirstName(e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                                            className="mt-1 h-8 text-sm" placeholder="Jana" />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-gray-600">Příjmení</Label>
                                        <Input value={nmLastName}
                                            onChange={e => setNmLastName(e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                                            className="mt-1 h-8 text-sm" placeholder="Nováková" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {error && <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={onClose}>Zrušit</Button>
                        <Button size="sm" onClick={handleSubmit} disabled={saving || !canSubmit}>
                            {saving ? "Ukládám…" : "Přidat"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Párování účastníka s členem ───────────────────────────────────────────────

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

    // Komponenta se mountuje čerstvě při každém otevření (podmíněný render {linkTarget && ...})
    useEffect(() => {
        setSearch(participant.fullName);
        getMembersForSettlement()
            .then(setMembers)
            .catch(() => setError("Nepodařilo se načíst seznam členů. Zkus obnovit stránku."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleSelect(memberId: number | null) {
        startSave(async () => {
            const res = await linkParticipantToMember(participant.id, memberId);
            if ("error" in res) setError(res.error);
            else { onLinked(); onClose(); }
        });
    }

    // Hledání po slovech: všechna slova z hledaného textu musí být obsažena v fullName člena
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = (members ?? []).filter(m => {
        const name = m.fullName.toLowerCase();
        return words.length === 0 || words.every(w => name.includes(w));
    });

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }} >
            <DialogContent className="sm:max-w-sm">
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
                        {members === null && !error && <p className="text-xs text-gray-400 px-3 py-3">Načítám…</p>}
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

// ── Editace přihlášky (#6) ────────────────────────────────────────────────────

type EditableParticipant = {
    id: number;
    fullName: string;
    isPrimary: boolean;
    memberId: number | null | undefined;
};

interface EditRegistrationDialogProps {
    registrationId: number;
    initialEmail: string;
    initialPhone: string | null;
    initialNote: string | null;
    participants: EditableParticipant[];
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
}

export function EditRegistrationDialog({
    registrationId, initialEmail, initialPhone, initialNote,
    participants, open, onClose, onSaved,
}: EditRegistrationDialogProps) {
    const [email, setEmail] = useState(initialEmail);
    const [phone, setPhone] = useState(initialPhone ?? "");
    const [note, setNote] = useState(initialNote ?? "");
    const [saving, startSave] = useTransition();
    const [error, setError] = useState<string | null>(null);

    // Inline přejmenování účastníka
    const [editingParticipantId, setEditingParticipantId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState("");

    useEffect(() => {
        if (open) {
            setEmail(initialEmail);
            setPhone(initialPhone ?? "");
            setNote(initialNote ?? "");
            setEditingParticipantId(null);
            setError(null);
        }
    }, [open, initialEmail, initialPhone, initialNote]);

    function handleSave() {
        if (!email.trim()) { setError("E-mail je povinný"); return; }
        setError(null);
        startSave(async () => {
            const res = await updateAdminRegistration(registrationId, {
                email: email.trim(),
                phone: phone.trim() || undefined,
                note: note.trim() || null,
            });
            if ("error" in res) { setError(res.error); }
            else { onSaved(); onClose(); }
        });
    }

    function startRenaming(p: EditableParticipant) {
        setEditingParticipantId(p.id);
        setEditingName(p.fullName);
    }

    function handleRename(participantId: number) {
        if (!editingName.trim()) return;
        startSave(async () => {
            const res = await updateParticipantFullName(participantId, editingName);
            if ("error" in res) { setError(res.error); }
            else { setEditingParticipantId(null); onSaved(); }
        });
    }

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Upravit přihlášku</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                    {/* Kontaktní údaje */}
                    <div>
                        <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Kontaktní údaje</p>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs text-gray-600">E-mail *</Label>
                                <Input type="email" value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="mt-1 h-8 text-sm" />
                            </div>
                            <div>
                                <Label className="text-xs text-gray-600">Telefon</Label>
                                <Input value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    className="mt-1 h-8 text-sm" placeholder="+420…" />
                            </div>
                        </div>
                    </div>

                    {/* Účastníci — přejmenování nečlenů */}
                    {participants.length > 0 && (
                        <div>
                            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Účastníci</p>
                            <div className="space-y-1">
                                {participants.map(p => (
                                    <div key={p.id} className="flex items-center gap-2">
                                        {editingParticipantId === p.id ? (
                                            <>
                                                <Input
                                                    value={editingName}
                                                    onChange={e => setEditingName(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") handleRename(p.id);
                                                        if (e.key === "Escape") setEditingParticipantId(null);
                                                    }}
                                                    className="h-7 text-xs flex-1"
                                                    autoFocus
                                                />
                                                <button onClick={() => handleRename(p.id)} disabled={saving}
                                                    className="text-emerald-500 hover:text-emerald-700 transition-colors">
                                                    <Check size={14} />
                                                </button>
                                                <button onClick={() => setEditingParticipantId(null)}
                                                    className="text-gray-400 hover:text-gray-600 transition-colors">
                                                    <X size={14} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-sm text-gray-700 flex-1">{p.fullName}</span>
                                                {p.isPrimary && (
                                                    <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">kontakt</span>
                                                )}
                                                {/* Přejmenování jen pro nečleny */}
                                                {!p.memberId && (
                                                    <button onClick={() => startRenaming(p)}
                                                        className="text-gray-300 hover:text-gray-600 transition-colors"
                                                        title="Přejmenovat">
                                                        <Pencil size={12} />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Poznámka */}
                    <div>
                        <Label className="text-xs text-gray-600">Poznámka</Label>
                        <Textarea value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Jedu vlastní dopravou, odjíždím v sobotu ráno…"
                            className="mt-1 text-sm resize-none"
                            rows={2}
                        />
                    </div>

                    {error && <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Zrušit</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? "Ukládám…" : "Uložit"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
