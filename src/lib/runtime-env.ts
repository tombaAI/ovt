export type RuntimeFlags = {
    databaseUrl: boolean;
    adminEmails: boolean;
    appBaseUrl: boolean;
    resendApiKey: boolean;
    mailFrom: boolean;
    mailReplyTo: boolean;
    supabaseUrl: boolean;
    supabaseAnonKey: boolean;
    supabaseServiceRoleKey: boolean;
};

function hasValue(value: string | undefined): boolean {
    return Boolean(value && value.trim().length > 0);
}

export function getAdminEmailList(): string[] {
    return (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

export function getRuntimeFlags(): RuntimeFlags {
    return {
        databaseUrl: hasValue(process.env.DATABASE_URL),
        adminEmails: getAdminEmailList().length > 0,
        appBaseUrl: hasValue(process.env.APP_BASE_URL),
        resendApiKey: hasValue(process.env.RESEND_API_KEY),
        mailFrom: hasValue(process.env.MAIL_FROM),
        mailReplyTo: hasValue(process.env.MAIL_REPLY_TO),
        supabaseUrl: hasValue(process.env.NEXT_PUBLIC_SUPABASE_URL),
        supabaseAnonKey: hasValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        supabaseServiceRoleKey: hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
    };
}
