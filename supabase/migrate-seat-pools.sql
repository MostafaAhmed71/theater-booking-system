-- أعمدة مقاعد الخريجين والمرافقين (نفّذ إن كان الجدول موجوداً مسبقاً)
alter table public.threa_event_config
  add column if not exists student_seat_ids jsonb not null default '[]'::jsonb;

alter table public.threa_event_config
  add column if not exists companion_seat_ids jsonb not null default '[]'::jsonb;
