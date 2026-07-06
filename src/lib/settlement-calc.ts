/**
 * Čisté výpočetní funkce pro vyúčtování nákladů akce — bez DB/Next.js závislostí,
 * takže jsou přímo unit testovatelné (viz settlement-calc.test.ts).
 *
 * Implementují kroky 1–8 z zadani/ZADANI_VYPOCET_NAKLADU_AKCE.md. `getEventSettlement`
 * (src/lib/actions/event-settlement.ts) je po načtení dat z DB jen volá — to je to jediné
 * místo, kde se výpočet provádí, ať zobrazení nákladů a generování předpisu nikdy nedají
 * jiné číslo (viz issue #28 — propadlá záloha se kdysi počítala dvakrát, pokaždé jinak).
 *
 * Princip: plná přesnost (float) přes všechny kroky, zaokrouhlení nahoru na celé Kč
 * přesně JEDNOU — v kroku 7, pro finální částku jednoho účastníka. Jediná výjimka:
 * dotace na člena se zaokrouhluje DOLŮ už v kroku 6 (viz computeSubsidyPerMember).
 */

export type AllocationMethod = "split_all" | "per_registration" | "with_coefficients";

export type PersonKey = { key: string; registrationId: number; memberId: number | null };

// ── Krok 1: klíče aktivních účastníků a jejich váhy per náklad ───────────────

/**
 * Generuje klíče aktivních (neodhlášených) účastníků jedné přihlášky.
 * "p{participantId}" pro jmenované účastníky, "r{regId}-{idx}" pro bezejmenné
 * (fallback dle personsCount, když přihláška nemá záznamy v event_registration_participants).
 *
 * Stejná identifikace se používá v participantCoefficients (setExpenseParticipantCoefficients) —
 * klíče se MUSÍ shodovat, jinak koeficienty při čtení neodpovídají tomu, co bylo uloženo.
 */
export function activePersonKeysForRegistration(
    regId: number,
    personsCount: number | null,
    regParticipants: { id: number; cancelledAt: Date | null }[],
): string[] {
    if (regParticipants.length > 0) {
        return regParticipants
            .map((p, i) => ({ key: p.id > 0 ? `p${p.id}` : `r${regId}-${i}`, active: !p.cancelledAt }))
            .filter(pk => pk.active)
            .map(pk => pk.key);
    }
    return Array.from({ length: personsCount ?? 1 }, (_, i) => `r${regId}-${i}`);
}

/** Váhy pro náklad rozpočítaný "split_all" — každý aktivní účastník akce má váhu 1. */
export function computeSplitAllWeights(allPersonKeys: PersonKey[]): Map<string, number> {
    return new Map(allPersonKeys.map(k => [k.key, 1]));
}

/**
 * Váhy pro náklad rozpočítaný "with_coefficients" — koeficienty jsou jediný zdroj pravdy,
 * žádná derivovaná Kč tabulka. Chybějící klíč (účastník přidaný po uložení koeficientů)
 * = váha 0, dokud admin nedoplní. Bez koeficientů vůbec (teoreticky — with_coefficients se
 * vždy ukládá společně s nimi) → fallback rovnoměrně (váha 1 pro všechny).
 */
export function computeCoefficientWeights(
    allPersonKeys: PersonKey[],
    coefficients: Record<string, number> | null,
): Map<string, number> {
    return new Map(allPersonKeys.map(k => [k.key, coefficients ? (coefficients[k.key] ?? 0) : 1]));
}

/**
 * Váhy pro náklad rozpočítaný "per_registration" (manuální Kč částka per přihláška, bez
 * koeficientů) — váha přihlášky se rozpočítá rovným dílem na její aktivní účastníky.
 * Bez jakýchkoli zadaných alokací (admin zatím nic nevyplnil) → fallback: rovnoměrně na
 * všechny aktivní účastníky akce (jako split_all).
 */
export function computePerRegistrationWeights(
    personKeysByReg: Map<number, PersonKey[]>,
    allocationsByRegistration: Map<number, number>,
): Map<string, number> {
    const allPersonKeys = Array.from(personKeysByReg.values()).flat();
    if (allocationsByRegistration.size === 0) {
        return new Map(allPersonKeys.map(k => [k.key, 1]));
    }
    const weights = new Map<string, number>();
    for (const [regId, keys] of personKeysByReg) {
        const regWeight = allocationsByRegistration.get(regId) ?? 0;
        const per = keys.length > 0 ? regWeight / keys.length : 0;
        for (const k of keys) weights.set(k.key, per);
    }
    return weights;
}

/** Celková váha nákladu = suma vah všech aktivních účastníků akce. */
export function sumWeights(allPersonKeys: PersonKey[], weights: Map<string, number>): number {
    return allPersonKeys.reduce((s, k) => s + (weights.get(k.key) ?? 0), 0);
}

// ── Krok 2: propadlá záloha ───────────────────────────────────────────────────

/** Propadlá část zálohy jednoho odhlášeného účastníka — fixní podíl minus to, co se mu vrátilo. */
export function calcParticipantForfeit(depositPerPerson: number, refundAmount: number): number {
    return Math.max(0, depositPerPerson - refundAmount);
}

export type ForfeitingParticipant = {
    registrationId: number;
    depositForfeitPolicy: "forfeit_to_expense" | "forfeit_split" | "forfeit_to_club" | null;
    depositForfeitExpenseId: number | null;
    depositRefundAmount: number | null;
};

export type RegistrationDeposit = { amount: number; personsCount: number };

/**
 * Suma propadlých záloh napojených na konkrétní náklad (depositForfeitPolicy = "forfeit_to_expense",
 * depositForfeitExpenseId = expenseId), přes všechny odhlášené účastníky.
 * `depositPerPerson = depositPrescription.amount / personsCount` (fixní sazba, odvozeno).
 */
export function calcForfeitForExpense(
    expenseId: number,
    cancelledParticipants: ForfeitingParticipant[],
    depositByRegistration: Map<number, RegistrationDeposit>,
): number {
    return cancelledParticipants
        .filter(p => p.depositForfeitPolicy === "forfeit_to_expense" && p.depositForfeitExpenseId === expenseId)
        .reduce((sum, p) => {
            const dep = depositByRegistration.get(p.registrationId);
            if (!dep) return sum;
            const depositPerPerson = dep.amount / (dep.personsCount || 1);
            return sum + calcParticipantForfeit(depositPerPerson, p.depositRefundAmount ?? 0);
        }, 0);
}

/** Efektivní (zálohou snížená) částka nákladu — nikdy pod nulu. */
export function calcEffectiveAmount(amount: number, totalForfeit: number): number {
    return Math.max(0, amount - totalForfeit);
}

// ── Krok 3: cena za jednotku váhy — plná přesnost, žádné zaokrouhlení ───────

export function computeUnitPrice(effectiveAmount: number, totalWeight: number): number {
    return totalWeight > 0 ? effectiveAmount / totalWeight : 0;
}

// ── Krok 6: dotace na člena — zaokrouhlení DOLŮ už tady ─────────────────────

/**
 * Výjimka z "zaokrouhli jen jednou": dotace na člena se zaokrouhluje DOLŮ na celé Kč
 * hned v kroku 6, aby součet skutečně přiznané dotace nikdy nepřekročil schválenou
 * částku event.subsidyPerMember (zbytek zůstává klubu).
 */
export function computeSubsidyPerMember(subsidyTotal: number, totalMemberParticipants: number): number {
    return totalMemberParticipants > 0 ? Math.floor(subsidyTotal / totalMemberParticipants) : 0;
}

// ── Krok 7: JEDINÉ zaokrouhlení v celém výpočtu — finální částka účastníka ──

/** Zaokrouhlení nahoru na celé Kč s tolerancí na chyby plovoucí desetinné čárky. */
export function ceilMoney(value: number): number {
    return Math.ceil(value - 1e-9) + 0; // + 0 normalizuje -0 (Math.ceil(-1e-9) === -0)
}

export function computeParticipantFinalAmount(totalCost: number, subsidyAmount: number): number {
    return ceilMoney(Math.max(0, totalCost - subsidyAmount));
}

// ── Krok 8: doplatek přihlášky = součet už zaokrouhlených částek účastníků ──

export function sumRegistrationTotal(participantFinalAmounts: number[]): number {
    return participantFinalAmounts.reduce((s, a) => s + a, 0);
}

export type DepositPrescriptionLike = {
    status: string;
    amount: number;
    matchedAmount: number | null;
    depositPromise: boolean;
};

/** Efektivní záloha pro výpočet doplatku — odečítáme jen co skutečně přišlo nebo je přislíbeno. */
export function effectiveDepositAmount(dep: DepositPrescriptionLike | null): number {
    if (!dep) return 0;
    if (dep.status === "matched" || dep.status === "paid") return dep.matchedAmount ?? dep.amount;
    if (dep.depositPromise) return dep.amount;
    return 0;
}

export function computeSettlementAmount(registrationTotal: number, effectiveDeposit: number): number {
    return Math.max(0, registrationTotal - effectiveDeposit);
}
