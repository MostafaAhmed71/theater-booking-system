/**
 * حفظ تخصيص المقاعد — مفتاح التسجيل: رقم الهوية.
 * مقاعد الطالب: ناحية اليسار فقط؛ مقعد المرافق (إن وُجد): ناحية اليمين فقط.
 */
(function (global) {
  "use strict";

  const TABLE = "threa_guest_assignments";

  /**
   * @typedef {'pending' | 'confirmed' | 'declined'} RsvpStatus
   * @typedef {'sent' | 'failed' | 'pending'} WhatsAppStatus
   * @typedef {{
   *   nationalId: string,
   *   studentName: string,
   *   companionName: string,
   *   whatsappPhone: string,
   *   seatIds: string[],
   *   checkInToken: string,
   *   inviteCode?: string,
   *   savedAt?: string,
   *   checkedInAt?: string,
   *   rsvpStatus?: RsvpStatus,
   *   rsvpAt?: string,
   *   whatsappStatus?: WhatsAppStatus,
   *   whatsappSentAt?: string,
   *   whatsappError?: string
   * }} GuestRec
   */

  /** @type {Map<string, GuestRec>} */
  const byKey = new Map();
  /** @type {Map<string, string>} inviteCode → document key */
  const byInviteCode = new Map();
  /** @type {Set<string>} */
  const occupiedSeatIds = new Set();
  let firestoreOk = false;
  let permissionDenied = false;
  /** @type {string | null} */
  let lastError = null;

  const MIN_PULL_INTERVAL_MS = 45000;
  const QUOTA_BACKOFF_MS = 600000;
  let lastPullAt = 0;
  let pullInFlight = null;
  let quotaExhaustedUntil = 0;
  let snapshotActive = false;
  /** @type {(() => void) | null} */
  let unsubscribeSnapshot = null;

  const RULES_HELP_AR =
    "صلاحيات Supabase مرفوضة. نفّذ supabase/schema.sql في SQL Editor وفعّل سياسات RLS للجدول threa_guest_assignments.";

  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function getClient() {
    return global.ThreaFirebase && global.ThreaFirebase.db;
  }

  function tableName() {
    return (
      (global.ThreaFirebase && global.ThreaFirebase.GUESTS_COLLECTION) || TABLE
    );
  }

  /**
   * @param {Record<string, unknown>} row
   */
  function normalizeRsvpStatus(v) {
    const s = String(v || "pending").toLowerCase();
    if (s === "confirmed" || s === "declined") return s;
    return "pending";
  }

  function normalizeWhatsAppStatus(v) {
    const s = String(v || "").toLowerCase();
    if (s === "sent" || s === "failed" || s === "pending") return s;
    return undefined;
  }

  function rowToRecordData(row) {
    return {
      nationalId: row.national_id,
      studentName: row.student_name,
      companionName: row.companion_name,
      whatsappPhone: row.whatsapp_phone,
      seatIds: Array.isArray(row.seat_ids) ? row.seat_ids : [],
      checkInToken: row.check_in_token,
      inviteCode: row.invite_code,
      savedAt: row.saved_at,
      checkedInAt: row.checked_in_at,
      rsvpStatus: normalizeRsvpStatus(row.rsvp_status),
      rsvpAt: row.rsvp_at || undefined,
      whatsappStatus: normalizeWhatsAppStatus(row.whatsapp_status),
      whatsappSentAt: row.whatsapp_sent_at || undefined,
      whatsappError:
        typeof row.whatsapp_error === "string" ? row.whatsapp_error : undefined,
    };
  }

  /**
   * @param {string} key
   * @param {GuestRec} record
   */
  function recordToRow(key, record) {
    return {
      id: key,
      national_id: record.nationalId,
      student_name: record.studentName,
      companion_name: record.companionName || "",
      whatsapp_phone: record.whatsappPhone || "",
      seat_ids: record.seatIds,
      check_in_token: record.checkInToken,
      invite_code: record.inviteCode || null,
      saved_at: record.savedAt || new Date().toISOString(),
      checked_in_at: record.checkedInAt || null,
      rsvp_status: record.rsvpStatus || "pending",
      rsvp_at: record.rsvpAt || null,
      whatsapp_status: record.whatsappStatus || null,
      whatsapp_sent_at: record.whatsappSentAt || null,
      whatsapp_error: record.whatsappError || null,
    };
  }

  function formatError(err) {
    const code = err && err.code ? String(err.code) : "";
    const msg = (err && err.message) || String(err);
    if (
      code === "permission-denied" ||
      code === "42501" ||
      /permission denied|row-level security/i.test(msg)
    ) {
      permissionDenied = true;
      return RULES_HELP_AR;
    }
    if (isQuotaError(err)) {
      quotaExhaustedUntil = Date.now() + QUOTA_BACKOFF_MS;
      return "تم تجاوز حدّ الطلبات — انتظر قليلاً ثم أعد المحاولة.";
    }
    return msg;
  }

  function isQuotaError(err) {
    const code = err && err.code ? String(err.code) : "";
    const msg = String((err && err.message) || "");
    return (
      code === "resource-exhausted" ||
      /quota|rate limit|too many requests/i.test(msg)
    );
  }

  function isQuotaBlocked() {
    return Date.now() < quotaExhaustedUntil;
  }

  function notifyAssignmentsChanged() {
    try {
      global.dispatchEvent(new CustomEvent("threa-assignments-changed"));
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {Array<Record<string, unknown>>} rows
   */
  function applyAllRows(rows) {
    byKey.clear();
    for (const row of rows) {
      if (!row || !row.id) continue;
      applyRecord(String(row.id), rowToRecordData(row));
    }
    rebuildInviteIndex();
    rebuildOccupiedSet();
    lastPullAt = Date.now();
    firestoreOk = true;
    permissionDenied = false;
    lastError = null;
    notifyAssignmentsChanged();
  }

  function stopSnapshotListener() {
    if (unsubscribeSnapshot) {
      try {
        unsubscribeSnapshot();
      } catch {
        /* ignore */
      }
      unsubscribeSnapshot = null;
    }
    snapshotActive = false;
  }

  /**
   * @returns {Promise<boolean>}
   */
  async function startSnapshotListener() {
    if (snapshotActive || unsubscribeSnapshot || isQuotaBlocked()) {
      return snapshotActive;
    }
    const client = getClient();
    if (!client) return false;

    try {
      snapshotActive = true;
      const channel = client
        .channel(`threa-guest-assignments-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: tableName() },
          (payload) => {
            if (payload.eventType === "DELETE" && payload.old && payload.old.id) {
              byKey.delete(String(payload.old.id));
            } else if (payload.new && payload.new.id) {
              applyRecord(String(payload.new.id), rowToRecordData(payload.new));
            }
            rebuildInviteIndex();
            rebuildOccupiedSet();
            lastPullAt = Date.now();
            notifyAssignmentsChanged();
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            lastError = "تعذّر الاشتراك في التحديثات الحية — تحقق من Realtime في Supabase.";
            stopSnapshotListener();
          }
        });
      unsubscribeSnapshot = () => {
        client.removeChannel(channel);
      };
      await pullAll({ force: true });
      return true;
    } catch (err) {
      lastError = formatError(err);
      console.error("guest-assignments snapshot start:", err);
      snapshotActive = false;
      return false;
    }
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

  function isCeremonyGuestId(nationalId) {
    return /^GUEST-/i.test(String(nationalId || "").trim());
  }

  /**
   * @param {string} nationalId
   */
  function guestKeyFromNationalId(nationalId) {
    const roster = global.ThreaStudentRoster;
    if (roster && typeof roster.normalizeGuestKey === "function") {
      return roster.normalizeGuestKey(nationalId);
    }
    const raw = String(nationalId || "").trim();
    if (/^GUEST-/i.test(raw)) {
      const suffix = raw
        .replace(/^GUEST-/i, "")
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase();
      return suffix.length >= 4 ? `GUEST-${suffix.slice(0, 24)}` : "";
    }
    return raw.replace(/\D/g, "").slice(0, 32);
  }

  /** عدد مقاعد محجوزة لضيوف المراسم (مفاتيح GUEST-) */
  function countCeremonyGuestSeats() {
    let n = 0;
    for (const rec of byKey.values()) {
      if (!isCeremonyGuestId(rec.nationalId)) continue;
      if (rec.rsvpStatus === "declined") continue;
      n += rec.seatIds ? rec.seatIds.length : 0;
    }
    return n;
  }

  /** عدد مقاعد محجوزة للخريجين والمرافقين (كل مقعد في الحجز يُحسب) */
  function countStudentCompanionSeats() {
    let n = 0;
    for (const rec of byKey.values()) {
      if (isCeremonyGuestId(rec.nationalId)) continue;
      if (rec.rsvpStatus === "declined") continue;
      n += rec.seatIds ? rec.seatIds.length : 0;
    }
    return n;
  }

  /** @returns {GuestRec[]} */
  function listCeremonyGuests() {
    return listAllGuests().filter((g) => isCeremonyGuestId(g.nationalId));
  }

  function rebuildOccupiedSet() {
    occupiedSeatIds.clear();
    for (const rec of byKey.values()) {
      if (rec.rsvpStatus === "declined") continue;
      for (const id of rec.seatIds) occupiedSeatIds.add(id);
    }
  }

  function notifyRsvpUpdated(detail) {
    try {
      global.dispatchEvent(
        new CustomEvent("threa-rsvp-updated", { detail: detail || {} })
      );
    } catch {
      /* ignore */
    }
  }

  async function triggerWaitlistIfAvailable() {
    const wl = global.ThreaWaitlist;
    if (wl && typeof wl.processAvailableSeats === "function") {
      try {
        await wl.processAvailableSeats();
      } catch (e) {
        console.warn("waitlist process:", e);
      }
    }
  }

  function normalizeStoredInviteCode(v) {
    const api = global.ThreaInviteCodes;
    if (api && typeof api.normalizeInviteCode === "function") {
      return api.normalizeInviteCode(v);
    }
    const digits = String(v || "").replace(/\D/g, "");
    return digits.length >= 3 && digits.length <= 4
      ? digits.padStart(4, "0").slice(-4)
      : "";
  }

  function collectUsedInviteCodes() {
    const used = new Set();
    for (const rec of byKey.values()) {
      if (rec.inviteCode) used.add(rec.inviteCode);
    }
    return used;
  }

  function allocateInviteCode(existing) {
    const prev = normalizeStoredInviteCode(existing);
    if (prev) return prev;
    const api = global.ThreaInviteCodes;
    if (!api || typeof api.generateInviteCode !== "function") {
      throw new Error("invite-codes.js غير محمّل");
    }
    return api.generateInviteCode(collectUsedInviteCodes());
  }

  function rebuildInviteIndex() {
    byInviteCode.clear();
    for (const [key, rec] of byKey) {
      if (rec.inviteCode) byInviteCode.set(rec.inviteCode, key);
    }
  }

  /**
   * @param {string} publicId رمز دعوة (4 أرقام) أو هوية أو GUEST-
   * @returns {string | null} مفتاح المستند
   */
  function resolveKeyFromPublicId(publicId) {
    const code = normalizeStoredInviteCode(publicId);
    if (code && byInviteCode.has(code)) return byInviteCode.get(code);
    const fromNational = guestKeyFromNationalId(publicId);
    if (fromNational && byKey.has(fromNational)) return fromNational;
    return fromNational || null;
  }

  /**
   * @param {string} publicId
   * @returns {GuestRec | null}
   */
  function getByPublicId(publicId) {
    const key = resolveKeyFromPublicId(publicId);
    if (!key) return null;
    const rec = byKey.get(key);
    return rec ? { ...rec, seatIds: [...rec.seatIds] } : null;
  }

  /**
   * كشك: إدخال أرقام فقط (4 خانات).
   * @param {string} input
   * @returns {{ rec: GuestRec | null, error?: "short" | "not_found" }}
   */
  function lookupKioskNumericCode(input) {
    const code = normalizeStoredInviteCode(input);
    if (!code || code.replace(/\D/g, "").length < 3) {
      return { rec: null, error: "short" };
    }
    const rec = getByPublicId(code);
    return rec ? { rec } : { rec: null, error: "not_found" };
  }

  /** @param {string} input */
  function getByKioskNumericCode(input) {
    return lookupKioskNumericCode(input).rec;
  }

  /**
   * @param {string} key
   * @param {Record<string, unknown>} data
   */
  function applyRecord(key, data) {
    if (!data) return;
    const seatIds = Array.isArray(data.seatIds)
      ? data.seatIds.filter((id) => typeof id === "string")
      : [];
    const rsvpStatus = normalizeRsvpStatus(data.rsvpStatus);
    const hasIdentity =
      (typeof data.studentName === "string" && data.studentName) ||
      (typeof data.nationalId === "string" && data.nationalId) ||
      (typeof data.checkInToken === "string" && data.checkInToken);
    if (!seatIds.length && rsvpStatus !== "declined" && !hasIdentity) return;

    const nid =
      typeof data.nationalId === "string" && data.nationalId
        ? guestKeyFromNationalId(data.nationalId)
        : key;
    const token =
      typeof data.checkInToken === "string" && data.checkInToken
        ? data.checkInToken
        : "";
    const inviteCode = normalizeStoredInviteCode(data.inviteCode);
    byKey.set(key, {
      nationalId: nid || key,
      studentName:
        typeof data.studentName === "string" ? data.studentName : "",
      companionName:
        typeof data.companionName === "string" ? data.companionName : "",
      whatsappPhone:
        typeof data.whatsappPhone === "string" ? data.whatsappPhone : "",
      seatIds,
      checkInToken: token,
      inviteCode: inviteCode || undefined,
      savedAt: typeof data.savedAt === "string" ? data.savedAt : undefined,
      checkedInAt:
        typeof data.checkedInAt === "string" && data.checkedInAt
          ? data.checkedInAt
          : undefined,
      rsvpStatus,
      rsvpAt: typeof data.rsvpAt === "string" ? data.rsvpAt : undefined,
      whatsappStatus: normalizeWhatsAppStatus(data.whatsappStatus),
      whatsappSentAt:
        typeof data.whatsappSentAt === "string" ? data.whatsappSentAt : undefined,
      whatsappError:
        typeof data.whatsappError === "string" ? data.whatsappError : undefined,
    });
  }

  /**
   * @param {string} key
   * @param {GuestRec} record
   */
  async function persistRecord(key, record) {
    applyRecord(key, record);
    rebuildInviteIndex();
    rebuildOccupiedSet();
    const client = getClient();
    if (!client) {
      throw new Error(lastError || "Supabase غير متصل");
    }
    const { error } = await client
      .from(tableName())
      .upsert(recordToRow(key, record));
    if (error) throw error;
    firestoreOk = true;
    lastError = null;
  }

  /**
   * @returns {GuestRec[]}
   */
  function listAllGuests() {
    return [...byKey.values()]
      .map((r) => ({ ...r, seatIds: [...r.seatIds] }))
      .sort((a, b) =>
        (a.studentName || "").localeCompare(b.studentName || "", "ar")
      );
  }

  /**
   * @param {GuestRec[]} guests
   */
  function computeAttendanceStats(guests) {
    let totalCompanions = 0;
    let presentStudents = 0;
    let presentCompanions = 0;
    for (const g of guests) {
      const hasCompanion =
        typeof g.companionName === "string" && g.companionName.trim().length >= 2;
      if (hasCompanion) totalCompanions += 1;
      if (g.checkedInAt) {
        presentStudents += 1;
        if (hasCompanion) presentCompanions += 1;
      }
    }
    const totalStudents = guests.length;
    return {
      totalStudents,
      totalCompanions,
      presentStudents,
      presentCompanions,
      totalPresent: presentStudents + presentCompanions,
      absentStudents: totalStudents - presentStudents,
      absentCompanions: totalCompanions - presentCompanions,
    };
  }

  function getAttendanceStats() {
    const guests = listAllGuests();
    return { guests, ...computeAttendanceStats(guests) };
  }

  /**
   * @param {string} publicId
   * @param {'confirmed' | 'declined'} status
   */
  async function updateRsvp(publicId, status) {
    await ready;
    const key = resolveKeyFromPublicId(publicId);
    if (!key) throw new Error("لم يُعثر على الحجز.");
    const rec = byKey.get(key);
    if (!rec) throw new Error("لم يُعثر على الحجز.");
    const nextStatus = status === "declined" ? "declined" : "confirmed";
    const hadSeats = rec.seatIds.length > 0;
    const updated = {
      ...rec,
      rsvpStatus: nextStatus,
      rsvpAt: new Date().toISOString(),
      seatIds: nextStatus === "declined" ? [] : [...rec.seatIds],
    };
    await persistRecord(key, updated);
    rebuildOccupiedSet();
    notifyAssignmentsChanged();
    notifyRsvpUpdated({
      nationalId: updated.nationalId,
      studentName: updated.studentName,
      status: nextStatus,
    });
    if (nextStatus === "declined" && hadSeats) {
      await triggerWaitlistIfAvailable();
    }
    return { ...updated, seatIds: [...updated.seatIds] };
  }

  /**
   * @param {string} publicId
   * @param {'sent' | 'failed' | 'pending'} status
   * @param {string} [errorMsg]
   */
  async function updateWhatsAppStatus(publicId, status, errorMsg) {
    await ready;
    const key = resolveKeyFromPublicId(publicId);
    if (!key) return null;
    const rec = byKey.get(key);
    if (!rec) return null;
    const updated = {
      ...rec,
      whatsappStatus: status,
      whatsappSentAt:
        status === "sent" ? new Date().toISOString() : rec.whatsappSentAt,
      whatsappError: status === "failed" ? String(errorMsg || "").slice(0, 500) : "",
      seatIds: [...rec.seatIds],
    };
    try {
      await persistRecord(key, updated);
    } catch (err) {
      console.warn("updateWhatsAppStatus:", err);
    }
    return { ...updated };
  }

  function getDashboardStats() {
    const guests = listAllGuests();
    const seatsApi = global.ThreaSeats;
    const totalSeats =
      seatsApi && Array.isArray(seatsApi.SEATS) ? seatsApi.SEATS.length : 0;
    let bookedSeats = 0;
    let checkedInSeats = 0;
    let rsvpConfirmed = 0;
    let rsvpDeclined = 0;
    let rsvpPending = 0;
    let waSent = 0;
    let waFailed = 0;
    let waPending = 0;
    /** @type {Record<string, { state: 'empty' | 'booked' | 'checked-in' | 'declined' }>} */
    const seatHeat = {};

    for (const g of guests) {
      const rs = g.rsvpStatus || "pending";
      if (rs === "confirmed") rsvpConfirmed += 1;
      else if (rs === "declined") rsvpDeclined += 1;
      else rsvpPending += 1;

      if (g.whatsappStatus === "sent") waSent += 1;
      else if (g.whatsappStatus === "failed") waFailed += 1;
      else if (g.whatsappStatus === "pending") waPending += 1;

      if (rs === "declined") continue;
      const checked = !!g.checkedInAt;
      for (const id of g.seatIds) {
        bookedSeats += 1;
        if (checked) checkedInSeats += 1;
        seatHeat[id] = { state: checked ? "checked-in" : "booked" };
      }
    }

    return {
      guests,
      totalSeats,
      bookedSeats,
      checkedInSeats,
      availableSeats: Math.max(0, totalSeats - bookedSeats),
      bookingPct: totalSeats ? Math.round((bookedSeats / totalSeats) * 100) : 0,
      rsvpConfirmed,
      rsvpDeclined,
      rsvpPending,
      waSent,
      waFailed,
      waPending,
      seatHeat,
    };
  }

  /**
   * @param {{ force?: boolean }} [opts]
   */
  async function pullAll(opts) {
    const force = !!(opts && opts.force);
    const client = getClient();
    if (!client) return false;

    if (isQuotaBlocked() && !force) {
      return firestoreOk;
    }

    if (!force && snapshotActive) {
      return firestoreOk;
    }

    if (!force && lastPullAt && Date.now() - lastPullAt < MIN_PULL_INTERVAL_MS) {
      return firestoreOk;
    }

    if (pullInFlight) {
      return pullInFlight;
    }

    pullInFlight = (async () => {
      try {
        const { data, error } = await client.from(tableName()).select("*");
        if (error) throw error;
        applyAllRows(data || []);
        return true;
      } catch (err) {
        lastError = formatError(err);
        console.error("guest-assignments pull:", err);
        if (isQuotaError(err)) {
          stopSnapshotListener();
        }
        return false;
      } finally {
        pullInFlight = null;
      }
    })();

    return pullInFlight;
  }

  /**
   * @param {{ force?: boolean }} [opts]
   */
  async function refresh(opts) {
    if (snapshotActive && !(opts && opts.force)) {
      return firestoreOk;
    }
    return pullAll(opts);
  }

  async function bootstrap() {
    const ok = await waitForFirebase();
    if (!ok) {
      lastError = "Supabase غير متصل — التخصيص لن يُحفظ بين المتصفحات.";
      return;
    }
    try {
      const listening = await startSnapshotListener();
      if (!listening) {
        await pullAll({ force: true });
      }
    } catch (err) {
      lastError = formatError(err);
      console.error("guest-assignments bootstrap:", err);
    }
  }

  bootstrap().finally(() => readyResolve());

  /**
   * @param {string} nationalId
   * @returns {GuestRec | null}
   */
  function getExistingForNationalId(nationalId) {
    const key = guestKeyFromNationalId(nationalId);
    if (!key) return null;
    const rec = byKey.get(key);
    return rec ? { ...rec, seatIds: [...rec.seatIds] } : null;
  }

  /** @param {string} nationalId */
  function hasExistingBooking(nationalId) {
    const ex = getExistingForNationalId(nationalId);
    return !!(ex && ex.seatIds && ex.seatIds.length > 0);
  }

  function getOccupiedSeatIds() {
    return new Set(occupiedSeatIds);
  }

  /**
   * @param {string} nationalId
   * @param {string} studentName
   * @param {string} companionName
   * @param {string} whatsappPhone
   * @param {string[]} seatIds
   * @param {string} checkInToken
   */
  async function saveAssignment(
    nationalId,
    studentName,
    companionName,
    whatsappPhone,
    seatIds,
    checkInToken
  ) {
    const key = guestKeyFromNationalId(nationalId);
    if (!key) throw new Error("رقم الهوية غير صالح.");

    const prev = byKey.get(key);
    const inviteCode = allocateInviteCode(prev && prev.inviteCode);
    const record = {
      nationalId: key,
      studentName: String(studentName || "").trim(),
      companionName: String(companionName || "").trim(),
      whatsappPhone: String(whatsappPhone || "").trim(),
      seatIds: [...seatIds],
      checkInToken: String(checkInToken || ""),
      inviteCode,
      savedAt: new Date().toISOString(),
      rsvpStatus: (prev && prev.rsvpStatus) || "pending",
    };
    if (prev && prev.checkedInAt) {
      record.checkedInAt = prev.checkedInAt;
    }
    if (prev) {
      if (prev.rsvpAt) record.rsvpAt = prev.rsvpAt;
      if (prev.whatsappStatus) record.whatsappStatus = prev.whatsappStatus;
      if (prev.whatsappSentAt) record.whatsappSentAt = prev.whatsappSentAt;
      if (prev.whatsappError) record.whatsappError = prev.whatsappError;
    }

    await persistRecord(key, record);
    rebuildInviteIndex();
  }

  /**
   * تسجيل حضور الضيف بعد مسح QR (يُحفظ في Firestore).
   * @param {string} nationalId
   * @returns {Promise<GuestRec | null>}
   */
  async function markCheckedIn(publicId) {
    await ready;
    const key = resolveKeyFromPublicId(publicId);
    if (!key) return null;
    const rec = byKey.get(key);
    if (!rec) return null;
    if (rec.checkedInAt) {
      return { ...rec, seatIds: [...rec.seatIds] };
    }
    const updated = {
      ...rec,
      checkedInAt: new Date().toISOString(),
      seatIds: [...rec.seatIds],
    };
    try {
      await persistRecord(key, updated);
      return { ...updated };
    } catch (err) {
      lastError = formatError(err);
      console.error("markCheckedIn:", err);
      applyRecord(key, updated);
      return { ...updated };
    }
  }

  /**
   * @param {{
   *   nationalId: string,
   *   studentName: string,
   *   companionName: string,
   *   whatsappPhone: string,
   *   hasCompanion: boolean
   * }} profile
   * @param {(occupied: Set<string>) => string[] | null} pickSeatIdsFn — [مقعد طالب، مقعد مرافق؟]
   */
  async function assignOrRestore(profile, pickSeatIdsFn) {
    await ready;

    const nationalId = profile.nationalId;
    const existing = getExistingForNationalId(nationalId);
    if (existing && existing.seatIds.length > 0) {
      let inviteCode = existing.inviteCode;
      if (!inviteCode && getClient()) {
        try {
          await saveAssignment(
            nationalId,
            existing.studentName,
            existing.companionName || "",
            existing.whatsappPhone || "",
            existing.seatIds,
            existing.checkInToken
          );
          inviteCode = getExistingForNationalId(nationalId)?.inviteCode;
        } catch (e) {
          console.warn("inviteCode backfill", e);
        }
      }
      return {
        seatIds: [...existing.seatIds],
        restored: true,
        alreadyBooked: true,
        checkInToken: existing.checkInToken,
        inviteCode: inviteCode || existing.inviteCode,
      };
    }

    const need = profile.hasCompanion ? 2 : 1;

    if (!getClient()) {
      lastError = lastError || "Supabase غير متصل";
      const picked = pickSeatIdsFn(new Set(occupiedSeatIds));
      if (!picked || picked.length !== need) {
        return { seatIds: null, restored: false, offline: true };
      }
      const token =
        global.crypto && typeof global.crypto.randomUUID === "function"
          ? global.crypto.randomUUID()
          : `t_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      const offlineCode = allocateInviteCode(null);
      return {
        seatIds: picked.slice(0, need),
        restored: false,
        offline: true,
        checkInToken: token,
        inviteCode: offlineCode,
      };
    }

    const key = guestKeyFromNationalId(nationalId);
    const occupied = new Set(occupiedSeatIds);
    const selfRec = byKey.get(key);
    if (selfRec) {
      for (const id of selfRec.seatIds) occupied.delete(id);
    }

    const pickedIds = pickSeatIdsFn(occupied);
    if (!pickedIds || pickedIds.length !== need) {
      return { seatIds: null, restored: false };
    }

    const token =
      global.crypto && typeof global.crypto.randomUUID === "function"
        ? global.crypto.randomUUID()
        : `t_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

    try {
      await saveAssignment(
        nationalId,
        profile.studentName,
        profile.companionName,
        profile.whatsappPhone,
        pickedIds,
        token
      );
    } catch (err) {
      lastError = formatError(err);
      console.error("guest-assignments save:", err);
      const failCode = allocateInviteCode(null);
      return {
        seatIds: pickedIds,
        restored: false,
        cloudSaveFailed: true,
        checkInToken: token,
        inviteCode: failCode,
      };
    }
    const saved = getExistingForNationalId(nationalId);
    return {
      seatIds: pickedIds,
      restored: false,
      checkInToken: token,
      inviteCode: (saved && saved.inviteCode) || "",
    };
  }

  /**
   * للتحقق من مسح QR — يطابق الرمز مع المسجل في Firestore.
   * @param {string} nationalId
   * @param {string} checkInToken
   * @returns {Promise<GuestRec | null>}
   */
  async function verifyCheckIn(publicId, checkInToken) {
    await ready;
    const tok = String(checkInToken || "").trim();
    if (!tok) return null;

    const rec = getByPublicId(publicId);
    if (rec && rec.checkInToken === tok) {
      return rec;
    }
    return null;
  }

  /**
   * تحقق من QR ثم تسجيل الحضور.
   * @param {string} publicId رمز دعوة أو هوية
   * @param {string} checkInToken
   * @returns {Promise<GuestRec | null>}
   */
  async function verifyAndCheckIn(publicId, checkInToken) {
    const rec = await verifyCheckIn(publicId, checkInToken);
    if (!rec) return null;
    if (rec.checkedInAt) return rec;
    const lookup = rec.inviteCode || publicId;
    const marked = await markCheckedIn(lookup);
    return marked || rec;
  }

  function getStatus() {
    return {
      firestoreOk,
      permissionDenied,
      lastError,
      rulesHelp: RULES_HELP_AR,
      registrationCount: byKey.size,
      occupiedSeats: occupiedSeatIds.size,
      quotaExhausted: isQuotaBlocked(),
      quotaRetryAt: quotaExhaustedUntil || null,
      realtimeListener: snapshotActive,
      lastPullAt: lastPullAt || null,
    };
  }

  function isPermissionDenied() {
    return permissionDenied;
  }

  global.ThreaGuestAssignments = {
    ready,
    guestKeyFromNationalId,
    isCeremonyGuestId,
    countCeremonyGuestSeats,
    countStudentCompanionSeats,
    listCeremonyGuests,
    getExistingForNationalId,
    getByPublicId,
    getByKioskNumericCode,
    lookupKioskNumericCode,
    resolveKeyFromPublicId,
    hasExistingBooking,
    getOccupiedSeatIds,
    saveAssignment,
    assignOrRestore,
    verifyCheckIn,
    verifyAndCheckIn,
    markCheckedIn,
    updateRsvp,
    updateWhatsAppStatus,
    listAllGuests,
    getAttendanceStats,
    getDashboardStats,
    refresh,
    pullAll,
    getStatus,
    isPermissionDenied,
    RULES_HELP_AR,
  };
})(typeof window !== "undefined" ? window : globalThis);
