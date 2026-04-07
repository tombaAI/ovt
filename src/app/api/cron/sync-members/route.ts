import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { members } from "@/db/schema";

export const dynamic = "force-dynamic";

interface SyncMember {
    csk: string;
    jmeno: string;
    prijmeni: string;
    email: string;
    telefon: string;
}

async function fetchSyncMembers(): Promise<SyncMember[]> {
    const token = process.env.GITHUB_SYNC_TOKEN;
    const repo = process.env.GITHUB_SYNC_REPO; // format: "owner/ovt-sync"

    if (!token || !repo) throw new Error("GITHUB_SYNC_TOKEN nebo GITHUB_SYNC_REPO není nastaveno");

    const res = await fetch(
        `https://api.github.com/repos/${repo}/contents/sync/members.json`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
            cache: "no-store",
        }
    );

    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub API chyba: ${res.status}`);

    const data = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return JSON.parse(content);
}

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
        const auth = request.headers.get("authorization");
        if (auth !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    let syncData: SyncMember[];
    try {
        syncData = await fetchSyncMembers();
    } catch (err) {
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }

    if (syncData.length === 0) {
        return NextResponse.json({ ok: true, message: "Žádná sync data (soubor neexistuje nebo je prázdný)", total: 0 });
    }

    let updated = 0, inserted = 0, skipped = 0;

    for (const row of syncData) {
        const cskNumber = row.csk ? parseInt(row.csk) : null;
        if (!cskNumber || isNaN(cskNumber)) { skipped++; continue; }

        const fullName = [row.jmeno, row.prijmeni].filter(Boolean).join(" ").trim();
        if (!fullName) { skipped++; continue; }

        const db = getDb();
        const existing = await db
            .select({ id: members.id })
            .from(members)
            .where(eq(members.cskNumber, cskNumber))
            .limit(1);

        if (existing.length > 0) {
            await db
                .update(members)
                .set({
                    fullName,
                    email: row.email || null,
                    phone: row.telefon || null,
                    updatedAt: new Date(),
                })
                .where(eq(members.cskNumber, cskNumber));
            updated++;
        } else {
            await db.insert(members).values({
                id: cskNumber,
                fullName,
                email: row.email || null,
                phone: row.telefon || null,
                cskNumber,
                memberFrom: new Date().toISOString().split("T")[0],
            });
            inserted++;
        }
    }

    return NextResponse.json({ ok: true, total: syncData.length, updated, inserted, skipped });
}
