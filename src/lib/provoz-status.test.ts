import { describe, expect, it } from "vitest";
import { deriveProvozniStav } from "./provoz-status";

describe("deriveProvozniStav", () => {
    it("draft bez odeslání = rozpracováno", () => {
        expect(deriveProvozniStav("draft", false)).toBe("rozpracovano");
    });
    it("prescribed bez odeslání = částky uzamčeny", () => {
        expect(deriveProvozniStav("prescribed", false)).toBe("uzamceno");
    });
    it("prescribed s odesláním = odesláno na TJ", () => {
        expect(deriveProvozniStav("prescribed", true)).toBe("odeslano");
    });
    it("draft s odesláním (odemčeno po odeslání) = zpět rozpracováno", () => {
        expect(deriveProvozniStav("draft", true)).toBe("rozpracovano");
    });
});
