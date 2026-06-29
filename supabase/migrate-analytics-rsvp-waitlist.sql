-- تحليلات + RSVP + قائمة انتظار — نفّذ في Supabase SQL Editor

alter table public.threa_guest_assignments
  add column if not exists rsvp_status text not null default 'pending';

alter table public.threa_guest_assignments
  add column if not exists rsvp_at timestamptz;

alter table public.threa_guest_assignments
  add column if not exists whatsapp_status text;

alter table public.threa_guest_assignments
  add column if not exists whatsapp_sent_at timestamptz;

alter table public.threa_guest_assignments
  add column if not exists whatsapp_error text;

create index if not exists threa_guest_assignments_rsvp_idx
  on public.threa_guest_assignments (rsvp_status);

create table if not exists public.threa_waitlist (
  id text primary key,
  national_id text not null unique,
  student_name text not null default '',
  companion_name text not null default '',
  whatsapp_phone text not null default '',
  has_companion boolean not null default false,
  status text not null default 'waiting',
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  note text not null default ''
);

create index if not exists threa_waitlist_status_idx on public.threa_waitlist (status);

alter table public.threa_waitlist enable row level security;

drop policy if exists "threa_waitlist_anon" on public.threa_waitlist;
create policy "threa_waitlist_anon" on public.threa_waitlist
  for all to anon, authenticated using (true) with check (true);
