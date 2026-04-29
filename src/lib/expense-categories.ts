export const expenseCategoryEnum = [
    "501/004",
    "501/006",
    "511/002",
    "518/001",
    "518/003",
    "518/004",
    "518/008",
    "518/009",
    "518/010",
    "518/011",
    "518/012",
    "518/014",
    "549/004",
] as const;

export type ExpenseCategory = typeof expenseCategoryEnum[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
    "501/004": "Kancelářské potřeby, ostatní materiál",
    "501/006": "Spotřeba sportovního materiálu",
    "511/002": "Oprava sportovních potřeb",
    "518/001": "Nájem tělocvičen, bazénů",
    "518/003": "Spoje",
    "518/004": "Poštovné",
    "518/008": "Startovné, registrace",
    "518/009": "Soutěže, ubytování, doprava",
    "518/010": "Služby – náklady na přípravu",
    "518/011": "Služby – náklady na soustředění",
    "518/012": "Služby – mezinárodní činnost",
    "518/014": "Přestupy, hostování",
    "549/004": "Odměny rozhodčím",
};
