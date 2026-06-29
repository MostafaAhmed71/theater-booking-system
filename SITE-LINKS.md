# روابط صفحات موقع ثريا — حجز حفل التخرج

**الموقع (إنتاج):** https://hajz.northelite0.com  
**المدرسة:** ثانوية نخبة الشمال الأهلية — الدفعة الخامسة

استبدل `BASE` بـ `https://hajz.northelite0.com` أو بعنوان التشغيل المحلي (مثل `http://localhost:8080`).

---

## الصفحات الرئيسية

| الصفحة | الملف | الرابط (إنتاج) | لمن؟ |
|--------|------|----------------|------|
| حجز الخريجين | `index.html` | https://hajz.northelite0.com/ | الخريجون وذووهم |
| حجز ضيوف المراسم | `guest-booking.html` | https://hajz.northelite0.com/guest-booking.html | ضيوف المراسم |
| معايرة وإدارة | `calibrate.html` | https://hajz.northelite0.com/calibrate.html | الإدارة / التقنية |
| شاشة المنظّمين | `organizer.html` | https://hajz.northelite0.com/organizer.html | استقبال الحفل (مسح QR) |
| كشك «أين مقعدي؟» | `kiosk.html` | https://hajz.northelite0.com/kiosk.html | داخل القاعة |
| لوحة التحليلات | `analytics.html` | https://hajz.northelite0.com/analytics.html | الإدارة (إحصائيات مباشرة) |
| متابعة الحجوزات | `bookings-monitor.html` | https://hajz.northelite0.com/bookings-monitor.html | الإدارة (مباشر + تذكير RSVP) |
| محاكاة (اختبار) | `simulate.html` | https://hajz.northelite0.com/simulate.html | داخلي — اختبار فقط |

---

## صفحات تُفتح من روابط الدعوة (واتساب)

| الصفحة | الملف | مثال رابط |
|--------|------|-----------|
| عرض المقعد | `seat.html` | `https://hajz.northelite0.com/seat.html?code=A123&t=رمز_التحقق` |
| تأكيد الحضور / الاعتذار (RSVP) | `rsvp.html` | `https://hajz.northelite0.com/rsvp.html?code=A123&t=رمز_التحقق` |

**معاملات `seat.html` و `rsvp.html`:**

- `code` — رمز الدعوة (حرف + 3 أرقام)، أو
- `nid` — رقم الهوية (بديل عن `code`)
- `t` — رمز التحقق من الحجز (`checkInToken`) — **مطلوب**

---

## قائمة نصية سريعة (نسخ ولصق)

```
https://hajz.northelite0.com/
https://hajz.northelite0.com/index.html
https://hajz.northelite0.com/guest-booking.html
https://hajz.northelite0.com/calibrate.html
https://hajz.northelite0.com/organizer.html
https://hajz.northelite0.com/kiosk.html
https://hajz.northelite0.com/analytics.html
https://hajz.northelite0.com/bookings-monitor.html
https://hajz.northelite0.com/simulate.html
https://hajz.northelite0.com/seat.html
https://hajz.northelite0.com/rsvp.html
```

---

## روابط نسبية (تعمل على أي مجلد رفعت عليه الموقع)

```
./index.html
./guest-booking.html
./calibrate.html
./organizer.html
./kiosk.html
./analytics.html
./bookings-monitor.html
./simulate.html
./seat.html
./rsvp.html
```

---

## خدمات مرتبطة (ليست صفحات الحجز)

| الخدمة | الرابط |
|--------|--------|
| خادم واتساب (WPPConnect) | https://wpp.northelite0.com |
| لوحة QR واتساب | https://wpp.northelite0.com/qr |

---

*آخر تحديث للفهرس: مايو 2026 — يُحدَّث من `threa-config.js` → `siteBaseUrl`.*
