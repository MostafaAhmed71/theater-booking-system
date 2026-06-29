/**
 * طلبات حجز ضيوف المراسم — انتظار موافقة الإدارة.
 */
(function (global) {
  "use strict";

  const TABLE = "threa_guest_requests";

  /** @typedef {'pending' | 'approved' | 'rejected'} GuestRequestStatus */
  /** @typedef {{
   *   id: string,
   *   guestRef: string,
   *   guestName: string,
   *   whatsappPhone: string,
   *   status: GuestRequestStatus,
   *   seatId?: string,
   *   assignmentId?: string,
   *   inviteCode?: string,
   *   checkInToken?: string,
   *   rejectReason?: string,
   *   createdAt: string,
   *   reviewedAt?: string,
   *   whatsappSentAt?: string
   * }} GuestRequest */

  /** @type {Map<string, GuestRequest>} */
  const byId = new Map();

  let readyResolve;
  const ready = new Promise((r) => {
    readyResolve = r;
  });

  function getClient() {
    return global.ThreaFirebase && global.ThreaFirebase.db;
  }

  function rowToRequest(row) {
    return {
      id: String(row.id),
      guestRef: String(row.guest_ref || ""),
      guestName: String(row.guest_name || ""),
      whatsappPhone: String(row.whatsapp_phone || ""),
      status: /** @type {GuestRequestStatus} */ (row.status || "pending"),
      seatId: row.seat_id || undefined,
      assignmentId: row.assignment_id || undefined,
      inviteCode: row.invite_code || undefined,
      checkInToken: row.check_in_token || undefined,
      rejectReason: row.reject_reason || "",
      createdAt: row.created_at || new Date().toISOString(),
      reviewedAt: row.reviewed_at || undefined,
      whatsappSentAt: row.whatsapp_sent_at || undefined,
    };
  }

  function requestToRow(req) {
    return {
      id: req.id,
      guest_ref: req.guestRef,
      guest_name: req.guestName,
      whatsapp_phone: req.whatsappPhone,
      status: req.status,
      seat_id: req.seatId || null,
      assignment_id: req.assignmentId || null,
      invite_code: req.inviteCode || null,
      check_in_token: req.checkInToken || null,
      reject_reason: req.rejectReason || "",
      created_at: req.createdAt,
      reviewed_at: req.reviewedAt || null,
      whatsapp_sent_at: req.whatsappSentAt || null,
    };
  }

  function applyRows(rows) {
    byId.clear();
    for (const row of rows || []) {
      if (!row || !row.id) continue;
      const req = rowToRequest(row);
      byId.set(req.id, req);
    }
  }

  function generateGuestRef() {
    const roster = global.ThreaStudentRoster;
    if (roster && typeof roster.generateGuestRef === "function") {
      return roster.generateGuestRef();
    }
    if (global.crypto && typeof global.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(4);
      global.crypto.getRandomValues(bytes);
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      return `GUEST-${hex}`;
    }
    return `GUEST-${Date.now().toString(36).toUpperCase().slice(-8)}`;
  }

  async function pullAll() {
    const client = getClient();
    if (!client) return false;
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("guest-request-store pull:", error);
      return false;
    }
    applyRows(data);
    return true;
  }

  function listByStatus(status) {
    return [...byId.values()]
      .filter((r) => r.status === status)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function countPending() {
    return listByStatus("pending").length;
  }

  function getById(id) {
    return byId.get(String(id)) || null;
  }

  /**
   * @param {{ guestName: string, whatsappPhone: string }} profile
   */
  async function submitRequest(profile) {
    await ready;
    const client = getClient();
    if (!client) throw new Error("قاعدة البيانات غير متصلة.");

    const guestRef = generateGuestRef();
    const id = `gr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const req = {
      id,
      guestRef,
      guestName: String(profile.guestName || "").trim(),
      whatsappPhone: String(profile.whatsappPhone || "").trim(),
      status: "pending",
      rejectReason: "",
      createdAt: new Date().toISOString(),
    };

    const { error } = await client.from(TABLE).insert(requestToRow(req));
    if (error) throw error;
    byId.set(id, req);
    try {
      global.dispatchEvent(new CustomEvent("threa-guest-requests-changed"));
    } catch {
      /* ignore */
    }
    return { ...req };
  }

  /**
   * @param {string} id
   * @param {Partial<GuestRequest>} patch
   */
  async function updateRequest(id, patch) {
    await ready;
    const prev = byId.get(id);
    if (!prev) throw new Error("الطلب غير موجود.");
    const next = { ...prev, ...patch, id: prev.id };
    const client = getClient();
    if (!client) throw new Error("قاعدة البيانات غير متصلة.");
    const { error } = await client.from(TABLE).upsert(requestToRow(next));
    if (error) throw error;
    byId.set(id, next);
    try {
      global.dispatchEvent(new CustomEvent("threa-guest-requests-changed"));
    } catch {
      /* ignore */
    }
    return { ...next };
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
  }

  bootstrap().finally(() => readyResolve());

  global.ThreaGuestRequestStore = {
    ready,
    pullAll,
    submitRequest,
    updateRequest,
    listByStatus,
    countPending,
    getById,
    listPending: () => listByStatus("pending"),
    listApproved: () => listByStatus("approved"),
    listRejected: () => listByStatus("rejected"),
  };
})(typeof window !== "undefined" ? window : globalThis);
