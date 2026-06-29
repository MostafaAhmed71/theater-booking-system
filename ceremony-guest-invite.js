/**
 * إرسال دعوة واتساب لضيف المراسم (QR + نص).
 */
(function (global) {
  "use strict";

  function getSiteBaseUrl() {
    const cfg = global.THREA_APP_CONFIG;
    if (cfg && cfg.siteBaseUrl) {
      return String(cfg.siteBaseUrl).replace(/\/$/, "");
    }
    return global.location
      ? global.location.origin.replace(/\/$/, "")
      : "https://hajz.northelite0.com";
  }

  function getWhatsAppApiBase() {
    return (
      (global.THREA_APP_CONFIG && global.THREA_APP_CONFIG.whatsappApiBase) ||
      "https://wpp.northelite0.com"
    ).replace(/\/$/, "");
  }

  function buildSeatViewUrl(profile) {
    const base = getSiteBaseUrl();
    const t = encodeURIComponent(profile.checkInToken || "");
    const code = profile.inviteCode || "";
    if (code) {
      return `${base}/seat.html?code=${encodeURIComponent(code)}&t=${t}`;
    }
    const nid = encodeURIComponent(profile.guestRef || profile.nationalId || "");
    return `${base}/seat.html?nid=${nid}&t=${t}`;
  }

  function buildQrPayload(profile) {
    const pub =
      profile.inviteCode ||
      (global.ThreaInviteCodes && global.ThreaInviteCodes.normalizeInviteCode
        ? global.ThreaInviteCodes.normalizeInviteCode(profile.guestRef)
        : "") ||
      profile.guestRef ||
      "";
    return `THREA1|${pub}|${profile.checkInToken}`;
  }

  function buildCaption(profile, seat) {
    const cfg = global.THREA_APP_CONFIG || {};
    const school = cfg.schoolName || "ثانوية نخبة الشمال الأهلية";
    const batch = cfg.graduationBatch || "الدفعة الخامسة";
    const principalTitle = cfg.principalTitle || "مدير المدرسة";
    const principalName = cfg.principalName || "محمد نصر الدين";
    const inviteCode = profile.inviteCode || "";
    const recipientName = profile.guestName || profile.studentName || "";
    const lines =
      global.THREA_INVITE && typeof global.THREA_INVITE.inviteOpeningLines === "function"
        ? global.THREA_INVITE.inviteOpeningLines(cfg, recipientName).slice()
        : [
            `*حفل تخرّج ${batch} ب${school}*`,
            "",
            "*المكرم :*",
            "",
            recipientName ? `*${recipientName}*` : "",
            "",
          ];
    if (inviteCode) {
      lines.push(`🔑 *رمز الدعوة:* ${inviteCode}`, "(4 أرقام)", "");
    }
    lines.push(
      "",
      "📱 *هام لمستخدمي أجهزة الآيفون:*",
      "لضمان ظهور الروابط بشكل صحيح نأمل إضافة الرقم المرسل إلى سجل الهاتف لديك.",
      ""
    );
    lines.push("📍 *موقع المقعد:*", seat && seat.name ? seat.name : "—");
    const seatLink = buildSeatViewUrl(profile);
    lines.push("", "🔗 *عرض المقاعد على الخريطة:*", seatLink);
    const rsvpLink =
      global.ThreaLinks && profile.checkInToken
        ? global.ThreaLinks.buildRsvpUrl({
            inviteCode: profile.inviteCode,
            nationalId: profile.guestRef,
            checkInToken: profile.checkInToken,
          })
        : "";
    if (rsvpLink) {
      lines.push("", "✅ *تأكيد الحضور أو الاعتذار:*", rsvpLink);
    }
    const womenFrom = cfg.checkInWomenFrom || "6:45 م";
    const womenTo = cfg.checkInWomenTo || "7:00 م";
    const menFrom = cfg.checkInMenFrom || "7:15 م";
    lines.push(
      "",
      "⚠️ *ملاحظة هامة:*",
      "عند *الوصول* إلى موقع الحفل اعرض رمز الاستجابة (QR) الظاهر في الصورة أعلاه .",
      `تسجيل الدخول للنساء يبدأ من الساعة *${womenFrom}* إلى الساعة *${womenTo}*.`,
      `يبدأ تسجيل الدخول للرجال *${menFrom}*.`,
      "",
      `*${principalTitle}*`,
      `*${principalName}*`
    );
    return lines.join("\n");
  }

  function buildRejectionMessage(guestName, reason) {
    const cfg = global.THREA_APP_CONFIG || {};
    const school = cfg.schoolName || "ثانوية نخبة الشمال الأهلية";
    const lines = [
      `مرحباً *${guestName}*،`,
      "",
      `نعتذر — لم يتم قبول طلب حجز مقعد ضيف في حفل تخرّج ${school}.`,
    ];
    if (reason) lines.push("", reason);
    lines.push("", "للاستفسار تواصل مع إدارة المدرسة.");
    return lines.join("\n");
  }

  async function fetchWhatsAppStatus() {
    const base = getWhatsAppApiBase();
    const res = await fetch(`${base}/status`, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, connected: !!data.connected };
  }

  function pathRoundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function loadQrCenterIcon() {
    const cfg = global.THREA_APP_CONFIG;
    const src = (cfg && cfg.qrCenterIcon) || "./assets/icon2.jpeg";
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("QR icon load failed"));
      im.src = src;
    });
  }

  async function renderQrCanvas(payload) {
    if (typeof QRCode === "undefined" || typeof QRCode.toCanvas !== "function") {
      throw new Error("مكتبة QR غير محمّلة.");
    }
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, payload, {
      margin: 2,
      width: 512,
      errorCorrectionLevel: "H",
      color: { dark: "#0a0a12", light: "#ffffff" },
    });
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const icon = await loadQrCenterIcon();
      const logoSize = Math.round(canvas.width * 0.2);
      const pad = Math.max(4, Math.round(logoSize * 0.1));
      const box = logoSize + pad * 2;
      const bx = Math.round((canvas.width - box) / 2);
      const by = Math.round((canvas.height - box) / 2);
      ctx.fillStyle = "#ffffff";
      pathRoundRect(ctx, bx, by, box, box, Math.round(box * 0.14));
      ctx.fill();
      ctx.save();
      pathRoundRect(ctx, bx + pad, by + pad, logoSize, logoSize, Math.round(logoSize * 0.12));
      ctx.clip();
      ctx.drawImage(icon, bx + pad, by + pad, logoSize, logoSize);
      ctx.restore();
    }
    return canvas;
  }

  /**
   * @param {{ phone: string, profile: object, seat: object }} opts
   */
  async function sendInvite(opts) {
    const phone = String(opts.phone || "").replace(/\D/g, "");
    if (!phone || phone.length < 10) throw new Error("رقم واتساب غير صالح.");
    if (!opts.profile || !opts.profile.checkInToken) {
      throw new Error("رمز الدخول غير جاهز.");
    }
    const st = await fetchWhatsAppStatus();
    if (!st.connected) {
      throw new Error(
        "خادم واتساب غير متصل — افتح لوحة QR على خادم WPPConnect."
      );
    }
    const payload = buildQrPayload(opts.profile);
    const canvas = await renderQrCanvas(payload);
    const imageBase64 = canvas.toDataURL("image/png");
    const caption = buildCaption(opts.profile, opts.seat);
    const base = getWhatsAppApiBase();
    const res = await fetch(`${base}/send-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, imageBase64, caption }),
    });
    const rawBody = await res.text();
    let data = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { error: rawBody ? rawBody.slice(0, 280) : "" };
    }
    if (!res.ok) {
      throw new Error(data.error || data.message || res.statusText || `HTTP ${res.status}`);
    }
    return { ok: true };
  }

  /**
   * @param {{ phone: string, guestName: string, reason?: string }} opts
   */
  async function sendRejection(opts) {
    const phone = String(opts.phone || "").replace(/\D/g, "");
    if (!phone || phone.length < 10) throw new Error("رقم واتساب غير صالح.");
    const st = await fetchWhatsAppStatus();
    if (!st.connected) throw new Error("خادم واتساب غير متصل.");
    const message = buildRejectionMessage(opts.guestName, opts.reason || "");
    const base = getWhatsAppApiBase();
    const res = await fetch(`${base}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message }),
    });
    const rawBody = await res.text();
    let data = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { error: rawBody ? rawBody.slice(0, 280) : "" };
    }
    if (!res.ok) {
      const hint =
        res.status === 404
          ? "المسار /send-message غير موجود على خادم الواتساب — حدّث whatsapp-server.js وأعد تشغيل الخادم."
          : "";
      throw new Error(
        data.error || data.message || res.statusText || hint || `HTTP ${res.status}`
      );
    }
    return { ok: true };
  }

  global.ThreaCeremonyGuestInvite = {
    buildCaption,
    buildSeatViewUrl,
    buildQrPayload,
    sendInvite,
    sendRejection,
    fetchWhatsAppStatus,
    renderQrCanvas,
  };
})(typeof window !== "undefined" ? window : globalThis);
