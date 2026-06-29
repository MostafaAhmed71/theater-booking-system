# استضافة مشروع «ثريا» على هوستنجر (بدون Netlify)

يمكنك تشغيل **الموقع الثابت** و**خادم الواتساب** على نطاقات هوستنجر (أو دومينات فرعية). Firebase يبقى كما هو من المتصفح — لا يشترط Netlify.

---

## خياران شائعان

### أ) موقع على استضافة مشتركة + API على VPS (دومين فرعي لكل منهما)

| العنصر | مثال | أين |
|--------|------|-----|
| صفحات HTML/JS/CSS | `https://hajz.موقعك.com` | **Web Hosting** في hPanel (مجلد فرعي للدومين الفرعي) |
| WPPConnect | `https://api-hajz.موقعك.com` | **VPS** خلف Nginx + HTTPS |

1. في **hPanel** أنشئ **Subdomain** مثل `hajz` وأرفع محتويات مجلد المشروع (`index.html`، `main.js`، `style.css`، `firebase-init.js`، … كل الملفات المطلوبة **ما عدا** `node_modules` و`wppconnect-master`).
2. تأكد أن الصور والملفات العامة موجودة (مثل `theater.JPG` إن استخدمتها).
3. على الـ **VPS** اتبع `wppconnect-master/DEPLOY-HOSTINGER-VPS.md` واضبط نطاق API مثل `api-hajz.موقعك.com`.
4. في المشروع عدّل `threa-config.js` كما في الأسفل.

### ب) كل شيء على VPS واحد (أبسط للصيانة)

- **موقع ثابت:** Nginx يخدم مجلداً مثل `/var/www/hajz` (ملفات المشروع فقط).
- **واتساب:** `proxy_pass` إلى `127.0.0.1:3001` على دومين فرعي آخر مثل `wpp.موقعك.com`.

بهذا لا تحتاج رفع منفصل على استضافة مشتركة.

**مثال Nginx — موقع الحجز:**

```nginx
server {
    listen 443 ssl http2;
    server_name hajz.موقعك.com;

    root /var/www/hajz;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # بعد تشغيل: certbot certonly --nginx -d hajz.موقعك.com
    ssl_certificate     /etc/letsencrypt/live/hajz.موقعك.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hajz.موقعك.com/privkey.pem;
}
```

*(المسارات أعلاه تتطابق مع certbot بعد إصدار الشهادة لنفس `server_name`.)*

**مثال Nginx — API الواتساب** (كما في دليل الـ VPS):

```nginx
server {
    listen 443 ssl http2;
    server_name wpp.موقعك.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20M;
    }

    ssl_certificate     /etc/letsencrypt/live/wpp.موقعك.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wpp.موقعك.com/privkey.pem;
}
```

---

## ملف `threa-config.js` بعد النشر

استخدم **HTTPS** لعنوان API (نفس سياسة المتصفح إن كان الموقع على HTTPS):

```javascript
global.THREA_APP_CONFIG = {
  whatsappApiBase: "https://wpp.موقعك.com",
};
```

لا تستخدم `localhost` هنا لأن الزوار يفتحون الموقع من أجهزتهم.

---

## روابط داخل المشروع

- صفحة الحجوزات: غالباً `https://hajz.موقعك.com/index.html` أو `/` حسب إعداد المجلد.
- المعايرة: `https://hajz.موقعك.com/calibrate.html`
- منظّمو الاستقبال: `https://hajz.موقعك.com/organizer.html`

---

## Firebase

المفاتيح في `firebase-config.js` عامة للويب — يعمل النطاق الجديد طالما **قواعد Firestore** منشورة ومكتبة Firebase مسموحة من لوحة المشروع (Authorized domains). أضف الدومين الفرعي في Firebase Console → Authentication → Settings → Authorized domains إذا طُلب ذلك.

---

## ملخص

- **Netlify غير مطلوب:** ارفع الموقع على دومين فرعي في هوستنجر (مشترك أو على نفس الـ VPS).
- **واتساب:** يبقى على Node (VPS) مع دومين فرعي وHTTPS.
- **`threa-config.js`:** يشير إلى `https://دومين-الـ-API`.

لتفاصيل تثبيت الخادم انظر: `wppconnect-master/DEPLOY-HOSTINGER-VPS.md`.
