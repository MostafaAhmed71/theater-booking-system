/**
 * حجز إداري — خريج، خريج+مرافق، مرافق فقط، ضيف، وعرض المقاعد المتاحة.
 */
(function () {
  "use strict";

  const SEATS = window.ThreaSeats ? window.ThreaSeats.SEATS : [];
  const quotaEl = document.getElementById("ba-quota");
  const msgEl = document.getElementById("ba-msg");
  const resultEl = document.getElementById("ba-result");
  const resultTextEl = document.getElementById("ba-result-text");
  const resultCodeEl = document.getElementById("ba-result-code");
  const seatSummaryEl = document.getElementById("ba-seat-summary");
  const seatGridEl = document.getElementById("ba-seat-grid");

  let activeSeatPool = "student";
  let submitInFlight = false;

  function formatSeatShort(seat) {
    if (window.ThreaSeats && typeof window.ThreaSeats.formatSeatShort === "function") {
      return window.ThreaSeats.formatSeatShort(seat);
    }
    return seat && seat.name ? seat.name : String(seat && seat.id ? seat.id : "—");
  }

  function normalizePhone(localRaw) {
    let p = String(localRaw || "").replace(/\D/g, "");
    while (p.startsWith("0")) p = p.slice(1);
    if (p.startsWith("966")) return p;
    return "966" + p;
  }

  function setMsg(text, kind) {
    if (!msgEl) return;
    if (!text) {
      msgEl.hidden = true;
      msgEl.textContent = "";
      msgEl.className = "ba-msg";
      return;
    }
    msgEl.hidden = false;
    msgEl.textContent = text;
    msgEl.className = "ba-msg " + (kind === "ok" ? "is-ok" : "is-err");
  }

  function clearResult() {
    if (resultEl) resultEl.hidden = true;
    if (resultTextEl) resultTextEl.textContent = "";
    if (resultCodeEl) {
      resultCodeEl.hidden = true;
      resultCodeEl.textContent = "";
    }
  }

  function showResult(text, inviteCode) {
    if (!resultEl || !resultTextEl) return;
    resultEl.hidden = false;
    resultTextEl.textContent = text;
    if (resultCodeEl && inviteCode) {
      resultCodeEl.hidden = false;
      resultCodeEl.textContent = "رمز الدعوة: " + inviteCode;
    }
  }

  async function waitReady() {
    const tasks = [];
    if (window.ThreaGuestQuota && window.ThreaGuestQuota.ready) {
      tasks.push(window.ThreaGuestQuota.ready);
    }
    if (window.ThreaGuestAssignments && window.ThreaGuestAssignments.ready) {
      tasks.push(window.ThreaGuestAssignments.ready);
    }
    if (window.ThreaStudentRoster && window.ThreaStudentRoster.ready) {
      tasks.push(window.ThreaStudentRoster.ready);
    }
    if (window.ThreaPanoramaStorage && window.ThreaPanoramaStorage.ready) {
      tasks.push(window.ThreaPanoramaStorage.ready);
    }
    await Promise.all(tasks);
  }

  function getOccupiedSet() {
    const ga = window.ThreaGuestAssignments;
    if (!ga || typeof ga.getOccupiedSeatIds !== "function") return new Set();
    return ga.getOccupiedSeatIds();
  }

  function getPools() {
    const quotaApi = window.ThreaGuestQuota;
    if (!quotaApi || !SEATS.length) {
      return { student: [], companion: [], guest: [] };
    }
    if (typeof quotaApi.alignSeatPoolsWithCalibration === "function") {
      quotaApi.alignSeatPoolsWithCalibration();
    }
    const all = SEATS;
    if (typeof quotaApi.getCalibratedSeatPool === "function") {
      return {
        student: quotaApi.getCalibratedSeatPool("student", all),
        companion: quotaApi.getCalibratedSeatPool("companion", all),
        guest: quotaApi.getCalibratedSeatPool("guest", all),
      };
    }
    return {
      student:
        typeof quotaApi.getStudentSeatPool === "function"
          ? quotaApi.getStudentSeatPool(all)
          : [],
      companion:
        typeof quotaApi.getCompanionSeatPool === "function"
          ? quotaApi.getCompanionSeatPool(all)
          : [],
      guest:
        typeof quotaApi.getGuestSeatPool === "function"
          ? quotaApi.getGuestSeatPool(all)
          : [],
    };
  }

  function pickSeatFn() {
    const picker = window.ThreaSeatPicker;
    if (picker && typeof picker.pickSeatsInFillOrder === "function") {
      return picker.pickSeatsInFillOrder.bind(picker);
    }
    return (pool, count) => (pool.length >= count ? pool.slice(0, count) : null);
  }

  function countFreeInPool(pool, occupied) {
    let n = 0;
    for (const s of pool) {
      if (!occupied.has(s.id)) n += 1;
    }
    return n;
  }

  function refreshQuotaBanner() {
    if (!quotaEl) return;
    const ga = window.ThreaGuestAssignments;
    const quotaApi = window.ThreaGuestQuota;
    const pools = getPools();
    const occupied = getOccupiedSet();
    const stuFree = countFreeInPool(pools.student, occupied);
    const compFree = countFreeInPool(pools.companion, occupied);
    const guestFree = countFreeInPool(pools.guest, occupied);

    let guestLine = `ضيوف: ${guestFree} شاغر من ${pools.guest.length}`;
    if (quotaApi && ga && typeof quotaApi.getCeremonyAvailability === "function") {
      const used =
        typeof ga.countCeremonyGuestSeats === "function" ? ga.countCeremonyGuestSeats() : 0;
      const stat = quotaApi.getCeremonyAvailability(occupied, used);
      guestLine = `ضيوف: ${stat.remaining} متبقٍ (شاغر في المجموعة ${guestFree}/${pools.guest.length})`;
    }

    let scLine = "";
    if (quotaApi && ga && typeof quotaApi.getStudentCompanionAvailability === "function") {
      const used =
        typeof ga.countStudentCompanionSeats === "function"
          ? ga.countStudentCompanionSeats()
          : 0;
      const stat = quotaApi.getStudentCompanionAvailability(used, 1);
      scLine = ` | حدّ خريج/مرافق: ${stat.remaining} متبقٍ من ${stat.cap}`;
    }

    quotaEl.textContent =
      `خريجون: ${stuFree} شاغر من ${pools.student.length}` +
      ` | مرافقون: ${compFree} شاغر من ${pools.companion.length}` +
      ` | ${guestLine}${scLine}`;
  }

  function renderSeatGrid() {
    if (!seatGridEl || !seatSummaryEl) return;
    const pools = getPools();
    const pool =
      activeSeatPool === "companion"
        ? pools.companion
        : activeSeatPool === "guest"
          ? pools.guest
          : pools.student;
    const occupied = getOccupiedSet();
    const free = countFreeInPool(pool, occupied);
    const labels = { student: "خريجون", companion: "مرافقون", guest: "ضيوف" };
    seatSummaryEl.textContent = `${labels[activeSeatPool] || ""}: ${free} متاح من ${pool.length}`;

    seatGridEl.innerHTML = "";
    const sorted = window.ThreaSeatPicker
      ? window.ThreaSeatPicker.sortSeatsFillOrder(pool)
      : [...pool];
    for (const s of sorted) {
      const chip = document.createElement("span");
      const busy = occupied.has(s.id);
      chip.className = "ba-seat-chip " + (busy ? "ba-seat-chip--busy" : "ba-seat-chip--free");
      chip.title = s.name || s.id;
      chip.textContent = formatSeatShort(s);
      seatGridEl.appendChild(chip);
    }
  }

  function switchTab(tabId) {
    document.querySelectorAll(".ba-tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-tab") === tabId);
    });
    document.querySelectorAll(".ba-panel").forEach((panel) => {
      const on = panel.getAttribute("data-panel") === tabId;
      panel.hidden = !on;
      panel.classList.toggle("is-active", on);
    });
    if (tabId === "seats") renderSeatGrid();
  }

  function bindNationalIdLookup(nidInput, nameInput) {
    if (!nidInput || !nameInput || !window.ThreaStudentRoster) return;
    const roster = window.ThreaStudentRoster;
    async function sync() {
      const id = roster.normalizeNationalId(nidInput.value);
      const name = roster.lookupNameByNationalId(id);
      nameInput.value = name || "";
      if (id.length >= 10 && window.ThreaGuestAssignments) {
        const ga = window.ThreaGuestAssignments;
        if (ga.hasExistingBooking && ga.hasExistingBooking(id)) {
          const ex = ga.getExistingForNationalId(id);
          setMsg(
            ex && ex.inviteCode
              ? `مسجّل مسبقاً — رمز الدعوة: ${ex.inviteCode}`
              : "مسجّل مسبقاً — لا يمكن الحجز مرة أخرى.",
            "err"
          );
          return;
        }
      }
      if (msgEl && msgEl.textContent.includes("مسجّل مسبقاً")) setMsg("", "");
    }
    nidInput.addEventListener("blur", () => void sync());
    nidInput.addEventListener("change", () => void sync());
  }

  function buildPickStudentOnly() {
    const pools = getPools();
    const pickSeat = pickSeatFn();
    return (occupied) => {
      const av = pools.student.filter((s) => !occupied.has(s.id));
      const picked = pickSeat(av, 1);
      return picked ? [picked[0].id] : null;
    };
  }

  function buildPickStudentCompanion() {
    const pools = getPools();
    const pickSeat = pickSeatFn();
    return (occupied) => {
      const leftAv = pools.student.filter((s) => !occupied.has(s.id));
      const stu = pickSeat(leftAv, 1);
      if (!stu) return null;
      const rightAv = pools.companion.filter((s) => !occupied.has(s.id));
      const comp = pickSeat(rightAv, 1);
      if (!comp) return null;
      return [stu[0].id, comp[0].id];
    };
  }

  function buildPickCompanionOnly() {
    const pools = getPools();
    const pickSeat = pickSeatFn();
    return (occupied) => {
      const av = pools.companion.filter((s) => !occupied.has(s.id));
      const picked = pickSeat(av, 1);
      return picked ? [picked[0].id] : null;
    };
  }

  function buildPickGuest() {
    const pools = getPools();
    const pickSeat = pickSeatFn();
    return (occupied) => {
      const av = pools.guest.filter((s) => !occupied.has(s.id));
      const picked = pickSeat(av, 1);
      return picked ? [picked[0].id] : null;
    };
  }

  function seatsText(ids) {
    return ids
      .map((id) => SEATS.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => formatSeatShort(s))
      .join(" + ");
  }

  async function runBooking(profile, pickFn, label) {
    if (submitInFlight) return;
    const ga = window.ThreaGuestAssignments;
    if (!ga) {
      setMsg("تعذّر تحميل نظام الحجز.", "err");
      return;
    }
    submitInFlight = true;
    clearResult();
    setMsg("جاري الحجز…", "ok");

    try {
      await waitReady();
      const result = await ga.assignOrRestore(profile, pickFn);

      if (result.alreadyBooked) {
        setMsg("مسجّل مسبقاً — لا يمكن الحجز مرة أخرى.", "err");
        if (result.inviteCode) {
          showResult("يوجد حجز سابق لهذا الرقم.", result.inviteCode);
        }
        return;
      }

      if (!result.seatIds || !result.seatIds.length) {
        const st = ga.getStatus ? ga.getStatus() : {};
        setMsg(
          st.lastError ||
            st.rulesHelp ||
            "لا تتوفر مقاعد شاغرة — راجع تبويب المقاعد المتاحة.",
          "err"
        );
        return;
      }

      setMsg("", "");
      const code = result.inviteCode || "";
      showResult(`${label}: ${seatsText(result.seatIds)}`, code);
      refreshQuotaBanner();
      if (document.querySelector('[data-panel="seats"]:not([hidden])')) {
        renderSeatGrid();
      }
    } catch (err) {
      console.error(err);
      setMsg((err && err.message) || String(err), "err");
    } finally {
      submitInFlight = false;
    }
  }

  function wireForms() {
    bindNationalIdLookup(
      document.getElementById("ba-grad-nid"),
      document.getElementById("ba-grad-name")
    );
    bindNationalIdLookup(
      document.getElementById("ba-gc-nid"),
      document.getElementById("ba-gc-name")
    );

    const gradForm = document.getElementById("ba-form-graduate");
    if (gradForm) {
      gradForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const roster = window.ThreaStudentRoster;
        const nid = roster
          ? roster.normalizeNationalId(document.getElementById("ba-grad-nid").value)
          : "";
        const name = (document.getElementById("ba-grad-name").value || "").trim();
        const phone = normalizePhone(document.getElementById("ba-grad-phone").value);
        if (!nid || nid.length < 10) {
          setMsg("أدخل رقم هوية صالحاً (10 أرقام على الأقل).", "err");
          return;
        }
        if (!name) {
          setMsg("رقم الهوية غير موجود في قائمة الخريجين.", "err");
          return;
        }
        if (phone.length < 11) {
          setMsg("أدخل رقم واتساب صالحاً.", "err");
          return;
        }
        void runBooking(
          {
            nationalId: nid,
            studentName: name,
            companionName: "",
            whatsappPhone: phone,
            hasCompanion: false,
          },
          buildPickStudentOnly(),
          "خريج"
        );
      });
    }

    const gcForm = document.getElementById("ba-form-grad-companion");
    if (gcForm) {
      gcForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const roster = window.ThreaStudentRoster;
        const nid = roster
          ? roster.normalizeNationalId(document.getElementById("ba-gc-nid").value)
          : "";
        const name = (document.getElementById("ba-gc-name").value || "").trim();
        const companion = (document.getElementById("ba-gc-companion").value || "").trim();
        const phone = normalizePhone(document.getElementById("ba-gc-phone").value);
        if (!nid || nid.length < 10) {
          setMsg("أدخل رقم هوية الخريج.", "err");
          return;
        }
        if (!name) {
          setMsg("رقم الهوية غير موجود في قائمة الخريجين.", "err");
          return;
        }
        if (companion.length < 2) {
          setMsg("أدخل اسم المرافق.", "err");
          return;
        }
        if (phone.length < 11) {
          setMsg("أدخل رقم واتساب صالحاً.", "err");
          return;
        }
        void runBooking(
          {
            nationalId: nid,
            studentName: name,
            companionName: companion,
            whatsappPhone: phone,
            hasCompanion: true,
          },
          buildPickStudentCompanion(),
          "خريج + مرافق"
        );
      });
    }

    const compForm = document.getElementById("ba-form-companion");
    if (compForm) {
      compForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const roster = window.ThreaStudentRoster;
        const nid = roster
          ? roster.normalizeNationalId(document.getElementById("ba-comp-nid").value)
          : "";
        const name = (document.getElementById("ba-comp-name").value || "").trim();
        const phone = normalizePhone(document.getElementById("ba-comp-phone").value);
        if (!nid || nid.length < 10) {
          setMsg("أدخل رقم هوية المرافق.", "err");
          return;
        }
        if (name.length < 2) {
          setMsg("أدخل اسم المرافق.", "err");
          return;
        }
        if (phone.length < 11) {
          setMsg("أدخل رقم واتساب صالحاً.", "err");
          return;
        }
        void runBooking(
          {
            nationalId: nid,
            studentName: name,
            companionName: "",
            whatsappPhone: phone,
            hasCompanion: false,
          },
          buildPickCompanionOnly(),
          "مرافق"
        );
      });
    }

    const guestForm = document.getElementById("ba-form-guest");
    if (guestForm) {
      guestForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const roster = window.ThreaStudentRoster;
        const guestName = (document.getElementById("ba-guest-name").value || "").trim();
        const phone = normalizePhone(document.getElementById("ba-guest-phone").value);
        if (guestName.length < 3) {
          setMsg("أدخل اسم الضيف (3 أحرف على الأقل).", "err");
          return;
        }
        if (phone.length < 11) {
          setMsg("أدخل رقم واتساب صالحاً.", "err");
          return;
        }
        const nationalId =
          roster && typeof roster.generateGuestRef === "function"
            ? roster.generateGuestRef()
            : `GUEST-${Date.now().toString(36).toUpperCase().slice(-8)}`;
        void runBooking(
          {
            nationalId,
            studentName: guestName,
            companionName: "",
            whatsappPhone: phone,
            hasCompanion: false,
          },
          buildPickGuest(),
          "ضيف"
        );
      });
    }
  }

  function wireTabs() {
    document.querySelectorAll(".ba-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab(btn.getAttribute("data-tab") || "graduate");
      });
    });
    document.querySelectorAll(".ba-seat-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".ba-seat-tab").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
        });
        activeSeatPool = btn.getAttribute("data-pool") || "student";
        renderSeatGrid();
      });
    });
  }

  async function init() {
    wireTabs();
    wireForms();
    await waitReady();
    refreshQuotaBanner();
    window.addEventListener("threa-assignments-changed", () => {
      refreshQuotaBanner();
      if (!document.getElementById("ba-panel-seats").hidden) {
        renderSeatGrid();
      }
    });
    window.addEventListener("threa-seat-pools-reload", () => {
      refreshQuotaBanner();
      renderSeatGrid();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void init());
  } else {
    void init();
  }
})();
