(function () {
  "use strict";

  const cfg = globalThis.THREA_APP_CONFIG || {};

  const el = {
    school: document.getElementById("an-school"),
    eventWhen: document.getElementById("an-event-when"),
    cdDays: document.getElementById("cd-days"),
    cdHours: document.getElementById("cd-hours"),
    cdMins: document.getElementById("cd-mins"),
    cdSecs: document.getElementById("cd-secs"),
    bookingPct: document.getElementById("an-booking-pct"),
    bookingSub: document.getElementById("an-booking-sub"),
    checkinNum: document.getElementById("an-checkin-num"),
    rsvpNum: document.getElementById("an-rsvp-num"),
    rsvpSub: document.getElementById("an-rsvp-sub"),
    waNum: document.getElementById("an-wa-num"),
    waSub: document.getElementById("an-wa-sub"),
    wlNum: document.getElementById("an-wl-num"),
    wlSub: document.getElementById("an-wl-sub"),
    heatmap: document.getElementById("an-heatmap"),
    updated: document.getElementById("an-updated"),
  };

  function parseEventDateTime() {
    const dateStr = String(cfg.eventDate || "11/6/2026");
    const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    let day = 11;
    let month = 5;
    let year = 2026;
    if (m) {
      day = parseInt(m[1], 10);
      month = parseInt(m[2], 10) - 1;
      year = parseInt(m[3], 10);
    }
    const timeStr = String(cfg.eventTime || "7:30 م");
    let hour = 19;
    let minute = 30;
    const tm = timeStr.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (tm) {
      hour = parseInt(tm[1], 10);
      minute = parseInt(tm[2], 10);
      if (/م\b|pm/i.test(timeStr) && hour < 12) hour += 12;
      if (/ص\b|am/i.test(timeStr) && hour === 12) hour = 0;
    }
    return new Date(year, month, day, hour, minute, 0);
  }

  const eventAt = parseEventDateTime();

  function tickCountdown() {
    const now = Date.now();
    let diff = Math.max(0, eventAt.getTime() - now);
    const days = Math.floor(diff / 86400000);
    diff -= days * 86400000;
    const hours = Math.floor(diff / 3600000);
    diff -= hours * 3600000;
    const mins = Math.floor(diff / 60000);
    diff -= mins * 60000;
    const secs = Math.floor(diff / 1000);
    if (el.cdDays) el.cdDays.textContent = String(days);
    if (el.cdHours) el.cdHours.textContent = String(hours).padStart(2, "0");
    if (el.cdMins) el.cdMins.textContent = String(mins).padStart(2, "0");
    if (el.cdSecs) el.cdSecs.textContent = String(secs).padStart(2, "0");
  }

  function wingLabel(section) {
    if (section === "LEFT") return "الناحية اليسار (خريجون)";
    if (section === "RIGHT") return "الناحية اليمين (مرافقون)";
    if (section === "BRIDGE") return "القاعدة الوسطى";
    return section;
  }

  function renderHeatmap(seatHeat) {
    if (!el.heatmap) return;
    const seatsApi = globalThis.ThreaSeats;
    const seats = seatsApi && seatsApi.SEATS ? seatsApi.SEATS : [];
    if (!seats.length) {
      el.heatmap.textContent = "تعذّر تحميل بيانات المقاعد.";
      return;
    }

    /** @type {Record<string, typeof seats>} */
    const bySection = {};
    for (const s of seats) {
      const sec = s.section || "?";
      if (!bySection[sec]) bySection[sec] = [];
      bySection[sec].push(s);
    }

    el.heatmap.innerHTML = "";
    const order = ["LEFT", "BRIDGE", "RIGHT"];
    const sections = order.filter((k) => bySection[k]).concat(
      Object.keys(bySection).filter((k) => !order.includes(k))
    );

    for (const sec of sections) {
      const wing = document.createElement("div");
      wing.className = "an-wing";
      const title = document.createElement("p");
      title.className = "an-wing-title";
      title.textContent = wingLabel(sec);
      wing.appendChild(title);

      const list = bySection[sec].slice().sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return (a.seatInRow || 0) - (b.seatInRow || 0);
      });

      /** @type {Map<number, typeof seats>} */
      const byRow = new Map();
      for (const s of list) {
        const r = s.row || 0;
        if (!byRow.has(r)) byRow.set(r, []);
        byRow.get(r).push(s);
      }

      for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
        const rowEl = document.createElement("div");
        rowEl.className = "an-row";
        const lbl = document.createElement("span");
        lbl.className = "an-row-label";
        lbl.textContent = String(row);
        rowEl.appendChild(lbl);
        const seatsRow = document.createElement("div");
        seatsRow.className = "an-row-seats";
        for (const s of byRow.get(row)) {
          const cell = document.createElement("span");
          const heat = seatHeat[s.id];
          cell.className = "an-seat";
          if (heat && heat.state === "checked-in") {
            cell.classList.add("an-seat--in");
          } else if (heat && heat.state === "booked") {
            cell.classList.add("an-seat--booked");
          }
          cell.title = s.name || s.id;
          seatsRow.appendChild(cell);
        }
        rowEl.appendChild(seatsRow);
        wing.appendChild(rowEl);
      }
      el.heatmap.appendChild(wing);
    }
  }

  function refreshDashboard() {
    const ga = globalThis.ThreaGuestAssignments;
    if (!ga || typeof ga.getDashboardStats !== "function") return;

    const d = ga.getDashboardStats();
    if (el.bookingPct) el.bookingPct.textContent = `${d.bookingPct}%`;
    if (el.bookingSub) {
      el.bookingSub.textContent = `${d.bookedSeats} / ${d.totalSeats} مقعد محجوز`;
    }
    if (el.checkinNum) el.checkinNum.textContent = String(d.checkedInSeats);
    if (el.rsvpNum) {
      el.rsvpNum.textContent = String(d.rsvpConfirmed);
    }
    if (el.rsvpSub) {
      el.rsvpSub.textContent = `${d.rsvpConfirmed} / ${d.rsvpDeclined} / ${d.rsvpPending}`;
    }
    if (el.waNum) el.waNum.textContent = String(d.waSent);
    if (el.waSub) {
      el.waSub.textContent = `مُرسَل ${d.waSent} · فشل ${d.waFailed}`;
    }

    const wl = globalThis.ThreaWaitlist;
    if (wl && typeof wl.getStats === "function") {
      const ws = wl.getStats();
      if (el.wlNum) el.wlNum.textContent = String(ws.waiting);
      if (el.wlSub) {
        el.wlSub.textContent = `${ws.waiting} بانتظار · ${ws.notified} أُشعِر`;
      }
    }

    renderHeatmap(d.seatHeat);
    if (el.updated) {
      el.updated.textContent = `آخر تحديث: ${new Date().toLocaleString("ar-SA")}`;
    }
  }

  async function init() {
    if (el.school) {
      el.school.textContent = `${cfg.schoolName || "ثريا"} — ${cfg.graduationBatch || ""}`;
    }
    if (el.eventWhen) {
      el.eventWhen.textContent = `${cfg.eventDay || ""} ${cfg.eventDate || ""} — ${cfg.eventTime || ""}`;
    }

    tickCountdown();
    setInterval(tickCountdown, 1000);

    const ga = globalThis.ThreaGuestAssignments;
    const wl = globalThis.ThreaWaitlist;
    if (ga && ga.ready) await ga.ready;
    if (wl && wl.ready) await wl.ready;
    if (ga && typeof ga.refresh === "function") {
      await ga.refresh({ force: true });
    }
    if (wl && typeof wl.pullAll === "function") {
      await wl.pullAll();
    }

    refreshDashboard();
    setInterval(refreshDashboard, 30000);

    globalThis.addEventListener("threa-assignments-changed", refreshDashboard);
    globalThis.addEventListener("threa-rsvp-updated", refreshDashboard);
  }

  init();
})();
