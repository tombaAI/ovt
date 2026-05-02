import {
    boolean,
    date,
    index,
    integer,
    jsonb,
    numeric,
    pgSchema,
    serial,
    smallint,
    text,
    timestamp,
    uniqueIndex,
    uuid
} from "drizzle-orm/pg-core";
import { sql as drizzleSql } from "drizzle-orm";

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
    membershipReviewed:   boolean("membership_reviewed").notNull().default(false),
    isCommitteeMember:    boolean("is_committee_member").notNull().default(false),
    isTomLeader:          boolean("is_tom_leader").notNull().default(false),
    note:                 text("note"),
    todoNote:            text("todo_note"),
    memberFrom:          date("member_from").notNull(),
    memberTo:            date("member_to"),
    memberToNote:        text("member_to_note"),
    birthDate:           date("birth_date"),
    birthNumber:         text("birth_number"),
    gender:              text("gender"),
    address:             text("address"),
    bankAccountNumber:   text("bank_account_number"),
    bankCode:            text("bank_code"),
    createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const people = appSchema.table(
    "people",
    {
        id:                serial("id").primaryKey(),
        memberId:          integer("member_id").references(() => members.id, { onDelete: "set null" }),
        firstName:         text("first_name"),
        lastName:          text("last_name"),
        fullName:          text("full_name").notNull(),
        email:             text("email"),
        phone:             text("phone"),
        bankAccountNumber: text("bank_account_number"),
        bankCode:          text("bank_code"),
        note:              text("note"),
        createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex("people_member_id_uq").on(t.memberId),
        index("people_full_name_idx").on(t.fullName),
        index("people_email_idx").on(t.email),
    ]
);

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
        reviewed:                     boolean("reviewed").notNull().default(false),
        emailSent:                    boolean("email_sent").notNull().default(false),
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
    profileType:     text("profile_type").notNull().default("member"), // 'member' | 'bank'
    fileFormat:      text("file_format").notNull().default("csv"),
    delimiter:       text("delimiter"),
    encoding:        text("encoding"),
    headerRowIndex:  integer("header_row_index").notNull().default(0),
    matchKeys:       jsonb("match_keys").notNull().default([]),
    mappings:        jsonb("mappings").notNull().default([]),
    config:          jsonb("config").notNull().default({}),            // bank: filterColumn, dateFormat, …
    createdBy:       text("created_by").notNull(),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const importHistory = appSchema.table("import_history", {
    id:                    serial("id").primaryKey(),
    importType:            text("import_type").notNull().default("member"),  // 'member' | 'bank'
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

// ── Fio Bank sync tables ──────────────────────────────────────────────────────

/**
 * Staging tabulka pro Fio API synchronizaci.
 * Přejmenováno z bank_transactions → fio_bank_transactions (migrace 20260413).
 */
export const fioBankTransactions = appSchema.table(
    "fio_bank_transactions",
    {
        id:                   serial("id").primaryKey(),
        fioId:                integer("fio_id").notNull().unique(),
        date:                 date("date").notNull(),
        amount:               numeric("amount", { precision: 10, scale: 2 }).notNull(),
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
        index("fio_bank_transactions_date_idx").on(t.date),
        index("fio_bank_transactions_vs_idx").on(t.variableSymbol),
    ]
);

// ── Payment ledger tables ─────────────────────────────────────────────────────

/**
 * Staging tabulka pro file-based bankovní importy (Air Bank, další banky).
 * Idempotentní přes (profile_id, external_key).
 */
export const bankImportTransactions = appSchema.table(
    "bank_import_transactions",
    {
        id:                  serial("id").primaryKey(),
        importRunId:         integer("import_run_id").references(() => importHistory.id, { onDelete: "set null" }),
        profileId:           integer("profile_id").references(() => importProfiles.id, { onDelete: "set null" }),
        externalKey:         text("external_key").notNull(),
        paidAt:              date("paid_at"),
        amount:              numeric("amount", { precision: 10, scale: 2 }),
        currency:            text("currency").notNull().default("CZK"),
        variableSymbol:      text("variable_symbol"),
        counterpartyAccount: text("counterparty_account"),
        counterpartyName:    text("counterparty_name"),
        message:             text("message"),
        rawData:             jsonb("raw_data").notNull().default({}),
        ledgerId:            integer("ledger_id"),
        createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("bank_import_tx_run_idx").on(t.importRunId),
    ]
);

/**
 * Jednotný platební ledger — kanonický zdroj pravdy pro všechny přijaté platby.
 * source_type: 'fio_bank' | 'file_import' | 'cash'
 */
export const paymentLedger = appSchema.table(
    "payment_ledger",
    {
        id:                   serial("id").primaryKey(),
        sourceType:           text("source_type", { enum: ["fio_bank", "file_import", "cash", "tj_finance"] }).notNull(),
        fioBankTxId:          integer("fio_bank_tx_id").unique().references(() => fioBankTransactions.id),
        bankImportTxId:       integer("bank_import_tx_id").unique().references(() => bankImportTransactions.id),
        importRunId:          integer("import_run_id").references(() => importHistory.id, { onDelete: "set null" }),
        paidAt:               date("paid_at").notNull(),
        amount:               numeric("amount", { precision: 10, scale: 2 }).notNull(),
        currency:             text("currency").notNull().default("CZK"),
        variableSymbol:       text("variable_symbol"),
        counterpartyAccount:  text("counterparty_account"),
        counterpartyName:     text("counterparty_name"),
        message:              text("message"),
        note:                 text("note"),
        reconciliationStatus: text("reconciliation_status", {
            enum: ["unmatched", "suggested", "confirmed", "ignored"],
        }).notNull().default("unmatched"),
        createdBy:            text("created_by").notNull(),
        createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("payment_ledger_paid_at_idx").on(t.paidAt),
        index("payment_ledger_vs_idx").on(t.variableSymbol),
        index("payment_ledger_status_idx").on(t.reconciliationStatus),
        index("payment_ledger_source_idx").on(t.sourceType),
    ]
);

/**
 * Alokační tabulka — vazba ledger záznam → předpis příspěvku.
 * Nahrazuje starou tabulku payments.
 * Split = více řádků na jeden ledger záznam; součet amount = payment_ledger.amount.
 */
export const paymentAllocations = appSchema.table(
    "payment_allocations",
    {
        id:          serial("id").primaryKey(),
        ledgerId:    integer("ledger_id").notNull().references(() => paymentLedger.id),
        contribId:   integer("contrib_id").notNull().references(() => memberContributions.id),
        memberId:    integer("member_id").notNull().references(() => members.id),
        amount:      numeric("amount", { precision: 10, scale: 2 }).notNull(),
        note:        text("note"),
        isSuggested: boolean("is_suggested").notNull().default(false),
        confirmedBy: text("confirmed_by"),
        confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
        createdBy:   text("created_by").notNull(),
        createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("payment_allocations_ledger_idx").on(t.ledgerId),
        index("payment_allocations_contrib_idx").on(t.contribId),
        index("payment_allocations_member_idx").on(t.memberId),
    ]
);

// ── Boat tables ──────────────────────────────────────────────────────────────

export const boats = appSchema.table(
    "boats",
    {
        id:          serial("id").primaryKey(),
        ownerId:     integer("owner_id").references(() => members.id, { onDelete: "set null" }),
        description: text("description"),    // "modrá Dagger M8.0"
        color:       text("color"),
        grid:        text("grid"),           // '1' | '2' | '3' | 'dlouhé' | null = neznámé
        position:    smallint("position"),   // číslo pozice v mříži; null pro dlouhé/neznámé
        isPresent:      boolean("is_present").notNull().default(true),
        storedFrom:     date("stored_from"),
        storedTo:       date("stored_to"),       // null = stále aktivní
        lastCheckedAt:  date("last_checked_at"), // datum poslední fyzické kontroly
        note:           text("note"),
        todoNote:       text("todo_note"),
        reviewed:       boolean("reviewed").notNull().default(false),
        createdBy:   text("created_by").notNull(),
        createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("boats_owner_idx").on(t.ownerId),
        index("boats_grid_idx").on(t.grid),
        index("boats_stored_to_idx").on(t.storedTo),
    ]
);

// ── Event tables ─────────────────────────────────────────────────────────────

export const eventTypeEnum = ["cpv", "foreign", "recreational", "club", "race", "brigada", "other"] as const;
export type EventType = typeof eventTypeEnum[number];

export const eventStatusEnum = ["planned", "confirmed", "cancelled", "completed"] as const;
export type EventStatus = typeof eventStatusEnum[number];

export const eventSourceEnum = ["manual", "google_calendar", "kanoe_rss"] as const;
export type EventSource = typeof eventSourceEnum[number];

export const events = appSchema.table(
    "events",
    {
        id:           serial("id").primaryKey(),
        year:         smallint("year").notNull(),
        name:         text("name").notNull(),
        eventType:    text("event_type", { enum: eventTypeEnum }).notNull().default("other"),
        dateFrom:         date("date_from"),
        dateTo:           date("date_to"),
        timeFrom:         text("time_from"),
        timeTo:           text("time_to"),
        approxMonth:      smallint("approx_month"),
        registrationFrom: date("registration_from"),
        registrationTo:   date("registration_to"),
        location:         text("location"),
        leaderId:     integer("leader_id").references(() => members.id, { onDelete: "set null" }),
        status:       text("status", { enum: eventStatusEnum }).notNull().default("planned"),
        description:  text("description"),
        externalUrl:  text("external_url"),
        source:       text("source", { enum: eventSourceEnum }).notNull().default("manual"),
        gcalEventId:  text("gcal_event_id"),
        gcalSync:     boolean("gcal_sync").notNull().default(false),
        gcalSyncedAt: timestamp("gcal_synced_at", { withTimezone: true }),
        note:         text("note"),
        createdBy:    text("created_by").notNull(),
        createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("events_year_idx").on(t.year),
        index("events_date_from_idx").on(t.dateFrom),
        index("events_status_idx").on(t.status),
        index("events_leader_idx").on(t.leaderId),
    ]
);

export const eventRegistrations = appSchema.table(
    "event_registrations",
    {
        id:           serial("id").primaryKey(),
        eventId:      integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
        formSlug:     text("form_slug").notNull(),
        email:        text("email").notNull(),
        phone:        text("phone"),
        firstName:    text("first_name").notNull(),
        lastName:     text("last_name").notNull(),
        publicToken:  text("public_token").notNull().unique(),
        personsCount: smallint("persons_count").notNull().default(1),
        personsNames: text("persons_names"),
        transportInfo: text("transport_info"),
        cancelledAt:  timestamp("cancelled_at", { withTimezone: true }),
        createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("event_registrations_event_idx").on(t.eventId),
        index("event_registrations_slug_idx").on(t.formSlug),
        index("event_registrations_cancelled_at_idx").on(t.cancelledAt),
        index("event_registrations_created_at_idx").on(t.createdAt.desc()),
    ]
);

export const eventRegistrationParticipants = appSchema.table(
    "event_registration_participants",
    {
        id:               serial("id").primaryKey(),
        registrationId:   integer("registration_id").notNull().references(() => eventRegistrations.id, { onDelete: "cascade" }),
        participantOrder: smallint("participant_order").notNull(),
        fullName:         text("full_name").notNull(),
        isPrimary:        boolean("is_primary").notNull().default(false),
        createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("event_reg_participants_registration_idx").on(t.registrationId),
        uniqueIndex("event_reg_participants_registration_order_uq").on(t.registrationId, t.participantOrder),
    ]
);

export const eventPaymentPrescriptionStatusEnum = ["pending", "matched", "paid", "cancelled"] as const;
export type EventPaymentPrescriptionStatus = typeof eventPaymentPrescriptionStatusEnum[number];

export const eventPaymentPrescriptions = appSchema.table(
    "event_payment_prescriptions",
    {
        id:                  serial("id").primaryKey(),
        eventId:             integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
        registrationId:      integer("registration_id").notNull().unique().references(() => eventRegistrations.id, { onDelete: "cascade" }),
        prescriptionCode:    integer("prescription_code").notNull().unique(),
        bankAccount:         text("bank_account").notNull(),
        variableSymbol:      text("variable_symbol").notNull(),
        amount:              numeric("amount", { precision: 10, scale: 2 }).notNull(),
        messageForRecipient: text("message_for_recipient").notNull(),
        status:              text("status", { enum: eventPaymentPrescriptionStatusEnum }).notNull().default("pending"),
        matchedLedgerId:     integer("matched_ledger_id").references(() => paymentLedger.id, { onDelete: "set null" }),
        matchedAmount:       numeric("matched_amount", { precision: 10, scale: 2 }),
        matchedAt:           timestamp("matched_at", { withTimezone: true }),
        note:                text("note"),
        createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("event_payment_prescriptions_event_idx").on(t.eventId),
        index("event_payment_prescriptions_status_idx").on(t.status),
        index("event_payment_prescriptions_ledger_idx").on(t.matchedLedgerId),
    ]
);

// ── Event expenses ───────────────────────────────────────────────────────────

// Hodnoty musí být shodné s src/lib/expense-categories.ts
export const expenseCategoryEnum = [
    "501/004", "501/006", "511/002", "518/001", "518/003",
    "518/004", "518/008", "518/009", "518/010", "518/011",
    "518/012", "518/014", "549/004",
] as const;
export type ExpenseCategory = typeof expenseCategoryEnum[number];

export const eventExpenseStatusEnum = ["draft", "final"] as const;
export type EventExpenseStatus = typeof eventExpenseStatusEnum[number];

export const eventExpenses = appSchema.table(
    "event_expenses",
    {
        id:              serial("id").primaryKey(),
        eventId:         integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
        status:          text("status", { enum: eventExpenseStatusEnum }).notNull().default("final"),
        amount:          numeric("amount", { precision: 10, scale: 2 }),        // null u draftů
        purposeText:     text("purpose_text"),
        purposeCategory: text("purpose_category", { enum: expenseCategoryEnum }),
        reimbursementPersonId: integer("reimbursement_person_id").references(() => people.id, { onDelete: "set null" }),
        reimbursementMemberId: integer("reimbursement_member_id").references(() => members.id, { onDelete: "set null" }),
        fileUrl:         text("file_url"),
        fileName:        text("file_name"),
        fileMime:        text("file_mime"),
        uploadedBy:      text("uploaded_by").notNull(),
        createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("event_expenses_event_idx").on(t.eventId),
        index("event_expenses_reimbursement_person_idx").on(t.reimbursementPersonId),
        index("event_expenses_reimbursement_member_idx").on(t.reimbursementMemberId),
    ]
);

// ── Brigade tables ───────────────────────────────────────────────────────────

export const brigades = appSchema.table(
    "brigades",
    {
        id:        serial("id").primaryKey(),
        eventId:   integer("event_id").references(() => events.id, { onDelete: "set null" }),
        date:      date("date").notNull(),
        year:      smallint("year").notNull(),
        name:      text("name"),
        leaderId:  integer("leader_id").references(() => members.id, { onDelete: "set null" }),
        note:      text("note"),
        createdBy: text("created_by").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("brigades_year_idx").on(t.year),
        index("brigades_date_idx").on(t.date),
        index("brigades_event_idx").on(t.eventId),
    ]
);

export const brigadeMembers = appSchema.table(
    "brigade_members",
    {
        id:        serial("id").primaryKey(),
        brigadeId: integer("brigade_id").notNull().references(() => brigades.id, { onDelete: "cascade" }),
        memberId:  integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
        note:      text("note"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("brigade_members_brigade_idx").on(t.brigadeId),
        index("brigade_members_member_idx").on(t.memberId),
    ]
);

// ── Finance TJ tables ────────────────────────────────────────────────────────

/**
 * Cover záznam pro každý import PDF výsledovky z TJ.
 * Datum sestavy a filtr jsou metadata z hlavičky/patičky PDF.
 */
export const importFinTjImports = appSchema.table("import_fin_tj_imports", {
    id:          serial("id").primaryKey(),
    reportDate:  date("report_date").notNull(),       // "Dne: DD.MM.YYYY" z hlavičky
    costCenter:  text("cost_center").notNull(),       // "Středisko: 207"
    filterFrom:  date("filter_from"),                 // z "Datum >= DD.MM.YYYY"
    filterTo:    date("filter_to"),                   // z "Datum <= DD.MM.YYYY"
    filterRaw:   text("filter_raw"),                  // celý řádek Tisk vybraných záznamů
    fileName:    text("file_name"),
    importedBy:  text("imported_by").notNull(),
    importedAt:  timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Jednotlivé transakce z výsledovky TJ.
 * Idempotentní přes doc_number (číslo dokladu je unikátní v účetnictví TJ).
 */
export const importFinTjTransactions = appSchema.table(
    "import_fin_tj_transactions",
    {
        id:          serial("id").primaryKey(),
        importId:    integer("import_id").notNull().references(() => importFinTjImports.id, { onDelete: "cascade" }),
        docDate:     date("doc_date").notNull(),
        docNumber:   text("doc_number").notNull().unique(),
        sourceCode:  text("source_code").notNull(),   // IN, BV, FP, FV, ...
        description: text("description").notNull(),   // firma + text z PDF
        accountCode: text("account_code").notNull(),
        accountName: text("account_name").notNull(),
        debit:       numeric("debit",  { precision: 12, scale: 2 }).notNull().default("0"),
        credit:      numeric("credit", { precision: 12, scale: 2 }).notNull().default("0"),
    },
    (t) => [
        index("import_fin_tj_tx_import_idx").on(t.importId),
        index("import_fin_tj_tx_date_idx").on(t.docDate),
    ]
);

// ── Hospodaření oddílů TJ ────────────────────────────────────────────────────

export const importFinTjHospodareniImports = appSchema.table("import_fin_tj_hospodareni_imports", {
    id:          serial("id").primaryKey(),
    periodFrom:  date("period_from").notNull(),   // "1.1.2025" → "2025-01-01"
    periodTo:    date("period_to").notNull(),      // "23.1.2025" → "2025-01-23"
    prevodYear:  integer("prevod_year"),           // rok ze sloupce "PŘEVOD Z ROKU X"
    fileName:    text("file_name"),
    importedBy:  text("imported_by").notNull(),
    importedAt:  timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const importFinTjHospodareniRows = appSchema.table(
    "import_fin_tj_hospodareni_rows",
    {
        id:        serial("id").primaryKey(),
        importId:  integer("import_id").notNull().references(() => importFinTjHospodareniImports.id, { onDelete: "cascade" }),
        oddilId:   text("oddil_id").notNull(),    // "207"
        oddilName: text("oddil_name").notNull(),  // "VODNÍ TURISTIKA"
        naklady:   numeric("naklady",  { precision: 14, scale: 2 }).notNull().default("0"),
        vynosy:    numeric("vynosy",   { precision: 14, scale: 2 }).notNull().default("0"),
        vysledek:  numeric("vysledek", { precision: 14, scale: 2 }).notNull().default("0"),
        prevod:    numeric("prevod",   { precision: 14, scale: 2 }).notNull().default("0"),
        celkem:    numeric("celkem",   { precision: 14, scale: 2 }).notNull().default("0"),
    },
    (t) => [
        index("import_fin_tj_hosp_import_idx").on(t.importId),
        index("import_fin_tj_hosp_oddil_idx").on(t.oddilId),
    ]
);

// ── Notebook tables ──────────────────────────────────────────────────────────

export const notebookNotes = appSchema.table(
    "notebook_notes",
    {
        id:             serial("id").primaryKey(),
        title:          text("title").notNull(),
        categories:     text("categories").array().notNull().default(drizzleSql`'{}'::text[]`),
        createdByEmail: text("created_by_email").notNull(),
        createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        archivedAt:     timestamp("archived_at", { withTimezone: true }),
    },
    (t) => [
        index("notebook_notes_archived_idx").on(t.archivedAt),
        index("notebook_notes_updated_at_idx").on(t.updatedAt.desc()),
    ]
);

export const notebookNoteVersions = appSchema.table(
    "notebook_note_versions",
    {
        id:             serial("id").primaryKey(),
        noteId:         integer("note_id").notNull().references(() => notebookNotes.id, { onDelete: "cascade" }),
        content:        text("content").notNull(),
        createdByEmail: text("created_by_email").notNull(),
        createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("notebook_note_versions_note_idx").on(t.noteId),
        index("notebook_note_versions_created_at_idx").on(t.createdAt.desc()),
    ]
);

/**
 * Log každého řádku v importu výsledovky TJ s výsledkem rekonciliace.
 * status: 'added' = přidáno do master listu, 'matched' = nalezeno a shoduje se, 'conflict' = nalezeno ale liší se
 */
export const importFinTjImportLines = appSchema.table(
    "import_fin_tj_import_lines",
    {
        id:             serial("id").primaryKey(),
        importId:       integer("import_id").notNull().references(() => importFinTjImports.id, { onDelete: "cascade" }),
        transactionId:  integer("transaction_id").references(() => importFinTjTransactions.id, { onDelete: "set null" }),
        docNumber:      text("doc_number").notNull(),
        status:         text("status", { enum: ["added", "matched", "conflict"] }).notNull(),
        conflictFields: jsonb("conflict_fields").notNull().default([]),
        // Snapshot dat z tohoto importu (pro zobrazení a porovnání)
        docDate:        date("doc_date").notNull(),
        sourceCode:     text("source_code").notNull(),
        description:    text("description").notNull(),
        accountCode:    text("account_code").notNull(),
        accountName:    text("account_name").notNull(),
        debit:          numeric("debit",  { precision: 12, scale: 2 }).notNull().default("0"),
        credit:         numeric("credit", { precision: 12, scale: 2 }).notNull().default("0"),
    },
    (t) => [
        index("import_fin_tj_lines_import_idx").on(t.importId),
        index("import_fin_tj_lines_tx_idx").on(t.transactionId),
    ]
);

/**
 * Alokace TJ transakce na předpis příspěvků konkrétního člena.
 * Umožňuje napárovat platbu z TJ účetnictví (výsledovka) na member_contributions.
 */
export const importFinTjAllocations = appSchema.table(
    "import_fin_tj_allocations",
    {
        id:              serial("id").primaryKey(),
        tjTransactionId: integer("tj_transaction_id").notNull().references(() => importFinTjTransactions.id, { onDelete: "cascade" }),
        contribId:       integer("contrib_id").notNull().references(() => memberContributions.id),
        memberId:        integer("member_id").notNull().references(() => members.id),
        ledgerId:        integer("ledger_id").references(() => paymentLedger.id, { onDelete: "set null" }),
        amount:          numeric("amount", { precision: 12, scale: 2 }).notNull(),
        note:            text("note"),
        createdBy:       text("created_by").notNull(),
        createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("import_fin_tj_alloc_tx_idx").on(t.tjTransactionId),
        index("import_fin_tj_alloc_contrib_idx").on(t.contribId),
    ]
);

// ── System tables ────────────────────────────────────────────────────────────

export const mailEvents = appSchema.table(
    "mail_events",
    {
        id:        uuid("id").primaryKey().defaultRandom(),
        provider:  text("provider").notNull().default("resend"),
        direction: text("direction", { enum: ["outbound", "inbound", "webhook"] }).notNull(),
        eventType: text("event_type").notNull(),
        emailType: text("email_type"),   // 'prescription' | 'reminder' | 'other'
        messageId: text("message_id"),
        fromEmail: text("from_email"),
        toEmail:   text("to_email"),
        subject:   text("subject"),
        payload:   jsonb("payload").notNull().default({}),
        memberId:  integer("member_id").references(() => members.id, { onDelete: "set null" }),
        contribId: integer("contrib_id").references(() => memberContributions.id, { onDelete: "set null" }),
        periodId:  integer("period_id").references(() => contributionPeriods.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (t) => [
        index("mail_events_created_at_idx").on(t.createdAt.desc()),
        index("mail_events_event_type_idx").on(t.eventType),
        index("mail_events_member_idx").on(t.memberId),
        index("mail_events_contrib_idx").on(t.contribId),
        index("mail_events_period_idx").on(t.periodId),
    ]
);
