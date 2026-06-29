/**
 * قائمة انتظار عند امتلاء المقاعد — إشعار واتساب عند توفر مقعد.
 */
(function (global) {
  "use strict";

  const TABLE = "threa_waitlist";

  /** @typedef {{ id: string, nationalId: string, studentName: string, companionName: string, whatsappPhone: string, hasCompanion: boolean, status: string, createdAt: string, notifiedAt?: string, note?: string }} WaitEntry */

  /** @type {Map<string, WaitEntry>} */
  const byNational = new Map();

  let readyResolve;
  const ready = new Promise((r) => {
    readyResolve = r;
  });

  function getClient() {
    return global.ThreaFirebase && global.ThreaFirebase.db;
  }

  function guestKey(nationalId) {
    const api = global.ThreaGuestAssignments;
    if (api && typeof api.guestKeyFromNationalId === "function") {
      return api.guestKeyFromNationalId(nationalId);
    }
    return String(nationalId || "").replace(/\D/g, "");
  }

  function rowToEntry(row) {
    return {
      id: String(row.id),
      nationalId: String(row.national_id || ""),
      studentName: String(row.student_name || ""),
      companionName: String(row.companion_name || ""),
      whatsappPhone: String(row.whatsapp_phone || ""),
      hasCompanion: !!row.has_companion,
      status: String(row.status || "waiting"),
      createdAt: row.created_at || new Date().toISOString(),
      notifiedAt: row.notified_at || undefined,
      note: row.note || "",
    };
  }

  function entryToRow(entry) {
    return {
      id: entry.id,
      national_id: entry.nationalId,
      student_name: entry.studentName,
      companion_name: entry.companionName || "",
      whatsapp_phone: entry.whatsappPhone || "",
      has_companion: !!entry.hasCompanion,
      status: entry.status,
      created_at: entry.createdAt,
      notified_at: entry.notifiedAt || null,
      note: entry.note || "",
    };
  }

  function applyRows(rows) {
    byNational.clear();
    for (const row of rows || []) {
      if (!row || !row.national_id) continue;
      const e = rowToEntry(row);
      byNational.set(guestKey(e.nationalId), e);
    }
  }

  async function pullAll() {
    const client = getClient();
    if (!client) return false;
    const { data, error } = await client.from(TABLE).select("*").order("created_at");
    if (error) {
      console.error("waitlist pull:", error);
      return false;
    }
    applyRows(data);
    return true;
  }

  /**
   * @param {{
   *   nationalId: string,
   *   studentName: string,
   *   companionName?: string,
   *   whatsappPhone: string,
   *   hasCompanion?: boolean
   * }} profile
   */
  async function addToWaitlist(profile) {
    await ready;
    const key = guestKey(profile.nationalId);
    if (!key) throw new Error("رقم الهوية غير صالح.");
    if (byNational.has(key) && byNational.get(key).status === "waiting") {
      return byNational.get(key);
    }
    const entry = {
      id: `wl_${key}`,
      nationalId: key,
      studentName: String(profile.studentName || "").trim(),
      companionName: String(profile.companionName || "").trim(),
      whatsappPhone: String(profile.whatsappPhone || "").trim(),
      hasCompanion: !!profile.hasCompanion,
      status: "waiting",
      createdAt: new Date().toISOString(),
      note: "",
    };
    const client = getClient();
    if (!client) throw new Error("قاعدة البيانات غير متصلة.");
    const { error } = await client.from(TABLE).upsert(entryToRow(entry));
    if (error) throw error;
    byNational.set(key, entry);
    return { ...entry };
  }

  function listWaiting() {
    return [...byNational.values()]
      .filter((e) => e.status === "waiting")
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  function countAvailableSeats() {
    const seatsApi = global.ThreaSeats;
    const ga = global.ThreaGuestAssignments;
    const total =
      seatsApi && Array.isArray(seatsApi.SEATS) ? seatsApi.SEATS.length : 0;
    const occupied =
      ga && typeof ga.getOccupiedSeatIds === "function"
        ? ga.getOccupiedSeatIds().size
        : 0;
    return Math.max(0, total - occupied);
  }

  function normalizeWhatsAppPhone(phone) {
    let p = String(phone || "").replace(/\D/g, "");
    if (p.startsWith("0")) p = "966" + p.slice(1);
    if (p.length === 9 && p.startsWith("5")) p = "966" + p;
    return p;
  }

  function getWhatsAppApiBase() {
    return (
      (global.THREA_APP_CONFIG && global.THREA_APP_CONFIG.whatsappApiBase) ||
      "https://wpp.northelite0.com"
    ).replace(/\/$/, "");
  }

  async function fetchWhatsAppConnected() {
    try {
      const base = getWhatsAppApiBase();
      const res = await fetch(`${base}/status`, { cache: "no-store" });
      if (!res.ok) return false;
      const data = await res.json();
      return !!(data && (data.connected || data.state === "CONNECTED"));
    } catch {
      return false;
    }
  }

  /**
   * @param {WaitEntry} entry
   */
  async function sendWaitlistWhatsApp(entry) {
    const phone = normalizeWhatsAppPhone(entry.whatsappPhone);
    if (!phone || phone.length < 10) {
      throw new Error("رقم واتساب غير صالح.");
    }
    const cfg = global.THREA_APP_CONFIG || {};
    const bookingUrl =
      global.ThreaLinks && global.ThreaLinks.buildBookingUrl
        ? global.ThreaLinks.buildBookingUrl()
        : `${global.location.origin}/index.html`;
    const lines = [
      `🎓 *${cfg.schoolName || "ثانوية نخبة الشمال"}*`,
      "",
      `مرحباً *${entry.studentName}*،`,
      "",
      "أصبح *مقعد متاحاً* لحفل التخرّج. سارع بالحجز من الرابط:",
      "",
      bookingUrl,
      "",
      "إن لم تعد ترغب بالحضور تجاهل هذه الرسالة.",
    ];
    const connected = await fetchWhatsAppConnected();
    if (!connected) {
      throw new Error("خادم واتساب غير متصل.");
    }
    const res = await fetch(`${getWhatsAppApiBase()}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message: lines.join("\n") }),
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
  }

  /**
   * @param {WaitEntry} entry
   */
  async function markNotified(entry) {
    const updated = {
      ...entry,
      status: "notified",
      notifiedAt: new Date().toISOString(),
    };
    const client = getClient();
    if (client) {
      await client.from(TABLE).upsert(entryToRow(updated));
    }
    byNational.set(guestKey(entry.nationalId), updated);
    return updated;
  }

  /** إشعار أول شخص في الانتظار عند توفر مقعد واحد على الأقل */
  async function processAvailableSeats() {
    await ready;
    const ga = global.ThreaGuestAssignments;
    if (ga && ga.ready) await ga.ready;
    const need = countAvailableSeats();
    if (need < 1) return { notified: 0 };
    const waiting = listWaiting();
    if (!waiting.length) return { notified: 0 };
    let notified = 0;
    for (const entry of waiting) {
      if (countAvailableSeats() < 1) break;
      try {
        await sendWaitlistWhatsApp(entry);
        await markNotified(entry);
        notified += 1;
      } catch (e) {
        console.warn("waitlist notify:", e);
        break;
      }
    }
    return { notified };
  }

  function getStats() {
    const all = [...byNational.values()];
    return {
      waiting: all.filter((e) => e.status === "waiting").length,
      notified: all.filter((e) => e.status === "notified").length,
      total: all.length,
      entries: all,
    };
  }

  async function bootstrap() {
    if (global.ThreaFirebase && global.ThreaFirebase.ready) {
      try {
        await global.ThreaFirebase.ready;
      } catch {
        /* ignore */
      }
    }
    await pullAll();
    readyResolve();
  }

  bootstrap();

  global.ThreaWaitlist = {
    ready,
    addToWaitlist,
    listWaiting,
    processAvailableSeats,
    countAvailableSeats,
    getStats,
    pullAll,
  };
})(typeof window !== "undefined" ? window : globalThis);
