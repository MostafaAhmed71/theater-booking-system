/**
 * سجل الطلاب (رقم الهوية → الاسم) — localStorage + مزامنة Supabase.
 */
(function (global) {
  "use strict";

  const LS_KEY = "threa.studentRoster.entries.v1";
  /** @type {Record<string, string>} */
  let entries = {};
  let firestoreOk = false;
  let lastError = null;

  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function getClient() {
    return global.ThreaFirebase && global.ThreaFirebase.db;
  }

  function tableName() {
    return (
      (global.ThreaFirebase && global.ThreaFirebase.ROSTER_COLLECTION) ||
      "threa_student_roster"
    );
  }

  function rosterDocId() {
    return (
      (global.ThreaFirebase && global.ThreaFirebase.ROSTER_DOC_ID) || "default"
    );
  }

  function loadLocal() {
    try {
      const raw = global.localStorage.getItem(LS_KEY);
      if (!raw) {
        entries = {};
        return;
      }
      const o = JSON.parse(raw);
      entries = o && typeof o === "object" ? o : {};
    } catch {
      entries = {};
    }
  }

  function saveLocal() {
    try {
      global.localStorage.setItem(LS_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn("student-roster local save", e);
    }
  }

  function normalizeNationalId(v) {
    return String(v || "")
      .replace(/\D/g, "")
      .slice(0, 16);
  }

  function isGuestKey(v) {
    return /^GUEST-/i.test(String(v || "").trim());
  }

  /** هوية وطنية (أرقام) أو رمز ضيف GUEST-XXXXXXXX */
  function normalizeGuestKey(v) {
    const raw = String(v || "").trim();
    if (isGuestKey(raw)) {
      const suffix = raw
        .replace(/^GUEST-/i, "")
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase();
      if (!suffix || suffix.length < 4) return "";
      return `GUEST-${suffix.slice(0, 24)}`;
    }
    return normalizeNationalId(v);
  }

  function generateGuestRef() {
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

  function normalizeName(v) {
    return String(v || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 200);
  }

  /**
   * دمج قاموس جديد (يحل محل المفاتيح المتقاطعة فقط).
   * @param {Record<string, string>} map
   */
  function mergeEntries(map) {
    if (!map || typeof map !== "object") return;
    for (const [k, v] of Object.entries(map)) {
      const id = normalizeGuestKey(k);
      if (!id) continue;
      const name = normalizeName(v);
      if (name) entries[id] = name;
    }
    saveLocal();
  }

  /** استبدال القائمة بالكامل (مثلاً عند الجلب من Supabase) */
  function replaceAllEntries(map) {
    entries = {};
    mergeEntries(map || {});
  }

  function lookupNameByNationalId(nationalId) {
    const id = normalizeGuestKey(nationalId);
    if (!id) return null;
    const n = entries[id];
    return n && String(n).trim() ? String(n).trim() : null;
  }

  function getAllEntries() {
    return { ...entries };
  }

  async function pullFromFirestore() {
    const client = getClient();
    if (!client) return false;
    try {
      const { data, error } = await client
        .from(tableName())
        .select("*")
        .eq("id", rosterDocId())
        .maybeSingle();
      if (error) throw error;
      if (data && data.entries && typeof data.entries === "object") {
        const cloud = data.entries;
        if (Object.keys(cloud).length > 0) {
          replaceAllEntries(cloud);
        }
      }
      firestoreOk = true;
      lastError = null;
      return true;
    } catch (err) {
      lastError = (err && err.message) || String(err);
      console.error("student-roster pull:", err);
      return false;
    }
  }

  /** رفع السجل الحالي بالكامل إلى Supabase */
  async function pushToFirestore() {
    const client = getClient();
    if (!client) throw new Error("Supabase غير متصل");
    const { error } = await client.from(tableName()).upsert({
      id: rosterDocId(),
      entries: { ...entries },
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    const { data, error: readErr } = await client
      .from(tableName())
      .select("entries")
      .eq("id", rosterDocId())
      .maybeSingle();
    if (readErr) throw readErr;
    const saved =
      data && data.entries && typeof data.entries === "object" ? data.entries : {};
    const expected = Object.keys(entries).length;
    const got = Object.keys(saved).length;
    if (got !== expected) {
      throw new Error(
        `تعذّر التحقق من الحفظ في Supabase (متوقع ${expected} طالب، وُجد ${got}).`
      );
    }
    firestoreOk = true;
    lastError = null;
  }

  /**
   * استيراد من كائن ثم اختياري رفع للسحابة.
   * @param {Record<string, string>} map
   * @param {{ pushCloud?: boolean, replace?: boolean }} [options]
   */
  async function importEntries(map, options) {
    const replace = !!(options && options.replace);
    if (replace) replaceAllEntries(map);
    else mergeEntries(map);
    const pushCloud = !!(options && options.pushCloud);
    if (pushCloud) {
      if (!getClient()) {
        throw new Error(
          "Supabase غير متصل — لم يُحفظ في السحابة. تحقق من الاتصال ونفّذ schema.sql."
        );
      }
      await pushToFirestore();
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

  async function bootstrap() {
    const ok = await waitForFirebase();
    if (!ok) {
      loadLocal();
      lastError = lastError || "بدون Supabase — السجل من المتصفح فقط.";
      return;
    }
    const pulled = await pullFromFirestore();
    if (!pulled || Object.keys(entries).length === 0) {
      loadLocal();
    }
  }

  bootstrap().finally(() => readyResolve());

  global.ThreaStudentRoster = {
    ready,
    normalizeNationalId,
    normalizeGuestKey,
    isGuestKey,
    generateGuestRef,
    normalizeName,
    lookupNameByNationalId,
    getAllEntries,
    importEntries,
    replaceAllEntries,
    pushToFirestore,
    pullFromFirestore,
    getStatus() {
      return {
        firestoreOk,
        lastError,
        count: Object.keys(entries).length,
      };
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
