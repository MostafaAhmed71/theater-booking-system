-- طلبات حجز الضيوف (مراجعة يدوية قبل تأكيد المقعد)
-- نفّذ في Supabase SQL Editor

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

create index if not exists threa_guest_requests_guest_ref_idx
  on public.threa_guest_requests (guest_ref);

alter table public.threa_guest_requests enable row level security;

drop policy if exists "threa_guest_requests_anon" on public.threa_guest_requests;
create policy "threa_guest_requests_anon" on public.threa_guest_requests
  for all to anon, authenticated using (true) with check (true);

-- Realtime لصفحة المراجعة (اختياري):
-- alter publication supabase_realtime add table public.threa_guest_requests;
