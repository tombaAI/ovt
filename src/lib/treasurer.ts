import type { Oddil } from "@/db/schema";
import { ODDIL_VALUES } from "@/lib/oddily-config";

/**
 * Hospodář (`TREASURER_EMAIL`) — jediná role s právem potvrdit citlivé operace u akcí,
 * které už vybírají peníze / mají zamčené předpisy (např. neshodu částky při výměně dokladu,
 * úpravu už vybíraných přihlášek). Mimo zamčený stav neshodu řeší kterýkoli admin.
 * Týká se výhradně OVT — běžné akce dělá v appce jen OVT (`event.oddil` je u nich vždy 'ovt').
 */
export function isTreasurer(email: string | null | undefined): boolean {
    const treasurerEmail = process.env.TREASURER_EMAIL?.trim().toLowerCase();
    return !!treasurerEmail && !!email && email.toLowerCase() === treasurerEmail;
}

const ODDIL_TREASURER_ENV: Record<Oddil, string> = {
    ovt: "TREASURER_EMAIL",
    tom: "TREASURER_EMAIL_TOM",
};

/**
 * Hospodář KONKRÉTNÍHO oddílu (provozní výdaje — spec 2026-08-31-provozni-vydaje-vice-oddilu.md).
 * `isTreasurerOfOddil(email, 'ovt')` je záměrně identické s `isTreasurer(email)` — čte stejný env.
 *
 * Hospodář OVT je nad ostatními odd íly "superhospodář" — smí uzamknout/odeslat/založit
 * i za druhý oddíl (rozhodnutí 2026-09-02, po dotazu na testování bez přístupu k účtu
 * druhého hospodáře). Asymetricky: hospodář jiného oddílu do OVT stejné právo nemá.
 */
export function isTreasurerOfOddil(email: string | null | undefined, oddil: Oddil): boolean {
    if (isTreasurer(email)) return true;
    const treasurerEmail = process.env[ODDIL_TREASURER_ENV[oddil]]?.trim().toLowerCase();
    return !!treasurerEmail && !!email && email.toLowerCase() === treasurerEmail;
}

/** Je hospodářem alespoň jednoho oddílu — gate na vstup do sekce Provoz a detail provozního výdaje. */
export function isAnyOddilTreasurer(email: string | null | undefined): boolean {
    return ODDIL_VALUES.some(oddil => isTreasurerOfOddil(email, oddil));
}
