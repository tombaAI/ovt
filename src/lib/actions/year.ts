"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { AVAILABLE_YEARS, YEAR_COOKIE } from "@/lib/year";

export async function getSelectedYear(): Promise<number> {
    const store = await cookies();
    const val = store.get(YEAR_COOKIE)?.value;
    const parsed = val ? parseInt(val, 10) : NaN;
    const currentYear = new Date().getFullYear();
    return (AVAILABLE_YEARS as readonly number[]).includes(parsed) ? parsed : currentYear;
}

export async function setYear(year: number) {
    const store = await cookies();
    store.set(YEAR_COOKIE, String(year), { path: "/", sameSite: "lax" });
    revalidatePath("/dashboard", "layout");
}
