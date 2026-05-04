/**
 * Google Calendar klient pro OVT správu akcí.
 *
 * Autentizace: Service Account (JSON uložen v env GOOGLE_SERVICE_ACCOUNT_JSON).
 * Kalendář: definován v env GCAL_CALENDAR_ID.
 */

import { google } from "googleapis";

// ── Config ───────────────────────────────────────────────────────────────────

export const GCAL_CALENDAR_ID =
    process.env.GCAL_CALENDAR_ID ?? "m07sldpd2e2ub4920bcls24gic@group.calendar.google.com";

function getCalendarClient() {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON není nastaveno");

    const credentials = JSON.parse(raw);
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    return google.calendar({ version: "v3", auth });
}

// ── Date/time helpers ─────────────────────────────────────────────────────────

const PRAGUE_TZ = "Europe/Prague";

/** Přidá počet dní k ISO date stringu */
function addDays(iso: string, days: number): string {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * Extracts Prague-timezone date ("YYYY-MM-DD") and time ("HH:MM") from a
 * GCal dateTime string (ISO 8601 with offset, e.g. "2025-06-15T09:00:00+02:00").
 * Returns null for time if the source is an all-day date string.
 */
function parsePragueDateTime(
    field: { date?: string | null; dateTime?: string | null } | null | undefined,
): { date: string | null; time: string | null; isAllDay: boolean } {
    if (!field) return { date: null, time: null, isAllDay: true };

    if (field.date) {
        return { date: field.date, time: null, isAllDay: true };
    }

    if (field.dateTime) {
        const d = new Date(field.dateTime);
        const date = d.toLocaleDateString("en-CA", { timeZone: PRAGUE_TZ }); // "YYYY-MM-DD"
        const time = d.toLocaleTimeString("en-GB", {                          // "HH:MM:SS"
            timeZone: PRAGUE_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
        }).slice(0, 5); // "HH:MM"
        return { date, time, isAllDay: false };
    }

    return { date: null, time: null, isAllDay: true };
}

// ── Public API ────────────────────────────────────────────────────────────────

export type GCalEventInput = {
    summary: string;
    description?: string | null;
    location?: string | null;
    dateFrom: string;        // "YYYY-MM-DD"
    dateTo?: string | null;  // "YYYY-MM-DD", inclusive — null = jednodenní
    timeFrom?: string | null; // "HH:MM", pokud je nastaveno → timed event
    timeTo?: string | null;   // "HH:MM"
    externalUrl?: string | null;
};

/**
 * Vytvoří nebo aktualizuje event v Google Kalendáři.
 * Pokud gcalEventId je null → INSERT, jinak → UPDATE.
 * Pokud timeFrom je nastaveno, použije dateTime + timeZone Europe/Prague.
 * Jinak all-day event (pouze date).
 */
export async function upsertGcalEvent(
    gcalEventId: string | null,
    input: GCalEventInput,
): Promise<string> {
    const cal = getCalendarClient();

    const descParts: string[] = [];
    if (input.description) descParts.push(input.description);
    if (input.externalUrl)  descParts.push(`Odkaz: ${input.externalUrl}`);

    // Timed vs. all-day
    type GCalDate =
        | { date: string }
        | { dateTime: string; timeZone: string };

    let startField: GCalDate;
    let endField: GCalDate;

    if (input.timeFrom) {
        const endDate  = input.dateTo ?? input.dateFrom;
        const endTime  = input.timeTo ?? input.timeFrom;
        startField = { dateTime: `${input.dateFrom}T${input.timeFrom}:00`, timeZone: PRAGUE_TZ };
        endField   = { dateTime: `${endDate}T${endTime}:00`,              timeZone: PRAGUE_TZ };
    } else {
        // All-day: GCal end.date je exkluzivní → +1 den
        const endDate = input.dateTo ? addDays(input.dateTo, 1) : addDays(input.dateFrom, 1);
        startField = { date: input.dateFrom };
        endField   = { date: endDate };
    }

    const resource = {
        summary:     input.summary,
        description: descParts.join("\n\n") || undefined,
        location:    input.location ?? undefined,
        start:       startField,
        end:         endField,
    };

    if (gcalEventId) {
        const res = await cal.events.update({
            calendarId: GCAL_CALENDAR_ID, eventId: gcalEventId, requestBody: resource,
        });
        return res.data.id!;
    } else {
        const res = await cal.events.insert({
            calendarId: GCAL_CALENDAR_ID, requestBody: resource,
        });
        return res.data.id!;
    }
}

/**
 * Smaže event z Google Kalendáře.
 * Pokud event neexistuje (410 Gone), tichce projde.
 */
export async function deleteGcalEvent(gcalEventId: string): Promise<void> {
    const cal = getCalendarClient();
    try {
        await cal.events.delete({ calendarId: GCAL_CALENDAR_ID, eventId: gcalEventId });
    } catch (e: unknown) {
        if ((e as { code?: number }).code !== 410) throw e;
    }
}

/**
 * Načte jeden event z GCal podle ID.
 * Vrátí null pokud event neexistuje (410 Gone / 404).
 */
export type GCalEventDetail = {
    gcalEventId:  string;
    summary:      string;
    dateFrom:     string | null;
    dateTo:       string | null;
    timeFrom:     string | null;
    timeTo:       string | null;
    location:     string | null;
    description:  string | null;
    updatedAt:    string | null;
};

export async function fetchGcalEventById(gcalEventId: string): Promise<GCalEventDetail | null> {
    const cal = getCalendarClient();
    try {
        const res = await cal.events.get({ calendarId: GCAL_CALENDAR_ID, eventId: gcalEventId });
        const e = res.data;

        const startInfo = parsePragueDateTime(e.start);
        const endInfo   = parsePragueDateTime(e.end);

        // Pro all-day: GCal end je exkluzivní → -1 den; pro timed: end je skutečný
        const endDate = startInfo.isAllDay && endInfo.date
            ? addDays(endInfo.date, -1)
            : endInfo.date;

        const dateTo = endDate && endDate !== startInfo.date ? endDate : null;
        const timeTo = endInfo.time && endInfo.time !== startInfo.time ? endInfo.time : null;

        return {
            gcalEventId,
            summary:     e.summary ?? "",
            dateFrom:    startInfo.date,
            dateTo,
            timeFrom:    startInfo.time,
            timeTo,
            location:    e.location ?? null,
            description: e.description ?? null,
            updatedAt:   e.updated ?? null,
        };
    } catch (e: unknown) {
        const code = (e as { code?: number }).code;
        if (code === 404 || code === 410) return null;
        throw e;
    }
}

/**
 * Načte seznam eventů z GCal pro dané časové rozmezí.
 * Používá se pro manuální pull/import.
 */
export type GCalEventRow = {
    gcalEventId:  string;
    summary:      string;
    dateFrom:     string | null;
    dateTo:       string | null;
    timeFrom:     string | null;
    location:     string | null;
    description:  string | null;
};

export type ListGcalEventsOptions = {
    skipRecurring?: boolean;
};

export type ListGcalEventsResult = {
    events: GCalEventRow[];
    ignoredRecurring: number;
};

function mapGcalEventToRow(e: {
    id?: string | null;
    summary?: string | null;
    start?: { date?: string | null; dateTime?: string | null } | null;
    end?: { date?: string | null; dateTime?: string | null } | null;
    location?: string | null;
    description?: string | null;
}): GCalEventRow | null {
    if (!e.id) return null;

    const startInfo = parsePragueDateTime(e.start);
    const endInfo   = parsePragueDateTime(e.end);

    const endDate = startInfo.isAllDay && endInfo.date
        ? addDays(endInfo.date, -1)
        : endInfo.date;

    const dateTo = endDate && endDate !== startInfo.date ? endDate : null;

    return {
        gcalEventId: e.id,
        summary:     e.summary ?? "(bez názvu)",
        dateFrom:    startInfo.date,
        dateTo,
        timeFrom:    startInfo.time,
        location:    e.location ?? null,
        description: e.description ?? null,
    };
}

export async function listGcalEvents(
    yearFrom: number,
    yearTo: number,
    options: ListGcalEventsOptions = {},
): Promise<GCalEventRow[]> {
    const result = await listGcalEventsWithMeta(yearFrom, yearTo, options);
    return result.events;
}

export async function listGcalEventsWithMeta(
    yearFrom: number,
    yearTo: number,
    options: ListGcalEventsOptions = {},
): Promise<ListGcalEventsResult> {
    const cal = getCalendarClient();
    const skipRecurring = options.skipRecurring ?? false;

    const res = await cal.events.list({
        calendarId:   GCAL_CALENDAR_ID,
        timeMin:      `${yearFrom}-01-01T00:00:00Z`,
        timeMax:      `${yearTo}-12-31T23:59:59Z`,
        singleEvents: true,
        orderBy:      "startTime",
        maxResults:   500,
    });

    let ignoredRecurring = 0;
    const events = (res.data.items ?? []).flatMap((e) => {
        const isRecurring = Boolean(e.recurringEventId) || (e.recurrence?.length ?? 0) > 0;
        if (skipRecurring && isRecurring) {
            ignoredRecurring += 1;
            return [];
        }

        const row = mapGcalEventToRow(e);
        return row ? [row] : [];
    });

    return { events, ignoredRecurring };
}
