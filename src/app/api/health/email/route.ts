import { NextResponse } from "next/server";

import { getEmailSettings } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET() {
    const settings = getEmailSettings();
    const hasMailFrom = Boolean(process.env.MAIL_FROM?.trim());
    const hasMailReplyTo = Boolean(process.env.MAIL_REPLY_TO?.trim());

    if (!settings.configured && !hasMailFrom && !hasMailReplyTo) {
        return NextResponse.json({
            ok: true,
            configured: false,
            detail: "E-mail zatím není nastavený a pro první deploy webu s databází je to v pořádku. Tu část zapojíš až později.",
            mailFrom: null,
            replyTo: null,
            mode: settings.mode,
            testEndpoint: "/api/email/test"
        });
    }

    if (!settings.configured) {
        return NextResponse.json(
            {
                ok: false,
                configured: hasMailFrom || hasMailReplyTo,
                detail: "MAIL_FROM nebo MAIL_REPLY_TO jsou nastavené, ale chybí RESEND_API_KEY.",
                mailFrom: process.env.MAIL_FROM ?? null,
                replyTo: process.env.MAIL_REPLY_TO ?? null,
                mode: settings.mode,
                testEndpoint: "/api/email/test"
            },
            {
                status: 503
            }
        );
    }

    return NextResponse.json(
        {
            ok: true,
            configured: true,
            detail:
                settings.mode === "custom"
                    ? `E-mailová konfigurace je připravená pro adresu ${settings.from}.`
                    : "E-mailová konfigurace je připravená v test režimu přes onboarding@resend.dev. Pro první technické ověření to stačí.",
            mailFrom: settings.from,
            replyTo: settings.replyTo ?? null,
            mode: settings.mode,
            testTo: settings.testTo ?? null,
            testEndpoint: "/api/email/test"
        }
    );
}
