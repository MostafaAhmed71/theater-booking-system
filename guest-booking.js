/**
 * حجز ضيوف المراسم — صفحة منفصلة، بدون هوية، مع حدّ مقاعد من Firestore.
 */
(function () {
  "use strict";

  const SEATS = window.ThreaSeats ? window.ThreaSeats.SEATS : [];
  if (!SEATS.length) {
    console.error("seats-data.js مطلوب قبل guest-booking.js");
  }

  const quotaBanner = document.getElementById("guest-quota-banner");
  const registrationGate = document.getElementById("registration-gate");
  const guestForm = document.getElementById("ceremony-guest-form");
  const formError = document.getElementById("form-error");
  const guestSubmit = document.getElementById("guest-submit");
  const loadingDock = document.getElementById("loading-dock");
  const loadingLabel = document.getElementById("loading-label");
  const guestNameInput = document.getElementById("guest-full-name");
  const whatsappPhoneInput = document.getElementById("whatsapp-phone");

  const bookingConfirmModal = document.getElementById("booking-confirm-modal");
  const bookingConfirmBackdrop = document.getElementById("booking-confirm-backdrop");
  const bookingConfirmLead = document.getElementById("booking-confirm-lead");
  const bookingConfirmSeats = document.getElementById("booking-confirm-seats");
  const bookingInviteNames = document.getElementById("booking-invite-names");
  const bookingQrCanvas = document.getElementById("booking-qr-canvas");
  const bookingWaStatus = document.getElementById("booking-wa-status");
  const bookingSendWaBtn = document.getElementById("booking-send-wa");
  const bookingSeatLink = document.getElementById("booking-seat-link");

  const pendingModal = document.getElementById("guest-pending-modal");
  const pendingBackdrop = document.getElementById("guest-pending-backdrop");
  const pendingLead = document.getElementById("guest-pending-lead");
  const pendingOkBtn = document.getElementById("guest-pending-ok");

  function isApprovalRequired() {
    const cfg = globalThis.THREA_APP_CONFIG;
    return !cfg || cfg.ceremonyGuestApprovalRequired !== false;
  }

  /** @type {{ nationalId: string, studentName: string, whatsappPhone: string, checkInToken?: string } | null} */
  let guestProfile = null;
  /** @type {import('./seats-data.js').Seat[] | object[]} */
  let assignedSeats = [];
  let submitInFlight = false;
  let quotaAllowsBooking = false;

  function setFormError(message) {
    if (!formError) return;
    if (!message) {
      formError.textContent = "";
      formError.hidden = true;
      return;
    }
    formError.textContent = message;
    formError.hidden = false;
  }

  function setLoading(visible, text) {
    if (text && loadingLabel) loadingLabel.textContent = text;
    if (loadingDock) loadingDock.hidden = !visible;
  }

  function pickRandomFrom(list) {
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function pickAdjacentSeatsFromPool(pool, count) {
    if (count < 1 || pool.length < count) return null;
    if (count === 1) {
      const s = pickRandomFrom(pool);
      return s ? [s] : null;
    }
    const byRow = new Map();
    for (const s of pool) {
      const k = `${s.section}|${s.row}`;
      if (!byRow.has(k)) byRow.set(k, []);
      byRow.get(k).push(s);
    }
    for (const arr of byRow.values()) {
      arr.sort((a, b) => a.seatInRow - b.seatInRow);
    }
    const windows = [];
    for (const arr of byRow.values()) {
      if (arr.length < count) continue;
      for (let i = 0; i <= arr.length - count; i++) {
        const base = arr[i].seatInRow;
        let ok = true;
        for (let j = 1; j < count; j++) {
          if (arr[i + j].seatInRow !== base + j) {
            ok = false;
            break;
          }
        }
        if (ok) windows.push(arr.slice(i, i + count));
      }
    }
    if (windows.length) return pickRandomFrom(windows);
    return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
  }

  function getSelectedDialCode() {
    const dc = window.ThreaDialCodes;
    return dc && dc.DEFAULT_DIAL ? dc.DEFAULT_DIAL : "966";
  }

  function normalizeWhatsAppPhone(localRaw) {
    const dial = getSelectedDialCode();
    const dc = window.ThreaDialCodes;
    if (dc && typeof dc.formatE164 === "function") {
      return dc.formatE164(dial, localRaw);
    }
    let p = String(localRaw || "").replace(/\D/g, "");
    while (p.startsWith("0")) p = p.slice(1);
    const d = String(dial).replace(/\D/g, "");
    if (d && p.startsWith(d)) return p;
    return d + p;
  }

  function normalizeGuestKey(id) {
    const roster = window.ThreaStudentRoster;
    if (roster && typeof roster.normalizeGuestKey === "function") {
      return roster.normalizeGuestKey(id);
    }
    const raw = String(id || "").trim();
    if (/^GUEST-/i.test(raw)) return raw.toUpperCase().slice(0, 32);
    return raw.replace(/\D/g, "").slice(0, 32);
  }

  function generateGuestRef() {
    const roster = window.ThreaStudentRoster;
    if (roster && typeof roster.generateGuestRef === "function") {
      return roster.generateGuestRef();
    }
    return `GUEST-${Date.now().toString(36).toUpperCase().slice(-8)}`;
  }

  function getSiteBaseUrl() {
    const cfg = globalThis.THREA_APP_CONFIG;
    if (cfg && cfg.siteBaseUrl) {
      return String(cfg.siteBaseUrl).replace(/\/$/, "");
    }
    return globalThis.location.origin.replace(/\/$/, "");
  }

  function buildGuestSeatViewUrl(profile, checkInToken) {
    const base = getSiteBaseUrl();
    const t = encodeURIComponent(checkInToken || "");
    const code = profile && profile.inviteCode ? profile.inviteCode : "";
    if (code) {
      return `${base}/seat.html?code=${encodeURIComponent(code)}&t=${t}`;
    }
    const nid = encodeURIComponent(normalizeGuestKey(profile.nationalId));
    return `${base}/seat.html?nid=${nid}&t=${t}`;
  }

  function buildCheckInQrPayload() {
    if (!guestProfile || !guestProfile.checkInToken) return "";
    const pub =
      guestProfile.inviteCode ||
      (window.ThreaInviteCodes && window.ThreaInviteCodes.normalizeInviteCode
        ? window.ThreaInviteCodes.normalizeInviteCode(guestProfile.nationalId)
        : "") ||
      normalizeGuestKey(guestProfile.nationalId);
    return `THREA1|${pub}|${guestProfile.checkInToken}`;
  }

  function getWhatsAppApiBase() {
    return (
      (globalThis.THREA_APP_CONFIG && globalThis.THREA_APP_CONFIG.whatsappApiBase) ||
      "https://wpp.northelite0.com"
    ).replace(/\/$/, "");
  }

  async function fetchWhatsAppStatus() {
    const base = getWhatsAppApiBase();
    const res = await fetch(`${base}/status`, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, connected: !!data.connected, status: data.status };
  }

  function getSiteBaseUrl() {
    const cfg = globalThis.THREA_APP_CONFIG;
    if (cfg && cfg.siteBaseUrl) {
      return String(cfg.siteBaseUrl).replace(/\/$/, "");
    }
    return globalThis.location.origin.replace(/\/$/, "");
  }

  function getGuestRequestsAdminUrl() {
    return `${getSiteBaseUrl()}/guest-requests-admin.html`;
  }

  /**
   * إشعار الإدارة بطلب ضيف جديد (لا يوقف تجربة الضيف عند الفشل).
   * @param {{ guestName?: string }} req
   */
  async function notifyAdminNewGuestRequest(req) {
    const cfg = globalThis.THREA_APP_CONFIG || {};
    const localPhone = cfg.guestRequestsAdminNotifyPhone || "0505807405";
    const phone = normalizeWhatsAppPhone(localPhone);
    if (!phone || phone.length < 10) return;

    const adminUrl = getGuestRequestsAdminUrl();
    const pendingCount =
      window.ThreaGuestRequestStore &&
      typeof window.ThreaGuestRequestStore.countPending === "function"
        ? window.ThreaGuestRequestStore.countPending()
        : null;

    const lines = [
      "🔔 *طلب ضيف جديد*",
      "",
      "يوجد طلب جديد يحتاج معالجة.",
    ];
    if (req && req.guestName) {
      lines.push("", `الاسم: *${req.guestName}*`);
    }
    if (pendingCount !== null) {
      lines.push(`طلبات قيد المراجعة: ${pendingCount}`);
    }
    lines.push("", "افتح شاشة الطلبات:", adminUrl);

    try {
      const st = await fetchWhatsAppStatus();
      if (!st.connected) {
        console.warn("notifyAdminNewGuestRequest: واتساب غير متصل");
        return;
      }
      const res = await fetch(`${getWhatsAppApiBase()}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: lines.join("\n") }),
      });
      if (!res.ok) {
        const raw = await res.text();
        console.warn("notifyAdminNewGuestRequest:", raw);
      }
    } catch (e) {
      console.warn("notifyAdminNewGuestRequest", e);
    }
  }

  function formatSeatShort(seat) {
    if (window.ThreaSeats && typeof window.ThreaSeats.formatSeatShort === "function") {
      return window.ThreaSeats.formatSeatShort(seat);
    }
    if (!seat) return "";
    const side = seat.section === "RIGHT" ? "يمين" : "يسار";
    return `${side} صف ${seat.row} مقعد ${seat.seatInRow}`;
  }

  function validateForm(name, whatsappLocal) {
    if (!name || name.length < 3) {
      return "أدخل الاسم الكامل (3 أحرف على الأقل).";
    }
    const phone = normalizeWhatsAppPhone(whatsappLocal);
    const dc = window.ThreaDialCodes;
    if (!phone || (dc && !dc.isValidE164(phone)) || phone.length < 10) {
      return "أدخل رقم جوال واتساب صالحاً مع اختيار رمز الدولة الصحيح.";
    }
    return null;
  }

  async function getCeremonySeatStats() {
    const quotaApi = window.ThreaGuestQuota;
    const ga = window.ThreaGuestAssignments;
    if (!quotaApi || !ga) return null;
    await quotaApi.ready;
    await ga.ready;
    const used = ga.countCeremonyGuestSeats();
    const occupied = ga.getOccupiedSeatIds();
    return quotaApi.getCeremonyAvailability(occupied, used);
  }

  function showQuotaBanner(text, variant) {
    if (!quotaBanner) return;
    quotaBanner.hidden = false;
    quotaBanner.textContent = text;
    quotaBanner.classList.remove("is-full", "is-low");
    if (variant) quotaBanner.classList.add(variant);
  }

  function hideQuotaBanner() {
    if (!quotaBanner) return;
    quotaBanner.hidden = true;
    quotaBanner.textContent = "";
    quotaBanner.classList.remove("is-full", "is-low");
  }

  async function refreshQuotaBanner() {
    const quotaApi = window.ThreaGuestQuota;
    if (!quotaBanner || !quotaApi) return;

    const stat = await getCeremonySeatStats();
    if (!stat) {
      showQuotaBanner("تعذّر تحميل إعدادات الحجز.", "is-full");
      if (guestSubmit) guestSubmit.disabled = true;
      return;
    }

    quotaAllowsBooking = stat.allowed;

    if (!stat.poolConfigured) {
      showQuotaBanner(
        "لم يُحدَّد مقاعد الضيوف بعد — راجع المشرف (صفحة المعايرة).",
        "is-full"
      );
      if (guestSubmit) guestSubmit.disabled = true;
      return;
    }
    if (stat.quota <= 0) {
      showQuotaBanner(
        "حجز الضيوف مغلق — راجع المشرف في صفحة المعايرة.",
        "is-full"
      );
      if (guestSubmit) guestSubmit.disabled = true;
      return;
    }
    if (stat.remaining <= 0 || stat.used >= stat.cap) {
      showQuotaBanner(
        `اكتملت مقاعد الضيوف (${stat.used} من ${stat.cap} مقعد) — لا يمكن الحجز.`,
        "is-full"
      );
      if (guestSubmit) guestSubmit.disabled = true;
      return;
    }

    hideQuotaBanner();
    if (guestSubmit && !submitInFlight) guestSubmit.disabled = false;
  }

  async function assertQuotaForSeats(neededSeats) {
    const stat = await getCeremonySeatStats();
    if (!stat) {
      return { ok: false, message: "تعذّر تحميل إعدادات المقاعد." };
    }
    if (!stat.poolConfigured) {
      return {
        ok: false,
        message: "لم يُحدَّد مقاعد الضيوف. راجع المشرف في صفحة المعايرة.",
      };
    }
    const need = Math.max(1, Math.floor(neededSeats));
    const pending =
      window.ThreaGuestRequestStore &&
      typeof window.ThreaGuestRequestStore.countPending === "function"
        ? window.ThreaGuestRequestStore.countPending()
        : 0;
    const effectiveRemaining = Math.max(0, stat.remaining - pending);
    if (isApprovalRequired() && effectiveRemaining < need) {
      return {
        ok: false,
        message:
          pending > 0
            ? `لا يتبقى مقاعد كافية — ${pending} طلباً قيد المراجعة.`
            : `لا يتبقى سوى ${Math.max(0, stat.remaining)} مقعد للضيوف.`,
      };
    }
    if (!stat.allowed || stat.remaining < need || stat.used >= stat.cap) {
      if (stat.remaining <= 0 || stat.used >= stat.cap) {
        return {
          ok: false,
          message: `اكتملت مقاعد الضيوف (${stat.cap} مقعد) — لا يمكن الحجز.`,
        };
      }
      if (stat.freeInPool < need) {
        return {
          ok: false,
          message: "اكتملت المقاعد المخصّصة للضيوف — لا يوجد مقعد شاغر معاير.",
        };
      }
      return {
        ok: false,
        message: `لا يتبقى سوى ${Math.max(0, stat.remaining)} مقعد للضيوف.`,
      };
    }
    return { ok: true };
  }

  function filterCalibratedGuestPool(pool) {
    const store = window.ThreaPanoramaStorage;
    if (!store || typeof store.filterCalibratedSeats !== "function") return [];
    return store.filterCalibratedSeats(pool);
  }

  async function assignGuestSeat() {
    const quotaApi = window.ThreaGuestQuota;
    if (!quotaApi) return false;
    await quotaApi.ready;
    if (window.ThreaPanoramaStorage && window.ThreaPanoramaStorage.ready) {
      await window.ThreaPanoramaStorage.ready;
    }
    const rawPool =
      typeof quotaApi.getGuestSeatPool === "function"
        ? quotaApi.getGuestSeatPool(SEATS)
        : [];
    const pool = filterCalibratedGuestPool(rawPool);
    if (!pool.length) return false;

    const pickSeat =
      window.ThreaSeatPicker && typeof window.ThreaSeatPicker.pickSeatsInFillOrder === "function"
        ? window.ThreaSeatPicker.pickSeatsInFillOrder.bind(window.ThreaSeatPicker)
        : pickAdjacentSeatsFromPool;

    const pickSeatIdsFn = (occupied) => {
      const available = pool.filter((s) => !occupied.has(s.id));
      const picked = pickSeat(available, 1);
      return picked ? [picked[0].id] : null;
    };

    const ga = window.ThreaGuestAssignments;
    if (!ga || !guestProfile) return false;

    const result = await ga.assignOrRestore(
      {
        nationalId: guestProfile.nationalId,
        studentName: guestProfile.studentName,
        companionName: "",
        whatsappPhone: guestProfile.whatsappPhone,
        hasCompanion: false,
      },
      pickSeatIdsFn
    );

    if (result.alreadyBooked) {
      throw new Error("رقم الدعوة مسجّل مسبقاً — لا يمكن الحجز مرة أخرى.");
    }
    if (!result.seatIds || result.seatIds.length < 1) {
      return false;
    }

    assignedSeats = result.seatIds
      .map((id) => SEATS.find((s) => s.id === id))
      .filter(Boolean);
    if (!assignedSeats.length) return false;
    if (result.checkInToken) guestProfile.checkInToken = result.checkInToken;
    if (result.inviteCode) guestProfile.inviteCode = result.inviteCode;
    return true;
  }

  function ensureQrCodeLib() {
    return typeof QRCode !== "undefined" && typeof QRCode.toCanvas === "function";
  }

  function getQrCenterIconSrc() {
    const cfg = globalThis.THREA_APP_CONFIG;
    return (cfg && cfg.qrCenterIcon) || "./assets/icon2.jpeg";
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
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("QR icon load failed"));
      im.src = getQrCenterIconSrc();
    });
  }

  function drawQrCenterIcon(ctx, canvasSize) {
    return loadQrCenterIcon().then((icon) => {
      const logoSize = Math.round(canvasSize * 0.2);
      const pad = Math.max(4, Math.round(logoSize * 0.1));
      const box = logoSize + pad * 2;
      const bx = Math.round((canvasSize - box) / 2);
      const by = Math.round((canvasSize - box) / 2);
      ctx.fillStyle = "#ffffff";
      pathRoundRect(ctx, bx, by, box, box, Math.round(box * 0.14));
      ctx.fill();
      ctx.save();
      pathRoundRect(
        ctx,
        bx + pad,
        by + pad,
        logoSize,
        logoSize,
        Math.round(logoSize * 0.12)
      );
      ctx.clip();
      ctx.drawImage(icon, bx + pad, by + pad, logoSize, logoSize);
      ctx.restore();
    });
  }

  async function renderQrWithCenterIcon(canvas, payload) {
    if (!canvas || !payload || !ensureQrCodeLib()) return;
    await QRCode.toCanvas(canvas, payload, {
      margin: 2,
      width: 200,
      errorCorrectionLevel: "H",
      color: { dark: "#0a0a12", light: "#ffffff" },
    });
    const ctx = canvas.getContext("2d");
    if (ctx) await drawQrCenterIcon(ctx, canvas.width);
  }

  function buildWhatsAppInviteCaption() {
    if (!guestProfile) return "";
    const cfg = globalThis.THREA_APP_CONFIG || {};
    const school = cfg.schoolName || "ثانوية نخبة الشمال الأهلية";
    const batch = cfg.graduationBatch || "الدفعة الخامسة";
    const principalTitle = cfg.principalTitle || "مدير المدرسة";
    const principalName = cfg.principalName || "محمد نصر الدين";
    const guestSeat = assignedSeats[0];
    const inviteCode = guestProfile.inviteCode || "";
    const lines =
      globalThis.THREA_INVITE &&
      typeof globalThis.THREA_INVITE.inviteOpeningLines === "function"
        ? globalThis.THREA_INVITE.inviteOpeningLines(cfg, guestProfile.studentName).slice()
        : [
            `*حفل تخرّج ${batch} ب${school}*`,
            "",
            "*المكرم :*",
            "",
            `*${guestProfile.studentName}*`,
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
    lines.push("📍 *موقع المقعد:*", guestSeat ? guestSeat.name : "—");
    const seatLink = buildGuestSeatViewUrl(guestProfile, guestProfile.checkInToken);
    lines.push("", "🔗 *عرض المقاعد على الخريطة:*", seatLink);
    const rsvpLink =
      globalThis.ThreaLinks && guestProfile.checkInToken
        ? globalThis.ThreaLinks.buildRsvpUrl(guestProfile)
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
      "عند *الوصول* إلى موقع الحفل اعرض رمز الاستجابة (QR) الظاهر في الصورة أعلاه — وليس عند الاستقبال الخارجي.",
      `تسجيل الدخول للنساء يبدأ من الساعة *${womenFrom}* إلى الساعة *${womenTo}*.`,
      `يبدأ تسجيل الدخول للرجال *${menFrom}*.`,
      "",
      `*${principalTitle}*`,
      `*${principalName}*`
    );
    return lines.join("\n");
  }

  async function sendBookingWhatsApp(opts) {
    const isAuto = !!(opts && opts.auto);
    if (!guestProfile || !bookingWaStatus) return;
    if (bookingSendWaBtn) bookingSendWaBtn.hidden = true;
    const phone = normalizeWhatsAppPhone(guestProfile.whatsappPhone);
    if (!phone || phone.length < 10) {
      bookingWaStatus.textContent = "رقم واتساب غير صالح.";
      if (bookingSendWaBtn) bookingSendWaBtn.hidden = false;
      return;
    }
    if (!guestProfile.checkInToken) {
      bookingWaStatus.textContent = "تعذّر إنشاء رمز الدخول.";
      if (bookingSendWaBtn) bookingSendWaBtn.hidden = false;
      return;
    }
    const caption = buildWhatsAppInviteCaption();
    bookingWaStatus.hidden = false;
    bookingWaStatus.textContent = isAuto
      ? "جاري إرسال الدعوة إلى واتساب…"
      : "جاري الإرسال…";

    if (!ensureQrCodeLib()) {
      bookingWaStatus.textContent = "تعذّر تحميل مكتبة QR.";
      if (bookingSendWaBtn) bookingSendWaBtn.hidden = false;
      return;
    }

    try {
      const st = await fetchWhatsAppStatus();
      if (!st.connected) {
        throw new Error(
          st.ok
            ? "خادم واتساب غير متصل — افتح https://wpp.northelite0.com/qr وامسح الرمز."
            : "تعذّر الوصول لخادم واتساب (تحقق من الرابط في الإعدادات)."
        );
      }

      const payload = buildCheckInQrPayload();
      if (!payload) throw new Error("رمز الدخول غير جاهز.");

      const canvas = document.createElement("canvas");
      await renderQrWithCenterIcon(canvas, payload, { width: 512 });
      const imageBase64 = canvas.toDataURL("image/png");

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
      } catch (_) {
        data = { error: rawBody ? rawBody.slice(0, 280) : "" };
      }
      if (!res.ok) {
        throw new Error(
          data.error || data.message || res.statusText || `HTTP ${res.status}`
        );
      }
      bookingWaStatus.textContent = `تم إرسال الدعوة إلى واتساب (${phone}) بنجاح.`;
      if (bookingSendWaBtn) bookingSendWaBtn.hidden = true;
      if (
        window.ThreaGuestAssignments &&
        typeof window.ThreaGuestAssignments.updateWhatsAppStatus === "function"
      ) {
        const pub = guestProfile.inviteCode || guestProfile.nationalId;
        window.ThreaGuestAssignments.updateWhatsAppStatus(pub, "sent").catch(
          () => {}
        );
      }
    } catch (e) {
      console.warn("WhatsApp send", e);
      const errMsg =
        (e && e.message) || "تعذّر الإرسال. استخدم زر إعادة الإرسال.";
      bookingWaStatus.textContent = errMsg;
      if (
        window.ThreaGuestAssignments &&
        typeof window.ThreaGuestAssignments.updateWhatsAppStatus === "function"
      ) {
        const pub = guestProfile.inviteCode || guestProfile.nationalId;
        window.ThreaGuestAssignments.updateWhatsAppStatus(
          pub,
          "failed",
          errMsg
        ).catch(() => {});
      }
      if (bookingSendWaBtn) {
        bookingSendWaBtn.hidden = false;
        bookingSendWaBtn.textContent = "إعادة إرسال الدعوة";
      }
    }
  }

  async function openBookingConfirmModal() {
    if (!bookingConfirmModal || !guestProfile) return;
    bookingConfirmModal.hidden = false;
    if (bookingConfirmLead) {
      bookingConfirmLead.textContent = `شكراً ${guestProfile.studentName}. تم حجز مقعدك. يُرسل رمز الدعوة إلى واتساب.`;
    }
    if (bookingConfirmSeats) {
      bookingConfirmSeats.innerHTML = "";
      const s = assignedSeats[0];
      if (s) {
        const row = document.createElement("div");
        row.className = "booking-seat-line";
        row.textContent = `مقعد الضيف: ${formatSeatShort(s)} — ${s.name}`;
        bookingConfirmSeats.appendChild(row);
      }
    }
    if (bookingInviteNames) {
      bookingInviteNames.textContent = guestProfile.studentName;
    }
    const hintEl = document.getElementById("booking-invite-hint");
    if (hintEl && globalThis.THREA_INVITE && typeof globalThis.THREA_INVITE.inviteQrScreenHint === "function") {
      hintEl.textContent = globalThis.THREA_INVITE.inviteQrScreenHint();
    }
    const codeEl = document.getElementById("booking-invite-code");
    if (codeEl) {
      if (guestProfile.inviteCode) {
        codeEl.hidden = false;
        codeEl.textContent = `رمز الدعوة: ${guestProfile.inviteCode}`;
      } else {
        codeEl.hidden = true;
      }
    }
    const payload = buildCheckInQrPayload();
    if (bookingQrCanvas && payload) {
      renderQrWithCenterIcon(bookingQrCanvas, payload).catch((e) =>
        console.warn("QR", e)
      );
    }
    if (bookingSeatLink && guestProfile.checkInToken) {
      bookingSeatLink.href = buildGuestSeatViewUrl(guestProfile, guestProfile.checkInToken);
    }
    if (bookingWaStatus) bookingWaStatus.textContent = "";
    sendBookingWhatsApp({ auto: true });
  }

  function initPhoneCountrySelect() {
    /* السعودية +966 فقط */
  }

  function openPendingModal() {
    if (!pendingModal) return;
    if (pendingLead) {
      pendingLead.textContent =
        "ضيفنا الكريم: لحظات وتصلك رسالة واتس اب برقم وموقع المقعد الخاص بكم.";
    }
    pendingModal.hidden = false;
  }

  function closePendingModal() {
    if (pendingModal) pendingModal.hidden = true;
  }

  async function submitGuestRequest(studentName, whatsappPhone) {
    const store = window.ThreaGuestRequestStore;
    if (!store || typeof store.submitRequest !== "function") {
      throw new Error("نظام الطلبات غير متاح — نفّذ supabase/migrate-guest-requests.sql.");
    }
    await store.ready;
    return store.submitRequest({ guestName: studentName, whatsappPhone });
  }

  function initModal() {
    if (bookingConfirmBackdrop) {
      bookingConfirmBackdrop.addEventListener("click", () => {
        if (bookingConfirmModal) bookingConfirmModal.hidden = true;
      });
    }
    if (bookingSendWaBtn) {
      bookingSendWaBtn.addEventListener("click", () => sendBookingWhatsApp());
    }
    if (pendingBackdrop) {
      pendingBackdrop.addEventListener("click", closePendingModal);
    }
    if (pendingOkBtn) {
      pendingOkBtn.addEventListener("click", closePendingModal);
    }
  }

  function initForm() {
    if (!guestForm) return;
    guestForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (submitInFlight) return;
      setFormError("");

      const studentName = guestNameInput ? guestNameInput.value.trim() : "";
      const whatsappLocal = whatsappPhoneInput ? whatsappPhoneInput.value.trim() : "";
      const err = validateForm(studentName, whatsappLocal);
      if (err) {
        setFormError(err);
        return;
      }

      const quotaCheck = await assertQuotaForSeats(1);
      if (!quotaCheck.ok) {
        setFormError(quotaCheck.message);
        await refreshQuotaBanner();
        return;
      }

      const whatsappPhone = normalizeWhatsAppPhone(whatsappLocal);

      submitInFlight = true;
      if (guestSubmit) guestSubmit.disabled = true;
      if (registrationGate) registrationGate.hidden = true;
      setLoading(true, isApprovalRequired() ? "جاري إرسال الطلب…" : "جاري الحجز…");

      try {
        if (isApprovalRequired()) {
          if (window.ThreaGuestRequestStore && window.ThreaGuestRequestStore.ready) {
            await window.ThreaGuestRequestStore.ready;
          }
          const req = await submitGuestRequest(studentName, whatsappPhone);
          notifyAdminNewGuestRequest(req).catch(() => {});
          setLoading(false);
          await refreshQuotaBanner();
          openPendingModal();
          return;
        }

        const nationalId = generateGuestRef();
        guestProfile = {
          nationalId,
          studentName,
          whatsappPhone,
        };

        if (window.ThreaGuestAssignments && window.ThreaGuestAssignments.ready) {
          await window.ThreaGuestAssignments.ready;
        }
        const ok = await assignGuestSeat();
        if (!ok) {
          const pinN =
            window.ThreaPanoramaStorage &&
            window.ThreaPanoramaStorage.getSyncStatus &&
            window.ThreaPanoramaStorage.getSyncStatus().pinCount;
          throw new Error(
            !pinN
              ? "لم تُعاير مقاعد الضيوف بعد — لا يمكن الحجز حتى تُدخل إحداثيات المقاعد في صفحة المعايرة."
              : "لا يوجد مقعد شاغر معاير في مجموعة مقاعد الضيوف. راجع المشرف في المعايرة."
          );
        }
        setLoading(false);
        await refreshQuotaBanner();
        await openBookingConfirmModal();
      } catch (e) {
        console.error(e);
        setLoading(false);
        if (registrationGate) registrationGate.hidden = false;
        setFormError((e && e.message) || "تعذّر إتمام الحجز.");
        if (guestSubmit && quotaAllowsBooking) guestSubmit.disabled = false;
      } finally {
        submitInFlight = false;
      }
    });
  }

  async function init() {
    initPhoneCountrySelect();
    initModal();
    initForm();
    setLoading(true, "جاري التحميل…");
    try {
      if (window.ThreaPanoramaStorage && window.ThreaPanoramaStorage.ready) {
        await window.ThreaPanoramaStorage.ready;
      }
      if (window.ThreaGuestRequestStore && window.ThreaGuestRequestStore.ready) {
        await window.ThreaGuestRequestStore.ready;
      }
      await refreshQuotaBanner();
    } finally {
      setLoading(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }
})();
