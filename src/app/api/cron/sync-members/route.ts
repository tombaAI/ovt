import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { tjMembers } from "@/db/schema";

export const dynamic = "force-dynamic";

interface PaRow {
    csk?:          string | null;
    jmeno?:        string | null;
    prijmeni?:     string | null;
    email?:        string | null;
    telefon?:      string | null;
    datum_naroz?:  string | null;
    rc?:           string | null;
    gender?:       string | null;
    adresa?:       string | null;
    obec?:         string | null;
    psc?:          string | null;
    radek_odeslan?: string | null;
}

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

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return true;
    return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function upsertRows(rows: PaRow[]): Promise<{ upserted: number; skipped: number }> {
    const db = getDb();
    let upserted = 0, skipped = 0;

    for (const row of rows) {
        const csk = row.csk?.trim() || null;
        if (!csk) { skipped++; continue; }

        const { jmeno, nickname } = parseNickname(row.jmeno ?? "");
        const addressParts = [row.adresa, row.obec, row.psc].filter(Boolean);

        await db.insert(tjMembers).values({
            cskNumber:    csk,
            jmeno,
            prijmeni:     row.prijmeni?.trim() || null,
            nickname,
            email:        row.email?.trim()    || null,
            phone:        row.telefon?.trim()  || null,
            birthDate:    parseDate(row.datum_naroz),
            birthNumber:  row.rc?.trim()       || null,
            gender:       row.gender?.trim()   || null,
            address:      addressParts.length > 0 ? addressParts.join(", ") : null,
            radekOdeslan: parseDate(row.radek_odeslan),
            syncedAt:     new Date(),
        }).onConflictDoUpdate({
            target: tjMembers.cskNumber,
            set: {
                jmeno,
                prijmeni:     row.prijmeni?.trim() || null,
                nickname,
                email:        row.email?.trim()    || null,
                phone:        row.telefon?.trim()  || null,
                birthDate:    parseDate(row.datum_naroz),
                birthNumber:  row.rc?.trim()       || null,
                gender:       row.gender?.trim()   || null,
                address:      addressParts.length > 0 ? addressParts.join(", ") : null,
                radekOdeslan: parseDate(row.radek_odeslan),
                syncedAt:     new Date(),
            },
        });
        upserted++;
    }

    return { upserted, skipped };
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = process.env.GITHUB_SYNC_TOKEN;
    const repo  = process.env.GITHUB_SYNC_REPO;
    if (!token || !repo) {
        return NextResponse.json({ ok: false, error: "GITHUB_SYNC_TOKEN nebo GITHUB_SYNC_REPO není nastaveno" }, { status: 500 });
    }

    const res = await fetch(
        `https://api.github.com/repos/${repo}/contents/sync/members.json`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }, cache: "no-store" }
    );

    if (res.status === 404) return NextResponse.json({ ok: true, message: "sync/members.json ještě neexistuje", upserted: 0 });
    if (!res.ok) return NextResponse.json({ ok: false, error: `GitHub API chyba: ${res.status}` }, { status: 500 });

    const data = await res.json();
    const rows: PaRow[] = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
    const result = await upsertRows(rows);
    return NextResponse.json({ ok: true, total: rows.length, ...result });
}

export async function POST(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let rows: PaRow[];
    try {
        rows = await request.json();
        if (!Array.isArray(rows)) throw new Error("Očekáváno pole");
    } catch {
        return NextResponse.json({ ok: false, error: "Neplatný JSON" }, { status: 400 });
    }

    const result = await upsertRows(rows);
    return NextResponse.json({ ok: true, total: rows.length, ...result });
}
