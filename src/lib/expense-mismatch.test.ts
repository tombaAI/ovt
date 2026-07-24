import { describe, expect, it } from "vitest";

import {
    analyzedMatchesAmount,
    evaluateLockedMismatchGate,
    hasAmountMismatch,
    hasUnresolvedMismatch,
    isMismatchAcknowledged,
} from "./expense-mismatch";

describe("shoda zjištěné a zapsané částky (analyzedMatchesAmount)", () => {
    it("porovnává na haléře napříč string/number reprezentací (DB numeric vs. Gemini)", () => {
        expect(analyzedMatchesAmount("1500.00", 1500)).toBe(true);
        expect(analyzedMatchesAmount(99.994, "99.99")).toBe(true); // zaokrouhlení na haléře
        expect(analyzedMatchesAmount("1500.00", 1500.02)).toBe(false);
    });

    it("nepřečtená částka (null) nebo chybějící zapsaná částka = NEshoda", () => {
        expect(analyzedMatchesAmount("1500", null)).toBe(false);
        expect(analyzedMatchesAmount(null, 1500)).toBe(false);
    });

    it("nečíselný string = NEshoda, ne výjimka", () => {
        expect(analyzedMatchesAmount("abc", 1500)).toBe(false);
    });
});

describe("hlášení neshody (hasAmountMismatch)", () => {
    it("bez proběhlé analýzy (analyzedAmount null) není co hlásit", () => {
        expect(hasAmountMismatch("1500", null)).toBe(false);
    });

    it("proběhlá analýza s jinou částkou → neshoda", () => {
        expect(hasAmountMismatch("1500", 1600)).toBe(true);
        expect(hasAmountMismatch("1500", "1500.00")).toBe(false);
    });
});

describe("potvrzení neshody hospodářem (isMismatchAcknowledged)", () => {
    const ack = { mismatchAcknowledgedAmount: "1500", mismatchAcknowledgedAnalyzedAmount: "65.20" };

    it("váže se přesně na potvrzenou dvojici (amount, analyzedAmount)", () => {
        expect(isMismatchAcknowledged(1500, 65.2, ack)).toBe(true);
    });

    it("změna částky nebo nový doklad potvrzení zneplatní", () => {
        expect(isMismatchAcknowledged(1600, 65.2, ack)).toBe(false);
        expect(isMismatchAcknowledged(1500, 70, ack)).toBe(false);
    });

    it("bez uloženého snapshotu není nic potvrzeno", () => {
        expect(isMismatchAcknowledged(1500, 65.2, { mismatchAcknowledgedAmount: null, mismatchAcknowledgedAnalyzedAmount: null })).toBe(false);
    });
});

describe("nevyřešená neshoda blokuje odeslání vyúčtování (hasUnresolvedMismatch)", () => {
    const ack = { mismatchAcknowledgedAmount: "1500", mismatchAcknowledgedAnalyzedAmount: "65.20" };

    it("neshoda bez potvrzení blokuje, s potvrzením ne", () => {
        expect(hasUnresolvedMismatch(1500, 65.2, { mismatchAcknowledgedAmount: null, mismatchAcknowledgedAnalyzedAmount: null })).toBe(true);
        expect(hasUnresolvedMismatch(1500, 65.2, ack)).toBe(false);
    });

    it("shoda částek nikdy neblokuje", () => {
        expect(hasUnresolvedMismatch(1500, 1500, { mismatchAcknowledgedAmount: null, mismatchAcknowledgedAnalyzedAmount: null })).toBe(false);
    });
});

describe("brána při zamčených předpisech (evaluateLockedMismatchGate)", () => {
    it("shoda částek projde komukoli", () => {
        expect(evaluateLockedMismatchGate({ amount: "1500", analyzedAmount: 1500, isTreasurer: false, confirmMismatch: false }))
            .toEqual({ ok: true });
    });

    it("neshodu smí uložit jen hospodář", () => {
        const gate = evaluateLockedMismatchGate({ amount: "1500", analyzedAmount: 1600, isTreasurer: false, confirmMismatch: false });
        expect(gate.ok).toBe(false);
        if (!gate.ok) expect(gate.code).toBe("needs_treasurer");
    });

    it("hospodář musí neshodu explicitně potvrdit", () => {
        const gate = evaluateLockedMismatchGate({ amount: "1500", analyzedAmount: 1600, isTreasurer: true, confirmMismatch: false });
        expect(gate.ok).toBe(false);
        if (!gate.ok) expect(gate.code).toBe("needs_confirmation");

        expect(evaluateLockedMismatchGate({ amount: "1500", analyzedAmount: 1600, isTreasurer: true, confirmMismatch: true }))
            .toEqual({ ok: true });
    });
});
