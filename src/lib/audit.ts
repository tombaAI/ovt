/**
 * Sdílené utility pro audit "zablokovaných pokusů" (uživatel dostal stopku).
 *
 * Dřív byly privátní jen v event-settlement.ts; vytaženo sem, protože je poprvé potřebuje
 * volat i kód mimo server actions — API routy pro náklady (expenses/attach-file/reanalyze),
 * které při zamčené akci vrací 409. Blocked záznam má přesně daný, opakovaný tvar
 * (entityType, action: "blocked", metadata.attemptedAction/reason), takže sdílení brání
 * rozjetí formátu napříč endpointy. Viz docs/adr/0002-event-audit-log-scope-and-reconstructability.md.
 *
 * Není to server action ("use server") — exportuje třídu (BlockedError) a typy, což by
 * "use server" soubor nedovolil. Je to běžný lib helper volaný ze server kontextů.
 */

import { getDb } from "@/lib/db";
import { auditLog } from "@/db/schema";

/** Neúspěšný pokus — uživatel dostal stopku (např. úprava uzamčené akce). */
export type BlockedAttempt = {
    attemptedAction: string;
    eventId?: number;
    registrationId?: number;
    expenseId?: number;
    participantId?: number;
    memberId?: number | null;
};

/**
 * Zaloguje NEÚSPĚŠNÝ pokus o akci. Audit tak zachytí i to, co uživatelé chtěli udělat, ale
 * systém jim to nedovolil — abychom na to mohli reagovat. action = "blocked",
 * metadata.attemptedAction = co se pokoušeli udělat, changes.reason = proč to neprošlo.
 *
 * entityType/entityId se volí podle nejužšího dotčeného subjektu: přihláška > náklad > akce.
 */
export async function logBlockedAttempt(
    db: ReturnType<typeof getDb>,
    opts: BlockedAttempt & { reason: string; changedBy: string },
): Promise<void> {
    try {
        await db.insert(auditLog).values({
            entityType: opts.registrationId != null ? "event_registration"
                : opts.expenseId != null ? "event_expense"
                : "event",
            entityId: opts.registrationId ?? opts.expenseId ?? opts.eventId ?? 0,
            action: "blocked",
            changes: { reason: { old: null, new: opts.reason } },
            metadata: { blocked: true, attemptedAction: opts.attemptedAction, eventId: opts.eventId, registrationId: opts.registrationId, expenseId: opts.expenseId, participantId: opts.participantId, memberId: opts.memberId },
            changedBy: opts.changedBy,
        });
    } catch (e) {
        // Audit blokace nesmí shodit samotnou (už tak odmítnutou) akci.
        console.error("[logBlockedAttempt]", e);
    }
}

/**
 * Stopka uvnitř transakce. Vyhozením se transakce vrátí (rollback), proto se neloguje hned —
 * zaloguje se až v catch přes blockedOrError (mimo rollback, samostatným zápisem).
 */
export class BlockedError extends Error {
    attempt: BlockedAttempt;
    constructor(message: string, attempt: BlockedAttempt) {
        super(message);
        this.name = "BlockedError";
        this.attempt = attempt;
    }
}

/** V catch: BlockedError = vědomá stopka → zaloguj a vrať její hlášku; jinak běžná chyba s fallbackem. */
export async function blockedOrError(e: unknown, db: ReturnType<typeof getDb>, changedBy: string, fallback: string): Promise<{ error: string }> {
    if (e instanceof BlockedError) {
        await logBlockedAttempt(db, { ...e.attempt, reason: e.message, changedBy });
        return { error: e.message };
    }
    return { error: e instanceof Error ? e.message : fallback };
}
