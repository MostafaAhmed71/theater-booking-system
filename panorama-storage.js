/**
 * معاينة المقاعد: Supabase (مشترك بين المتصفحات) + نسخة محلية احتياطية.
 */
(function (global) {
  "use strict";

  const LS_KEY = "threa.seatPanoramaPins.v1";
  const TABLE = "threa_seat_pins";

  /**
   * @typedef {{ panU: number, panV: number, savedAt?: string, note?: string }} PanoramaPin
   */

  /** @type {Record<string, PanoramaPin>} */
  let cache = {};
  /** @type {'cloud' | 'local'} */
  let backend = "local";
  /** @type {string | null} */
  let lastSyncError = null;
  /** @type {boolean} */
  let firestoreReachable = false;

  /** @type {(value?: void) => void} */
  let readyResolve;
  const readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function safeParse(json) {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }

  function normalizePin(p) {
    if (!p || typeof p.panU !== "number" || typeof p.panV !== "number") return null;
    return {
      panU: clamp01(p.panU),
      panV: clamp01(p.panV),
      savedAt: p.savedAt || "",
      note: p.note || "",
    };
  }

  function loadDocumentFromLocal() {
    const raw = global.localStorage.getItem(LS_KEY);
    if (!raw) return { version: 1, seats: {} };
    const doc = safeParse(raw);
    if (!doc || typeof doc !== "object" || typeof doc.seats !== "object") {
      return { version: 1, seats: {} };
    }
    return { version: doc.version || 1, seats: doc.seats };
  }

  function persistLocalFromCache() {
    const doc = {
      version: 1,
      seats: cache,
      updatedAt: new Date().toISOString(),
    };
    global.localStorage.setItem(LS_KEY, JSON.stringify(doc));
  }

  function hydrateCacheFromLocal() {
    const doc = loadDocumentFromLocal();
    cache = {};
    for (const [id, p] of Object.entries(doc.seats)) {
      const n = normalizePin(p);
      if (n) cache[id] = n;
    }
  }

  function getClient() {
    return global.ThreaFirebase && global.ThreaFirebase.db;
  }

  function pinsTableName() {
    return (
      (global.ThreaFirebase && global.ThreaFirebase.PINS_COLLECTION) || TABLE
    );
  }

  function canUseCloud() {
    return !!getClient();
  }

  function formatCloudError(err) {
    const code = err && err.code ? String(err.code) : "";
    const msg = err && err.message ? String(err.message) : String(err);
    if (code === "permission-denied" || code === "42501" || /row-level security/i.test(msg)) {
      return "رفض Supabase الطلب — نفّذ supabase/schema.sql وفعّل سياسات RLS.";
    }
    if (/offline|fetch/i.test(msg)) {
      return "Supabase غير متاح حالياً. تحقق من الاتصال بالإنترنت.";
    }
    return msg || "خطأ غير معروف في Supabase";
  }

  /**
   * @param {Record<string, unknown>} row
   */
  function pinFromRow(row) {
    return normalizePin({
      panU: row.pan_u,
      panV: row.pan_v,
      savedAt: row.saved_at,
      note: row.note,
    });
  }

  /**
   * @param {string} seatId
   * @param {PanoramaPin} pin
   */
  function pinToRow(seatId, pin) {
    return {
      seat_id: seatId,
      pan_u: pin.panU,
      pan_v: pin.panV,
      saved_at: pin.savedAt || new Date().toISOString(),
      note: pin.note || "",
    };
  }

  async function waitForFirebase() {
    if (global.ThreaFirebase && global.ThreaFirebase.ready) {
      try {
        await global.ThreaFirebase.ready;
        return canUseCloud();
      } catch (err) {
        console.error("ThreaFirebase.ready:", err);
        lastSyncError = "فشل تحميل Supabase";
        return false;
      }
    }
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (canUseCloud()) return true;
      await new Promise((r) => global.setTimeout(r, 50));
    }
    lastSyncError = "انتهت مهلة انتظار Supabase — افتح الموقع عبر خادم (http) وليس file://";
    return false;
  }

  /**
   * استبدال الذاكرة المحلية بما في Supabase (مصدر الحقيقة).
   * @param {Record<string, PanoramaPin>} remote
   */
  function applyRemoteAsCache(remote) {
    cache = { ...remote };
    persistLocalFromCache();
    firestoreReachable = true;
    backend = "cloud";
    lastSyncError = null;
  }

  async function pullFromCloud() {
    const client = getClient();
    if (!client) return false;

    const { data, error } = await client.from(pinsTableName()).select("*");
    if (error) throw error;
    const remote = {};
    for (const row of data || []) {
      const n = pinFromRow(row);
      if (n && row.seat_id) remote[String(row.seat_id)] = n;
    }

    if (Object.keys(remote).length === 0) {
      const localDoc = loadDocumentFromLocal();
      const localCount = Object.keys(localDoc.seats || {}).length;
      if (localCount > 0) {
        hydrateCacheFromLocal();
        backend = "local";
        firestoreReachable = false;
        lastSyncError =
          "Supabase لا يحتوي معايرة مقاعد — تُستخدم النسخة المحلية. نفّذ supabase/import-seat-pins.sql.";
        console.warn("ThreaPanoramaStorage:", lastSyncError);
        return true;
      }
    }

    applyRemoteAsCache(remote);
    return true;
  }

  async function pushCacheToCloud() {
    const client = getClient();
    if (!client) return;

    const entries = Object.entries(cache);
    if (!entries.length) return;

    const rows = entries.map(([seatId, pin]) => pinToRow(seatId, pin));
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await client
        .from(pinsTableName())
        .upsert(rows.slice(i, i + CHUNK));
      if (error) throw error;
    }

    const { data, error: selErr } = await client
      .from(pinsTableName())
      .select("seat_id");
    if (selErr) throw selErr;
    const stale = (data || [])
      .map((r) => String(r.seat_id))
      .filter((id) => !cache[id]);
    for (const id of stale) {
      const { error } = await client.from(pinsTableName()).delete().eq("seat_id", id);
      if (error) throw error;
    }

    firestoreReachable = true;
    backend = "cloud";
    lastSyncError = null;
  }

  async function writePinToCloud(seatId, pin) {
    if (!canUseCloud()) {
      throw new Error("Supabase غير متصل");
    }
    const client = getClient();
    const { error } = await client.from(pinsTableName()).upsert(pinToRow(seatId, pin));
    if (error) throw error;
    firestoreReachable = true;
    backend = "cloud";
    lastSyncError = null;
  }

  async function deletePinFromCloud(seatId) {
    if (!canUseCloud()) return;
    const client = getClient();
    await client.from(pinsTableName()).delete().eq("seat_id", seatId);
  }

  async function clearCloudTable() {
    if (!canUseCloud()) return;
    const client = getClient();
    const { error } = await client
      .from(pinsTableName())
      .delete()
      .not("seat_id", "is", null);
    if (error) throw error;
  }

  async function bootstrap() {
    const ok = await waitForFirebase();
    if (!ok) {
      hydrateCacheFromLocal();
      backend = "local";
      console.warn("ThreaPanoramaStorage:", lastSyncError);
      return;
    }

    try {
      await pullFromCloud();
    } catch (err) {
      lastSyncError = formatCloudError(err);
      console.error("ThreaPanoramaStorage sync:", err);
      hydrateCacheFromLocal();
      backend = "local";
      firestoreReachable = false;
    }
  }

  bootstrap()
    .catch((err) => {
      lastSyncError = formatCloudError(err);
      console.error("ThreaPanoramaStorage bootstrap:", err);
    })
    .finally(() => {
      readyResolve();
    });

  function loadMap() {
    return { ...cache };
  }

  function loadDocument() {
    return {
      version: 1,
      seats: loadMap(),
      updatedAt: new Date().toISOString(),
    };
  }

  function getPin(seatId) {
    const p = cache[seatId];
    return p ? { ...p } : null;
  }

  function hasCalibratedPin(seatId) {
    return !!cache[String(seatId || "").trim()];
  }

  /**
   * مقاعد لها إحداثيات محفوظة على البانوراما فقط — تظهر للحجز.
   * @param {Array<{ id: string }>} seats
   */
  function filterCalibratedSeats(seats) {
    if (!Array.isArray(seats)) return [];
    return seats.filter((s) => s && s.id && hasCalibratedPin(s.id));
  }

  /**
   * @param {string} seatId
   * @param {number} panU
   * @param {number} panV
   * @param {string} [note]
   * @returns {Promise<void>}
   */
  async function setPin(seatId, panU, panV, note) {
    const pin = {
      panU: clamp01(panU),
      panV: clamp01(panV),
      savedAt: new Date().toISOString(),
      note: note || "",
    };
    cache[seatId] = pin;
    persistLocalFromCache();

    if (!canUseCloud()) {
      await waitForFirebase();
    }
    if (!canUseCloud()) {
      throw new Error(lastSyncError || "Supabase غير متصل");
    }

    try {
      await writePinToCloud(seatId, pin);
    } catch (err) {
      lastSyncError = formatCloudError(err);
      throw err;
    }
  }

  /**
   * @param {string} seatId
   * @returns {Promise<void>}
   */
  async function removePin(seatId) {
    delete cache[seatId];
    persistLocalFromCache();
    if (canUseCloud()) {
      try {
        await deletePinFromCloud(seatId);
      } catch (err) {
        lastSyncError = formatCloudError(err);
        throw err;
      }
    }
  }

  async function clearAll() {
    cache = {};
    persistLocalFromCache();
    if (canUseCloud()) {
      await clearCloudTable();
    }
  }

  function exportJson() {
    return JSON.stringify(loadDocument(), null, 2);
  }

  async function importJson(jsonString) {
    const o = safeParse(jsonString);
    if (!o || typeof o.seats !== "object") throw new Error("Invalid JSON");
    cache = {};
    for (const [id, p] of Object.entries(o.seats)) {
      const n = normalizePin(p);
      if (n) cache[id] = n;
    }
    persistLocalFromCache();
    if (canUseCloud()) {
      await pushCacheToCloud();
    }
  }

  function getDisplayPinForSeat(seat) {
    const cal = getPin(seat.id);
    if (cal) {
      return {
        panU: cal.panU,
        panV: cal.panV,
        source: firestoreReachable ? "cloud" : "localStorage",
        calibrated: true,
      };
    }
    return {
      panU: seat.panU,
      panV: 1 - seat.panV,
      source: "model",
      calibrated: false,
    };
  }

  function getBackend() {
    return backend;
  }

  function getSyncStatus() {
    return {
      backend,
      firestoreReachable,
      lastSyncError,
      pinCount: Object.keys(cache).length,
    };
  }

  async function refreshFromCloud() {
    if (!canUseCloud()) await waitForFirebase();
    if (!canUseCloud()) throw new Error(lastSyncError || "Supabase غير متصل");
    await pullFromCloud();
  }

  /** مسح النسخة المحلية القديمة في المتصفح ثم إعادة التحميل من Supabase */
  async function resetLocalAndPullFromCloud() {
    try {
      global.localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
    cache = {};
    return refreshFromCloud();
  }

  global.ThreaPanoramaStorage = {
    LS_KEY,
    COLLECTION: TABLE,
    ready: readyPromise,
    loadMap,
    getPin,
    hasCalibratedPin,
    filterCalibratedSeats,
    setPin,
    removePin,
    clearAll,
    exportJson,
    importJson,
    getDisplayPinForSeat,
    loadDocument,
    getBackend,
    getSyncStatus,
    refreshFromCloud,
    resetLocalAndPullFromCloud,
  };
})(typeof window !== "undefined" ? window : globalThis);
