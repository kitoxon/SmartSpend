-- Runway pay-cycle planner: cards, transfer bills, card statements, bill
-- payments, check-ins and settings. Each record keeps its fields in `data`, so
-- adding a field later needs no schema change. Safe to rerun.

create table if not exists public.planner_records (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id text not null,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists planner_records_user_kind_idx on public.planner_records(user_id, kind);

alter table public.planner_records enable row level security;

revoke all on public.planner_records from anon;
grant select, insert, update, delete on public.planner_records to authenticated;

drop policy if exists "Owner manages own planner records" on public.planner_records;
create policy "Owner manages own planner records" on public.planner_records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A split card bill becomes a debt that is repaid inside that card's bills.
alter table public.debts add column if not exists "cardId" text;
