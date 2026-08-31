import { afterEach, describe, expect, it, vi } from "vitest";
import { isAnyOddilTreasurer, isTreasurer, isTreasurerOfOddil } from "./treasurer";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("isTreasurer", () => {
    it("shoduje se case-insensitive s TREASURER_EMAIL", () => {
        vi.stubEnv("TREASURER_EMAIL", "hospodar@ovt.cz");
        expect(isTreasurer("Hospodar@OVT.cz")).toBe(true);
        expect(isTreasurer("jiny@ovt.cz")).toBe(false);
    });

    it("bez nastaveného env vrací vždy false", () => {
        vi.stubEnv("TREASURER_EMAIL", "");
        expect(isTreasurer("cokoli@ovt.cz")).toBe(false);
    });
});

describe("isTreasurerOfOddil", () => {
    it("ovt čte TREASURER_EMAIL, tom čte TREASURER_EMAIL_TOM — nezávisle", () => {
        vi.stubEnv("TREASURER_EMAIL", "hospodar-ovt@test.local");
        vi.stubEnv("TREASURER_EMAIL_TOM", "hospodarka-tom@test.local");

        expect(isTreasurerOfOddil("hospodar-ovt@test.local", "ovt")).toBe(true);
        expect(isTreasurerOfOddil("hospodar-ovt@test.local", "tom")).toBe(false);
        expect(isTreasurerOfOddil("hospodarka-tom@test.local", "tom")).toBe(true);
        expect(isTreasurerOfOddil("hospodarka-tom@test.local", "ovt")).toBe(false);
    });

    it("isTreasurerOfOddil(email, 'ovt') je identické s isTreasurer(email)", () => {
        vi.stubEnv("TREASURER_EMAIL", "hospodar-ovt@test.local");
        expect(isTreasurerOfOddil("hospodar-ovt@test.local", "ovt")).toBe(isTreasurer("hospodar-ovt@test.local"));
    });
});

describe("isAnyOddilTreasurer", () => {
    it("vrátí true pro hospodáře kteréhokoli ze dvou oddílů", () => {
        vi.stubEnv("TREASURER_EMAIL", "hospodar-ovt@test.local");
        vi.stubEnv("TREASURER_EMAIL_TOM", "hospodarka-tom@test.local");

        expect(isAnyOddilTreasurer("hospodar-ovt@test.local")).toBe(true);
        expect(isAnyOddilTreasurer("hospodarka-tom@test.local")).toBe(true);
        expect(isAnyOddilTreasurer("nekdo-jiny@test.local")).toBe(false);
        expect(isAnyOddilTreasurer(null)).toBe(false);
    });
});
