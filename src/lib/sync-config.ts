export const SYNC_UPDATABLE_FIELDS = {
    email:       "Email",
    phone:       "Telefon",
    address:     "Adresa",
    birthDate:   "Datum narození",
    birthNumber: "Rodné číslo",
    gender:      "Pohlaví",
    nickname:    "Přezdívka",
    fullName:    "Celé jméno",
    cskNumber:   "Číslo ČSK",
} as const;

export type SyncUpdatableField = keyof typeof SYNC_UPDATABLE_FIELDS;
