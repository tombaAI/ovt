export const expenseCategoryEnum = [
    "doprava",
    "jidlo",
    "ubytovani",
    "pronajem",
    "kancelarske",
    "sportovni_material",
    "postovni",
    "startovne",
    "priprava",
    "sluzby_mezinarodni",
    "odmeny_rozhodcim",
    "ostatni",
] as const;

export type ExpenseCategory = typeof expenseCategoryEnum[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
    doprava:            "Doprava",
    jidlo:              "Jídlo",
    ubytovani:          "Ubytování",
    pronajem:           "Pronájem",
    kancelarske:        "Kancelářské potřeby a ostatní materiál",
    sportovni_material: "Spotřeba sportovního materiálu",
    postovni:           "Poštovní služby",
    startovne:          "Startovné a registrace",
    priprava:           "Náklady na přípravu",
    sluzby_mezinarodni: "Služby – mezinárodní činnost",
    odmeny_rozhodcim:   "Odměny rozhodčím",
    ostatni:            "Ostatní",
};
