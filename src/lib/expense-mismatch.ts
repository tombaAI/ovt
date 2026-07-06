// Kontrola shody zjištěné (Gemini) vs. zapsané částky nákladu akce a brána pro zamčené předpisy.
// Sdíleno mezi attach-file, reanalyze endpointy a UI (přes protažený analyzedAmount).

/**
 * Shoduje se zjištěná částka se zapsanou (po zaokrouhlení na haléře)?
 * `analyzedAmount === null` (Gemini nepřečetl) = NEshoda — nejistota se řeší stejně jako reálný rozdíl.
 */
export function analyzedMatchesAmount(
    amount: string | number | null | undefined,
    analyzedAmount: string | number | null | undefined,
): boolean {
    if (analyzedAmount == null) return false;
    if (amount == null) return false;
    const a = typeof amount === "string" ? parseFloat(amount) : amount;
    const b = typeof analyzedAmount === "string" ? parseFloat(analyzedAmount) : analyzedAmount;
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return Math.round(a * 100) === Math.round(b * 100);
}

/** Je u nákladu neshoda? Jen když už analýza proběhla (analyzedAmount != null) — jinak není co hlásit. */
export function hasAmountMismatch(
    amount: string | number | null | undefined,
    analyzedAmount: string | number | null | undefined,
): boolean {
    if (analyzedAmount == null) return false;
    return !analyzedMatchesAmount(amount, analyzedAmount);
}

function amountsEqual(
    a: string | number | null | undefined,
    b: string | number | null | undefined,
): boolean {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    const x = typeof a === "string" ? parseFloat(a) : a;
    const y = typeof b === "string" ? parseFloat(b) : b;
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    return Math.round(x * 100) === Math.round(y * 100);
}

export type MismatchAckSnapshot = {
    mismatchAcknowledgedAmount: string | number | null | undefined;
    mismatchAcknowledgedAnalyzedAmount: string | number | null | undefined;
};

/**
 * Byla AKTUÁLNÍ dvojice (amount, analyzedAmount) hospodářem potvrzena jako v pořádku (typicky
 * jiná měna dokladu)? Váže se přesně na tuto dvojici — jakákoli změna (nový doklad, oprava
 * částky) potvrzení zneplatní, protože už neodpovídá uloženému snapshotu.
 */
export function isMismatchAcknowledged(
    amount: string | number | null | undefined,
    analyzedAmount: string | number | null | undefined,
    ack: MismatchAckSnapshot,
): boolean {
    if (ack.mismatchAcknowledgedAnalyzedAmount == null) return false;
    return amountsEqual(amount, ack.mismatchAcknowledgedAmount)
        && amountsEqual(analyzedAmount, ack.mismatchAcknowledgedAnalyzedAmount);
}

/** Neshoda, která ještě nebyla hospodářem potvrzena jako v pořádku — tohle blokuje odeslání vyúčtování. */
export function hasUnresolvedMismatch(
    amount: string | number | null | undefined,
    analyzedAmount: string | number | null | undefined,
    ack: MismatchAckSnapshot,
): boolean {
    if (!hasAmountMismatch(amount, analyzedAmount)) return false;
    return !isMismatchAcknowledged(amount, analyzedAmount, ack);
}

export type MismatchGate =
    | { ok: true }
    | { ok: false; code: "needs_treasurer" | "needs_confirmation"; error: string };

/**
 * Brána pro uložení analýzy u nákladu se zamčenými předpisy (lockForParticipants).
 * Shoda → projde. Neshoda → jen hospodář, a to až po explicitním potvrzení (confirmMismatch).
 */
export function evaluateLockedMismatchGate(opts: {
    amount: string | number | null;
    analyzedAmount: string | number | null;
    isTreasurer: boolean;
    confirmMismatch: boolean;
}): MismatchGate {
    if (analyzedMatchesAmount(opts.amount, opts.analyzedAmount)) return { ok: true };
    if (!opts.isTreasurer) {
        return {
            ok: false,
            code: "needs_treasurer",
            error: "Dokud jsou předpisy uzamčené, výměnu s neshodující se částkou může provést jen hospodář.",
        };
    }
    if (!opts.confirmMismatch) {
        return {
            ok: false,
            code: "needs_confirmation",
            error: "Zjištěná částka se neshoduje se zapsanou — potvrďte uložení.",
        };
    }
    return { ok: true };
}
