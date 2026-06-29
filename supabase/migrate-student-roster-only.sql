-- قائمة أسماء الخريجين (هوية → اسم) — نفّذ مرة واحدة في Supabase → SQL Editor
-- Project: mookpmxugpgpofocuddk

create table if not exists public.threa_student_roster (
  id text primary key default 'default',
  entries jsonb not null default '{}'::jsonb,
  updated_at timestamptz
);

alter table public.threa_student_roster enable row level security;

drop policy if exists "threa_student_roster_anon" on public.threa_student_roster;
create policy "threa_student_roster_anon" on public.threa_student_roster
  for all to anon, authenticated using (true) with check (true);

-- صف افتراضي فارغ (اختياري — التطبيق ينشئه عند أول حفظ أيضاً)
insert into public.threa_student_roster (id, entries, updated_at)
select 'default', '{}'::jsonb, now()
where not exists (
  select 1 from public.threa_student_roster where id = 'default'
);
