"use client";

import { useState } from "react";

interface Props {
    label: string;
    value: string | null;
    type?: "text" | "email" | "tel" | "number" | "date";
    placeholder?: string;
    fieldId: string;
    activeField: string | null;
    onActiveFieldChange: (fieldId: string | null) => void;
    onSave: (value: string) => Promise<{ error?: string } | { success: true }>;
}

function fmtDate(iso: string) {
    // "2025-06-01" → "1. 6. 2025"
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
}

export function InlineField({ label, value, type = "text", placeholder, fieldId, activeField, onActiveFieldChange, onSave }: Props) {
    const editing = activeField === fieldId;
    const [draft, setDraft]   = useState(value ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState<string | null>(null);

    const displayValue = type === "date" && value ? fmtDate(value) : value;

    function startEdit() {
        setDraft(value ?? "");
        setError(null);
        onActiveFieldChange(fieldId);
    }

    async function handleSave() {
        setSaving(true);
        const result = await onSave(draft);
        setSaving(false);
        if ("error" in result) {
            setError(result.error ?? "Chyba");
        } else {
            onActiveFieldChange(null);
            setError(null);
        }
    }

    function handleCancel() {
        onActiveFieldChange(null);
        setDraft(value ?? "");
        setError(null);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") handleCancel();
    }

    return (
        <div className="border-b last:border-0 py-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:gap-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide sm:w-36 sm:pt-1 shrink-0 mb-1 sm:mb-0">
                    {label}
                </p>

                {editing ? (
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <input
                                autoFocus
                                type={type}
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={placeholder}
                                className="flex-1 min-w-0 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#327600]/40 focus:border-[#327600]"
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
                        disabled={activeField !== null}
                        className="flex-1 text-left text-sm rounded-md px-1 -mx-1 py-0.5 hover:bg-blue-50 transition-colors group disabled:cursor-default disabled:hover:bg-transparent"
                    >
                        {displayValue
                            ? <span className="text-gray-900 group-hover:text-blue-700 group-disabled:group-hover:text-gray-900">{displayValue}</span>
                            : <span className="text-gray-400 italic group-hover:text-blue-500 group-disabled:group-hover:text-gray-400">{placeholder ?? "(nezadáno)"}</span>
                        }
                    </button>
                )}
            </div>
        </div>
    );
}
