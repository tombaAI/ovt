import type { NextRequest } from "next/server";

/**
 * Ověří Bearer token z hlavičky Authorization.
 * Každý webhook má vlastní env proměnnou se svým secretem.
 * Pokud secret není nastaveno, request projde (lokální dev).
 */
export function isWebhookAuthorized(request: NextRequest, envVar: string): boolean {
    const secret = process.env[envVar];
    if (!secret) return true;
    return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function unauthorizedResponse() {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
}
