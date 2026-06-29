-- إن كان جدول threa_event_config موجوداً مسبقاً — أضف عمود المعايير فقط
alter table public.threa_event_config
  add column if not exists booking_policy jsonb;
