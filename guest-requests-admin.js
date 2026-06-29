/**
 * مراجعة طلبات ضيوف المراسم — قبول / رفض + اختيار مقعد.
 */
(function () {
  "use strict";

  const SEATS = window.ThreaSeats ? window.ThreaSeats.SEATS : [];
  const store = window.ThreaGuestRequestStore;
  const quotaApi = window.ThreaGuestQuota;
  const ga = window.ThreaGuestAssignments;
  const inviteApi = window.ThreaCeremonyGuestInvite;

  const statsEl = document.getElementById("gra-stats");
  const listEl = document.getElementById("gra-list");
  const emptyEl = document.getElementById("gra-empty");
  const tabs = document.querySelectorAll(".gra-tab");

  const seatModal = document.getElementById("gra-seat-modal");
  const seatBackdrop = document.getElementById("gra-seat-backdrop");
  const seatTitle = document.getElementById("gra-seat-title");
  const seatGuest = document.getElementById("gra-seat-guest");
  const seatGrid = document.getElementById("gra-seat-grid");
  const seatPicked = document.getElementById("gra-seat-picked");
  const approveBtn = document.getElementById("gra-approve-btn");
  const seatCancelBtn = document.getElementById("gra-seat-cancel");
  const seatMsg = document.getElementById("gra-seat-msg");

  /** @type {'pending' | 'approved' | 'rejected'} */
  let activeTab = "pending";
  /** @type {import('./guest-request-store.js').GuestRequest | null} */
  let activeRequest = null;
  /** @type {string | null} */
  let pickedSeatId = null;
  let approveInFlight = false;
  /** @type {string | null} */
  let resendInFlightId = null;

  function formatSeatShort(seat) {
    if (window.ThreaSeats && typeof window.ThreaSeats.formatSeatShort === "function") {
      return window.ThreaSeats.formatSeatShort(seat);
    }
    if (!seat) return "";
    const side = seat.section === "RIGHT" ? "يمين" : seat.section === "LEFT" ? "يسار" : "وسط";
    return `${side} صف ${seat.row} مقعد ${seat.seatInRow}`;
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString("ar-SA", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return String(iso || "");
    }
  }

  function rowLabelCompact(row) {
    if (window.ThreaSeats && typeof window.ThreaSeats.rowLabelCompact === "function") {
      return window.ThreaSeats.rowLabelCompact(row);
    }
    return `صف ${row}`;
  }

  /** مقاعد الضيوف المحفوظة في المعايرة ولها إحداثيات بانوراما فقط. */
  function getGuestSeatPool() {
    if (!quotaApi) return [];
    if (typeof quotaApi.getCalibratedSavedSeatPool === "function") {
      return quotaApi.getCalibratedSavedSeatPool("guest", SEATS);
    }
    const saved =
      typeof quotaApi.getGuestSeatPool === "function" ? quotaApi.getGuestSeatPool(SEATS) : [];
    const pano = window.ThreaPanoramaStorage;
    if (pano && typeof pano.filterCalibratedSeats === "function") {
      return pano.filterCalibratedSeats(saved);
    }
    return saved;
  }

  function sectionLabel(section) {
    if (section === "RIGHT") return "الناحية اليمين";
    if (section === "LEFT") return "الناحية اليسار";
    if (section === "BRIDGE") return "القاعدة الوسطى";
    return section || "";
  }

  function getOccupiedSeatIds() {
    return ga && typeof ga.getOccupiedSeatIds === "function"
      ? ga.getOccupiedSeatIds()
      : new Set();
  }

  async function refreshStats() {
    if (!statsEl || !store || !ga || !quotaApi) return;
    await Promise.all([store.ready, ga.ready, quotaApi.ready]);
    const used = ga.countCeremonyGuestSeats();
    const occupied = getOccupiedSeatIds();
    const avail = quotaApi.getCeremonyAvailability(occupied, used);
    const pending = store.countPending();
    const pool = getGuestSeatPool();
  const freeInPool = pool.filter((s) => !occupied.has(s.id)).length;
    statsEl.textContent = `طلبات قيد المراجعة: ${pending} · مقاعد ضيوف محجوزة: ${used}/${avail.cap} · متاح في مجموعة الضيوف: ${freeInPool}`;
  }

  function renderList() {
    if (!store || !listEl) return;
    const items =
      activeTab === "pending"
        ? store.listPending()
        : activeTab === "approved"
          ? store.listApproved()
          : store.listRejected();

    listEl.innerHTML = "";
    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    for (const req of items) {
      const li = document.createElement("li");
      li.className = "gra-card";

      const head = document.createElement("div");
      head.className = "gra-card-head";
      const name = document.createElement("span");
      name.className = "gra-card-name";
      name.textContent = req.guestName;
      const time = document.createElement("span");
      time.className = "gra-card-time";
      time.textContent = formatTime(req.createdAt);
      head.appendChild(name);
      head.appendChild(time);

      const phone = document.createElement("p");
      phone.className = "gra-card-phone";
      phone.textContent = `واتساب: +${req.whatsappPhone}`;

      li.appendChild(head);
      li.appendChild(phone);

      if (req.seatId) {
        const seat = SEATS.find((s) => s.id === req.seatId);
        const seatLine = document.createElement("p");
        seatLine.className = "gra-card-seat";
        seatLine.textContent = seat
          ? `المقعد: ${seat.name} (${formatSeatShort(seat)})`
          : `المقعد: ${req.seatId}`;
        li.appendChild(seatLine);
      }

      if (req.status === "rejected" && req.rejectReason) {
        const rej = document.createElement("p");
        rej.className = "gra-card-seat";
        rej.style.color = "#e0a0a0";
        rej.textContent = req.rejectReason;
        li.appendChild(rej);
      }

      if (req.status === "pending") {
        const actions = document.createElement("div");
        actions.className = "gra-card-actions";
        const accept = document.createElement("button");
        accept.type = "button";
        accept.className = "gra-btn gra-btn--primary";
        accept.textContent = "قبول — اختيار مقعد";
        accept.addEventListener("click", () => openSeatModal(req));
        const reject = document.createElement("button");
        reject.type = "button";
        reject.className = "gra-btn gra-btn--danger";
        reject.textContent = "رفض";
        reject.addEventListener("click", () => rejectRequest(req));
        actions.appendChild(accept);
        actions.appendChild(reject);
        li.appendChild(actions);
      }

      if (req.status === "approved") {
        if (req.whatsappSentAt) {
          const sentLine = document.createElement("p");
          sentLine.className = "gra-card-seat";
          sentLine.textContent = `آخر إرسال واتساب: ${formatTime(req.whatsappSentAt)}`;
          li.appendChild(sentLine);
        }
        const actions = document.createElement("div");
        actions.className = "gra-card-actions";
        const resend = document.createElement("button");
        resend.type = "button";
        resend.className = "gra-btn";
        const busy = resendInFlightId === req.id;
        resend.textContent = busy ? "جاري إعادة الإرسال…" : "إعادة إرسال واتساب";
        resend.disabled = busy || !req.seatId;
        if (!req.seatId) {
          resend.title = "لا يوجد مقعد مرتبط بهذا الطلب.";
        }
        resend.addEventListener("click", () => resendWhatsApp(req));
        actions.appendChild(resend);
        li.appendChild(actions);
      }

      listEl.appendChild(li);
    }
  }

  function showSeatMsg(text, isErr) {
    if (!seatMsg) return;
    seatMsg.hidden = !text;
    seatMsg.textContent = text || "";
    seatMsg.classList.toggle("is-err", !!isErr);
  }

  function closeSeatModal() {
    if (seatModal) seatModal.hidden = true;
    activeRequest = null;
    pickedSeatId = null;
    approveInFlight = false;
    if (approveBtn) approveBtn.disabled = true;
    showSeatMsg("");
  }

  function renderSeatGrid() {
    if (!seatGrid) return;
    seatGrid.innerHTML = "";
    const pool = getGuestSeatPool();
    const occupied = getOccupiedSeatIds();

    if (!pool.length) {
      seatGrid.textContent =
        "لا توجد مقاعد ضيوف جاهزة — حدّدها في المعايرة (قوائم المقاعد ← ضيوف) وضع إحداثياتها على البانوراما ثم احفظ.";
      return;
    }

    const SECTION_ORDER = ["LEFT", "RIGHT", "BRIDGE"];
    const bySection = new Map();
    for (const s of pool) {
      const sec = s.section || "LEFT";
      if (!bySection.has(sec)) bySection.set(sec, new Map());
      const byRow = bySection.get(sec);
      const row = s.row || 0;
      if (!byRow.has(row)) byRow.set(row, []);
      byRow.get(row).push(s);
    }

    for (const section of SECTION_ORDER) {
      const byRow = bySection.get(section);
      if (!byRow) continue;

      const sectionHead = document.createElement("h3");
      sectionHead.className = "gra-seat-section-label";
      sectionHead.textContent = sectionLabel(section);
      seatGrid.appendChild(sectionHead);

      for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
        const group = document.createElement("div");
        group.className = "gra-seat-row-group";
        const label = document.createElement("p");
        label.className = "gra-seat-row-label";
        label.textContent = rowLabelCompact(row);
        group.appendChild(label);

        const chips = document.createElement("div");
        chips.className = "gra-seat-chips";
        for (const seat of byRow.get(row).sort((a, b) => a.seatInRow - b.seatInRow)) {
          const busy = occupied.has(seat.id);
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `gra-seat-chip ${busy ? "is-busy" : "is-free"}`;
          if (pickedSeatId === seat.id) btn.classList.add("is-picked");
          btn.textContent = String(seat.seatInRow);
          btn.title = seat.name || seat.id;
          btn.disabled = busy;
          if (!busy) {
            btn.addEventListener("click", () => {
              pickedSeatId = seat.id;
              if (seatPicked) {
                seatPicked.textContent = `المختار: ${seat.name} — ${formatSeatShort(seat)}`;
              }
              if (approveBtn) approveBtn.disabled = false;
              renderSeatGrid();
            });
          }
          chips.appendChild(btn);
        }
        group.appendChild(chips);
        seatGrid.appendChild(group);
      }
    }
  }

  function openSeatModal(req) {
    activeRequest = req;
    pickedSeatId = null;
    if (seatModal) seatModal.hidden = false;
    if (seatTitle) seatTitle.textContent = "اختيار مقعد للضيف";
    if (seatGuest) {
      seatGuest.textContent = `${req.guestName} · +${req.whatsappPhone}`;
    }
    if (seatPicked) seatPicked.textContent = "انقر مقعداً أخضر (متاح).";
    if (approveBtn) approveBtn.disabled = true;
    showSeatMsg("");
    renderSeatGrid();
  }

  async function approveRequest() {
    if (!activeRequest || !pickedSeatId || approveInFlight) return;
    if (!ga || !store || !inviteApi) return;

    const seat = SEATS.find((s) => s.id === pickedSeatId);
    if (!seat) {
      showSeatMsg("مقعد غير صالح.", true);
      return;
    }

    const occupied = getOccupiedSeatIds();
    if (occupied.has(pickedSeatId)) {
      showSeatMsg("المقعد أصبح محجوزاً — اختر مقعداً آخر.", true);
      renderSeatGrid();
      return;
    }

    approveInFlight = true;
    if (approveBtn) approveBtn.disabled = true;
    showSeatMsg("جاري الحفظ وإرسال واتساب…");

    try {
      await Promise.all([ga.ready, store.ready]);
      const token =
        globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `t_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

      await ga.saveAssignment(
        activeRequest.guestRef,
        activeRequest.guestName,
        "",
        activeRequest.whatsappPhone,
        [pickedSeatId],
        token
      );

      const saved = ga.getExistingForNationalId(activeRequest.guestRef);
      const inviteCode = saved && saved.inviteCode ? saved.inviteCode : "";

      await store.updateRequest(activeRequest.id, {
        status: "approved",
        seatId: pickedSeatId,
        assignmentId: activeRequest.guestRef,
        checkInToken: token,
        inviteCode,
        reviewedAt: new Date().toISOString(),
      });

      await inviteApi.sendInvite({
        phone: activeRequest.whatsappPhone,
        profile: {
          guestName: activeRequest.guestName,
          studentName: activeRequest.guestName,
          guestRef: activeRequest.guestRef,
          inviteCode,
          checkInToken: token,
        },
        seat,
      });

      await store.updateRequest(activeRequest.id, {
        whatsappSentAt: new Date().toISOString(),
      });

      if (typeof ga.updateWhatsAppStatus === "function") {
        const pub = inviteCode || activeRequest.guestRef;
        await ga.updateWhatsAppStatus(pub, "sent").catch(() => {});
      }

      showSeatMsg("تم القبول وإرسال واتساب بنجاح.");
      setTimeout(() => {
        closeSeatModal();
        refreshStats();
        renderList();
      }, 1200);
    } catch (e) {
      console.error(e);
      showSeatMsg((e && e.message) || "فشل القبول.", true);
      if (approveBtn) approveBtn.disabled = false;
    } finally {
      approveInFlight = false;
    }
  }

  /**
   * @param {import('./guest-request-store.js').GuestRequest} req
   */
  async function resolveInvitePayload(req) {
    if (!ga) throw new Error("وحدة الحجوزات غير متاحة.");
    await ga.ready;
    const guestRef = req.assignmentId || req.guestRef;
    if (!guestRef) throw new Error("مرجع الضيف غير معروف.");
    const saved = ga.getExistingForNationalId(guestRef);
    const inviteCode =
      (saved && saved.inviteCode) || req.inviteCode || "";
    const checkInToken =
      (saved && saved.checkInToken) || req.checkInToken || "";
    if (!checkInToken) {
      throw new Error("رمز الدخول غير متوفر — أعد قبول الطلب أو راجع الحجز.");
    }
    const seatId =
      req.seatId ||
      (saved && saved.seatIds && saved.seatIds.length ? saved.seatIds[0] : "");
    const seat = SEATS.find((s) => s.id === seatId);
    if (!seat) throw new Error("المقعد غير معروف.");
    return {
      phone: req.whatsappPhone,
      profile: {
        guestName: req.guestName,
        studentName: req.guestName,
        guestRef,
        inviteCode,
        checkInToken,
      },
      seat,
    };
  }

  /**
   * @param {import('./guest-request-store.js').GuestRequest} req
   */
  async function resendWhatsApp(req) {
    if (!inviteApi || !store || resendInFlightId) return;
    if (req.status !== "approved") return;

    resendInFlightId = req.id;
    renderList();

    try {
      const payload = await resolveInvitePayload(req);
      await inviteApi.sendInvite(payload);
      await store.updateRequest(req.id, {
        whatsappSentAt: new Date().toISOString(),
      });

      const pub = payload.profile.inviteCode || payload.profile.guestRef;
      if (typeof ga.updateWhatsAppStatus === "function") {
        await ga.updateWhatsAppStatus(pub, "sent").catch(() => {});
      }

      window.alert(`تم إعادة إرسال الدعوة إلى +${req.whatsappPhone} بنجاح.`);
    } catch (e) {
      console.error("resendWhatsApp", e);
      window.alert((e && e.message) || "تعذّر إعادة إرسال واتساب.");
      const pub =
        req.inviteCode || req.assignmentId || req.guestRef;
      if (pub && typeof ga.updateWhatsAppStatus === "function") {
        await ga
          .updateWhatsAppStatus(pub, "failed", (e && e.message) || "")
          .catch(() => {});
      }
    } finally {
      resendInFlightId = null;
      await store.pullAll();
      await refreshStats();
      renderList();
    }
  }

  async function rejectRequest(req) {
    if (!store) return;
    const reason = window.prompt(
      "سبب الرفض (اختياري — يُرسل للضيف عبر واتساب):",
      ""
    );
    if (reason === null) return;

    const rejectReason =
      String(reason || "").trim() || "نعتذر — لا يتوفر مقعد.";

    try {
      await store.ready;
      await store.updateRequest(req.id, {
        status: "rejected",
        rejectReason,
        reviewedAt: new Date().toISOString(),
      });

      if (inviteApi && typeof inviteApi.sendRejection === "function") {
        try {
          await inviteApi.sendRejection({
            phone: req.whatsappPhone,
            guestName: req.guestName,
            reason: rejectReason,
          });
        } catch (waErr) {
          console.warn("reject whatsapp", waErr);
          window.alert(
            "تم رفض الطلب في النظام لكن تعذّر إرسال واتساب: " +
              ((waErr && waErr.message) || "")
          );
        }
      }

      await refreshStats();
      renderList();
    } catch (e) {
      window.alert((e && e.message) || "فشل الرفض.");
    }
  }

  function initTabs() {
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const t = tab.getAttribute("data-tab");
        if (t !== "pending" && t !== "approved" && t !== "rejected") return;
        activeTab = t;
        tabs.forEach((x) => x.classList.toggle("is-active", x === tab));
        renderList();
      });
    });
  }

  function initModal() {
    seatBackdrop?.addEventListener("click", closeSeatModal);
    seatCancelBtn?.addEventListener("click", closeSeatModal);
    approveBtn?.addEventListener("click", () => approveRequest());
  }

  async function init() {
    if (!store) {
      if (statsEl) statsEl.textContent = "تعذّر تحميل وحدة الطلبات.";
      return;
    }
    initTabs();
    initModal();
    await store.ready;
    if (window.ThreaPanoramaStorage && window.ThreaPanoramaStorage.ready) {
      await window.ThreaPanoramaStorage.ready;
    }
    if (quotaApi && quotaApi.ready) await quotaApi.ready;
    if (ga && ga.ready) await ga.ready;

    await store.pullAll();
    await refreshStats();
    renderList();

    globalThis.addEventListener("threa-guest-requests-changed", async () => {
      await store.pullAll();
      await refreshStats();
      renderList();
    });

    globalThis.addEventListener("threa-assignments-changed", async () => {
      await refreshStats();
      if (activeRequest && !seatModal.hidden) renderSeatGrid();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }
})();
