import * as XLSX from "xlsx";

const MAX_CHARS = 50_000;

/**
 * Převede všechny listy sešitu na CSV text pro textovou Gemini analýzu.
 * Víc listů odděleno prázdným řádkem, každý prefixován názvem listu.
 * Ořízne extrémně velký výstup, aby nenafoukl Gemini token cost.
 */
export function extractTextFromSpreadsheet(buffer: Buffer): string {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const parts = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        return `--- List: ${name} ---\n${csv}`;
    });

    const text = parts.join("\n\n");
    if (text.length <= MAX_CHARS) return text;
    return `${text.slice(0, MAX_CHARS)}\n...(obsah zkrácen, sešit je příliš velký)`;
}
