# ثريا — نظام حجز مقاعد حفل التخرج

نظام ويب عربي (RTL) لحجز مقاعد حفل تخرج **ثانوية نخبة الشمال الأهلية** — الدفعة الخامسة. يشمل حجز الخريجين والمرافقين وضيوف المراسم، إرسال دعوات واتساب مع رمز QR، معايرة مواقع المقاعد على بانوراما المسرح، شاشة استقبال للمنظّمين، وكشك «أين مقعدي؟» داخل القاعة.

**الموقع الإنتاجي (مثال):** [https://hajz.northelite0.com](https://hajz.northelite0.com)

---

## المحتويات

1. [المميزات](#المميزات)
2. [روابط جميع الصفحات](#روابط-جميع-الصفحات)
3. [هيكل المشروع](#هيكل-المشروع)
4. [التقنيات](#التقنيات)
5. [قاعدة البيانات (Supabase)](#قاعدة-البيانات-supabase)
6. [الإعداد الأولي](#الإعداد-الأولي)
7. [النشر على Hostinger](#النشر-على-hostinger)
8. [الإعدادات العامة](#الإعدادات-العامة)
9. [تخطيط المقاعد](#تخطيط-المقاعد)
10. [واتساب (WPPConnect)](#واتساب-wppconnect)
11. [التشغيل المحلي](#التشغيل-المحلي)
12. [ملفات توثيق إضافية](#ملفات-توثيق-إضافية)
13. [الأمان](#الأمان)

---

## المميزات

| الميزة | الوصف |
|--------|--------|
| **حجز الخريج** | اختيار مقعد الخريج والمرافق من شبكة المسرح (3D أو بانوراما) |
| **حجز الضيوف** | صفحة منفصلة لضيوف المراسم مع حدّ أقصى للحجوزات |
| **واتساب** | إرسال رسالة دعوة مع رمز QR وشعار المدرسة في المنتصف |
| **معايرة** | تحديد مقاعد كل فئة، معايير الصفوف، موضع كل مقعد على الصورة، نقطة المدخل، ومسار متحرك للوصول |
| **المنظّم** | قائمة حضور، مسح QR، تحديث فوري (Supabase Realtime) |
| **الكشك** | استعلام بالرمز أو مسح QR + عرض المقعد على البانوراما مع مسار من المدخل |
| **عرض المقعد** | صفحة `seat.html` من رابط الدعوة |
| **لوحة التحليلات** | نسبة الحجز، خريطة حرارية، واتساب، عدّ تنازلي |
| **RSVP** | رابط في واتساب لتأكيد الحضور أو الاعتذار (يُحرّر المقعد عند الاعتذار) |
| **قائمة الانتظار** | تسجيل عند امتلاء المقاعد + إشعار واتساب عند التحرّر |

---

## روابط جميع الصفحات

استبدل `BASE` بعنوان موقعك، مثلاً `https://hajz.northelite0.com` أو `http://localhost:8080` عند التشغيل المحلي.

| الصفحة | الملف | الرابط | الجمهور |
|--------|------|--------|---------|
| حجز الخريجين | `index.html` | `BASE/` أو `BASE/index.html` | الخريجون |
| حجز ضيوف المراسم | `guest-booking.html` | `BASE/guest-booking.html` | الضيوف |
| معايرة وإدارة | `calibrate.html` | `BASE/calibrate.html` | الإدارة |
| شاشة المنظّمين | `organizer.html` | `BASE/organizer.html` | الاستقبال |
| كشك «أين مقعدي؟» | `kiosk.html` | `BASE/kiosk.html` | داخل المسرح |
| عرض المقعد (رابط الدعوة) | `seat.html` | `BASE/seat.html?…` | المدعو |
| محاكاة (اختبار) | `simulate.html` | `BASE/simulate.html` | داخلي فقط |
| لوحة التحليلات | `analytics.html` | `BASE/analytics.html` | الإدارة |
| تأكيد الحضور (RSVP) | `rsvp.html` | `BASE/rsvp.html?code=…&t=…` | المدعو (من واتساب) |

### روابط جاهزة (إنتاج)

```
https://hajz.northelite0.com/
https://hajz.northelite0.com/index.html
https://hajz.northelite0.com/guest-booking.html
https://hajz.northelite0.com/calibrate.html
https://hajz.northelite0.com/organizer.html
https://hajz.northelite0.com/kiosk.html
https://hajz.northelite0.com/seat.html
https://hajz.northelite0.com/simulate.html
https://hajz.northelite0.com/analytics.html
https://hajz.northelite0.com/rsvp.html
```

### روابط بين الصفحات (من الواجهة)

- من **المعايرة** → حجز الخريجين، حجز الضيوف، شاشة المنظّمين
- من **الكشك** → الصفحة الرئيسية للكشك فقط (لا حجز من الكشك)
- من **seat.html** → العودة لـ `index.html` عند الخطأ

### معاملات `seat.html` (عرض المقعد)

تُبنى تلقائياً من رسالة واتساب، مثال:

```
seat.html?id=رقم_الهوية&token=رمز_التحقق
```

---

## هيكل المشروع

```
threa/
├── index.html              # حجز الخريج + المرافق
├── guest-booking.html      # حجز ضيوف المراسم
├── calibrate.html          # معايرة المقاعد والإعدادات
├── organizer.html          # استقبال وتسجيل حضور
├── kiosk.html              # كشك الاستعلام داخل المسرح
├── seat.html               # عرض مقعد من رابط الدعوة
├── simulate.html           # محاكاة حجز (اختبار)
│
├── main.js                 # منطق حجز الخريج + بانوراما/3D
├── guest-booking.js
├── guest-assignments.js    # حجوزات Supabase + Realtime
├── guest-quota.js          # إعدادات الضيوف + pools + سياسة الحجز
├── student-roster.js       # قائمة أسماء الخريجين
├── seats-data.js           # تخطيط 217 مقعد + سياسات
├── booking-policy.js       # معايير صفوف الحجز
├── seat-picker.js          # شبكة اختيار المقاعد
├── panorama-storage.js     # إحداثيات المقاعد على الصورة
├── panorama-path.js        # مسار متحرك من المدخل للمقعد
├── theater-webgl.js        # عرض ثلاثي الأبعاد
├── theater-pano-url.js     # مسارات صور البانوراما
├── calibrate.js
├── organizer.js
├── kiosk.js
├── seat.js
├── invite-codes.js         # رموز الدعوة (4 أرقام)
├── threa-config.js         # إعدادات المدرسة + واتساب + روابط
├── supabase-config.js      # مفاتيح Supabase
├── supabase-init.js        # تهيئة العميل
│
├── style.css
├── calibrate.css
├── organizer.css
├── kiosk.css
├── seat.css
├── guest-booking.css
│
├── assets/                 # صور المسرح + الشعار
│   ├── icon2.jpeg          # شعار الكشك والـ QR
│   ├── theater.jpg / .webp
│   └── theater-mobile.*
├── home.jpeg               # خلفية شاشة الكشك
├── vendor/                 # gsap, qrcode, xlsx
│
├── supabase/
│   ├── full-schema.sql     # ★ مخطط كامل (نفّذه مرة واحدة)
│   ├── schema.sql          # أساسي فقط (قديم)
│   └── migrate-*.sql       # ترحيلات جزئية (اختياري)
│
├── wppconnect-master/      # خادم واتساب (VPS — لا يُرفع مع الموقع)
│
├── README.md               # هذا الملف
├── SUPABASE-SETUP.md
├── SEATING-LAYOUT.md
├── UPLOAD-HOSTINGER.md
├── SIMULATE.md
└── HOSTINGER-WEBSITE-AND-SUBDOMAIN.md
```

---

## التقنيات

- **واجهة:** HTML5, CSS3, JavaScript (بدون إطار frontend)
- **خط:** Tajawal (Google Fonts)
- **رسوم:** GSAP، Three.js (مشهد 3D)، بانوراما JPG/WebP
- **قاعدة بيانات:** [Supabase](https://supabase.com) (PostgreSQL + Realtime)
- **واتساب:** WPPConnect على VPS (`wpp.northelite0.com`)
- **استضافة الموقع:** Hostinger (ملفات ثابتة)
- **مكتبات:** `qrcode`, `xlsx` (استيراد قائمة الخريجين في المعايرة)

---

## قاعدة البيانات (Supabase)

**المشروع:** `mookpmxugpgpofocuddk`  
**الرابط:** `https://mookpmxugpgpofocuddk.supabase.co`

| الجدول | الغرض |
|--------|--------|
| `threa_guest_assignments` | حجوزات الخريجين والضيوف (مقاعد، واتساب، QR، حضور) |
| `threa_event_config` | حدّ الضيوف، قوائم مقاعد الفئات، `booking_policy`, `panorama_entrance` |
| `threa_student_roster` | قاموس هوية → اسم الخريج |
| `threa_seat_pins` | معايرة `pan_u` / `pan_v` لكل مقعد على البانوراما |

التفاصيل: [SUPABASE-SETUP.md](./SUPABASE-SETUP.md)

---

## الإعداد الأولي

### 1. Supabase

1. نفّذ **`supabase/full-schema.sql`** في **SQL Editor** (ملف واحد شامل).
   - أو يدوياً: `schema.sql` ثم ملفات `migrate-*.sql` بالترتيب.
3. فعّل **Realtime** لجدول `threa_guest_assignments` (شاشة المنظّم والتحليلات).

### 2. المعايرة (مرة واحدة)

1. افتح `calibrate.html`.
2. **معايير الحجز** → احفظ → طبّق على المقاعد.
3. **تحديد مقاعد الحجز** → خريج / مرافق / ضيف → احفظ.
4. **معايرة البانوراما** → حدّد المدخل → عيّن كل مقعد على الصورة → احفظ.
5. **قائمة الخريجين** → استيراد Excel أو إدخال يدوي → احفظ.
6. **حدّ حجوزات الضيوف** → احفظ.

### 3. واتساب

شغّل خادم WPPConnect على VPS واربطه في `threa-config.js` → `whatsappApiBase`.  
راجع: [HOSTINGER-WEBSITE-AND-SUBDOMAIN.md](./HOSTINGER-WEBSITE-AND-SUBDOMAIN.md) و [wppconnect-master/DEPLOY-HOSTINGER-VPS.md](./wppconnect-master/DEPLOY-HOSTINGER-VPS.md)

---

## النشر على Hostinger

قائمة الملفات المطلوبة وخطوات الرفع: **[UPLOAD-HOSTINGER.md](./UPLOAD-HOSTINGER.md)**

**لا ترفع:**

- `node_modules/`
- `wppconnect-master/`
- `theater.JPG` (الحجم كبير — استخدم `assets/` فقط)
- `scripts/`
- `simulate.html` (إلا للاختبار الداخلي)

بعد الرفع: **Ctrl+F5** واختبر الحجز → واتساب → المنظّم → الكشك.

---

## الإعدادات العامة

عدّل `threa-config.js`:

| المفتاح | الوظيفة |
|---------|---------|
| `whatsappApiBase` | عنوان API واتساب |
| `siteBaseUrl` | رابط الموقع في رسالة الدعوة |
| `schoolName` | اسم المدرسة |
| `graduationBatch` | الدفعة |
| `eventDate` / `eventTime` | موعد الحفل |
| `checkInStartTime` | بداية تسجيل الدخول |
| `qrCenterIcon` | شعار داخل QR (`./assets/icon2.jpeg`) |
| `ceremonyGuestSeatQuota` | حدّ ضيوف افتراضي |
| `organizerPollMs` | فترة التحديث الاحتياطية للمنظّم (ms) |

---

## تخطيط المقاعد

- **217 مقعداً** في النظام: يسار/يمين (صفوف 1–12) + **3 مقاعد قاعدة وسط** (`BRIDGE`).
- **خريجون:** يسار، صفوف 2–9 (افتراضي).
- **مرافقون:** يمين، صفوف 2–9.
- **ضيوف:** صف 1 من مقعد 4 + صفوف 10–12 + القاعدة.

التفاصيل: [SEATING-LAYOUT.md](./SEATING-LAYOUT.md)

معرّف المقعد مثال: `LEFT-R02-S01` (يسار، صف 2، مقعد 1).

---

## واتساب (WPPConnect)

بعد الحجز الناجح يُرسل للخريج/الضيف رسالة تحتوي:

- تفاصيل الحفل والمقعد
- رمز QR (مع الشعار في المنتصف)
- رابط `seat.html` لعرض الموقع

الخادم منفصل عن موقع Hostinger ويُعرّف في `threa-config.js`.

---

## التشغيل المحلي

1. ضع المجلد على خادم محلي ثابت (مطلوب `http://` — لا تفتح الملفات بـ `file://` لأن Supabase module لن يعمل):

```powershell
cd f:\new\threa
npx --yes serve -l 8080
```

2. افتح: `http://localhost:8080/index.html`
3. تأكد أن Supabase و WPPConnect يمكن الوصول إليهما من الشبكة.

---

## ملفات توثيق إضافية

| الملف | المحتوى |
|-------|---------|
| [SUPABASE-SETUP.md](./SUPABASE-SETUP.md) | جداول Supabase وترحيل البيانات |
| [SEATING-LAYOUT.md](./SEATING-LAYOUT.md) | خريطة المقاعد والسياسات |
| [UPLOAD-HOSTINGER.md](./UPLOAD-HOSTINGER.md) | قائمة رفع الملفات للاستضافة |
| [SIMULATE.md](./SIMULATE.md) | صفحة المحاكاة |
| [HOSTINGER-WEBSITE-AND-SUBDOMAIN.md](./HOSTINGER-WEBSITE-AND-SUBDOMAIN.md) | دومين فرعي + VPS واتساب |

---

## الأمان

- مفتاح Supabase **anon** موجود في `supabase-config.js` (طبيعي لتطبيقات الويب).
- الحماية تعتمد على **RLS** في `schema.sql` — راجع السياسات قبل الإنتاج العام.
- **لا تضع** مفتاح `service_role` في أي ملف يُرفع للمتصفح.
- صفحات `calibrate.html` و `organizer.html` و `simulate.html` للإدارة — يُفضّل حمايتها (كلمة مرور، IP، أو عدم نشر الرابط).

---

## ترخيص وملكية

مشروع خاص لحفل تخرج ثانوية نخبة الشمال الأهلية.  
للاستفسار التقني: راجع بيانات المطور في `threa-config.js` → `THREA_INVITE.kioskDeveloperCredit()`.

---

*آخر تحديث للتوثيق: يعكس إعداد Supabase، معايرة البانوراما، المسار التفاعلي، وشاشة الكشك.*
