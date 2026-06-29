-- ثريا — جداول الحجز (نفّذ في Supabase → SQL Editor)
-- Project: mookpmxugpgpofocuddk

-- حجوزات الخريجين والضيوف
create table if not exists public.threa_guest_assignments (
  id text primary key,
  national_id text not null,
  student_name text not null default '',
  companion_name text not null default '',
  whatsapp_phone text not null default '',
  seat_ids jsonb not null default '[]'::jsonb,
  check_in_token text not null default '',
  invite_code text,
  saved_at timestamptz,
  checked_in_at timestamptz
);

create index if not exists threa_guest_assignments_invite_code_idx
  on public.threa_guest_assignments (invite_code);

-- إعدادات ضيوف المراسم
create table if not exists public.threa_event_config (
  id text primary key default 'default',
  ceremony_guest_seat_quota integer not null default 70,
  ceremony_guest_seat_ids jsonb not null default '[]'::jsonb,
  student_seat_ids jsonb not null default '[]'::jsonb,
  companion_seat_ids jsonb not null default '[]'::jsonb,
  booking_policy jsonb,
  panorama_entrance jsonb,
  updated_at timestamptz
);

-- سجل أسماء الخريجين
create table if not exists public.threa_student_roster (
  id text primary key default 'default',
  entries jsonb not null default '{}'::jsonb,
  updated_at timestamptz
);

-- معايرة مواضع المقاعد على البانوراما
create table if not exists public.threa_seat_pins (
  seat_id text primary key,
  pan_u double precision not null,
  pan_v double precision not null,
  saved_at timestamptz,
  note text not null default ''
);

-- RLS: قراءة/كتابة عامة عبر anon (مثل firestore.rules السابق)
alter table public.threa_guest_assignments enable row level security;
alter table public.threa_event_config enable row level security;
alter table public.threa_student_roster enable row level security;
alter table public.threa_seat_pins enable row level security;

drop policy if exists "threa_guest_assignments_anon" on public.threa_guest_assignments;
create policy "threa_guest_assignments_anon" on public.threa_guest_assignments
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "threa_event_config_anon" on public.threa_event_config;
create policy "threa_event_config_anon" on public.threa_event_config
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "threa_student_roster_anon" on public.threa_student_roster;
create policy "threa_student_roster_anon" on public.threa_student_roster
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "threa_seat_pins_anon" on public.threa_seat_pins;
create policy "threa_seat_pins_anon" on public.threa_seat_pins
  for all to anon, authenticated using (true) with check (true);

-- Realtime لتحديث شاشة المنظّم: Database → Replication → أضف threa_guest_assignments
-- (أو نفّذ السطر التالي مرة واحدة فقط إن لم يكن الجدول مضافاً)
-- alter publication supabase_realtime add table public.threa_guest_assignments;
