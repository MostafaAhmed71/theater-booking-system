(function () {
  "use strict";

  const logEl = document.getElementById("sim-log");
  const statsEl = document.getElementById("sim-stats");
  const guestPoolHint = document.getElementById("sim-guest-pool-hint");
  const btnRun = document.getElementById("sim-run");
  const btnRefresh = document.getElementById("sim-refresh");
  const btnClear = document.getElementById("sim-clear");

  const FIRST = [
    "أحمد",
    "محمد",
    "عبدالله",
    "خالد",
    "سعود",
    "فهد",
    "سلمان",
    "نواف",
    "تركي",
    "يوسف",
    "عمر",
    "علي",
    "حسن",
    "إبراهيم",
    "ماجد",
    "ريم",
    "نورة",
    "سارة",
    "لمى",
    "هند",
  ];
  const LAST = [
    "العتيبي",
    "القحطاني",
    "الشمري",
    "الدوسري",
    "الحربي",
    "الزهراني",
    "الغامدي",
    "المطيري",
    "العنزي",
    "السبيعي",
    "الخالدي",
    "العمري",
    "الشهري",
    "البقمي",
    "الرشيد",
  ];

  let running = false;
  const usedNationalIds = new Set();

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function log(msg, kind) {
    if (!logEl) return;
    const line = document.createElement("div");
    if (kind) line.className = kind;
    const t = new Date().toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    line.textContent = `[${t}] ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function formatSeat(seat) {
    if (!seat) return "?";
    if (window.ThreaSeats && typeof window.ThreaSeats.formatSeatShort === "function") {
      return window.ThreaSeats.formatSeatShort(seat);
    }
    return seat.id || "?";
  }

  function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomNationalId() {
    for (let attempt = 0; attempt < 200; attempt++) {
      const base = String(1000000000 + Math.floor(Math.random() * 8999999999));
      if (!usedNationalIds.has(base)) {
        usedNationalIds.add(base);
        return base;
      }
    }
    return String(Date.now()).slice(-10);
  }

  function randomPhone() {
    return `05${Math.floor(10000000 + Math.random() * 89999999)}`;
  }

  function randomName() {
    return `${randomItem(FIRST)} ${randomItem(LAST)}`;
  }

  async function waitApis() {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const ga = window.ThreaGuestAssignments;
      const seats = window.ThreaSeats && window.ThreaSeats.SEATS;
      if (ga && seats && seats.length && window.ThreaSeatPicker) return true;
      await sleep(80);
    }
    return false;
  }

  function pickStudentSeatIds(occupied, hasCompanion) {
    const api = window.ThreaSeats;
    const pick =
      window.ThreaSeatPicker.pickSeatsInFillOrder.bind(window.ThreaSeatPicker);
    const quota = window.ThreaGuestQuota;
    const all = api.SEATS;
    const studentPool =
      quota && typeof quota.getStudentSeatPool === "function"
        ? quota.getStudentSeatPool(all)
        : api.getStudentBookingPool();
    const companionPool =
      quota && typeof quota.getCompanionSeatPool === "function"
        ? quota.getCompanionSeatPool(all)
        : api.getCompanionBookingPool();
    const leftAv = studentPool.filter((s) => !occupied.has(s.id));
    const stu = pick(leftAv, 1);
    if (!stu) return null;
    if (!hasCompanion) return [stu[0].id];
    const rightAv = companionPool.filter((s) => !occupied.has(s.id));
    const comp = pick(rightAv, 1);
    if (!comp) return null;
    return [stu[0].id, comp[0].id];
  }

  function pickGuestSeatIds(occupied, pool) {
    const pick =
      window.ThreaSeatPicker.pickSeatsInFillOrder.bind(window.ThreaSeatPicker);
    const available = pool.filter((s) => !occupied.has(s.id));
    const picked = pick(available, 1);
    return picked ? [picked[0].id] : null;
  }

  async function refreshStats() {
    const ga = window.ThreaGuestAssignments;
    const quota = window.ThreaGuestQuota;
    if (!ga || !statsEl) return;

    if (ga.ready) await ga.ready;
    if (typeof ga.refresh === "function") await ga.refresh({ force: true });
    if (quota && quota.ready) await quota.ready;

    const stats =
      typeof ga.getAttendanceStats === "function" ? ga.getAttendanceStats() : null;
    const st = typeof ga.getStatus === "function" ? ga.getStatus() : {};
    const occupied =
      typeof ga.getOccupiedSeatIds === "function"
        ? ga.getOccupiedSeatIds().size
        : 0;
    const totalSeats = window.ThreaSeats.SEATS.length;
    const guestPool =
      quota && typeof quota.getGuestSeatPool === "function"
        ? quota.getGuestSeatPool(window.ThreaSeats.SEATS)
        : [];

    if (guestPoolHint) {
      guestPoolHint.textContent = guestPool.length
        ? `مقاعد الضيوف المخصّصة: ${guestPool.length} — الحصة: ${quota.getQuota()}`
        : "لم تُحدَّد مقاعد ضيوف في المعايرة.";
    }

    const lines = [
      `Supabase: ${st.firestoreOk ? "متصل ✓" : "غير متصل"}`,
      `مقاعد محجوزة: ${occupied} / ${totalSeats}`,
    ];
    if (stats) {
      lines.push(
        `خريجون مسجّلون: ${stats.totalStudents} (حاضر ${stats.presentStudents})`,
        `مرافقون: ${stats.totalCompanions} (حاضر ${stats.presentCompanions})`,
        `ضيوف مراسم: ${typeof ga.listCeremonyGuests === "function" ? ga.listCeremonyGuests().length : "—"}`
      );
    }
    statsEl.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
  }

  async function clearAllBookings() {
    const client = window.ThreaFirebase && window.ThreaFirebase.db;
    if (!client) throw new Error("Supabase غير متصل");
    const table =
      (window.ThreaFirebase && window.ThreaFirebase.GUESTS_COLLECTION) ||
      "threa_guest_assignments";
    const { data, error: selErr } = await client.from(table).select("id");
    if (selErr) throw selErr;
    const ids = (data || []).map((r) => r.id);
    for (const id of ids) {
      const { error } = await client.from(table).delete().eq("id", id);
      if (error) throw error;
    }
    const ga = window.ThreaGuestAssignments;
    if (ga && typeof ga.refresh === "function") await ga.refresh({ force: true });
    return ids.length;
  }

  async function maybeCheckIn(publicId, enabled) {
    if (!enabled || Math.random() > 0.35) return;
    const ga = window.ThreaGuestAssignments;
    if (!ga || typeof ga.markCheckedIn !== "function") return;
    await ga.markCheckedIn(publicId);
  }

  async function bookStudent(index, hasCompanion, delayMs, doCheckIn) {
    const ga = window.ThreaGuestAssignments;
    const nationalId = randomNationalId();
    const studentName = randomName();
    const companionName = hasCompanion ? randomName() : "";

    const result = await ga.assignOrRestore(
      {
        nationalId,
        studentName,
        companionName,
        whatsappPhone: randomPhone(),
        hasCompanion,
      },
      (occupied) => pickStudentSeatIds(occupied, hasCompanion)
    );

    if (result.alreadyBooked) {
      log(`#${index} خريج — مكرر ${nationalId}`, "err");
      return false;
    }
    if (!result.seatIds || !result.seatIds.length) {
      log(`#${index} خريج — لا مقعد متاح`, "err");
      return false;
    }

    const seats = result.seatIds
      .map((id) => window.ThreaSeats.SEATS.find((s) => s.id === id))
      .filter(Boolean);
    const seatTxt = seats.map(formatSeat).join(" + ");
    const code = result.inviteCode || "—";
    const lookup = result.inviteCode || nationalId;
    await maybeCheckIn(lookup, doCheckIn);

    log(
      `#${index} خريج ${studentName}${hasCompanion ? " + مرافق " + companionName : ""} → ${seatTxt} | رمز ${code}`,
      "ok"
    );
    await sleep(delayMs);
    return true;
  }

  async function bookGuest(index, delayMs, doCheckIn) {
    const ga = window.ThreaGuestAssignments;
    const quota = window.ThreaGuestQuota;
    await quota.ready;
    const pool = quota.getGuestSeatPool(window.ThreaSeats.SEATS);
    if (!pool.length) {
      log(`#${index} ضيف — لا توجد مقاعد ضيوف في المعايرة`, "err");
      return false;
    }

    const roster = window.ThreaStudentRoster;
    const nationalId =
      roster && typeof roster.generateGuestRef === "function"
        ? roster.generateGuestRef()
        : `GUEST-${Date.now().toString(36).toUpperCase().slice(-8)}${index}`;

    const result = await ga.assignOrRestore(
      {
        nationalId,
        studentName: `ضيف ${index} — ${randomName()}`,
        companionName: "",
        whatsappPhone: randomPhone(),
        hasCompanion: false,
      },
      (occupied) => pickGuestSeatIds(occupied, pool)
    );

    if (result.alreadyBooked) {
      log(`#${index} ضيف — مكرر`, "err");
      return false;
    }
    if (!result.seatIds || !result.seatIds.length) {
      log(`#${index} ضيف — لا مقعد في المجموعة`, "err");
      return false;
    }

    const seat = window.ThreaSeats.SEATS.find((s) => s.id === result.seatIds[0]);
    const lookup = result.inviteCode || nationalId;
    await maybeCheckIn(lookup, doCheckIn);

    log(
      `#${index} ضيف ${nationalId} → ${formatSeat(seat)} | رمز ${result.inviteCode || "—"}`,
      "ok"
    );
    await sleep(delayMs);
    return true;
  }

  async function runSimulation() {
    if (running) return;
    const ok = await waitApis();
    if (!ok) {
      log("تعذّر تحميل المكتبات (seats-data, seat-picker, guest-assignments)", "err");
      return;
    }

    const ga = window.ThreaGuestAssignments;
    if (ga.ready) await ga.ready;
    if (typeof ga.refresh === "function") await ga.refresh({ force: true });

    const studentCount = Math.max(
      0,
      Math.min(500, parseInt(document.getElementById("sim-students").value, 10) || 0)
    );
    let companionCount = Math.max(
      0,
      Math.min(500, parseInt(document.getElementById("sim-companions").value, 10) || 0)
    );
    if (companionCount > studentCount) {
      log(
        `عدد المرافقين (${companionCount}) أكبر من عدد الخريجين — يُستخدم ${studentCount}`,
        "muted"
      );
      companionCount = studentCount;
    }
    const guestCount = Math.max(
      0,
      Math.min(200, parseInt(document.getElementById("sim-guests").value, 10) || 0)
    );
    const delayMs = Math.max(
      0,
      parseInt(document.getElementById("sim-delay").value, 10) || 0
    );
    const doCheckIn = document.getElementById("sim-checkin").checked;

    running = true;
    if (btnRun) btnRun.disabled = true;
    if (btnClear) btnClear.disabled = true;
    log("——— بدء المحاكاة ———", "muted");

    let okStudents = 0;
    let okGuests = 0;

    /** @type {boolean[]} */
    const companionFlags = Array(studentCount).fill(false);
    for (let c = 0; c < companionCount; c++) companionFlags[c] = true;
    for (let i = companionFlags.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = companionFlags[i];
      companionFlags[i] = companionFlags[j];
      companionFlags[j] = t;
    }

    for (let i = 1; i <= studentCount; i++) {
      const hasCompanion = !!companionFlags[i - 1];
      if (await bookStudent(i, hasCompanion, delayMs, doCheckIn)) okStudents += 1;
    }

    for (let g = 1; g <= guestCount; g++) {
      if (await bookGuest(g, delayMs, doCheckIn)) okGuests += 1;
    }

    log(
      `——— انتهت: ${okStudents}/${studentCount} خريج (${companionCount} مع مرافق)، ${okGuests}/${guestCount} ضيف ———`,
      "muted"
    );
    await refreshStats();
    running = false;
    if (btnRun) btnRun.disabled = false;
    if (btnClear) btnClear.disabled = false;
  }

  if (btnRun) {
    btnRun.addEventListener("click", () => {
      void runSimulation();
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      void refreshStats();
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      if (
        !global.confirm(
          "سيتم حذف كل الحجوزات من Firestore. هل أنت متأكد؟ (للتجربة فقط)"
        )
      ) {
        return;
      }
      running = true;
      btnClear.disabled = true;
      if (btnRun) btnRun.disabled = true;
      try {
        const n = await clearAllBookings();
        log(`تم مسح ${n} حجز من قاعدة البيانات.`, "ok");
        await refreshStats();
      } catch (e) {
        log(`فشل المسح: ${e.message || e}`, "err");
      }
      running = false;
      btnClear.disabled = false;
      if (btnRun) btnRun.disabled = false;
    });
  }

  (async function init() {
    await window.ThreaFirebase.ready.catch(() => {});
    const ok = await waitApis();
    if (ok) {
      log("جاهز — اضبط الأعداد واضغط «تشغيل المحاكاة».", "muted");
      await refreshStats();
    } else {
      log("انتظر تحميل Firebase والملفات…", "err");
    }
  })();
})();
