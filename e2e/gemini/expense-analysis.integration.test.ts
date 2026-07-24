import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeExpenseFile } from "@/lib/expense-analysis";
import { hasAmountMismatch } from "@/lib/expense-mismatch";
import type { ExpenseCategory } from "@/lib/expense-categories";

// Integrační test nad reálnými vzorovými doklady — volá skutečné Gemini API.
// Viz docs/superpowers/specs/2026-07-23-integracni-test-gemini-analyzy.md.
//
// Chybějící GEMINI_API_KEY se NEpřeskakuje potichu: analyzeExpenseFile() sama vyhodí
// ExpenseAnalysisConfigError, test tedy spadne se srozumitelnou chybou — to je záměr.

const FIXTURES_DIR = join(__dirname, "..", "fixtures", "gemini-samples");

const MIME_BY_EXTENSION: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

type ExpectedSample = {
    total_amount: number;
    account_code: ExpenseCategory;
    approvedAmount: number;
    amountTolerance?: number;
    // Volitelné — jen když je v sidecaru přítomné (`"payee_name" in expected.json`).
    // Vynechané u vzorků, kde je hlavička/patička dokladu nejednoznačná (víc věrohodných
    // variant názvu dodavatele) — viz vzorek "Kemp" v e2e/fixtures/gemini-samples/.
    payee_name?: string | null;
};

type Sample = {
    fileName: string;
    filePath: string;
    mime: string;
    expected: ExpectedSample;
};

function loadSamples(): Sample[] {
    const entries = readdirSync(FIXTURES_DIR);
    const sampleFileNames = entries.filter(
        (name) => !name.startsWith(".") && !name.endsWith(".expected.json"),
    );

    return sampleFileNames.map((fileName) => {
        const filePath = join(FIXTURES_DIR, fileName);
        const expectedPath = `${filePath}.expected.json`;
        const expected = JSON.parse(readFileSync(expectedPath, "utf-8")) as ExpectedSample;

        const ext = extname(fileName).toLowerCase();
        const mime = MIME_BY_EXTENSION[ext];
        if (!mime) {
            throw new Error(`Neznámá přípona vzorku "${fileName}" — doplň MIME_BY_EXTENSION v testu.`);
        }

        return { fileName, filePath, mime, expected };
    });
}

describe("Gemini analýza reálných vzorových dokladů", () => {
    const samples = loadSamples();

    it("najde alespoň jeden pár vzorek + expected.json", () => {
        expect(samples.length).toBeGreaterThan(0);
    });

    it.each(samples)("$fileName", async ({ fileName, filePath, mime, expected }) => {
        const buffer = readFileSync(filePath);
        const file = new File([buffer], fileName, { type: mime });

        const result = await analyzeExpenseFile(file, { source: "integration-test" });

        expect(result.account_code).toBe(expected.account_code);

        if (result.total_amount === null) {
            throw new Error(`Gemini nevrátil total_amount pro ${fileName}`);
        }
        const tolerance = expected.amountTolerance ?? 0;
        expect(Math.abs(result.total_amount - expected.total_amount)).toBeLessThanOrEqual(tolerance);

        // Cross-check identifikace rozporu jen pro vzorky s přesnou shodou (tolerance 0).
        // hasAmountMismatch() srovnává na haléře přesně — u vzorku s nenulovou
        // amountTolerance by "result.total_amount v toleranci, ale ne přesně rovno
        // expected.total_amount" mohlo hasAmountMismatch() vrátit jiný verdikt, než plyne
        // ze sidecaru, i když nejde o skutečný měnový rozpor, jen o legitimní odchylku,
        // kterou amountTolerance povoluje. Mismatch-assert proto zůstává jen na přesně
        // shodných vzorcích (viz vzorek "Kemp" — tolerance 0).
        if (tolerance === 0) {
            const expectMismatch = hasAmountMismatch(expected.approvedAmount, expected.total_amount);
            expect(hasAmountMismatch(expected.approvedAmount, result.total_amount)).toBe(expectMismatch);
        }

        // payee_name je volitelný — jen když je v sidecaru výslovně přítomný (i jako
        // null, viz vzorky "účtenka"/"čestné prohlášení" — Gemini tam podle promptu
        // musí vrátit null, ne si vymyslet jméno z merchant pole).
        if (expected.payee_name !== undefined) {
            expect(result.payee_name).toBe(expected.payee_name);
        }
    });
});
