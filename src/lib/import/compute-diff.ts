import type {
    DiffResult, DiffRow, OnlyInDbRow, FieldDiff,
    ColumnMapping, MatchKeyConfig, ImportableField,
} from "./types";
import { IMPORTABLE_FIELDS } from "./types";
import { normalizeValue } from "./map-columns";

type DbMember = {
    id:          number;
    firstName:   string;
    lastName:    string;
    email:       string | null;
    phone:       string | null;
    address:     string | null;
    birthDate:   string | null;
    birthNumber: string | null;
    gender:      string | null;
    cskNumber:   string | null;
    memberFrom:  string;
    memberTo:    string | null;
    nickname:    string | null;
};

/**
 * Porovná řádky ze souboru s členy v DB.
 *
 * - matchKeys: definují jak párovat (sourceCol → targetField)
 * - mappings: mapování importovaných sloupců na pole v DB
 * - rows: parsované řádky z CSV
 * - dbMembers: členové z DB
 */
export function computeDiff(
    rows: Record<string, string>[],
    dbMembers: DbMember[],
    mappings: ColumnMapping[],
    matchKeys: MatchKeyConfig[],
): DiffResult {
    const matched: DiffRow[] = [];
    const newCandidates: DiffRow[] = [];
    const duplicates: DiffRow[] = [];
    const emptyValueFields: Record<string, number> = {};

    // Sestavit index DB členů podle match klíčů
    const dbIndexes: Map<string, DbMember>[] = matchKeys.map(mk => {
        const idx = new Map<string, DbMember>();
        for (const m of dbMembers) {
            const val = String(m[mk.targetField as keyof DbMember] ?? "").toLowerCase().trim();
            if (val) idx.set(val, m);
        }
        return idx;
    });

    // Sledovat duplicity v import souboru (stejný klíč → dva+ řádky)
    const seenImportKeys = new Map<string, number>(); // key → sourceIndex

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Sestavit importovaná data pro tento řádek
        const importData: Partial<Record<ImportableField, string | null>> = {};
        for (const { sourceCol, targetField } of mappings) {
            const raw = row[sourceCol] ?? "";
            importData[targetField] = normalizeValue(targetField, raw);
            // Počítej prázdné hodnoty
            if (!raw.trim() || !importData[targetField]) {
                emptyValueFields[targetField] = (emptyValueFields[targetField] ?? 0) + 1;
            }
        }

        // Zobrazitelné jméno z importu
        const importName = [importData.firstName, importData.lastName].filter(Boolean).join(" ") ||
            Object.values(importData).find(v => v) || `Řádek ${i + 1}`;

        // Detekce duplicit v souboru
        const keyStr = matchKeys.map(mk => String(importData[mk.targetField] ?? "").toLowerCase()).join("|");
        if (keyStr.replace(/\|/g, "").trim()) {
            if (seenImportKeys.has(keyStr)) {
                duplicates.push({
                    status: "duplicate_in_source",
                    sourceIndex: i,
                    memberId: null,
                    memberName: null,
                    importName,
                    diffs: [],
                    duplicateOf: seenImportKeys.get(keyStr),
                });
                continue;
            }
            seenImportKeys.set(keyStr, i);
        }

        // Párování s DB
        let dbMember: DbMember | null = null;
        for (let ki = 0; ki < matchKeys.length; ki++) {
            const mk = matchKeys[ki];
            const val = String(importData[mk.targetField] ?? "").toLowerCase().trim();
            if (val) {
                const found = dbIndexes[ki].get(val);
                if (found) { dbMember = found; break; }
            }
        }

        if (!dbMember) {
            newCandidates.push({
                status: "new_candidate",
                sourceIndex: i,
                memberId: null,
                memberName: null,
                importName,
                diffs: Object.entries(importData)
                    .filter(([, v]) => v !== null)
                    .map(([field, v]) => ({
                        field: field as ImportableField,
                        label: IMPORTABLE_FIELDS[field as ImportableField],
                        ourValue: null,
                        importValue: v,
                    })),
            });
            continue;
        }

        // Diff: porovnej importovaná pole s DB hodnotami
        const diffs: FieldDiff[] = [];
        for (const { targetField } of mappings) {
            const importVal = importData[targetField] ?? null;
            if (importVal === null) continue; // prázdné hodnoty nepřijímáme

            const dbVal = String(dbMember[targetField as keyof DbMember] ?? "").trim() || null;
            if (importVal !== dbVal) {
                diffs.push({
                    field: targetField,
                    label: IMPORTABLE_FIELDS[targetField],
                    ourValue: dbVal,
                    importValue: importVal,
                });
            }
        }

        if (diffs.length > 0) {
            matched.push({
                status: "matched",
                sourceIndex: i,
                memberId: dbMember.id,
                memberName: `${dbMember.firstName} ${dbMember.lastName}`,
                importName,
                diffs,
            });
        }
    }

    // Členové v DB, kteří nejsou v souboru (dle prvního match klíče)
    const onlyInDb: OnlyInDbRow[] = [];
    if (matchKeys.length > 0) {
        const importKeySet = new Set(seenImportKeys.keys());
        for (const m of dbMembers) {
            const keyStr = matchKeys.map(mk => String(m[mk.targetField as keyof DbMember] ?? "").toLowerCase()).join("|");
            if (!keyStr.replace(/\|/g, "").trim()) continue; // člen bez klíče = přeskočit
            if (!importKeySet.has(keyStr)) {
                onlyInDb.push({
                    memberId:  m.id,
                    firstName: m.firstName,
                    lastName:  m.lastName,
                    cskNumber: m.cskNumber,
                    email:     m.email,
                });
            }
        }
    }

    // Odstraň prázdné pole ze statistiky (žádné prázdné = 0)
    for (const [k, v] of Object.entries(emptyValueFields)) {
        if (v === 0) delete emptyValueFields[k];
    }

    return { matched, newCandidates, duplicates, onlyInDb, emptyValueFields };
}
