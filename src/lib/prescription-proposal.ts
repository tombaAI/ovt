/**
 * Rozhodovací logika pro krok "zápis" v upsertPrescriptionAmounts (event-settlement.ts) —
 * viz docs/superpowers/specs/2026-08-03-schvalovani-zmeny-castky-predpisu.md.
 * Čistá funkce, žádná DB závislost — jediné místo, které určuje, kdy se smí částka
 * settlement předpisu přepsat přímo a kdy musí vzniknout návrh k potvrzení.
 */

export type ProposalAction =
    | { kind: "write_amount"; amount: number }
    | { kind: "no_op" }
    | { kind: "clear_proposal" }
    | { kind: "set_proposal"; proposedAmount: number };

export function decideProposalAction(
    currentAmount: number,
    newAmount: number,
    hasPendingProposal: boolean,
): ProposalAction {
    if (currentAmount === 0) return { kind: "write_amount", amount: newAmount };
    if (currentAmount === newAmount) return hasPendingProposal ? { kind: "clear_proposal" } : { kind: "no_op" };
    return { kind: "set_proposal", proposedAmount: newAmount };
}
