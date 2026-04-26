/**
 * Parser "Výsledky hospodaření oddílů" TJ Bohemians (PDF tabulka).
 *
 * Dokument obsahuje jednu stránku s tabulkou: každý řádek je jeden oddíl.
 * Sloupce: NÁKLADY | VÝNOSY | VÝSLEDEK | PŘEVOD Z ROKU X | CELKEM
 *
 * Znaky záporného čísla:  "- 25 316,00 Kč"  (minus před číslem)
 * Nula:                    "- Kč"
 * Kladné číslo:            "25 316,00 Kč"
 */

export interface HospodareniMeta {
    periodFrom:  string;        // ISO date, "1.1.2025" → "2025-01-01"
    periodTo:    string;        // ISO date, "23.1.2025" → "2025-01-23"
    prevodYear:  number | null; // rok ze záhlaví sloupce "PŘEVOD Z ROKU XXXX"
}

export interface HospodareniOddilRow {
    oddilId:   string;  // "207"
    oddilName: string;  // "VODNÍ TURISTIKA"
    naklady:   number;
    vynosy:    number;
    vysledek:  number;  // záporné = ztráta (výnosy < náklady)
    prevod:    number;  // záporné = přenesený schodek
    celkem:    number;  // záporné = celkový schodek
}

export interface HospodareniParseResult {
    meta: HospodareniMeta;
    rows: HospodareniOddilRow[];
}

// ── Pomocné funkce ─────────────────────────────────────────────────────────────

function parseCzechDate(s: string): string {
    const parts = s.trim().split(".");
    if (parts.length !== 3) return "";
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// Zpracuje jeden token částky: "- Kč" → 0, "25 316,00 Kč" → 25316, "- 25 316,00 Kč" → -25316
function parseAmountToken(s: string): number {
    const t = s.trim();
    // Nula: jen "- Kč" bez čísla
    if (/^-\s*Kč$/.test(t)) return 0;
    const negative = t.startsWith("-");
    const numStr = t
        .replace(/^-\s*/, "")
        .replace(/\s*Kč$/, "")
        .replace(/\s/g, "")
        .replace(",", ".");
    const value = parseFloat(numStr);
    if (isNaN(value)) return 0;
    return negative ? -value : value;
}

// ── Regex konstanty ────────────────────────────────────────────────────────────

// Období v záhlaví: "1.1.2025 - 23.1.2025"
const PERIOD_RE = /(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–]\s*(\d{1,2}\.\d{1,2}\.\d{4})/;

// Rok v záhlaví sloupce: "PŘEVOD Z ROKU 2024"
const PREVOD_YEAR_RE = /P[RŘ]EVOD Z ROKU\s+(\d{4})/i;

// Částka: záporná / nulová / kladná
// Pořadí je důležité: nejdříve "- číslo Kč", pak "- Kč", pak kladné
const AMOUNT_RE = /-\s*\d[\d ]*,\d{2}\s*Kč|-\s*Kč|\d[\d ]*,\d{2}\s*Kč/g;

// Začátek řádku oddílu: 3ciferné číslo + jméno velkými písmeny (vč. háčků)
// Lookahead zajistí, že za jménem následuje částka
const ODDIL_ROW_RE = /(\d{3})\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ ]+?)(?=\s+(?:-\s*\d|-\s*Kč|\d[\d ]*,\d{2}\s*Kč))/g;

// ── Hlavní parser ──────────────────────────────────────────────────────────────

export function parseHospodareniPdf(text: string): HospodareniParseResult {

    // Metadata: období
    const periodMatch = PERIOD_RE.exec(text);
    const periodFrom = periodMatch ? parseCzechDate(periodMatch[1]) : "";
    const periodTo   = periodMatch ? parseCzechDate(periodMatch[2]) : "";

    // Rok přenosu
    const prevodMatch = PREVOD_YEAR_RE.exec(text);
    const prevodYear  = prevodMatch ? parseInt(prevodMatch[1]) : null;

    // Řádky oddílů
    const rows: HospodareniOddilRow[] = [];

    for (const rowMatch of text.matchAll(ODDIL_ROW_RE)) {
        const oddilId   = rowMatch[1];
        const oddilName = rowMatch[2].trim();

        // Hledáme 5 částek od konce tohoto matche
        const afterRow = text.slice(rowMatch.index! + rowMatch[0].length);
        const amountRe = new RegExp(AMOUNT_RE.source, "g");
        const amounts: number[] = [];

        for (const am of afterRow.matchAll(amountRe)) {
            amounts.push(parseAmountToken(am[0]));
            if (amounts.length === 5) break;
        }

        if (amounts.length !== 5) continue;

        rows.push({
            oddilId,
            oddilName,
            naklady:  amounts[0],
            vynosy:   amounts[1],
            vysledek: amounts[2],
            prevod:   amounts[3],
            celkem:   amounts[4],
        });
    }

    return { meta: { periodFrom, periodTo, prevodYear }, rows };
}
