import type { ImportableField, ColumnMapping, ParsedColumn } from "./types";
import { IMPORTABLE_FIELDS } from "./types";

// ── Normalizace textu ─────────────────────────────────────────────────────────

function normalize(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // remove diacritics
        .replace(/[-_\s/]+/g, "")                           // remove separators
        .replace(/[^a-z0-9]/g, "");
}

// ── Slovník vzorů pro každé cílové pole ──────────────────────────────────────
// Pořadí uvnitř pole = priorita (přesnější vzory dříve)

const FIELD_PATTERNS: Record<ImportableField, string[]> = {
    firstName:   ["jmeno", "krestni", "firstname", "name", "givenname", "vorname"],
    lastName:    ["prijmeni", "surname", "lastname", "familyname", "nachname"],
    email:       ["email", "mail", "eposta", "epost"],
    phone:       ["telefon", "phone", "mobil", "tel", "gsm"],
    address:     ["adresa", "ulice", "address", "street", "bydliste"],
    birthDate:   ["datumnarozeni", "narozeni", "birthdate", "dob", "dateofbirth", "geboren"],
    birthNumber: ["rodne", "rodnecislo", "rc", "birthnumber", "idnumber"],
    gender:      ["pohlavi", "gender", "geschlecht", "sex"],
    cskNumber:   ["regcislo", "registrace", "csk", "cskcislo", "reg", "regnum", "csknum"],
    memberFrom:  ["clenod", "memberfrom", "datumvstupu", "vstup", "zacatek", "od"],
    memberTo:    ["clendo", "memberto", "datumkonce", "vystup", "konec", "do"],
    nickname:    ["prezdivka", "nickname", "alias", "spitzname"],
};

// ── Detekce formátu hodnot ─────────────────────────────────────────────────────

type ValueType = "email" | "phone" | "date_cz" | "date_iso" | "birth_number" | "numeric" | "text";

function detectValueType(samples: string[]): ValueType | null {
    if (samples.length === 0) return null;
    const hits: Record<ValueType, number> = {
        email: 0, phone: 0, date_cz: 0, date_iso: 0, birth_number: 0, numeric: 0, text: 0,
    };
    for (const s of samples) {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) hits.email++;
        else if (/^[+\d][\d\s\-().]{6,}$/.test(s)) hits.phone++;
        else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) hits.date_cz++;
        else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) hits.date_iso++;
        else if (/^\d{6}\/?\d{3,4}$/.test(s)) hits.birth_number++;
        else if (/^\d+$/.test(s)) hits.numeric++;
        else hits.text++;
    }
    const majority = samples.length * 0.5;
    for (const [type, count] of Object.entries(hits) as [ValueType, number][]) {
        if (count >= majority) return type;
    }
    return null;
}

// Mapování detekovaného formátu → preferovaná pole (v pořadí preference)
const VALUE_TYPE_HINTS: Partial<Record<ValueType, ImportableField[]>> = {
    email:        ["email"],
    phone:        ["phone"],
    date_cz:      ["birthDate", "memberFrom", "memberTo"],
    date_iso:     ["birthDate", "memberFrom", "memberTo"],
    birth_number: ["birthNumber"],
    numeric:      ["cskNumber"],
};

// ── Hlavní funkce pro auto-mapování ──────────────────────────────────────────

/**
 * Pro každý sloupec v souboru navrhne odpovídající cílové pole.
 *
 * Algoritmus:
 * 1. Normalizovaný název sloupce → přesná shoda ve slovníku vzorů (priorita 1)
 * 2. Normalizovaný název → contains match (priorita 2)
 * 3. Analýza vzorových hodnot (priorita 3)
 * 4. Bez návrhu
 *
 * Každé cílové pole se použije maximálně jednou — první nejlepší shoda vyhrává.
 */
export function autoMapColumns(columns: ParsedColumn[]): ColumnMapping[] {
    const used = new Set<ImportableField>();
    const result: ColumnMapping[] = [];

    const fields = Object.keys(IMPORTABLE_FIELDS) as ImportableField[];

    for (const col of columns) {
        const normName = normalize(col.name);
        let matched: ImportableField | null = null;

        // Pass 1: přesná shoda ve vzorech
        outer1: for (const field of fields) {
            if (used.has(field)) continue;
            for (const pattern of FIELD_PATTERNS[field]) {
                if (normName === pattern) { matched = field; break outer1; }
            }
        }

        // Pass 2: contains match
        if (!matched) {
            outer2: for (const field of fields) {
                if (used.has(field)) continue;
                for (const pattern of FIELD_PATTERNS[field]) {
                    if (normName.includes(pattern) || pattern.includes(normName)) {
                        matched = field; break outer2;
                    }
                }
            }
        }

        // Pass 3: analýza hodnot
        if (!matched) {
            const vt = detectValueType(col.samples);
            if (vt) {
                const hints = VALUE_TYPE_HINTS[vt] ?? [];
                for (const hint of hints) {
                    if (!used.has(hint)) { matched = hint; break; }
                }
            }
        }

        if (matched) {
            used.add(matched);
            result.push({ sourceCol: col.name, targetField: matched });
        }
    }

    return result;
}

// ── Konverze hodnot ───────────────────────────────────────────────────────────

/**
 * Normalizuje hodnotu z CSV pro uložení do DB.
 * - Datum DD.MM.YYYY → YYYY-MM-DD
 * - "00.00.0000" → null
 * - prázdný řetězec → null
 */
export function normalizeValue(field: ImportableField, raw: string): string | null {
    const v = raw.trim();
    if (!v || v === "00.00.0000" || v === "0" || v === "-") return null;

    if (field === "birthDate" || field === "memberFrom" || field === "memberTo") {
        // DD.MM.YYYY → YYYY-MM-DD
        const match = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (match) {
            const [, d, m, y] = match;
            return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
        // Již ISO formát
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        return null;
    }

    if (field === "cskNumber") {
        // Odstraň uvozovky (ČSK soubor je obaluje)
        return v.replace(/^"+|"+$/g, "") || null;
    }

    return v || null;
}
