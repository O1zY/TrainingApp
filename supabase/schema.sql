-- Training Tracker sync: one row per store per person. Run once in the Supabase SQL editor
-- (Dashboard › SQL Editor › New query), see README "Sync across devices".

create table if not exists public.tt_store (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null check (key in ('tt-settings', 'tt-log-v1', 'tt-plan-v1', 'tt-strava-v1')),
  data       jsonb       not null,
  -- Goes up by one on every write; the app only writes when it still matches what it last saw.
  rev        bigint      not null default 1 check (rev > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Each signed-in person can only see and change their own rows.
alter table public.tt_store enable row level security;

drop policy if exists "own rows: read" on public.tt_store;
drop policy if exists "own rows: add" on public.tt_store;
drop policy if exists "own rows: change" on public.tt_store;
drop policy if exists "own rows: remove" on public.tt_store;
create policy "own rows: read" on public.tt_store for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: add" on public.tt_store for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: change" on public.tt_store for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: remove" on public.tt_store for delete to authenticated using ((select auth.uid()) = user_id);

-- The revision may only go up by exactly one, so a stale device can't jump over another's write.
create or replace function public.tt_store_check_rev() returns trigger language plpgsql as $$
begin
  if new.rev <> old.rev + 1 then
    raise exception 'tt_store: rev must go from % to %, not %', old.rev, old.rev + 1, new.rev;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tt_store_check_rev on public.tt_store;
create trigger tt_store_check_rev before update on public.tt_store for each row execute function public.tt_store_check_rev();
