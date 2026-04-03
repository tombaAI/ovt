import {
    boolean,
    index,
    jsonb,
    pgSchema,
    text,
    timestamp,
    uuid
} from "drizzle-orm/pg-core";

export const appSchema = pgSchema("app");

export const adminUsers = appSchema.table("admin_users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    displayName: text("display_name"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const mailEvents = appSchema.table(
    "mail_events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        provider: text("provider").notNull().default("resend"),
        direction: text("direction", { enum: ["outbound", "inbound", "webhook"] }).notNull(),
        eventType: text("event_type").notNull(),
        messageId: text("message_id"),
        fromEmail: text("from_email"),
        toEmail: text("to_email"),
        subject: text("subject"),
        payload: jsonb("payload").notNull().default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (t) => [
        index("mail_events_created_at_idx").on(t.createdAt.desc()),
        index("mail_events_event_type_idx").on(t.eventType)
    ]
);
