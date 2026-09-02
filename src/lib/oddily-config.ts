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

/** Barevné schéma HTML mailů (vyúčtování, pokyn k úhradě) — vizuálně odlišuje oddíly. */
export const ODDIL_EMAIL_COLORS: Record<Oddil, {
    header: string;
    headerSubtitle: string;
    accent: string;
    totalBg: string;
    totalBorder: string;
    totalText: string;
    groupBg: string;
    groupBorderTop: string;
    groupBorderBottom: string;
}> = {
    ovt: {
        header: "#327600",
        headerSubtitle: "#a3d977",
        accent: "#327600",
        totalBg: "#dcfce7",
        totalBorder: "#86efac",
        totalText: "#15803d",
        groupBg: "#f0fdf4",
        groupBorderTop: "#86efac",
        groupBorderBottom: "#d1fae5",
    },
    tom: {
        header: "#1d4ed8",
        headerSubtitle: "#93c5fd",
        accent: "#1d4ed8",
        totalBg: "#dbeafe",
        totalBorder: "#93c5fd",
        totalText: "#1d4ed8",
        groupBg: "#eff6ff",
        groupBorderTop: "#93c5fd",
        groupBorderBottom: "#bfdbfe",
    },
};

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
