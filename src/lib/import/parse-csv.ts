import Papa from "papaparse";
import iconv from "iconv-lite";
import { detectEncoding } from "./detect-encoding";
import type { ParseResult, ParsedColumn, DetectedEncoding } from "./types";

const MAX_ROWS = 500;

// ── Detekce oddělovače ────────────────────────────────────────────────────────

/**
 * Odhadne oddělovač z prvních několika řádků.
 * Vybere ten, který dává konzistentní počet sloupců.
 */
function detectDelimiter(lines: string[]): string {
    const candidates = [";", ",", "\t", "|"];
    const sample = lines.slice(0, Math.min(5, lines.length));

    let best = ";";
    let bestScore = -1;

    for (const delim of candidates) {
        const counts = sample.map(l => l.split(delim).length);
        if (counts.length === 0) continue;
        const max = Math.max(...counts);
        if (max <= 1) continue;
        // skóre = max počet sloupců + konzistence (std dev = 0 je nejlepší)
        const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
        const variance = counts.reduce((acc, c) => acc + (c - avg) ** 2, 0) / counts.length;
        const score = max * 10 - variance;
        if (score > bestScore) { bestScore = score; best = delim; }
    }
    return best;
}

// ── Detekce řádku s hlavičkou ─────────────────────────────────────────────────

/**
 * Hledá první řádek, kde:
 * - počet sloupců odpovídá většině datových řádků
 * - hodnoty jsou krátké texty (ne čísla, ne data)
 *
 * Vrátí 0-based index řádku. Prohledá prvních 5 řádků.
 */
function detectHeaderRow(lines: string[], delimiter: string): number {
    if (lines.length === 0) return 0;

    // Zjisti nejčastější počet sloupců z datových řádků
    const colCounts = lines.slice(0, Math.min(10, lines.length))
        .map(l => l.split(delimiter).length);
    const modeCount = mostFrequent(colCounts);

    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const cols = lines[i].split(delimiter);
        if (cols.length !== modeCount) continue;

        // Hlavička: většina hodnot jsou nečíselné neprázdné řetězce ≤ 40 znaků
        const textLike = cols.filter(c => {
            const v = c.trim().replace(/^"|"$/g, "");
            return v.length > 0 && v.length <= 40 && isNaN(Number(v)) && !isDateValue(v);
        });
        if (textLike.length >= cols.length * 0.6) return i;
    }
    return 0;
}

function mostFrequent(arr: number[]): number {
    const freq: Record<number, number> = {};
    for (const n of arr) freq[n] = (freq[n] ?? 0) + 1;
    return Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
}

function isDateValue(v: string): boolean {
    return /^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}$/.test(v) ||
        /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ── Parsování ─────────────────────────────────────────────────────────────────

export interface ParseOptions {
    encoding?: DetectedEncoding;
    delimiter?: string;
    headerRowIndex?: number;
}

export function parseCsvBuffer(buf: Buffer, opts: ParseOptions = {}): ParseResult {
    // 1. Kódování
    const { encoding: detectedEnc, confident } = detectEncoding(buf);
    const encoding = opts.encoding ?? detectedEnc;

    let text: string;
    if (encoding === "win-1250") {
        text = iconv.decode(buf, "win1250");
    } else {
        // utf-8: odstraň BOM pokud existuje
        text = buf.toString("utf-8").replace(/^\uFEFF/, "");
    }

    // 2. Rozdělení na řádky (ignoruj prázdné)
    const allLines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

    // 3. Oddělovač
    const delimiter = opts.delimiter ?? detectDelimiter(allLines);

    // 4. Řádek hlavičky
    const headerRowIndex = opts.headerRowIndex ?? detectHeaderRow(allLines, delimiter);

    // 5. Parsuj přes PapaParse
    const dataText = allLines.slice(headerRowIndex).join("\n");
    const parsed = Papa.parse<Record<string, string>>(dataText, {
        delimiter,
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim().replace(/^"|"$/g, ""),
        transform: v => v.trim().replace(/^"|"$/g, ""),
    });

    const rows = parsed.data.slice(0, MAX_ROWS);
    const headers: string[] = parsed.meta.fields ?? [];

    // 6. Vzorové hodnoty pro každý sloupec (prvních 5 neprázdných)
    const columns: ParsedColumn[] = headers.map(name => ({
        name,
        samples: rows
            .map(r => r[name] ?? "")
            .filter(v => v.length > 0)
            .slice(0, 5),
    }));

    return {
        encoding,
        encodingConfident: confident,
        delimiter,
        headerRowIndex,
        columns,
        rows,
        totalRows: parsed.data.length,
    };
}
