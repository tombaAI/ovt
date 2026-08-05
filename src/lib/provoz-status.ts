/**
 * Odvozený stav provozního výdaje (spec 2026-08-05-provozni-vydaje.md).
 * Odemčení po odeslání vrací stav na "rozpracovano" — signalizuje, že se
 * částky znovu upravují a před dalším odesláním musí být znovu uzamčeny.
 */
export type ProvozniStav = "rozpracovano" | "uzamceno" | "odeslano";

export const PROVOZNI_STAV_LABELS: Record<ProvozniStav, string> = {
    rozpracovano: "Rozpracováno",
    uzamceno: "Částky uzamčeny",
    odeslano: "Odesláno na TJ",
};

export function deriveProvozniStav(
    billingStatus: "draft" | "prescribed",
    sentToTj: boolean,
): ProvozniStav {
    if (billingStatus === "draft") return "rozpracovano";
    return sentToTj ? "odeslano" : "uzamceno";
}
