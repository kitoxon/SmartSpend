-- Run this once if SmartSpend reports:
-- "column recurring_transactions.next_due does not exist"
-- Safe to rerun and safe for existing recurring rows.

alter table public.recurring_transactions
  add column if not exists frequency text,
  add column if not exists next_due timestamptz,
  add column if not exists anchor_day integer,
  add column if not exists transaction_template jsonb;

-- Ask the Supabase REST API to refresh its view of the table immediately.
notify pgrst, 'reload schema';
