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

/**
 * Obě strany porovnání musí být na stejné přesnosti jako úložiště (numeric(10,2)).
 * `currentAmount` přišel z DB už zaokrouhlený na 2 desetinná místa, `newAmount` je
 * čerstvý přepočet s nezaokrouhleným dělením zálohy počtem osob (např. 1666.6666666666665).
 * Bez zaokrouhlení by se ekonomicky stejná částka lišila o zlomek haléře, návrh by se
 * donekonečna vytvářel znovu a nikdy by nešel vyčistit.
 */
function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export function decideProposalAction(
    currentAmount: number,
    newAmount: number,
    hasPendingProposal: boolean,
): ProposalAction {
    const current = round2(currentAmount);
    const next = round2(newAmount);
    if (current === 0) return { kind: "write_amount", amount: next };
    if (current === next) return hasPendingProposal ? { kind: "clear_proposal" } : { kind: "no_op" };
    return { kind: "set_proposal", proposedAmount: next };
}
