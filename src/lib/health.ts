import { getDb, hasDatabaseUrl } from "@/lib/db";
import { adminUsers } from "@/db/schema";
import { getEmailSettings } from "@/lib/email";

export type HealthResult = {
    ok: boolean;
    configured: boolean;
    detail: string;
};

export async function checkDatabase(): Promise<HealthResult> {
    if (!hasDatabaseUrl()) {
        return {
            ok: false,
            configured: false,
            detail: "DATABASE_URL není nastavená."
        };
    }
    try {
        const db = getDb();
        await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
        return {
            ok: true,
            configured: true,
            detail: "Připojeno, schéma v pořádku."
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        const detail = msg.includes("relation")
            ? "Připojeno, ale migrace ještě nebyla aplikovaná."
            : "Nepodařilo se připojit k databázi.";
        return { ok: false, configured: true, detail };
    }
}

export function checkEmail(): HealthResult {
    const settings = getEmailSettings();

    if (!settings.configured) {
        return {
            ok: false,
            configured: false,
            detail: "RESEND_API_KEY není nastavený. E-mail je deaktivován."
        };
    }

    return {
        ok: true,
        configured: true,
        detail:
            settings.mode === "custom"
                ? `Aktivní v produkčním režimu. Odesílatel: ${settings.from}`
                : "Aktivní v testovacím režimu (onboarding@resend.dev)."
    };
}
