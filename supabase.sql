create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key,
  email text unique not null,
  display_name text,
  grad_year int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  block text not null,
  rotation text not null,
  start_date date not null,
  end_date date not null,
  site text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create or replace trigger set_schedule_entries_updated_at
before update on public.schedule_entries
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.schedule_entries enable row level security;

create policy "users can read all profiles"
on public.profiles for select
using (auth.uid() is not null);

create policy "users can upsert their own profile"
on public.profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "users can read all schedules"
on public.schedule_entries for select
using (auth.uid() is not null);

create policy "users can insert their own schedules"
on public.schedule_entries for insert
with check (auth.uid() = user_id);

create policy "users can update their own schedules"
on public.schedule_entries for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete their own schedules"
on public.schedule_entries for delete
using (auth.uid() = user_id);
