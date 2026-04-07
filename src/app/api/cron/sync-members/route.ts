import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { members } from "@/db/schema";

export const dynamic = "force-dynamic";

interface SyncMember {
    csk:             string;
    jmeno:           string;
    prijmeni:        string;
    email?:          string;
    telefon?:        string;
    datum_narozeni?: string;
    rodne_cislo?:    string;
    pohlavi?:        string;
    adresa?:         string;
}

interface SyncResult {
    total:    number;
    updated:  number;
    notFound: number;
    skipped:  number;
}

// "Filip (Pilín)" → { firstName: "Filip", nickname: "Pilín" }
function parseNameAndNickname(jmeno: string): { firstName: string; nickname: string | null } {
    const match = jmeno.match(/^(.+?)\s*\((.+?)\)(.*)?$/);
    if (match) {
        return { firstName: (match[1] + (match[3] ?? "")).trim(), nickname: match[2].trim() };
    }
    return { firstName: jmeno.trim(), nickname: null };
}

// Excel serial date (např. "36728") nebo ISO string → "YYYY-MM-DD" nebo null
function parseExcelDate(value: string | undefined): string | null {
    if (!value) return null;
    const num = Number(value);
    if (!isNaN(num) && num > 1000) {
        return new Date((num - 25569) * 86400 * 1000).toISOString().split("T")[0];
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

async function upsertMembers(rows: SyncMember[]): Promise<SyncResult> {
    const db = getDb();
    let updated = 0, notFound = 0, skipped = 0;

    for (const row of rows) {
        const cskNumber = row.csk?.trim() || null;
        if (!cskNumber) { skipped++; continue; }

        const { firstName, nickname } = parseNameAndNickname(row.jmeno ?? "");
        const fullName = [firstName, row.prijmeni].filter(Boolean).join(" ").trim();
        if (!fullName) { skipped++; continue; }

        const existing = await db
            .select({ id: members.id })
            .from(members)
            .where(eq(members.cskNumber, cskNumber))
            .limit(1);

        if (existing.length === 0) { notFound++; continue; }

        await db.update(members)
            .set({
                fullName,
                nickname:    nickname ?? undefined,
                email:       row.email    || null,
                phone:       row.telefon  || null,
                birthDate:   parseExcelDate(row.datum_narozeni),
                birthNumber: row.rodne_cislo  || null,
                gender:      row.pohlavi      || null,
                address:     row.adresa       || null,
                updatedAt:   new Date(),
            })
            .where(eq(members.cskNumber, cskNumber));
        updated++;
    }

    return { total: rows.length, updated, notFound, skipped };
}

function isAuthorized(request: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return true;
    return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// Vercel cron — čte soubor z GitHub a spustí upsert
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

    if (res.status === 404) {
        return NextResponse.json({ ok: true, message: "sync/members.json ještě neexistuje", total: 0 });
    }
    if (!res.ok) {
        return NextResponse.json({ ok: false, error: `GitHub API chyba: ${res.status}` }, { status: 500 });
    }

    const data    = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    const rows: SyncMember[] = JSON.parse(content);

    const result = await upsertMembers(rows);
    return NextResponse.json({ ok: true, ...result });
}

// GitHub Actions → POST s polem členů přímo v body
export async function POST(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let rows: SyncMember[];
    try {
        rows = await request.json();
        if (!Array.isArray(rows)) throw new Error("Očekáváno pole");
    } catch {
        return NextResponse.json({ ok: false, error: "Neplatný JSON" }, { status: 400 });
    }

    const result = await upsertMembers(rows);
    return NextResponse.json({ ok: true, ...result });
}
