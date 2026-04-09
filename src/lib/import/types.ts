// ── Importovatelná pole z externího souboru do tabulky members ────────────────

export const IMPORTABLE_FIELDS = {
    firstName:   "Jméno",
    lastName:    "Příjmení",
    email:       "E-mail",
    phone:       "Telefon",
    address:     "Adresa",
    birthDate:   "Datum narození",
    birthNumber: "Rodné číslo",
    gender:      "Pohlaví",
    cskNumber:   "Číslo ČSK",
    memberFrom:  "Člen od",
    memberTo:    "Člen do",
    nickname:    "Přezdívka",
} as const;

export type ImportableField = keyof typeof IMPORTABLE_FIELDS;

// Pole vhodná jako párovací klíč (jednoznačná identifikace člena)
export const MATCH_KEY_FIELDS: ImportableField[] = [
    "cskNumber", "birthNumber", "email",
];

// ── Výsledek parsování souboru ────────────────────────────────────────────────

export type DetectedEncoding = "utf-8" | "win-1250" | "unknown";

export type ParsedColumn = {
    name:    string;   // název z hlavičky
    samples: string[]; // prvních 5 neprázdných hodnot
};

export type ParseResult = {
    encoding:        DetectedEncoding;
    encodingConfident: boolean;  // false = uživatel by měl ověřit
    delimiter:       string;
    headerRowIndex:  number;
    columns:         ParsedColumn[];
    rows:            Record<string, string>[];  // parsed data rows (max 500)
    totalRows:       number;
};

// ── Mapování sloupců ──────────────────────────────────────────────────────────

export type ColumnMapping = {
    sourceCol:   string;             // název sloupce v souboru
    targetField: ImportableField;    // pole v members
};

export type MatchKeyConfig = {
    sourceCol:   string;
    targetField: ImportableField;
};

// ── Diff výsledek ─────────────────────────────────────────────────────────────

export type FieldDiff = {
    field:      ImportableField;
    label:      string;
    ourValue:   string | null;
    importValue: string | null;
};

export type DiffRowStatus = "matched" | "new_candidate" | "duplicate_in_source";

export type DiffRow = {
    status:      DiffRowStatus;
    sourceIndex: number;           // index řádku v souboru (pro zobrazení)
    memberId:    number | null;    // null pro new_candidate
    memberName:  string | null;    // zobrazované jméno z DB
    importName:  string;           // jméno z importu
    diffs:       FieldDiff[];
    duplicateOf?: number;          // sourceIndex jiného řádku se stejným klíčem
};

export type OnlyInDbRow = {
    memberId:  number;
    firstName: string;
    lastName:  string;
    cskNumber: string | null;
    email:     string | null;
};

export type DiffResult = {
    matched:          DiffRow[];   // v DB i v souboru, s diffs
    newCandidates:    DiffRow[];   // v souboru, ne v DB
    duplicates:       DiffRow[];   // duplicitní klíč v souboru
    onlyInDb:         OnlyInDbRow[]; // v DB, ne v souboru (dle match klíče)
    emptyValueFields: Record<string, number>; // pole → počet prázdných hodnot
};
