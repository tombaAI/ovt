alter table app.members
    add column if not exists bank_account_number text,
    add column if not exists bank_code text;

alter table app.event_expenses
    add column if not exists reimbursement_member_id integer;

alter table app.event_expenses
    drop constraint if exists event_expenses_reimbursement_member_id_fkey,
    add constraint event_expenses_reimbursement_member_id_fkey
        foreign key (reimbursement_member_id)
        references app.members(id)
        on delete set null;

create index if not exists event_expenses_reimbursement_member_idx
    on app.event_expenses(reimbursement_member_id);
