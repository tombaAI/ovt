export const SYNC_UPDATABLE_FIELDS = {
    firstName:   "Jméno",
    lastName:    "Příjmení",
    email:       "Email",
    phone:       "Telefon",
    address:     "Adresa",
    birthDate:   "Datum narození",
    birthNumber: "Rodné číslo",
    gender:      "Pohlaví",
    nickname:    "Přezdívka",
    cskNumber:   "Číslo ČSK",
} as const;

export type SyncUpdatableField = keyof typeof SYNC_UPDATABLE_FIELDS;
