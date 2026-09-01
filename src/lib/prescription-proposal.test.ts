import { describe, expect, it } from "vitest";
import { decideProposalAction } from "./prescription-proposal";

// Scénáře odpovídají docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md,
// sekce "Navrhovaný tok" — Zápis (uvnitř upsertPrescriptionAmounts).

describe("decideProposalAction", () => {
    it("nikdy reálně vygenerováno (currentAmount = 0) → přímý zápis, bez ohledu na hasPendingProposal", () => {
        expect(decideProposalAction(0, 4578, false)).toEqual({ kind: "write_amount", amount: 4578 });
        expect(decideProposalAction(0, 0, false)).toEqual({ kind: "write_amount", amount: 0 });
    });

    it("přepočet sedí s platnou částkou a nevisí žádný návrh → žádná akce", () => {
        expect(decideProposalAction(4315, 4315, false)).toEqual({ kind: "no_op" });
    });

    it("přepočet sedí s platnou částkou, ale visí starý návrh → vyčistit (nesoulad zmizel)", () => {
        expect(decideProposalAction(4315, 4315, true)).toEqual({ kind: "clear_proposal" });
    });

    it("přepočet se liší od platné částky → návrh, bez ohledu na to, jestli už nějaký visel", () => {
        expect(decideProposalAction(4315, 4578, false)).toEqual({ kind: "set_proposal", proposedAmount: 4578 });
        expect(decideProposalAction(4315, 4578, true)).toEqual({ kind: "set_proposal", proposedAmount: 4578 });
    });

    it("liší se i směrem dolů (accepted amount klesl)", () => {
        expect(decideProposalAction(4578, 4315, false)).toEqual({ kind: "set_proposal", proposedAmount: 4315 });
    });
});
