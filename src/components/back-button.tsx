"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { peekNavStack, popNavStack } from "@/lib/nav-stack";
import type { NavStackEntry } from "@/lib/nav-stack";

export function BackButton() {
    const [entry, setEntry] = useState<NavStackEntry | null>(null);
    const router = useRouter();

    useEffect(() => {
        setEntry(peekNavStack());
    }, []);

    if (!entry) return null;

    function handleBack() {
        const e = popNavStack();
        if (e) router.push(e.url);
    }

    return (
        <button
            onClick={handleBack}
            className="flex items-center gap-0.5 text-sm text-gray-500 hover:text-gray-900 transition-colors min-w-0"
        >
            <ChevronLeft size={16} className="shrink-0" />
            <span className="truncate max-w-[220px]">{entry.label}</span>
        </button>
    );
}
