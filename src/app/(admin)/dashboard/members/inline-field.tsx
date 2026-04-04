"use client";

import { useState, useRef } from "react";

interface Props {
    label: string;
    value: string | null;
    type?: "text" | "email" | "tel" | "number";
    placeholder?: string;
    onSave: (value: string) => Promise<{ error?: string } | { success: true }>;
}

export function InlineField({ label, value, type = "text", placeholder, onSave }: Props) {
    const [editing, setEditing]   = useState(false);
    const [draft, setDraft]       = useState(value ?? "");
    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState<string | null>(null);
    const inputRef                = useRef<HTMLInputElement>(null);

    function startEdit() {
        setDraft(value ?? "");
        setError(null);
        setEditing(true);
        // autofocus handled by autoFocus prop below
    }

    async function handleSave() {
        setSaving(true);
        const result = await onSave(draft);
        setSaving(false);
        if ("error" in result) {
            setError(result.error ?? "Chyba");
        } else {
            setEditing(false);
            setError(null);
        }
    }

    function handleCancel() {
        setEditing(false);
        setDraft(value ?? "");
        setError(null);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") handleCancel();
    }

    return (
        <div className="border-b last:border-0 py-3">
            {/* Mobile: stacked | sm+: side-by-side */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:gap-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide sm:w-36 sm:pt-1 shrink-0 mb-1 sm:mb-0">
                    {label}
                </p>

                {editing ? (
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                autoFocus
                                type={type}
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={placeholder}
                                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#327600]/40 focus:border-[#327600]"
                            />
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-8 h-8 flex items-center justify-center rounded-md bg-[#327600] text-white hover:bg-[#2a6400] disabled:opacity-50 shrink-0"
                                title="Uložit (Enter)"
                            >
                                ✓
                            </button>
                            <button
                                onClick={handleCancel}
                                className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-100 shrink-0"
                                title="Zrušit (Esc)"
                            >
                                ✕
                            </button>
                        </div>
                        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
                    </div>
                ) : (
                    <button
                        onClick={startEdit}
                        className="flex-1 text-left text-sm rounded-md px-1 -mx-1 py-0.5 hover:bg-blue-50 transition-colors group"
                    >
                        {value
                            ? <span className="text-gray-900 group-hover:text-blue-700">{value}</span>
                            : <span className="text-gray-400 italic group-hover:text-blue-500">{placeholder ?? "(nezadáno)"}</span>
                        }
                    </button>
                )}
            </div>
        </div>
    );
}
