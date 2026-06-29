/**
 * كشوف الحضور والمقاعد المتاحة — طباعة وتصدير PDF (متابعة الحجوزات).
 */
(function () {
  "use strict";

  const SEATS = window.ThreaSeats ? window.ThreaSeats.SEATS : [];

  /** @typedef {{ name: string, seatText: string, category?: string, sortKey: string }} RosterRow */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatSeat(seat) {
    if (!seat) return "—";
    if (window.ThreaSeats && typeof window.ThreaSeats.formatSeatShort === "function") {
      const short = window.ThreaSeats.formatSeatShort(seat);
      return seat.name ? `${seat.name} (${short})` : short;
    }
    return seat.name || seat.id || "—";
  }

  function seatSortKey(seat) {
    if (!seat) return "z";
    const sec =
      seat.section === "LEFT" ? "0" : seat.section === "RIGHT" ? "1" : seat.section === "BRIDGE" ? "2" : "9";
    const row = String(seat.row || 0).padStart(2, "0");
    const num = String(seat.seatInRow || 0).padStart(2, "0");
    return `${sec}|${row}|${num}`;
  }

  function sortRows(rows) {
    return rows.sort((a, b) => {
      const c = a.sortKey.localeCompare(b.sortKey, "en");
      if (c !== 0) return c;
      return (a.name || "").localeCompare(b.name || "", "ar");
    });
  }

  function isCeremonyGuest(rec) {
    const ga = window.ThreaGuestAssignments;
    return !!(ga && typeof ga.isCeremonyGuestId === "function" && ga.isCeremonyGuestId(rec.nationalId));
  }

  function isActiveBooking(rec) {
    return rec && rec.seatIds && rec.seatIds.length > 0 && (rec.rsvpStatus || "pending") !== "declined";
  }

  function seatById(id) {
    return SEATS.find((s) => s.id === id) || null;
  }

  function buildGraduateRows() {
    const ga = window.ThreaGuestAssignments;
    if (!ga) return [];
    /** @type {RosterRow[]} */
    const rows = [];
    for (const rec of ga.listAllGuests()) {
      if (isCeremonyGuest(rec) || !isActiveBooking(rec)) continue;
      const seat = seatById(rec.seatIds[0]);
      if (!seat) continue;
      rows.push({
        name: String(rec.studentName || "—").trim() || "—",
        seatText: formatSeat(seat),
        sortKey: seatSortKey(seat),
      });
    }
    return sortRows(rows);
  }

  function buildCompanionRows() {
    const ga = window.ThreaGuestAssignments;
    if (!ga) return [];
    /** @type {RosterRow[]} */
    const rows = [];
    for (const rec of ga.listAllGuests()) {
      if (isCeremonyGuest(rec) || !isActiveBooking(rec)) continue;
      const compName = String(rec.companionName || "").trim();
      if (!compName || !rec.seatIds[1]) continue;
      const seat = seatById(rec.seatIds[1]);
      if (!seat) continue;
      rows.push({
        name: compName,
        seatText: formatSeat(seat),
        sortKey: seatSortKey(seat),
      });
    }
    return sortRows(rows);
  }

  function buildGuestRows() {
    const ga = window.ThreaGuestAssignments;
    if (!ga) return [];
    /** @type {RosterRow[]} */
    const rows = [];
    for (const rec of ga.listAllGuests()) {
      if (!isCeremonyGuest(rec) || !isActiveBooking(rec)) continue;
      const seat = seatById(rec.seatIds[0]);
      if (!seat) continue;
      rows.push({
        name: String(rec.studentName || "—").trim() || "—",
        seatText: formatSeat(seat),
        sortKey: seatSortKey(seat),
      });
    }
    return sortRows(rows);
  }

  function poolSeats(kind) {
    const quota = window.ThreaGuestQuota;
    const api = window.ThreaSeats;
    if (!quota || !api || !SEATS.length) return [];
    if (typeof quota.getCalibratedSavedSeatPool === "function") {
      return quota.getCalibratedSavedSeatPool(kind, SEATS);
    }
    if (kind === "student" && typeof quota.getStudentSeatPool === "function") {
      return quota.getStudentSeatPool(SEATS);
    }
    if (kind === "companion" && typeof quota.getCompanionSeatPool === "function") {
      return quota.getCompanionSeatPool(SEATS);
    }
    if (kind === "guest" && typeof quota.getGuestSeatPool === "function") {
      return quota.getGuestSeatPool(SEATS);
    }
    return [];
  }

  function buildAvailableRows() {
    const ga = window.ThreaGuestAssignments;
    const occupied =
      ga && typeof ga.getOccupiedSeatIds === "function" ? ga.getOccupiedSeatIds() : new Set();
    /** @type {RosterRow[]} */
    const rows = [];
    const specs = [
      ["student", "خريج"],
      ["companion", "مرافق"],
      ["guest", "ضيف"],
    ];
    for (const [kind, label] of specs) {
      for (const seat of poolSeats(kind)) {
        if (!seat || !seat.id || occupied.has(seat.id)) continue;
        rows.push({
          name: "—",
          seatText: formatSeat(seat),
          category: label,
          sortKey: `${label}|${seatSortKey(seat)}`,
        });
      }
    }
    return rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey, "en"));
  }

  const ROSTER_META = {
    students: {
      title: "كشف حضور الخريجين",
      filename: "كشف-حضور-الخريجين",
      columns: ["م", "اسم الخريج", "المقعد"],
      build: buildGraduateRows,
    },
    companions: {
      title: "كشف حضور المرافقين",
      filename: "كشف-حضور-المرافقين",
      columns: ["م", "اسم المرافق", "المقعد"],
      build: buildCompanionRows,
    },
    guests: {
      title: "كشف حضور الضيوف",
      filename: "كشف-حضور-الضيوف",
      columns: ["م", "اسم الضيف", "المقعد"],
      build: buildGuestRows,
    },
    available: {
      title: "كشف المقاعد المتاحة",
      filename: "كشف-المقاعد-المتاحة",
      columns: ["م", "الفئة", "المقعد"],
      build: buildAvailableRows,
    },
  };

  function reportLogoUrl() {
    const cfg = globalThis.THREA_APP_CONFIG || {};
    const base =
      cfg.siteBaseUrl ||
      (globalThis.location
        ? globalThis.location.origin +
          globalThis.location.pathname.replace(/\/[^/]*$/, "")
        : "");
    return `${String(base).replace(/\/$/, "")}/assets/icon2.jpeg`;
  }

  function eventSubtitle() {
    const cfg = globalThis.THREA_APP_CONFIG || {};
    const parts = [
      cfg.graduationBatch ? `حفل تخرّج ${cfg.graduationBatch}` : "حفل التخرّج",
      cfg.eventDay,
      cfg.eventDate,
      cfg.eventTime ? `الساعة ${cfg.eventTime}` : "",
    ].filter(Boolean);
    return parts.join(" · ");
  }

  /**
   * @param {string} title
   * @param {number} count
   */
  function reportHeader(title, count) {
    const cfg = globalThis.THREA_APP_CONFIG || {};
    const school = cfg.schoolName || "ثانوية نخبة الشمال الأهلية";
    const when = new Date().toLocaleString("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const logo = reportLogoUrl();
    return `
      <header class="br-report-header">
        <div class="br-brand">
          <img class="br-logo" src="${escapeHtml(logo)}" alt="" width="64" height="64" />
          <div class="br-brand-text">
            <p class="br-school">${escapeHtml(school)}</p>
            <p class="br-event">${escapeHtml(eventSubtitle())}</p>
          </div>
        </div>
        <div class="br-title-bar">
          <h1>${escapeHtml(title)}</h1>
        </div>
        <div class="br-meta">
          <span class="br-meta-item"><strong>تاريخ الطباعة:</strong> ${escapeHtml(when)}</span>
          <span class="br-meta-item"><strong>عدد السجلات:</strong> ${count}</span>
        </div>
      </header>`;
  }

  function reportFooter() {
    const cfg = globalThis.THREA_APP_CONFIG || {};
    const school = cfg.schoolName || "ثانوية نخبة الشمال الأهلية";
    return `
      <footer class="br-report-footer">
        <div class="br-footer-line">
          <span>${escapeHtml(school)}</span>
          <span>نظام حجز مقاعد ثريا</span>
        </div>
        <div class="br-sign-row">
          <div class="br-sign-box"><span>توقيع المشرف</span><div class="br-sign-line"></div></div>
          <div class="br-sign-box"><span>توقيع المنظّم</span><div class="br-sign-line"></div></div>
        </div>
      </footer>`;
  }

  /**
   * @param {RosterRow[]} rows
   * @param {string[]} columns
   * @param {boolean} showCategory
   */
  function tableHtml(rows, columns, showCategory) {
    const body = rows.length
      ? rows
          .map((r, i) => {
            const zebra = i % 2 === 1 ? " class=\"br-zebra\"" : "";
            const cells = showCategory
              ? `<td class="br-num">${i + 1}</td><td>${escapeHtml(r.category || "—")}</td><td class="br-seat">${escapeHtml(r.seatText)}</td>`
              : `<td class="br-num">${i + 1}</td><td class="br-name">${escapeHtml(r.name)}</td><td class="br-seat">${escapeHtml(r.seatText)}</td>`;
            return `<tr${zebra}>${cells}</tr>`;
          })
          .join("")
      : `<tr><td colspan="${columns.length}" class="br-empty">لا توجد بيانات في هذا الكشف.</td></tr>`;

    return `
      <div class="br-table-wrap">
        <table class="br-table">
          <thead>
            <tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function printStyles() {
    return `
      @page {
        size: A4 portrait;
        margin: 10mm 12mm 12mm;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #e8eaef;
      }
      body {
        font-family: Tajawal, "Segoe UI", Arial, sans-serif;
        color: #1a1f2e;
        direction: rtl;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .br-page {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        padding: 12mm 14mm 10mm;
        background: #fff;
        box-shadow: 0 2px 24px rgba(0, 0, 0, 0.08);
      }
      .br-report-header {
        margin-bottom: 10mm;
        padding-bottom: 5mm;
        border-bottom: 3px solid #b8860b;
      }
      .br-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 6mm;
      }
      .br-logo {
        width: 56px;
        height: 56px;
        border-radius: 10px;
        object-fit: cover;
        border: 1px solid #e0d4b8;
        flex-shrink: 0;
      }
      .br-school {
        margin: 0;
        font-size: 15px;
        font-weight: 800;
        color: #0c1222;
        line-height: 1.35;
      }
      .br-event {
        margin: 3px 0 0;
        font-size: 11px;
        font-weight: 600;
        color: #5a6478;
      }
      .br-title-bar {
        background: linear-gradient(135deg, #0c1222 0%, #1a2744 100%);
        border-radius: 8px;
        padding: 8px 14px;
        margin-bottom: 5mm;
      }
      .br-title-bar h1 {
        margin: 0;
        font-size: 17px;
        font-weight: 800;
        color: #f5e6b8;
        letter-spacing: 0.02em;
      }
      .br-meta {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 6px 16px;
        font-size: 10.5px;
        color: #4a5568;
      }
      .br-meta strong {
        color: #1a1f2e;
        font-weight: 700;
      }
      .br-content {
        flex: 1;
      }
      .br-table-wrap {
        border: 1px solid #c5cdd8;
        border-radius: 8px;
        overflow: hidden;
      }
      .br-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
        line-height: 1.45;
      }
      .br-table thead {
        display: table-header-group;
      }
      .br-table th {
        background: #0c1222;
        color: #f8f4e8;
        font-weight: 700;
        font-size: 11px;
        padding: 8px 10px;
        text-align: right;
        border-bottom: 2px solid #b8860b;
      }
      .br-table td {
        padding: 7px 10px;
        text-align: right;
        vertical-align: middle;
        border-bottom: 1px solid #e2e8f0;
      }
      .br-table tbody tr:last-child td {
        border-bottom: none;
      }
      .br-table tr.br-zebra td {
        background: #f7f9fc;
      }
      .br-num {
        width: 38px;
        text-align: center !important;
        font-weight: 700;
        color: #5a6478;
      }
      .br-name {
        font-weight: 600;
        color: #0c1222;
      }
      .br-seat {
        font-size: 10.5px;
        color: #2d3748;
      }
      .br-empty {
        text-align: center;
        color: #718096;
        padding: 16px !important;
      }
      .br-report-footer {
        margin-top: 10mm;
        padding-top: 5mm;
        border-top: 1px solid #d8dee8;
      }
      .br-footer-line {
        display: flex;
        justify-content: space-between;
        font-size: 9px;
        color: #718096;
        margin-bottom: 8mm;
      }
      .br-sign-row {
        display: flex;
        justify-content: space-between;
        gap: 20mm;
      }
      .br-sign-box {
        flex: 1;
        font-size: 10px;
        color: #4a5568;
      }
      .br-sign-box span {
        display: block;
        margin-bottom: 6px;
        font-weight: 600;
      }
      .br-sign-line {
        height: 1px;
        background: #a0aec0;
        margin-top: 14px;
      }
      @media print {
        html, body { background: #fff; }
        .br-page {
          width: auto;
          min-height: auto;
          margin: 0;
          padding: 0;
          box-shadow: none;
        }
        .br-table tr {
          page-break-inside: avoid;
        }
      }`;
  }

  async function ensureDataReady() {
    const ga = window.ThreaGuestAssignments;
    const quota = window.ThreaGuestQuota;
    const pano = window.ThreaPanoramaStorage;
    if (ga && ga.ready) await ga.ready;
    if (quota && quota.ready) await quota.ready;
    if (pano && pano.ready) await pano.ready;
  }

  /**
   * @param {'students' | 'companions' | 'guests' | 'available'} kind
   */
  function buildDocument(kind) {
    const meta = ROSTER_META[kind];
    if (!meta) return null;
    const rows = meta.build();
    const showCategory = kind === "available";
    const bodyHtml = `
      <div class="br-page">
        ${reportHeader(meta.title, rows.length)}
        <main class="br-content">${tableHtml(rows, meta.columns, showCategory)}</main>
        ${reportFooter()}
      </div>`;
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(meta.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>${printStyles().replace(/@import[^;]+;/, "")}</style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
    return { meta, rows, bodyHtml, html };
  }

  function waitMs(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * @param {string} html
   */
  async function mountRosterFrame(html) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "تصدير الكشف");
    iframe.style.cssText =
      "position:fixed;left:0;top:0;width:210mm;min-height:297mm;border:0;z-index:99998;background:#fff;pointer-events:none;";
    document.body.appendChild(iframe);

    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    idoc.write(html);
    idoc.close();

    await new Promise((resolve) => {
      iframe.onload = resolve;
      setTimeout(resolve, 900);
    });

    try {
      const iwin = iframe.contentWindow;
      if (iwin && iwin.document && iwin.document.fonts) {
        await iwin.document.fonts.ready;
      }
    } catch (_) {
      /* ignore */
    }
    await waitMs(350);
    return iframe;
  }

  /**
   * @param {'students' | 'companions' | 'guests' | 'available'} kind
   */
  async function printRoster(kind) {
    await ensureDataReady();
    const doc = buildDocument(kind);
    if (!doc) return;

    if (!doc.rows.length) {
      window.alert("لا توجد بيانات في هذا الكشف.");
      return;
    }

    const win = window.open("", "_blank");
    if (!win) {
      window.alert("تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة.");
      return;
    }
    win.document.open();
    win.document.write(doc.html);
    win.document.close();

    await waitMs(900);
    try {
      if (win.document.fonts) await win.document.fonts.ready;
    } catch (_) {
      /* ignore */
    }
    win.focus();
    win.print();
  }

  function loadHtml2Pdf() {
    return new Promise((resolve, reject) => {
      if (globalThis.html2pdf) {
        resolve(globalThis.html2pdf);
        return;
      }
      const s = document.createElement("script");
      s.src =
        "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      s.async = true;
      s.onload = () => resolve(globalThis.html2pdf);
      s.onerror = () => reject(new Error("تعذّر تحميل مكتبة PDF."));
      document.head.appendChild(s);
    });
  }

  /**
   * @param {'students' | 'companions' | 'guests' | 'available'} kind
   */
  async function pdfRoster(kind) {
    await ensureDataReady();
    const doc = buildDocument(kind);
    if (!doc) return;

    if (!doc.rows.length) {
      window.alert("لا توجد بيانات في هذا الكشف.");
      return;
    }

    let iframe = null;
    const overlay = document.createElement("div");
    overlay.textContent = "جاري تصدير PDF…";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(6,8,15,0.72);color:#fff;font-family:Tajawal,Arial,sans-serif;font-size:1.05rem;font-weight:700;";
    document.body.appendChild(overlay);

    try {
      iframe = await mountRosterFrame(doc.html);
      const body = iframe.contentDocument.body;
      if (!body || !body.innerText.trim()) {
        throw new Error("تعذّر تجهيز محتوى الكشف.");
      }

      const html2pdf = await loadHtml2Pdf();
      const stamp = new Date().toISOString().slice(0, 10);
      const page = body.querySelector(".br-page") || body;
      await html2pdf()
        .set({
          margin: 0,
          filename: `${doc.meta.filename}-${stamp}.pdf`,
          image: { type: "jpeg", quality: 0.96 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            width: 794,
            windowWidth: 794,
            scrollX: 0,
            scrollY: 0,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: ".br-table tr" },
        })
        .from(page)
        .save();
    } catch (e) {
      console.error(e);
      window.alert(
        (e && e.message) ||
          "تعذّر إنشاء PDF — جرّب زر الطباعة ثم اختر «حفظ كـ PDF»."
      );
      await printRoster(kind);
    } finally {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
  }

  function bindExportButtons() {
    const root = document.getElementById("bm-exports");
    if (!root) return;
    root.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-roster][data-action]");
      if (!btn || btn.disabled) return;
      const kind = btn.getAttribute("data-roster");
      const action = btn.getAttribute("data-action");
      if (!kind || !ROSTER_META[kind]) return;
      if (action === "print") {
        btn.disabled = true;
        printRoster(kind).finally(() => {
          btn.disabled = false;
        });
      } else if (action === "pdf") {
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = "جاري التصدير…";
        pdfRoster(kind).finally(() => {
          btn.disabled = false;
          btn.textContent = label;
        });
      }
    });
  }

  function init() {
    bindExportButtons();
  }

  globalThis.ThreaBookingsRoster = {
    buildGraduateRows,
    buildCompanionRows,
    buildGuestRows,
    buildAvailableRows,
    printRoster,
    pdfRoster,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
