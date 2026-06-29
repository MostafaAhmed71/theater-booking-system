(function () {
  "use strict";

  const SEATS = window.ThreaSeats && window.ThreaSeats.SEATS;
  const gate = document.getElementById("seat-view-gate");
  const loadingEl = document.getElementById("seat-view-loading");
  const errEl = document.getElementById("seat-view-err");
  const backLink = document.getElementById("seat-view-back");
  const bar = document.getElementById("seat-view-bar");
  const summaryEl = document.getElementById("seat-view-summary");
  const focusBtn = document.getElementById("seat-view-focus");
  const panoStage = document.getElementById("pano-stage");
  const panoInner = document.getElementById("pano-inner");
  const panoImg = document.getElementById("pano-img");
  const panoPinsRoot = document.getElementById("pano-pins-root");

  let assignedSeats = [];
  let panoZoomLevel = 1.2;
  const PANO_ZOOM_MIN = 0.6;
  const PANO_ZOOM_MAX = 3;

  function showErr(msg) {
    if (loadingEl) loadingEl.hidden = true;
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = msg;
    }
    if (backLink) backLink.hidden = false;
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

  function panoUvToInnerPixel(img, panU, panV) {
    const r = getObjectFitContainContentRect(img);
    if (!r.w || !r.h) {
      return { x: panU * (img.clientWidth || 1), y: panV * (img.clientHeight || 1) };
    }
    return { x: r.x + panU * r.w, y: r.y + panV * r.h };
  }

  function partyPinCentroid(seats) {
    const store = window.ThreaPanoramaStorage;
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
    if (!panoPinsRoot || !window.ThreaPanoramaStorage) return;
    panoPinsRoot.replaceChildren();
    seats.forEach((seat, idx) => {
      const d = window.ThreaPanoramaStorage.getDisplayPinForSeat(seat);
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

  function applyPanoZoom() {
    if (!panoInner) return;
    panoInner.style.transform = `scale(${panoZoomLevel})`;
    panoInner.style.transformOrigin = "50% 50%";
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
      behavior: "smooth",
    });
  }

  function formatSeatShort(seat) {
    if (window.ThreaSeats && typeof window.ThreaSeats.formatSeatShort === "function") {
      return window.ThreaSeats.formatSeatShort(seat);
    }
    if (!seat) return "";
    const side = seat.section === "RIGHT" ? "يمين" : "يسار";
    return `${side} صف ${seat.row} مقعد ${seat.seatInRow}`;
  }

  function showPanoView(rec, seats) {
    assignedSeats = seats;
    if (gate) gate.hidden = true;
    if (panoStage) panoStage.hidden = false;
    if (bar) bar.hidden = false;

    const parts = [`${rec.studentName}`];
    seats.forEach((s, i) => {
      const label = i === 0 ? "مقعد الخريج" : "مقعد المرافق";
      parts.push(`${label}: ${formatSeatShort(s)} — ${s.name}`);
    });
    if (summaryEl) summaryEl.textContent = parts.join(" · ");

    const onReady = async () => {
      if (globalThis.ThreaGuestQuota && globalThis.ThreaGuestQuota.ready) {
        await globalThis.ThreaGuestQuota.ready;
      }
      attachPanoPins(seats);
      updatePanoRoute();
      applyPanoZoom();
      requestAnimationFrame(() => scrollToSeats());
    };

    if (panoImg.complete && panoImg.naturalWidth > 0) {
      onReady();
    } else {
      panoImg.addEventListener("load", onReady, { once: true });
    }
  }

  function initZoomUi() {
    const zoomIn = document.getElementById("pano-zoom-in");
    const zoomOut = document.getElementById("pano-zoom-out");
    if (zoomIn) {
      zoomIn.addEventListener("click", () => {
        panoZoomLevel = Math.min(PANO_ZOOM_MAX, panoZoomLevel * 1.18);
        applyPanoZoom();
      });
    }
    if (zoomOut) {
      zoomOut.addEventListener("click", () => {
        panoZoomLevel = Math.max(PANO_ZOOM_MIN, panoZoomLevel / 1.18);
        applyPanoZoom();
      });
    }
    if (panoStage) {
      panoStage.addEventListener(
        "wheel",
        (e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
          panoZoomLevel = Math.min(
            PANO_ZOOM_MAX,
            Math.max(PANO_ZOOM_MIN, panoZoomLevel * factor)
          );
          applyPanoZoom();
        },
        { passive: false }
      );
    }
    if (focusBtn) focusBtn.addEventListener("click", () => scrollToSeats());
  }

  async function init() {
    if (!SEATS || !window.ThreaGuestAssignments) {
      showErr("تعذّر تحميل بيانات المقاعد.");
      return;
    }

    const params = new URLSearchParams(globalThis.location.search);
    const codeRaw = String(params.get("code") || "").trim();
    const nidRaw = String(
      params.get("nid") || params.get("id") || codeRaw || ""
    ).trim();
    const lookupRaw = decodeURIComponent(codeRaw || nidRaw);
    const ic = globalThis.ThreaInviteCodes;
    const isCode = ic && typeof ic.isInviteCode === "function" && ic.isInviteCode(lookupRaw);
    const roster = globalThis.ThreaStudentRoster;
    const nid = isCode
      ? ic.normalizeInviteCode(lookupRaw)
      : roster && typeof roster.normalizeGuestKey === "function"
        ? roster.normalizeGuestKey(lookupRaw)
        : /^GUEST-/i.test(lookupRaw)
          ? lookupRaw.toUpperCase()
          : lookupRaw.replace(/\D/g, "");
    const token = String(params.get("t") || params.get("token") || "").trim();

    if (!nid || (!isCode && nid.length < 10 && !/^GUEST-/i.test(nid))) {
      showErr("الرابط غير صالح — رمز الدعوة أو الهوية ناقص.");
      return;
    }
    if (!token) {
      showErr("الرابط غير صالح — رمز الدخول مفقود.");
      return;
    }

    try {
      const ga = window.ThreaGuestAssignments;
      if (ga.ready) await ga.ready;
      if (window.ThreaPanoramaStorage && window.ThreaPanoramaStorage.ready) {
        await window.ThreaPanoramaStorage.ready;
      }

      const rec =
        typeof ga.getByPublicId === "function"
          ? ga.getByPublicId(nid)
          : ga.getExistingForNationalId(nid);
      if (!rec || !rec.seatIds || !rec.seatIds.length) {
        showErr("لا يوجد حجز مسجّل لهذا الرقم.");
        return;
      }
      if (rec.checkInToken !== token) {
        showErr("الرابط غير صالح أو منتهٍ. استخدم الرابط من رسالة واتساب.");
        return;
      }

      const seats = rec.seatIds
        .map((id) => SEATS.find((s) => s.id === id))
        .filter(Boolean);
      if (!seats.length) {
        showErr("تعذّر تحميل بيانات المقاعد.");
        return;
      }

      if (backLink) {
        const isGuest =
          ga.isCeremonyGuestId && ga.isCeremonyGuestId(rec.nationalId);
        backLink.href = isGuest ? "./guest-booking.html" : "./index.html";
        backLink.textContent = isGuest
          ? "العودة لحجز الضيوف"
          : "العودة لصفحة الحجز";
      }

      showPanoView(rec, seats);
      initZoomUi();
    } catch (e) {
      console.error(e);
      showErr("تعذّر تحميل الحجز. تحقق من الاتصال.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }
})();
