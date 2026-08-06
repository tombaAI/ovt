"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { createProvozniVydaj, type ProvozniVydajRow, type MemberOption } from "@/lib/actions/events";
import { deriveProvozniStav, PROVOZNI_STAV_LABELS, type ProvozniStav } from "@/lib/provoz-status";

const STAV_COLORS: Record<ProvozniStav, string> = {
    rozpracovano: "bg-gray-100 text-gray-600",
    uzamceno: "bg-amber-50 text-amber-700",
    odeslano: "bg-emerald-50 text-emerald-700",
};

const fmtKc = (n: number) =>
    new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(n) + " Kč";
const fmtDate = (d: string | null) =>
    d ? new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(d)) : "—";

export function ProvozClient({ rows, allMembers }: { rows: ProvozniVydajRow[]; allMembers: MemberOption[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [leaderId, setLeaderId] = useState("");
    const [description, setDescription] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function handleCreate() {
        setError(null);
        startTransition(async () => {
            const res = await createProvozniVydaj({
                name,
                dateFrom: dateFrom || null,
                leaderId: leaderId ? Number(leaderId) : null,
                description: description.trim() || null,
            });
            if ("error" in res) { setError(res.error); return; }
            router.push(`/dashboard/events/${res.id}`);
        });
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-5">
                <h1 className="text-xl font-semibold text-gray-900">Provozní výdaje</h1>
                <Dialog open={open} onOpenChange={o => { setOpen(o); setError(null); }}>
                    <DialogTrigger asChild>
                        <Button size="sm"><Plus size={15} />Nový provozní výdaj</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader><DialogTitle>Nový provozní výdaj</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label htmlFor="provoz-name" className="text-sm font-medium">Název *</label>
                                <Input id="provoz-name" value={name} onChange={e => setName(e.target.value)}
                                    placeholder="Např. Oprava vleku" />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="provoz-date" className="text-sm font-medium">Datum</label>
                                <Input id="provoz-date" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="provoz-leader" className="text-sm font-medium">Odpovědná osoba</label>
                                <select id="provoz-leader" value={leaderId} onChange={e => setLeaderId(e.target.value)}
                                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                                    <option value="">— nevybráno —</option>
                                    {allMembers.map(m => (
                                        <option key={m.id} value={m.id}>{m.lastName} {m.firstName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="provoz-desc" className="text-sm font-medium">Popis</label>
                                <Textarea id="provoz-desc" value={description} onChange={e => setDescription(e.target.value)}
                                    placeholder="Volitelný popis…" rows={3} />
                            </div>
                            {error && <p className="text-sm text-red-600">{error}</p>}
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreate} disabled={pending || !name.trim()}>
                                {pending ? "Zakládám…" : "Založit"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {rows.length === 0 ? (
                <p className="text-sm text-gray-500">Zatím žádné provozní výdaje.</p>
            ) : (
                <div className="rounded-xl border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-gray-50/50 text-left text-xs text-gray-500">
                                <th className="px-4 py-2.5 font-medium">Název</th>
                                <th className="px-4 py-2.5 font-medium">Datum</th>
                                <th className="px-4 py-2.5 font-medium">Odpovědná osoba</th>
                                <th className="px-4 py-2.5 font-medium text-right">Doklady</th>
                                <th className="px-4 py-2.5 font-medium text-right">Částka</th>
                                <th className="px-4 py-2.5 font-medium">Stav</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const stav = deriveProvozniStav(r.billingStatus, r.sentToTj);
                                return (
                                    <tr key={r.id} onClick={() => router.push(`/dashboard/events/${r.id}`)}
                                        className="border-b last:border-0 hover:bg-gray-50 cursor-pointer transition-colors">
                                        <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                                        <td className="px-4 py-2.5 text-gray-600">{fmtDate(r.dateFrom)}</td>
                                        <td className="px-4 py-2.5 text-gray-600">{r.leaderName ?? "—"}</td>
                                        <td className="px-4 py-2.5 text-right text-gray-600">{r.expenseCount}</td>
                                        <td className="px-4 py-2.5 text-right text-gray-900">{fmtKc(r.expenseSum)}</td>
                                        <td className="px-4 py-2.5">
                                            <Badge className={`${STAV_COLORS[stav]} border-0 text-xs font-normal`}>
                                                {PROVOZNI_STAV_LABELS[stav]}
                                            </Badge>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
