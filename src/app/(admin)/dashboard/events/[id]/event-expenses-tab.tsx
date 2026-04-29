"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Paperclip, Trash2, Upload, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEventExpenses } from "@/lib/actions/event-expenses";
import type { EventExpenseRow } from "@/lib/actions/event-expenses";
import { expenseCategoryEnum, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/expense-categories";

const CATEGORIES = expenseCategoryEnum as readonly ExpenseCategory[];

function fmtAmount(amount: string) {
    return new Intl.NumberFormat("cs-CZ").format(Number(amount)) + " Kč";
}

function fmtDate(d: Date) {
    return new Intl.DateTimeFormat("cs-CZ", {
        day: "2-digit", month: "2-digit", year: "numeric",
    }).format(new Date(d));
}

function isImage(mime: string | null) {
    return mime?.startsWith("image/") ?? false;
}

// ── Add expense form ──────────────────────────────────────────────────────────

function AddExpenseForm({ eventId, onAdded }: { eventId: number; onAdded: () => void }) {
    const [amount, setAmount]               = useState("");
    const [purposeText, setPurposeText]     = useState("");
    const [category, setCategory]           = useState<ExpenseCategory>("doprava");
    const [file, setFile]                   = useState<File | null>(null);
    const [uploading, setUploading]         = useState(false);
    const [error, setError]                 = useState<string | null>(null);
    const fileInputRef                      = useRef<HTMLInputElement>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        const amountNum = parseFloat(amount.replace(",", "."));
        if (isNaN(amountNum) || amountNum <= 0) {
            setError("Zadejte platnou částku");
            return;
        }
        if (!purposeText.trim()) {
            setError("Zadejte účel dokladu");
            return;
        }

        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("amount", String(amountNum));
            fd.append("purposeText", purposeText.trim());
            fd.append("purposeCategory", category);
            if (file) fd.append("file", file);

            const res = await fetch(`/api/events/${eventId}/expenses`, {
                method: "POST",
                body: fd,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Chyba uploadu");

            setAmount("");
            setPurposeText("");
            setCategory("doprava");
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            onAdded();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chyba");
        } finally {
            setUploading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="rounded-xl border bg-gray-50 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Přidat doklad</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Částka */}
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Částka (Kč)</label>
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        required
                        className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </div>

                {/* Kategorie */}
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Kategorie nákladu</label>
                    <select
                        value={category}
                        onChange={e => setCategory(e.target.value as ExpenseCategory)}
                        className="w-full h-9 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        {CATEGORIES.map(c => (
                            <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Účel textem */}
            <div>
                <label className="text-xs text-gray-500 mb-1 block">Účel / popis</label>
                <input
                    type="text"
                    placeholder="Např. jízdenky Praha–Brno, oběd účastníci…"
                    value={purposeText}
                    onChange={e => setPurposeText(e.target.value)}
                    required
                    className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
            </div>

            {/* Soubor — přiložit nebo vyfotit */}
            <div>
                <label className="text-xs text-gray-500 mb-1 block">
                    Doklad (volitelné — PDF nebo fotka)
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Klasický výběr souboru */}
                    <label className="flex items-center gap-1.5 cursor-pointer h-9 px-3 rounded-md border border-input bg-white text-sm shadow-sm hover:bg-gray-50 transition-colors">
                        <Upload size={14} className="text-gray-500" />
                        <span className="text-gray-700">Vybrat soubor</span>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            className="sr-only"
                            onChange={e => setFile(e.target.files?.[0] ?? null)}
                        />
                    </label>

                    {/* Mobilní kamera — otevře přímo fotoaparát */}
                    <label className="flex items-center gap-1.5 cursor-pointer h-9 px-3 rounded-md border border-input bg-white text-sm shadow-sm hover:bg-gray-50 transition-colors sm:hidden">
                        <ImageIcon size={14} className="text-gray-500" />
                        <span className="text-gray-700">Vyfoť</span>
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="sr-only"
                            onChange={e => setFile(e.target.files?.[0] ?? null)}
                        />
                    </label>

                    {file && (
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                            <Paperclip size={12} />
                            {file.name}
                            <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                className="text-gray-400 hover:text-gray-600 ml-0.5">×</button>
                        </span>
                    )}
                </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button type="submit" disabled={uploading} size="sm"
                className="bg-[#327600] hover:bg-[#2a6400] text-white">
                {uploading ? "Ukládám…" : "Přidat doklad"}
            </Button>
        </form>
    );
}

// ── Expense row ───────────────────────────────────────────────────────────────

function ExpenseItem({ expense, eventId, onDeleted }: {
    expense: EventExpenseRow;
    eventId: number;
    onDeleted: () => void;
}) {
    const [deleting, setDeleting] = useState(false);

    async function handleDelete() {
        if (!confirm("Smazat tento doklad?")) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/events/${eventId}/expenses`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expenseId: expense.id }),
            });
            if (!res.ok) {
                const d = await res.json();
                alert(d.error ?? "Chyba smazání");
                return;
            }
            onDeleted();
        } finally {
            setDeleting(false);
        }
    }

    const categoryLabel = EXPENSE_CATEGORY_LABELS[expense.purposeCategory] ?? expense.purposeCategory;

    return (
        <div className="flex items-start gap-3 py-3 border-b last:border-0">
            {/* Ikona souboru */}
            <div className="mt-0.5 shrink-0 text-gray-400">
                {expense.fileUrl
                    ? (isImage(expense.fileMime)
                        ? <ImageIcon size={16} className="text-blue-400" />
                        : <FileText size={16} className="text-red-400" />)
                    : <Paperclip size={16} />
                }
            </div>

            {/* Obsah */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 tabular-nums">
                        {fmtAmount(expense.amount)}
                    </span>
                    <span className="text-[11px] text-gray-500 border border-gray-200 rounded px-1.5 py-px bg-gray-50 shrink-0">
                        {categoryLabel}
                    </span>
                </div>
                <p className="text-sm text-gray-700 mt-0.5">{expense.purposeText}</p>
                {expense.fileUrl && (
                    <a href={`/api/blob-file?url=${encodeURIComponent(expense.fileUrl)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-0.5 block truncate">
                        {expense.fileName ?? "Příloha"}
                    </a>
                )}
                <p className="text-xs text-gray-400 mt-1">{fmtDate(expense.createdAt)}</p>
            </div>

            {/* Smazat */}
            <button onClick={handleDelete} disabled={deleting}
                className="shrink-0 text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors mt-0.5"
                title="Smazat doklad">
                <Trash2 size={15} />
            </button>
        </div>
    );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function EventExpensesTab({ eventId }: { eventId: number }) {
    const [expenses, setExpenses] = useState<EventExpenseRow[] | null>(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await getEventExpenses(eventId);
            setExpenses(rows);
            setError(null);
        } catch {
            setError("Nepodařilo se načíst doklady");
        } finally {
            setLoading(false);
        }
    }, [eventId]);

    useEffect(() => { load(); }, [load]);

    const total = expenses?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;

    return (
        <div className="space-y-4">
            <AddExpenseForm eventId={eventId} onAdded={load} />

            {loading && <p className="text-sm text-gray-400 py-4 text-center">Načítám doklady…</p>}
            {error   && <p className="text-sm text-red-500 py-4">{error}</p>}

            {!loading && expenses !== null && (
                <>
                    {expenses.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">Žádné doklady</p>
                    ) : (
                        <div className="rounded-xl border bg-white px-4">
                            {expenses.map(e => (
                                <ExpenseItem
                                    key={e.id}
                                    expense={e}
                                    eventId={eventId}
                                    onDeleted={load}
                                />
                            ))}
                        </div>
                    )}

                    {expenses.length > 0 && (
                        <div className="flex items-center justify-between px-1 text-sm">
                            <span className="text-gray-500">
                                Celkem {expenses.length} {expenses.length === 1 ? "doklad" : expenses.length < 5 ? "doklady" : "dokladů"}
                            </span>
                            <span className="font-semibold text-gray-900 tabular-nums">
                                {new Intl.NumberFormat("cs-CZ").format(total)} Kč
                            </span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
