"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { setYear } from "@/lib/actions/year";
import { AVAILABLE_YEARS } from "@/lib/year";

export function YearSelector({ year }: { year: number }) {
    const router = useRouter();
    const pathname = usePathname();
    const [optimisticYear, setOptimisticYear] = useState(year);
    const [pending, setPending] = useState(false);

    // Po dokončení navigace synchronizuj hodnotu ze serveru
    useEffect(() => {
        setOptimisticYear(year);
        setPending(false);
    }, [year]);

    async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const newYear = Number(e.target.value);
        setOptimisticYear(newYear);
        setPending(true);
        await setYear(newYear);
        router.push(pathname);
    }

    return (
        <div className="relative flex items-center">
            <select
                value={optimisticYear}
                onChange={handleChange}
                disabled={pending}
                className="appearance-none bg-white/10 hover:bg-white/15 text-white text-xs pl-2.5 pr-6 py-1 rounded border border-white/20 cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-[#82b965] transition-colors"
            >
                {[...AVAILABLE_YEARS].map(y => (
                    <option key={y} value={y} className="bg-[#26272b] text-white">{y}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-1.5 w-3 h-3 text-white/60 pointer-events-none" />
        </div>
    );
}
