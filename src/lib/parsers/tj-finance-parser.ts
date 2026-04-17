/**
 * Parser výsledovky TJ Bohemians (PDF export z účetního systému).
 * Formát: "Výsledovka po střediscích dokladově"
 */

export interface TjImportMeta {
    reportDate: string;        // ISO date z "Dne: DD.MM.YYYY"
    costCenter: string;        // "207"
    filterFrom: string | null; // ISO date z "Datum >= DD.MM.YYYY"
    filterTo:   string | null; // ISO date z "Datum <= DD.MM.YYYY"
    filterRaw:  string | null; // celý řádek filtru z patičky
}

export interface TjTransaction {
    docDate:     string;   // ISO date
    docNumber:   string;
    sourceCode:  string;   // IN, BV, FP, FV, ...
    description: string;   // firma + text (merged)
    accountCode: string;
    accountName: string;
    debit:       number;
    credit:      number;
}

export interface TjParseResult {
    meta:         TjImportMeta;
    transactions: TjTransaction[];
}

// Převod "DD.MM.YYYY" → "YYYY-MM-DD"
function parseCzechDate(s: string): string {
    const [d, m, y] = s.split(".");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// Převod "25 316,00" → 25316.00
function parseCzechAmount(s: string): number {
    return parseFloat(s.replace(/\s/g, "").replace(",", "."));
}

// Regex: česká částka na konci řádku (dvě čísla oddělená mezerou)
const TRAILING_AMOUNTS = /\s+([\d][\d\s]*,\d{2})\s+([\d][\d\s]*,\d{2})\s*$/;

// Regex: datum na začátku řádku
const DATE_PREFIX = /^(\d{2}\.\d{2}\.\d{4})\s+/;

// Regex: 6ciferný účet na začátku řádku
const ACCOUNT_CODE_PREFIX = /^(\d{6})\s+(.+)/;

// Regex: datum v reportDate z hlavičky
const REPORT_DATE_RE = /Dne:\s*(\d{2}\.\d{2}\.\d{4})/;

// Regex: středisko z hlavičky
const COST_CENTER_RE = /Středisko:\s*(\d+)/;

// Regex: datumový filtr z patičky
const FILTER_FROM_RE = /Datum\s*>=\s*(\d{2}\.\d{2}\.\d{4})/;
const FILTER_TO_RE   = /Datum\s*<=\s*(\d{2}\.\d{2}\.\d{4})/;

export function parseTjFinancePdf(text: string): TjParseResult {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    // ── Metadata z hlavičky ──────────────────────────────────────────────────
    let reportDate = "";
    let costCenter = "207";
    let filterFrom: string | null = null;
    let filterTo:   string | null = null;
    let filterRaw:  string | null = null;

    for (const line of lines) {
        if (!reportDate) {
            const m = REPORT_DATE_RE.exec(line);
            if (m) reportDate = parseCzechDate(m[1]);
        }
        if (costCenter === "207") {
            const m = COST_CENTER_RE.exec(line);
            if (m) costCenter = m[1];
        }
        if (line.startsWith("Tisk vybraných záznamů:")) {
            filterRaw = line;
            const mFrom = FILTER_FROM_RE.exec(line);
            const mTo   = FILTER_TO_RE.exec(line);
            if (mFrom) filterFrom = parseCzechDate(mFrom[1]);
            if (mTo)   filterTo   = parseCzechDate(mTo[1]);
        }
    }

    // ── Transakce ────────────────────────────────────────────────────────────
    const transactions: TjTransaction[] = [];
    let currentAccountCode = "";
    let currentAccountName = "";

    for (const line of lines) {
        // Transakční řádek začíná datem
        const dateMatch = DATE_PREFIX.exec(line);
        if (dateMatch) {
            const rest = line.slice(dateMatch[0].length);
            const amountsMatch = TRAILING_AMOUNTS.exec(rest);
            if (!amountsMatch) continue;

            const middle = rest.slice(0, amountsMatch.index).trim();
            const debit  = parseCzechAmount(amountsMatch[1]);
            const credit = parseCzechAmount(amountsMatch[2]);

            // middle = "docNumber sourceCode description"
            const parts = middle.split(/\s+/);
            if (parts.length < 2) continue;

            const docNumber  = parts[0];
            const sourceCode = parts[1];
            // zbytek je popis (firma + text dohromady)
            const description = parts.slice(2).join(" ").trim();

            transactions.push({
                docDate:     parseCzechDate(dateMatch[1]),
                docNumber,
                sourceCode,
                description,
                accountCode: currentAccountCode,
                accountName: currentAccountName,
                debit,
                credit,
            });
            continue;
        }

        // Řádek s kódem účtu — buď header (bez částek) nebo mezisoučet (s částkami)
        const accountMatch = ACCOUNT_CODE_PREFIX.exec(line);
        if (accountMatch) {
            const hasAmounts = TRAILING_AMOUNTS.test(line);
            if (!hasAmounts) {
                // Čistý header účtu — uložit jako aktuální účet
                currentAccountCode = accountMatch[1];
                currentAccountName = accountMatch[2].trim();
            }
            // Mezisoučty (s částkami) přeskočíme
        }
    }

    return {
        meta: { reportDate, costCenter, filterFrom, filterTo, filterRaw },
        transactions,
    };
}
