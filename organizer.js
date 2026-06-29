(function () {
  "use strict";

  const scanModal = document.getElementById("org-scan-modal");
  const scanBackdrop = document.getElementById("org-scan-backdrop");
  const msgEl = document.getElementById("org-msg");
  const detailsEl = document.getElementById("org-details");
  const panelEl = document.getElementById("org-result-panel");
  const badgeEl = document.getElementById("org-badge");
  const statusPill = document.getElementById("org-status-pill");
  const studentEl = document.getElementById("org-student");
  const companionRow = document.getElementById("org-companion-row");
  const companionEl = document.getElementById("org-companion");
  const phoneEl = document.getElementById("org-phone");
  const nidEl = document.getElementById("org-nid");
  const seatsListEl = document.getElementById("org-seats-list");
  const rescanBtn = document.getElementById("org-rescan");

  const statRegStudentsEl = document.getElementById("org-stat-reg-students");
  const statRegCompanionsEl = document.getElementById("org-stat-reg-companions");
  const statPresentStudentsEl = document.getElementById("org-stat-present-students");
  const statPresentCompanionsEl = document.getElementById("org-stat-present-companions");
  const statPresentTotalEl = document.getElementById("org-stat-present-total");
  const statAbsentStudentsEl = document.getElementById("org-stat-absent-students");
  const statsFootEl = document.getElementById("org-stats-foot");
  const rosterCountEl = document.getElementById("org-roster-count");
  const lookupFormEl = document.getElementById("org-lookup-form");
  const lookupInputEl = document.getElementById("org-lookup-input");
  const modeCardEls = document.querySelectorAll(".org-mode-card");
  const modePanelQr = document.getElementById("org-mode-qr");
  const modePanelCode = document.getElementById("org-mode-code");
  const rosterSearchEl = document.getElementById("org-roster-search");
  const rosterListEl = document.getElementById("org-roster-list");
  const rosterEmptyEl = document.getElementById("org-roster-empty");
  const filterBtns = document.querySelectorAll(".org-filter");
  const rsvpToastEl = document.getElementById("org-rsvp-toast");
  let rsvpToastTimer = 0;

  /** @type {unknown} */
  let scanner = null;
  let scanning = false;
  let lastDecoded = "";
  let debounceT = 0;
  /** @type {'all' | 'present' | 'absent'} */
  let rosterFilter = "all";
  let scanModalOpen = false;
  /** @type {'qr' | 'code' | null} */
  let activeMode = null;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showRsvpToast(message) {
    if (!rsvpToastEl) return;
    rsvpToastEl.textContent = message;
    rsvpToastEl.hidden = false;
    if (rsvpToastTimer) clearTimeout(rsvpToastTimer);
    rsvpToastTimer = window.setTimeout(() => {
      rsvpToastEl.hidden = true;
    }, 12000);
  }

  function setBadge(text, kind) {
    if (!badgeEl) return;
    badgeEl.textContent = text;
    badgeEl.className = "org-badge";
    if (kind === "ok") badgeEl.classList.add("org-badge--ok");
    else if (kind === "err") badgeEl.classList.add("org-badge--err");
    else badgeEl.classList.add("org-badge--wait");
  }

  function setPanelState(state) {
    if (!panelEl) return;
    panelEl.classList.remove("is-success", "is-error");
    if (state === "success") panelEl.classList.add("is-success");
    if (state === "error") panelEl.classList.add("is-error");
  }

  function openScanModal() {
    scanModalOpen = true;
    if (scanModal) scanModal.hidden = false;
    document.body.classList.add("org-modal-open");
  }

  function closeScanModal() {
    scanModalOpen = false;
    if (scanModal) scanModal.hidden = true;
    document.body.classList.remove("org-modal-open");
  }

  function showIdle() {
    closeScanModal();
    setPanelState("idle");
    if (msgEl) {
      msgEl.hidden = true;
      msgEl.textContent = "";
    }
    if (detailsEl) detailsEl.hidden = true;
    if (statusPill) {
      statusPill.hidden = false;
      statusPill.classList.add("is-scanning");
      statusPill.textContent = "الكاميرا نشطة — في انتظار المسح";
    }
  }

  /**
   * @param {string} t
   * @param {{ modal?: boolean }} [opts]
   */
  function showErr(t, opts) {
    const useModal = !opts || opts.modal !== false;
    setPanelState("error");
    setBadge("غير مقبول", "err");
    if (msgEl) {
      msgEl.hidden = false;
      msgEl.textContent = t;
    }
    if (detailsEl) detailsEl.hidden = true;
    if (useModal) openScanModal();
    if (statusPill) {
      statusPill.hidden = false;
      statusPill.classList.remove("is-scanning");
      statusPill.textContent = useModal
        ? "أغلق النافذة ثم امسح رمزاً جديداً"
        : t;
    }
  }

  function clearErr() {
    if (msgEl) {
      msgEl.hidden = true;
      msgEl.textContent = "";
    }
  }

  function parsePayload(text) {
    const parts = String(text).trim().split("|");
    if (parts.length < 3 || parts[0] !== "THREA1") return null;
    const token = String(parts[2] || "").trim();
    const rawPart = String(parts[1] || "").trim();
    if (!rawPart || !token) return null;
    const ic = globalThis.ThreaInviteCodes;
    if (ic && typeof ic.isInviteCode === "function" && ic.isInviteCode(rawPart)) {
      return { publicId: ic.normalizeInviteCode(rawPart), inviteCode: ic.normalizeInviteCode(rawPart), token };
    }
    return { publicId: rawPart, inviteCode: "", token };
  }

  /** @param {string} id @param {number} idx */
  function seatInfoById(id, idx) {
    const api = window.ThreaSeats;
    const s =
      api && typeof api.getSeatById === "function"
        ? api.getSeatById(id)
        : api && api.SEATS
          ? api.SEATS.find((x) => x.id === id)
          : null;
    const short =
      s && api && typeof api.formatSeatShort === "function"
        ? api.formatSeatShort(s)
        : s
          ? `${s.section === "RIGHT" ? "يمين" : "يسار"} صف ${s.row} مقعد ${s.seatInRow}`
          : id;
    let role;
    if (s && s.section === "RIGHT") {
      role = "المرافق (يمين)";
    } else if (s && s.section === "LEFT") {
      role = "الخريج (يسار)";
    } else {
      role = idx === 0 ? "الخريج (يسار)" : "المرافق (يمين)";
    }
    const long = s ? s.name : id;
    return { role, short, long };
  }

  /** @param {string[]} seatIds */
  function renderSeats(seatIds) {
    if (!seatsListEl) return;
    seatsListEl.replaceChildren();
    seatIds.forEach((id, i) => {
      const info = seatInfoById(id, i);
      const li = document.createElement("li");
      li.className = "org-seat-chip";
      li.innerHTML = `<span class="org-seat-chip-role">${escapeHtml(info.role)}</span><span class="org-seat-chip-short">${escapeHtml(info.short)}</span><span class="org-seat-chip-long">${escapeHtml(info.long)}</span>`;
      seatsListEl.appendChild(li);
    });
  }

  /** @param {{ studentName?: string, companionName?: string, whatsappPhone?: string, nationalId?: string, inviteCode?: string, seatIds?: string[], checkedInAt?: string }} rec @param {{ lookup?: boolean }} [opts] */
  function showGuestDetails(rec, opts) {
    const isLookup = !!(opts && opts.lookup);
    setPanelState("success");
    setBadge(
      isLookup ? "استعلام" : rec.checkedInAt ? "حاضر ✓" : "مقبول ✓",
      "ok"
    );
    clearErr();
    if (studentEl) studentEl.textContent = rec.studentName || "—";
    if (rec.companionName && companionEl && companionRow) {
      companionRow.hidden = false;
      companionEl.textContent = rec.companionName;
    } else if (companionRow) {
      companionRow.hidden = true;
    }
    if (phoneEl) phoneEl.textContent = rec.whatsappPhone || "—";
    if (nidEl) {
      nidEl.textContent = rec.inviteCode
        ? `${rec.inviteCode} (رمز الدعوة)`
        : rec.nationalId || "—";
    }
    if (Array.isArray(rec.seatIds)) renderSeats(rec.seatIds);
    if (detailsEl) detailsEl.hidden = false;
    openScanModal();
    if (statusPill) {
      statusPill.hidden = false;
      statusPill.classList.remove("is-scanning");
      statusPill.textContent = isLookup
        ? "بيانات الحجز — أغلق النافذة للمتابعة"
        : "تم تسجيل الحضور — أغلق النافذة لمسح جديد";
    }
  }

  /** @param {{ studentName?: string, companionName?: string, whatsappPhone?: string, nationalId?: string, seatIds?: string[], checkedInAt?: string }} rec */
  function showSuccess(rec) {
    showGuestDetails(rec, { lookup: false });
  }

  function getGuestApi() {
    return window.ThreaGuestAssignments;
  }

  /** انتظار تحميل guest-assignments.js (قد يتأخر بعد firebase-init) */
  async function waitForGuestApi(maxMs) {
    const deadline = Date.now() + (maxMs || 10000);
    while (Date.now() < deadline) {
      const ga = getGuestApi();
      if (
        ga &&
        (typeof ga.verifyAndCheckIn === "function" ||
          typeof ga.verifyCheckIn === "function")
      ) {
        return ga;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    return null;
  }

  /**
   * @param {string} nationalId
   * @param {string} token
   * @returns {Promise<{ rec: object | null, error?: string }>}
   */
  async function checkInGuest(nationalId, token) {
    const ga = await waitForGuestApi(10000);
    if (!ga) {
      return {
        rec: null,
        error:
          "لم يُحمَّل ملف guest-assignments.js. ارفع النسخة الأحدث من المشروع ثم حدّث الصفحة (Ctrl+F5).",
      };
    }
    if (ga.ready) await ga.ready;

    try {
      if (typeof ga.verifyAndCheckIn === "function") {
        const rec = await ga.verifyAndCheckIn(nationalId, token);
        return { rec };
      }
      if (typeof ga.verifyCheckIn === "function") {
        const rec = await ga.verifyCheckIn(nationalId, token);
        if (!rec) return { rec: null };
        if (!rec.checkedInAt && typeof ga.markCheckedIn === "function") {
          const marked = await ga.markCheckedIn(nationalId);
          return { rec: marked || rec };
        }
        return { rec };
      }
      return {
        rec: null,
        error: "ملف guest-assignments.js قديم — أعد رفعه من المشروع.",
      };
    } catch (e) {
      console.error(e);
      const st =
        typeof ga.getStatus === "function" ? ga.getStatus() : null;
      if (st && st.permissionDenied) {
        return { rec: null, error: ga.RULES_HELP_AR || st.rulesHelp };
      }
      return {
        rec: null,
        error: "خطأ أثناء التحقق. تحقق من الاتصال وقواعد Firestore.",
      };
    }
  }

  async function refreshAttendanceUi() {
    const ga = await waitForGuestApi(8000);
    if (!ga || typeof ga.getAttendanceStats !== "function") return;

    if (ga.ready) await ga.ready;

    const st = typeof ga.getStatus === "function" ? ga.getStatus() : null;
    if (st && st.quotaExhausted && statsFootEl) {
      statsFootEl.textContent =
        "تجاوز حدّ الطلبات — التحديث متوقف مؤقتاً. أغلق التبويبات الزائدة أو انتظر قليلاً.";
      statsFootEl.classList.add("org-stats-foot--warn");
    } else if (statsFootEl) {
      statsFootEl.classList.remove("org-stats-foot--warn");
    }

    const stats = ga.getAttendanceStats();

    if (statRegStudentsEl) statRegStudentsEl.textContent = String(stats.totalStudents);
    if (statRegCompanionsEl) statRegCompanionsEl.textContent = String(stats.totalCompanions);
    if (statPresentStudentsEl) statPresentStudentsEl.textContent = String(stats.presentStudents);
    if (statPresentCompanionsEl) {
      statPresentCompanionsEl.textContent = String(stats.presentCompanions);
    }
    if (statPresentTotalEl) statPresentTotalEl.textContent = String(stats.totalPresent);
    if (statAbsentStudentsEl) statAbsentStudentsEl.textContent = String(stats.absentStudents);
    if (rosterCountEl) {
      rosterCountEl.textContent = `${stats.totalStudents} حجز · ${stats.totalCompanions} مرافق`;
    }
    if (statsFootEl) {
      const t = new Date();
      statsFootEl.textContent = `آخر تحديث: ${t.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
    }

    renderRosterList(stats.guests);
    return stats;
  }

  function attendanceBadge(present) {
    const cls = present
      ? "org-att-badge org-att-badge--present"
      : "org-att-badge org-att-badge--absent";
    const text = present ? "حاضر" : "لم يحضر";
    return `<span class="${cls}">${text}</span>`;
  }

  /**
   * @param {Array<{ studentName: string, companionName?: string, checkedInAt?: string }>} guests
   */
  function renderRosterList(guests) {
    if (!rosterListEl) return;

    const q = rosterSearchEl
      ? String(rosterSearchEl.value || "")
          .trim()
          .toLowerCase()
      : "";

    /** @type {{ student: string, companion: string, inviteCode: string, nationalId: string, present: boolean, rsvpStatus: string }[]} */
    const parties = [];

    for (const g of guests) {
      const present = !!g.checkedInAt;
      const student = g.studentName || "—";
      const companion =
        typeof g.companionName === "string" ? g.companionName.trim() : "";
      const inviteCode =
        typeof g.inviteCode === "string" ? g.inviteCode.trim().toUpperCase() : "";
      const nationalId =
        typeof g.nationalId === "string" ? g.nationalId.trim() : "";
      const rsvpStatus =
        typeof g.rsvpStatus === "string" ? g.rsvpStatus : "pending";
      parties.push({ student, companion, inviteCode, nationalId, present, rsvpStatus });
    }

    let filtered = parties;
    if (rosterFilter === "present") {
      filtered = parties.filter((p) => p.present);
    } else if (rosterFilter === "absent") {
      filtered = parties.filter((p) => !p.present);
    }

    if (q) {
      const ic = globalThis.ThreaInviteCodes;
      const qDigits = q.replace(/\D/g, "");
      filtered = filtered.filter((p) => {
        if (p.student.toLowerCase().includes(q)) return true;
        if (p.companion.toLowerCase().includes(q)) return true;
        if (p.inviteCode.toLowerCase().includes(q)) return true;
        if (p.nationalId.toLowerCase().includes(q)) return true;
        if (qDigits && p.inviteCode.replace(/\D/g, "").includes(qDigits)) return true;
        if (
          qDigits &&
          ic &&
          typeof ic.normalizeInviteCode === "function" &&
          ic.isInviteCode(qDigits) &&
          p.inviteCode === ic.normalizeInviteCode(qDigits)
        ) {
          return true;
        }
        return false;
      });
    }

    rosterListEl.replaceChildren();

    if (!parties.length) {
      if (rosterEmptyEl) {
        rosterEmptyEl.hidden = false;
        rosterEmptyEl.textContent =
          "لا يوجد مسجّلون بعد. يظهرون هنا بعد إتمام الحجز من صفحة الموقع.";
      }
      return;
    }

    if (rosterEmptyEl) rosterEmptyEl.hidden = true;

    if (!filtered.length) {
      if (rosterEmptyEl) {
        rosterEmptyEl.hidden = false;
        rosterEmptyEl.textContent = "لا توجد نتائج لهذا البحث أو التصفية.";
      }
      return;
    }

    for (const p of filtered) {
      const li = document.createElement("li");
      li.className = `org-party${p.present ? " is-present" : " is-absent"}`;

      const hasCompanion = p.companion.length >= 2;
      let rsvpBadge = "";
      if (p.rsvpStatus === "confirmed") {
        rsvpBadge =
          '<span class="org-party-badge org-party-badge--ok">أكّد الحضور</span>';
      } else if (p.rsvpStatus === "declined") {
        rsvpBadge =
          '<span class="org-party-badge org-party-badge--err">اعتذر</span>';
      }
      const partyBadge = p.present
        ? '<span class="org-party-badge org-party-badge--ok">تم مسح QR</span>'
        : '<span class="org-party-badge org-party-badge--wait">بانتظار المسح</span>';

      let attendanceRows = `<div class="org-att-row"><span class="org-att-role">طالب</span><span class="org-att-name">${escapeHtml(p.student)}</span>${attendanceBadge(p.present)}</div>`;

      if (hasCompanion) {
        attendanceRows += `<div class="org-att-row"><span class="org-att-role">مرافق</span><span class="org-att-name">${escapeHtml(p.companion)}</span>${attendanceBadge(p.present)}</div>`;
      }

      const codeBit = p.inviteCode
        ? `<span class="org-party-code" dir="ltr">${escapeHtml(p.inviteCode)}</span>`
        : "";
      li.innerHTML = `<div class="org-party-head"><span class="org-party-student">${escapeHtml(p.student)}</span>${codeBit}${rsvpBadge}${partyBadge}</div><div class="org-party-attendance">${attendanceRows}</div>`;
      rosterListEl.appendChild(li);
    }
  }

  /**
   * استعلام بدون تسجيل حضور — رمز دعوة أو هوية أو QR.
   * @param {string} raw
   */
  async function lookupByInput(raw) {
    const ga = await waitForGuestApi(8000);
    if (!ga) {
      showErr("نظام الحجوزات غير جاهز.");
      return;
    }
    if (ga.ready) await ga.ready;

    const input = String(raw || "").trim();
    if (!input) {
      showErr("أدخل رمز الدعوة أو الهوية.");
      return;
    }

    let rec = null;
    const parsed = parsePayload(input);
    if (parsed) {
      rec = typeof ga.getByPublicId === "function" ? ga.getByPublicId(parsed.publicId) : null;
      if (!rec || String(rec.checkInToken || "") !== parsed.token) {
        showErr("رمز QR غير صالح أو منتهٍ.");
        return;
      }
    } else {
      const digits = input.replace(/\D/g, "");
      if (digits.length === 4 && typeof ga.lookupKioskNumericCode === "function") {
        const lookup = ga.lookupKioskNumericCode(digits);
        if (lookup.error) {
          showErr(lookup.error);
          return;
        }
        rec = lookup.rec;
      } else if (typeof ga.getByPublicId === "function") {
        rec = ga.getByPublicId(input);
        if (!rec && digits.length >= 10) {
          rec = ga.getByPublicId(digits);
        }
      }
    }

    if (!rec || !rec.seatIds || !rec.seatIds.length) {
      showErr("لم يُعثر على حجز بهذا الرمز أو الهوية.");
      return;
    }

    showGuestDetails(rec, { lookup: true });
  }

  async function onDecoded(text) {
    if (scanModalOpen) return;
    const now = Date.now();
    if (text === lastDecoded && now - debounceT < 4000) return;
    lastDecoded = text;
    debounceT = now;

    const parsed = parsePayload(text);
    if (!parsed) {
      showErr("الرمز غير صالح. تأكد أنه رمز دعوة الحفل (THREA1).");
      return;
    }

    clearErr();

    if (statusPill) {
      statusPill.textContent = "جاري التحقق وتسجيل الحضور…";
      statusPill.classList.remove("is-scanning");
    }

    const result = await checkInGuest(parsed.publicId, parsed.token);
    if (result.error) {
      showErr(result.error);
      return;
    }
    if (!result.rec) {
      showErr("لا يوجد حجز مطابق أو الرمز غير صحيح.");
      return;
    }
    showSuccess(result.rec);
    await refreshAttendanceUi();
  }

  function scannerQrBoxSize() {
    const frame = document.querySelector(".org-scanner-frame");
    const w = frame ? frame.clientWidth : window.innerWidth;
    const side = Math.max(180, Math.min(280, Math.floor(w * 0.72)));
    return { width: side, height: side };
  }

  function scannerConfig() {
    return {
      fps: 10,
      qrbox: scannerQrBoxSize(),
      aspectRatio: 1,
    };
  }

  async function stopScanner() {
    if (!scanner || !scanning) return;
    try {
      await scanner.stop();
    } catch (e) {
      console.warn(e);
    }
    scanning = false;
    if (statusPill && activeMode !== "qr") {
      statusPill.classList.remove("is-scanning");
      statusPill.textContent = "اختر «مسح QR» لتشغيل الكاميرا";
    }
  }

  async function startScanner() {
    if (scanning) return;
    if (typeof Html5Qrcode === "undefined") {
      showErr("مكتبة الماسح غير محمّلة.");
      return;
    }
    const region = document.getElementById("org-reader");
    if (!region) return;

    if (!scanner) scanner = new Html5Qrcode("org-reader");
    const config = scannerConfig();
    const onScan = (decodedText) => onDecoded(decodedText);

    try {
      await scanner.start({ facingMode: "environment" }, config, onScan, () => {});
      scanning = true;
      showIdle();
    } catch (e) {
      console.warn(e);
      try {
        const cams = await Html5Qrcode.getCameras();
        if (!cams || !cams.length) throw new Error("no camera");
        await scanner.start(cams[0].id, config, onScan, () => {});
        scanning = true;
        showIdle();
      } catch (e2) {
        console.error(e2);
        showErr("تعذّر تشغيل الكاميرا. اسمح بالوصول للكاميرا واستخدم HTTPS.");
        if (statusPill) {
          statusPill.classList.remove("is-scanning");
          statusPill.textContent = "الكاميرا غير متاحة";
        }
      }
    }
  }

  /**
   * @param {'qr' | 'code'} mode
   */
  function setMode(mode) {
    activeMode = mode;
    modeCardEls.forEach((card) => {
      const on = card.getAttribute("data-mode") === mode;
      card.classList.toggle("is-active", on);
      card.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (modePanelQr) modePanelQr.hidden = mode !== "qr";
    if (modePanelCode) modePanelCode.hidden = mode !== "code";

    const panel = mode === "qr" ? modePanelQr : modePanelCode;
    if (panel) {
      requestAnimationFrame(() => {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    if (mode === "qr") {
      void startScanner();
    } else {
      void stopScanner();
      if (lookupInputEl) {
        window.setTimeout(() => lookupInputEl.focus(), 280);
      }
    }
  }

  function resetForRescan() {
    lastDecoded = "";
    debounceT = 0;
    showIdle();
    if (seatsListEl) seatsListEl.replaceChildren();
  }

  if (rescanBtn) {
    rescanBtn.addEventListener("click", () => resetForRescan());
  }
  if (scanBackdrop) {
    scanBackdrop.addEventListener("click", () => resetForRescan());
  }

  modeCardEls.forEach((card) => {
    card.addEventListener("click", () => {
      const mode = card.getAttribute("data-mode");
      if (mode === "qr" || mode === "code") setMode(mode);
    });
  });

  if (lookupFormEl) {
    lookupFormEl.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const v = lookupInputEl ? lookupInputEl.value : "";
      void lookupByInput(v);
    });
  }

  if (rosterSearchEl) {
    rosterSearchEl.addEventListener("input", async () => {
      const ga = await waitForGuestApi(3000);
      if (ga && typeof ga.getAttendanceStats === "function") {
        renderRosterList(ga.getAttendanceStats().guests);
      }
    });
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      filterBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const f = btn.getAttribute("data-filter");
      rosterFilter = f === "present" || f === "absent" ? f : "all";
      const ga = await waitForGuestApi(3000);
      if (ga && typeof ga.getAttendanceStats === "function") {
        renderRosterList(ga.getAttendanceStats().guests);
      }
    });
  });

  showIdle();

  async function init() {
    const ga = await waitForGuestApi(12000);
    if (!ga) {
      showErr(
        "لم يُحمَّل نظام التحقق (guest-assignments.js). تأكد من رفع: supabase-init.js، supabase-config.js، guest-assignments.js ثم Ctrl+F5.",
        { modal: false }
      );
    } else {
      await refreshAttendanceUi();

      const pollMs =
        (globalThis.THREA_APP_CONFIG &&
          globalThis.THREA_APP_CONFIG.organizerPollMs) ||
        90000;

      window.addEventListener("threa-assignments-changed", () => {
        void refreshAttendanceUi();
      });

      window.addEventListener("threa-rsvp-updated", (ev) => {
        const d = (ev && ev.detail) || {};
        const name = d.studentName || "ضيف";
        const label =
          d.status === "confirmed"
            ? "أكّد الحضور"
            : d.status === "declined"
              ? "اعتذر عن الحضور"
              : "حدّث RSVP";
        showRsvpToast(`تنبيه: ${name} — ${label}`);
        void refreshAttendanceUi();
      });

      window.setInterval(() => {
        if (document.hidden) return;
        void refreshAttendanceUi();
      }, pollMs);

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void refreshAttendanceUi();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }

  window.addEventListener("beforeunload", () => {
    void stopScanner();
  });
})();
