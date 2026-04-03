import { NextRequest, NextResponse } from "next/server";

import { getEmailSettings, getResendClient } from "@/lib/email";

export const dynamic = "force-dynamic";

type TestEmailRequest = {
    to?: string;
};

export async function POST(request: NextRequest) {
    const settings = getEmailSettings();

    if (!settings.configured) {
        return NextResponse.json(
            {
                ok: false,
                detail: "RESEND_API_KEY není nastavený. Bez něj nejde testovací e-mail odeslat.",
                mode: settings.mode
            },
            {
                status: 503
            }
        );
    }

    let payload: TestEmailRequest = {};

    try {
        payload = (await request.json()) as TestEmailRequest;
    } catch {
        payload = {};
    }

    const to = payload.to?.trim() || settings.testTo;

    if (!to) {
        return NextResponse.json(
            {
                ok: false,
                detail: "Chybí cílová adresa. Pošli ji v body jako {\"to\":\"...\"} nebo nastav MAIL_TEST_TO.",
                mode: settings.mode
            },
            {
                status: 400
            }
        );
    }

    try {
        const resend = getResendClient();
        const { data, error } = await resend.emails.send({
            from: settings.from,
            to: [to],
            subject: "OVT: technicky test emailu",
            html: `
                <div style="font-family:Segoe UI, Arial, sans-serif; line-height:1.6">
                    <h1 style="margin-bottom:12px">OVT email test</h1>
                    <p>Tohle je technický test z první deploy verze aplikace na Vercelu.</p>
                    <p>Pokud tenhle mail přišel, Resend API key, Vercel environment variables a server-side route fungují správně.</p>
                </div>
            `,
            text: "Tohle je technický test z první deploy verze aplikace na Vercelu. Pokud přišel, Resend funguje správně.",
            replyTo: settings.replyTo
        });

        if (error) {
            return NextResponse.json(
                {
                    ok: false,
                    detail: error.message,
                    mode: settings.mode,
                    from: settings.from,
                    to
                },
                {
                    status: 502
                }
            );
        }

        return NextResponse.json({
            ok: true,
            detail: `Testovací e-mail byl odeslaný na ${to}.`,
            mode: settings.mode,
            from: settings.from,
            replyTo: settings.replyTo ?? null,
            to,
            emailId: data?.id ?? null
        });
    } catch {
        return NextResponse.json(
            {
                ok: false,
                detail: "Volání Resend API selhalo. Zkontroluj RESEND_API_KEY a případně příjemce testu.",
                mode: settings.mode,
                from: settings.from,
                to
            },
            {
                status: 502
            }
        );
    }
}

export async function GET() {
    const settings = getEmailSettings();

    return NextResponse.json({
        ok: settings.configured,
        detail: settings.configured
            ? "Pro test odešli POST na tento endpoint a pošli JSON body s polem to, nebo nastav MAIL_TEST_TO."
            : "Nejprve nastav RESEND_API_KEY.",
        mode: settings.mode,
        from: settings.from,
        replyTo: settings.replyTo ?? null,
        testTo: settings.testTo ?? null
    });
}