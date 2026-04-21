"use server";

import { getResendClient, getEmailSettings } from "@/lib/email";

type ContactFormData = {
    name: string;
    email: string;
    message: string;
};

export async function sendContactEmail(data: ContactFormData): Promise<{ ok: boolean; error?: string }> {
    const { name, email, message } = data;

    if (!name.trim() || !email.trim() || !message.trim()) {
        return { ok: false, error: "Vyplňte prosím všechna pole." };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: "Zadejte platnou e-mailovou adresu." };
    }

    const settings = getEmailSettings();
    if (!settings.configured) {
        return { ok: false, error: "E-mail není nakonfigurován. Napište nám přímo na ovt@bohemianstj.cz." };
    }

    const resend = getResendClient();
    const to = ["tomas.bauer@bohemianstj.cz", "tomas.matejka@bohemianstj.cz"];

    await resend.emails.send({
        from: settings.from,
        to,
        replyTo: email,
        subject: `Zájem o oddíl — ${name}`,
        text: `Jméno: ${name}\nE-mail: ${email}\n\nZpráva:\n${message}`,
        html: `<p><strong>Jméno:</strong> ${name}<br><strong>E-mail:</strong> ${email}</p><p><strong>Zpráva:</strong><br>${message.replace(/\n/g, "<br>")}</p>`,
    });

    return { ok: true };
}
