import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { members, tjMembers } from "@/db/schema";
import { SyncClient } from "./sync-client";
import type { SyncUpdatableField } from "@/lib/actions/sync";
import { SYNC_UPDATABLE_FIELDS } from "@/lib/actions/sync";

export const dynamic = "force-dynamic";

// ── Typy předávané do klienta ─────────────────────────────────────────────────

export type UnmatchedRow = {
    tjId:         number;
    cskNumber:    string | null;
    jmeno:        string | null;
    prijmeni:     string | null;
    email:        string | null;
    phone:        string | null;
    radekOdeslan: string | null;
    syncedAt:     string;
};

export type FieldDiff = {
    field:    SyncUpdatableField;
    label:    string;
    ourValue: string | null;
    tjValue:  string | null;
};

export type MatchedRow = {
    memberId:   number;
    fullName:   string;
    cskNumber:  string;
    diffs:      FieldDiff[];
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

function computeDiffs(tj: typeof tjMembers.$inferSelect, m: typeof members.$inferSelect): FieldDiff[] {
    const comparisons: Array<[SyncUpdatableField, unknown, unknown]> = [
        ["email",       tj.email,       m.email],
        ["phone",       tj.phone,       m.phone],
        ["address",     tj.address,     m.address],
        ["birthDate",   tj.birthDate,   m.birthDate],
        ["birthNumber", tj.birthNumber, m.birthNumber],
        ["gender",      tj.gender,      m.gender],
        ["nickname",    tj.nickname,    m.nickname],
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

    // 1. Nespárovaní: v TJ, ale ne v naší DB (žádný member se stejným CSK)
    const tjAll = await db.select().from(tjMembers).orderBy(tjMembers.prijmeni);
    const membersAll = await db.select().from(members);

    const memberByCsk = new Map(
        membersAll.filter(m => m.cskNumber).map(m => [m.cskNumber!, m])
    );

    const unmatched: UnmatchedRow[] = tjAll
        .filter(tj => tj.cskNumber && !memberByCsk.has(tj.cskNumber))
        .map(tj => ({
            tjId:         tj.id,
            cskNumber:    tj.cskNumber,
            jmeno:        tj.jmeno,
            prijmeni:     tj.prijmeni,
            email:        tj.email,
            phone:        tj.phone,
            radekOdeslan: tj.radekOdeslan as unknown as string | null,
            syncedAt:     (tj.syncedAt as unknown as Date).toISOString(),
        }));

    // 2. Spárovaní s rozdíly
    const matched: MatchedRow[] = [];
    for (const tj of tjAll) {
        if (!tj.cskNumber) continue;
        const m = memberByCsk.get(tj.cskNumber);
        if (!m) continue;
        const diffs = computeDiffs(tj, m);
        if (diffs.length > 0) {
            matched.push({ memberId: m.id, fullName: m.fullName, cskNumber: tj.cskNumber, diffs });
        }
    }
    matched.sort((a, b) => a.fullName.localeCompare(b.fullName, "cs"));

    // 3. Jen v naší DB (mají CSK, ale v tj_members není)
    const tjCskSet = new Set(tjAll.map(tj => tj.cskNumber).filter(Boolean));
    const onlyOurs: OnlyOursRow[] = membersAll
        .filter(m => m.cskNumber && !tjCskSet.has(m.cskNumber))
        .map(m => ({ id: m.id, fullName: m.fullName, cskNumber: m.cskNumber! }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "cs"));

    // Čas posledního syncu
    const [lastSync] = await db.select({ at: sql<string>`max(synced_at)` }).from(tjMembers);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Synchronizace TJ Bohemians</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Zdroj: Excel vodTuristika_database.xlsx — {tjAll.length} záznamů
                        {lastSync.at && (
                            <span> · poslední sync {new Date(lastSync.at).toLocaleString("cs-CZ")}</span>
                        )}
                    </p>
                </div>
            </div>

            <SyncClient
                unmatched={unmatched}
                matched={matched}
                onlyOurs={onlyOurs}
            />
        </div>
    );
}
