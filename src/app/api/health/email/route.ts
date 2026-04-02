import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
    const hasResendApiKey = Boolean(process.env.RESEND_API_KEY);
    const hasMailFrom = Boolean(process.env.MAIL_FROM);
    const hasMailReplyTo = Boolean(process.env.MAIL_REPLY_TO);
    const isReady = hasResendApiKey && hasMailFrom;

    return NextResponse.json(
        {
            ok: isReady,
            configured: hasResendApiKey || hasMailFrom || hasMailReplyTo,
            detail: isReady
                ? `E-mailová konfigurace je připravená pro adresu ${process.env.MAIL_FROM}.`
                : "Pro ostré odesílání nastav RESEND_API_KEY a MAIL_FROM. MAIL_REPLY_TO je volitelný, ale dává smysl pro lidské odpovědi.",
            mailFrom: process.env.MAIL_FROM ?? null,
            replyTo: process.env.MAIL_REPLY_TO ?? null
        },
        {
            status: isReady ? 200 : 503
        }
    );
}
