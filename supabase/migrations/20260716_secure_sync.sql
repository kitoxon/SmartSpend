-- SmartSpend authenticated, owner-scoped schema.
-- Safe to rerun. Existing rows are left untouched until claim_legacy_data.sql is run.

create table if not exists public.transactions (
  id text primary key,
  amount numeric not null,
  category text not null,
  date timestamptz not null,
  description text not null,
  type text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.debts (
  id text primary key,
  person text not null,
  amount numeric not null,
  description text not null default '',
  "dueDate" timestamptz not null,
  type text not null default 'payable',
  "debtCategory" text not null default 'Other',
  "isPaid" boolean not null default false,
  "interestRate" numeric,
  "minimumPayment" numeric
);

create table if not exists public.goals (
  id text primary key,
  name text not null,
  "targetAmount" numeric not null,
  "currentAmount" numeric not null default 0,
  deadline text not null default '',
  "startDate" text,
  icon text,
  "monthlyContribution" numeric not null default 0
);

create table if not exists public.recurring_transactions (
  id text primary key,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  next_due timestamptz not null,
  anchor_day integer,
  transaction_template jsonb not null
);

-- CREATE TABLE IF NOT EXISTS does not repair an older table with the same name.
-- Add the current recurring fields explicitly so this migration is safe for
-- projects that already had a placeholder recurring_transactions table.
alter table public.recurring_transactions add column if not exists frequency text;
alter table public.recurring_transactions add column if not exists next_due timestamptz;
alter table public.recurring_transactions add column if not exists anchor_day integer;
alter table public.recurring_transactions add column if not exists transaction_template jsonb;

-- Migrate the column names used by early SmartSpend schemas. PostgreSQL folded
-- their unquoted camelCase names to lowercase, leaving required legacy columns
-- that reject writes using the current snake_case names.
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

create table if not exists public.habit_patterns (
  habit_id text not null,
  category text not null,
  merchant_key text,
  amount_bucket numeric,
  amount_median numeric not null default 0,
  amount_mad numeric,
  interval_type text not null,
  interval_days_median integer,
  dow_prob jsonb not null default '[0,0,0,0,0,0,0]'::jsonb,
  time_start_min integer,
  time_end_min integer,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.habit_reminder_state (
  habit_id text not null,
  last_reminded_date date,
  snoozed_until date,
  dismiss_count_recent integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.transactions add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.debts add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.goals add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.recurring_transactions add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.habit_patterns add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.habit_reminder_state add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists debts_user_id_idx on public.debts(user_id);
create index if not exists goals_user_id_idx on public.goals(user_id);
create index if not exists recurring_transactions_user_id_idx on public.recurring_transactions(user_id);
create unique index if not exists habit_patterns_owner_habit_idx on public.habit_patterns(user_id, habit_id);
create unique index if not exists habit_reminder_owner_habit_idx on public.habit_reminder_state(user_id, habit_id);

-- Remove any old anonymous/permissive policies on only the SmartSpend tables.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'transactions', 'debts', 'goals', 'recurring_transactions',
        'habit_patterns', 'habit_reminder_state'
      )
  loop
    execute format('drop policy %I on public.%I', policy_record.policyname, policy_record.tablename);
  end loop;
end $$;

alter table public.transactions enable row level security;
alter table public.debts enable row level security;
alter table public.goals enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.habit_patterns enable row level security;
alter table public.habit_reminder_state enable row level security;

revoke all on public.transactions, public.debts, public.goals, public.recurring_transactions, public.habit_patterns, public.habit_reminder_state from anon;
grant select, insert, update, delete on public.transactions, public.debts, public.goals, public.recurring_transactions, public.habit_patterns, public.habit_reminder_state to authenticated;

create policy "Owner manages own transactions" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner manages own debts" on public.debts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner manages own goals" on public.goals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner manages own recurring transactions" on public.recurring_transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner manages own habit patterns" on public.habit_patterns
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner manages own habit reminder state" on public.habit_reminder_state
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
