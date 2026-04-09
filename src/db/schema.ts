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
    firstName:      text("first_name").notNull(),
    lastName:       text("last_name").notNull(),
    fullName:       text("full_name").notNull(),   // kept in sync: firstName + " " + lastName
    userLogin:      text("user_login"),
    email:          text("email"),
    phone:          text("phone"),
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

export const importMembersTjBohemians = appSchema.table("import_members_tj_bohemians", {
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

// ── Import tables ────────────────────────────────────────────────────────────

export type ImportMapping = { sourceCol: string; targetField: string };
export type ImportMatchKey = { sourceCol: string; targetField: string };

export const importProfiles = appSchema.table("import_profiles", {
    id:              serial("id").primaryKey(),
    name:            text("name").notNull(),
    note:            text("note"),
    fileFormat:      text("file_format").notNull().default("csv"),
    delimiter:       text("delimiter"),
    encoding:        text("encoding"),
    headerRowIndex:  integer("header_row_index").notNull().default(0),
    matchKeys:       jsonb("match_keys").notNull().default([]),
    mappings:        jsonb("mappings").notNull().default([]),
    createdBy:       text("created_by").notNull(),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const importHistory = appSchema.table("import_history", {
    id:                    serial("id").primaryKey(),
    profileId:             integer("profile_id").references(() => importProfiles.id, { onDelete: "set null" }),
    profileNameSnapshot:   text("profile_name_snapshot"),
    filename:              text("filename").notNull(),
    encodingDetected:      text("encoding_detected"),
    recordsTotal:          integer("records_total").notNull().default(0),
    recordsMatched:        integer("records_matched").notNull().default(0),
    recordsNewCandidates:  integer("records_new_candidates").notNull().default(0),
    recordsWithDiffs:      integer("records_with_diffs").notNull().default(0),
    recordsOnlyInDb:       integer("records_only_in_db").notNull().default(0),
    changesApplied:        jsonb("changes_applied").notNull().default([]),
    membersAdded:          jsonb("members_added").notNull().default([]),
    importedBy:            text("imported_by").notNull(),
    importedAt:            timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Bank sync tables ─────────────────────────────────────────────────────────

export const bankTransactions = appSchema.table(
    "bank_transactions",
    {
        id:                   serial("id").primaryKey(),
        fioId:                integer("fio_id").notNull().unique(),
        date:                 date("date").notNull(),
        amount:               integer("amount").notNull(),
        currency:             text("currency").notNull().default("CZK"),
        variableSymbol:       text("variable_symbol"),
        constantSymbol:       text("constant_symbol"),
        specificSymbol:       text("specific_symbol"),
        counterpartyAccount:  text("counterparty_account"),
        counterpartyName:     text("counterparty_name"),
        message:              text("message"),
        userIdentification:   text("user_identification"),
        type:                 text("type"),
        comment:              text("comment"),
        rawData:              jsonb("raw_data").notNull().default({}),
        syncedAt:             timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("bank_transactions_date_idx").on(t.date),
        index("bank_transactions_vs_idx").on(t.variableSymbol),
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
