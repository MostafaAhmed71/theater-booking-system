-- مسح كل حجوزات التجربة قبل فتح الحجز الرسمي
-- Supabase Dashboard → SQL Editor → Run

delete from public.threa_guest_assignments;

-- تحقق
select count(*) as remaining from public.threa_guest_assignments;
