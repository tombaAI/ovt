"use server";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { members, importProfiles, importHistory, auditLog } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { parseCsvBuffer, type ParseOptions } from "@/lib/import/parse-csv";
import { autoMapColumns } from "@/lib/import/map-columns";
import { computeDiff } from "@/lib/import/compute-diff";
import type {
    ParseResult, ColumnMapping, MatchKeyConfig, DiffResult,
    ImportableField,
} from "@/lib/import/types";
import { IMPORTABLE_FIELDS } from "@/lib/import/types";

// ── parseImportFile ───────────────────────────────────────────────────────────
// Přijme FormData se souborem, vrátí ParseResult + návrh mapování

export type ParseFileResult =
    | { error: string }
    | { data: ParseResult; suggestedMappings: ColumnMapping[]; filename: string };

export async function parseImportFile(formData: FormData): Promise<ParseFileResult> {
    await auth();

    const file = formData.get("file") as File | null;
    if (!file) return { error: "Soubor není přiložen" };
    if (file.size > 5 * 1024 * 1024) return { error: "Soubor je příliš velký (max 5 MB)" };

    const overrideEncoding = formData.get("encoding") as string | null;
    const overrideDelimiter = formData.get("delimiter") as string | null;
    const overrideHeaderRow = formData.get("header_row") ? Number(formData.get("header_row")) : undefined;

    try {
        const buf = Buffer.from(await file.arrayBuffer());
        const opts: ParseOptions = {};
        if (overrideEncoding === "utf-8" || overrideEncoding === "win-1250") opts.encoding = overrideEncoding;
        if (overrideDelimiter) opts.delimiter = overrideDelimiter;
        if (overrideHeaderRow !== undefined && !isNaN(overrideHeaderRow)) opts.headerRowIndex = overrideHeaderRow;

        const data = parseCsvBuffer(buf, opts);
        const suggestedMappings = autoMapColumns(data.columns);

        return { data, suggestedMappings, filename: file.name };
    } catch (e) {
        console.error("parseImportFile error:", e);
        return { error: "Nepodařilo se načíst soubor. Zkontrolujte formát." };
    }
}

// ── computeImportDiff ─────────────────────────────────────────────────────────
// Porovná parsované řádky s DB členy, vrátí DiffResult

export type ComputeDiffResult = { error: string } | { diff: DiffResult };

export async function computeImportDiff(
    rows: Record<string, string>[],
    mappings: ColumnMapping[],
    matchKeys: MatchKeyConfig[],
): Promise<ComputeDiffResult> {
    await auth();
    if (matchKeys.length === 0) return { error: "Není nastaven žádný párovací klíč" };
    if (mappings.length === 0)  return { error: "Není nastaveno žádné mapování" };

    const db = getDb();
    const dbMembers = await db.select({
        id:          members.id,
        firstName:   members.firstName,
        lastName:    members.lastName,
        email:       members.email,
        phone:       members.phone,
        address:     members.address,
        birthDate:   members.birthDate,
        birthNumber: members.birthNumber,
        gender:      members.gender,
        cskNumber:   members.cskNumber,
        memberFrom:  members.memberFrom,
        memberTo:    members.memberTo,
        nickname:    members.nickname,
    }).from(members);

    const typed = dbMembers.map(m => ({
        ...m,
        memberFrom: m.memberFrom as unknown as string,
        memberTo:   m.memberTo   as unknown as string | null,
        birthDate:  m.birthDate  as unknown as string | null,
    }));

    const diff = computeDiff(rows, typed, mappings, matchKeys);
    return { diff };
}

// ── applyImportFieldChange ────────────────────────────────────────────────────
// Přijme jednu změnu pole a aplikuje ji na člena v DB

export type ApplyChangeResult = { error: string } | { success: true };

export async function applyImportFieldChange(
    memberId: number,
    field: ImportableField,
    value: string,
    importFilename: string,
): Promise<ApplyChangeResult> {
    const session = await auth();
    const changedBy = session?.user?.email ?? "import";
    const db = getDb();

    if (!(field in IMPORTABLE_FIELDS)) return { error: "Neplatné pole" };
    if (!value.trim()) return { error: "Hodnota nesmí být prázdná" };

    try {
        const [current] = await db.select().from(members).where(eq(members.id, memberId));
        if (!current) return { error: "Člen nenalezen" };

        const oldValue = String(current[field as keyof typeof current] ?? "") || null;

        const patch: Record<string, unknown> = { [field]: value, updatedAt: new Date() };
        if (field === "firstName") patch.fullName = `${value} ${current.lastName}`.trim();
        if (field === "lastName")  patch.fullName = `${current.firstName} ${value}`.trim();

        await db.update(members)
            .set(patch as Parameters<ReturnType<typeof db.update>["set"]>[0])
            .where(eq(members.id, memberId));

        await db.insert(auditLog).values({
            entityType: "member",
            entityId:   memberId,
            action:     "update_from_import",
            changes:    { [field]: { old: oldValue, new: value }, source: { old: null, new: importFilename } },
            changedBy,
        });

        revalidatePath("/dashboard/members");
        return { success: true };
    } catch (e) {
        console.error("applyImportFieldChange error:", e);
        return { error: "Chyba při ukládání" };
    }
}

// ── saveImportHistory ─────────────────────────────────────────────────────────

export type SaveHistoryInput = {
    profileId:         number | null;
    profileName:       string | null;
    filename:          string;
    encodingDetected:  string | null;
    recordsTotal:      number;
    recordsMatched:    number;
    recordsNewCandidates: number;
    recordsWithDiffs:  number;
    recordsOnlyInDb:   number;
    changesApplied:    { memberId: number; memberName: string; field: string; oldValue: string | null; newValue: string }[];
    membersAdded:      { memberId: number; memberName: string }[];
};

export async function saveImportHistory(input: SaveHistoryInput): Promise<{ error: string } | { success: true }> {
    const session = await auth();
    const importedBy = session?.user?.email ?? "unknown";
    const db = getDb();

    try {
        await db.insert(importHistory).values({
            profileId:            input.profileId,
            profileNameSnapshot:  input.profileName,
            filename:             input.filename,
            encodingDetected:     input.encodingDetected,
            recordsTotal:         input.recordsTotal,
            recordsMatched:       input.recordsMatched,
            recordsNewCandidates: input.recordsNewCandidates,
            recordsWithDiffs:     input.recordsWithDiffs,
            recordsOnlyInDb:      input.recordsOnlyInDb,
            changesApplied:       input.changesApplied,
            membersAdded:         input.membersAdded,
            importedBy,
        });
        return { success: true };
    } catch (e) {
        console.error("saveImportHistory error:", e);
        return { error: "Chyba při ukládání záznamu" };
    }
}

// ── Profile CRUD ──────────────────────────────────────────────────────────────

export type ProfileData = {
    name:            string;
    note:            string | null;
    delimiter:       string | null;
    encoding:        string | null;
    headerRowIndex:  number;
    matchKeys:       MatchKeyConfig[];
    mappings:        ColumnMapping[];
};

export async function saveImportProfile(data: ProfileData, existingId?: number): Promise<{ error: string } | { id: number }> {
    const session = await auth();
    const createdBy = session?.user?.email ?? "unknown";
    const db = getDb();

    if (!data.name.trim()) return { error: "Název profilu je povinný" };

    try {
        if (existingId) {
            await db.update(importProfiles)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(importProfiles.id, existingId));
            revalidatePath("/dashboard/imports/profiles");
            return { id: existingId };
        } else {
            const [inserted] = await db.insert(importProfiles).values({ ...data, createdBy }).returning({ id: importProfiles.id });
            revalidatePath("/dashboard/imports/profiles");
            return { id: inserted.id };
        }
    } catch (e) {
        console.error("saveImportProfile error:", e);
        return { error: "Chyba při ukládání profilu" };
    }
}

export async function deleteImportProfile(id: number): Promise<{ error: string } | { success: true }> {
    await auth();
    const db = getDb();
    try {
        await db.delete(importProfiles).where(eq(importProfiles.id, id));
        revalidatePath("/dashboard/imports/profiles");
        return { success: true };
    } catch (e) {
        console.error("deleteImportProfile error:", e);
        return { error: "Chyba při mazání profilu" };
    }
}

export async function getImportProfiles() {
    const db = getDb();
    return db.select().from(importProfiles).orderBy(desc(importProfiles.updatedAt));
}

export async function getImportHistory(limit = 50) {
    const db = getDb();
    return db.select().from(importHistory).orderBy(desc(importHistory.importedAt)).limit(limit);
}
