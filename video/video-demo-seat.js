/**
 * عرض مقعد توضيحي للفيديو — بدون قاعدة بيانات.
 */
(function () {
  "use strict";

  const SEATS = window.ThreaSeats && window.ThreaSeats.SEATS;
  const summaryEl = document.getElementById("seat-view-summary");
  const focusBtn = document.getElementById("seat-view-focus");
  const panoStage = document.getElementById("pano-stage");
  const panoInner = document.getElementById("pano-inner");
  const panoImg = document.getElementById("pano-img");
  const panoPinsRoot = document.getElementById("pano-pins-root");

  const DEMO_SEAT_IDS = ["LEFT-R05-S03", "RIGHT-R05-S03"];
  let assignedSeats = [];
  let panoZoomLevel = 1.2;
  const PANO_ZOOM_MIN = 0.6;
  const PANO_ZOOM_MAX = 3;

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

  function formatSeatShort(seat) {
    if (window.ThreaSeats && typeof window.ThreaSeats.formatSeatShort === "function") {
      return window.ThreaSeats.formatSeatShort(seat);
    }
    if (!seat) return "";
    const side = seat.section === "RIGHT" ? "يمين" : "يسار";
    return `${side} صف ${seat.row} مقعد ${seat.seatInRow}`;
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

  async function init() {
    if (!SEATS) return;

    assignedSeats = DEMO_SEAT_IDS.map((id) => SEATS.find((s) => s.id === id)).filter(Boolean);
    if (!assignedSeats.length) return;

    if (summaryEl) {
      summaryEl.textContent = [
        "أحمد محمد (عرض توضيحي)",
        `مقعد الخريج: ${formatSeatShort(assignedSeats[0])}`,
        assignedSeats[1]
          ? `مقعد المرافق: ${formatSeatShort(assignedSeats[1])}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }

    if (window.ThreaPanoramaStorage && window.ThreaPanoramaStorage.ready) {
      await window.ThreaPanoramaStorage.ready;
    }

    const onReady = () => {
      attachPanoPins(assignedSeats);
      updatePanoRoute();
      applyPanoZoom();
      requestAnimationFrame(() => scrollToSeats());
    };

    if (panoImg.complete && panoImg.naturalWidth > 0) onReady();
    else panoImg.addEventListener("load", onReady, { once: true });

    if (focusBtn) focusBtn.addEventListener("click", () => scrollToSeats());

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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }
})();
