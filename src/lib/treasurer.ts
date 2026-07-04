/**
 * Hospodář (`TREASURER_EMAIL`) — jediná role s právem potvrdit citlivé operace u akcí,
 * které už vybírají peníze / mají zamčené předpisy (např. neshodu částky při výměně dokladu,
 * úpravu už vybíraných přihlášek). Mimo zamčený stav neshodu řeší kterýkoli admin.
 */
export function isTreasurer(email: string | null | undefined): boolean {
    const treasurerEmail = process.env.TREASURER_EMAIL?.trim().toLowerCase();
    return !!treasurerEmail && !!email && email.toLowerCase() === treasurerEmail;
}
