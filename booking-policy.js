/**
 * معايير الحجز (خريج / مرافق / ضيف) — تُحمَّل من Supabase عبر guest-quota.
 */
(function (global) {
  "use strict";

  function seatsApi() {
    return global.ThreaSeats;
  }

  function applyPolicy(policy) {
    const api = seatsApi();
    if (!api || typeof api.setRuntimeBookingPolicy !== "function") return;
    api.setRuntimeBookingPolicy(policy || null);
  }

  function getPolicy() {
    const api = seatsApi();
    if (api && typeof api.getBookingPolicy === "function") {
      return api.getBookingPolicy();
    }
    return api && api.DEFAULT_BOOKING_POLICY ? api.DEFAULT_BOOKING_POLICY : null;
  }

  function normalize(raw) {
    const api = seatsApi();
    if (api && typeof api.normalizeBookingPolicy === "function") {
      return api.normalizeBookingPolicy(raw);
    }
    return raw;
  }

  function getDefaults() {
    const api = seatsApi();
    return api && api.DEFAULT_BOOKING_POLICY
      ? api.normalizeBookingPolicy(api.DEFAULT_BOOKING_POLICY)
      : null;
  }

  function countPreview() {
    const api = seatsApi();
    if (!api || typeof api.countSeatsInPolicy !== "function") {
      return { total: 0, guest: 0, student: 0, companion: 0, bridge: 0 };
    }
    return api.countSeatsInPolicy();
  }

  /**
   * @param {HTMLFormElement | null} form
   */
  function readFromForm(form) {
    if (!form) return getDefaults();
    const guestRowsRaw = String(
      form.elements.namedItem("guestRows")?.value || ""
    ).trim();
    const guestRows = guestRowsRaw
      .split(/[,،\s]+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n));

    return normalize({
      studentSection: "LEFT",
      studentRowMin: form.elements.namedItem("studentRowMin")?.value,
      studentRowMax: form.elements.namedItem("studentRowMax")?.value,
      companionSection: "RIGHT",
      companionRowMin: form.elements.namedItem("companionRowMin")?.value,
      companionRowMax: form.elements.namedItem("companionRowMax")?.value,
      guestRowFirstMinSeat: form.elements.namedItem("guestRowFirstMinSeat")?.value,
      guestRows,
      guestIncludeBridge: !!form.elements.namedItem("guestIncludeBridge")?.checked,
    });
  }

  /**
   * @param {typeof import('./seats-data.js').DEFAULT_BOOKING_POLICY} policy
   * @param {HTMLFormElement | null} form
   */
  function writeToForm(policy, form) {
    if (!form || !policy) return;
    const set = (name, val) => {
      const el = form.elements.namedItem(name);
      if (el && "value" in el) el.value = String(val);
    };
    set("studentRowMin", policy.studentRowMin);
    set("studentRowMax", policy.studentRowMax);
    set("companionRowMin", policy.companionRowMin);
    set("companionRowMax", policy.companionRowMax);
    set("guestRowFirstMinSeat", policy.guestRowFirstMinSeat);
    set("guestRows", (policy.guestRows || []).join(", "));
    const bridgeCb = form.elements.namedItem("guestIncludeBridge");
    if (bridgeCb && "checked" in bridgeCb) {
      bridgeCb.checked = !!policy.guestIncludeBridge;
    }
  }

  function describePolicy(policy) {
    const p = policy || getPolicy();
    if (!p) return "";
    const guestRows = (p.guestRows || []).join("، ");
    return [
      `خريجون: ${p.studentSection === "LEFT" ? "يسار" : p.studentSection} صفوف ${p.studentRowMin}–${p.studentRowMax}`,
      `مرافقون: ${p.companionSection === "RIGHT" ? "يمين" : p.companionSection} صفوف ${p.companionRowMin}–${p.companionRowMax}`,
      `ضيوف: صفوف ${guestRows}${p.guestRows && p.guestRows.includes(1) ? ` (الصف 1 من مقعد ${p.guestRowFirstMinSeat})` : ""}${p.guestIncludeBridge ? " + قاعدة وسط" : ""}`,
    ].join(" · ");
  }

  global.ThreaBookingPolicy = {
    applyPolicy,
    getPolicy,
    normalize,
    getDefaults,
    countPreview,
    readFromForm,
    writeToForm,
    describePolicy,
  };
})(typeof window !== "undefined" ? window : globalThis);
