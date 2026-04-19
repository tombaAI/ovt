import { cookies } from "next/headers";

export const AVAILABLE_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020] as const;
export const YEAR_COOKIE = "ovt-year";

export async function getSelectedYear(): Promise<number> {
    const store = await cookies();
    const val = store.get(YEAR_COOKIE)?.value;
    const parsed = val ? parseInt(val, 10) : NaN;
    const currentYear = new Date().getFullYear();
    return (AVAILABLE_YEARS as readonly number[]).includes(parsed) ? parsed : currentYear;
}
