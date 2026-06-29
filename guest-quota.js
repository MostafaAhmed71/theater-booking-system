/**
 * إعدادات ضيوف المراسم: حدّ العدد + قائمة مقاعد مخصّصة — Supabase + threa-config.js
 */
(function (global) {
  "use strict";

  const TABLE = "threa_event_config";
  const DOC_ID = "default";
  const LS_KEY = "threa.eventConfig.v1";

  /** @type {{
   *   ceremonyGuestSeatQuota: number,
   *   ceremonyGuestSeatIds: string[],
   *   ceremonyStudentSeatIds: string[],
   *   ceremonyCompanionSeatIds: string[],
   *   bookingPolicy?: object | null,
   *   panoramaEntrance?: { panU: number, panV: number } | null,
   *   updatedAt?: string
   * }} */
  let config = {
    ceremonyGuestSeatQuota: 70,
    ceremonyGuestSeatIds: [],
    ceremonyStudentSeatIds: [],
    ceremonyCompanionSeatIds: [],
    bookingPolicy: null,
    panoramaEntrance: null,
  };

  const DEFAULT_ENTRANCE = { panU: 0.5, panV: 0.94 };
  let firestoreOk = false;
  let lastError = null;

  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  const GUEST_SEAT_CAP_MAX = 70;

  function defaultQuota() {
    const cfg = global.THREA_APP_CONFIG;
    const n = cfg && cfg.ceremonyGuestSeatQuota;
    if (typeof n === "number" && n >= 0) {
      return Math.min(GUEST_SEAT_CAP_MAX, Math.floor(n));
    }
    return GUEST_SEAT_CAP_MAX;
  }

  function defaultStudentCompanionCap() {
    const cfg = global.THREA_APP_CONFIG;
    const n = cfg && cfg.studentCompanionSeatCap;
    if (typeof n === "number" && n >= 0) return Math.floor(n);
    return 142;
  }

  function getStudentCompanionCap() {
    return defaultStudentCompanionCap();
  }

  /**
   * @param {unknown} raw
   * @returns {{ panU: number, panV: number } | null}
   */
  function normalizeEntrance(raw) {
    if (!raw || typeof raw !== "object") return null;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const u = Number(o.panU ?? o.pan_u);
    const v = Number(o.panV ?? o.pan_v);
    if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
    return {
      panU: Math.max(0, Math.min(1, u)),
      panV: Math.max(0, Math.min(1, v)),
    };
  }

  function clampQuota(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.min(v, GUEST_SEAT_CAP_MAX);
  }

  function clampGuestQuota(n) {
    return clampQuota(n);
  }

  function validSeatIdSet() {
    const api = global.ThreaSeats;
    const list = api && api.SEATS ? api.SEATS : [];
    return new Set(list.map((s) => s.id));
  }

  /**
   * @param {unknown} ids
   * @returns {string[]}
   */
  function normalizeSeatIds(ids) {
    const valid = validSeatIdSet();
    if (!valid.size) {
      return Array.isArray(ids)
        ? ids.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
    }
    const out = [];
    const seen = new Set();
    if (!Array.isArray(ids)) return out;
    for (const raw of ids) {
      const id = String(raw || "").trim();
      if (!id || !valid.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function loadLocal() {
    try {
      const raw = global.localStorage.getItem(LS_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o && typeof o.ceremonyGuestSeatQuota === "number") {
        config.ceremonyGuestSeatQuota = clampQuota(o.ceremonyGuestSeatQuota);
      }
      if (o && Array.isArray(o.ceremonyGuestSeatIds)) {
        config.ceremonyGuestSeatIds = normalizeSeatIds(o.ceremonyGuestSeatIds);
      }
      if (o && Array.isArray(o.ceremonyStudentSeatIds)) {
        config.ceremonyStudentSeatIds = normalizeSeatIds(o.ceremonyStudentSeatIds);
      }
      if (o && Array.isArray(o.ceremonyCompanionSeatIds)) {
        config.ceremonyCompanionSeatIds = normalizeSeatIds(o.ceremonyCompanionSeatIds);
      }
      if (o && o.panoramaEntrance) {
        const ent = normalizeEntrance(o.panoramaEntrance);
        if (ent) config.panoramaEntrance = ent;
      }
    } catch {
      /* ignore */
    }
  }

  function saveLocal() {
    try {
      global.localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          ceremonyGuestSeatQuota: config.ceremonyGuestSeatQuota,
          ceremonyGuestSeatIds: config.ceremonyGuestSeatIds,
          ceremonyStudentSeatIds: config.ceremonyStudentSeatIds,
          ceremonyCompanionSeatIds: config.ceremonyCompanionSeatIds,
          panoramaEntrance: config.panoramaEntrance,
          updatedAt: config.updatedAt,
        })
      );
    } catch (e) {
      console.warn("guest-quota local save", e);
    }
  }

  function getClient() {
    return global.ThreaFirebase && global.ThreaFirebase.db;
  }

  function tableName() {
    return (
      (global.ThreaFirebase && global.ThreaFirebase.EVENT_CONFIG_TABLE) || TABLE
    );
  }

  function configDocId() {
    return (
      (global.ThreaFirebase && global.ThreaFirebase.EVENT_CONFIG_DOC_ID) ||
      DOC_ID
    );
  }

  async function waitForFirebase() {
    if (global.ThreaFirebase && global.ThreaFirebase.ready) {
      try {
        await global.ThreaFirebase.ready;
        return !!getClient();
      } catch {
        return false;
      }
    }
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (getClient()) return true;
      await new Promise((r) => global.setTimeout(r, 50));
    }
    return false;
  }

  function applyBookingPolicyFromRemote(raw) {
    const bp = global.ThreaBookingPolicy;
    const seats = global.ThreaSeats;
    if (!raw) {
      config.bookingPolicy = null;
      if (bp && typeof bp.applyPolicy === "function") bp.applyPolicy(null);
      return;
    }
    const normalized =
      seats && typeof seats.normalizeBookingPolicy === "function"
        ? seats.normalizeBookingPolicy(raw)
        : raw;
    config.bookingPolicy = normalized;
    if (bp && typeof bp.applyPolicy === "function") {
      bp.applyPolicy(normalized);
    }
  }

  function applyRemoteData(data) {
    if (!data || typeof data !== "object") return;
    const quota =
      data.ceremony_guest_seat_quota ?? data.ceremonyGuestSeatQuota;
    const ids = data.ceremony_guest_seat_ids ?? data.ceremonyGuestSeatIds;
    const updated = data.updated_at ?? data.updatedAt;
    const policy = data.booking_policy ?? data.bookingPolicy;
    if (typeof quota === "number") {
      let q = clampQuota(quota);
      if (q === 30 && defaultQuota() === 70) q = 70;
      config.ceremonyGuestSeatQuota = q;
    }
    if (Array.isArray(ids)) {
      config.ceremonyGuestSeatIds = normalizeSeatIds(ids);
    }
    const studentIds =
      data.student_seat_ids ?? data.ceremonyStudentSeatIds ?? data.studentSeatIds;
    const companionIds =
      data.companion_seat_ids ??
      data.ceremonyCompanionSeatIds ??
      data.companionSeatIds;
    if (Array.isArray(studentIds)) {
      config.ceremonyStudentSeatIds = normalizeSeatIds(studentIds);
    }
    if (Array.isArray(companionIds)) {
      config.ceremonyCompanionSeatIds = normalizeSeatIds(companionIds);
    }
    if (policy && typeof policy === "object") {
      applyBookingPolicyFromRemote(policy);
    }
    const entrance = data.panorama_entrance ?? data.panoramaEntrance;
    if (entrance) {
      const ent = normalizeEntrance(entrance);
      if (ent) config.panoramaEntrance = ent;
    }
    if (typeof updated === "string") {
      config.updatedAt = updated;
    }
  }

  async function persistConfig() {
    config.updatedAt = new Date().toISOString();
    saveLocal();
    const client = getClient();
    if (!client) throw new Error(lastError || "Supabase غير متصل");
    const row = {
      id: configDocId(),
      ceremony_guest_seat_quota: config.ceremonyGuestSeatQuota,
      ceremony_guest_seat_ids: config.ceremonyGuestSeatIds,
      student_seat_ids: config.ceremonyStudentSeatIds,
      companion_seat_ids: config.ceremonyCompanionSeatIds,
      updated_at: config.updatedAt,
    };
    if (config.bookingPolicy) {
      row.booking_policy = config.bookingPolicy;
    }
    if (config.panoramaEntrance) {
      row.panorama_entrance = config.panoramaEntrance;
    }
    const { error } = await client.from(tableName()).upsert(row);
    if (error) throw error;
    firestoreOk = true;
    lastError = null;
  }

  function policyPool(kind, allSeats) {
    const api = global.ThreaSeats;
    if (!api || !Array.isArray(allSeats)) return [];
    if (kind === "student" && typeof api.getStudentBookingPool === "function") {
      return api.getStudentBookingPool(allSeats);
    }
    if (kind === "companion" && typeof api.getCompanionBookingPool === "function") {
      return api.getCompanionBookingPool(allSeats);
    }
    if (kind === "guest" && typeof api.getDefaultGuestSeatIds === "function") {
      const ids = new Set(api.getDefaultGuestSeatIds());
      return allSeats.filter((s) => ids.has(s.id));
    }
    return [];
  }

  /**
   * @param {string[]} ids
   * @param {Array<{ id: string }>} allSeats
   */
  function poolFromSavedIds(ids, allSeats) {
    if (!ids.length || !Array.isArray(allSeats)) return [];
    const set = new Set(ids);
    return allSeats.filter((s) => set.has(s.id));
  }

  function seedDefaultStudentCompanionIfNeeded() {
    const api = global.ThreaSeats;
    if (!api || !api.SEATS) return;
    const all = api.SEATS;
    if (!config.ceremonyStudentSeatIds.length) {
      config.ceremonyStudentSeatIds = normalizeSeatIds(
        policyPool("student", all).map((s) => s.id)
      );
    }
    if (!config.ceremonyCompanionSeatIds.length) {
      config.ceremonyCompanionSeatIds = normalizeSeatIds(
        policyPool("companion", all).map((s) => s.id)
      );
    }
  }

  function seedDefaultGuestSeatsIfNeeded() {
    const api = global.ThreaSeats;
    if (!api || typeof api.getDefaultGuestSeatIds !== "function") return;
    const defaults = api.getDefaultGuestSeatIds();
    if (!defaults.length) return;
    const current = config.ceremonyGuestSeatIds || [];
    if (current.length === 0) {
      config.ceremonyGuestSeatIds = normalizeSeatIds(defaults);
      if (config.ceremonyGuestSeatQuota < defaults.length) {
        config.ceremonyGuestSeatQuota = clampQuota(defaults.length);
      }
      return;
    }
    if (
      current.length !== defaults.length &&
      (current.length < 10 || current.length < defaults.length - 5)
    ) {
      config.ceremonyGuestSeatIds = normalizeSeatIds(defaults);
      config.ceremonyGuestSeatQuota = clampQuota(
        Math.max(defaultQuota(), defaults.length)
      );
    }
  }

  async function pullFromFirestore() {
    const client = getClient();
    if (!client) return false;
    try {
      const { data, error } = await client
        .from(tableName())
        .select("*")
        .eq("id", configDocId())
        .maybeSingle();
      if (error) throw error;
      if (data) {
        applyRemoteData(data);
        if (!data.booking_policy && !data.bookingPolicy) {
          applyBookingPolicyFromRemote(null);
        }
        const quota =
          data.ceremony_guest_seat_quota ?? data.ceremonyGuestSeatQuota;
        if (quota === 30 && defaultQuota() === 70) {
          config.ceremonyGuestSeatQuota = 70;
          try {
            await persistConfig();
          } catch (e) {
            console.warn("guest-quota migrate 30→70", e);
          }
        }
        seedDefaultGuestSeatsIfNeeded();
        seedDefaultStudentCompanionIfNeeded();
      } else {
        seedDefaultGuestSeatsIfNeeded();
        seedDefaultStudentCompanionIfNeeded();
        try {
          await persistConfig();
        } catch (e) {
          console.warn("guest-quota seed defaults", e);
        }
      }
      firestoreOk = true;
      lastError = null;
      saveLocal();
      return true;
    } catch (err) {
      lastError = (err && err.message) || String(err);
      console.error("guest-quota pull:", err);
      return false;
    }
  }

  /**
   * @param {number} quota
   */
  async function saveQuota(quota) {
    config.ceremonyGuestSeatQuota = clampQuota(quota);
    await persistConfig();
  }

  /**
   * @param {string[]} ids
   * @param {{ syncQuota?: boolean }} [opts]
   */
  async function saveGuestSeatIds(ids, opts) {
    config.ceremonyGuestSeatIds = normalizeSeatIds(ids);
    if (opts && opts.syncQuota) {
      config.ceremonyGuestSeatQuota = clampQuota(config.ceremonyGuestSeatIds.length);
    }
    await persistConfig();
  }

  function getQuota() {
    return config.ceremonyGuestSeatQuota;
  }

  function getGuestSeatIds() {
    return [...config.ceremonyGuestSeatIds];
  }

  function getStudentSeatIds() {
    return [...config.ceremonyStudentSeatIds];
  }

  function getCompanionSeatIds() {
    return [...config.ceremonyCompanionSeatIds];
  }

  /**
   * @param {Array<{ id: string }>} allSeats
   */
  function getStudentSeatPool(allSeats) {
    if (!Array.isArray(allSeats)) return [];
    if (config.ceremonyStudentSeatIds.length) {
      return poolFromSavedIds(config.ceremonyStudentSeatIds, allSeats);
    }
    return policyPool("student", allSeats);
  }

  /**
   * @param {Array<{ id: string }>} allSeats
   */
  function getCompanionSeatPool(allSeats) {
    if (!Array.isArray(allSeats)) return [];
    if (config.ceremonyCompanionSeatIds.length) {
      return poolFromSavedIds(config.ceremonyCompanionSeatIds, allSeats);
    }
    return policyPool("companion", allSeats);
  }

  function filterCalibratedPool(pool) {
    const pano = global.ThreaPanoramaStorage;
    if (!pano || typeof pano.filterCalibratedSeats !== "function") {
      return Array.isArray(pool) ? pool : [];
    }
    return pano.filterCalibratedSeats(pool);
  }

  /**
   * مقاعد معايرة جاهزة للحجز — يُعيد المعايرة من القائمة المحفوظة أو من معايير الصفوف.
   * @param {"student" | "companion" | "guest"} kind
   * @param {Array<{ id: string }>} allSeats
   */
  function getCalibratedSeatPool(kind, allSeats) {
    if (!Array.isArray(allSeats)) return [];
    const base =
      kind === "student"
        ? getStudentSeatPool(allSeats)
        : kind === "companion"
          ? getCompanionSeatPool(allSeats)
          : getGuestSeatPool(allSeats);
    let calibrated = filterCalibratedPool(base);
    if (calibrated.length > 0) return calibrated;
    return filterCalibratedPool(policyPool(kind, allSeats));
  }

  /**
   * مقاعد محفوظة في قوائم المعايرة ولها إحداثيات بانوراما — بدون الرجوع لمعايير الصفوف.
   * @param {"student" | "companion" | "guest"} kind
   * @param {Array<{ id: string }>} allSeats
   */
  function getCalibratedSavedSeatPool(kind, allSeats) {
    if (!Array.isArray(allSeats)) return [];
    const base =
      kind === "student"
        ? getStudentSeatPool(allSeats)
        : kind === "companion"
          ? getCompanionSeatPool(allSeats)
          : getGuestSeatPool(allSeats);
    return filterCalibratedPool(base);
  }

  /**
   * مواءمة قوائم المقاعد المحفوظة مع المعايرة الفعلية (بعد تحميل البانوراما).
   * @returns {boolean}
   */
  function alignSeatPoolsWithCalibration() {
    const pano = global.ThreaPanoramaStorage;
    const api = global.ThreaSeats;
    if (!pano || !api || !api.SEATS || typeof pano.hasCalibratedPin !== "function") {
      return false;
    }
    const pinCount =
      typeof pano.getSyncStatus === "function" ? pano.getSyncStatus().pinCount : 0;
    if (pinCount < 1) return false;

    let changed = false;
    const specs = [
      ["student", "ceremonyStudentSeatIds"],
      ["companion", "ceremonyCompanionSeatIds"],
      ["guest", "ceremonyGuestSeatIds"],
    ];
    for (const [kind, key] of specs) {
      if (kind === "guest") continue;
      const policyCal = filterCalibratedPool(policyPool(kind, api.SEATS));
      if (!policyCal.length) continue;
      const policyIds = normalizeSeatIds(policyCal.map((s) => s.id));
      const saved = config[key];
      const overlap = saved.filter((id) => pano.hasCalibratedPin(id));
      if (!overlap.length) {
        config[key] = policyIds;
        changed = true;
      }
    }
    if (changed) {
      saveLocal();
    }
    return changed;
  }

  /**
   * @param {Array<{ id: string }>} allSeats
   */
  function getGuestSeatPool(allSeats) {
    if (!Array.isArray(allSeats)) return [];
    if (config.ceremonyGuestSeatIds.length) {
      return poolFromSavedIds(config.ceremonyGuestSeatIds, allSeats);
    }
    return policyPool("guest", allSeats);
  }

  /**
   * @param {{ student?: string[], companion?: string[], guest?: string[] }} pools
   * @param {{ syncGuestQuota?: boolean }} [opts]
   */
  async function saveSeatPools(pools, opts) {
    if (pools && Array.isArray(pools.student)) {
      config.ceremonyStudentSeatIds = normalizeSeatIds(pools.student);
    }
    if (pools && Array.isArray(pools.companion)) {
      config.ceremonyCompanionSeatIds = normalizeSeatIds(pools.companion);
    }
    if (pools && Array.isArray(pools.guest)) {
      config.ceremonyGuestSeatIds = normalizeSeatIds(pools.guest);
    }
    if (opts && opts.syncGuestQuota) {
      config.ceremonyGuestSeatQuota = clampQuota(config.ceremonyGuestSeatIds.length);
    }
    await persistConfig();
    try {
      global.dispatchEvent(new CustomEvent("threa-seat-pools-reload"));
    } catch {
      /* ignore */
    }
  }

  async function saveStudentSeatIds(ids) {
    config.ceremonyStudentSeatIds = normalizeSeatIds(ids);
    await persistConfig();
    try {
      global.dispatchEvent(new CustomEvent("threa-seat-pools-reload"));
    } catch {
      /* ignore */
    }
  }

  async function saveCompanionSeatIds(ids) {
    config.ceremonyCompanionSeatIds = normalizeSeatIds(ids);
    await persistConfig();
    try {
      global.dispatchEvent(new CustomEvent("threa-seat-pools-reload"));
    } catch {
      /* ignore */
    }
  }

  /**
   * ملء المقاعد الثلاثة من معايير الصفوف الحالية.
   * @param {{ syncGuestQuota?: boolean }} [opts]
   */
  async function applyPolicyDefaultSeatPools(opts) {
    const api = global.ThreaSeats;
    if (!api || !api.SEATS) throw new Error("seats-data غير محمّل");
    await saveSeatPools(
      {
        student: policyPool("student", api.SEATS).map((s) => s.id),
        companion: policyPool("companion", api.SEATS).map((s) => s.id),
        guest: api.getDefaultGuestSeatIds(),
      },
      opts
    );
  }

  /**
   * @param {Set<string>} occupiedSeatIds
   * @param {number} ceremonyUsedCount
   */
  function getCeremonyAvailability(occupiedSeatIds, ceremonyUsedCount) {
    const pool = config.ceremonyGuestSeatIds;
    const poolSize = pool.length;
    const quota = Math.min(getQuota(), GUEST_SEAT_CAP_MAX);
    const used = Math.max(0, Math.floor(ceremonyUsedCount));
    let freeInPool = 0;
    for (const id of pool) {
      if (!occupiedSeatIds || !occupiedSeatIds.has(id)) freeInPool += 1;
    }
    const cap =
      poolSize > 0
        ? Math.min(
            GUEST_SEAT_CAP_MAX,
            quota > 0 ? quota : poolSize,
            poolSize
          )
        : Math.min(GUEST_SEAT_CAP_MAX, quota);
    const remainingByQuota = Math.max(0, cap - used);
    const remaining = poolSize > 0 ? Math.min(remainingByQuota, freeInPool) : remainingByQuota;
    return {
      poolConfigured: poolSize > 0,
      poolSize,
      quota,
      cap,
      used,
      freeInPool,
      remaining,
      allowed: poolSize > 0 ? remaining >= 1 : cap > 0 && remainingByQuota >= 1,
    };
  }

  /**
   * @param {number} ceremonyUsedCount
   * @param {number} [neededSeats]
   */
  function getStudentCompanionAvailability(ceremonyUsedCount, neededSeats) {
    const cap = getStudentCompanionCap();
    const used = Math.max(0, Math.floor(ceremonyUsedCount));
    const need = Math.max(1, Math.floor(neededSeats || 1));
    const remaining = Math.max(0, cap - used);
    return {
      cap,
      used,
      remaining,
      needed: need,
      allowed: remaining >= need,
    };
  }

  /**
   * @param {number} neededSeats
   * @param {number} usedSeats
   * @param {Set<string>} [occupiedSeatIds]
   */
  function seatsRemaining(neededSeats, usedSeats, occupiedSeatIds) {
    const stat = getCeremonyAvailability(
      occupiedSeatIds || new Set(),
      usedSeats
    );
    const need = Math.max(0, Math.floor(neededSeats));
    return {
      quota: stat.cap,
      used: stat.used,
      needed: need,
      remaining: stat.remaining,
      poolSize: stat.poolSize,
      poolConfigured: stat.poolConfigured,
      freeInPool: stat.freeInPool,
      allowed: stat.remaining >= need,
    };
  }

  function getBookingPolicy() {
    return config.bookingPolicy;
  }

  /**
   * @param {unknown} policy
   */
  function getPanoramaEntrance() {
    return config.panoramaEntrance
      ? { ...config.panoramaEntrance }
      : { ...DEFAULT_ENTRANCE };
  }

  /**
   * @param {{ panU: number, panV: number }} entrance
   */
  async function savePanoramaEntrance(entrance) {
    const n = normalizeEntrance(entrance);
    if (!n) throw new Error("إحداثيات المدخل غير صالحة");
    config.panoramaEntrance = n;
    await persistConfig();
  }

  async function saveBookingPolicy(policy) {
    const seats = global.ThreaSeats;
    config.bookingPolicy =
      seats && typeof seats.normalizeBookingPolicy === "function"
        ? seats.normalizeBookingPolicy(policy)
        : policy;
    applyBookingPolicyFromRemote(config.bookingPolicy);
    await persistConfig();
  }

  async function bootstrap() {
    config.ceremonyGuestSeatQuota = defaultQuota();
    config.ceremonyGuestSeatIds = [];
    config.ceremonyStudentSeatIds = [];
    config.ceremonyCompanionSeatIds = [];
    config.bookingPolicy = null;
    loadLocal();
    const ok = await waitForFirebase();
    if (ok) await pullFromFirestore();
    else if (!config.ceremonyGuestSeatQuota) {
      config.ceremonyGuestSeatQuota = defaultQuota();
    }
    if (!config.bookingPolicy && global.ThreaBookingPolicy) {
      global.ThreaBookingPolicy.applyPolicy(null);
    }
    config.ceremonyGuestSeatIds = normalizeSeatIds(config.ceremonyGuestSeatIds);
    config.ceremonyStudentSeatIds = normalizeSeatIds(config.ceremonyStudentSeatIds);
    config.ceremonyCompanionSeatIds = normalizeSeatIds(
      config.ceremonyCompanionSeatIds
    );
  }

  async function afterPanoramaReady() {
    const pano = global.ThreaPanoramaStorage;
    if (!pano || !pano.ready) return;
    try {
      await pano.ready;
      if (alignSeatPoolsWithCalibration()) {
        try {
          await persistConfig();
        } catch (err) {
          console.warn("guest-quota align pools persist:", err);
        }
      }
    } catch (err) {
      console.warn("guest-quota afterPanoramaReady:", err);
    }
  }

  bootstrap()
    .then(() => afterPanoramaReady())
    .finally(() => readyResolve());

  global.ThreaGuestQuota = {
    ready,
    getQuota,
    getGuestSeatIds,
    getStudentSeatIds,
    getCompanionSeatIds,
    getGuestSeatPool,
    getStudentSeatPool,
    getCompanionSeatPool,
    getCalibratedSeatPool,
    getCalibratedSavedSeatPool,
    alignSeatPoolsWithCalibration,
    getCeremonyAvailability,
    getStudentCompanionAvailability,
    getStudentCompanionCap,
    GUEST_SEAT_CAP_MAX,
    saveQuota,
    saveGuestSeatIds,
    saveStudentSeatIds,
    saveCompanionSeatIds,
    saveSeatPools,
    applyPolicyDefaultSeatPools,
    seatsRemaining,
    pullFromFirestore,
    getBookingPolicy,
    saveBookingPolicy,
    getPanoramaEntrance,
    savePanoramaEntrance,
    getStatus() {
      return {
        firestoreOk,
        lastError,
        quota: getQuota(),
        poolSize: config.ceremonyGuestSeatIds.length,
        studentPoolSize: config.ceremonyStudentSeatIds.length,
        companionPoolSize: config.ceremonyCompanionSeatIds.length,
        updatedAt: config.updatedAt,
      };
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
