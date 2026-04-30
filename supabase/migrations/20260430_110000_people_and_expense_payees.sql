alter table app.members
    add column if not exists bank_account_number text,
    add column if not exists bank_code text;

create table if not exists app.people (
    id serial primary key,
    member_id integer references app.members(id) on delete set null,
    first_name text,
    last_name text,
    full_name text not null,
    email text,
    phone text,
    bank_account_number text,
    bank_code text,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists people_member_id_uq
    on app.people(member_id);

create index if not exists people_full_name_idx
    on app.people(full_name);

create index if not exists people_email_idx
    on app.people(email);

insert into app.people (
    member_id,
    first_name,
    last_name,
    full_name,
    email,
    phone,
    bank_account_number,
    bank_code,
    created_at,
    updated_at
)
select
    m.id,
    m.first_name,
    m.last_name,
    m.full_name,
    m.email,
    m.phone,
    m.bank_account_number,
    m.bank_code,
    now(),
    now()
from app.members m
on conflict (member_id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    bank_account_number = excluded.bank_account_number,
    bank_code = excluded.bank_code,
    updated_at = now();

alter table app.event_expenses
    add column if not exists reimbursement_member_id integer,
    add column if not exists reimbursement_person_id integer;

alter table app.event_expenses
    drop constraint if exists event_expenses_reimbursement_member_id_fkey,
    add constraint event_expenses_reimbursement_member_id_fkey
        foreign key (reimbursement_member_id)
        references app.members(id)
        on delete set null;

create index if not exists event_expenses_reimbursement_member_idx
    on app.event_expenses(reimbursement_member_id);

alter table app.event_expenses
    drop constraint if exists event_expenses_reimbursement_person_id_fkey,
    add constraint event_expenses_reimbursement_person_id_fkey
        foreign key (reimbursement_person_id)
        references app.people(id)
        on delete set null;

create index if not exists event_expenses_reimbursement_person_idx
    on app.event_expenses(reimbursement_person_id);

update app.event_expenses ee
set reimbursement_person_id = p.id
from app.people p
where ee.reimbursement_member_id = p.member_id
  and ee.reimbursement_member_id is not null
  and ee.reimbursement_person_id is null;
