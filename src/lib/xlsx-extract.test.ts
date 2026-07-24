import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { extractTextFromSpreadsheet } from "./xlsx-extract";

function buildWorkbookBuffer(sheets: Record<string, unknown[][]>): Buffer {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, name);
    }
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("extractTextFromSpreadsheet", () => {
    it("převede jeden list na CSV s hlavičkou názvu listu", () => {
        const buffer = buildWorkbookBuffer({
            Faktura: [["Dodavatel", "Firma s.r.o."], ["Částka", 1500]],
        });
        const text = extractTextFromSpreadsheet(buffer);
        expect(text).toContain("Faktura");
        expect(text).toContain("Dodavatel,Firma s.r.o.");
        expect(text).toContain("Částka,1500");
    });

    it("spojí víc listů v pořadí sešitu, každý prefixovaný názvem", () => {
        const buffer = buildWorkbookBuffer({
            List1: [["A", "B"]],
            List2: [["C", "D"]],
        });
        const text = extractTextFromSpreadsheet(buffer);
        const list1Index = text.indexOf("List1");
        const list2Index = text.indexOf("List2");
        expect(list1Index).toBeGreaterThanOrEqual(0);
        expect(list2Index).toBeGreaterThan(list1Index);
        expect(text).toContain("A,B");
        expect(text).toContain("C,D");
    });

    it("prázdný list nepadá, jen vrátí prázdné CSV tělo", () => {
        const buffer = buildWorkbookBuffer({ "Prázdný list": [] });
        const text = extractTextFromSpreadsheet(buffer);
        expect(text).toContain("Prázdný list");
    });

    it("ořízne extrémně dlouhý výstup na cca 50 000 znaků", () => {
        const rows = Array.from({ length: 5000 }, (_, i) => [`řádek-${i}`, "x".repeat(20)]);
        const buffer = buildWorkbookBuffer({ Velký: rows });
        const text = extractTextFromSpreadsheet(buffer);
        expect(text.length).toBeLessThanOrEqual(50_200);
    });
});
