"use client";

import { useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEvent } from "@/lib/actions/events";
import { EVENT_TYPE_LABELS, MONTH_NAMES } from "@/lib/events-config";
import type { EventType } from "@/lib/actions/events";

interface MemberOption {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    nickname: string | null;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultYear: number;
    allMembers: MemberOption[];
    onSaved: () => void;
}

const EVENT_TYPES = Object.entries(EVENT_TYPE_LABELS) as [EventType, string][];

function matchesMember(m: MemberOption, q: string) {
    const lq = q.toLowerCase();
    return (
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(lq) ||
        `${m.lastName} ${m.firstName}`.toLowerCase().includes(lq) ||
        (m.nickname?.toLowerCase().includes(lq) ?? false)
    );
}

export function AddEventSheet({ open, onOpenChange, defaultYear, allMembers, onSaved }: Props) {
    const [name, setName]                 = useState("");
    const [eventType, setEventType]       = useState<EventType>("other");
    const [dateFrom, setDateFrom]         = useState("");
    const [approxMonth, setApproxMonth]   = useState<number>(0);
    const [location, setLocation]         = useState("");
    const [leaderId, setLeaderId]         = useState<number | null>(null);
    const [leaderText, setLeaderText]     = useState("");
    const [leaderFocused, setLeaderFocused] = useState(false);
    const [error, setError]               = useState<string | null>(null);
    const [isPending, startTransition]    = useTransition();

    function reset() {
        setName(""); setEventType("other"); setDateFrom("");
        setApproxMonth(0); setLocation(""); setLeaderId(null);
        setLeaderText(""); setError(null);
    }

    function handleOpenChange(v: boolean) {
        if (!v) reset();
        onOpenChange(v);
    }

    const leaderSuggestions = leaderFocused && leaderText.trim()
        ? allMembers.filter(m => matchesMember(m, leaderText)).slice(0, 6)
        : [];

    function selectLeader(m: MemberOption) {
        setLeaderId(m.id);
        setLeaderText(`${m.lastName} ${m.firstName}`);
        setLeaderFocused(false);
    }

    function handleSave() {
        setError(null);
        if (!name.trim()) { setError("Název je povinný"); return; }
        startTransition(async () => {
            try {
                await createEvent({
                    year: defaultYear, name: name.trim(),
                    eventType, dateFrom: dateFrom || null, dateTo: null,
                    approxMonth: approxMonth || null,
                    location: location.trim() || null, leaderId,
                    status: "planned", description: null, externalUrl: null,
                    gcalSync: false, note: null,
                });
                onSaved();
                handleOpenChange(false);
            } catch (e) { setError(e instanceof Error ? e.message : "Chyba"); }
        });
    }

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent className="sm:max-w-md px-5 pb-8 overflow-y-auto">
                <SheetHeader className="px-0 pt-5 pb-4">
                    <SheetTitle>Nová akce — {defaultYear}</SheetTitle>
                </SheetHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="new-name">Název *</Label>
                        <Input id="new-name" value={name} onChange={e => setName(e.target.value)}
                            placeholder="např. ČPV Otava, Doubrava…"
                            onKeyDown={e => e.key === "Enter" && handleSave()} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Typ</Label>
                            <select value={eventType} onChange={e => setEventType(e.target.value as EventType)}
                                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                {EVENT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Datum od</Label>
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        </div>
                    </div>

                    {!dateFrom && (
                        <div className="space-y-1.5">
                            <Label>Orientační měsíc</Label>
                            <select value={approxMonth} onChange={e => setApproxMonth(Number(e.target.value))}
                                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                <option value={0}>— neznámý —</option>
                                {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Místo / řeka</Label>
                            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="např. Otava…" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Vedoucí</Label>
                            <div className="relative">
                                <Input value={leaderText} autoComplete="off" placeholder="Příjmení…"
                                    onChange={e => { setLeaderText(e.target.value); if (!e.target.value.trim()) setLeaderId(null); }}
                                    onFocus={() => setLeaderFocused(true)}
                                    onBlur={() => setTimeout(() => setLeaderFocused(false), 150)}
                                    onKeyDown={e => { if (e.key === "Enter" && leaderSuggestions.length > 0) { e.preventDefault(); selectLeader(leaderSuggestions[0]); }}} />
                                {leaderSuggestions.length > 0 && (
                                    <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-lg border shadow-md divide-y max-h-40 overflow-y-auto">
                                        {leaderSuggestions.map((m, i) => (
                                            <button key={m.id} type="button"
                                                className={`w-full text-left px-3 py-2 text-sm ${i === 0 ? "bg-gray-50 font-medium" : "hover:bg-gray-50"}`}
                                                onMouseDown={e => { e.preventDefault(); selectLeader(m); }}>
                                                {m.nickname ? `${m.lastName} ${m.firstName} (${m.nickname})` : `${m.lastName} ${m.firstName}`}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex gap-2 pt-1">
                        <Button onClick={handleSave} disabled={isPending} className="bg-[#327600] hover:bg-[#2a6400]">
                            {isPending ? "Ukládám…" : "Vytvořit akci"}
                        </Button>
                        <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isPending}>Zrušit</Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
