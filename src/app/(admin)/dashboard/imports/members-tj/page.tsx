import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { members, importMembersTjBohemians } from "@/db/schema";
import { MembersTjClient } from "./members-tj-client";
import type { SyncUpdatableField } from "@/lib/sync-config";
import { SYNC_UPDATABLE_FIELDS } from "@/lib/sync-config";

export const dynamic = "force-dynamic";

// ── Typy předávané do klienta ─────────────────────────────────────────────────

export type UnmatchedRow = {
    tjId:           number;
    cskNumber:      string | null;
    jmeno:          string | null;
    prijmeni:       string | null;
    email:          string | null;
    phone:          string | null;
    radekOdeslan:   string | null;
    syncedAt:       string;
    matchedByName:  boolean;  // true = napárováno přes jméno (bez ČSK)
};

export type FieldDiff = {
    field:    SyncUpdatableField;
    label:    string;
    ourValue: string | null;
    tjValue:  string | null;
};

export type MatchedRow = {
    memberId:      number;
    fullName:      string;
    cskNumber:     string | null;
    matchedByName: boolean;
    diffs:         FieldDiff[];
};

export type OnlyOursRow = {
    id:        number;
    fullName:  string;
    cskNumber: string;
};

// ── Pomocná funkce pro diff ───────────────────────────────────────────────────

function asStr(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    return String(v);
}

function computeDiffs(tj: typeof importMembersTjBohemians.$inferSelect, m: typeof members.$inferSelect): FieldDiff[] {
    const comparisons: Array<[SyncUpdatableField, unknown, unknown]> = [
        ["email",       tj.email,       m.email],
        ["phone",       tj.phone,       m.phone],
        ["address",     tj.address,     m.address],
        ["birthDate",   tj.birthDate,   m.birthDate],
        ["birthNumber", tj.birthNumber, m.birthNumber],
        ["gender",      tj.gender,      m.gender],
        ["nickname",    tj.nickname,    m.nickname],
        ["cskNumber",   tj.cskNumber,   m.cskNumber],
        ["fullName",    [tj.jmeno, tj.prijmeni].filter(Boolean).join(" ").trim() || null, m.fullName],
    ];

    return comparisons
        .filter(([, tjVal, mVal]) => asStr(tjVal) !== asStr(mVal))
        .map(([field, tjVal, mVal]) => ({
            field,
            label:    SYNC_UPDATABLE_FIELDS[field],
            ourValue: asStr(mVal),
            tjValue:  asStr(tjVal),
        }));
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SyncPage() {
    const db = getDb();

    const tjAll = await db.select().from(importMembersTjBohemians).orderBy(importMembersTjBohemians.prijmeni);
    const membersAll = await db.select().from(members);

    const memberByCsk  = new Map(membersAll.filter(m => m.cskNumber).map(m => [m.cskNumber!, m]));
    const memberByName = new Map(membersAll.map(m => [m.fullName.trim().toLowerCase(), m]));

    // Pomocná funkce: najdi člena pro TJ záznam (CSK → jméno → null)
    function findMember(tj: typeof tjAll[number]): { member: typeof membersAll[number]; byName: boolean } | null {
        if (tj.cskNumber) {
            const m = memberByCsk.get(tj.cskNumber);
            if (m) return { member: m, byName: false };
        }
        const fullName = [tj.jmeno, tj.prijmeni].filter(Boolean).join(" ").trim().toLowerCase();
        if (fullName) {
            const m = memberByName.get(fullName);
            if (m) return { member: m, byName: true };
        }
        return null;
    }

    const unmatched: UnmatchedRow[] = [];
    const matched: MatchedRow[] = [];

    for (const tj of tjAll) {
        const found = findMember(tj);
        if (!found) {
            // Zcela nový – žádné ČSK ani shoda jménem
            unmatched.push({
                tjId:          tj.id,
                cskNumber:     tj.cskNumber,
                jmeno:         tj.jmeno,
                prijmeni:      tj.prijmeni,
                email:         tj.email,
                phone:         tj.phone,
                radekOdeslan:  tj.radekOdeslan as unknown as string | null,
                syncedAt:      (tj.syncedAt as unknown as Date).toISOString(),
                matchedByName: false,
            });
        } else {
            const diffs = computeDiffs(tj, found.member);
            if (diffs.length > 0) {
                matched.push({
                    memberId:      found.member.id,
                    fullName:      found.member.fullName,
                    cskNumber:     tj.cskNumber,
                    matchedByName: found.byName,
                    diffs,
                });
            }
        }
    }
    // Deduplikace: pokud dva TJ záznamy míří na stejného člena (typicky starý bez ČSK
    // a nový s ČSK), zachovej ten s ČSK (nebo ten s více diffs jako fallback)
    const matchedDeduped = new Map<number, MatchedRow>();
    for (const row of matched) {
        const existing = matchedDeduped.get(row.memberId);
        if (!existing || (!existing.cskNumber && row.cskNumber) || row.diffs.length > existing.diffs.length) {
            matchedDeduped.set(row.memberId, row);
        }
    }
    const matchedFinal = [...matchedDeduped.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, "cs"));

    // Jen v naší DB (mají CSK, ale v TJ importu není)
    const tjCskSet = new Set(tjAll.map(tj => tj.cskNumber).filter(Boolean));
    const onlyOurs: OnlyOursRow[] = membersAll
        .filter(m => m.cskNumber && !tjCskSet.has(m.cskNumber))
        .map(m => ({ id: m.id, fullName: m.fullName, cskNumber: m.cskNumber! }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "cs"));

    // Čas posledního syncu – Neon ukládá v UTC, převedeme na CET/CEST
    const [lastSync] = await db.select({ at: sql<string>`max(synced_at)` }).from(importMembersTjBohemians);
    const lastSyncStr = lastSync.at
        ? new Date(lastSync.at).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })
        : null;

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Synchronizace členů z TJ Bohemians</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Import probíhá automaticky po každé změně souboru vodTuristika_database.xlsx
                    v dokumentovém úložišti na SharePointu TJ Bohemians — změny se zde zobrazí do několika minut.
                    {lastSyncStr && <span> Poslední synchronizace: {lastSyncStr}.</span>}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                    Záznamy jsou párované podle čísla ČSK — je důležité, aby se čísla na obou stranách shodovala.
                    Záznamy bez ČSK jsou párovány podle jména a příjmení. Zobrazeno {tjAll.length} záznamů z TJ.
                </p>
            </div>

            <MembersTjClient
                unmatched={unmatched}
                matched={matchedFinal}
                onlyOurs={onlyOurs}
            />
        </div>
    );
}
