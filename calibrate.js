(function () {
  "use strict";

  const seats = window.ThreaSeats && window.ThreaSeats.SEATS;
  const store = window.ThreaPanoramaStorage;

  if (!seats || !store) {
    document.body.innerHTML =
      "<p style='padding:24px;color:#fff'>تعذّر تحميل seats-data.js أو panorama-storage.js</p>";
    return;
  }

  if (
    !document.getElementById("cal-seat-grid") ||
    !document.getElementById("cal-side-right")
  ) {
    document.body.innerHTML =
      "<p style='padding:24px;color:#fff'>ملف calibrate.html قديم — ارفع النسخة المحدّثة من المشروع (مع أزرار اليمين/اليسار) ثم حدّث الصفحة Ctrl+F5.</p>";
    return;
  }

  const img = document.getElementById("cal-pano-img");
  const panoInner = document.getElementById("cal-pano-inner");
  const panoStage = document.getElementById("cal-pano-stage");
  const pinsRoot = document.getElementById("cal-pano-pins-root");
  const pin = document.getElementById("cal-pano-pin");
  const zoomInBtn = document.getElementById("cal-zoom-in");
  const zoomOutBtn = document.getElementById("cal-zoom-out");
  const zoomResetBtn = document.getElementById("cal-zoom-reset");
  const zoomLabel = document.getElementById("cal-zoom-label");

  const CAL_ZOOM_MIN = 0.5;
  const CAL_ZOOM_MAX = 10;
  const CAL_ZOOM_STEP = 0.2;
  let calZoom = 1;
  const seatInput = document.getElementById("cal-seat-id");
  const seatSelectedEl = document.getElementById("cal-seat-selected");
  const seatGrid = document.getElementById("cal-seat-grid");
  const sideRightBtn = document.getElementById("cal-side-right");
  const sideLeftBtn = document.getElementById("cal-side-left");
  const sideBridgeBtn = document.getElementById("cal-side-bridge");
  const panoSyncStatus = document.getElementById("cal-pano-sync-status");
  const panoProgress = document.getElementById("cal-pano-progress");
  const panoNextUncalBtn = document.getElementById("cal-pano-next-uncal");
  const panoRefreshCloudBtn = document.getElementById("cal-pano-refresh-cloud");
  const entrancePickBtn = document.getElementById("cal-entrance-pick");
  const entranceSaveBtn = document.getElementById("cal-entrance-save");
  const entranceReadout = document.getElementById("cal-entrance-readout");
  const noteInput = document.getElementById("cal-note");
  const coordsReadout = document.getElementById("cal-coords-readout");
  const saveBtn = document.getElementById("cal-save-btn");
  const msgOk = document.getElementById("cal-msg-ok");
  const msgErr = document.getElementById("cal-msg-err");
  const savedList = document.getElementById("cal-saved-list");
  const savedCount = document.getElementById("cal-saved-count");
  const exportBtn = document.getElementById("cal-export-btn");
  const downloadBtn = document.getElementById("cal-download-btn");
  const importFile = document.getElementById("cal-import-file");
  const clearBtn = document.getElementById("cal-clear-btn");
  const jsonTa = document.getElementById("cal-json-ta");

  /** @type {{ panU: number, panV: number } | null} */
  let draft = null;
  /** @type {'LEFT' | 'RIGHT' | 'BRIDGE' | null} */
  let activeSection = null;
  /** @type {'all' | 'student' | 'companion' | 'guest'} */
  let activeFilter = "all";
  /** @type {string} */
  let selectedSeatId = "";
  /** @type {{ panU: number, panV: number } | null} */
  let entranceDraft = null;
  let entrancePickMode = false;

  function buildRoleSets() {
    const q = globalThis.ThreaGuestQuota;
    if (!q) return { student: new Set(), companion: new Set(), guest: new Set() };
    return {
      student: new Set(
        typeof q.getStudentSeatIds === "function" ? q.getStudentSeatIds() : []
      ),
      companion: new Set(
        typeof q.getCompanionSeatIds === "function" ? q.getCompanionSeatIds() : []
      ),
      guest: new Set(
        typeof q.getGuestSeatIds === "function" ? q.getGuestSeatIds() : []
      ),
    };
  }

  let roleSets = buildRoleSets();

  function getSeatRole(seat) {
    if (!seat) return "other";
    if (roleSets.student.has(seat.id)) return "student";
    if (roleSets.companion.has(seat.id)) return "companion";
    if (roleSets.guest.has(seat.id)) return "guest";
    const api = globalThis.ThreaSeats;
    if (api && typeof api.isStudentPolicySeat === "function" && api.isStudentPolicySeat(seat)) {
      return "student";
    }
    if (api && typeof api.isCompanionPolicySeat === "function" && api.isCompanionPolicySeat(seat)) {
      return "companion";
    }
    if (api && typeof api.isGuestPolicySeat === "function" && api.isGuestPolicySeat(seat)) {
      return "guest";
    }
    return "other";
  }

  function seatMatchesFilter(seat) {
    if (activeFilter === "all") return true;
    return getSeatRole(seat) === activeFilter;
  }

  function roleChipClass(role) {
    if (role === "student") return "is-student-designated";
    if (role === "companion") return "is-companion-designated";
    if (role === "guest") return "is-guest-designated";
    return "";
  }

  function roleLabelAr(role) {
    if (role === "student") return "خريج";
    if (role === "companion") return "مرافق";
    if (role === "guest") return "ضيف";
    return "";
  }

  function sectionLabelAr(section) {
    if (section === "RIGHT") return "اليمين";
    if (section === "LEFT") return "اليسار";
    if (section === "BRIDGE") return "قاعدة وسط";
    return "";
  }

  /** تسمية مختصرة في شاشة المعايرة: ص = صف، م = مقعد */
  function formatSeatCompact(seat, withSide) {
    if (!seat) return "";
    const core = `ص${seat.row} م${seat.seatInRow}`;
    if (seat.section === "BRIDGE") {
      return withSide ? `قاعدة ${core}` : core;
    }
    if (!withSide) return core;
    const side = sectionLabelAr(seat.section);
    return side ? `${side} ${core}` : core;
  }

  function rowLabelCompact(row) {
    return `ص ${row}`;
  }

  function showErr(t) {
    msgErr.textContent = t;
    msgErr.hidden = false;
    msgOk.hidden = true;
  }

  function showOk(t) {
    msgOk.textContent = t;
    msgOk.hidden = false;
    msgErr.hidden = true;
  }

  function clearMsgs() {
    msgOk.hidden = true;
    msgErr.hidden = true;
  }

  function seatById(id) {
    return seats.find((s) => s.id === id);
  }

  function updateSeatSelectedLabel() {
    if (!seatSelectedEl) return;
    if (!selectedSeatId) {
      seatSelectedEl.textContent = activeSection
        ? "اضغط رقم المقعد من الشبكة"
        : "اختر الناحية ثم رقم المقعد";
      return;
    }
    const s = seatById(selectedSeatId);
    if (!s) {
      seatSelectedEl.textContent = selectedSeatId || "اختر الناحية ثم رقم المقعد";
      return;
    }
    const role = roleLabelAr(getSeatRole(s));
    const calibrated = store.getPin(s.id) ? " · معاير ✓" : " · غير معاير";
    const short = formatSeatCompact(s, true);
    seatSelectedEl.textContent = `المختار: ${short}${role ? ` (${role})` : ""}${calibrated}`;
  }

  function updatePanoProgress() {
    if (!panoProgress) return;
    const filterNames = {
      all: "الكل",
      student: "خريج",
      companion: "مرافق",
      guest: "ضيف",
    };
    const filterName = filterNames[activeFilter] || activeFilter;
    const pool = activeSection
      ? seats.filter((s) => s.section === activeSection && seatMatchesFilter(s))
      : seats.filter(seatMatchesFilter);
    const calibrated = pool.filter((s) => store.getPin(s.id)).length;
    if (!activeSection) {
      panoProgress.textContent = `${filterName}: ${pool.length} مقعد — اختر الناحية`;
      return;
    }
    const missing = pool.length - calibrated;
    const tail =
      missing > 0
        ? ` — ${missing} غير معاير (انقر المقعد → ضبط على الصورة → «حفظ لهذا المقعد»)`
        : " — اكتملت المعايرة لهذه الفئة";
    panoProgress.textContent = `${filterName} · ${sectionLabelAr(activeSection)}: معاير ${calibrated} من ${pool.length}${tail}`;
  }

  function updatePanoSyncStatus() {
    if (!panoSyncStatus || typeof store.getSyncStatus !== "function") return;
    const st = store.getSyncStatus();
    const n = Object.keys(store.loadMap()).length;
    if (st.firestoreReachable) {
      panoSyncStatus.className = "cal-msg cal-pano-sync-status cal-pano-sync-status--ok";
      panoSyncStatus.textContent = n
        ? `متصل بـ Supabase — ${n} مقعد معاير في السحابة`
        : "متصل بـ Supabase — لا معايرة محفوظة بعد؛ احفظ أول مقعد لتظهر هنا";
    } else if (st.lastSyncError) {
      panoSyncStatus.className = "cal-msg cal-pano-sync-status cal-pano-sync-status--err";
      panoSyncStatus.textContent =
        st.lastSyncError + (n ? ` · محلياً في المتصفح: ${n} مقعد` : "");
    } else {
      panoSyncStatus.className = "cal-msg cal-pano-sync-status";
      panoSyncStatus.textContent = "جاري الاتصال بقاعدة المعايرة…";
    }
    if (savedCount) {
      savedCount.textContent = `${n} مقعد`;
    }
  }

  function setSelectedSeat(id) {
    selectedSeatId = id || "";
    if (seatInput) seatInput.value = selectedSeatId;
    updateSeatSelectedLabel();
    syncPinFromSelectedSeat();
    if (activeSection) renderSeatGrid(activeSection);
    updateCalRoutePreview();
  }

  function loadEntranceFromConfig() {
    const q = globalThis.ThreaGuestQuota;
    if (q && typeof q.getPanoramaEntrance === "function") {
      entranceDraft = q.getPanoramaEntrance();
    } else if (globalThis.ThreaPanoramaPath) {
      entranceDraft = globalThis.ThreaPanoramaPath.defaultEntrance();
    }
    updateEntranceReadout();
    updateCalRoutePreview();
  }

  function updateEntranceReadout() {
    if (!entranceReadout) return;
    if (!entranceDraft) {
      entranceReadout.textContent = "مدخل: — (اضغط «تحديد المدخل على الصورة»)";
      return;
    }
    entranceReadout.textContent = `مدخل: panU ${entranceDraft.panU.toFixed(4)} · panV ${entranceDraft.panV.toFixed(4)}`;
    if (entrancePickBtn) {
      entrancePickBtn.classList.toggle("is-active", entrancePickMode);
    }
  }

  function updateCalRoutePreview() {
    const pathApi = globalThis.ThreaPanoramaPath;
    if (!pathApi || !panoInner || !img || !entranceDraft) return;
    if (!img.naturalWidth) return;
    const seat = selectedSeatId ? seatById(selectedSeatId) : null;
    if (seat && globalThis.ThreaPanoramaStorage) {
      const d = globalThis.ThreaPanoramaStorage.getDisplayPinForSeat(seat);
      pathApi.render({
        mount: panoInner,
        img,
        from: entranceDraft,
        to: { panU: d.panU, panV: d.panV },
      });
      return;
    }
    pathApi.renderEntranceOnly(panoInner, img, entranceDraft);
  }

  function formatSeatPinLabel(seat) {
    if (!seat) return "—";
    return formatSeatCompact(seat, true);
  }

  function syncPinFromSelectedSeat() {
    const id = selectedSeatId;
    const seat = id ? seatById(id) : null;
    const saved = id ? store.getPin(id) : null;
    if (saved && img.naturalWidth) {
      placePinFromUV(saved.panU, saved.panV, { fromModel: false });
    } else if (seat && typeof store.getDisplayPinForSeat === "function" && img.naturalWidth) {
      const d = store.getDisplayPinForSeat(seat);
      if (d && typeof d.panU === "number" && typeof d.panV === "number") {
        placePinFromUV(d.panU, d.panV, { fromModel: !d.calibrated });
      } else {
        draft = null;
        if (pin) pin.hidden = true;
        updateReadout();
      }
    } else {
      draft = null;
      if (pin) pin.hidden = true;
      updateReadout();
    }
    renderAllSavedPins();
    updatePanoProgress();
  }

  /** عرض كل النقاط المحفوظة على الصورة */
  function renderAllSavedPins() {
    if (!pinsRoot || !img || !img.naturalWidth) return;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    pinsRoot.replaceChildren();
    if (!w || !h) return;

    const map = store.loadMap();
    const ids = Object.keys(map).sort();

    for (const id of ids) {
      const p = map[id];
      if (!p || typeof p.panU !== "number" || typeof p.panV !== "number") continue;
      if (id === selectedSeatId && draft) continue;

      const seat = seatById(id);
      const el = document.createElement("div");
      el.className = "cal-pano-pin cal-pano-pin--saved";
      el.style.left = `${p.panU * w}px`;
      el.style.top = `${p.panV * h}px`;
      el.title = seat ? seat.name : id;
      el.dataset.seatId = id;

      const ring = document.createElement("span");
      ring.className = "cal-pano-pin-ring";
      const label = document.createElement("span");
      label.className = "cal-pano-pin-label";
      label.textContent = formatSeatPinLabel(seat);
      el.appendChild(ring);
      el.appendChild(label);

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const s = seatById(id);
        if (s && (s.section === "LEFT" || s.section === "RIGHT" || s.section === "BRIDGE")) {
          setActiveSection(s.section);
        }
        setSelectedSeat(id);
        placePinFromUV(p.panU, p.panV, { fromModel: false });
        clearMsgs();
      });

      pinsRoot.appendChild(el);
    }
  }

  function renderSeatGrid(section) {
    if (!seatGrid) return;
    seatGrid.innerHTML = "";
    const list = seats.filter((s) => s.section === section && seatMatchesFilter(s));
    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "cal-seat-grid-empty";
      const hint =
        activeFilter === "student" && section === "RIGHT"
          ? "مقاعد الخريجين في الناحية اليسار — اضغط «الناحية اليسار»."
          : activeFilter === "companion" && section === "LEFT"
            ? "مقاعد المرافقين في الناحية اليمين."
            : activeFilter === "guest" && section === "BRIDGE"
              ? "لا شيء هنا — جرّب يمين/يسار أو «قاعدة وسط»."
              : "لا مقاعد لهذه الفئة في هذه الناحية — غيّر الفئة أو الناحية.";
      empty.textContent = hint;
      seatGrid.appendChild(empty);
      seatGrid.hidden = false;
      updatePanoProgress();
      return;
    }
    const byRow = new Map();
    for (const s of list) {
      if (!byRow.has(s.row)) byRow.set(s.row, []);
      byRow.get(s.row).push(s);
    }
    const rows = [...byRow.keys()].sort((a, b) => a - b);
    for (const row of rows) {
      const group = document.createElement("div");
      group.className = "cal-seat-row-group";
      const label = document.createElement("p");
      label.className = "cal-seat-row-label";
      label.textContent = rowLabelCompact(row);
      group.appendChild(label);
      const chips = document.createElement("div");
      chips.className = "cal-seat-chips";
      const rowSeats = byRow.get(row).sort((a, b) => a.seatInRow - b.seatInRow);
      for (const seat of rowSeats) {
        const btn = document.createElement("button");
        btn.type = "button";
        const role = getSeatRole(seat);
        btn.className = `cal-seat-chip ${roleChipClass(role)}`.trim();
        btn.textContent = formatSeatCompact(seat, false);
        btn.title = seat.name || formatSeatCompact(seat, true);
        btn.dataset.seatId = seat.id;
        if (store.getPin(seat.id)) btn.classList.add("is-calibrated");
        if (selectedSeatId === seat.id) btn.classList.add("is-selected");
        btn.addEventListener("click", () => {
          setSelectedSeat(seat.id);
          clearMsgs();
        });
        chips.appendChild(btn);
      }
      group.appendChild(chips);
      seatGrid.appendChild(group);
    }
    seatGrid.hidden = false;
    updatePanoProgress();
  }

  function setActiveSection(section) {
    activeSection = section;
    if (sideRightBtn) {
      sideRightBtn.classList.toggle("is-active", section === "RIGHT");
      sideRightBtn.setAttribute("aria-pressed", section === "RIGHT" ? "true" : "false");
    }
    if (sideLeftBtn) {
      sideLeftBtn.classList.toggle("is-active", section === "LEFT");
      sideLeftBtn.setAttribute("aria-pressed", section === "LEFT" ? "true" : "false");
    }
    if (sideBridgeBtn) {
      sideBridgeBtn.classList.toggle("is-active", section === "BRIDGE");
      sideBridgeBtn.setAttribute("aria-pressed", section === "BRIDGE" ? "true" : "false");
    }
    if (section) renderSeatGrid(section);
    else if (seatGrid) seatGrid.hidden = true;
    updateSeatSelectedLabel();
    updatePanoProgress();
  }

  function initSidePick() {
    function onSide(section) {
      setActiveSection(section);
      if (
        selectedSeatId &&
        seatById(selectedSeatId) &&
        seatById(selectedSeatId).section !== section
      ) {
        setSelectedSeat("");
      }
    }
    if (sideRightBtn) {
      sideRightBtn.addEventListener("click", () => onSide("RIGHT"));
    }
    if (sideLeftBtn) {
      sideLeftBtn.addEventListener("click", () => onSide("LEFT"));
    }
    if (sideBridgeBtn) {
      sideBridgeBtn.addEventListener("click", () => onSide("BRIDGE"));
    }
  }

  function initPanoFilters() {
    const tabs = document.querySelectorAll(".cal-pano-filter-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const f = tab.getAttribute("data-filter");
        if (!f) return;
        activeFilter = f;
        tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
        if (activeSection) renderSeatGrid(activeSection);
        updatePanoProgress();
        clearMsgs();
      });
    });
  }

  function findNextUncalibratedSeat() {
    const pool = seats
      .filter(seatMatchesFilter)
      .filter((s) => !activeSection || s.section === activeSection)
      .filter((s) => !store.getPin(s.id));
    if (!pool.length) return null;
    if (!selectedSeatId) return pool[0];
    const idx = pool.findIndex((s) => s.id === selectedSeatId);
    if (idx < 0) return pool[0];
    return pool[(idx + 1) % pool.length];
  }

  function updateReadout() {
    if (!draft) {
      coordsReadout.textContent = "panU: — · panV: — (من أعلى الصورة)";
      return;
    }
    const approx = draft.fromModel ? " · موضع تقريبي — انقر الصورة ثم احفظ" : "";
    coordsReadout.textContent = `panU: ${draft.panU.toFixed(4)} · panV: ${draft.panV.toFixed(4)} (من أعلى الصورة)${approx}`;
  }

  /** يثبّت موضع العلامة على الصورة بعد أي تكبير */
  function repositionPinFromDraft() {
    if (!draft || !pin || !img) return;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    if (!w || !h) return;
    pin.style.left = `${draft.panU * w}px`;
    pin.style.top = `${draft.panV * h}px`;
  }

  function placePinFromUV(panU, panV, opts) {
    draft = {
      panU,
      panV,
      fromModel: !!(opts && opts.fromModel),
    };
    if (pin) pin.hidden = false;
    repositionPinFromDraft();
    updateReadout();
    renderAllSavedPins();
  }

  function applyCalZoom() {
    if (!img || !panoStage || !panoInner) return;
    const baseW = panoStage.clientWidth || 1;
    const w = Math.max(120, Math.round(baseW * calZoom));
    panoInner.style.width = `${w}px`;
    panoInner.style.maxWidth = "none";
    img.style.width = "100%";
    img.style.maxWidth = "none";
    img.style.height = "auto";
    if (zoomLabel) zoomLabel.textContent = `${Math.round(calZoom * 100)}%`;
    if (zoomOutBtn) zoomOutBtn.disabled = calZoom <= CAL_ZOOM_MIN + 0.001;
    if (zoomInBtn) zoomInBtn.disabled = calZoom >= CAL_ZOOM_MAX - 0.001;
    requestAnimationFrame(() => {
      repositionPinFromDraft();
      renderAllSavedPins();
      updateCalRoutePreview();
    });
  }

  function setCalZoom(next) {
    calZoom = Math.min(CAL_ZOOM_MAX, Math.max(CAL_ZOOM_MIN, next));
    applyCalZoom();
  }

  function zoomCalIn() {
    setCalZoom(+(calZoom + CAL_ZOOM_STEP).toFixed(2));
  }

  function zoomCalOut() {
    setCalZoom(+(calZoom - CAL_ZOOM_STEP).toFixed(2));
  }

  function zoomCalReset() {
    setCalZoom(1);
  }

  function initCalZoomControls() {
    if (zoomInBtn) zoomInBtn.addEventListener("click", () => zoomCalIn());
    if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => zoomCalOut());
    if (zoomResetBtn) zoomResetBtn.addEventListener("click", () => zoomCalReset());

    if (panoStage) {
      panoStage.addEventListener(
        "wheel",
        (e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          if (e.deltaY < 0) zoomCalIn();
          else zoomCalOut();
        },
        { passive: false }
      );
    }

    let resizeT = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(applyCalZoom, 120);
    });
  }

  function eventToImageUV(ev) {
    if (!img.naturalWidth) return null;
    const rect = img.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return {
      panU: x / rect.width,
      panV: y / rect.height,
    };
  }

  function onImageClick(ev) {
    const uv = eventToImageUV(ev);
    if (!uv) return;
    if (entrancePickMode) {
      entranceDraft = { panU: uv.panU, panV: uv.panV };
      entrancePickMode = false;
      updateEntranceReadout();
      updateCalRoutePreview();
      showOk("تم تحديد المدخل — اضغط «حفظ نقطة المدخل» لرفعها إلى Supabase.");
      return;
    }
    placePinFromUV(uv.panU, uv.panV, { fromModel: false });
    clearMsgs();
  }

  function refreshSavedList() {
    if (!savedList || !savedCount) return;
    const map = store.loadMap();
    const ids = Object.keys(map).sort();
    savedCount.textContent = `${ids.length} مقعد`;
    updatePanoSyncStatus();
    savedList.innerHTML = "";
    ids.forEach((id) => {
      const p = map[id];
      const s = seatById(id);
      const label = s ? formatSeatPinLabel(s) : id;
      const li = document.createElement("li");
      li.innerHTML = `<span>${label}</span><span>${p.panU.toFixed(2)}, ${p.panV.toFixed(2)}</span>`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "cal-saved-del";
      del.textContent = "حذف";
      del.addEventListener("click", async () => {
        try {
          await store.removePin(id);
          refreshSavedList();
          if (activeSection) renderSeatGrid(activeSection);
          showOk(`تم حذف المقعد.`);
        } catch (e) {
          showErr(e && e.message ? e.message : "فشل الحذف.");
        }
      });
      li.appendChild(del);
      savedList.appendChild(li);
    });
    if (activeSection) renderSeatGrid(activeSection);
    renderAllSavedPins();
  }

  saveBtn.addEventListener("click", async () => {
    clearMsgs();
    const id = selectedSeatId || (seatInput && seatInput.value.trim());
    if (!id) {
      showErr("اختر الناحية ثم اضغط رقم المقعد.");
      return;
    }
    if (!seats.some((s) => s.id === id)) {
      showErr("المقعد غير صالح.");
      return;
    }
    if (!draft) {
      showErr("انقر أولاً على الصورة لوضع العلامة.");
      return;
    }

    saveBtn.disabled = true;
    try {
      if (store.ready) await store.ready;
      await store.setPin(id, draft.panU, draft.panV, noteInput.value.trim());
      refreshSavedList();
      const saved = seatById(id);
      const short = saved ? formatSeatCompact(saved, true) : id;
      updatePanoSyncStatus();
      showOk(`تم حفظ موقع الصورة لـ ${short} — سيظهر في صفحة الحجز والكشك.`);
    } catch (e) {
      showErr(
        (e && e.message) ||
          "فشل الحفظ. تحقق من Supabase ونفّذ supabase/schema.sql (جدول threa_seat_pins)."
      );
    } finally {
      saveBtn.disabled = false;
    }
  });

  exportBtn.addEventListener("click", () => {
    const j = store.exportJson();
    jsonTa.value = j;
    jsonTa.removeAttribute("readonly");
    navigator.clipboard.writeText(j).then(
      () => showOk("تم نسخ JSON إلى الحافظة."),
      () => showOk("تم تعبئة المربع — انسخ يدوياً إن لزم.")
    );
  });

  downloadBtn.addEventListener("click", () => {
    const j = store.exportJson();
    const blob = new Blob([j], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "threa-panorama-pins.json";
    a.click();
    URL.revokeObjectURL(a.href);
    showOk("تم تنزيل الملف.");
  });

  importFile.addEventListener("change", () => {
    const f = importFile.files && importFile.files[0];
    importFile.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        if (store.ready) await store.ready;
        await store.importJson(String(reader.result));
        refreshSavedList();
        showOk("تم استيراد المعايرة.");
      } catch (e) {
        showErr(e && e.message ? e.message : "ملف غير صالح أو فشل الرفع.");
      }
    };
    reader.readAsText(f);
  });

  clearBtn.addEventListener("click", async () => {
    if (
      !globalThis.confirm(
        "مسح كل إحداثيات المعايرة من السحابة وهذا المتصفح؟"
      )
    ) {
      return;
    }
    try {
      if (store.ready) await store.ready;
      await store.clearAll();
      refreshSavedList();
      showOk("تم المسح.");
    } catch (e) {
      showErr(e && e.message ? e.message : "فشل المسح.");
    }
  });

  initCalZoomControls();
  applyCalZoom();

  img.addEventListener("click", onImageClick);
  img.addEventListener(
    "error",
    () => {
      showErr("تعذّر تحميل theater.JPG — ضع الملف بجانب الصفحة أو صحّح المسار.");
    },
    { once: true }
  );

  function applySeatFromQuery() {
    const qsSeat = new URLSearchParams(globalThis.location.search).get("seat");
    if (!qsSeat || !seats.some((s) => s.id === qsSeat)) return;
    const s = seatById(qsSeat);
    if (s && (s.section === "LEFT" || s.section === "RIGHT" || s.section === "BRIDGE")) {
      setActiveSection(s.section);
      setSelectedSeat(qsSeat);
    }
  }

  if (panoNextUncalBtn) {
    panoNextUncalBtn.addEventListener("click", () => {
      const next = findNextUncalibratedSeat();
      if (!next) {
        showErr("كل المقاعد في هذا العرض معايرة بالفعل.");
        return;
      }
      if (next.section !== activeSection) setActiveSection(next.section);
      setSelectedSeat(next.id);
      showOk(`التالي: ${formatSeatPinLabel(next)} — انقر الصورة ثم احفظ.`);
    });
  }

  if (entrancePickBtn) {
    entrancePickBtn.addEventListener("click", () => {
      entrancePickMode = true;
      updateEntranceReadout();
      showOk("انقر على الصورة عند باب/مدخل المسرح.");
    });
  }

  if (entranceSaveBtn) {
    entranceSaveBtn.addEventListener("click", async () => {
      clearMsgs();
      if (!entranceDraft) {
        showErr("حدّد المدخل على الصورة أولاً.");
        return;
      }
      const q = globalThis.ThreaGuestQuota;
      if (!q || typeof q.savePanoramaEntrance !== "function") {
        showErr("تعذّر الحفظ — guest-quota.js غير محمّل.");
        return;
      }
      entranceSaveBtn.disabled = true;
      try {
        if (q.ready) await q.ready;
        await q.savePanoramaEntrance(entranceDraft);
        showOk("تم حفظ نقطة المدخل — سيظهر المسار في الكشك والحجز.");
      } catch (e) {
        showErr(e && e.message ? e.message : "فشل حفظ المدخل.");
      } finally {
        entranceSaveBtn.disabled = false;
      }
    });
  }

  if (panoRefreshCloudBtn) {
    panoRefreshCloudBtn.addEventListener("click", async () => {
      clearMsgs();
      panoRefreshCloudBtn.disabled = true;
      try {
        if (typeof store.resetLocalAndPullFromCloud === "function") {
          await store.resetLocalAndPullFromCloud();
        } else if (typeof store.refreshFromCloud === "function") {
          await store.refreshFromCloud();
        }
        refreshSavedList();
        showOk(
          "تم تحميل المعايرة من Supabase (وتم تجاهل النسخة القديمة في هذا المتصفح)."
        );
      } catch (e) {
        showErr(e && e.message ? e.message : "فشل التحديث من السحابة.");
      } finally {
        panoRefreshCloudBtn.disabled = false;
      }
    });
  }

  async function initCalibrate() {
    initSidePick();
    initPanoFilters();
    if (globalThis.ThreaGuestQuota && globalThis.ThreaGuestQuota.ready) {
      await globalThis.ThreaGuestQuota.ready;
      roleSets = buildRoleSets();
      loadEntranceFromConfig();
    } else {
      loadEntranceFromConfig();
    }
    if (store.ready) await store.ready;
    updatePanoSyncStatus();
    refreshSavedList();
    if (typeof store.refreshFromCloud === "function") {
      try {
        await store.refreshFromCloud();
        refreshSavedList();
      } catch (err) {
        const st = typeof store.getSyncStatus === "function" ? store.getSyncStatus() : null;
        if (st && st.lastSyncError) {
          showErr(st.lastSyncError);
        } else if (err && err.message) {
          showErr(err.message);
        }
      }
    }
    updatePanoSyncStatus();
    applySeatFromQuery();
    updatePanoProgress();
  }

  initCalibrate();

  img.addEventListener("load", () => {
    applyCalZoom();
    syncPinFromSelectedSeat();
    renderAllSavedPins();
    updateCalRoutePreview();
  });

  if (img.complete && img.naturalWidth > 0) {
    syncPinFromSelectedSeat();
  }

  (function initCollapsePanels() {
    document.querySelectorAll(".cal-collapse-toggle").forEach((toggle) => {
      const bodyId = toggle.getAttribute("aria-controls");
      if (!bodyId) return;
      const body = document.getElementById(bodyId);
      const chevron = toggle.querySelector(".cal-collapse-chevron");
      if (!body) return;

      toggle.addEventListener("click", () => {
        const open = body.hidden;
        body.hidden = !open;
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.classList.toggle("is-open", open);
        if (chevron) chevron.textContent = open ? "▲" : "▼";
      });
    });
  })();

  (function initRosterPanel() {
    const rosterApi = globalThis.ThreaStudentRoster;
    const tbody = document.getElementById("roster-tbody");
    const rosterMsg = document.getElementById("roster-msg");
    if (!rosterApi || !tbody) return;

    function showRosterMsg(text, isErr) {
      if (!rosterMsg) return;
      rosterMsg.hidden = false;
      rosterMsg.textContent = text;
      rosterMsg.classList.toggle("cal-msg--err", !!isErr);
    }

    function addRow(idVal, nameVal) {
      const tr = document.createElement("tr");
      const tdId = document.createElement("td");
      const inpId = document.createElement("input");
      inpId.type = "text";
      inpId.className = "cal-field-input roster-id";
      inpId.value = idVal || "";
      const tdName = document.createElement("td");
      const inpName = document.createElement("input");
      inpName.type = "text";
      inpName.className = "cal-field-input roster-name";
      inpName.value = nameVal || "";
      const tdDel = document.createElement("td");
      const del = document.createElement("button");
      del.type = "button";
      del.className = "cal-saved-del";
      del.textContent = "حذف";
      del.addEventListener("click", () => tr.remove());
      tdId.appendChild(inpId);
      tdName.appendChild(inpName);
      tdDel.appendChild(del);
      tr.appendChild(tdId);
      tr.appendChild(tdName);
      tr.appendChild(tdDel);
      tbody.appendChild(tr);
    }

    function collectFromTable() {
      const map = {};
      tbody.querySelectorAll("tr").forEach((tr) => {
        const idInp = tr.querySelector(".roster-id");
        const nameInp = tr.querySelector(".roster-name");
        if (!idInp || !nameInp) return;
        const id =
          typeof rosterApi.normalizeGuestKey === "function"
            ? rosterApi.normalizeGuestKey(idInp.value)
            : rosterApi.normalizeNationalId(idInp.value);
        const name = rosterApi.normalizeName(nameInp.value);
        if (id && name) map[id] = name;
      });
      return map;
    }

    async function refreshFromRoster() {
      await rosterApi.ready;
      tbody.innerHTML = "";
      const all = rosterApi.getAllEntries();
      const ids = Object.keys(all).sort();
      if (!ids.length) addRow("", "");
      else ids.forEach((id) => addRow(id, all[id]));
    }

    document.getElementById("roster-add-row")?.addEventListener("click", () => addRow("", ""));

    document.getElementById("roster-xlsx")?.addEventListener("change", async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!f) return;
      if (typeof XLSX === "undefined") {
        showRosterMsg("مكتبة Excel غير محمّلة.", true);
        return;
      }
      try {
        const ab = await f.arrayBuffer();
        const wb = XLSX.read(ab, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
        const map = {};
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row) || row.length < 2) continue;
          const id =
            typeof rosterApi.normalizeGuestKey === "function"
              ? rosterApi.normalizeGuestKey(String(row[0] ?? ""))
              : rosterApi.normalizeNationalId(String(row[0] ?? ""));
          const name = rosterApi.normalizeName(String(row[1] ?? ""));
          const isGuest = /^GUEST-/i.test(id);
          if (!id || (!isGuest && id.length < 10)) continue;
          if (!name) continue;
          map[id] = name;
        }
        const n = Object.keys(map).length;
        if (!n) {
          showRosterMsg("لم يُستورد أي صف صالح (عمود الهوية + الاسم).", true);
          return;
        }
        await rosterApi.importEntries(map, { pushCloud: true, replace: true });
        await refreshFromRoster();
        const st = rosterApi.getStatus();
        showRosterMsg(
          st.firestoreOk
            ? `تم استيراد ${n} طالب وحفظهم في Supabase (جدول threa_student_roster → صف default → عمود entries).`
            : `تم الاستيراد محلياً فقط (${n}) — Supabase غير متصل: ${st.lastError || "تحقق من schema.sql"}`,
          !st.firestoreOk
        );
      } catch (e) {
        showRosterMsg((e && e.message) || String(e), true);
      }
    });

    document.getElementById("roster-pull-cloud")?.addEventListener("click", async () => {
      try {
        await rosterApi.ready;
        const ok = await rosterApi.pullFromFirestore();
        await refreshFromRoster();
        const n = Object.keys(rosterApi.getAllEntries()).length;
        showRosterMsg(
          ok
            ? `تم الجلب من Supabase — ${n} طالب في القائمة.`
            : `تعذّر الجلب: ${rosterApi.getStatus().lastError || "تحقق من Supabase"}`,
          !ok
        );
      } catch (e) {
        showRosterMsg((e && e.message) || String(e), true);
      }
    });

    document.getElementById("roster-save-cloud")?.addEventListener("click", async () => {
      const map = collectFromTable();
      if (!Object.keys(map).length) {
        showRosterMsg("القائمة فارغة أو الحقول ناقصة.", true);
        return;
      }
      try {
        await rosterApi.ready;
        await rosterApi.importEntries(map, { pushCloud: true, replace: true });
        const st = rosterApi.getStatus();
        const n = Object.keys(map).length;
        showRosterMsg(
          st.firestoreOk
            ? `تم حفظ ${n} طالب في Supabase. افتح جدول threa_student_roster → صف id = default → عمود entries (JSON).`
            : `فشل الحفظ في Supabase: ${st.lastError || "تحقق من الاتصال و RLS"}`,
          !st.firestoreOk
        );
      } catch (e) {
        showRosterMsg((e && e.message) || String(e), true);
      }
    });

    rosterApi.ready.then(refreshFromRoster).catch(() => addRow("", ""));
  })();

  (function initBookingPolicyConfig() {
    const quotaApi = globalThis.ThreaGuestQuota;
    const policyApi = globalThis.ThreaBookingPolicy;
    const form = document.getElementById("booking-policy-form");
    const previewEl = document.getElementById("booking-policy-preview");
    const statusEl = document.getElementById("booking-policy-status");
    const saveBtn = document.getElementById("booking-policy-save");
    const resetBtn = document.getElementById("booking-policy-reset");
    const syncGuestsBtn = document.getElementById("booking-policy-sync-guests");
    if (!quotaApi || !policyApi || !form) return;

    function showPolicyStatus(msg, isErr) {
      if (!statusEl) return;
      statusEl.hidden = false;
      statusEl.textContent = msg;
      statusEl.classList.toggle("cal-msg--err", !!isErr);
    }

    function updatePreview() {
      const draft = policyApi.readFromForm(form);
      policyApi.applyPolicy(draft);
      const c = policyApi.countPreview();
      const desc = policyApi.describePolicy(draft);
      if (previewEl) {
        previewEl.innerHTML = [
          `<strong>${desc}</strong>`,
          `<span class="cal-policy-stat cal-policy-stat--student">خريجون: ${c.student} مقعد</span>`,
          `<span class="cal-policy-stat cal-policy-stat--companion">مرافقون: ${c.companion} مقعد</span>`,
          `<span class="cal-policy-stat cal-policy-stat--guest">ضيوف (حسب المعايير): ${c.guest} مقعد</span>`,
          `<span class="cal-policy-stat">المجموع: ${c.total}</span>`,
        ].join(" · ");
      }
    }

    function loadFormFromCloud() {
      const p =
        (typeof quotaApi.getBookingPolicy === "function" && quotaApi.getBookingPolicy()) ||
        policyApi.getPolicy() ||
        policyApi.getDefaults();
      policyApi.writeToForm(p, form);
      policyApi.applyPolicy(p);
      updatePreview();
    }

    form.addEventListener("input", () => updatePreview());
    form.addEventListener("change", () => updatePreview());

    resetBtn?.addEventListener("click", () => {
      policyApi.writeToForm(policyApi.getDefaults(), form);
      updatePreview();
      showPolicyStatus("تمت استعادة القيم الافتراضية — اضغط «حفظ المعايير» لتطبيقها.", false);
    });

    saveBtn?.addEventListener("click", async () => {
      const draft = policyApi.readFromForm(form);
      try {
        await quotaApi.ready;
        await quotaApi.saveBookingPolicy(draft);
        loadFormFromCloud();
        showPolicyStatus("تم حفظ معايير الحجز في Supabase.", false);
      } catch (e) {
        showPolicyStatus((e && e.message) || "فشل الحفظ.", true);
      }
    });

    syncGuestsBtn?.addEventListener("click", async () => {
      const draft = policyApi.readFromForm(form);
      try {
        await quotaApi.ready;
        await quotaApi.saveBookingPolicy(draft);
        if (typeof quotaApi.applyPolicyDefaultSeatPools === "function") {
          await quotaApi.applyPolicyDefaultSeatPools({ syncGuestQuota: true });
        }
        globalThis.dispatchEvent(new CustomEvent("threa-seat-pools-reload"));
        const st = quotaApi.getStatus();
        showPolicyStatus(
          `تم حفظ المعايير ومقاعد الحجز: خريج ${st.studentPoolSize} · مرافق ${st.companionPoolSize} · ضيف ${st.poolSize}.`,
          false
        );
      } catch (e) {
        showPolicyStatus((e && e.message) || "فشل التطبيق.", true);
      }
    });

    quotaApi.ready.then(loadFormFromCloud).catch(() => {
      policyApi.writeToForm(policyApi.getDefaults(), form);
      updatePreview();
    });
  })();

  (function initSeatPoolsConfig() {
    const quotaApi = globalThis.ThreaGuestQuota;
    const grid = document.getElementById("cal-pool-seat-grid");
    const statusEl = document.getElementById("cal-pool-status");
    const hintEl = document.getElementById("cal-pool-tab-hint");
    const guestSides = document.getElementById("cal-pool-guest-sides");
    const saveBtn = document.getElementById("cal-pool-save");
    const clearBtn = document.getElementById("cal-pool-clear");
    const fromPolicyBtn = document.getElementById("cal-pool-from-policy");
    const tabs = document.querySelectorAll(".cal-pool-tab");
    const sideRight = document.getElementById("cal-pool-side-right");
    const sideLeft = document.getElementById("cal-pool-side-left");
    const sideBridge = document.getElementById("cal-pool-side-bridge");
    if (!quotaApi || !grid || !statusEl) return;

    /** @type {Set<string>} */
    const selectedStudent = new Set();
    /** @type {Set<string>} */
    const selectedCompanion = new Set();
    /** @type {Set<string>} */
    const selectedGuest = new Set();
    /** @type {'student' | 'companion' | 'guest'} */
    let activePool = "student";
    /** @type {'LEFT' | 'RIGHT' | 'BRIDGE' | null} */
    let guestSide = "LEFT";

    function activeSet() {
      if (activePool === "student") return selectedStudent;
      if (activePool === "companion") return selectedCompanion;
      return selectedGuest;
    }

    function activeClass() {
      if (activePool === "student") return "is-student-designated";
      if (activePool === "companion") return "is-companion-designated";
      return "is-guest-designated";
    }

    function updateStatusLine() {
      const st = quotaApi.getStatus();
      const cloud = `محفوظ في Supabase: خريج ${st.studentPoolSize} · مرافق ${st.companionPoolSize} · ضيف ${st.poolSize}`;
      const localDirty =
        selectedStudent.size !== st.studentPoolSize ||
        selectedCompanion.size !== st.companionPoolSize ||
        selectedGuest.size !== st.poolSize;
      if (localDirty) {
        statusEl.textContent = `${cloud} — تعديل محلي (اضغط «حفظ المقاعد»): خريج ${selectedStudent.size} · مرافق ${selectedCompanion.size} · ضيف ${selectedGuest.size}`;
      } else {
        statusEl.textContent = `${cloud} — متزامن`;
      }
      statusEl.classList.remove("cal-msg--err");
    }

    function sectionsForPool() {
      if (activePool === "student") return ["LEFT"];
      if (activePool === "companion") return ["RIGHT"];
      if (!guestSide) return [];
      return [guestSide];
    }

    function renderPoolGrid() {
      grid.innerHTML = "";
      const sections = sectionsForPool();
      const list = seats.filter((s) => sections.includes(s.section));
      const sel = activeSet();
      const cls = activeClass();
      const byRow = new Map();
      for (const s of list) {
        if (!byRow.has(s.row)) byRow.set(s.row, []);
        byRow.get(s.row).push(s);
      }
      for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
        const group = document.createElement("div");
        group.className = "cal-seat-row-group";
        const label = document.createElement("p");
        label.className = "cal-seat-row-label";
        label.textContent = rowLabelCompact(row);
        group.appendChild(label);
        const chips = document.createElement("div");
        chips.className = "cal-seat-chips";
        for (const seat of byRow.get(row).sort((a, b) => a.seatInRow - b.seatInRow)) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "cal-seat-chip";
          btn.textContent = formatSeatCompact(seat, false);
          btn.title = seat.name || formatSeatCompact(seat, true);
          btn.dataset.seatId = seat.id;
          if (sel.has(seat.id)) btn.classList.add(cls);
          btn.addEventListener("click", () => {
            if (sel.has(seat.id)) {
              sel.delete(seat.id);
              btn.classList.remove(cls);
            } else {
              sel.add(seat.id);
              btn.classList.add(cls);
            }
            updateStatusLine();
          });
          chips.appendChild(btn);
        }
        group.appendChild(chips);
        grid.appendChild(group);
      }
      updateStatusLine();
    }

    function setGuestSide(section) {
      guestSide = section;
      if (sideRight) {
        sideRight.classList.toggle("is-active", section === "RIGHT");
        sideRight.setAttribute("aria-pressed", section === "RIGHT" ? "true" : "false");
      }
      if (sideLeft) {
        sideLeft.classList.toggle("is-active", section === "LEFT");
        sideLeft.setAttribute("aria-pressed", section === "LEFT" ? "true" : "false");
      }
      if (sideBridge) {
        sideBridge.classList.toggle("is-active", section === "BRIDGE");
        sideBridge.setAttribute("aria-pressed", section === "BRIDGE" ? "true" : "false");
      }
      renderPoolGrid();
    }

    function setActivePool(pool) {
      activePool = pool;
      tabs.forEach((t) => {
        const on = t.getAttribute("data-pool") === pool;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      if (guestSides) guestSides.hidden = pool !== "guest";
      if (hintEl) {
        if (pool === "student") {
          hintEl.textContent = "خريجون: انقر مقاعد الناحية اليسار فقط.";
        } else if (pool === "companion") {
          hintEl.textContent = "مرافقون: انقر مقاعد الناحية اليمين فقط.";
        } else {
          hintEl.textContent = "ضيوف: اختر الناحية (يمين / يسار / قاعدة وسط) ثم انقر أرقام المقاعد.";
        }
      }
      if (pool === "guest" && !guestSide) guestSide = "LEFT";
      renderPoolGrid();
    }

    function loadFromCloud() {
      selectedStudent.clear();
      selectedCompanion.clear();
      selectedGuest.clear();
      for (const id of quotaApi.getStudentSeatIds()) selectedStudent.add(id);
      for (const id of quotaApi.getCompanionSeatIds()) selectedCompanion.add(id);
      for (const id of quotaApi.getGuestSeatIds()) selectedGuest.add(id);
      renderPoolGrid();
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const pool = tab.getAttribute("data-pool");
        if (pool === "student" || pool === "companion" || pool === "guest") {
          setActivePool(pool);
        }
      });
    });

    sideRight?.addEventListener("click", () => setGuestSide("RIGHT"));
    sideLeft?.addEventListener("click", () => setGuestSide("LEFT"));
    sideBridge?.addEventListener("click", () => setGuestSide("BRIDGE"));

    clearBtn?.addEventListener("click", () => {
      activeSet().clear();
      renderPoolGrid();
    });

    fromPolicyBtn?.addEventListener("click", async () => {
      const policyApi = globalThis.ThreaBookingPolicy;
      const form = document.getElementById("booking-policy-form");
      if (policyApi && form) {
        policyApi.applyPolicy(policyApi.readFromForm(form));
      }
      try {
        await quotaApi.ready;
        if (typeof quotaApi.applyPolicyDefaultSeatPools === "function") {
          await quotaApi.applyPolicyDefaultSeatPools({ syncGuestQuota: true });
        }
        loadFromCloud();
        statusEl.textContent = "تم ملء المقاعد من المعايير — اضغط «حفظ» إن عدّلت شيئاً.";
      } catch (e) {
        statusEl.textContent = (e && e.message) || "فشل الملء من المعايير.";
        statusEl.classList.add("cal-msg--err");
      }
    });

    saveBtn?.addEventListener("click", async () => {
      try {
        await quotaApi.ready;
        await quotaApi.saveSeatPools(
          {
            student: [...selectedStudent],
            companion: [...selectedCompanion],
            guest: [...selectedGuest],
          },
          { syncGuestQuota: true }
        );
        loadFromCloud();
        const st = quotaApi.getStatus();
        statusEl.textContent = `تم الحفظ في Supabase — خريج ${st.studentPoolSize} · مرافق ${st.companionPoolSize} · ضيف ${st.poolSize}.`;
        statusEl.classList.remove("cal-msg--err");
        globalThis.dispatchEvent(new CustomEvent("threa-seat-pools-reload"));
      } catch (e) {
        statusEl.textContent = (e && e.message) || "فشل الحفظ.";
        statusEl.classList.add("cal-msg--err");
      }
    });

    globalThis.addEventListener("threa-seat-pools-reload", loadFromCloud);

    quotaApi.ready.then(() => {
      setActivePool("student");
      loadFromCloud();
    });
  })();

  (function initCeremonyGuestConfig() {
    const quotaApi = globalThis.ThreaGuestQuota;
    const ga = globalThis.ThreaGuestAssignments;
    const input = document.getElementById("ceremony-guest-quota");
    const quotaStatusEl = document.getElementById("ceremony-quota-status");
    const quotaSaveBtn = document.getElementById("ceremony-quota-save");
    if (!quotaApi || !input || !quotaStatusEl) return;

    async function refreshStatus() {
      await quotaApi.ready;
      if (ga && ga.ready) {
        await ga.ready;
        if (typeof ga.refresh === "function") await ga.refresh({ force: true });
      }
      const used =
        ga && typeof ga.countCeremonyGuestSeats === "function"
          ? ga.countCeremonyGuestSeats()
          : 0;
      const occupied =
        ga && typeof ga.getOccupiedSeatIds === "function"
          ? ga.getOccupiedSeatIds()
          : new Set();
      const avail = quotaApi.getCeremonyAvailability(occupied, used);
      const st = quotaApi.getStatus();

      input.value = String(quotaApi.getQuota());

      if (avail.poolConfigured) {
        quotaStatusEl.textContent = `حجوزات ضيوف: ${avail.used} · متاح: ${avail.remaining} (من ${avail.poolSize} مقعد، حدّ ${avail.quota}) · خريج ${st.studentPoolSize} · مرافق ${st.companionPoolSize}`;
      } else {
        quotaStatusEl.textContent = `حدّ الحجوزات: ${avail.quota} — حدّد مقاعد الضيوف في القسم أعلاه واحفظها`;
      }
      quotaStatusEl.hidden = false;
      quotaStatusEl.classList.remove("cal-msg--err");
    }

    quotaSaveBtn?.addEventListener("click", async () => {
      const n = parseInt(input.value, 10);
      if (!Number.isFinite(n) || n < 0) {
        quotaStatusEl.textContent = "أدخل عدداً صحيحاً (0 أو أكثر).";
        quotaStatusEl.classList.add("cal-msg--err");
        return;
      }
      try {
        await quotaApi.ready;
        await quotaApi.saveQuota(n);
        await refreshStatus();
        quotaStatusEl.textContent = `تم حفظ الحدّ الأقصى: ${n} حجزاً للضيوف.`;
      } catch (e) {
        quotaStatusEl.textContent = (e && e.message) || "فشل الحفظ.";
        quotaStatusEl.classList.add("cal-msg--err");
      }
    });

    globalThis.addEventListener("threa-seat-pools-reload", () => {
      void refreshStatus();
    });

    quotaApi.ready.then(refreshStatus).catch(() => {
      quotaStatusEl.textContent = "تعذّر تحميل الإعدادات.";
      quotaStatusEl.classList.add("cal-msg--err");
    });
  })();
})();
