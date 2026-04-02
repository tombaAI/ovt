create extension if not exists pgcrypto;

create schema if not exists app;

create table if not exists app.admin_users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    display_name text,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists app.mail_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null default 'resend',
    direction text not null check (direction in ('outbound', 'inbound', 'webhook')),
    event_type text not null,
    message_id text,
    from_email text,
    to_email text,
    subject text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists mail_events_created_at_idx
    on app.mail_events (created_at desc);

create index if not exists mail_events_event_type_idx
    on app.mail_events (event_type);