/**
 * Google Calendar klient pro OVT správu akcí.
 *
 * Autentizace: Service Account (JSON uložen v env GOOGLE_SERVICE_ACCOUNT_JSON).
 * Kalendář: definován v env GCAL_CALENDAR_ID.
 *
 * Instalace/setup: viz instrukce v README nebo v kódu níže.
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

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Přidá počet dní k ISO date stringu */
function addDays(iso: string, days: number): string {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

// ── Public API ────────────────────────────────────────────────────────────────

export type GCalEventInput = {
    summary: string;
    description?: string | null;
    location?: string | null;
    dateFrom: string;      // "YYYY-MM-DD"
    dateTo?: string | null; // "YYYY-MM-DD", inclusive — null = jednodenní
    externalUrl?: string | null;
};

/**
 * Vytvoří nebo aktualizuje event v Google Kalendáři.
 * Pokud gcalEventId je null → INSERT, jinak → UPDATE.
 * Vrátí ID eventu v GCal.
 */
export async function upsertGcalEvent(
    gcalEventId: string | null,
    input: GCalEventInput,
): Promise<string> {
    const cal = getCalendarClient();

    // GCal all-day events mají end.date exkluzivní (+1 den)
    const endDate = input.dateTo
        ? addDays(input.dateTo, 1)
        : addDays(input.dateFrom, 1);

    const descParts: string[] = [];
    if (input.description) descParts.push(input.description);
    if (input.externalUrl)  descParts.push(`Odkaz: ${input.externalUrl}`);

    const resource = {
        summary:     input.summary,
        description: descParts.join("\n\n") || undefined,
        location:    input.location ?? undefined,
        start: { date: input.dateFrom },
        end:   { date: endDate },
    };

    if (gcalEventId) {
        // UPDATE
        const res = await cal.events.update({
            calendarId: GCAL_CALENDAR_ID,
            eventId:    gcalEventId,
            requestBody: resource,
        });
        return res.data.id!;
    } else {
        // INSERT
        const res = await cal.events.insert({
            calendarId: GCAL_CALENDAR_ID,
            requestBody: resource,
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
        await cal.events.delete({
            calendarId: GCAL_CALENDAR_ID,
            eventId:    gcalEventId,
        });
    } catch (e: unknown) {
        // 410 Gone = už smazáno, ignorujeme
        if ((e as { code?: number }).code !== 410) throw e;
    }
}

/**
 * Načte jeden event z GCal podle ID.
 * Vrátí null pokud event neexistuje (410 Gone / 404).
 */
export type GCalEventDetail = {
    gcalEventId: string;
    summary: string;
    dateFrom: string | null;
    dateTo: string | null;
    location: string | null;
    description: string | null;
    updatedAt: string | null;
};

export async function fetchGcalEventById(gcalEventId: string): Promise<GCalEventDetail | null> {
    const cal = getCalendarClient();
    try {
        const res = await cal.events.get({
            calendarId: GCAL_CALENDAR_ID,
            eventId:    gcalEventId,
        });
        const e = res.data;
        const rawStart = e.start?.date ?? e.start?.dateTime?.slice(0, 10) ?? null;
        const rawEnd   = e.end?.date   ?? e.end?.dateTime?.slice(0, 10)   ?? null;
        const dateTo = rawEnd && rawEnd !== rawStart ? addDays(rawEnd, -1) : null;
        return {
            gcalEventId,
            summary:     e.summary ?? "",
            dateFrom:    rawStart,
            dateTo:      dateTo === rawStart ? null : dateTo,
            location:    e.location ?? null,
            description: e.description ?? null,
            updatedAt:   e.updated ?? null,
        };
    } catch (e: unknown) {
        if ((e as { code?: number }).code === 404 || (e as { code?: number }).code === 410) return null;
        throw e;
    }
}

/**
 * Načte seznam eventů z GCal pro dané časové rozmezí.
 * Používá se pro manuální pull/import.
 */
export type GCalEventRow = {
    gcalEventId: string;
    summary: string;
    dateFrom: string | null;
    dateTo: string | null;
    location: string | null;
    description: string | null;
};

export async function listGcalEvents(
    yearFrom: number,
    yearTo: number,
): Promise<GCalEventRow[]> {
    const cal = getCalendarClient();

    const res = await cal.events.list({
        calendarId:   GCAL_CALENDAR_ID,
        timeMin:      `${yearFrom}-01-01T00:00:00Z`,
        timeMax:      `${yearTo}-12-31T23:59:59Z`,
        singleEvents: true,
        orderBy:      "startTime",
        maxResults:   500,
    });

    return (res.data.items ?? []).map(e => {
        const rawStart = e.start?.date ?? e.start?.dateTime?.slice(0, 10) ?? null;
        const rawEnd   = e.end?.date   ?? e.end?.dateTime?.slice(0, 10)   ?? null;
        // GCal end je exkluzivní → odečteme 1 den (pro all-day eventy)
        const dateTo = rawEnd && rawEnd !== rawStart
            ? addDays(rawEnd, -1)
            : null;
        return {
            gcalEventId: e.id!,
            summary:     e.summary ?? "(bez názvu)",
            dateFrom:    rawStart,
            dateTo:      dateTo === rawStart ? null : dateTo,
            location:    e.location ?? null,
            description: e.description ?? null,
        };
    });
}
