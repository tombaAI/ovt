/** Česká jména polí pro zobrazení v audit logu */
export const FIELD_LABELS: Record<string, string> = {
    firstName:              "Jméno",
    lastName:               "Příjmení",
    fullName:               "Celé jméno",   // legacy audit záznamy
    nickname:               "Přezdívka",
    userLogin:              "Login",
    email:                  "E-mail",
    phone:                  "Telefon",
    gender:                 "Pohlaví",
    address:                "Adresa",
    variableSymbol:         "Variabilní symbol",
    cskNumber:              "Číslo ČSK",
    note:                   "Poznámka",
    todoNote:               "Úkol k řešení",
    memberFrom:             "Člen od",
    memberTo:               "Člen do",
    memberToNote:           "Důvod ukončení",
    isCommittee:            "Člen výboru",
    isTom:                  "Vedoucí TOM",
    discountIndividual:     "Individuální sleva (Kč)",
    membership_terminated:  "Ukončení členství",
    // payment fields
    isPaid:                 "Zaplaceno",
    paidAmount:             "Částka (Kč)",
    paidAt:                 "Datum platby",
};
