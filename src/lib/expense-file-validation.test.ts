import { describe, expect, it } from "vitest";

import { isAllowedExpenseFile, isSpreadsheetFile } from "./expense-file-validation";

describe("isAllowedExpenseFile", () => {
    it("povolí známé MIME typy obrázků, PDF a Excelu", () => {
        expect(isAllowedExpenseFile("image/jpeg", "ucet.jpg")).toBe(true);
        expect(isAllowedExpenseFile("application/pdf", "faktura.pdf")).toBe(true);
        expect(isAllowedExpenseFile("application/vnd.ms-excel", "faktura.xls")).toBe(true);
        expect(
            isAllowedExpenseFile(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "faktura.xlsx",
            ),
        ).toBe(true);
    });

    it("povolí XLS/XLSX i s nespolehlivým MIME, pokud přípona sedí", () => {
        expect(isAllowedExpenseFile("application/octet-stream", "faktura.xlsx")).toBe(true);
        expect(isAllowedExpenseFile("application/octet-stream", "faktura.xls")).toBe(true);
    });

    it("zamítne nesouvisející typy bez správné přípony", () => {
        expect(isAllowedExpenseFile("application/octet-stream", "dokument.docx")).toBe(false);
        expect(isAllowedExpenseFile("text/plain", "poznamka.txt")).toBe(false);
    });
});

describe("isSpreadsheetFile", () => {
    it("rozpozná spreadsheet podle MIME i podle přípony", () => {
        expect(isSpreadsheetFile("application/vnd.ms-excel", null)).toBe(true);
        expect(isSpreadsheetFile("application/octet-stream", "faktura.xlsx")).toBe(true);
        expect(isSpreadsheetFile("application/pdf", "faktura.pdf")).toBe(false);
        expect(isSpreadsheetFile("image/jpeg", "ucet.jpg")).toBe(false);
    });
});
