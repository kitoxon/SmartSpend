-- Run this if SmartSpend reports either:
-- "column recurring_transactions.next_due does not exist"
-- or
-- "null value in column nextdue violates not-null constraint"
--
-- Older SmartSpend tables used unquoted camelCase names, which PostgreSQL
-- stored as nextdue / anchorday / transactiontemplate. This repair preserves
-- those values, switches the app to the current snake_case columns, and makes
-- the obsolete columns optional so new inserts are accepted.
-- Safe to rerun and safe for existing recurring rows.

alter table public.recurring_transactions
  add column if not exists frequency text,
  add column if not exists next_due timestamptz,
  add column if not exists anchor_day integer,
  add column if not exists transaction_template jsonb;

do $$
declare
  legacy_column text;
begin
  for legacy_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recurring_transactions'
      and column_name in ('nextdue', 'nextDue')
  loop
    execute format(
      'update public.recurring_transactions
       set next_due = coalesce(next_due, %I::timestamptz)
       where next_due is null',
      legacy_column
    );
    execute format(
      'alter table public.recurring_transactions alter column %I drop not null',
      legacy_column
    );
  end loop;

  for legacy_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recurring_transactions'
      and column_name in ('anchorday', 'anchorDay')
  loop
    execute format(
      'update public.recurring_transactions
       set anchor_day = coalesce(anchor_day, %I::integer)
       where anchor_day is null',
      legacy_column
    );
    execute format(
      'alter table public.recurring_transactions alter column %I drop not null',
      legacy_column
    );
  end loop;

  for legacy_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recurring_transactions'
      and column_name in ('transactiontemplate', 'transactionTemplate')
  loop
    execute format(
      'update public.recurring_transactions
       set transaction_template = coalesce(transaction_template, %I::jsonb)
       where transaction_template is null',
      legacy_column
    );
    execute format(
      'alter table public.recurring_transactions alter column %I drop not null',
      legacy_column
    );
  end loop;

  -- Keep current columns strict once every legacy row has been migrated.
  if not exists (
    select 1 from public.recurring_transactions where next_due is null
  ) then
    execute 'alter table public.recurring_transactions alter column next_due set not null';
  end if;

  if not exists (
    select 1 from public.recurring_transactions where transaction_template is null
  ) then
    execute 'alter table public.recurring_transactions alter column transaction_template set not null';
  end if;
end $$;

-- Ask the Supabase REST API to refresh its view of the table immediately.
notify pgrst, 'reload schema';
