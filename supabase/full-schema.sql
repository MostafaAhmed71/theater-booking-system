-- =============================================================================
-- ثريا (Threa) — مخطط قاعدة بيانات كامل
-- =============================================================================
-- المشروع: mookpmxugpgpofocuddk
-- الرابط:  https://mookpmxugpgpofocuddk.supabase.co
--
-- الاستخدام:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. الصق هذا الملف بالكامل → Run
--   3. تحقق من Realtime (قسم 8) إن لم يُفعَّل تلقائياً
--
-- يشمل: الجداول، الفهارس، RLS، بيانات افتراضية، Realtime
-- آمن لإعادة التشغيل على قاعدة فارغة أو جزئية (IF NOT EXISTS / DROP POLICY IF EXISTS)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) حجوزات الخريجين والضيوف
-- -----------------------------------------------------------------------------
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
  checked_in_at timestamptz,
  rsvp_status text not null default 'pending',
  rsvp_at timestamptz,
  whatsapp_status text,
  whatsapp_sent_at timestamptz,
  whatsapp_error text,
  constraint threa_guest_assignments_rsvp_status_check
    check (rsvp_status in ('pending', 'confirmed', 'declined')),
  constraint threa_guest_assignments_whatsapp_status_check
    check (
      whatsapp_status is null
      or whatsapp_status in ('pending', 'sent', 'failed')
    )
);

-- أعمدة إضافية إن وُجد الجدول بنسخة قديمة
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

create index if not exists threa_guest_assignments_invite_code_idx
  on public.threa_guest_assignments (invite_code);

create index if not exists threa_guest_assignments_national_id_idx
  on public.threa_guest_assignments (national_id);

create index if not exists threa_guest_assignments_rsvp_idx
  on public.threa_guest_assignments (rsvp_status);

create index if not exists threa_guest_assignments_checked_in_idx
  on public.threa_guest_assignments (checked_in_at)
  where checked_in_at is not null;

-- -----------------------------------------------------------------------------
-- 2) إعدادات الحفل (حدود الضيوف، مقاعد الفئات، معايير الحجز، مدخل البانوراما)
-- -----------------------------------------------------------------------------
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

alter table public.threa_event_config
  add column if not exists student_seat_ids jsonb not null default '[]'::jsonb;
alter table public.threa_event_config
  add column if not exists companion_seat_ids jsonb not null default '[]'::jsonb;
alter table public.threa_event_config
  add column if not exists booking_policy jsonb;
alter table public.threa_event_config
  add column if not exists panorama_entrance jsonb;

-- -----------------------------------------------------------------------------
-- 3) قائمة أسماء الخريجين (هوية → اسم)
-- -----------------------------------------------------------------------------
create table if not exists public.threa_student_roster (
  id text primary key default 'default',
  entries jsonb not null default '{}'::jsonb,
  updated_at timestamptz
);

-- -----------------------------------------------------------------------------
-- 4) معايرة مواضع المقاعد على صورة البانوراما
-- -----------------------------------------------------------------------------
create table if not exists public.threa_seat_pins (
  seat_id text primary key,
  pan_u double precision not null,
  pan_v double precision not null,
  saved_at timestamptz,
  note text not null default ''
);

-- -----------------------------------------------------------------------------
-- 5) قائمة الانتظار (عند امتلاء المقاعد)
-- -----------------------------------------------------------------------------
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
  note text not null default '',
  constraint threa_waitlist_status_check
    check (status in ('waiting', 'notified', 'cancelled'))
);

create index if not exists threa_waitlist_status_idx
  on public.threa_waitlist (status);

create index if not exists threa_waitlist_created_at_idx
  on public.threa_waitlist (created_at);

-- -----------------------------------------------------------------------------
-- 6) Row Level Security (RLS)
-- -----------------------------------------------------------------------------
-- تحذير: السياسات الحالية تسمح بالقراءة والكتابة الكاملة عبر مفتاح anon.
-- مناسبة لنموذج Firestore السابق؛ للإنتاج العام يُفضّل تشديد السياسات لاحقاً.

alter table public.threa_guest_assignments enable row level security;
alter table public.threa_event_config enable row level security;
alter table public.threa_student_roster enable row level security;
alter table public.threa_seat_pins enable row level security;
alter table public.threa_waitlist enable row level security;

drop policy if exists "threa_guest_assignments_anon" on public.threa_guest_assignments;
create policy "threa_guest_assignments_anon" on public.threa_guest_assignments
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "threa_event_config_anon" on public.threa_event_config;
create policy "threa_event_config_anon" on public.threa_event_config
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "threa_student_roster_anon" on public.threa_student_roster;
create policy "threa_student_roster_anon" on public.threa_student_roster
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "threa_seat_pins_anon" on public.threa_seat_pins;
create policy "threa_seat_pins_anon" on public.threa_seat_pins
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "threa_waitlist_anon" on public.threa_waitlist;
create policy "threa_waitlist_anon" on public.threa_waitlist
  for all to anon, authenticated
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- 7) بيانات افتراضية (صفوف البداية) — لا تُكرّر الصف إن وُجد مسبقاً
-- -----------------------------------------------------------------------------
insert into public.threa_event_config (
  id,
  ceremony_guest_seat_quota,
  ceremony_guest_seat_ids,
  student_seat_ids,
  companion_seat_ids,
  booking_policy,
  panorama_entrance,
  updated_at
)
select
  'default',
  70,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  null,
  '{"panU": 0.5, "panV": 0.94}'::jsonb,
  now()
where not exists (
  select 1 from public.threa_event_config where id = 'default'
);

insert into public.threa_student_roster (id, entries, updated_at)
select 'default', '{}'::jsonb, now()
where not exists (
  select 1 from public.threa_student_roster where id = 'default'
);

-- -----------------------------------------------------------------------------
-- 8) Realtime — تحديث فوري لشاشة المنظّم والتحليلات
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'threa_guest_assignments'
  ) then
    alter publication supabase_realtime add table public.threa_guest_assignments;
  end if;
exception
  when undefined_object then
    raise notice 'تعذّر إضافة Realtime تلقائياً — فعّله يدوياً: Database → Replication → threa_guest_assignments';
end $$;

-- -----------------------------------------------------------------------------
-- 9) طلبات حجز الضيوف (مراجعة يدوية)
-- -----------------------------------------------------------------------------
create table if not exists public.threa_guest_requests (
  id text primary key,
  guest_ref text not null,
  guest_name text not null default '',
  whatsapp_phone text not null default '',
  status text not null default 'pending',
  seat_id text,
  assignment_id text,
  invite_code text,
  check_in_token text,
  reject_reason text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  whatsapp_sent_at timestamptz,
  constraint threa_guest_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists threa_guest_requests_status_idx
  on public.threa_guest_requests (status);

create index if not exists threa_guest_requests_created_idx
  on public.threa_guest_requests (created_at desc);

alter table public.threa_guest_requests enable row level security;

drop policy if exists "threa_guest_requests_anon" on public.threa_guest_requests;
create policy "threa_guest_requests_anon" on public.threa_guest_requests
  for all to anon, authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 10) ملخص (للتحقق بعد التنفيذ)
-- -----------------------------------------------------------------------------
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name like 'threa_%'
-- order by 1;
