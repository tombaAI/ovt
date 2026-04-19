"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function setYear(year: number) {
    const store = await cookies();
    // Session cookie — smaže se při zavření browseru, takže příště vždy aktuální rok
    store.set("ovt-year", String(year), { path: "/", sameSite: "lax" });
    revalidatePath("/dashboard", "layout");
}
