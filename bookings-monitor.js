(function () {
  "use strict";

  const SEATS = window.ThreaSeats && window.ThreaSeats.SEATS;

  const el = {
    live: document.getElementById("bm-live"),
    liveText: document.getElementById("bm-live-text"),
    toast: document.getElementById("bm-toast"),
    statTotal: document.getElementById("bm-stat-total"),
    statConfirmed: document.getElementById("bm-stat-confirmed"),
    statPending: document.getElementById("bm-stat-pending"),
    statDeclined: document.getElementById("bm-stat-declined"),
    tbody: document.getElementById("bm-tbody"),
    empty: document.getElementById("bm-empty"),
    search: document.getElementById("bm-search"),
    remindAll: document.getElementById("bm-remind-all"),
    refresh: document.getElementById("bm-refresh"),
    waStatus: document.getElementById("bm-wa-status"),
    updated: document.getElementById("bm-updated"),
  };

  const filters = document.querySelectorAll(".bm-filter");
  const audienceTabs = document.querySelectorAll(".bm-audience-tab");
  const thName = document.getElementById("bm-th-name");
  const thCompanion = document.getElementById("bm-th-companion");

  /** @type {'graduates' | 'guests'} */
  let activeAudience = "graduates";
  /** @type {'all' | 'pending' | 'confirmed' | 'declined'} */
  let activeFilter = "all";
  /** @type {Set<string>} */
  let knownIds = new Set();
  let initialized = false;
  let toastTimer = 0;
  let remindInFlight = false;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getWhatsAppApiBase() {
    return (
      (globalThis.THREA_APP_CONFIG && globalThis.THREA_APP_CONFIG.whatsappApiBase) ||
      "https://wpp.northelite0.com"
    ).replace(/\/$/, "");
  }

  function normalizeWhatsAppPhone(phone) {
    let p = String(phone || "").replace(/\D/g, "");
    if (p.startsWith("0")) p = "966" + p.slice(1);
    if (p.length === 9 && p.startsWith("5")) p = "966" + p;
    return p;
  }

  function formatTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ar-SA", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return String(iso);
    }
  }

  function isCeremonyGuest(rec) {
    const ga = window.ThreaGuestAssignments;
    return !!(ga && typeof ga.isCeremonyGuestId === "function" && ga.isCeremonyGuestId(rec.nationalId));
  }

  /**
   * @param {import('./guest-assignments.js').GuestRec} rec
   */
  function seatsForRec(rec) {
    if (!SEATS || !rec || !rec.seatIds) return [];
    return rec.seatIds.map((id) => SEATS.find((s) => s.id === id)).filter(Boolean);
  }

  /**
   * @param {import('./guest-assignments.js').GuestRec} rec
   */
  function seatsSummaryHtml(rec) {
    const seats = seatsForRec(rec);
    if (!seats.length) {
      if (rsvpStatus(rec) === "declined") {
        return '<span class="bm-seats">اعتذر — تم تحرير المقعد</span>';
      }
      return '<span class="bm-seats">—</span>';
    }
    const parts = [];
    if (seats[0]) {
      parts.push(`<div>خريج: ${escapeHtml(seats[0].name)}</div>`);
    }
    if (rec.companionName && seats[1]) {
      parts.push(`<div>مرافق: ${escapeHtml(seats[1].name)}</div>`);
    } else if (seats.length === 1 && isCeremonyGuest(rec)) {
      return `<div class="bm-seats">${escapeHtml(seats[0].name)}</div>`;
    }
    return `<div class="bm-seats">${parts.join("")}</div>`;
  }

  function rsvpStatus(rec) {
    return rec.rsvpStatus || "pending";
  }

  /**
   * @param {import('./guest-assignments.js').GuestRec} rec
   */
  function needsReminder(rec) {
    if (!rec || !rec.seatIds || !rec.seatIds.length) return false;
    if (rsvpStatus(rec) !== "pending") return false;
    const phone = normalizeWhatsAppPhone(rec.whatsappPhone);
    return phone.length >= 10;
  }

  /**
   * @param {import('./guest-assignments.js').GuestRec} rec
   */
  function buildReminderMessage(rec) {
    const cfg = globalThis.THREA_APP_CONFIG || {};
    const school = cfg.schoolName || "ثانوية نخبة الشمال الأهلية";
    const eventDay = cfg.eventDay || "الخميس";
    const eventDate = cfg.eventDate || "11/6/2026";
    const eventTime = cfg.eventTime || "7:30 م";
    const seats = seatsForRec(rec);

    const lines = [
      `🎓 *تذكير — ${school}*`,
      "",
      `مرحباً *${rec.studentName}*،`,
      "",
      "نذكّركم بتأكيد حضوركم لحفل التخرّج:",
      `${eventDay} · ${eventDate} · ${eventTime}`,
    ];

    if (rec.inviteCode) {
      lines.push("", `🔑 رمز الدعوة: *${rec.inviteCode}*`);
    }

    if (seats[0] && !isCeremonyGuest(rec)) {
      lines.push("", "📍 *مقعد الخريج (يسار):*", seats[0].name);
    } else if (seats[0]) {
      lines.push("", "📍 *موقع المقعد:*", seats[0].name);
    }

    if (rec.companionName && seats[1]) {
      lines.push("", `📍 *مقعد المرافق (يمين):*`, `*${rec.companionName}*`, seats[1].name);
    }

    const profile = {
      inviteCode: rec.inviteCode,
      nationalId: rec.nationalId,
      checkInToken: rec.checkInToken,
    };

    if (globalThis.ThreaLinks && rec.checkInToken) {
      lines.push(
        "",
        "✅ *أكّد حضورك أو اعتذر من هنا:*",
        globalThis.ThreaLinks.buildRsvpUrl(profile),
        "",
        "🔗 *عرض المقاعد على الخريطة:*",
        globalThis.ThreaLinks.buildSeatViewUrl(profile)
      );
    }

    lines.push("", "شكراً لتعاونكم.");
    return lines.join("\n");
  }

  async function fetchWhatsAppConnected() {
    try {
      const res = await fetch(`${getWhatsAppApiBase()}/status`, { cache: "no-store" });
      if (!res.ok) return false;
      const data = await res.json();
      return !!(data && data.connected);
    } catch {
      return false;
    }
  }

  function setWaStatus(connected) {
    if (!el.waStatus) return;
    el.waStatus.classList.remove("is-ok", "is-err");
    if (connected) {
      el.waStatus.classList.add("is-ok");
      el.waStatus.textContent = "واتساب متصل — جاهز لإرسال التذكيرات.";
    } else {
      el.waStatus.classList.add("is-err");
      el.waStatus.textContent =
        "واتساب غير متصل — افتح https://wpp.northelite0.com/qr قبل إرسال التذكيرات.";
    }
  }

  function showToast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      el.toast.hidden = true;
    }, 10000);
  }

  function setLiveState(ok, text) {
    if (el.live) {
      el.live.classList.remove("is-on", "is-off");
      el.live.classList.add(ok ? "is-on" : "is-off");
    }
    if (el.liveText) el.liveText.textContent = text;
  }

  function rsvpBadge(status) {
    if (status === "confirmed") {
      return '<span class="bm-badge bm-badge--confirmed">مؤكّد</span>';
    }
    if (status === "declined") {
      return '<span class="bm-badge bm-badge--declined">معتذر</span>';
    }
    return '<span class="bm-badge bm-badge--pending">معلّق</span>';
  }

  /**
   * @param {import('./guest-assignments.js').GuestRec} rec
   */
  function matchesAudience(rec) {
    const guest = isCeremonyGuest(rec);
    return activeAudience === "guests" ? guest : !guest;
  }

  /**
   * @param {import('./guest-assignments.js').GuestRec[]} guests
   */
  function filterGuests(guests) {
    const q = el.search ? String(el.search.value || "").trim().toLowerCase() : "";
    return guests.filter((g) => {
      if (!matchesAudience(g)) return false;
      const st = rsvpStatus(g);
      if (activeFilter === "pending" && (st !== "pending" || !g.seatIds.length)) return false;
      if (activeFilter === "confirmed" && st !== "confirmed") return false;
      if (activeFilter === "declined" && st !== "declined") return false;
      if (!q) return true;
      const hay = [
        g.studentName,
        g.companionName,
        g.inviteCode,
        g.nationalId,
        g.whatsappPhone,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  /**
   * @param {import('./guest-assignments.js').GuestRec} rec
   */
  async function sendReminder(rec) {
    const phone = normalizeWhatsAppPhone(rec.whatsappPhone);
    if (!phone || phone.length < 10) {
      throw new Error("رقم واتساب غير صالح.");
    }
    const connected = await fetchWhatsAppConnected();
    if (!connected) {
      throw new Error("واتساب غير متصل.");
    }
    const message = buildReminderMessage(rec);
    const res = await fetch(`${getWhatsAppApiBase()}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message }),
    });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { error: raw.slice(0, 200) };
    }
    if (!res.ok) {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }
    const pub = rec.inviteCode || rec.nationalId;
    if (
      window.ThreaGuestAssignments &&
      typeof window.ThreaGuestAssignments.updateWhatsAppStatus === "function"
    ) {
      await window.ThreaGuestAssignments.updateWhatsAppStatus(pub, "sent").catch(() => {});
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * @param {import('./guest-assignments.js').GuestRec[]} list
   */
  async function sendRemindersBulk(list) {
    if (remindInFlight) return;
    if (!list.length) {
      showToast("لا يوجد أحد بانتظار التأكيد.");
      return;
    }
    if (!window.confirm(`إرسال تذكير واتساب إلى ${list.length} حجز؟`)) return;

    remindInFlight = true;
    if (el.remindAll) el.remindAll.disabled = true;

    let ok = 0;
    let fail = 0;
    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      try {
        await sendReminder(rec);
        ok += 1;
      } catch (e) {
        fail += 1;
        console.warn("reminder failed", rec.studentName, e);
      }
      if (i < list.length - 1) await sleep(1500);
    }

    showToast(`انتهى الإرسال: نجح ${ok} · فشل ${fail}`);
    remindInFlight = false;
    if (el.remindAll) el.remindAll.disabled = false;
    render();
  }

  /**
   * @param {import('./guest-assignments.js').GuestRec[]} guests
   */
  function detectNewBookings(guests) {
    const currentIds = new Set();
    const newOnes = [];

    for (const g of guests) {
      const id = g.nationalId || g.inviteCode || "";
      if (!id) continue;
      currentIds.add(id);
      if (initialized && !knownIds.has(id) && g.seatIds && g.seatIds.length) {
        newOnes.push(g);
      }
    }

    knownIds = currentIds;
    if (!initialized) {
      initialized = true;
      return [];
    }
    return newOnes;
  }

  /**
   * @param {import('./guest-assignments.js').GuestRec[]} guests
   */
  function updateTableHeaders() {
    if (activeAudience === "guests") {
      if (thName) thName.textContent = "الضيف";
      if (thCompanion) thCompanion.textContent = "—";
    } else {
      if (thName) thName.textContent = "الخريج";
      if (thCompanion) thCompanion.textContent = "المرافق";
    }
  }

  function render(guests) {
    const ga = window.ThreaGuestAssignments;
    if (!ga) return;

    updateTableHeaders();
    const table = document.getElementById("bm-table");
    if (table) {
      table.dataset.audience = activeAudience;
      table.classList.toggle("bm-table--guests", activeAudience === "guests");
    }

    const all = (guests || ga.listAllGuests()).filter((g) => matchesAudience(g));
    const withSeats = all.filter((g) => g.seatIds && g.seatIds.length);
    const declined = all.filter((g) => rsvpStatus(g) === "declined");
    const confirmed = all.filter((g) => rsvpStatus(g) === "confirmed");
    const pending = withSeats.filter((g) => rsvpStatus(g) === "pending");

    if (el.statTotal) el.statTotal.textContent = String(withSeats.length);
    if (el.statConfirmed) el.statConfirmed.textContent = String(confirmed.length);
    if (el.statPending) el.statPending.textContent = String(pending.length);
    if (el.statDeclined) el.statDeclined.textContent = String(declined.length);
    if (el.remindAll) el.remindAll.disabled = remindInFlight || pending.length === 0;

    const newBookings = detectNewBookings(withSeats).filter((g) => matchesAudience(g));
    if (newBookings.length === 1) {
      const kind = activeAudience === "guests" ? "ضيف جديد" : "حجز جديد";
      showToast(`${kind}: ${newBookings[0].studentName}`);
    } else if (newBookings.length > 1) {
      showToast(`${newBookings.length} حجوزات جديدة`);
    }

    const rows = filterGuests(all);
    if (!el.tbody) return;
    el.tbody.replaceChildren();

    if (!rows.length) {
      if (el.empty) el.empty.hidden = false;
      return;
    }
    if (el.empty) el.empty.hidden = true;

    const newIds = new Set(newBookings.map((g) => g.nationalId));

    for (const rec of rows) {
      const declined = rsvpStatus(rec) === "declined";
      if ((!rec.seatIds || !rec.seatIds.length) && !declined) continue;

      const tr = document.createElement("tr");
      if (newIds.has(rec.nationalId)) tr.classList.add("is-new");

      const canRemind = needsReminder(rec);
      const nameLabel = activeAudience === "guests" ? "الضيف" : "الخريج";
      const companionLabel = activeAudience === "guests" ? "—" : "المرافق";

      tr.innerHTML = `
        <td data-label="${nameLabel}">
          <div class="bm-name">${escapeHtml(rec.studentName || "—")}</div>
        </td>
        <td data-label="${companionLabel}">${escapeHtml(rec.companionName || "—")}</td>
        <td data-label="الرمز"><span class="bm-code">${escapeHtml(rec.inviteCode || "—")}</span></td>
        <td data-label="المقاعد">${seatsSummaryHtml(rec)}</td>
        <td data-label="RSVP">${rsvpBadge(rsvpStatus(rec))}</td>
        <td data-label="وقت الحجز">${escapeHtml(formatTime(rec.savedAt))}</td>
        <td data-label="إجراء"></td>
      `;

      const actionTd = tr.lastElementChild;
      if (actionTd && canRemind) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bm-btn bm-btn--sm bm-btn--gold";
        btn.textContent = "تذكير";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          btn.textContent = "جاري الإرسال…";
          try {
            await sendReminder(rec);
            showToast(`تم إرسال التذكير إلى ${rec.studentName}`);
            btn.textContent = "تم ✓";
          } catch (e) {
            showToast((e && e.message) || "فشل الإرسال");
            btn.textContent = "تذكير";
            btn.disabled = false;
          }
        });
        actionTd.appendChild(btn);
      } else if (actionTd) {
        actionTd.textContent = "—";
      }

      el.tbody.appendChild(tr);
    }

    if (el.updated) {
      el.updated.textContent = `آخر تحديث: ${formatTime(new Date().toISOString())}`;
    }
  }

  async function refresh(force) {
    const ga = window.ThreaGuestAssignments;
    if (!ga) return;

    await ga.ready;
    if (force && typeof ga.refresh === "function") {
      await ga.refresh({ force: true });
    }

    const st = typeof ga.getStatus === "function" ? ga.getStatus() : {};
    if (st.realtimeListener) {
      setLiveState(true, "متصل — تحديث مباشر عند كل حجز");
    } else if (st.firestoreOk) {
      setLiveState(true, "متصل — تحديث دوري");
    } else {
      setLiveState(false, st.lastError || "غير متصل بقاعدة البيانات");
    }

    render();
  }

  audienceTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = btn.getAttribute("data-audience");
      if (a !== "graduates" && a !== "guests") return;
      activeAudience = a;
      audienceTabs.forEach((b) => b.classList.toggle("is-active", b === btn));
      render();
    });
  });

  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const f = btn.getAttribute("data-filter");
      activeFilter =
        f === "pending" || f === "confirmed" || f === "declined" ? f : "all";
      render();
    });
  });

  if (el.search) {
    el.search.addEventListener("input", () => render());
  }

  if (el.refresh) {
    el.refresh.addEventListener("click", () => refresh(true));
  }

  if (el.remindAll) {
    el.remindAll.addEventListener("click", async () => {
      const ga = window.ThreaGuestAssignments;
      if (!ga) return;
      const pending = ga
        .listAllGuests()
        .filter((g) => matchesAudience(g) && needsReminder(g));
      await sendRemindersBulk(pending);
    });
  }

  window.addEventListener("threa-assignments-changed", () => {
    render();
    if (el.updated) {
      el.updated.textContent = `آخر تحديث: ${formatTime(new Date().toISOString())}`;
    }
  });

  window.addEventListener("threa-rsvp-updated", (ev) => {
    const d = (ev && ev.detail) || {};
    const name = d.studentName || "ضيف";
    const label =
      d.status === "confirmed"
        ? "أكّد الحضور"
        : d.status === "declined"
          ? "اعتذر"
          : "حدّث RSVP";
    showToast(`${name} — ${label}`);
    render();
  });

  async function init() {
    const connected = await fetchWhatsAppConnected();
    setWaStatus(connected);
    window.setInterval(async () => {
      setWaStatus(await fetchWhatsAppConnected());
    }, 60000);

    await refresh(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }
})();
