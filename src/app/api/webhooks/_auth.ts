import type { NextRequest } from "next/server";

/**
 * Ověří Bearer token z hlavičky Authorization.
 * Porovnává s CRON_SECRET (sdílený secret pro všechny webhooky).
 * Pokud CRON_SECRET není nastaveno, request projde (lokální dev).
 */
export function isWebhookAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return true;
    return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function unauthorizedResponse() {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
}
