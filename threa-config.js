/**
 * إعدادات عامة للواجهة.
 * — محلياً: خادم واتساب على المنفذ 3001
 * — على هوستنجر: استخدم دومين فرعي بـ HTTPS لخادم WPPConnect (انظر HOSTINGER-WEBSITE-AND-SUBDOMAIN.md)
 */
(function (global) {
  "use strict";
  global.THREA_APP_CONFIG = {
    /** إنتاج: خادم WPP على VPS */
    whatsappApiBase: "https://wpp.northelite0.com",
    /** رابط صفحة عرض المقعد في رسالة واتساب */
    siteBaseUrl: "https://hajz.northelite0.com",
    schoolName: "ثانوية نخبة الشمال الأهلية",
    graduationBatch: "الدفعة الخامسة",
    eventDay: "الخميس",
    eventDate: "11/6/2026",
    eventTime: "7:30 م",
    /** أوقات تسجيل الدخول (رسالة واتساب وشاشة QR) */
    checkInWomenFrom: "6:45 م",
    checkInWomenTo: "7:00 م",
    checkInMenFrom: "7:15 م",
    /** @deprecated استخدم checkInWomenFrom / checkInMenFrom */
    checkInStartTime: "7:15 م",
    principalTitle: "مدير المدرسة",
    principalName: "محمد نصر الدين",
    /** شعار داخل منتصف رمز QR (مع تصحيح أخطاء عالٍ H) */
    qrCenterIcon: "./assets/icon2.jpeg",
    /** حدّ مقاعد الخريجين + المرافقين (مقعد واحد لكل حجز) — لا يُتجاوز */
    studentCompanionSeatCap: 142,
    /** حدّ مقاعد ضيوف المراسم — لا يُتجاوز */
    ceremonyGuestSeatQuota: 70,
    /** حجز الضيوف يتطلب موافقة يدوية قبل إرسال واتساب */
    ceremonyGuestApprovalRequired: true,
    /** إشعار واتساب للإدارة عند طلب ضيف جديد (محلي أو 966…) */
    guestRequestsAdminNotifyPhone: "0505807405",
    /** تحديث شاشة المنظّم (ms) — لا تقلّ عن 60000 لتجنب تجاوز حصة Firestore */
    organizerPollMs: 90000,
  };

  /**
   * بداية رسالة واتساب: عنوان الحفل + المكرم + الاسم.
   * @param {typeof global.THREA_APP_CONFIG} [cfg]
   * @param {string} [recipientName]
   */
  function inviteOpeningLines(cfg, recipientName) {
    const c = cfg || global.THREA_APP_CONFIG || {};
    const school = c.schoolName || "ثانوية نخبة الشمال الأهلية";
    const batch = c.graduationBatch || "الدفعة الخامسة";
    const name = String(recipientName || "").trim();
    const lines = [`*حفل تخرّج ${batch} ب${school}*`, "", "*المكرم :*"];
    if (name) {
      lines.push("", `*${name}*`, "");
    } else {
      lines.push("");
    }
    return lines;
  }

  /** نص ثابت بعد رمز الدعوة — يُنسخ مباشرة في رسالة واتساب */
  const INVITE_IPHONE_HINT_LINES = [
    "📱 *هام لمستخدمي أجهزة الآيفون:*",
    "لضمان ظهور الروابط بشكل صحيح نأمل إضافة الرقم المرسل إلى سجل الهاتف لديك.",
  ];

  /** @param {typeof global.THREA_APP_CONFIG} [cfg] */
  function inviteIphoneLinksHintLines() {
    return INVITE_IPHONE_HINT_LINES.slice();
  }

  /** @param {typeof global.THREA_APP_CONFIG} [cfg] */
  function inviteCheckInFootnoteLines(cfg) {
    const c = cfg || global.THREA_APP_CONFIG || {};
    const womenFrom = c.checkInWomenFrom || "6:45 م";
    const womenTo = c.checkInWomenTo || "7:00 م";
    const menFrom = c.checkInMenFrom || c.checkInStartTime || "7:15 م";
    return [
      "⚠️ *ملاحظة هامة:*",
      "عند *الوصول* إلى موقع الحفل اعرض رمز الاستجابة (QR) الظاهر في الصورة أعلاه .",
      `تسجيل الدخول للنساء يبدأ من الساعة *${womenFrom}* إلى الساعة *${womenTo}*.`,
      `يبدأ تسجيل الدخول للرجال *${menFrom}*.`,
    ];
  }

  /** @param {typeof global.THREA_APP_CONFIG} [cfg] */
  function inviteQrFootnoteLines(cfg) {
    return inviteCheckInFootnoteLines(cfg);
  }

  /** @param {typeof global.THREA_APP_CONFIG} [cfg] */
  function inviteQrScreenHint(cfg) {
    const c = cfg || global.THREA_APP_CONFIG || {};
    const womenFrom = c.checkInWomenFrom || "6:45 م";
    const womenTo = c.checkInWomenTo || "7:00 م";
    const menFrom = c.checkInMenFrom || c.checkInStartTime || "7:15 م";
    return (
      `ملاحظة هامة: اعرض الرمز عند الوصول إلى الحفل. ` +
      `تسجيل الدخول للنساء من ${womenFrom} إلى ${womenTo}. ` +
      `تسجيل الدخول للرجال من ${menFrom}.`
    );
  }

  /** بيانات المطور — تظهر أسفل شاشة المسرح */
  function kioskDeveloperCredit() {
    return {
      title: "معلومات مطور نظام الحجز المتكامل",
      name: "مصطفي احمد",
      phone: "0543641209",
    };
  }

  global.THREA_INVITE = {
    inviteOpeningLines,
    INVITE_IPHONE_HINT_LINES,
    inviteIphoneLinksHintLines,
    inviteCheckInFootnoteLines,
    inviteQrFootnoteLines,
    inviteQrScreenHint,
    kioskDeveloperCredit,
  };
})(typeof window !== "undefined" ? window : globalThis);