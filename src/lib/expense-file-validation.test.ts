import { describe, expect, it } from "vitest";

import { isAllowedExpenseFile, isSpreadsheetFile, resolveExpenseFileMime } from "./expense-file-validation";

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

describe("resolveExpenseFileMime", () => {
    it("známý bezpečný MIME vrátí beze změny", () => {
        expect(resolveExpenseFileMime("image/jpeg", "ucet.jpg")).toBe("image/jpeg");
        expect(resolveExpenseFileMime("application/pdf", "faktura.pdf")).toBe("application/pdf");
    });

    it("nedůvěryhodný/obecný MIME u XLS/XLSX nahradí kanonickým bezpečným typem", () => {
        expect(resolveExpenseFileMime("application/octet-stream", "faktura.xlsx")).toBe(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        expect(resolveExpenseFileMime("application/octet-stream", "faktura.xls")).toBe(
            "application/vnd.ms-excel",
        );
    });

    it("bezpečnostní regrese: podvržený spustitelný MIME (text/html) se u .xlsx NIKDY neuloží beze změny", () => {
        // Útočník nahraje "faktura.xlsx" s file.type "text/html" a škodlivým obsahem —
        // isAllowedExpenseFile() by to (kvůli příponě) propustilo dál, ale sem uložený
        // Content-Type nesmí být "text/html", jinak by ho blob-file proxy servírovala
        // s Content-Disposition: inline a prohlížeč by ho vykreslil jako stránku (stored XSS).
        expect(resolveExpenseFileMime("text/html", "faktura.xlsx")).toBe(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        expect(resolveExpenseFileMime("image/svg+xml", "ucet.xls")).toBe("application/vnd.ms-excel");
    });
});
