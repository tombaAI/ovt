import { Resend } from "resend";

const RESEND_TEST_FROM = "OVT sprava <onboarding@resend.dev>";

export type EmailMode = "custom" | "disabled" | "test";

type EmailSettings = {
    configured: boolean;
    from: string;
    mode: EmailMode;
    replyTo?: string;
    testTo?: string;
};

function normalizeValue(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

export function getEmailSettings(): EmailSettings {
    const apiKey = normalizeValue(process.env.RESEND_API_KEY);
    const customFrom = normalizeValue(process.env.MAIL_FROM);
    const replyTo = normalizeValue(process.env.MAIL_REPLY_TO);
    const testTo = normalizeValue(process.env.MAIL_TEST_TO);

    if (!apiKey) {
        return {
            configured: false,
            from: customFrom ?? RESEND_TEST_FROM,
            mode: "disabled",
            replyTo,
            testTo
        };
    }

    return {
        configured: true,
        from: customFrom ?? RESEND_TEST_FROM,
        mode: customFrom ? "custom" : "test",
        replyTo,
        testTo
    };
}

export function getResendClient(): Resend {
    const apiKey = normalizeValue(process.env.RESEND_API_KEY);

    if (!apiKey) {
        throw new Error("RESEND_API_KEY is not configured.");
    }

    return new Resend(apiKey);
}
