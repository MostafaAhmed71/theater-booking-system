/**
 * رمز دعوة موحّد: 4 أرقام فقط (مثل 0347).
 * يُستخدم في QR وواتساب والكشك — للخريجين والضيوف.
 * الرموز القديمة (حرف + 3 أرقام مثل K347) تُحوَّل تلقائياً إلى 0347 عند القراءة.
 */
(function (global) {
  "use strict";

  const INVITE_CODE_LEN = 4;

  /** @param {string} v */
  function normalizeInviteCode(v) {
    const raw = String(v || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (!raw) return "";

    const legacy = raw.match(/^([A-Z])(\d{1,3})$/);
    if (legacy) {
      const n = parseInt(legacy[2], 10);
      if (!Number.isFinite(n) || n < 0 || n > 999) return "";
      return String(n).padStart(INVITE_CODE_LEN, "0");
    }

    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length > INVITE_CODE_LEN) return "";
    return digits.padStart(INVITE_CODE_LEN, "0");
  }

  /** @param {string} v */
  function isInviteCode(v) {
    return !!normalizeInviteCode(v);
  }

  /**
   * @param {Set<string>} used
   * @returns {string}
   */
  function generateInviteCode(used) {
    const taken = used instanceof Set ? used : new Set();
    for (let attempt = 0; attempt < 5000; attempt++) {
      const n = Math.floor(Math.random() * 10000);
      const code = String(n).padStart(INVITE_CODE_LEN, "0");
      if (!taken.has(code)) return code;
    }
    throw new Error("تعذّر توليد رمز دعوة فريد — تواصل مع المشرف.");
  }

  /**
   * جزء QR أو إدخال يدوي → رمز دعوة أو معرّف قديم (هوية / GUEST-).
   * @param {string} part
   */
  function parseQrLookupPart(part) {
    const raw = String(part || "").trim();
    const code = normalizeInviteCode(raw);
    if (code) return { type: "invite", inviteCode: code, value: code };
    if (/^GUEST-/i.test(raw)) {
      return { type: "guest", inviteCode: "", value: raw.toUpperCase().slice(0, 32) };
    }
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10) {
      return { type: "national", inviteCode: "", value: digits };
    }
    return { type: "unknown", inviteCode: "", value: raw };
  }

  global.ThreaInviteCodes = {
    INVITE_CODE_LEN,
    normalizeInviteCode,
    isInviteCode,
    generateInviteCode,
    parseQrLookupPart,
  };
})(typeof window !== "undefined" ? window : globalThis);
