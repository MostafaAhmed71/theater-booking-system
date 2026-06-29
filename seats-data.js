/**
 * قائمة المقاعد والتخطيط — مشتركة بين الصفحة الرئيسية ومعايرة البانوراما.
 *
 * المسرح 217 مقعداً قابلاً للحجز + 3 مقاعد قاعدة وسط (صف 12):
 * — الصفوف 1–11: 9 مقاعد لكل ناحية (يمين / يسار)
 * — الصف 12: 8 مقاعد يمين + 8 يسار + 3 قاعدة تربط بين الجانبين
 * — ضيوف: الصف 1 من مقعد 4 + الصفوف 10–12 (يشمل القاعدة الوسطى)
 * — خريجون 72: الصفوف 2–9 يسار · مرافقون 72: الصفوف 2–9 يمين
 */
(function (global) {
  "use strict";

  const ROW_COUNT = 12;
  const SEATS_PER_ROW_MAIN = 9;
  const SEATS_ROW12_WING = 8;
  const BRIDGE_ROW = 12;
  const BRIDGE_SEAT_COUNT = 3;

  /** مقاعد كل صف — يمين (الصف 12 = 8) */
  const COUNTS_RIGHT = [
    ...Array(11).fill(SEATS_PER_ROW_MAIN),
    SEATS_ROW12_WING,
  ];
  /** مقاعد كل صف — يسار (الصف 12 = 8) */
  const COUNTS_LEFT = [
    ...Array(11).fill(SEATS_PER_ROW_MAIN),
    SEATS_ROW12_WING,
  ];

  const DEFAULT_BOOKING_POLICY = {
    studentSection: "LEFT",
    studentRowMin: 2,
    studentRowMax: 9,
    companionSection: "RIGHT",
    companionRowMin: 2,
    companionRowMax: 9,
    guestRowFirstMinSeat: 4,
    guestRows: [1, 10, 11, 12],
    guestIncludeBridge: true,
    bridgeSection: "BRIDGE",
    expectedGuestTotal: 70,
    expectedStudentCapacity: 72,
    expectedCompanionCapacity: 72,
    expectedBookableTotal: 217,
    expectedBridgeTotal: 3,
  };

  /** @type {typeof DEFAULT_BOOKING_POLICY | null} */
  let runtimePolicyOverride = null;

  /**
   * @param {unknown} raw
   * @returns {typeof DEFAULT_BOOKING_POLICY}
   */
  function normalizeBookingPolicy(raw) {
    const p = { ...DEFAULT_BOOKING_POLICY, guestRows: [...DEFAULT_BOOKING_POLICY.guestRows] };
    if (!raw || typeof raw !== "object") return p;
    const o = /** @type {Record<string, unknown>} */ (raw);

    if (typeof o.studentSection === "string") p.studentSection = o.studentSection;
    if (typeof o.companionSection === "string") p.companionSection = o.companionSection;
    if (typeof o.bridgeSection === "string") p.bridgeSection = o.bridgeSection;

    const int = (v, fallback) => {
      const n = Math.floor(Number(v));
      return Number.isFinite(n) ? n : fallback;
    };
    p.studentRowMin = int(o.studentRowMin, p.studentRowMin);
    p.studentRowMax = int(o.studentRowMax, p.studentRowMax);
    p.companionRowMin = int(o.companionRowMin, p.companionRowMin);
    p.companionRowMax = int(o.companionRowMax, p.companionRowMax);
    p.guestRowFirstMinSeat = int(o.guestRowFirstMinSeat, p.guestRowFirstMinSeat);

    if (typeof o.guestIncludeBridge === "boolean") {
      p.guestIncludeBridge = o.guestIncludeBridge;
    }

    let rows = o.guestRows;
    if (typeof rows === "string") {
      rows = rows.split(/[,،\s]+/).map((x) => parseInt(x, 10));
    }
    if (Array.isArray(rows)) {
      const parsed = rows
        .map((r) => int(r, 0))
        .filter((r) => r >= 1 && r <= ROW_COUNT);
      if (parsed.length) p.guestRows = [...new Set(parsed)].sort((a, b) => a - b);
    }

    if (p.studentRowMin > p.studentRowMax) {
      const t = p.studentRowMin;
      p.studentRowMin = p.studentRowMax;
      p.studentRowMax = t;
    }
    if (p.companionRowMin > p.companionRowMax) {
      const t = p.companionRowMin;
      p.companionRowMin = p.companionRowMax;
      p.companionRowMax = t;
    }
    return p;
  }

  function getBookingPolicy() {
    if (!runtimePolicyOverride) return DEFAULT_BOOKING_POLICY;
    return runtimePolicyOverride;
  }

  /**
   * @param {unknown} policy
   */
  function setRuntimeBookingPolicy(policy) {
    if (!policy) {
      runtimePolicyOverride = null;
      return;
    }
    runtimePolicyOverride = normalizeBookingPolicy(policy);
  }

  const LAYOUT = {
    rowZStart: -10,
    rowZStep: -2.85,
    seatSpacing: 1.32,
    rightAnchorX: 14,
    leftAnchorX: -14,
    yBase: -2.2,
    bridgeY: -2.05,
  };

  const _dirScratch = { x: 0, y: 0, z: 0 };

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }

  function dirToPanUV(dir, out) {
    out = out || {};
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const x = dir.x / len;
    const y = dir.y / len;
    const z = dir.z / len;
    const phi = Math.acos(clamp01(y));
    const theta = Math.atan2(x, z);
    let u = (theta + Math.PI) / (Math.PI * 2);
    u = ((u % 1) + 1) % 1;
    out.panU = u;
    out.panV = clamp01(1 - phi / Math.PI);
    return out;
  }

  /** تحويل رقم الصف 1…12 إلى صيغة عربية */
  function rowOrdinalArabic(row) {
    const words = [
      "",
      "الأول",
      "الثاني",
      "الثالث",
      "الرابع",
      "الخامس",
      "السادس",
      "السابع",
      "الثامن",
      "التاسع",
      "العاشر",
      "الحادي عشر",
      "الثاني عشر",
    ];
    return words[row] || String(row);
  }

  /**
   * @param {{ section?: string, row?: number, seatInRow?: number }} seat
   */
  function isGuestPolicySeat(seat) {
    if (!seat || !seat.section) return false;
    const pol = getBookingPolicy();
    if (
      pol.guestIncludeBridge &&
      seat.section === pol.bridgeSection &&
      seat.row === BRIDGE_ROW
    ) {
      return true;
    }
    const row = seat.row || 0;
    if (pol.guestRows.includes(row)) {
      if (row === 1) {
        return seat.seatInRow >= pol.guestRowFirstMinSeat;
      }
      return true;
    }
    return false;
  }

  /**
   * @param {{ section?: string, row?: number }} seat
   */
  function isStudentPolicySeat(seat) {
    const pol = getBookingPolicy();
    if (!seat || seat.section !== pol.studentSection) return false;
    const row = seat.row || 0;
    return row >= pol.studentRowMin && row <= pol.studentRowMax;
  }

  /**
   * @param {{ section?: string, row?: number }} seat
   */
  function isCompanionPolicySeat(seat) {
    const pol = getBookingPolicy();
    if (!seat || seat.section !== pol.companionSection) return false;
    const row = seat.row || 0;
    return row >= pol.companionRowMin && row <= pol.companionRowMax;
  }

  function buildTheaterSeats() {
    const list = [];

    function pushFromDirection(id, name, section, row, seatInRow, wx, wy, wz) {
      _dirScratch.x = wx;
      _dirScratch.y = wy;
      _dirScratch.z = wz;
      const len = Math.hypot(wx, wy, wz) || 1;
      _dirScratch.x /= len;
      _dirScratch.y /= len;
      _dirScratch.z /= len;
      const uv = dirToPanUV(_dirScratch, {});
      list.push({
        id,
        name,
        section,
        row,
        seatInRow,
        panU: uv.panU,
        panV: uv.panV,
        x: wx,
        y: wy,
        z: wz,
      });
    }

    function buildWing(section, counts, anchorX) {
      for (let r = 0; r < ROW_COUNT; r++) {
        const n = counts[r];
        const z = LAYOUT.rowZStart + r * LAYOUT.rowZStep;
        for (let s = 0; s < n; s++) {
          const row = r + 1;
          const seatInRow = s + 1;
          const prefix = section === "RIGHT" ? "RIGHT" : "LEFT";
          const sideLabel = section === "RIGHT" ? "اليمين" : "اليسار";
          const id = `${prefix}-R${String(row).padStart(2, "0")}-S${String(seatInRow).padStart(2, "0")}`;
          const name = `مقعد ${seatInRow} الصف ${rowOrdinalArabic(row)} الناحية ${sideLabel}`;
          const t = s - (n - 1) / 2;
          const x = anchorX + t * LAYOUT.seatSpacing;
          const y = LAYOUT.yBase + (r % 3) * 0.12;
          pushFromDirection(id, name, section, row, seatInRow, x, y, z);
        }
      }
    }

    buildWing("RIGHT", COUNTS_RIGHT, LAYOUT.rightAnchorX);
    buildWing("LEFT", COUNTS_LEFT, LAYOUT.leftAnchorX);

    const bridgeZ = LAYOUT.rowZStart + (BRIDGE_ROW - 1) * LAYOUT.rowZStep;
    for (let i = 0; i < BRIDGE_SEAT_COUNT; i++) {
      const seatInRow = i + 1;
      const id = `BRIDGE-R${String(BRIDGE_ROW).padStart(2, "0")}-S${String(seatInRow).padStart(2, "0")}`;
      const name = `قاعدة ${seatInRow} الصف ${rowOrdinalArabic(BRIDGE_ROW)} (وسط)`;
      const t = i - (BRIDGE_SEAT_COUNT - 1) / 2;
      const x = t * LAYOUT.seatSpacing;
      const y = LAYOUT.bridgeY;
      pushFromDirection(
        id,
        name,
        DEFAULT_BOOKING_POLICY.bridgeSection,
        BRIDGE_ROW,
        seatInRow,
        x,
        y,
        bridgeZ
      );
    }

    return list;
  }

  const SEATS = buildTheaterSeats();

  function getDefaultGuestSeatIds() {
    return SEATS.filter(isGuestPolicySeat).map((s) => s.id);
  }

  /**
   * @param {typeof SEATS} [allSeats]
   */
  function getStudentBookingPool(allSeats) {
    const list = allSeats || SEATS;
    return list.filter(isStudentPolicySeat);
  }

  /**
   * @param {typeof SEATS} [allSeats]
   */
  function getCompanionBookingPool(allSeats) {
    const list = allSeats || SEATS;
    return list.filter(isCompanionPolicySeat);
  }

  /**
   * @param {typeof SEATS} [allSeats]
   */
  function getGuestBookingPool(allSeats) {
    const list = allSeats || SEATS;
    return list.filter(isGuestPolicySeat);
  }

  function countSeatsInPolicy() {
    const pol = getBookingPolicy();
    const bridge = SEATS.filter((s) => s.section === pol.bridgeSection).length;
    return {
      total: SEATS.length,
      bridge,
      guest: getGuestBookingPool().length,
      student: getStudentBookingPool().length,
      companion: getCompanionBookingPool().length,
    };
  }

  /** @param {{ section?: string, row?: number, seatInRow?: number } | null | undefined} seat */
  function formatSeatShort(seat) {
    if (!seat || !seat.section) return "";
    if (seat.section === getBookingPolicy().bridgeSection) {
      return `قاعدة صف ${seat.row} مقعد ${seat.seatInRow}`;
    }
    const side =
      seat.section === "RIGHT"
        ? "يمين"
        : seat.section === "LEFT"
          ? "يسار"
          : seat.section;
    return `${side} صف ${seat.row} مقعد ${seat.seatInRow}`;
  }

  /** @param {string} id */
  function getSeatById(id) {
    return SEATS.find((s) => s.id === id) || null;
  }

  global.ThreaSeats = {
    SEATS,
    ROW_COUNT,
    COUNTS_RIGHT,
    COUNTS_LEFT,
    SEATS_PER_ROW_MAIN,
    SEATS_ROW12_WING,
    BRIDGE_ROW,
    BRIDGE_SEAT_COUNT,
    DEFAULT_BOOKING_POLICY,
    BOOKING_POLICY: DEFAULT_BOOKING_POLICY,
    getBookingPolicy,
    setRuntimeBookingPolicy,
    normalizeBookingPolicy,
    LAYOUT,
    dirToPanUV,
    rowOrdinalArabic,
    buildTheaterSeats,
    formatSeatShort,
    getSeatById,
    isGuestPolicySeat,
    isStudentPolicySeat,
    isCompanionPolicySeat,
    getDefaultGuestSeatIds,
    getStudentBookingPool,
    getCompanionBookingPool,
    getGuestBookingPool,
    countSeatsInPolicy,
  };
})(typeof window !== "undefined" ? window : globalThis);
