/**
 * Parser výsledovky TJ Bohemians (PDF export z účetního systému).
 * Formát: "Výsledovka po střediscích dokladově"
 *
 * unpdf extrahuje sloupce v pořadí: AMOUNT1 DOC_NUMBER [FIRMA] AMOUNT2 SOURCE DATE DESCRIPTION
 * kde AMOUNT1=MD (debet), AMOUNT2=D (kredit), SOURCE+DATE jsou přímo za sebou bez mezery.
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
    debit:       number;   // MD (Má Dáti)
    credit:      number;   // D (Dal)
}

export interface TjParseResult {
    meta:         TjImportMeta;
    transactions: TjTransaction[];
}

// ── Pomocné funkce ────────────────────────────────────────────────────────────

function parseCzechDate(s: string): string {
    const [d, m, y] = s.split(".");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseCzechAmount(s: string): number {
    return parseFloat(s.replace(/\s/g, "").replace(",", "."));
}

// ── Regex ─────────────────────────────────────────────────────────────────────

const REPORT_DATE_RE = /Dne:\s*(\d{2}\.\d{2}\.\d{4})/;
const COST_CENTER_RE = /Středisko:\s*(\d+)/;

// Filtrační řádek je v patičce a má format "Tisk vybraných záznamů: Středisko = ..."
const FILTER_LINE_RE = /Tisk vybraných záznamů:\s*(Středisko\s*=[\s\S]*?)(?=\s*Zdroj:|$)/;
const FILTER_FROM_RE = /Datum\s*>=\s*(\d{2}\.\d{2}\.\d{4})/;
const FILTER_TO_RE   = /Datum\s*<=\s*(\d{2}\.\d{2}\.\d{4})/;

/**
 * Vzor jedné transakce v unpdf formátu:
 *   AMOUNT1 DOC_NUMBER space [FIRMA space] AMOUNT2 SOURCE_CODE DATE space DESCRIPTION
 *
 * AMOUNT1 je přímo za AMOUNT1 (žádná mezera), SOURCE_CODE přímo za AMOUNT2, DATE přímo za SOURCE.
 *
 * Skupiny: 1=debet, 2=docNumber, 3=firma(optional), 4=kredit, 5=source, 6=date, 7=description
 */
const TX_RE = /(\d+(?:\s\d{3})*,\d{2})(\S+)\s+([\s\S]*?)(\d+(?:\s\d{3})*,\d{2})([A-Z]{2,4})(\d{2}\.\d{2}\.\d{4})\s+([\s\S]*?)(?=\d+(?:\s\d{3})*,\d{2}\S|\d{6}\s+\S|Náklady|Výnosy|Hospodářský|Tisk vybraných|$)/g;

/**
 * Zachytí 6ciferné kódy účtů s názvy: "518018 Interní nájmy "
 * (shoduje se jak s headery, tak s mezisoučty — oba mají stejný kód i název)
 */
const ACCOUNT_CODE_RE = /\b(\d{6})\s+([^\d,\n][^0-9,\n]{1,60}?)(?=\s*\d)/g;

// ── Hlavní parser ─────────────────────────────────────────────────────────────

export function parseTjFinancePdf(text: string): TjParseResult {

    // ── Metadata ──────────────────────────────────────────────────────────────

    const reportDate = (() => {
        const m = REPORT_DATE_RE.exec(text);
        return m ? parseCzechDate(m[1]) : "";
    })();

    const costCenter = (() => {
        const m = COST_CENTER_RE.exec(text);
        return m ? m[1] : "207";
    })();

    const filterRaw = (() => {
        const m = FILTER_LINE_RE.exec(text);
        if (!m) return null;
        return `Tisk vybraných záznamů: ${m[1].trim()}`;
    })();

    const filterFrom = filterRaw ? (() => {
        const m = FILTER_FROM_RE.exec(filterRaw);
        return m ? parseCzechDate(m[1]) : null;
    })() : null;

    const filterTo = filterRaw ? (() => {
        const m = FILTER_TO_RE.exec(filterRaw);
        return m ? parseCzechDate(m[1]) : null;
    })() : null;

    // ── Kódy účtů s pozicemi v textu ─────────────────────────────────────────

    const accountEntries: Array<{ pos: number; code: string; name: string }> = [];
    for (const m of text.matchAll(ACCOUNT_CODE_RE)) {
        accountEntries.push({ pos: m.index!, code: m[1], name: m[2].trim() });
    }
    // Seřadit podle pozice
    accountEntries.sort((a, b) => a.pos - b.pos);

    function getAccountAt(pos: number): { code: string; name: string } {
        let result = { code: "", name: "" };
        for (const entry of accountEntries) {
            if (entry.pos <= pos) result = entry;
            else break;
        }
        return result;
    }

    // ── Transakce ─────────────────────────────────────────────────────────────

    const transactions: TjTransaction[] = [];

    for (const m of text.matchAll(TX_RE)) {
        const debit      = parseCzechAmount(m[1]);
        const docNumber  = m[2];
        const firmRaw    = m[3].trim();
        const credit     = parseCzechAmount(m[4]);
        const sourceCode = m[5];
        const docDate    = parseCzechDate(m[6]);
        const descRaw    = m[7].trim();

        // Přeskočit záznamy kde "docNumber" nevypadá jako skutečné číslo dokladu
        // (musí obsahovat číslici a být alespoň 4 znaky)
        if (!/\d/.test(docNumber) || docNumber.length < 4) continue;

        // Sloučit firmu a popis (firma je prázdná pro interní doklady)
        const description = firmRaw ? `${firmRaw} ${descRaw}`.trim() : descRaw;

        const { code: accountCode, name: accountName } = getAccountAt(m.index!);

        transactions.push({ docDate, docNumber, sourceCode, description, accountCode, accountName, debit, credit });
    }

    return {
        meta: { reportDate, costCenter, filterFrom, filterTo, filterRaw },
        transactions,
    };
}
