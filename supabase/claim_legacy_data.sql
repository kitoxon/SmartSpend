-- Run this AFTER signing in to the new SmartSpend UI once.
-- Leave owner_email as null when this project has exactly one Auth user.
-- If it has multiple Auth users, replace null with your exact sign-in email.

do $$
declare
  owner_email constant text := null;
  owner_id uuid;
  owner_count integer;
begin
  if owner_email is null or btrim(owner_email) = '' then
    select count(*) into owner_count from auth.users;

    if owner_count = 0 then
      raise exception 'No Supabase Auth user found; sign in to SmartSpend once, then rerun this script';
    elsif owner_count > 1 then
      raise exception 'Multiple Auth users found; edit owner_email in this script to select your account';
    end if;

    select id into owner_id
    from auth.users
    limit 1;
  else
    select id into owner_id
    from auth.users
    where lower(email) = lower(owner_email)
    limit 1;
  end if;

  if owner_id is null then
    raise exception 'No Supabase Auth user found for %; sign in once first', owner_email;
  end if;

  update public.transactions set user_id = owner_id where user_id is null;
  update public.debts set user_id = owner_id where user_id is null;
  update public.goals set user_id = owner_id where user_id is null;
  update public.recurring_transactions set user_id = owner_id where user_id is null;
  update public.habit_patterns set user_id = owner_id where user_id is null;
  update public.habit_reminder_state set user_id = owner_id where user_id is null;
end $$;

alter table public.transactions alter column user_id set not null;
alter table public.debts alter column user_id set not null;
alter table public.goals alter column user_id set not null;
alter table public.recurring_transactions alter column user_id set not null;
alter table public.habit_patterns alter column user_id set not null;
alter table public.habit_reminder_state alter column user_id set not null;
