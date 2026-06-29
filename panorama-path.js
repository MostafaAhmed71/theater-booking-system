/**
 * مسار متحرك من المدخل إلى المقعد على بانوراما المسرح.
 */
(function (global) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  /** @type {WeakMap<Element, ResizeObserver>} */
  const observers = new WeakMap();
  /** @type {WeakMap<Element, object>} */
  const lastRenderOpts = new WeakMap();

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }

  /**
   * @param {HTMLImageElement} img
   */
  function getContentRect(img) {
    const ew = img.clientWidth || 0;
    const eh = img.clientHeight || 0;
    if (img.classList.contains("cal-pano-img")) {
      return { x: 0, y: 0, w: ew, h: eh };
    }
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh || !ew || !eh) {
      return { x: 0, y: 0, w: ew, h: eh };
    }
    const scale = Math.min(ew / nw, eh / nh);
    const w = nw * scale;
    const h = nh * scale;
    return { x: (ew - w) / 2, y: (eh - h) / 2, w, h };
  }

  /**
   * @param {HTMLImageElement} img
   * @param {number} panU
   * @param {number} panV
   */
  function uvToPixel(img, panU, panV) {
    const r = getContentRect(img);
    return {
      x: r.x + clamp01(panU) * r.w,
      y: r.y + clamp01(panV) * r.h,
    };
  }

  /**
   * مسار منحني بزوايا مستديرة (ممرّ → صف المقعد).
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   */
  function buildRoutePath(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) {
      return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }

    const r = Math.min(26, Math.abs(dx) * 0.45, Math.abs(dy) * 0.45, dist * 0.18);
    const sx = dx >= 0 ? 1 : -1;
    const sy = dy >= 0 ? 1 : -1;

    if (Math.abs(dy) >= Math.abs(dx) * 0.85) {
      if (Math.abs(dx) < r * 2) {
        return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      }
      const yTurn = y2 - sy * r;
      return [
        `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
        `L ${x1.toFixed(1)} ${(yTurn - sy * r).toFixed(1)}`,
        `Q ${x1.toFixed(1)} ${yTurn.toFixed(1)} ${(x1 + sx * r).toFixed(1)} ${yTurn.toFixed(1)}`,
        `L ${(x2 - sx * r).toFixed(1)} ${yTurn.toFixed(1)}`,
        `Q ${x2.toFixed(1)} ${yTurn.toFixed(1)} ${x2.toFixed(1)} ${(yTurn + sy * r).toFixed(1)}`,
        `L ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      ].join(" ");
    }

    if (Math.abs(dx) < r * 2) {
      return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
    const xTurn = x2 - sx * r;
    return [
      `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
      `L ${(xTurn - sx * r).toFixed(1)} ${y1.toFixed(1)}`,
      `Q ${xTurn.toFixed(1)} ${y1.toFixed(1)} ${xTurn.toFixed(1)} ${(y1 + sy * r).toFixed(1)}`,
      `L ${xTurn.toFixed(1)} ${(y2 - sy * r).toFixed(1)}`,
      `Q ${xTurn.toFixed(1)} ${y2.toFixed(1)} ${(xTurn + sx * r).toFixed(1)} ${y2.toFixed(1)}`,
      `L ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    ].join(" ");
  }

  /**
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   */
  function endpointAngle(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }

  /**
   * @param {Element} mount
   */
  function findPinsRoot(mount) {
    return (
      mount.querySelector("#pano-pins-root") ||
      mount.querySelector("#cal-pano-pins-root") ||
      mount.querySelector(".pano-pins-root") ||
      mount.querySelector(".cal-pano-pins-root")
    );
  }

  /**
   * @param {SVGSVGElement} svg
   */
  function ensureDefs(svg) {
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(SVG_NS, "defs");
      svg.insertBefore(defs, svg.firstChild);
    }

    if (!svg.dataset.routeGradId) {
      const uid = Math.random().toString(36).slice(2, 9);
      svg.dataset.routeGradId = `pano-route-grad-${uid}`;
      svg.dataset.routeGradCompanionId = `pano-route-grad-c-${uid}`;
      svg.dataset.routeFilterGlow = `pano-route-fx-glow-${uid}`;
      svg.dataset.routeFilterSoft = `pano-route-fx-soft-${uid}`;
      svg.dataset.routeMarkerStudent = `pano-route-marker-s-${uid}`;
      svg.dataset.routeMarkerCompanion = `pano-route-marker-c-${uid}`;

      const filterGlow = document.createElementNS(SVG_NS, "filter");
      filterGlow.setAttribute("id", svg.dataset.routeFilterGlow);
      filterGlow.setAttribute("x", "-50%");
      filterGlow.setAttribute("y", "-50%");
      filterGlow.setAttribute("width", "200%");
      filterGlow.setAttribute("height", "200%");
      const blur = document.createElementNS(SVG_NS, "feGaussianBlur");
      blur.setAttribute("stdDeviation", "4");
      blur.setAttribute("result", "blur");
      filterGlow.appendChild(blur);
      const merge = document.createElementNS(SVG_NS, "feMerge");
      const m1 = document.createElementNS(SVG_NS, "feMergeNode");
      m1.setAttribute("in", "blur");
      const m2 = document.createElementNS(SVG_NS, "feMergeNode");
      m2.setAttribute("in", "SourceGraphic");
      merge.appendChild(m1);
      merge.appendChild(m2);
      filterGlow.appendChild(merge);
      defs.appendChild(filterGlow);

      const filterSoft = document.createElementNS(SVG_NS, "filter");
      filterSoft.setAttribute("id", svg.dataset.routeFilterSoft);
      filterSoft.setAttribute("x", "-80%");
      filterSoft.setAttribute("y", "-80%");
      filterSoft.setAttribute("width", "260%");
      filterSoft.setAttribute("height", "260%");
      const blur2 = document.createElementNS(SVG_NS, "feGaussianBlur");
      blur2.setAttribute("stdDeviation", "2.5");
      filterSoft.appendChild(blur2);
      defs.appendChild(filterSoft);

      function addGrad(id, c0, c1, c2) {
        const grad = document.createElementNS(SVG_NS, "linearGradient");
        grad.setAttribute("id", id);
        grad.setAttribute("gradientUnits", "userSpaceOnUse");
        [
          { offset: "0%", color: c0 },
          { offset: "55%", color: c1 },
          { offset: "100%", color: c2 },
        ].forEach((s) => {
          const stop = document.createElementNS(SVG_NS, "stop");
          stop.setAttribute("offset", s.offset);
          stop.setAttribute("stop-color", s.color);
          grad.appendChild(stop);
        });
        defs.appendChild(grad);
      }

      addGrad(svg.dataset.routeGradId, "#22d3ee", "#a78bfa", "#fbbf24");
      addGrad(svg.dataset.routeGradCompanionId, "#22d3ee", "#34d399", "#4ade80");

      const mkStudent = document.createElementNS(SVG_NS, "marker");
      mkStudent.setAttribute("id", svg.dataset.routeMarkerStudent);
      mkStudent.setAttribute("markerWidth", "8");
      mkStudent.setAttribute("markerHeight", "8");
      mkStudent.setAttribute("refX", "6");
      mkStudent.setAttribute("refY", "4");
      mkStudent.setAttribute("orient", "auto");
      const arrowS = document.createElementNS(SVG_NS, "path");
      arrowS.setAttribute("d", "M0,0 L8,4 L0,8 L2,4 Z");
      arrowS.setAttribute("fill", "#fbbf24");
      mkStudent.appendChild(arrowS);
      defs.appendChild(mkStudent);

      const mkCompanion = document.createElementNS(SVG_NS, "marker");
      mkCompanion.setAttribute("id", svg.dataset.routeMarkerCompanion);
      mkCompanion.setAttribute("markerWidth", "8");
      mkCompanion.setAttribute("markerHeight", "8");
      mkCompanion.setAttribute("refX", "6");
      mkCompanion.setAttribute("refY", "4");
      mkCompanion.setAttribute("orient", "auto");
      const arrowC = document.createElementNS(SVG_NS, "path");
      arrowC.setAttribute("d", "M0,0 L8,4 L0,8 L2,4 Z");
      arrowC.setAttribute("fill", "#4ade80");
      mkCompanion.appendChild(arrowC);
      defs.appendChild(mkCompanion);
    }
  }

  /**
   * @param {Element} mount
   */
  function ensureSvg(mount) {
    let svg = mount.querySelector(".pano-route-svg");
    if (!svg) {
      svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("class", "pano-route-svg");
      svg.setAttribute("aria-hidden", "true");
      const pins = findPinsRoot(mount);
      if (pins) mount.insertBefore(svg, pins);
      else mount.appendChild(svg);

      ensureDefs(svg);

      const lines = document.createElementNS(SVG_NS, "g");
      lines.setAttribute("class", "pano-route-lines");
      svg.appendChild(lines);

      const entrance = document.createElementNS(SVG_NS, "g");
      entrance.setAttribute("class", "pano-route-entrance");

      const pulse = document.createElementNS(SVG_NS, "circle");
      pulse.setAttribute("class", "pano-route-entrance-pulse");
      pulse.setAttribute("r", "18");
      entrance.appendChild(pulse);

      const ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("class", "pano-route-entrance-ring");
      ring.setAttribute("r", "14");
      entrance.appendChild(ring);

      const core = document.createElementNS(SVG_NS, "circle");
      core.setAttribute("class", "pano-route-entrance-core");
      core.setAttribute("r", "9");
      entrance.appendChild(core);

      const icon = document.createElementNS(SVG_NS, "text");
      icon.setAttribute("class", "pano-route-entrance-icon");
      icon.textContent = "⌂";
      entrance.appendChild(icon);

      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("class", "pano-route-entrance-label");
      t.textContent = "مدخل";
      entrance.appendChild(t);

      svg.appendChild(entrance);
    } else {
      ensureDefs(svg);
    }
    return svg;
  }

  /**
   * @param {Element} mount
   */
  function clear(mount) {
    if (!mount) return;
    const svg = mount.querySelector(".pano-route-svg");
    if (svg) svg.remove();
    lastRenderOpts.delete(mount);
    const obs = observers.get(mount);
    if (obs) {
      obs.disconnect();
      observers.delete(mount);
    }
  }

  /**
   * @param {SVGPathElement} el
   * @param {string} d
   * @param {number} delayMs
   */
  function primePathDraw(el, d, delayMs) {
    el.setAttribute("d", d);
    const len = el.getTotalLength();
    const lenStr = String(len);
    el.style.setProperty("--pano-route-len", lenStr);
    el.style.strokeDasharray = lenStr;
    el.style.strokeDashoffset = lenStr;
    el.style.animationDelay = `${delayMs}ms`;
    el.classList.remove("is-drawn");
    requestAnimationFrame(() => el.classList.add("is-drawn"));
  }

  /**
   * @param {SVGElement} linesRoot
   * @param {string} d
   * @param {string} role
   * @param {string} stroke
   * @param {string} markerEnd
   * @param {number} delayMs
   * @param {number} ex
   * @param {number} ey
   * @param {number} angle
   */
  function appendRouteBundle(linesRoot, d, role, stroke, markerEnd, delayMs, ex, ey, angle) {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", `pano-route-group pano-route-group--${role}`);

    const track = document.createElementNS(SVG_NS, "path");
    track.setAttribute("class", `pano-route-path pano-route-path--track pano-route-path--${role}`);
    group.appendChild(track);

    const glow = document.createElementNS(SVG_NS, "path");
    glow.setAttribute("class", `pano-route-path pano-route-path--glow pano-route-path--${role}`);
    group.appendChild(glow);

    const main = document.createElementNS(SVG_NS, "path");
    main.setAttribute("class", `pano-route-path pano-route-path--main pano-route-path--${role}`);
    main.style.stroke = stroke;
    if (markerEnd) main.setAttribute("marker-end", markerEnd);
    group.appendChild(main);

    const flow = document.createElementNS(SVG_NS, "path");
    flow.setAttribute("class", `pano-route-path pano-route-path--flow pano-route-path--${role}`);
    group.appendChild(flow);

    linesRoot.appendChild(group);

    const svgRoot = linesRoot.ownerSVGElement;
    const glowFx = svgRoot && svgRoot.dataset.routeFilterGlow;
    if (glowFx) glow.style.filter = `url(#${glowFx})`;

    [track, glow, main, flow].forEach((el, layerIdx) => {
      primePathDraw(el, d, delayMs + layerIdx * 40);
    });

    const end = document.createElementNS(SVG_NS, "g");
    end.setAttribute("class", `pano-route-endpoint pano-route-endpoint--${role}`);
    end.setAttribute("transform", `translate(${ex}, ${ey}) rotate(${angle})`);

    const endPulse = document.createElementNS(SVG_NS, "circle");
    endPulse.setAttribute("class", "pano-route-endpoint-pulse");
    endPulse.setAttribute("r", "14");
    end.appendChild(endPulse);

    const endRing = document.createElementNS(SVG_NS, "circle");
    endRing.setAttribute("class", "pano-route-endpoint-ring");
    endRing.setAttribute("r", "8");
    end.appendChild(endRing);

    const endDot = document.createElementNS(SVG_NS, "circle");
    endDot.setAttribute("class", "pano-route-endpoint-dot");
    endDot.setAttribute("r", "4");
    end.appendChild(endDot);

    linesRoot.appendChild(end);
  }

  /**
   * @param {{
   *   mount: Element,
   *   img: HTMLImageElement,
   *   from: { panU: number, panV: number },
   *   destinations: Array<{ panU: number, panV: number, role?: string }>,
   *   showEntranceLabel?: boolean
   * }} opts
   */
  function renderMulti(opts) {
    const mount = opts.mount;
    const img = opts.img;
    if (!mount || !img) return;

    const w = img.clientWidth || 0;
    const h = img.clientHeight || 0;
    if (!w || !h) return;

    const svg = ensureSvg(mount);
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;

    const a = uvToPixel(img, opts.from.panU, opts.from.panV);
    const entrance = svg.querySelector(".pano-route-entrance");
    if (entrance) {
      entrance.setAttribute("transform", `translate(${a.x}, ${a.y})`);
      const label = entrance.querySelector(".pano-route-entrance-label");
      if (label) label.hidden = opts.showEntranceLabel === false;
    }

    const linesRoot = svg.querySelector(".pano-route-lines");
    if (!linesRoot) return;
    linesRoot.replaceChildren();

    const gradStudent = svg.dataset.routeGradId || "";
    const gradCompanion = svg.dataset.routeGradCompanionId || gradStudent;
    const mkStudent = svg.dataset.routeMarkerStudent || "";
    const mkCompanion = svg.dataset.routeMarkerCompanion || "";

    opts.destinations.forEach((dest, idx) => {
      const b = uvToPixel(img, dest.panU, dest.panV);
      const d = buildRoutePath(a.x, a.y, b.x, b.y);
      const role = dest.role || (idx === 0 ? "student" : "companion");
      const isCompanion = role === "companion";
      const stroke = isCompanion ? `url(#${gradCompanion})` : `url(#${gradStudent})`;
      const markerEnd = isCompanion ? `url(#${mkCompanion})` : `url(#${mkStudent})`;
      const angle = endpointAngle(a.x, a.y, b.x, b.y);
      appendRouteBundle(linesRoot, d, role, stroke, markerEnd, idx * 320, b.x, b.y, angle);
    });

    lastRenderOpts.set(mount, opts);

    if (!observers.has(mount)) {
      const ro = new ResizeObserver(() => {
        const latest = lastRenderOpts.get(mount);
        if (latest && mount.isConnected && img.isConnected) {
          renderMulti(latest);
        }
      });
      ro.observe(img);
      observers.set(mount, ro);
    }
  }

  /**
   * @param {{
   *   mount: Element,
   *   img: HTMLImageElement,
   *   from: { panU: number, panV: number },
   *   to: { panU: number, panV: number },
   *   showEntranceLabel?: boolean
   * }} opts
   */
  function render(opts) {
    renderMulti({
      mount: opts.mount,
      img: opts.img,
      from: opts.from,
      destinations: [{ panU: opts.to.panU, panV: opts.to.panV, role: "student" }],
      showEntranceLabel: opts.showEntranceLabel,
    });
  }

  /**
   * @param {Element} mount
   * @param {HTMLImageElement} img
   * @param {{ panU: number, panV: number }} entrance
   */
  function renderEntranceOnly(mount, img, entrance) {
    const w = img.clientWidth || 0;
    const h = img.clientHeight || 0;
    if (!w || !h) return;
    const svg = ensureSvg(mount);
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const a = uvToPixel(img, entrance.panU, entrance.panV);
    const linesRoot = svg.querySelector(".pano-route-lines");
    if (linesRoot) linesRoot.replaceChildren();
    const g = svg.querySelector(".pano-route-entrance");
    if (g) g.setAttribute("transform", `translate(${a.x}, ${a.y})`);
  }

  function defaultEntrance() {
    return { panU: 0.5, panV: 0.94 };
  }

  function getEntranceFromConfig() {
    const q = global.ThreaGuestQuota;
    if (q && typeof q.getPanoramaEntrance === "function") {
      return q.getPanoramaEntrance();
    }
    return defaultEntrance();
  }

  /**
   * @param {{
   *   mount: Element,
   *   img: HTMLImageElement,
   *   seats: Array<{ id: string }>,
   *   entrance?: { panU: number, panV: number }
   * }} opts
   */
  function renderForSeats(opts) {
    const store = global.ThreaPanoramaStorage;
    if (!store || !opts.seats || !opts.seats.length) {
      clear(opts.mount);
      return;
    }
    const destinations = [];
    opts.seats.forEach((seat, idx) => {
      const dest = store.getDisplayPinForSeat(seat);
      if (!dest || typeof dest.panU !== "number" || typeof dest.panV !== "number") {
        return;
      }
      destinations.push({
        panU: dest.panU,
        panV: dest.panV,
        role: idx === 0 ? "student" : "companion",
      });
    });
    if (!destinations.length) {
      clear(opts.mount);
      return;
    }
    const entrance = opts.entrance || getEntranceFromConfig();
    renderMulti({
      mount: opts.mount,
      img: opts.img,
      from: entrance,
      destinations,
    });
  }

  global.ThreaPanoramaPath = {
    getContentRect,
    uvToPixel,
    buildRoutePath,
    render,
    renderMulti,
    renderEntranceOnly,
    renderForSeats,
    clear,
    defaultEntrance,
    getEntranceFromConfig,
  };
})(typeof window !== "undefined" ? window : globalThis);
