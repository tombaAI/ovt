import { NextResponse } from "next/server";

import { getResendClient } from "@/lib/email";

export const dynamic = "force-dynamic";

const RECIPIENTS = [
    "tomas.bauer@bohemianstj.cz",
    "tomas.bauer@seznam.cz",
    "bautom@gmail.com",
    "michal.mencik.24@gmail.com",
    "mencmi@seznam.cz",
];

export async function GET() {
    const resend = getResendClient();

    const results = await Promise.all(
        RECIPIENTS.map(async (to) => {
            const { data, error } = await resend.emails.send({
                from: "OVT sprava <onboarding@resend.dev>",
                to: [to],
                subject: "OVT: test hromadného odesílání e-mailů",
                html: `
                    <div style="font-family: Segoe UI, Arial, sans-serif; line-height: 1.6; max-width: 600px">
                        <h2>Test hromadného odesílání — OVT sprava</h2>
                        <p>Tento e-mail je technický test odesílání přes Resend API z aplikace OVT sprava (Bohemians).</p>
                        <p>Adresát: <strong>${to}</strong></p>
                        <p style="color:#888; font-size:12px">Tento test lze smazat — jde pouze o ověření doručitelnosti.</p>
                    </div>
                `,
                text: `Test hromadného odesílání — OVT sprava\n\nTento e-mail je technický test odesílání přes Resend API z aplikace OVT sprava (Bohemians).\n\nAdresát: ${to}`,
            });
            return { to, ok: !error, id: data?.id ?? null, error: error?.message ?? null };
        })
    );

    const allOk = results.every((r) => r.ok);
    return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
}
