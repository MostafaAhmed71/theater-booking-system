(function () {
  "use strict";

  const shell = document.getElementById("kiosk-shell");
  const homePanel = document.getElementById("kiosk-home");
  const codePanel = document.getElementById("kiosk-code-panel");
  const scanPanel = document.getElementById("kiosk-scan-panel");
  const loadingEl = document.getElementById("kiosk-loading");
  const resultGate = document.getElementById("kiosk-result-gate");
  const resultErr = document.getElementById("kiosk-result-err");
  const panoStage = document.getElementById("pano-stage");
  const panoInner = document.getElementById("pano-inner");
  const panoImg = document.getElementById("pano-img");
  const panoPinsRoot = document.getElementById("pano-pins-root");
  const seatBar = document.getElementById("kiosk-seat-bar");
  const resultName = document.getElementById("kiosk-result-name");
  const resultCode = document.getElementById("kiosk-result-code");
  const resultSeat = document.getElementById("kiosk-result-seat");
  const resultCompanion = document.getElementById("kiosk-result-companion");
  const codeInput = document.getElementById("kiosk-code-input");
  const codeSlots = document.querySelectorAll(".kiosk-slot");
  const schoolNameEl = document.getElementById("kiosk-school-name");
  const codeError = document.getElementById("kiosk-code-error");
  const scanError = document.getElementById("kiosk-scan-error");
  const scanStatus = document.getElementById("kiosk-scan-status");
  const homeFootnote = document.getElementById("kiosk-home-footnote");
  const resultBadge = document.getElementById("kiosk-result-badge");
  const codeSlotsWrap = document.querySelector(".kiosk-code-slots");
  const focusBtn = document.getElementById("seat-view-focus");
  const panoHint = document.getElementById("kiosk-pano-hint");
  const seatLegend = document.getElementById("kiosk-seat-legend");
  const fullscreenBtn = document.getElementById("kiosk-fullscreen-btn");

  const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const KIOSK_CODE_LEN = 4;

  let scanner = null;
  let scanning = false;
  let lastDecoded = "";
  let debounceT = 0;
  let assignedSeats = [];
  const PANO_ZOOM_MIN = 1;
  const PANO_ZOOM_MAX = 4;
  let panoZoomLevel = 1;
  let panoPinchStartDist = 0;
  let panoPinchStartZoom = 1;
  let panoPinchActive = false;
  let panoDragActive = false;
  /** @type {{ x: number, y: number, scrollLeft: number, scrollTop: number, pointerId: number } | null} */
  let panoDragStart = null;
  let panoHintTimer = 0;
  const reduceMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const panels = { home: homePanel, code: codePanel, scan: scanPanel };

  function tapFeedback() {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch (_) {
        /* ignore */
      }
    }
  }

  function showPanel(name) {
    const target = panels[name];
    if (!target) return;

    Object.entries(panels).forEach(([key, el]) => {
      if (!el || el === target) return;
      if (!el.hidden && !reduceMotion) {
        el.classList.remove("is-visible");
        el.classList.add("kiosk-panel--exit");
        setTimeout(() => {
          el.hidden = true;
          el.classList.remove("kiosk-panel--enter", "kiosk-panel--exit", "is-visible");
        }, 280);
      } else {
        el.hidden = true;
        el.classList.remove("kiosk-panel--enter", "kiosk-panel--exit", "is-visible");
      }
    });

    target.hidden = false;
    target.classList.remove("kiosk-panel--exit");
    if (!reduceMotion) {
      target.classList.add("kiosk-panel--enter");
      requestAnimationFrame(() => target.classList.add("is-visible"));
    } else {
      target.classList.add("is-visible");
    }
    syncKioskLayoutMode(name);
  }

  function isBrowserFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function syncFullscreenBtn() {
    if (!fullscreenBtn) return;
    const on = isBrowserFullscreen();
    const inPano = document.body.classList.contains("seat-view-body");
    fullscreenBtn.hidden = inPano;
    fullscreenBtn.classList.toggle("is-active", on);
    fullscreenBtn.setAttribute("aria-label", on ? "الخروج من ملء الشاشة" : "ملء الشاشة");
    fullscreenBtn.title = on ? "الخروج من ملء الشاشة" : "ملء الشاشة";
    const label = fullscreenBtn.querySelector(".kiosk-fs-btn__label");
    if (label) label.textContent = on ? "إنهاء ملء الشاشة" : "ملء الشاشة";
    const enterIcon = fullscreenBtn.querySelector(".kiosk-fs-btn__icon--enter");
    const exitIcon = fullscreenBtn.querySelector(".kiosk-fs-btn__icon--exit");
    if (enterIcon) enterIcon.hidden = on;
    if (exitIcon) exitIcon.hidden = !on;
  }

  async function toggleBrowserFullscreen() {
    try {
      if (isBrowserFullscreen()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else {
        const el = document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else tapFeedback();
      }
    } catch (err) {
      console.warn("fullscreen:", err);
    }
    syncFullscreenBtn();
  }

  function initKioskFullscreen() {
    if (!fullscreenBtn) return;
    fullscreenBtn.addEventListener("click", () => {
      tapFeedback();
      void toggleBrowserFullscreen();
    });
    document.addEventListener("fullscreenchange", syncFullscreenBtn);
    document.addEventListener("webkitfullscreenchange", syncFullscreenBtn);
    syncFullscreenBtn();
  }

  function syncKioskLayoutMode(panelName) {
    document.body.classList.toggle("kiosk-home-mode", panelName === "home");
    document.body.classList.toggle("kiosk-code-mode", panelName === "code");
    document.body.classList.toggle("kiosk-scan-mode", panelName === "scan");
    if (shell) {
      shell.classList.toggle(
        "kiosk-shell--immersive",
        panelName === "home" || panelName === "code" || panelName === "scan"
      );
    }
    syncFullscreenBtn();
  }

  function setLoading(on) {
    if (!loadingEl) return;
    if (on) {
      loadingEl.hidden = false;
      requestAnimationFrame(() => loadingEl.classList.add("is-visible"));
    } else {
      loadingEl.classList.remove("is-visible");
      window.setTimeout(() => {
        loadingEl.hidden = true;
      }, 280);
    }
  }

  function showCodeErr(msg) {
    if (!codeError) return;
    if (msg) {
      codeError.hidden = false;
      codeError.textContent = msg;
    } else {
      codeError.hidden = true;
      codeError.textContent = "";
    }
  }

  function showScanErr(msg) {
    if (!scanError) return;
    if (msg) {
      scanError.hidden = false;
      scanError.textContent = msg;
    } else {
      scanError.hidden = true;
      scanError.textContent = "";
    }
  }

  async function waitForGuestApi(ms) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const ga = globalThis.ThreaGuestAssignments;
      if (
        ga &&
        typeof ga.getByPublicId === "function" &&
        (typeof ga.markCheckedIn === "function" ||
          typeof ga.verifyAndCheckIn === "function")
      ) {
        return ga;
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    return null;
  }

  function parseQrPayload(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    if (/^THREA1\|/i.test(raw)) {
      const parts = raw.split("|");
      const codePart = parts[1] ? String(parts[1]).trim() : "";
      const token = parts[2] ? String(parts[2]).trim() : "";
      if (!codePart || !token) return null;
      const ic = globalThis.ThreaInviteCodes;
      const publicId =
        ic && typeof ic.normalizeInviteCode === "function" && ic.isInviteCode(codePart)
          ? ic.normalizeInviteCode(codePart)
          : codePart;
      return { publicId, token };
    }
    const ic = globalThis.ThreaInviteCodes;
    if (ic && typeof ic.parseQrLookupPart === "function") {
      const parsed = ic.parseQrLookupPart(raw);
      if (parsed && parsed.type === "invite" && parsed.inviteCode) {
        return { publicId: parsed.inviteCode, token: "" };
      }
    }
    if (ic && typeof ic.isInviteCode === "function" && ic.isInviteCode(raw)) {
      return { publicId: ic.normalizeInviteCode(raw), token: "" };
    }
    return null;
  }

  function errorVibrate() {
    if (!navigator.vibrate) return;
    try {
      navigator.vibrate([120, 60, 120, 60, 180]);
    } catch (_) {
      /* ignore */
    }
  }

  function triggerInvalidFeedback() {
    errorVibrate();
    document.body.classList.remove("kiosk-shake");
    void document.body.offsetWidth;
    document.body.classList.add("kiosk-shake");
    if (codeSlotsWrap) {
      codeSlotsWrap.classList.add("is-error");
      window.setTimeout(() => codeSlotsWrap.classList.remove("is-error"), 2200);
    }
    window.setTimeout(() => document.body.classList.remove("kiosk-shake"), 650);
  }

  /**
   * @param {ReturnType<typeof waitForGuestApi> extends Promise<infer T> ? T : never} ga
   * @param {string} publicId
   * @param {string} [token]
   */
  async function checkInGuest(ga, publicId, token) {
    const tok = String(token || "").trim();
    if (tok && typeof ga.verifyAndCheckIn === "function") {
      const rec = await ga.verifyAndCheckIn(publicId, tok);
      if (!rec) {
        return {
          error: "invalid",
          message: "الرمز غير صحيح أو لا يطابق الحجز.",
        };
      }
      return { rec };
    }

    let rec = ga.getByPublicId(publicId);
    if (!rec || !rec.seatIds || !rec.seatIds.length) {
      return {
        error: "not_found",
        message: "لا يوجد حجز بهذا الرمز. تحقق من الرمز أو امسح QR من واتساب.",
      };
    }

    if (!rec.checkedInAt && typeof ga.markCheckedIn === "function") {
      const marked = await ga.markCheckedIn(publicId);
      if (marked) rec = marked;
    }
    return { rec };
  }

  function formatSeatShort(seat) {
    if (globalThis.ThreaSeats && typeof globalThis.ThreaSeats.formatSeatShort === "function") {
      return globalThis.ThreaSeats.formatSeatShort(seat);
    }
    if (!seat) return "";
    const side = seat.section === "RIGHT" ? "يمين" : "يسار";
    return `${side} صف ${seat.row} مقعد ${seat.seatInRow}`;
  }

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
    return { x: (ew - w) / 2, y: (eh - h) / 2, w, h };
  }

  function panoUvToInnerPixel(img, panU, panV) {
    const r = getObjectFitContainContentRect(img);
    if (!r.w || !r.h) {
      const ew = img.clientWidth || img.naturalWidth || 1;
      const eh = img.clientHeight || img.naturalHeight || 1;
      return { x: panU * ew, y: panV * eh };
    }
    return { x: r.x + panU * r.w, y: r.y + panV * r.h };
  }

  function clampPanoZoom(z) {
    return Math.min(PANO_ZOOM_MAX, Math.max(PANO_ZOOM_MIN, z));
  }

  function refreshPanoOverlays() {
    if (!assignedSeats.length) return;
    attachPanoPins(assignedSeats);
    updatePanoRoute();
  }

  /**
   * @param {{ keepCenter?: boolean, focusX?: number, focusY?: number }} [opts]
   */
  function applyKioskPanoZoom(opts) {
    if (!panoStage || !panoInner || !panoImg) return;

    const stageW = panoStage.clientWidth || 1;
    const stageH = panoStage.clientHeight || 1;
    const prevW = panoInner.offsetWidth || 1;
    const prevH = panoInner.offsetHeight || 1;
    const cxRatio = (panoStage.scrollLeft + stageW / 2) / prevW;
    const cyRatio = (panoStage.scrollTop + stageH / 2) / prevH;
    const focusX = opts && typeof opts.focusX === "number" ? opts.focusX : null;
    const focusY = opts && typeof opts.focusY === "number" ? opts.focusY : null;
    const focusRatioX =
      focusX !== null && prevW ? (focusX - panoStage.scrollLeft) / stageW : null;
    const focusRatioY =
      focusY !== null && prevH ? (focusY - panoStage.scrollTop) / stageH : null;

    const innerH = Math.max(120, Math.round(stageH * panoZoomLevel));
    panoInner.style.height = `${innerH}px`;
    panoInner.style.width = "auto";
    panoInner.style.maxWidth = "none";
    panoInner.style.transform = "";
    panoInner.style.transformOrigin = "";
    panoImg.style.height = "100%";
    panoImg.style.width = "auto";
    panoImg.style.maxWidth = "none";
    panoImg.style.maxHeight = "none";

    requestAnimationFrame(() => {
      const newW = panoInner.offsetWidth || 1;
      const newH = panoInner.offsetHeight || 1;
      const maxScrollX = Math.max(0, panoStage.scrollWidth - stageW);
      const maxScrollY = Math.max(0, panoStage.scrollHeight - stageH);

      if (focusX !== null && focusY !== null && focusRatioX !== null && focusRatioY !== null) {
        const nextFocusX = (focusX / prevW) * newW;
        const nextFocusY = (focusY / prevH) * newH;
        panoStage.scrollLeft = Math.max(
          0,
          Math.min(maxScrollX, nextFocusX - focusRatioX * stageW)
        );
        panoStage.scrollTop = Math.max(
          0,
          Math.min(maxScrollY, nextFocusY - focusRatioY * stageH)
        );
      } else if (!opts || opts.keepCenter !== false) {
        panoStage.scrollLeft = Math.max(0, Math.min(maxScrollX, cxRatio * newW - stageW / 2));
        panoStage.scrollTop = Math.max(0, Math.min(maxScrollY, cyRatio * newH - stageH / 2));
      }

      refreshPanoOverlays();
    });
  }

  function zoomKioskPanoAt(nextZoom, focusX, focusY) {
    panoZoomLevel = clampPanoZoom(nextZoom);
    if (typeof focusX === "number" && typeof focusY === "number") {
      applyKioskPanoZoom({ focusX, focusY });
    } else {
      applyKioskPanoZoom({ keepCenter: true });
    }
  }

  function panoTouchDist(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function showPanoHint() {
    if (!panoHint || reduceMotion) return;
    panoHint.hidden = false;
    panoHint.classList.add("is-visible");
    window.clearTimeout(panoHintTimer);
    panoHintTimer = window.setTimeout(() => {
      panoHint.classList.remove("is-visible");
      window.setTimeout(() => {
        panoHint.hidden = true;
      }, 400);
    }, 4200);
  }

  function hidePanoHint() {
    if (!panoHint) return;
    panoHint.classList.remove("is-visible");
    panoHint.hidden = true;
    window.clearTimeout(panoHintTimer);
  }
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

  function partyPinCentroid(seats) {
    const store = globalThis.ThreaPanoramaStorage;
    if (!store || !seats.length) {
      return { panU: 0.52, panV: 0.42 };
    }
    let su = 0;
    let sv = 0;
    for (const s of seats) {
      const d = store.getDisplayPinForSeat(s);
      su += d.panU;
      sv += d.panV;
    }
    return { panU: su / seats.length, panV: sv / seats.length };
  }

  function updatePanoRoute() {
    const api = globalThis.ThreaPanoramaPath;
    if (!api || !panoInner || !panoImg) return;
    if (!assignedSeats.length) {
      api.clear(panoInner);
      return;
    }
    api.renderForSeats({
      mount: panoInner,
      img: panoImg,
      seats: assignedSeats,
    });
  }

  function attachPanoPins(seats) {
    if (!panoPinsRoot || !globalThis.ThreaPanoramaStorage) return;
    panoPinsRoot.replaceChildren();
    seats.forEach((seat, idx) => {
      const d = globalThis.ThreaPanoramaStorage.getDisplayPinForSeat(seat);
      const pin = document.createElement("div");
      pin.className = "pano-pin";
      if (idx === 0) pin.classList.add("pano-pin--student", "pano-pin--primary");
      else pin.classList.add("pano-pin--companion");
      const hl = document.createElement("span");
      hl.className = "pano-seat-hl";
      pin.appendChild(hl);
      const { leftPct, topPct } = panoUvToLayoutPercent(panoImg, d.panU, d.panV);
      pin.style.left = `${leftPct}%`;
      pin.style.top = `${topPct}%`;
      panoPinsRoot.appendChild(pin);
      pin.classList.add("is-pulsing");
    });
  }

  function scrollToSeats() {
    if (!panoStage || !panoImg || !assignedSeats.length) return;
    const c = partyPinCentroid(assignedSeats);
    const { x: pinX, y: pinY } = panoUvToInnerPixel(panoImg, c.panU, c.panV);
    const vw = panoStage.clientWidth;
    const vh = panoStage.clientHeight;
    const maxScrollX = Math.max(0, panoStage.scrollWidth - vw);
    const maxScrollY = Math.max(0, panoStage.scrollHeight - vh);
    panoStage.scrollTo({
      left: Math.max(0, Math.min(maxScrollX, pinX - vw / 2)),
      top: Math.max(0, Math.min(maxScrollY, pinY - vh / 2)),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  function focusOnSeats() {
    if (panoZoomLevel < 1.45) {
      panoZoomLevel = 1.6;
      applyKioskPanoZoom({ keepCenter: false });
    }
    requestAnimationFrame(() => scrollToSeats());
  }

  function hideResultUi() {
    if (panoInner && globalThis.ThreaPanoramaPath) {
      globalThis.ThreaPanoramaPath.clear(panoInner);
    }
    if (panoStage) {
      panoStage.classList.remove("is-dragging");
      panoDragActive = false;
      panoDragStart = null;
    }
    panoPinchActive = false;
    panoZoomLevel = 1;
    hidePanoHint();
    if (shell) shell.hidden = false;
    if (resultGate) resultGate.hidden = true;
    if (panoStage) panoStage.hidden = true;
    if (seatBar) {
      seatBar.classList.remove("is-visible");
      seatBar.hidden = true;
    }
    if (seatLegend) {
      seatLegend.hidden = true;
      seatLegend.classList.remove("is-visible");
    }
    document.body.classList.remove(
      "seat-view-body",
      "kiosk-pano-fullscreen",
      "kiosk-home-mode",
      "kiosk-code-mode",
      "kiosk-scan-mode"
    );
    if (shell) shell.classList.remove("kiosk-shell--immersive");
    assignedSeats = [];
  }

  function updateSlotsUi(prevCode) {
    const code = codeInput ? normalizeCodePartial(codeInput.value) : "";
    codeSlots.forEach((slot, i) => {
      const ch = slot.querySelector(".kiosk-slot-char");
      const c = code[i];
      const had = prevCode && prevCode[i];
      if (ch) ch.textContent = c || "·";
      slot.classList.toggle("is-filled", !!c);
      slot.classList.toggle("is-active", i === code.length && code.length < KIOSK_CODE_LEN);
      if (c && c !== had && !reduceMotion) {
        slot.classList.remove("is-pop");
        void slot.offsetWidth;
        slot.classList.add("is-pop");
        window.setTimeout(() => slot.classList.remove("is-pop"), 420);
      }
    });
  }

  function setCodeValue(val) {
    if (!codeInput) return;
    const prev = normalizeCodePartial(codeInput.value);
    codeInput.value = normalizeCodePartial(val);
    updateSlotsUi(prev);
    showCodeErr("");
  }

  function showResultUi(rec, seats, displayCode) {
    assignedSeats = seats;
    if (shell) shell.hidden = true;
    if (resultGate) resultGate.hidden = true;
    if (panoStage) {
      panoStage.hidden = false;
      panoStage.classList.add("pano-stage--explore");
    }
    if (seatBar) {
      seatBar.hidden = false;
      seatBar.classList.remove("is-visible");
      requestAnimationFrame(() => seatBar.classList.add("is-visible"));
    }
    if (seatLegend) {
      seatLegend.hidden = false;
      requestAnimationFrame(() => seatLegend.classList.add("is-visible"));
      const companionItem = seatLegend.querySelector(".kiosk-seat-legend__item--companion");
      if (companionItem) {
        companionItem.hidden = seats.length < 2;
      }
    }

    const ic = globalThis.ThreaInviteCodes;
    const code =
      displayCode ||
      (rec.inviteCode && ic && ic.normalizeInviteCode
        ? ic.normalizeInviteCode(rec.inviteCode)
        : rec.inviteCode || "");

    if (resultBadge) {
      const checked = !!rec.checkedInAt;
      resultBadge.textContent = checked ? "تم تسجيل حضورك ✓" : "مقعدك";
      resultBadge.classList.toggle("kiosk-result-badge--checked", checked);
    }
    if (resultName) resultName.textContent = rec.studentName || "—";
    if (resultCode) {
      resultCode.textContent = formatKioskDisplayCode(rec.inviteCode || code || "");
    }
    if (resultSeat && seats[0]) {
      const api = globalThis.ThreaSeats;
      const short =
        api && typeof api.formatSeatShort === "function"
          ? api.formatSeatShort(seats[0])
          : formatSeatShort(seats[0]);
      resultSeat.textContent = `خريج: ${short}`;
    }
    if (resultCompanion) {
      if (seats.length > 1 && seats[1]) {
        const api = globalThis.ThreaSeats;
        const short =
          api && typeof api.formatSeatShort === "function"
            ? api.formatSeatShort(seats[1])
            : formatSeatShort(seats[1]);
        resultCompanion.hidden = false;
        resultCompanion.textContent = `مرافق: ${short}`;
      } else {
        resultCompanion.hidden = true;
        resultCompanion.textContent = "";
      }
    }
    document.body.classList.add("seat-view-body", "kiosk-pano-fullscreen");
    document.body.classList.remove("kiosk-home-mode", "kiosk-code-mode", "kiosk-scan-mode");
    if (shell) shell.classList.remove("kiosk-shell--immersive");

    const onReady = async () => {
      if (globalThis.ThreaPanoramaStorage && globalThis.ThreaPanoramaStorage.ready) {
        await globalThis.ThreaPanoramaStorage.ready;
      }
      if (globalThis.ThreaGuestQuota && globalThis.ThreaGuestQuota.ready) {
        await globalThis.ThreaGuestQuota.ready;
      }
      attachPanoPins(assignedSeats);
      updatePanoRoute();
      panoZoomLevel = 1;
      applyKioskPanoZoom({ keepCenter: false });
      showPanoHint();
      requestAnimationFrame(() => {
        updatePanoRoute();
        scrollToSeats();
      });
    };
    if (panoImg.complete && panoImg.naturalWidth > 0) onReady();
    else panoImg.addEventListener("load", onReady, { once: true });
  }

  /**
   * @param {string} msg
   * @param {{ shake?: boolean }} [opts]
   */
  function showLookupError(msg, opts) {
    const shake = !opts || opts.shake !== false;
    hideResultUi();
    if (shell) shell.hidden = false;

    if (shake) triggerInvalidFeedback();

    if (codePanel && !codePanel.hidden) {
      showCodeErr(msg);
    } else if (scanPanel && !scanPanel.hidden) {
      showScanErr(msg);
    } else if (resultGate && resultErr) {
      resultErr.textContent = msg;
      resultGate.hidden = false;
      resultGate.classList.add("is-visible");
      window.setTimeout(() => {
        resultGate.classList.remove("is-visible");
        resultGate.hidden = true;
      }, 4500);
    }
  }

  /**
   * @param {string} publicIdRaw
   * @param {string} [tokenRaw]
   */
  async function lookupAndShow(publicIdRaw, tokenRaw) {
    const ic = globalThis.ThreaInviteCodes;
    const ga = await waitForGuestApi(12000);
    if (!ga) {
      showLookupError("تعذّر الاتصال بقاعدة البيانات. أعد المحاولة.");
      return;
    }

    let publicId = String(publicIdRaw || "").trim();
    if (ic && typeof ic.normalizeInviteCode === "function") {
      const normalized = ic.normalizeInviteCode(publicId);
      if (normalized) publicId = normalized;
    }
    if (/^\d+$/.test(publicId.replace(/\D/g, "")) && typeof ga.lookupKioskNumericCode === "function") {
      const lookup = ga.lookupKioskNumericCode(publicId);
      if (lookup.error === "short") {
        showLookupError("أدخل 4 أرقام.");
        return;
      }
      if (!lookup.rec || !lookup.rec.inviteCode) {
        showLookupError("لا يوجد حجز بهذا الرقم.", { shake: true });
        return;
      }
      publicId = lookup.rec.inviteCode;
    }

    if (!publicId) {
      showLookupError("أدخل 4 أرقام صالحة.");
      return;
    }

    setLoading(true);
    showScanErr("");
    showCodeErr("");

    try {
      if (ga.ready) await ga.ready;
      if (globalThis.ThreaPanoramaStorage && globalThis.ThreaPanoramaStorage.ready) {
        await globalThis.ThreaPanoramaStorage.ready;
      }

      const token = String(tokenRaw || "").trim();
      const check = await checkInGuest(ga, publicId, token);
      if (check.error || !check.rec) {
        showLookupError(
          check.message || "لا يوجد حجز بهذا الرمز.",
          { shake: true }
        );
        return;
      }

      const rec = check.rec;
      const SEATS = globalThis.ThreaSeats && globalThis.ThreaSeats.SEATS;
      if (!SEATS) {
        showLookupError("تعذّر تحميل خريطة المقاعد.", { shake: false });
        return;
      }

      const seats = rec.seatIds
        .map((id) => SEATS.find((s) => s.id === id))
        .filter(Boolean);
      if (!seats.length) {
        showLookupError("المقعد غير موجود في الخريطة.", { shake: false });
        return;
      }

      tapFeedback();
      await stopScanner();
      showPanel("home");
      showResultUi(rec, seats, publicId);
    } catch (e) {
      console.error(e);
      const st = typeof ga.getStatus === "function" ? ga.getStatus() : null;
      if (st && st.permissionDenied) {
        showLookupError(ga.RULES_HELP_AR || "صلاحيات قاعدة البيانات غير كافية.", {
          shake: false,
        });
      } else {
        showLookupError("حدث خطأ أثناء البحث. حاول مرة أخرى.", { shake: true });
      }
    } finally {
      setLoading(false);
    }
  }

  function normalizeCodePartial(val) {
    return String(val || "")
      .replace(/\D/g, "")
      .slice(0, KIOSK_CODE_LEN);
  }

  function normalizeCodeInput(val) {
    const d = normalizeCodePartial(val);
    if (d.length < KIOSK_CODE_LEN) return d;
    return d.padStart(KIOSK_CODE_LEN, "0").slice(-KIOSK_CODE_LEN);
  }

  function formatKioskDisplayCode(inviteCode) {
    const ic = globalThis.ThreaInviteCodes;
    if (ic && typeof ic.normalizeInviteCode === "function") {
      const n = ic.normalizeInviteCode(inviteCode);
      if (n) return n;
    }
    return String(inviteCode || "")
      .replace(/\D/g, "")
      .padStart(KIOSK_CODE_LEN, "0")
      .slice(-KIOSK_CODE_LEN);
  }

  function buildDigitPad() {
    const pad = document.getElementById("kiosk-digit-pad");
    if (!pad) return;
    pad.replaceChildren();
    for (const d of DIGITS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "kiosk-pad-key";
      b.textContent = d;
      b.addEventListener("click", () => {
        tapFeedback();
        const cur = codeInput ? normalizeCodePartial(codeInput.value) : "";
        if (cur.length < KIOSK_CODE_LEN) setCodeValue(cur + d);
      });
      pad.appendChild(b);
    }
    const del = document.createElement("button");
    del.type = "button";
    del.className = "kiosk-pad-key kiosk-pad-key--del";
    del.textContent = "⌫";
    del.addEventListener("click", () => {
      tapFeedback();
      const cur = codeInput ? normalizeCodePartial(codeInput.value) : "";
      setCodeValue(cur.slice(0, -1));
    });
    pad.appendChild(del);
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "kiosk-pad-key kiosk-pad-key--clear";
    clear.textContent = "مسح الكل";
    clear.addEventListener("click", () => {
      tapFeedback();
      setCodeValue("");
    });
    pad.appendChild(clear);
  }

  function scannerQrBoxSize() {
    const wrap = document.querySelector(".kiosk-scanner-frame");
    const w = wrap ? wrap.clientWidth : window.innerWidth;
    const side = Math.max(200, Math.min(300, Math.floor(w * 0.78)));
    return { width: side, height: side };
  }

  async function stopScanner() {
    if (!scanner || !scanning) return;
    try {
      await scanner.stop();
      scanner.clear();
    } catch (e) {
      console.warn(e);
    }
    scanning = false;
  }

  async function startScanner() {
    if (typeof Html5Qrcode === "undefined") {
      showScanErr("مكتبة الماسح غير محمّلة.");
      return;
    }
    const region = document.getElementById("kiosk-reader");
    if (!region) return;

    await stopScanner();
    scanner = new Html5Qrcode("kiosk-reader");
    const config = {
      fps: 10,
      qrbox: scannerQrBoxSize(),
      aspectRatio: 1,
    };

    const onScan = async (decodedText) => {
      const now = Date.now();
      if (decodedText === lastDecoded && now - debounceT < 2500) return;
      lastDecoded = decodedText;
      debounceT = now;

      const parsed = parseQrPayload(decodedText);
      if (!parsed || !parsed.publicId) {
        if (scanStatus) scanStatus.textContent = "رمز غير معروف — استخدم QR من واتساب";
        triggerInvalidFeedback();
        return;
      }
      if (scanStatus) scanStatus.textContent = "تم المسح — جاري تسجيل الحضور…";
      await lookupAndShow(parsed.publicId, parsed.token);
    };

    if (scanStatus) scanStatus.textContent = "جاري تشغيل الكاميرا…";
    showScanErr("");

    try {
      await scanner.start({ facingMode: "environment" }, config, onScan, () => {});
      scanning = true;
      if (scanStatus) scanStatus.textContent = "وجّه الكاميرا نحو رمز QR";
    } catch (e) {
      console.warn(e);
      try {
        const cams = await Html5Qrcode.getCameras();
        if (!cams || !cams.length) throw new Error("no camera");
        await scanner.start(cams[0].id, config, onScan, () => {});
        scanning = true;
        if (scanStatus) scanStatus.textContent = "وجّه الكاميرا نحو رمز QR";
      } catch (e2) {
        console.error(e2);
        showScanErr("تعذّر تشغيل الكاميرا. استخدم HTTPS واسمح بالوصول للكاميرا.");
        if (scanStatus) scanStatus.textContent = "الكاميرا غير متاحة";
      }
    }
  }

  function resetToHome() {
    hideResultUi();
    showPanel("home");
    void stopScanner();
    lastDecoded = "";
    setCodeValue("");
    showCodeErr("");
    showScanErr("");
  }

  function initKioskPanoViewport() {
    if (!panoStage) return;

    if (focusBtn) {
      focusBtn.addEventListener("click", () => {
        tapFeedback();
        focusOnSeats();
      });
    }

    panoStage.addEventListener(
      "wheel",
      (e) => {
        if (panoStage.hidden) return;
        e.preventDefault();
        const modeMul = e.deltaMode === 1 ? 12 : e.deltaMode === 2 ? 80 : 1;
        const factor = Math.exp(-e.deltaY * modeMul * 0.0018);
        const rect = panoStage.getBoundingClientRect();
        const focusX = e.clientX - rect.left + panoStage.scrollLeft;
        const focusY = e.clientY - rect.top + panoStage.scrollTop;
        zoomKioskPanoAt(panoZoomLevel * factor, focusX, focusY);
      },
      { passive: false }
    );

    panoStage.addEventListener(
      "touchmove",
      (e) => {
        if (panoStage.hidden || e.touches.length !== 2) return;
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
        const rect = panoStage.getBoundingClientRect();
        const focusX =
          (t0.clientX + t1.clientX) / 2 - rect.left + panoStage.scrollLeft;
        const focusY =
          (t0.clientY + t1.clientY) / 2 - rect.top + panoStage.scrollTop;
        zoomKioskPanoAt(panoPinchStartZoom * ratio, focusX, focusY);
      },
      { passive: false }
    );

    const endPinch = (e) => {
      if (!e.touches || e.touches.length < 2) {
        panoPinchActive = false;
        panoPinchStartDist = 0;
      }
    };
    panoStage.addEventListener("touchend", endPinch);
    panoStage.addEventListener("touchcancel", endPinch);

    panoStage.addEventListener("pointerdown", (e) => {
      if (panoStage.hidden || e.button !== 0 || e.pointerType !== "mouse") return;
      if (e.target.closest(".kiosk-bottom-bar, .kiosk-pano-hint, .kiosk-seat-legend")) return;
      panoDragActive = true;
      panoDragStart = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: panoStage.scrollLeft,
        scrollTop: panoStage.scrollTop,
        pointerId: e.pointerId,
      };
      panoStage.classList.add("is-dragging");
      if (typeof panoStage.setPointerCapture === "function") {
        panoStage.setPointerCapture(e.pointerId);
      }
    });

    panoStage.addEventListener("pointermove", (e) => {
      if (!panoDragActive || !panoDragStart || panoDragStart.pointerId !== e.pointerId) return;
      if (panoPinchActive) return;
      e.preventDefault();
      panoStage.scrollLeft = panoDragStart.scrollLeft - (e.clientX - panoDragStart.x);
      panoStage.scrollTop = panoDragStart.scrollTop - (e.clientY - panoDragStart.y);
    });

    const endDrag = (e) => {
      if (!panoDragActive || !panoDragStart || e.pointerId !== panoDragStart.pointerId) return;
      panoDragActive = false;
      panoDragStart = null;
      panoStage.classList.remove("is-dragging");
    };
    panoStage.addEventListener("pointerup", endDrag);
    panoStage.addEventListener("pointercancel", endDrag);

    let resizeT = 0;
    window.addEventListener("resize", () => {
      if (panoStage.hidden || !assignedSeats.length) return;
      clearTimeout(resizeT);
      resizeT = window.setTimeout(() => {
        applyKioskPanoZoom({ keepCenter: true });
      }, 120);
    });

  }

  function initBranding() {
    const cfg = globalThis.THREA_APP_CONFIG || {};
    if (schoolNameEl && cfg.schoolName) {
      schoolNameEl.textContent = cfg.schoolName;
    }
    const inv = globalThis.THREA_INVITE;
    if (homeFootnote && inv && typeof inv.kioskDeveloperCredit === "function") {
      const dev = inv.kioskDeveloperCredit();
      const phone = String(dev.phone || "").replace(/\s/g, "");
      homeFootnote.replaceChildren();
      const title = document.createElement("span");
      title.className = "kiosk-dev-title";
      title.textContent = dev.title || "معلومات مطور نظام الحجز المتكامل";
      const name = document.createElement("span");
      name.className = "kiosk-dev-name";
      name.textContent = dev.name || "";
      const phoneLine = document.createElement("span");
      phoneLine.className = "kiosk-dev-phone-line";
      phoneLine.append("رقم الجوال ", "");
      if (phone) {
        const tel = document.createElement("a");
        tel.className = "kiosk-dev-phone";
        tel.href = `tel:${phone}`;
        tel.dir = "ltr";
        tel.textContent = phone;
        phoneLine.appendChild(tel);
      }
      homeFootnote.append(title, name, phoneLine);
    }
  }

  document.getElementById("kiosk-go-scan")?.addEventListener("click", async () => {
    tapFeedback();
    showPanel("scan");
    await startScanner();
  });

  document.getElementById("kiosk-go-code")?.addEventListener("click", () => {
    tapFeedback();
    showPanel("code");
    setCodeValue("");
  });

  document.getElementById("kiosk-code-back")?.addEventListener("click", () => {
    tapFeedback();
    showPanel("home");
    showCodeErr("");
  });

  document.getElementById("kiosk-scan-back")?.addEventListener("click", async () => {
    tapFeedback();
    await stopScanner();
    showPanel("home");
    showScanErr("");
  });

  document.getElementById("kiosk-code-submit")?.addEventListener("click", () => {
    tapFeedback();
    const raw = codeInput ? codeInput.value : "";
    const code = normalizeCodeInput(raw);
    if (code.length < KIOSK_CODE_LEN) {
      showCodeErr("أدخل 4 أرقام.");
      return;
    }
    void lookupAndShow(code, "");
  });

  document.getElementById("kiosk-new-lookup")?.addEventListener("click", () => {
    tapFeedback();
    resetToHome();
  });

  buildDigitPad();
  updateSlotsUi();
  initKioskPanoViewport();
  initKioskFullscreen();
  initBranding();
  if (homePanel) homePanel.classList.add("is-visible");
  showPanel("home");
  hideResultUi();

  (async function boot() {
    const params = new URLSearchParams(globalThis.location.search);
    const codeParam = String(params.get("code") || "").trim();
    if (codeParam) {
      await lookupAndShow(codeParam, "");
      return;
    }
    await waitForGuestApi(8000);
  })();
})();
