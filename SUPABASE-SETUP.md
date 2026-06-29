# إعداد Supabase لمشروع ثريا

**Project ID:** `mookpmxugpgpofocuddk`  
**URL:** `https://mookpmxugpgpofocuddk.supabase.co`

## 1. إنشاء الجداول

1. افتح [Supabase Dashboard](https://supabase.com/dashboard/project/mookpmxugpgpofocuddk).
2. **SQL Editor** → New query.
3. الصق محتوى **`supabase/full-schema.sql`** بالكامل → **Run** (ملف واحد شامل — يُفضَّل).
   - بديل قديم: `schema.sql` + ملفات `migrate-*.sql` بالترتيب.

## 2. تفعيل Realtime (لشاشة المنظّم)

1. **Database** → **Replication** (أو Publications).
2. تأكد أن `threa_guest_assignments` مضاف لـ `supabase_realtime`.

## 3. رفع الموقع

استبدل في كل صفحة HTML:

- ~~`firebase-init.js`~~ → **`supabase-init.js`**

الملفات المطلوبة على Hostinger:

- `supabase-config.js`
- `supabase-init.js`
- `guest-assignments.js`, `guest-quota.js`, `student-roster.js`, `panorama-storage.js`

لم يعد `firebase-config.js` / `firebase-init.js` مطلوباً للإنتاج.

## 4. استيراد المعايرة وقائمة الخريجين (من القاعدة القديمة)

| البيانات | الملف | التنفيذ |
|----------|-------|---------|
| قائمة الخريجين | `supabase/threa_student_roster_rows.sql` | SQL Editor → Run |
| معايرة المقاعد (144 مقعد) | `supabase/import-seat-pins.sql` | SQL Editor → Run |
| قوائم مقاعد الحجز (خريج/مرافق/ضيف) | `supabase/reset-event-seat-pools.sql` | بعد import-seat-pins |
| طلبات ضيوف المراسم (مراجعة) | `supabase/migrate-guest-requests.sql` | قبل تفعيل الحجز الجديد |

بديل المعايرة: افتح `calibrate.html` → استيراد `threa-panorama-pins.json` → حفظ.

## 5. ترحيل بيانات Firebase (إن وُجدت)

من Firebase Console صدّر مستندات:

| Firebase | Supabase |
|----------|----------|
| `threaGuestAssignments/{id}` | `threa_guest_assignments` (حقول snake_case) |
| `threaEventConfig/default` | `threa_event_config` (يشمل `student_seat_ids`, `companion_seat_ids`, `ceremony_guest_seat_ids`) |
| `threaStudentRoster/default` | `threa_student_roster` |
| `threaSeatPins/{seatId}` | `threa_seat_pins` |

مثال صف حجز:

```json
{
  "id": "1234567890",
  "national_id": "1234567890",
  "student_name": "…",
  "companion_name": "",
  "whatsapp_phone": "05…",
  "seat_ids": ["LEFT-R02-S01"],
  "check_in_token": "…",
  "invite_code": "K347",
  "saved_at": "2026-05-20T12:00:00Z",
  "checked_in_at": null
}
```

## 6. أمان

المفتاح `anon` موجود في `supabase-config.js` (طبيعي للويب). الحماية عبر **RLS** في `schema.sql`. لا تضع `service_role` في الواجهة.
