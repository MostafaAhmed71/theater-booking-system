-- نقطة مدخل المسرح على البانوراما (مسار من المدخل للمقعد)
alter table public.threa_event_config
  add column if not exists panorama_entrance jsonb;
