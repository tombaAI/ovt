import type { EventType, EventStatus } from "@/db/schema";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
    cpv:          "ČPV",
    foreign:      "Zahraniční",
    recreational: "Rekreační sjezd",
    club:         "Oddílová akce",
    race:         "Závod",
    brigada:      "Brigáda",
    other:        "Jiné",
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
    planned:   "V plánu",
    confirmed: "Potvrzeno",
    cancelled: "Zrušeno",
    completed: "Proběhlo",
};

export const MONTH_NAMES = [
    "", "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];
