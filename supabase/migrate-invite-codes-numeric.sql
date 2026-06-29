-- تحويل رموز الدعوة القديمة (حرف + 3 أرقام) إلى 4 أرقام فقط
-- مثال: K347 → 0347
-- نفّذ مرة واحدة في Supabase → SQL Editor

update public.threa_guest_assignments
set invite_code = lpad(
  regexp_replace(trim(invite_code), '^[A-Za-z]', ''),
  4,
  '0'
)
where invite_code is not null
  and invite_code ~ '^[A-Za-z][0-9]{1,3}$';
