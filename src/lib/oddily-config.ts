import type { Oddil } from "@/db/schema";

export const ODDIL_LABELS: Record<Oddil, string> = {
    ovt: "OVT",
    tom: "TOM",
};

export const ODDIL_NAZEV: Record<Oddil, string> = {
    ovt: "Oddíl vodní turistiky",
    tom: "Turistický oddíl mládeže",
};

export const ODDIL_KOD: Record<Oddil, string> = {
    ovt: "207",
    tom: "234",
};

export const ODDIL_VALUES = Object.keys(ODDIL_LABELS) as Oddil[];

/** Text tištěný jako "oddíl" na PDF vyúčtování a v mailu na TJ, např. "207 Oddíl vodní turistiky". */
export function getOddilNazevPlny(oddil: Oddil): string {
    return `${ODDIL_KOD[oddil]} ${ODDIL_NAZEV[oddil]}`;
}

const ODDIL_TJ_RECIPIENT_ENV: Record<Oddil, string> = {
    ovt: "EMAIL_HOSPODAR_ODDILU_TJB",
    tom: "EMAIL_HOSPODAR_ODDILU_TOM",
};

/** Příjemce mailu s vyúčtováním/pokynem k úhradě na TJ, podle oddílu. */
export function getOddilTjRecipientEmail(oddil: Oddil): string | null {
    return process.env[ODDIL_TJ_RECIPIENT_ENV[oddil]]?.trim() || null;
}
