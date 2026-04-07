import {
    boolean,
    date,
    index,
    integer,
    jsonb,
    pgSchema,
    serial,
    smallint,
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

// ── Domain tables ────────────────────────────────────────────────────────────

export const members = appSchema.table("members", {
    id:             integer("id").primaryKey(),
    userLogin:      text("user_login"),
    email:          text("email"),
    phone:          text("phone"),
    fullName:       text("full_name").notNull(),
    nickname:       text("nickname"),
    variableSymbol: integer("variable_symbol"),
    cskNumber:      text("csk_number"),
    membershipReviewed:  boolean("membership_reviewed").notNull().default(false),
    note:                text("note"),
    todoNote:            text("todo_note"),
    memberFrom:          date("member_from").notNull(),
    memberTo:            date("member_to"),
    memberToNote:        text("member_to_note"),
    birthDate:           date("birth_date"),
    birthNumber:         text("birth_number"),
    gender:              text("gender"),
    address:             text("address"),
    createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tjMembers = appSchema.table("tj_members", {
    id:           serial("id").primaryKey(),
    cskNumber:    text("csk_number").unique(),
    jmeno:        text("jmeno"),
    prijmeni:     text("prijmeni"),
    nickname:     text("nickname"),
    email:        text("email"),
    phone:        text("phone"),
    birthDate:    date("birth_date"),
    birthNumber:  text("birth_number"),
    gender:       text("gender"),
    address:      text("address"),
    radekOdeslan: date("radek_odeslan"),
    syncedAt:     timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contributionPeriods = appSchema.table("contribution_periods", {
    id:                  serial("id").primaryKey(),
    year:                smallint("year").notNull().unique(),
    amountBase:          integer("amount_base").notNull(),
    amountBoat1:         integer("amount_boat1").notNull().default(0),
    amountBoat2:         integer("amount_boat2").notNull().default(0),
    amountBoat3:         integer("amount_boat3").notNull().default(0),
    discountCommittee:   integer("discount_committee").notNull().default(0),
    discountTom:         integer("discount_tom").notNull().default(0),
    brigadeSurcharge:    integer("brigade_surcharge").notNull().default(0),
    dueDate:             date("due_date"),
    bankAccount:         text("bank_account").notNull().default("2701772934/2010"),
    status:              text("status", { enum: ["draft", "confirmed", "collecting", "closed"] }).notNull().default("collecting"),
    createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberContributions = appSchema.table(
    "member_contributions",
    {
        id:                 serial("id").primaryKey(),
        memberId:           integer("member_id").notNull().references(() => members.id),
        periodId:           integer("period_id").notNull().references(() => contributionPeriods.id),
        amountTotal:        integer("amount_total"),
        amountBase:         integer("amount_base"),
        amountBoat1:        integer("amount_boat1"),
        amountBoat2:        integer("amount_boat2"),
        amountBoat3:        integer("amount_boat3"),
        discountCommittee:  integer("discount_committee"),
        discountTom:        integer("discount_tom"),
        discountIndividual: integer("discount_individual"),
        brigadeSurcharge:   integer("brigade_surcharge"),
        paidAmount:         integer("paid_amount"),
        paidAt:             date("paid_at"),
        isPaid:             boolean("is_paid"),
        note:               text("note"),
        discountIndividualNote:       text("discount_individual_note"),
        discountIndividualValidUntil: smallint("discount_individual_valid_until"),
        todoNote:                     text("todo_note"),
    },
    (t) => [
        index("member_contributions_member_idx").on(t.memberId),
        index("member_contributions_period_idx").on(t.periodId),
    ]
);


export const payments = appSchema.table(
    "payments",
    {
        id:        serial("id").primaryKey(),
        contribId: integer("contrib_id").notNull().references(() => memberContributions.id),
        memberId:  integer("member_id").notNull().references(() => members.id),
        amount:    integer("amount").notNull(),
        paidAt:    date("paid_at"),
        note:      text("note"),
        createdBy: text("created_by").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("payments_contrib_idx").on(t.contribId),
        index("payments_member_idx").on(t.memberId),
    ]
);

export const auditLog = appSchema.table(
    "audit_log",
    {
        id:         serial("id").primaryKey(),
        entityType: text("entity_type").notNull(),
        entityId:   integer("entity_id").notNull(),
        action:     text("action").notNull(),
        changes:    jsonb("changes").notNull().default({}),
        changedBy:  text("changed_by").notNull(),
        changedAt:  timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("audit_log_entity_idx").on(t.entityType, t.entityId),
        index("audit_log_changed_at_idx").on(t.changedAt.desc()),
    ]
);

// ── System tables ────────────────────────────────────────────────────────────

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
