import type { EventType, EventStatus } from "@/db/schema";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
    cpv:          "ČPV",
    foreign:      "Zahraniční",
    recreational: "Rekreační sjezd",
    club:         "Oddílová akce",
    race:         "Závod",
    brigada:      "Brigáda",
    other:        "Jiné",
    provozni:     "Provozní výdaj",
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
    planned:   "V plánu",
    confirmed: "Potvrzeno",
    cancelled: "Zrušeno",
    completed: "Proběhlo",
};

/**
 * Typy nabízené v selectech typu akce. `provozni` je záměrně vynechán —
 * provozní výdaje vznikají výhradně tlačítkem na /dashboard/provoz a běžná
 * akce se na provozní výdaj nesmí přepnout (a naopak).
 */
export const SELECTABLE_EVENT_TYPES = (Object.entries(EVENT_TYPE_LABELS) as [EventType, string][])
    .filter(([k]) => k !== "provozni");

export const MONTH_NAMES = [
    "", "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];
