/**
 * مسرح — صورة بانوراما (مع localStorage) أو WebGL2 للمقاعد + GSAP.
 */

if (!window.ThreaSeats || !window.ThreaSeats.SEATS) {
  console.error("seats-data.js مطلوب قبل main.js");
}

/** @type {Seat[]} */
const SEATS = window.ThreaSeats ? window.ThreaSeats.SEATS : [];

const urlParams = new URLSearchParams(
  typeof globalThis.location !== "undefined" ? globalThis.location.search : ""
);

/**
 * نسخ مضغوطة في assets/ (انظر scripts/optimize-theater-pano.py).
 * للتجاوز: ?theater=./other.jpg أو رابط https كامل.
 */
function theaterPanoramaOverride() {
  const q = urlParams.get("theater") || urlParams.get("pano");
  if (!q || !String(q).trim()) return null;
  const t = decodeURIComponent(String(q).trim());
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/")) return t;
  if (t.startsWith("./") || t.startsWith("../")) return t;
  return `./${t.replace(/^\/+/, "")}`;
}

function resolveTheaterPanoramaUrl() {
  const override = theaterPanoramaOverride();
  if (override) return override;
  if (window.ThreaTheaterPano && typeof window.ThreaTheaterPano.pickUrl === "function") {
    return window.ThreaTheaterPano.pickUrl();
  }
  return "./assets/theater-mobile.jpg";
}

async function probeTheaterPanorama() {
  const override = theaterPanoramaOverride();
  if (override) return probeImage(override);
  if (window.ThreaTheaterPano && typeof window.ThreaTheaterPano.probeAvailable === "function") {
    const url = await window.ThreaTheaterPano.probeAvailable();
    return !!url;
  }
  return probeImage(resolveTheaterPanoramaUrl());
}

/** يطابق مركز المدار في `theater-webgl.js` */
const THEATER_ORBIT = { x: 0, y: -1.2, z: -14 };

const CINEMATIC_FULL_INTRO = urlParams.has("cinematic");
const FORCE_WEBGL = urlParams.has("webgl");
const FORCE_PHOTO = urlParams.has("photo") || urlParams.has("panorama");

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   panU: number,
 *   panV: number,
 *   section: string,
 *   row: number,
 *   seatInRow: number,
 *   x: number,
 *   y: number,
 *   z: number,
 * }} Seat
 */

const webglRoot = document.getElementById("webgl-root");
const webglCanvas = document.getElementById("webgl-canvas");
const panoStage = document.getElementById("pano-stage");
const panoInner = document.getElementById("pano-inner");
const panoImg = document.getElementById("pano-img");
const panoPinsRoot = document.getElementById("pano-pins-root");
const registrationGate = document.getElementById("registration-gate");
const guestForm = document.getElementById("guest-form");
const formError = document.getElementById("form-error");
const waitlistOffer = document.getElementById("waitlist-offer");
const waitlistJoinBtn = document.getElementById("waitlist-join-btn");
const guestSubmit = document.getElementById("guest-submit");
const loadingDock = document.getElementById("loading-dock");
const loadingLabel = document.getElementById("loading-label");
const seatCard = document.getElementById("seat-card");
const seatSummaryLine = document.getElementById("seat-summary-line");
const scrollSeatBtn = document.getElementById("scroll-seat-btn");
const nationalIdInput = document.getElementById("national-id");
const studentNameInput = document.getElementById("student-name");
const companionNameInput = document.getElementById("companion-name");
const whatsappPhoneInput = document.getElementById("whatsapp-phone");
const bookingConfirmModal = document.getElementById("booking-confirm-modal");
const bookingConfirmBackdrop = document.getElementById("booking-confirm-backdrop");
const bookingConfirmLead = document.getElementById("booking-confirm-lead");
const bookingConfirmSeats = document.getElementById("booking-confirm-seats");
const bookingInviteNames = document.getElementById("booking-invite-names");
const bookingQrCanvas = document.getElementById("booking-qr-canvas");
const bookingWaStatus = document.getElementById("booking-wa-status");
const bookingSendWaBtn = document.getElementById("booking-send-wa");
const bookingContinueVisualBtn = document.getElementById("booking-continue-visual");
const bookingConfirmCountdownEl = document.getElementById("booking-confirm-countdown");

const BOOKING_CONFIRM_REDIRECT_SEC = 5;
/** @type {ReturnType<typeof setTimeout> | null} */
let bookingConfirmRedirectTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let bookingConfirmRedirectInterval = null;
let bookingVisualRedirecting = false;

/** @type {ReturnType<typeof window.TheaterWebGL.create> | null} */
let theaterApi = null;

/** @type {'webgl' | 'photo'} */
let experienceMode = "webgl";

let panoPinPulses = [];
/** @type {unknown} */
let panoRefocusTl = null;

/** تقريب البانوراما (وضع الصورة): عجلة الماوس أو قرصة إصبعين */
const PANO_ZOOM_MIN = 1;
const PANO_ZOOM_MAX = 4;
let panoZoomLevel = 1;
let panoPinchStartDist = 0;
let panoPinchStartZoom = 1;
let panoPinchActive = false;
/** أثناء مقدمة البانوراما (قبل انتهاء التركيز الأول) */
let panoIntroBusy = false;
/** @type {Seat[]} */
let assignedSeats = [];
/**
 * @type {{
 *   nationalId: string,
 *   studentName: string,
 *   companionName: string,
 *   whatsappPhone: string,
 *   hasCompanion: boolean,
 *   checkInToken?: string
 * } | null}
 */
let guestProfile = null;
let theaterExperienceLocked = false;
let guestSubmitInFlight = false;
/** آخر محاولة حجز فشلت لعدم توفر مقاعد */
let lastBookingSeatsFull = false;
/** بعد إظهار البانوراما/المشهد — لا نعيد نموذج التسجيل فوق العرض */
let experienceStarted = false;
/** آخر حجز استُرجع من Firestore لنفس رقم الهوية (وليس تخصيصاً جديداً) */
let lastBookingRestored = false;

/** مقاعد لها إحداثيات معايرة على البانوراما فقط */
function getCalibratedSeats() {
  const store = window.ThreaPanoramaStorage;
  if (!store) return [];
  if (typeof store.filterCalibratedSeats === "function") {
    return store.filterCalibratedSeats(SEATS);
  }
  if (typeof store.getPin === "function") {
    return SEATS.filter((s) => store.getPin(s.id));
  }
  return [];
}

/** @param {Seat[]} pool */
function filterPoolToCalibrated(pool) {
  const store = window.ThreaPanoramaStorage;
  if (!store || typeof store.filterCalibratedSeats !== "function") return [];
  return store.filterCalibratedSeats(pool);
}

async function assertStudentCompanionQuota(neededSeats) {
  const ga = window.ThreaGuestAssignments;
  const quotaApi = window.ThreaGuestQuota;
  if (!ga || !quotaApi) return { ok: true };
  try {
    await Promise.all(
      [ga.ready, quotaApi.ready].filter(Boolean).map((p) => p)
    );
  } catch {
    return { ok: false, message: "تعذّر تحميل بيانات التوفر." };
  }
  const used =
    typeof ga.countStudentCompanionSeats === "function"
      ? ga.countStudentCompanionSeats()
      : 0;
  const need = Math.max(1, Math.floor(neededSeats));
  const stat = quotaApi.getStudentCompanionAvailability(used, need);
  if (!stat.allowed) {
    if (stat.remaining <= 0 || stat.used >= stat.cap) {
      return {
        ok: false,
        message: `اكتملت مقاعد الخريجين والمرافقين (${stat.cap} مقعد) — لا يمكن الحجز.`,
      };
    }
    return {
      ok: false,
      message: `لا يتبقى سوى ${stat.remaining} مقعد للخريجين والمرافقين.`,
    };
  }
  return { ok: true };
}

/**
 * مستطيل الصورة المرئية داخل `<img>` عند `object-fit: contain` ووضع افتراضي في المنتصف.
 * الإحداثيات محلية لحواف عنصر الصورة (كما في حجم العنصر المعروض).
 * @param {HTMLImageElement} img
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
function getObjectFitContainContentRect(img) {
  const ew = img.clientWidth;
  const eh = img.clientHeight;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh || !ew || !eh) {
    return { x: 0, y: 0, w: ew || 0, h: eh || 0 };
  }
  const scale = Math.min(ew / nw, eh / nh);
  const w = nw * scale;
  const h = nh * scale;
  const x = (ew - w) / 2;
  const y = (eh - h) / 2;
  return { x, y, w, h };
}

/**
 * panU/panV نسب على البكسلات الفعلية للصورة (0..1). تحويل إلى موضع داخل صندوق العرض للـ overlay.
 * @param {HTMLImageElement} img
 * @param {number} panU
 * @param {number} panV
 * @returns {{ leftPct: number, topPct: number }}
 */
function panoUvToLayoutPercent(img, panU, panV) {
  const r = getObjectFitContainContentRect(img);
  const ew = img.clientWidth || 1;
  const eh = img.clientHeight || 1;
  if (!r.w || !r.h) {
    return { leftPct: panU * 100, topPct: panV * 100 };
  }
  const left = r.x + panU * r.w;
  const top = r.y + panV * r.h;
  return { leftPct: (left / ew) * 100, topPct: (top / eh) * 100 };
}

/**
 * @param {HTMLImageElement} img
 * @param {number} panU
 * @param {number} panV
 * @returns {{ x: number, y: number }}
 */
function panoUvToInnerPixel(img, panU, panV) {
  const r = getObjectFitContainContentRect(img);
  if (!r.w || !r.h) {
    const ew = img.clientWidth || img.naturalWidth || 1;
    const eh = img.clientHeight || img.naturalHeight || 1;
    return { x: panU * ew, y: panV * eh };
  }
  return { x: r.x + panU * r.w, y: r.y + panV * r.h };
}

/**
 * @template T
 * @param {T[]} list
 * @returns {T | null}
 */
function pickRandomFrom(list) {
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function partySeatCount() {
  if (!guestProfile) return 1;
  return guestProfile.hasCompanion ? 2 : 1;
}

/**
 * مقاعد متجاورة في نفس الصف والقسم (أو اختيار عشوائي منفصل إن تعذّر).
 * @param {Seat[]} pool
 * @param {number} count
 * @returns {Seat[] | null}
 */
function pickAdjacentSeatsFromPool(pool, count) {
  if (count < 1) return null;
  if (pool.length < count) return null;
  if (count === 1) {
    const s = pickRandomFrom(pool);
    return s ? [s] : null;
  }

  const byRow = new Map();
  for (const s of pool) {
    const k = `${s.section}|${s.row}`;
    if (!byRow.has(k)) byRow.set(k, []);
    byRow.get(k).push(s);
  }
  for (const arr of byRow.values()) {
    arr.sort((a, b) => a.seatInRow - b.seatInRow);
  }

  /** @type {Seat[][]} */
  const windows = [];
  for (const arr of byRow.values()) {
    if (arr.length < count) continue;
    for (let i = 0; i <= arr.length - count; i++) {
      const base = arr[i].seatInRow;
      let ok = true;
      for (let j = 1; j < count; j++) {
        if (arr[i + j].seatInRow !== base + j) {
          ok = false;
          break;
        }
      }
      if (ok) windows.push(arr.slice(i, i + count));
    }
  }

  if (windows.length) {
    return pickRandomFrom(windows);
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * @param {Seat[]} seats
 */
function partyPinCentroidFromSeats(seats) {
  if (!window.ThreaPanoramaStorage || !seats.length) {
    return { panU: 0.52, panV: 0.42, calibrated: false };
  }
  let su = 0;
  let sv = 0;
  let n = 0;
  let anyCalibrated = false;
  for (const s of seats) {
    const d = window.ThreaPanoramaStorage.getDisplayPinForSeat(s);
    su += d.panU;
    sv += d.panV;
    n += 1;
    if (d.calibrated) anyCalibrated = true;
  }
  return {
    panU: su / n,
    panV: sv / n,
    calibrated: anyCalibrated,
  };
}

/**
 * @param {Seat[]} seats
 */
function centroidWorldSeat(seats) {
  if (!seats.length) return { x: 0, y: 0, z: 0 };
  let x = 0;
  let y = 0;
  let z = 0;
  for (const s of seats) {
    x += s.x;
    y += s.y;
    z += s.z;
  }
  const n = seats.length;
  return { x: x / n, y: y / n, z: z / n };
}

function setFormError(message) {
  if (!message) {
    formError.textContent = "";
    formError.hidden = true;
    return;
  }
  formError.textContent = message;
  formError.hidden = false;
}

function showWaitlistOffer(show) {
  if (waitlistOffer) waitlistOffer.hidden = !show;
}

async function joinWaitlistFromForm() {
  if (!guestProfile) return;
  const wl = window.ThreaWaitlist;
  if (!wl || typeof wl.addToWaitlist !== "function") {
    setFormError("قائمة الانتظار غير متاحة — تحقق من الاتصال بقاعدة البيانات.");
    return;
  }
  if (waitlistJoinBtn) waitlistJoinBtn.disabled = true;
  setFormError("");
  try {
    if (wl.ready) await wl.ready;
    await wl.addToWaitlist({
      nationalId: guestProfile.nationalId,
      studentName: guestProfile.studentName,
      companionName: guestProfile.companionName || "",
      whatsappPhone: guestProfile.whatsappPhone,
      hasCompanion: !!guestProfile.hasCompanion,
    });
    showWaitlistOffer(false);
    setFormError(
      "تم تسجيلك في قائمة الانتظار. سنُرسل رسالة واتساب عند توفر مقعد."
    );
  } catch (e) {
    setFormError((e && e.message) || "تعذّر التسجيل في قائمة الانتظار.");
    if (waitlistJoinBtn) waitlistJoinBtn.disabled = false;
  }
}

/** إعادة عرض نموذج التسجيل — فقط إن لم يبدأ العرض بعد */
function failGuestRegistration(message) {
  setLoading(false);
  theaterExperienceLocked = false;
  guestSubmitInFlight = false;
  if (experienceStarted) {
    console.warn("تجربة العرض نشطة —", message);
    if (seatSummaryLine && message) {
      seatSummaryLine.textContent = `تنبيه: ${message}`;
      if (seatCard) {
        seatCard.hidden = false;
        seatCard.classList.add("is-visible");
      }
    }
    return;
  }
  registrationGate.hidden = false;
  if (guestSubmit) guestSubmit.disabled = false;
  closeBookingConfirmModal();
  setFormError(message);
}

function validateGuestForm(nationalId, studentName, companionName, whatsappLocal) {
  const roster = window.ThreaStudentRoster;
  const nid = roster ? roster.normalizeNationalId(nationalId) : String(nationalId || "").replace(/\D/g, "");
  if (!nid || nid.length < 10) {
    return "أدخل رقم الهوية كاملاً (10 أرقام على الأقل).";
  }
  if (!studentName || studentName.length < 3) {
    return "لم يُعثر على اسم مرتبط بهذه الهوية. تحقق من الرقم أو راجع المشرف وقائمة الخريجين.";
  }
  if (companionName && companionName.length > 0 && companionName.length < 2) {
    return "اسم المرافق قصير جداً؛ أدخل اسماً كاملاً أو اترك الحقل فارغاً.";
  }
  const phone = normalizeWhatsAppPhone(whatsappLocal);
  const dc = window.ThreaDialCodes;
  if (!phone || (dc && !dc.isValidE164(phone)) || phone.length < 10) {
    return "أدخل رقم جوال واتساب صالحاً مع اختيار رمز الدولة الصحيح.";
  }
  return null;
}

function setLoading(visible, text) {
  if (text) loadingLabel.textContent = text;
  loadingDock.hidden = !visible;
}

function showSeatCard() {
  if (!guestProfile || !assignedSeats.length) return;

  if (seatSummaryLine) {
    const parts = [`الطالب: ${guestProfile.studentName}`];
    if (guestProfile.companionName) {
      parts.push(`المرافق: ${guestProfile.companionName}`);
    }
    const seatBits = [`خريج (يسار): ${assignedSeats[0].name}`];
    if (assignedSeats[1]) {
      seatBits.push(
        `${guestProfile.companionName || "مرافق"} (يمين): ${assignedSeats[1].name}`
      );
    }
    parts.push(`المقاعد: ${seatBits.join(" — ")}`);
    seatSummaryLine.textContent = parts.join("  ·  ");
  }

  seatCard.hidden = false;
  requestAnimationFrame(() => {
    seatCard.classList.add("is-visible");
  });
}

function hideSeatCard() {
  seatCard.classList.remove("is-visible");
}

function probeImage(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(true);
    im.onerror = () => resolve(false);
    im.src = src;
  });
}

function disposePanoPins() {
  if (panoPinPulses.length) {
    panoPinPulses.forEach((t) => t.kill());
    panoPinPulses.length = 0;
  }
  if (panoPinsRoot) panoPinsRoot.replaceChildren();
  if (panoInner && window.ThreaPanoramaPath) {
    window.ThreaPanoramaPath.clear(panoInner);
  }
}

function updatePanoRoute() {
  if (!window.ThreaPanoramaPath || !panoInner || !panoImg) return;
  if (!assignedSeats.length) {
    window.ThreaPanoramaPath.clear(panoInner);
    return;
  }
  window.ThreaPanoramaPath.renderForSeats({
    mount: panoInner,
    img: panoImg,
    seats: assignedSeats,
  });
}

function attachPanoPins(seats) {
  disposePanoPins();
  if (!panoPinsRoot || !panoInner || !window.ThreaPanoramaStorage) return;

  const visible = filterPoolToCalibrated(seats);
  visible.forEach((seat, idx) => {
    const d = window.ThreaPanoramaStorage.getDisplayPinForSeat(seat);
    if (!d.calibrated) return;

    const pin = document.createElement("div");
    pin.className = "pano-pin";
    if (idx === 0) pin.classList.add("pano-pin--student", "pano-pin--primary");
    else pin.classList.add("pano-pin--companion");
    pin.setAttribute("aria-hidden", "true");
    const hl = document.createElement("span");
    hl.className = "pano-seat-hl";
    pin.appendChild(hl);
    const { leftPct, topPct } = panoUvToLayoutPercent(panoImg, d.panU, d.panV);
    pin.style.left = `${leftPct}%`;
    pin.style.top = `${topPct}%`;
    panoPinsRoot.appendChild(pin);

    if (typeof gsap !== "undefined") {
      panoPinPulses.push(
        gsap.to(hl, {
          scale: 1.06,
          opacity: 0.82,
          duration: 0.75,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        })
      );
    } else {
      pin.classList.add("is-pulsing");
    }
  });
  updatePanoRoute();
}

function scrollPanoToSeat() {
  if (!panoStage || !panoInner || !panoImg || !assignedSeats.length) return;
  const firstPin = panoPinsRoot && panoPinsRoot.querySelector(".pano-pin");
  if (firstPin) {
    firstPin.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
    return;
  }
  const d = partyPinCentroidFromSeats(assignedSeats);
  const viewU = d.panU;
  const viewV = d.panV;
  const { x: pinX, y: pinY } = panoUvToInnerPixel(panoImg, viewU, viewV);
  const vw = panoStage.clientWidth;
  const vh = panoStage.clientHeight;
  const maxScrollX = Math.max(0, panoStage.scrollWidth - vw);
  const maxScrollY = Math.max(0, panoStage.scrollHeight - vh);
  const rawX = pinX - vw / 2;
  const rawY = pinY - vh / 2;
  const targetX = Math.max(0, Math.min(maxScrollX, rawX));
  const targetY = Math.max(0, Math.min(maxScrollY, rawY));
  panoStage.scrollTo({ left: targetX, top: targetY, behavior: "smooth" });
}

function setPanoTransformOriginToViewportCenter() {
  if (!panoStage || !panoInner || !panoImg) return;
  const vw = panoStage.clientWidth;
  const vh = panoStage.clientHeight;
  const iw = panoInner.offsetWidth || panoImg.clientWidth || 1;
  const ih = panoInner.offsetHeight || panoImg.clientHeight || 1;
  const cx = panoStage.scrollLeft + vw / 2;
  const cy = panoStage.scrollTop + vh / 2;
  const ox = Math.max(2, Math.min(98, (cx / iw) * 100));
  const oy = Math.max(2, Math.min(98, (cy / ih) * 100));
  panoInner.style.transformOrigin = `${ox}% ${oy}%`;
}

function applyPanoExploreZoom(next, originMode) {
  if (!panoInner || experienceMode !== "photo") return;
  if (panoIntroBusy || panoRefocusTl) return;
  const clamped = Math.min(PANO_ZOOM_MAX, Math.max(PANO_ZOOM_MIN, next));
  panoZoomLevel = clamped;
  if (originMode === "viewport-center") {
    setPanoTransformOriginToViewportCenter();
  }
  gsap.set(panoInner, { scale: panoZoomLevel });
}

function panoTouchDist(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function onPanoWheelZoom(e) {
  if (experienceMode !== "photo" || !panoStage || panoStage.hidden) return;
  if (!panoStage.classList.contains("pano-stage--explore")) return;
  if (panoRefocusTl || panoIntroBusy) return;
  e.preventDefault();
  const modeMul = e.deltaMode === 1 ? 12 : e.deltaMode === 2 ? 80 : 1;
  const factor = Math.exp(-e.deltaY * modeMul * 0.0018);
  applyPanoExploreZoom(panoZoomLevel * factor, "viewport-center");
}

function onPanoTouchMoveZoom(e) {
  if (experienceMode !== "photo" || !panoStage || panoStage.hidden) return;
  if (!panoInner || !panoImg) return;
  if (panoRefocusTl || panoIntroBusy) return;
  if (e.touches.length !== 2) return;

  const t0 = e.touches[0];
  const t1 = e.touches[1];
  const d = panoTouchDist(t0, t1);

  if (!panoPinchActive) {
    panoPinchActive = true;
    panoPinchStartDist = d;
    panoPinchStartZoom = panoZoomLevel;
    return;
  }

  e.preventDefault();
  const ratio = d / panoPinchStartDist;
  const midX = (t0.clientX + t1.clientX) / 2;
  const midY = (t0.clientY + t1.clientY) / 2;
  const rect = panoStage.getBoundingClientRect();
  const cx = midX - rect.left + panoStage.scrollLeft;
  const cy = midY - rect.top + panoStage.scrollTop;
  const iw = panoInner.offsetWidth || panoImg.clientWidth || 1;
  const ih = panoInner.offsetHeight || panoImg.clientHeight || 1;
  const ox = Math.max(2, Math.min(98, (cx / iw) * 100));
  const oy = Math.max(2, Math.min(98, (cy / ih) * 100));
  panoInner.style.transformOrigin = `${ox}% ${oy}%`;
  applyPanoExploreZoom(panoPinchStartZoom * ratio, null);
}

function onPanoTouchEndZoom(e) {
  if (e.touches.length < 2) {
    panoPinchActive = false;
    panoPinchStartDist = 0;
  }
}

function syncPanoMobileZoomBar() {
  const bar = document.getElementById("pano-mobile-bar");
  if (!bar) return;
  const inPhotoExplore =
    experienceMode === "photo" &&
    panoStage &&
    !panoStage.hidden &&
    panoStage.classList.contains("pano-stage--explore");
  const desktopFineHide =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 901px) and (pointer: fine)").matches;
  const show =
    inPhotoExplore &&
    !desktopFineHide &&
    !panoRefocusTl &&
    !panoIntroBusy;
  bar.hidden = !show;
  bar.querySelectorAll("button").forEach((btn) => {
    btn.disabled = !inPhotoExplore || !!panoRefocusTl || panoIntroBusy;
  });
}

function initPanoZoomInteraction() {
  if (!panoStage) return;
  panoStage.addEventListener("wheel", onPanoWheelZoom, { passive: false });
  panoStage.addEventListener("touchmove", onPanoTouchMoveZoom, {
    passive: false,
  });
  panoStage.addEventListener("touchend", onPanoTouchEndZoom);
  panoStage.addEventListener("touchcancel", onPanoTouchEndZoom);

  const PANO_BTN_FACTOR = 1.18;
  const panoZoomInBtn = document.getElementById("pano-zoom-in");
  const panoZoomOutBtn = document.getElementById("pano-zoom-out");
  if (panoZoomInBtn) {
    panoZoomInBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (experienceMode !== "photo" || panoRefocusTl || panoIntroBusy) return;
      applyPanoExploreZoom(panoZoomLevel * PANO_BTN_FACTOR, "viewport-center");
    });
  }
  if (panoZoomOutBtn) {
    panoZoomOutBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (experienceMode !== "photo" || panoRefocusTl || panoIntroBusy) return;
      applyPanoExploreZoom(panoZoomLevel / PANO_BTN_FACTOR, "viewport-center");
    });
  }

  window.addEventListener("resize", () => {
    syncPanoMobileZoomBar();
    if (
      experienceMode === "photo" &&
      assignedSeats.length &&
      panoStage &&
      !panoStage.hidden &&
      panoImg &&
      panoImg.naturalWidth > 0
    ) {
      attachPanoPins(assignedSeats);
    }
  });
}

/**
 * @param {{ keepCard?: boolean }} [opts] — إن كان true لا تُخفى البطاقة (زر التركيز)
 */
function focusPanoOnParty(opts) {
  const keepCard = !!(opts && opts.keepCard);
  if (typeof gsap === "undefined") return null;

  if (panoRefocusTl) {
    panoRefocusTl.kill();
    panoRefocusTl = null;
  }

  const tl = gsap.timeline({
    defaults: { ease: "power2.inOut" },
    onStart: () => {
      syncPanoMobileZoomBar();
      if (!keepCard) {
        hideSeatCard();
        if (seatCard) seatCard.hidden = true;
      }
    },
    onComplete: () => {
      if (panoStage) {
        panoStage.classList.add("pano-stage--explore");
      }
      if (!keepCard) showSeatCard();
      panoRefocusTl = null;
      syncPanoMobileZoomBar();
    },
  });
  panoRefocusTl = tl;

  if (!panoStage || !panoInner || !panoImg) return tl;

  const d = partyPinCentroidFromSeats(assignedSeats);
  const viewU = d.panU;
  const viewV = d.panV;

  const img = panoImg;
  const { x: pinX, y: pinY } = panoUvToInnerPixel(img, viewU, viewV);
  const vw = panoStage.clientWidth;
  const vh = panoStage.clientHeight;
  const maxScrollX = Math.max(0, panoStage.scrollWidth - vw);
  const maxScrollY = Math.max(0, panoStage.scrollHeight - vh);
  const rawX = pinX - vw / 2;
  const rawY = pinY - vh / 2;
  const targetX = Math.max(0, Math.min(maxScrollX, rawX));
  const targetY = Math.max(0, Math.min(maxScrollY, rawY));

  const scrollState = {
    x: panoStage.scrollLeft,
    y: panoStage.scrollTop,
  };
  const zoomTarget = CINEMATIC_FULL_INTRO ? 1.38 : 1.22;
  const dur = keepCard ? 1.35 : CINEMATIC_FULL_INTRO ? 2.9 : 2;

  const origin = panoUvToLayoutPercent(img, viewU, viewV);
  panoInner.style.transformOrigin = `${origin.leftPct}% ${origin.topPct}%`;

  tl.to(
    scrollState,
    {
      x: targetX,
      y: targetY,
      duration: dur,
      ease: "power2.inOut",
      onUpdate: () => {
        panoStage.scrollLeft = scrollState.x;
        panoStage.scrollTop = scrollState.y;
      },
    },
    0
  );

  if (!keepCard) {
    panoZoomLevel = 1;
    gsap.set(panoInner, { scale: 1 });
    const zoomState = { z: 1 };
    tl.to(
      zoomState,
      {
        z: zoomTarget,
        duration: dur,
        ease: "power2.inOut",
        onUpdate: () => {
          panoZoomLevel = zoomState.z;
          gsap.set(panoInner, { scale: panoZoomLevel });
        },
        onComplete: () => {
          panoZoomLevel = zoomTarget;
        },
      },
      0
    );
  } else {
    gsap.set(panoInner, { scale: panoZoomLevel });
  }

  return tl;
}

/**
 * تركيز مقدمة البانوراما على مجموعة المقاعد المخصّصة.
 */
function runPanoIntroThenFocus() {
  const master = gsap.timeline({
    defaults: { ease: "power2.inOut" },
    onComplete: () => {
      panoIntroBusy = false;
      syncPanoMobileZoomBar();
    },
  });

  panoIntroBusy = true;
  syncPanoMobileZoomBar();

  master.fromTo(
    panoStage,
    { opacity: 0 },
    { opacity: 1, duration: CINEMATIC_FULL_INTRO ? 1.1 : 0.65, ease: "power1.out" },
    0
  );

  const drift = CINEMATIC_FULL_INTRO ? 48 : 22;
  const driftDur = CINEMATIC_FULL_INTRO ? 1.8 : 0.85;
  const scroll0 = { x: panoStage ? panoStage.scrollLeft : 0 };
  master.to(
    scroll0,
    {
      x: drift,
      duration: driftDur,
      ease: "sine.inOut",
      yoyo: true,
      repeat: 1,
      onUpdate: () => {
        if (panoStage) panoStage.scrollLeft = scroll0.x;
      },
    },
    0.06
  );

  master.add(focusPanoOnParty());
  return master;
}

/**
 * @param {Seat} seat
 */
function orbitAnglesForSeat(seat) {
  const ox = THEATER_ORBIT.x;
  const oy = THEATER_ORBIT.y;
  const oz = THEATER_ORBIT.z;
  const dx = seat.x - ox;
  const dy = seat.y - oy;
  const dz = seat.z - oz;
  const horiz = Math.hypot(dx, dz) || 1e-6;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy + 0.42, horiz) * 0.88;
  const dist = Math.min(58, Math.max(12, horiz * 0.92 + 10));
  return { yaw, pitch, dist };
}

function tweenCameraToParty(opts) {
  return tweenCameraToSeat(centroidWorldSeat(assignedSeats), opts);
}

/**
 * @param {{ x: number, y: number, z: number }} seat
 * @param {{ onComplete?: () => void }} [opts]
 */
function tweenCameraToSeat(seat, opts) {
  if (!theaterApi || typeof gsap === "undefined") {
    opts?.onComplete?.();
    return gsap.timeline();
  }

  theaterApi.setLookAt(seat.x, seat.y, seat.z);
  const from = theaterApi.getOrbit();
  const to = orbitAnglesForSeat(seat);
  const st = { yaw: from.yaw, pitch: from.pitch, dist: from.dist };

  return gsap
    .timeline({
      defaults: { ease: "power2.inOut" },
      onComplete: () => opts?.onComplete?.(),
      onUpdate: () => {
        theaterApi.setOrbit(st.yaw, st.pitch, st.dist);
      },
    })
    .to(st, {
      yaw: to.yaw,
      pitch: to.pitch,
      dist: to.dist,
      duration: CINEMATIC_FULL_INTRO ? 2.45 : 1.75,
    });
}

function runWebglIntroThenFocus() {
  const master = gsap.timeline({ defaults: { ease: "power2.inOut" } });

  if (!theaterApi || !webglRoot) return master;

  theaterApi.setLookAt(0, -0.85, 4.5);
  theaterApi.setOrbit(0.52, 0.36, 48);

  master.fromTo(
    webglRoot,
    { opacity: 0 },
    {
      opacity: 1,
      duration: CINEMATIC_FULL_INTRO ? 1.05 : 0.62,
      ease: "power1.out",
    },
    0
  );

  const drift = CINEMATIC_FULL_INTRO ? 0.22 : 0.1;
  const o = theaterApi.getOrbit();
  const driftState = { yaw: o.yaw };
  master.to(
    driftState,
    {
      yaw: o.yaw + drift,
      duration: CINEMATIC_FULL_INTRO ? 1.55 : 0.72,
      ease: "sine.inOut",
      yoyo: true,
      repeat: 1,
      onUpdate: () => {
        theaterApi.setOrbit(driftState.yaw, o.pitch, o.dist);
      },
    },
    0.05
  );

  master.call(() => {
    hideSeatCard();
    seatCard.hidden = true;
  });

  master.add(tweenCameraToParty());

  master.call(() => {
    theaterApi.setOrbitEnabled(true);
    showSeatCard();
  });

  return master;
}

async function startPhotoPanoramaExperience() {
  if (typeof gsap === "undefined") {
    setLoading(true, "تعذّر تحميل مكتبة التحريك.");
    return false;
  }

  if (!panoImg || !panoStage || !panoInner) {
    setLoading(true, "عناصر البانوراما غير موجودة.");
    return false;
  }

  if (!assignedSeats.length) {
    setLoading(true, "لا يوجد مقعد مخصص.");
    return false;
  }

  experienceMode = "photo";

  setLoading(true, "جاري تحميل صورة البانوراما…");

  if (webglRoot) webglRoot.hidden = true;
  if (theaterApi) {
    theaterApi.dispose();
    theaterApi = null;
  }

  if (window.ThreaTheaterPano && typeof window.ThreaTheaterPano.applyToImg === "function") {
    window.ThreaTheaterPano.applyToImg(panoImg, theaterPanoramaOverride());
  } else {
    panoImg.src = resolveTheaterPanoramaUrl();
  }

  try {
    await new Promise((resolve, reject) => {
      const done = () => resolve(null);
      const fail = () => reject(new Error("فشل تحميل الصورة"));
      panoImg.onload = done;
      panoImg.onerror = fail;
      if (panoImg.complete && panoImg.naturalWidth > 0) done();
    });
  } catch (e) {
    console.error(e);
    setLoading(true, "تعذّر تحميل صورة القاعة. تحقق من وجود الملف theater.JPG.");
    panoStage.hidden = true;
    syncPanoMobileZoomBar();
    return false;
  }

  experienceStarted = true;
  panoStage.hidden = false;
  panoStage.classList.add("pano-stage--explore");
  gsap.set(panoStage, { opacity: 0 });
  panoZoomLevel = 1;
  gsap.set(panoInner, { scale: 1 });
  panoStage.scrollLeft = 0;
  panoStage.scrollTop = 0;

  attachPanoPins(assignedSeats);

  setLoading(false);

  gsap.delayedCall(0.06, () => {
    /* بعد تطبيق أبعاد CSS (ارتفاع الشاشة) — إعادة موضع الدبابيس */
    attachPanoPins(assignedSeats);
    runPanoIntroThenFocus();
  });

  return true;
}

async function startWebglTheaterExperience() {
  if (typeof gsap === "undefined") {
    console.error(
      "GSAP غير محمّل. تأكد من اتصال الإنترنت ومسار السكربت في index.html."
    );
    setLoading(true, "تعذّر تحميل مكتبة التحريك.");
    return false;
  }

  if (!window.TheaterWebGL || typeof window.TheaterWebGL.create !== "function") {
    console.error("theater-webgl.js غير محمّل.");
    setLoading(true, "تعذّر تحميل محرك المسرح.");
    return false;
  }

  if (!webglCanvas || !webglRoot) {
    setLoading(true, "عنصر اللوحة غير موجود في الصفحة.");
    return false;
  }

  if (!assignedSeats.length) {
    setLoading(true, "لا يوجد مقعد مخصص.");
    return false;
  }

  const hi = assignedSeats.map((s) => SEATS.indexOf(s)).filter((i) => i >= 0);

  experienceMode = "webgl";

  setLoading(true, "جاري تجهيز المشهد ثلاثي الأبعاد…");

  disposePanoPins();
  if (panoStage) {
    panoStage.hidden = true;
    gsap.set(panoStage, { opacity: 1 });
    if (panoInner) gsap.set(panoInner, { scale: 1 });
    panoZoomLevel = 1;
    syncPanoMobileZoomBar();
  }

  if (theaterApi) {
    theaterApi.dispose();
    theaterApi = null;
  }

  experienceStarted = true;
  webglRoot.hidden = false;
  gsap.set(webglRoot, { opacity: 0 });

  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r))
  );

  theaterApi = window.TheaterWebGL.create(webglCanvas, SEATS);
  if (!theaterApi) {
    setLoading(true, "المتصفح لا يدعم WebGL2 أو فشل إنشاء السياق.");
    webglRoot.hidden = true;
    return false;
  }

  if (typeof theaterApi.setHighlightIndices === "function") {
    theaterApi.setHighlightIndices(hi);
  } else {
    theaterApi.setHighlightIndex(hi[0] ?? -1);
  }
  theaterApi.setOrbitEnabled(false);
  theaterApi.resize();
  theaterApi.start();

  setLoading(false);

  gsap.delayedCall(0.05, () => {
    runWebglIntroThenFocus();
  });

  return true;
}

function leftRightPoolsFrom(pool) {
  const leftPool = pool.filter((s) => s.section === "LEFT");
  const rightPool = pool.filter((s) => s.section === "RIGHT");
  return { leftPool, rightPool };
}

function getProfileQrPublicId(profile) {
  if (!profile) return "";
  if (profile.inviteCode) return String(profile.inviteCode).trim().toUpperCase();
  if (window.ThreaInviteCodes && window.ThreaInviteCodes.isInviteCode(profile.nationalId)) {
    return window.ThreaInviteCodes.normalizeInviteCode(profile.nationalId);
  }
  if (window.ThreaStudentRoster) {
    return window.ThreaStudentRoster.normalizeGuestKey
      ? window.ThreaStudentRoster.normalizeGuestKey(profile.nationalId)
      : window.ThreaStudentRoster.normalizeNationalId(profile.nationalId);
  }
  return String(profile.nationalId || "").replace(/\D/g, "");
}

function buildCheckInQrPayload() {
  if (!guestProfile || !guestProfile.checkInToken) return "";
  const pub = getProfileQrPublicId(guestProfile);
  if (!pub) return "";
  return `THREA1|${pub}|${guestProfile.checkInToken}`;
}

function getSelectedDialCode() {
  const dc = window.ThreaDialCodes;
  return dc && dc.DEFAULT_DIAL ? dc.DEFAULT_DIAL : "966";
}

/** تنسيق رقم واتساب دولي (E.164 بدون +) */
function normalizeWhatsAppPhone(localRaw, dialOverride) {
  const dial = dialOverride || getSelectedDialCode();
  const dc = window.ThreaDialCodes;
  if (dc && typeof dc.formatE164 === "function") {
    return dc.formatE164(dial, localRaw);
  }
  let p = String(localRaw || "").replace(/\D/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  while (p.startsWith("0")) p = p.slice(1);
  const d = String(dial).replace(/\D/g, "");
  if (d && p.startsWith(d)) return p;
  return d + p;
}

function getSiteBaseUrl() {
  const cfg = globalThis.THREA_APP_CONFIG;
  if (cfg && cfg.siteBaseUrl) {
    return String(cfg.siteBaseUrl).replace(/\/$/, "");
  }
  return globalThis.location.origin.replace(/\/$/, "");
}

function buildGuestSeatViewUrl(profileOrId, checkInToken) {
  const base = getSiteBaseUrl();
  const t = encodeURIComponent(checkInToken || "");
  const profile =
    profileOrId && typeof profileOrId === "object" ? profileOrId : null;
  const code =
    profile && profile.inviteCode
      ? profile.inviteCode
      : null;
  if (code) {
    return `${base}/seat.html?code=${encodeURIComponent(code)}&t=${t}`;
  }
  const pub = profile
    ? getProfileQrPublicId(profile)
    : String(profileOrId || "");
  if (window.ThreaInviteCodes && window.ThreaInviteCodes.isInviteCode(pub)) {
    return `${base}/seat.html?code=${encodeURIComponent(pub)}&t=${t}`;
  }
  const nid = encodeURIComponent(
    window.ThreaStudentRoster && window.ThreaStudentRoster.normalizeGuestKey
      ? window.ThreaStudentRoster.normalizeGuestKey(pub)
      : String(pub || "").replace(/\D/g, "")
  );
  return `${base}/seat.html?nid=${nid}&t=${t}`;
}

function getWhatsAppApiBase() {
  return (
    (globalThis.THREA_APP_CONFIG && globalThis.THREA_APP_CONFIG.whatsappApiBase) ||
    "https://wpp.northelite0.com"
  ).replace(/\/$/, "");
}

async function fetchWhatsAppStatus() {
  const base = getWhatsAppApiBase();
  const res = await fetch(`${base}/status`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, connected: !!data.connected, status: data.status };
}

function formatSeatShortForUi(seat) {
  if (window.ThreaSeats && typeof window.ThreaSeats.formatSeatShort === "function") {
    return window.ThreaSeats.formatSeatShort(seat);
  }
  if (!seat) return "";
  const side = seat.section === "RIGHT" ? "يمين" : "يسار";
  return `${side} صف ${seat.row} مقعد ${seat.seatInRow}`;
}

async function openBookingConfirmModal() {
  if (!bookingConfirmModal || !guestProfile) return;
  bookingConfirmModal.hidden = false;
  if (bookingConfirmLead) {
    let lead = `شكراً ${guestProfile.studentName}. تم حجز مقاعدك.`;
    if (lastBookingRestored) {
      lead +=
        " وُجد حجز سابق لنفس رقم الهوية — تم عرض المقاعد المحفوظة (قد تختلف عن آخر معايرة).";
    } else {
      lead += " يُرسل رمز الدعوة تلقائياً إلى واتساب خلال لحظات.";
    }
    bookingConfirmLead.textContent = lead;
  }
  if (bookingSendWaBtn) {
    bookingSendWaBtn.hidden = true;
  }
  if (bookingConfirmSeats) {
    bookingConfirmSeats.innerHTML = "";
    assignedSeats.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "booking-seat-line";
      const label =
        i === 0
          ? "الخريج (يسار)"
          : `${guestProfile.companionName || "المرافق"} (يمين)`;
      const short = formatSeatShortForUi(s);
      row.textContent = short
        ? `${label}: ${short} — ${s.name}`
        : `${label}: ${s.name}`;
      bookingConfirmSeats.appendChild(row);
    });
  }
  if (bookingInviteNames) {
    let t = guestProfile.studentName;
    if (guestProfile.companionName) {
      t += ` — والمرافق: ${guestProfile.companionName}`;
    }
    bookingInviteNames.textContent = t;
  }
  const hintEl = document.getElementById("booking-invite-hint");
  if (hintEl && globalThis.THREA_INVITE && typeof globalThis.THREA_INVITE.inviteQrScreenHint === "function") {
    hintEl.textContent = globalThis.THREA_INVITE.inviteQrScreenHint();
  }
  const codeEl = document.getElementById("booking-invite-code");
  if (codeEl) {
    if (guestProfile.inviteCode) {
      codeEl.hidden = false;
      codeEl.textContent = `رمز الدعوة: ${guestProfile.inviteCode}`;
    } else {
      codeEl.hidden = true;
      codeEl.textContent = "";
    }
  }
  renderBookingQr().catch((e) => console.warn("booking QR", e));

  if (bookingWaStatus) {
    bookingWaStatus.hidden = false;
    bookingWaStatus.textContent = "";
  }

  if (lastBookingRestored) {
    if (bookingWaStatus) {
      bookingWaStatus.textContent =
        "حجز سابق — لم يُرسل واتساب تلقائياً لتجنب تكرار الرسالة.";
    }
  } else {
    sendBookingWhatsApp({ auto: true });
  }

  startBookingConfirmAutoRedirect(BOOKING_CONFIRM_REDIRECT_SEC);
}

function clearBookingConfirmRedirectTimers() {
  if (bookingConfirmRedirectTimer) {
    clearTimeout(bookingConfirmRedirectTimer);
    bookingConfirmRedirectTimer = null;
  }
  if (bookingConfirmRedirectInterval) {
    clearInterval(bookingConfirmRedirectInterval);
    bookingConfirmRedirectInterval = null;
  }
}

function resetBookingConfirmCountdownUi() {
  if (bookingConfirmCountdownEl) bookingConfirmCountdownEl.textContent = "";
  if (bookingContinueVisualBtn) {
    bookingContinueVisualBtn.textContent = "عرض المقاعد الآن";
  }
}

/**
 * @param {number} seconds
 */
function startBookingConfirmAutoRedirect(seconds) {
  clearBookingConfirmRedirectTimers();
  let left = seconds;

  const tick = () => {
    if (bookingConfirmCountdownEl) {
      bookingConfirmCountdownEl.textContent =
        left > 0
          ? `سيتم عرض مقاعدك تلقائياً خلال ${left} ثانية…`
          : "جاري فتح العرض…";
    }
    if (bookingContinueVisualBtn && left > 0) {
      bookingContinueVisualBtn.textContent = `عرض المقاعد الآن (${left})`;
    }
  };

  tick();
  bookingConfirmRedirectInterval = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      if (bookingConfirmRedirectInterval) {
        clearInterval(bookingConfirmRedirectInterval);
        bookingConfirmRedirectInterval = null;
      }
      tick();
      return;
    }
    tick();
  }, 1000);

  bookingConfirmRedirectTimer = setTimeout(() => {
    bookingConfirmRedirectTimer = null;
    proceedToSeatVisual();
  }, seconds * 1000);
}

async function proceedToSeatVisual() {
  if (bookingVisualRedirecting) return;
  bookingVisualRedirecting = true;
  clearBookingConfirmRedirectTimers();
  closeBookingConfirmModal();
  setLoading(true, "جاري فتح العرض…");
  guestSubmitInFlight = true;
  try {
    const ok = await startTheaterExperienceVisual();
    if (!ok) {
      experienceStarted = false;
      failGuestRegistration(formError.textContent || "تعذّر فتح العرض.");
    } else {
      setLoading(false);
    }
  } catch (e) {
    console.error(e);
    failGuestRegistration("حدث خطأ أثناء فتح العرض.");
  } finally {
    guestSubmitInFlight = false;
    bookingVisualRedirecting = false;
  }
}

function closeBookingConfirmModal() {
  clearBookingConfirmRedirectTimers();
  resetBookingConfirmCountdownUi();
  if (bookingConfirmModal) bookingConfirmModal.hidden = true;
}

function ensureQrCodeLib() {
  if (typeof QRCode !== "undefined" && typeof QRCode.toCanvas === "function") {
    return true;
  }
  return false;
}

function getQrCenterIconSrc() {
  const cfg = globalThis.THREA_APP_CONFIG;
  return (cfg && cfg.qrCenterIcon) || "./assets/icon2.jpeg";
}

function qrCanvasBaseOptions(overrides) {
  return {
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#0a0a12", light: "#ffffff" },
    ...overrides,
  };
}

function pathRoundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function loadQrCenterIcon() {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("QR icon load failed"));
    im.src = getQrCenterIconSrc();
  });
}

function drawQrCenterIcon(ctx, canvasSize) {
  return loadQrCenterIcon().then((icon) => {
    const logoRatio = 0.2;
    const padRatio = 0.1;
    const logoSize = Math.round(canvasSize * logoRatio);
    const pad = Math.max(4, Math.round(logoSize * padRatio));
    const box = logoSize + pad * 2;
    const bx = Math.round((canvasSize - box) / 2);
    const by = Math.round((canvasSize - box) / 2);
    const ix = bx + pad;
    const iy = by + pad;

    ctx.fillStyle = "#ffffff";
    pathRoundRect(ctx, bx, by, box, box, Math.round(box * 0.14));
    ctx.fill();

    ctx.save();
    pathRoundRect(ctx, ix, iy, logoSize, logoSize, Math.round(logoSize * 0.12));
    ctx.clip();
    ctx.drawImage(icon, ix, iy, logoSize, logoSize);
    ctx.restore();
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} payload
 * @param {{ width?: number }} [opts]
 */
async function renderQrWithCenterIcon(canvas, payload, opts) {
  if (!canvas || !payload || !ensureQrCodeLib()) return;
  const width = (opts && opts.width) || 200;
  const options = qrCanvasBaseOptions({ width, ...opts });
  await QRCode.toCanvas(canvas, payload, options);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  try {
    await drawQrCenterIcon(ctx, canvas.width);
  } catch (e) {
    console.warn("QR center icon:", e);
  }
}

async function renderBookingQr() {
  const payload = buildCheckInQrPayload();
  if (!bookingQrCanvas || !payload || !ensureQrCodeLib()) return;
  try {
    await renderQrWithCenterIcon(bookingQrCanvas, payload, { width: 200 });
  } catch (e) {
    console.warn("QR", e);
  }
}

/** نص دعوة واتساب الرسمي (مع رابط المقعد وQR في الصورة) */
function buildWhatsAppInviteCaption() {
  if (!guestProfile) return "";
  const cfg = globalThis.THREA_APP_CONFIG || {};
  const school = cfg.schoolName || "ثانوية نخبة الشمال الأهلية";
  const batch = cfg.graduationBatch || "الدفعة الخامسة";
  const principalTitle = cfg.principalTitle || "مدير المدرسة";
  const principalName = cfg.principalName || "محمد نصر الدين";
  const inviteCode = guestProfile.inviteCode || "";

  const lines =
    globalThis.THREA_INVITE &&
    typeof globalThis.THREA_INVITE.inviteOpeningLines === "function"
      ? globalThis.THREA_INVITE.inviteOpeningLines(cfg, guestProfile.studentName).slice()
      : [
          `*حفل تخرّج ${batch} ب${school}*`,
          "",
          "*المكرم :*",
          "",
          `*${guestProfile.studentName}*`,
          "",
        ];
  if (inviteCode) {
    lines.push(`🔑 *رمز الدعوة:* ${inviteCode}`, "(4 أرقام — للاستعلام عن مقعدك)", "");
  }
  lines.push(
    "",
    "📱 *هام لمستخدمي أجهزة الآيفون:*",
    "لضمان ظهور الروابط بشكل صحيح نأمل إضافة الرقم المرسل إلى سجل الهاتف لديك.",
    ""
  );
  const studentSeat = assignedSeats[0];
  if (studentSeat) {
    lines.push("", "📍 *موقع مقعد الخريج (يسار):*", studentSeat.name);
  }

  if (guestProfile.companionName && assignedSeats[1]) {
    lines.push(
      "",
      "📍 *موقع مقعد المرافق (يمين):*",
      `*${guestProfile.companionName}*`,
      assignedSeats[1].name
    );
  }

  const seatLink = guestProfile.checkInToken
    ? globalThis.ThreaLinks
      ? globalThis.ThreaLinks.buildSeatViewUrl(guestProfile)
      : buildGuestSeatViewUrl(guestProfile, guestProfile.checkInToken)
    : "";
  if (seatLink) {
    lines.push("", "🔗 *عرض المقاعد على الخريطة:*", seatLink);
  }

  const rsvpLink =
    globalThis.ThreaLinks && guestProfile.checkInToken
      ? globalThis.ThreaLinks.buildRsvpUrl(guestProfile)
      : "";
  if (rsvpLink) {
    lines.push("", "✅ *تأكيد الحضور أو الاعتذار:*", rsvpLink);
  }

  const womenFrom = cfg.checkInWomenFrom || "6:45 م";
  const womenTo = cfg.checkInWomenTo || "7:00 م";
  const menFrom = cfg.checkInMenFrom || cfg.checkInStartTime || "7:15 م";

  lines.push(
    "",
    "⚠️ *ملاحظة هامة:*",
    "عند *الوصول* إلى موقع الحفل اعرض رمز الاستجابة (QR) الظاهر في الصورة أعلاه .",
    `تسجيل الدخول للنساء يبدأ من الساعة *${womenFrom}* إلى الساعة *${womenTo}*.`,
    `يبدأ تسجيل الدخول للرجال *${menFrom}*.`,
    "",
    "نسعد بحضوركم ومشاركتكم هذه المناسبة المميزة، مع أطيب التهاني للخريجين وأسرهم، وأصدق الأمنيات لهم بمزيد من النجاح والتوفيق.",
    "",
    `*${principalTitle}*`,
    `*${principalName}*`
  );

  return lines.join("\n");
}

/**
 * @param {{ auto?: boolean }} [opts]
 */
async function sendBookingWhatsApp(opts) {
  const isAuto = !!(opts && opts.auto);
  if (!guestProfile || !bookingWaStatus) return;
  if (bookingSendWaBtn) bookingSendWaBtn.hidden = true;
  const base = getWhatsAppApiBase();
  const phone = normalizeWhatsAppPhone(guestProfile.whatsappPhone);

  if (!phone || phone.length < 10) {
    bookingWaStatus.hidden = false;
    bookingWaStatus.textContent =
      "رقم واتساب غير صالح. تحقق من رمز الدولة ورقم الجوال.";
    if (bookingSendWaBtn) bookingSendWaBtn.hidden = false;
    return;
  }

  if (!guestProfile.checkInToken) {
    bookingWaStatus.hidden = false;
    bookingWaStatus.textContent =
      "تعذّر إنشاء رمز الدخول (تحقق من حفظ الحجز في Supabase).";
    if (bookingSendWaBtn) bookingSendWaBtn.hidden = false;
    return;
  }
  const caption = buildWhatsAppInviteCaption();

  bookingWaStatus.hidden = false;
  bookingWaStatus.textContent = isAuto
    ? "جاري إرسال الدعوة إلى واتساب تلقائياً…"
    : "جاري الإرسال…";

  if (!ensureQrCodeLib()) {
    bookingWaStatus.textContent =
      "تعذّر تحميل مكتبة QR. ارفع مجلد vendor/qrcode.min.js مع index.html ثم حدّث الصفحة Ctrl+F5.";
    if (bookingSendWaBtn) bookingSendWaBtn.hidden = false;
    return;
  }

  try {
    const st = await fetchWhatsAppStatus();
    if (!st.connected) {
      throw new Error(
        st.ok
          ? "خادم واتساب غير متصل — افتح https://wpp.northelite0.com/qr وامسح الرمز من هاتف الإرسال."
          : "تعذّر الوصول لخادم واتساب (تحقق من threa-config.js والرابط https://wpp.northelite0.com)."
      );
    }

    const canvas = document.createElement("canvas");
    const payload = buildCheckInQrPayload();
    if (!payload) throw new Error("رمز الدخول غير جاهز.");
    await renderQrWithCenterIcon(canvas, payload, { width: 512 });
    const imageBase64 = canvas.toDataURL("image/png");

    const res = await fetch(`${base}/send-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, imageBase64, caption }),
    });
    const rawBody = await res.text();
    let data = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch (_) {
      data = { error: rawBody ? rawBody.slice(0, 280) : "" };
    }
    if (!res.ok) {
      throw new Error(
        data.error || data.message || res.statusText || `HTTP ${res.status}`
      );
    }
    bookingWaStatus.textContent = `تم إرسال الدعوة إلى واتساب (${phone}) بنجاح.`;
    if (bookingSendWaBtn) bookingSendWaBtn.hidden = true;
    if (
      window.ThreaGuestAssignments &&
      guestProfile &&
      typeof window.ThreaGuestAssignments.updateWhatsAppStatus === "function"
    ) {
      const pub = guestProfile.inviteCode || guestProfile.nationalId;
      window.ThreaGuestAssignments.updateWhatsAppStatus(pub, "sent").catch(
        () => {}
      );
    }
  } catch (e) {
    console.error("sendBookingWhatsApp:", e);
    const errMsg =
      (e && e.message) ||
      "تعذّر إرسال الدعوة. اضغط «إعادة الإرسال» أو راجع خادم واتساب.";
    bookingWaStatus.textContent = errMsg;
    if (
      window.ThreaGuestAssignments &&
      guestProfile &&
      typeof window.ThreaGuestAssignments.updateWhatsAppStatus === "function"
    ) {
      const pub = guestProfile.inviteCode || guestProfile.nationalId;
      window.ThreaGuestAssignments.updateWhatsAppStatus(
        pub,
        "failed",
        errMsg
      ).catch(() => {});
    }
    if (bookingSendWaBtn) {
      bookingSendWaBtn.hidden = false;
      bookingSendWaBtn.textContent = "إعادة الإرسال";
    }
  }
}

function initBookingConfirmModal() {
  if (bookingSendWaBtn) {
    bookingSendWaBtn.addEventListener("click", () => {
      sendBookingWhatsApp();
    });
  }
  if (bookingContinueVisualBtn) {
    bookingContinueVisualBtn.addEventListener("click", () => {
      proceedToSeatVisual();
    });
  }
}

function initPhoneCountrySelect() {
  /* السعودية +966 فقط — بادئة ثابتة في HTML */
}

async function checkExistingBookingForNationalId(nationalId) {
  const ga = window.ThreaGuestAssignments;
  if (!ga || typeof ga.hasExistingBooking !== "function") return null;
  if (ga.ready) await ga.ready;
  if (!ga.hasExistingBooking(nationalId)) return null;
  const ex = ga.getExistingForNationalId(nationalId);
  if (!ex) return null;
  const link = buildGuestSeatViewUrl(ex, ex.checkInToken);
  return { existing: ex, link };
}

function initNationalIdLookup() {
  if (!nationalIdInput || !window.ThreaStudentRoster) return;
  async function sync() {
    if (!studentNameInput) return;
    const id = window.ThreaStudentRoster.normalizeNationalId(nationalIdInput.value);
    const name = window.ThreaStudentRoster.lookupNameByNationalId(id);
    studentNameInput.value = name || "";
    if (id.length >= 10) {
      const booked = await checkExistingBookingForNationalId(id);
      if (booked) {
        setFormError(
          `رقم الهوية مسجّل مسبقاً — لا يمكن الحجز مرة أخرى. عرض مقعدك: ${booked.link}`
        );
        return;
      }
    }
    if (formError && formError.textContent.includes("مسجّل مسبقاً")) {
      setFormError("");
    }
  }
  nationalIdInput.addEventListener("blur", () => {
    sync();
  });
  nationalIdInput.addEventListener("change", () => {
    sync();
  });
}

/**
 * تخصيص مقاعد: الطالب يسار، المرافق يمين (إن وُجد).
 * @param {Seat[]} pool
 */
async function assignSeatsForParty(pool) {
  assignedSeats = [];
  lastBookingRestored = false;
  lastBookingSeatsFull = false;
  showWaitlistOffer(false);
  const n = partySeatCount();
  const hasCompanion = !!(guestProfile && guestProfile.hasCompanion);

  const quotaCheck = await assertStudentCompanionQuota(n);
  if (!quotaCheck.ok) {
    lastBookingSeatsFull = true;
    failGuestRegistration(quotaCheck.message);
    return false;
  }

  const seatsApi = window.ThreaSeats;
  const quotaApi = window.ThreaGuestQuota;
  if (quotaApi && quotaApi.ready) {
    try {
      await quotaApi.ready;
    } catch {
      /* ignore */
    }
  }
  const allSeats = seatsApi && seatsApi.SEATS ? seatsApi.SEATS : pool;
  if (
    quotaApi &&
    typeof quotaApi.alignSeatPoolsWithCalibration === "function"
  ) {
    quotaApi.alignSeatPoolsWithCalibration();
  }

  let studentPool;
  let companionPool;
  if (quotaApi && typeof quotaApi.getCalibratedSeatPool === "function") {
    studentPool = quotaApi.getCalibratedSeatPool("student", allSeats);
    companionPool = quotaApi.getCalibratedSeatPool("companion", allSeats);
  } else {
    studentPool =
      quotaApi && typeof quotaApi.getStudentSeatPool === "function"
        ? quotaApi.getStudentSeatPool(allSeats)
        : seatsApi && typeof seatsApi.getStudentBookingPool === "function"
          ? seatsApi.getStudentBookingPool(pool)
          : leftRightPoolsFrom(pool).leftPool;
    companionPool =
      quotaApi && typeof quotaApi.getCompanionSeatPool === "function"
        ? quotaApi.getCompanionSeatPool(allSeats)
        : seatsApi && typeof seatsApi.getCompanionBookingPool === "function"
          ? seatsApi.getCompanionBookingPool(pool)
          : leftRightPoolsFrom(pool).rightPool;
    studentPool = filterPoolToCalibrated(studentPool);
    companionPool = filterPoolToCalibrated(companionPool);
  }

  if (studentPool.length < 1 || (hasCompanion && companionPool.length < 1)) {
    const panoStore = window.ThreaPanoramaStorage;
    const pinCount =
      panoStore && typeof panoStore.getSyncStatus === "function"
        ? panoStore.getSyncStatus().pinCount
        : 0;
    const studentNeed =
      seatsApi && typeof seatsApi.getStudentBookingPool === "function"
        ? seatsApi.getStudentBookingPool(allSeats).length
        : 0;
    const companionNeed =
      seatsApi && typeof seatsApi.getCompanionBookingPool === "function"
        ? seatsApi.getCompanionBookingPool(allSeats).length
        : 0;
    failGuestRegistration(
      pinCount === 0
        ? "لم تُعاير مقاعد الحجز بعد — نفّذ supabase/import-seat-pins.sql في Supabase، أو استورد threa-panorama-pins.json من calibrate.html."
        : `مقاعد معايرة جاهزة: خريج ${studentPool.length}/${studentNeed}، مرافق ${companionPool.length}/${companionNeed}. نفّذ supabase/import-seat-pins.sql ثم supabase/reset-event-seat-pools.sql، أو من calibrate.html: تطبيق المقاعد الافتراضية → حفظ.`
    );
    return false;
  }

  const applyPickedIds = (/** @type {string[]} */ ids) => {
    const seats = ids.map((id) => SEATS.find((s) => s.id === id)).filter(Boolean);
    if (!seats || seats.length < n) return false;
    assignedSeats = seats.slice(0, n);
    return true;
  };

  const pickSeat =
    window.ThreaSeatPicker && typeof window.ThreaSeatPicker.pickSeatsInFillOrder === "function"
      ? window.ThreaSeatPicker.pickSeatsInFillOrder.bind(window.ThreaSeatPicker)
      : pickAdjacentSeatsFromPool;

  const pickSeatIdsFn = (/** @type {Set<string>} */ occupied) => {
    const leftAv = studentPool.filter((s) => !occupied.has(s.id));
    const stu = pickSeat(leftAv, 1);
    if (!stu) return null;
    if (!hasCompanion) return [stu[0].id];
    const rightAv = companionPool.filter((s) => !occupied.has(s.id));
    const comp = pickSeat(rightAv, 1);
    if (!comp) return null;
    return [stu[0].id, comp[0].id];
  };

  if (guestProfile && window.ThreaGuestAssignments) {
    try {
      if (window.ThreaGuestAssignments.ready) {
        await window.ThreaGuestAssignments.ready;
      }

      const result = await window.ThreaGuestAssignments.assignOrRestore(
        {
          nationalId: guestProfile.nationalId,
          studentName: guestProfile.studentName,
          companionName: guestProfile.companionName || "",
          whatsappPhone: guestProfile.whatsappPhone,
          hasCompanion,
        },
        pickSeatIdsFn
      );

      if (result.alreadyBooked) {
        failGuestRegistration(
          "رقم الهوية مسجّل مسبقاً — لا يمكن الحجز مرة أخرى."
        );
        return false;
      }

      if (result.seatIds && result.seatIds.length >= n && applyPickedIds(result.seatIds)) {
        lastBookingRestored = !!result.restored;
        if (result.checkInToken) {
          guestProfile.checkInToken = result.checkInToken;
        }
        if (result.inviteCode) {
          guestProfile.inviteCode = result.inviteCode;
        }
        if (result.cloudSaveFailed) {
          console.warn(
            "المقاعد معروضة لكن لم تُحفظ في Supabase — راجع SUPABASE-SETUP.md."
          );
        } else if (result.offline) {
          console.warn(
            "تخصيص محلي فقط — Supabase غير متصل؛ قد تتكرر المقاعد بين المتصفحات."
          );
        }
        return true;
      }

      const st = window.ThreaGuestAssignments.getStatus();
      if (st.permissionDenied || /permission/i.test(String(st.lastError))) {
        failGuestRegistration(
          st.rulesHelp ||
            "صلاحيات Supabase مرفوضة. نفّذ supabase/schema.sql في SQL Editor."
        );
        return false;
      }
      if (st.lastError && !st.firestoreOk) {
        failGuestRegistration(
          "تعذّر الاتصال بقاعدة البيانات. تحقق من Supabase والجداول."
        );
        return false;
      }

      lastBookingSeatsFull = true;
      failGuestRegistration(
        "لا تتوفر مقاعد كافية غير محجوزة. يمكنك الانضمام لقائمة الانتظار أدناه."
      );
      return false;
    } catch (err) {
      console.error(err);
      const code = err && err.code ? String(err.code) : "";
      if (code === "permission-denied" || /permission/i.test(String(err.message))) {
        failGuestRegistration(
          window.ThreaGuestAssignments && window.ThreaGuestAssignments.RULES_HELP_AR
            ? window.ThreaGuestAssignments.RULES_HELP_AR
            : "صلاحيات Supabase مرفوضة — نفّذ supabase/schema.sql."
        );
      } else {
        failGuestRegistration("تعذّر حفظ التسجيل. تحقق من الاتصال بـ Supabase ونفّذ supabase/full-schema.sql.");
      }
      return false;
    }
  }

  const occ = window.ThreaGuestAssignments
    ? window.ThreaGuestAssignments.getOccupiedSeatIds()
    : new Set();
  const pickedIds = pickSeatIdsFn(occ);
  if (!pickedIds || pickedIds.length !== n) {
    lastBookingSeatsFull = true;
    failGuestRegistration(
      "لا تتوفر مقاعد كافية — يمكنك الانضمام لقائمة الانتظار."
    );
    return false;
  }
  if (guestProfile && !guestProfile.checkInToken) {
    guestProfile.checkInToken =
      global.crypto && typeof global.crypto.randomUUID === "function"
        ? global.crypto.randomUUID()
        : `t_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }
  return applyPickedIds(pickedIds);
}

/** فتح المشهد بعد اكتمال الحجز (بدون إعادة تخصيص). */
async function startTheaterExperienceVisual() {
  if (FORCE_WEBGL) {
    return startWebglTheaterExperience();
  }

  const imageOk = await probeTheaterPanorama();

  if (FORCE_PHOTO) {
    if (!imageOk) {
      setLoading(true, "تعذّر تحميل صورة القاعة. تحقق من وجود الملف theater.JPG.");
      return false;
    }
    return startPhotoPanoramaExperience();
  }

  if (imageOk) {
    return startPhotoPanoramaExperience();
  }

  return startWebglTheaterExperience();
}

async function resolveAssignmentPool() {
  const calibrated = getCalibratedSeats();
  if (FORCE_WEBGL) {
    return { pool: calibrated, imageOk: false };
  }
  const imageOk = await probeTheaterPanorama();
  if (FORCE_PHOTO) {
    return { pool: calibrated, imageOk };
  }
  if (imageOk) {
    return { pool: calibrated, imageOk: true };
  }
  return { pool: calibrated, imageOk: false };
}

function initGuestGate() {
  guestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (theaterExperienceLocked || guestSubmitInFlight) return;
    setFormError("");

    const roster = window.ThreaStudentRoster;
    const nationalRaw = nationalIdInput ? nationalIdInput.value : "";
    const nationalId = roster
      ? roster.normalizeNationalId(nationalRaw)
      : String(nationalRaw || "").replace(/\D/g, "");
    const studentName = studentNameInput ? studentNameInput.value.trim() : "";
    const companionName = companionNameInput ? companionNameInput.value.trim() : "";
    const whatsappLocal = whatsappPhoneInput ? whatsappPhoneInput.value.trim() : "";
    const whatsappPhone = normalizeWhatsAppPhone(whatsappLocal);

    const err = validateGuestForm(nationalId, studentName, companionName, whatsappLocal);
    if (err) {
      setFormError(err);
      return;
    }

    if (window.ThreaGuestAssignments) {
      const booked = await checkExistingBookingForNationalId(nationalId);
      if (booked) {
        setFormError(
          `رقم الهوية مسجّل مسبقاً — لا يمكن الحجز مرة أخرى. عرض مقعدك: ${booked.link}`
        );
        return;
      }
    }

    const hasCompanion = companionName.length >= 2;
    guestProfile = {
      nationalId,
      studentName,
      companionName: hasCompanion ? companionName : "",
      whatsappPhone,
      hasCompanion,
    };

    guestSubmitInFlight = true;
    theaterExperienceLocked = true;
    guestSubmit.disabled = true;
    registrationGate.hidden = true;
    setLoading(true, "جاري الحجز…");

    try {
      if (window.ThreaPanoramaStorage && window.ThreaPanoramaStorage.ready) {
        await window.ThreaPanoramaStorage.ready;
      }
      if (window.ThreaStudentRoster && window.ThreaStudentRoster.ready) {
        await window.ThreaStudentRoster.ready;
      }
      if (window.ThreaGuestAssignments && window.ThreaGuestAssignments.ready) {
        await window.ThreaGuestAssignments.ready;
      }

      const { pool, imageOk } = await resolveAssignmentPool();

      if (FORCE_PHOTO && !imageOk) {
        experienceStarted = false;
        failGuestRegistration(
          "تعذّر تحميل صورة القاعة. تحقق من وجود الملف theater.JPG."
        );
        return;
      }

      if (!pool.length) {
        experienceStarted = false;
        failGuestRegistration(
          "لم تُعاير مقاعد الحجز بعد — لا يمكن الحجز حتى تُدخل إحداثيات المقاعد في صفحة المعايرة."
        );
        return;
      }

      const capCheck = await assertStudentCompanionQuota(partySeatCount());
      if (!capCheck.ok) {
        experienceStarted = false;
        lastBookingSeatsFull = true;
        failGuestRegistration(capCheck.message);
        showWaitlistOffer(true);
        return;
      }

      if (!(await assignSeatsForParty(pool))) {
        experienceStarted = false;
        const st =
          window.ThreaGuestAssignments &&
          typeof window.ThreaGuestAssignments.getStatus === "function"
            ? window.ThreaGuestAssignments.getStatus()
            : null;
        if (!formError.textContent || formError.hidden) {
          const panoSt =
            window.ThreaPanoramaStorage &&
            typeof window.ThreaPanoramaStorage.getSyncStatus === "function"
              ? window.ThreaPanoramaStorage.getSyncStatus()
              : null;
          const hint =
            panoSt && panoSt.pinCount === 0
              ? "لم تُعاير مقاعد الحجز — نفّذ supabase/import-seat-pins.sql أو عيّن المقاعد من calibrate.html."
              : (st && st.lastError) ||
                "تعذّر إكمال الحجز. تحقق من المقاعد المتاحة واتصال Supabase.";
          failGuestRegistration(hint);
        }
        if (lastBookingSeatsFull) {
          showWaitlistOffer(true);
        }
        return;
      }

      setLoading(false);
      await openBookingConfirmModal();
    } catch (e) {
      console.error(e);
      experienceStarted = false;
      failGuestRegistration("حدث خطأ أثناء الحجز. حاول مرة أخرى.");
    } finally {
      guestSubmitInFlight = false;
    }
  });
}

function initWaitlistUi() {
  if (waitlistJoinBtn) {
    waitlistJoinBtn.addEventListener("click", () => {
      joinWaitlistFromForm();
    });
  }
}

function initScrollSeatButton() {
  if (scrollSeatBtn) {
    scrollSeatBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!assignedSeats.length) return;
      if (experienceMode === "photo") {
        focusPanoOnParty({ keepCard: true });
      } else if (theaterApi) {
        tweenCameraToParty();
      }
    });
  }
}

async function warnIfFirestorePermissions() {
  if (!window.ThreaGuestAssignments || experienceStarted) return;
  try {
    await window.ThreaGuestAssignments.ready;
    if (
      !theaterExperienceLocked &&
      window.ThreaGuestAssignments.isPermissionDenied()
    ) {
      setFormError(window.ThreaGuestAssignments.RULES_HELP_AR);
    }
  } catch (_) {
    /* ignore */
  }
}

initScrollSeatButton();
initWaitlistUi();
initPanoZoomInteraction();
initBookingConfirmModal();
initPhoneCountrySelect();
initNationalIdLookup();
initGuestGate();
warnIfFirestorePermissions();
