import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { importMembersTjBohemians } from "@/db/schema";
import { isWebhookAuthorized, unauthorizedResponse } from "@/app/api/webhooks/_auth";

export const dynamic = "force-dynamic";

interface PaRow {
    csk?:           string | null;
    jmeno?:         string | null;
    prijmeni?:      string | null;
    email?:         string | null;
    telefon?:       string | null;
    // Citlivá pole zasílaná zakódovaně (substituce + vrstvené base64)
    key?:           string | null;  // rodné číslo
    hash?:          string | null;  // datum narození
    gender?:        string | null;
    adresa?:        string | null;
    obec?:          string | null;
    psc?:           string | null;
    radek_odeslan?: string | null;
}

// ── Dekódování citlivých polí ─────────────────────────────────────────────────
// PA pipeline (4 vrstvy):
//   1. subst číslic/separátoru → písmena
//   2. base64
//   3. subst base64 speciálních znaků: = → J, + → K, / → M
//   4. base64
// Zde dekódujeme v opačném pořadí.

const MIDDLE_REVERSE: Record<string, string> = { J: '=', K: '+', M: '/' };

const RC_REVERSE: Record<string, string> = {
    N:'0', P:'1', R:'2', S:'3', T:'4', V:'5', W:'6', X:'7', Y:'8', Z:'9', Q:'/',
};
const DATE_REVERSE: Record<string, string> = {
    N:'0', P:'1', R:'2', S:'3', T:'4', V:'5', W:'6', X:'7', Y:'8', Z:'9', L:'-',
};

function reverseSubst(s: string, map: Record<string, string>): string {
    return s.split("").map(c => map[c] ?? c).join("");
}

function decodeField(encoded: string, finalMap: Record<string, string>): string | null {
    try {
        const midObf   = Buffer.from(encoded, "base64").toString("utf8");
        const innerB64 = reverseSubst(midObf, MIDDLE_REVERSE);
        const digitObf = Buffer.from(innerB64, "base64").toString("utf8");
        return reverseSubst(digitObf, finalMap);
    } catch { return null; }
}

const decodeKey  = (v: string) => decodeField(v, RC_REVERSE);
const decodeHash = (v: string) => decodeField(v, DATE_REVERSE);

// "Filip (Pilín)" → { jmeno: "Filip", nickname: "Pilín" }
function parseNickname(jmeno: string): { jmeno: string; nickname: string | null } {
    const match = jmeno.match(/^(.+?)\s*\((.+?)\)(.*)?$/);
    if (match) return { jmeno: (match[1] + (match[3] ?? "")).trim(), nickname: match[2].trim() };
    return { jmeno: jmeno.trim(), nickname: null };
}

// Excel serial nebo ISO string → "YYYY-MM-DD" nebo null
function parseDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const num = Number(value);
    if (!isNaN(num) && num > 1000) {
        return new Date((num - 25569) * 86400 * 1000).toISOString().split("T")[0];
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

async function upsertRows(rows: PaRow[]): Promise<{ upserted: number; skipped: number }> {
    const db = getDb();
    let upserted = 0, skipped = 0;

    for (const row of rows) {
        const csk = row.csk?.trim() || null;
        if (!csk) { skipped++; continue; }

        const { jmeno, nickname } = parseNickname(row.jmeno ?? "");
        const addressParts = [row.adresa, row.obec, row.psc].filter(Boolean);

        const birthNumber = row.key  ? decodeKey(row.key)   : null;
        const birthDate   = row.hash ? parseDate(decodeHash(row.hash) ?? undefined) : null;

        await db.insert(importMembersTjBohemians).values({
            cskNumber:    csk,
            jmeno,
            prijmeni:     row.prijmeni?.trim()    || null,
            nickname,
            email:        row.email?.trim()        || null,
            phone:        row.telefon?.trim()      || null,
            birthDate,
            birthNumber,
            gender:       row.gender?.trim()       || null,
            address:      addressParts.length > 0 ? addressParts.join(", ") : null,
            radekOdeslan: parseDate(row.radek_odeslan),
            syncedAt:     new Date(),
        }).onConflictDoUpdate({
            target: importMembersTjBohemians.cskNumber,
            set: {
                jmeno,
                prijmeni:     row.prijmeni?.trim()    || null,
                nickname,
                email:        row.email?.trim()        || null,
                phone:        row.telefon?.trim()      || null,
                birthDate,
                birthNumber,
                gender:       row.gender?.trim()       || null,
                address:      addressParts.length > 0 ? addressParts.join(", ") : null,
                radekOdeslan: parseDate(row.radek_odeslan),
                syncedAt:     new Date(),
            },
        });
        upserted++;
    }

    return { upserted, skipped };
}

export async function POST(request: NextRequest) {
    if (!isWebhookAuthorized(request, "IMPORT_SECRET_TJ")) {
        console.warn("[webhook/import_members_tj_bohemians] Unauthorized from", request.headers.get("x-forwarded-for") ?? "unknown");
        return unauthorizedResponse();
    }

    let rows: PaRow[];
    try {
        rows = await request.json();
        if (!Array.isArray(rows)) throw new Error("Očekáváno pole");
    } catch (err) {
        console.error("[webhook/tj-members] Invalid payload:", err);
        return NextResponse.json({ ok: false, error: "Neplatný JSON" }, { status: 400 });
    }

    try {
        const result = await upsertRows(rows);
        console.log(`[webhook/tj-members] OK — total=${rows.length} upserted=${result.upserted} skipped=${result.skipped}`);
        return NextResponse.json({ ok: true, total: rows.length, ...result });
    } catch (err) {
        console.error("[webhook/tj-members] Upsert failed:", err);
        return NextResponse.json({ ok: false, error: "Chyba při ukládání dat" }, { status: 500 });
    }
}
