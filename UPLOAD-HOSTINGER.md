# رفع موقع الحجز على Hostinger

الدومين المثال: `https://hajz.northelite0.com`  
مجلد الرفع: جذر الدومين الفرعي (مثل `public_html/hajz` أو ما يعادله في hPanel).

## لا ترفع

- `node_modules/`
- `wppconnect-master/` (يعمل على VPS فقط)
- `wppconnect-deploy.tar.gz`
- `theater.JPG` (~24MB) — استخدم `assets/` فقط
- `scripts/`

---

## قائمة الرفع (إلزامي)

### صور شاشة المسرح
- `home.jpeg` ← خلفية `kiosk.html`
- `assets/icon2.jpeg` ← شعار الشاشة

### الصفحات
- `index.html`
- `calibrate.html`
- `organizer.html`
- `kiosk.html` ← شاشة «أين مقعدي؟» داخل المسرح
- `simulate.html` ← **اختياري** محاكاة حجز (لا ترفع للعامة إن لم ترد)
- `guest-booking.html`
- `seat.html`

### JavaScript
- `guest-assignments.js`
- `threa-config.js` ← يحتوي `whatsappApiBase: "https://wpp.northelite0.com"`
- `supabase-config.js`
- `supabase-init.js` ← **بدلاً من** firebase-init.js
- `seats-data.js`
- `booking-policy.js`
- `seat-picker.js`
- `theater-pano-url.js`
- `student-roster.js`
- `panorama-storage.js`
- `guest-assignments.js`
- `main.js`
- `theater-webgl.js`
- `calibrate.js`
- `organizer.js`
- `invite-codes.js`
- `guest-booking.js`
- `guest-quota.js`
- `kiosk.js`
- `seat.js`

### CSS
- `style.css`
- `calibrate.css`
- `organizer.css`
- `kiosk.css`
- `seat.css`
- `guest-booking.css`

### صور
- `home.jpeg`
- مجلد **`assets/`** كاملاً:
  - `theater-mobile.webp`
  - `theater-mobile.jpg`
  - `theater.webp`
  - `theater.jpg`

### مكتبات محلية
- مجلد **`vendor/`** كاملاً:
  - `gsap.min.js`
  - `qrcode.min.js`
  - `xlsx.full.min.js` (لصفحة المعايرة)

### Firebase (اختياري للمرجع)
- نفّذ `supabase/schema.sql` في Supabase SQL Editor (مرة واحدة) — راجع `SUPABASE-SETUP.md`

---

## بعد الرفع

1. Supabase → **Project Settings** → تأكد أن المشروع `mookpmxugpgpofocuddk` نشط وأن الجداول من `schema.sql` موجودة.
2. تحديث قوي للمتصفح: **Ctrl+F5**
3. اختبار: حجز → إرسال واتساب
4. اختبار: `organizer.html` → مسح QR → قائمة الحضور

---

## رفع سريع من Windows (File Manager أو SCP)

```powershell
# مثال SCP — عدّل مسار الاستضافة
scp -r "f:\new\threa\index.html" "f:\new\threa\*.js" "f:\new\threa\*.css" "f:\new\threa\*.html" "f:\new\threa\home.jpeg" user@host:~/domains/hajz.northelite0.com/public_html/
scp -r "f:\new\threa\assets" "f:\new\threa\vendor" user@host:~/domains/hajz.northelite0.com/public_html/
```

الأفضل: ضغط الملفات المطلوبة فقط ثم فكها من hPanel → File Manager.
