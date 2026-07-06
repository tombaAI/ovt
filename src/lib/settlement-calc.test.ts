import { describe, expect, it } from "vitest";

import {
    activePersonKeysForRegistration,
    calcEffectiveAmount,
    calcForfeitForExpense,
    calcParticipantForfeit,
    ceilMoney,
    computeCoefficientWeights,
    computeParticipantFinalAmount,
    computePerRegistrationWeights,
    computeSettlementAmount,
    computeSplitAllWeights,
    computeSubsidyPerMember,
    computeUnitPrice,
    effectiveDepositAmount,
    sumRegistrationTotal,
    sumWeights,
    type PersonKey,
} from "./settlement-calc";

// Scénáře odpovídají krokům 1–8 v zadani/2026-06-24-vypocet-nakladu-akce.md.

const pk = (key: string, registrationId = 1, memberId: number | null = null): PersonKey =>
    ({ key, registrationId, memberId });

describe("krok 1 — klíče účastníků (activePersonKeysForRegistration)", () => {
    it("jmenovaní účastníci dostanou klíč p{id}, odhlášení se vynechají", () => {
        const keys = activePersonKeysForRegistration(5, 3, [
            { id: 11, cancelledAt: null },
            { id: 12, cancelledAt: new Date("2026-06-01") },
            { id: 13, cancelledAt: null },
        ]);
        expect(keys).toEqual(["p11", "p13"]);
    });

    it("účastník bez id (<= 0) dostane fallback klíč r{regId}-{idx}", () => {
        const keys = activePersonKeysForRegistration(5, null, [
            { id: 0, cancelledAt: null },
            { id: 14, cancelledAt: null },
        ]);
        expect(keys).toEqual(["r5-0", "p14"]);
    });

    it("přihláška bez záznamů účastníků → fallback dle personsCount", () => {
        expect(activePersonKeysForRegistration(7, 3, [])).toEqual(["r7-0", "r7-1", "r7-2"]);
    });

    it("personsCount null → jedna osoba", () => {
        expect(activePersonKeysForRegistration(7, null, [])).toEqual(["r7-0"]);
    });
});

describe("krok 1 — váhy dle allocationMethod", () => {
    const all = [pk("p1", 1, 10), pk("p2", 1, null), pk("p3", 2, 11)];

    it("split_all: každý aktivní účastník má váhu 1", () => {
        const w = computeSplitAllWeights(all);
        expect([...w.values()]).toEqual([1, 1, 1]);
        expect(sumWeights(all, w)).toBe(3);
    });

    it("with_coefficients: koeficienty se přeberou, chybějící klíč = váha 0 (nový účastník po uložení koeficientů)", () => {
        const w = computeCoefficientWeights(all, { p1: 2, p3: 0.5 });
        expect(w.get("p1")).toBe(2);
        expect(w.get("p2")).toBe(0); // klíč chybí → 0, dokud admin nedoplní
        expect(w.get("p3")).toBe(0.5);
        expect(sumWeights(all, w)).toBe(2.5);
    });

    it("with_coefficients bez koeficientů → fallback rovnoměrně (váha 1)", () => {
        const w = computeCoefficientWeights(all, null);
        expect([...w.values()]).toEqual([1, 1, 1]);
    });

    it("per_registration: Kč částka přihlášky se rozpočítá rovným dílem na její aktivní účastníky", () => {
        const byReg = new Map([
            [1, [pk("p1", 1), pk("p2", 1)]],
            [2, [pk("p3", 2)]],
        ]);
        const w = computePerRegistrationWeights(byReg, new Map([[1, 600], [2, 400]]));
        expect(w.get("p1")).toBe(300);
        expect(w.get("p2")).toBe(300);
        expect(w.get("p3")).toBe(400);
    });

    it("per_registration: přihláška bez zadané alokace má váhu 0", () => {
        const byReg = new Map([
            [1, [pk("p1", 1)]],
            [2, [pk("p3", 2)]],
        ]);
        const w = computePerRegistrationWeights(byReg, new Map([[1, 500]]));
        expect(w.get("p1")).toBe(500);
        expect(w.get("p3")).toBe(0);
    });

    it("per_registration bez jakýchkoli alokací → fallback rovnoměrně (jako split_all)", () => {
        const byReg = new Map([[1, [pk("p1", 1), pk("p2", 1)]]]);
        const w = computePerRegistrationWeights(byReg, new Map());
        expect(w.get("p1")).toBe(1);
        expect(w.get("p2")).toBe(1);
    });
});

describe("krok 2 — propadlá záloha", () => {
    it("propadlá část = fixní podíl zálohy minus vrácená částka", () => {
        expect(calcParticipantForfeit(400, 100)).toBe(300);
    });

    it("vrácení vyšší než podíl zálohy nikdy nedá zápornou propadlou částku", () => {
        expect(calcParticipantForfeit(400, 500)).toBe(0);
    });

    it("do nákladu se počítají jen odhlášení s politikou forfeit_to_expense a odpovídajícím expenseId", () => {
        const cancelled = [
            { registrationId: 1, depositForfeitPolicy: "forfeit_to_expense" as const, depositForfeitExpenseId: 100, depositRefundAmount: 100 },
            { registrationId: 1, depositForfeitPolicy: "forfeit_to_expense" as const, depositForfeitExpenseId: 999, depositRefundAmount: 0 },
            { registrationId: 2, depositForfeitPolicy: "forfeit_to_club" as const, depositForfeitExpenseId: 100, depositRefundAmount: 0 },
            { registrationId: 2, depositForfeitPolicy: null, depositForfeitExpenseId: null, depositRefundAmount: null },
        ];
        const deposits = new Map([
            [1, { amount: 800, personsCount: 2 }], // 400 / osoba
            [2, { amount: 600, personsCount: 1 }],
        ]);
        // Jen první účastník: 800/2 − 100 = 300
        expect(calcForfeitForExpense(100, cancelled, deposits)).toBe(300);
    });

    it("přihláška bez předpisu zálohy nepropadá nic", () => {
        const cancelled = [
            { registrationId: 9, depositForfeitPolicy: "forfeit_to_expense" as const, depositForfeitExpenseId: 100, depositRefundAmount: 0 },
        ];
        expect(calcForfeitForExpense(100, cancelled, new Map())).toBe(0);
    });

    it("efektivní částka nákladu nikdy neklesne pod nulu", () => {
        expect(calcEffectiveAmount(1000, 300)).toBe(700);
        expect(calcEffectiveAmount(200, 500)).toBe(0);
    });
});

describe("krok 3 — cena za jednotku váhy (plná přesnost)", () => {
    it("dělí efektivní částku celkovou váhou bez zaokrouhlení", () => {
        expect(computeUnitPrice(100, 3)).toBeCloseTo(33.3333333, 6);
    });

    it("nulová celková váha → cena 0 (žádné dělení nulou)", () => {
        expect(computeUnitPrice(1000, 0)).toBe(0);
    });
});

describe("krok 6 — dotace na člena se zaokrouhluje DOLŮ (regrese fixu 66ab632)", () => {
    it("floor: součet přiznané dotace nepřekročí schválenou částku", () => {
        expect(computeSubsidyPerMember(1000, 3)).toBe(333);
        expect(333 * 3).toBeLessThanOrEqual(1000);
    });

    it("bez členů žádná dotace", () => {
        expect(computeSubsidyPerMember(1000, 0)).toBe(0);
    });
});

describe("krok 7 — jediné zaokrouhlení nahoru (ceilMoney)", () => {
    it("zaokrouhluje nahoru na celé Kč", () => {
        expect(ceilMoney(100.01)).toBe(101);
        expect(ceilMoney(100)).toBe(100);
    });

    it("toleruje chybu plovoucí desetinné čárky (nezaokrouhlí 1200.0000000000002 na 1201)", () => {
        expect(ceilMoney(1200 + 2e-13)).toBe(1200);
    });

    it("finální částka účastníka = ceil(max(0, náklad − dotace))", () => {
        expect(computeParticipantFinalAmount(1900.4, 500)).toBe(1401);
        expect(computeParticipantFinalAmount(300, 500)).toBe(0); // dotace vyšší než náklad → 0, ne záporná
    });
});

describe("krok 8 — doplatek přihlášky", () => {
    it("doplatek = součet UŽ zaokrouhlených částek účastníků, ne ceil součtu", () => {
        // 3× 33.34 (ceil z 100/3) = 101, zatímco ceil(100) by bylo 100
        const perParticipant = [1, 2, 3].map(() => computeParticipantFinalAmount(100 / 3, 0));
        expect(perParticipant).toEqual([34, 34, 34]);
        expect(sumRegistrationTotal(perParticipant)).toBe(102);
    });

    it("efektivní záloha: matched/paid → skutečně přišlá částka, příslib → předepsaná, jinak 0", () => {
        const base = { status: "sent", amount: 800, matchedAmount: null, depositPromise: false };
        expect(effectiveDepositAmount({ ...base, status: "matched", matchedAmount: 750 })).toBe(750);
        expect(effectiveDepositAmount({ ...base, status: "paid" })).toBe(800); // bez matchedAmount → předepsaná
        expect(effectiveDepositAmount({ ...base, depositPromise: true })).toBe(800);
        expect(effectiveDepositAmount(base)).toBe(0);
        expect(effectiveDepositAmount(null)).toBe(0);
    });

    it("doplatek nikdy není záporný (přeplacená záloha se nevrací předpisem)", () => {
        expect(computeSettlementAmount(400, 500)).toBe(0);
        expect(computeSettlementAmount(1500, 500)).toBe(1000);
    });
});

describe("vzorový průchod kroky 1–8 (mini akce dle zadání)", () => {
    // Akce: bus 3000 Kč (split_all), ubytování 2000 Kč (with_coefficients).
    // Reg 1: p1 (člen), p2 (nečlen). Reg 2: p3 (člen) + odhlášený se zálohou
    // 800 Kč / 2 osoby, refund 100 → propadá 300 do busu (issue #28: jen jednou).
    // Dotace akce 1000 Kč na 2 aktivní členy → floor(500) = 500.
    const all = [pk("p1", 1, 10), pk("p2", 1, null), pk("p3", 2, 11)];
    const cancelled = [
        { registrationId: 2, depositForfeitPolicy: "forfeit_to_expense" as const, depositForfeitExpenseId: 1, depositRefundAmount: 100 },
    ];
    const deposits = new Map([[2, { amount: 800, personsCount: 2 }]]);

    it("dá stejné částky jako ruční výpočet dle zadání", () => {
        // Krok 2: bus 3000 − 300 propadlé = 2700
        const busForfeit = calcForfeitForExpense(1, cancelled, deposits);
        expect(busForfeit).toBe(300);
        const busEffective = calcEffectiveAmount(3000, busForfeit);

        // Krok 3: bus na osobu 2700/3 = 900; ubytování jen p1+p2 (koef 1+1) → 1000/os.
        const busWeights = computeSplitAllWeights(all);
        const busUnit = computeUnitPrice(busEffective, sumWeights(all, busWeights));
        const accWeights = computeCoefficientWeights(all, { p1: 1, p2: 1, p3: 0 });
        const accUnit = computeUnitPrice(2000, sumWeights(all, accWeights));
        expect(busUnit).toBe(900);
        expect(accUnit).toBe(1000);

        // Kroky 4–7: p1 = 1900 − 500 → 1400, p2 = 1900 (nečlen), p3 = 900 − 500 → 400
        const subsidy = computeSubsidyPerMember(1000, 2);
        const p1 = computeParticipantFinalAmount(busUnit + accUnit, subsidy);
        const p2 = computeParticipantFinalAmount(busUnit + accUnit, 0);
        const p3 = computeParticipantFinalAmount(busUnit, subsidy);
        expect([p1, p2, p3]).toEqual([1400, 1900, 400]);

        // Krok 8: reg 2 — záloha matched 800, z toho 300 už propadlo do busu →
        // efektivně 500 proti doplatku 400 → doplatek 0 (stejná koruna se nepočítá dvakrát).
        const regTotal = sumRegistrationTotal([p3]);
        const deposit = effectiveDepositAmount({ status: "matched", amount: 800, matchedAmount: 800, depositPromise: false });
        expect(computeSettlementAmount(regTotal, Math.max(0, deposit - busForfeit))).toBe(0);
    });
});
