(function () {
  "use strict";

  const summaryEl = document.getElementById("hc-summary");
  const listEl = document.getElementById("hc-list");
  const todoEl = document.getElementById("hc-todo");
  const actionsEl = document.getElementById("hc-actions");
  const runBtn = document.getElementById("hc-run");

  /** @type {{ level: 'ok'|'warn'|'fail', title: string, detail: string }[]} */
  let items = [];
  /** @type {string[]} */
  let todos = [];

  function add(level, title, detail) {
    items.push({ level, title, detail });
  }

  function addTodo(text) {
    todos.push(text);
  }

  async function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: انتهت المهلة (${ms / 1000}s)`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function testSupabaseTable(client, table, query) {
    const { data, error, count } = await withTimeout(
      client.from(table).select(query, { count: "exact", head: false }).limit(1),
      20000,
      table
    );
    if (error) throw error;
    return { data, count: count ?? (data ? data.length : 0) };
  }

  async function testWhatsApp() {
    const base =
      (globalThis.THREA_APP_CONFIG && globalThis.THREA_APP_CONFIG.whatsappApiBase) ||
      "https://wpp.northelite0.com";
    const res = await withTimeout(fetch(`${base}/status`), 15000, "واتساب");
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, connected: !!data.connected, status: data.status || "?" };
  }

  function render() {
    listEl.replaceChildren();
    for (const it of items) {
      const li = document.createElement("li");
      li.className = `hc-item hc-item--${it.level}`;
      li.innerHTML = `<div class="hc-item__title">${it.title}</div><div class="hc-item__detail">${it.detail}</div>`;
      listEl.appendChild(li);
    }

    const fails = items.filter((i) => i.level === "fail").length;
    const warns = items.filter((i) => i.level === "warn").length;

    summaryEl.className = "hc-summary";
    if (fails > 0) {
      summaryEl.classList.add("hc-summary--fail");
      summaryEl.textContent = `يوجد ${fails} مشكلة حرجة — راجع القائمة قبل فتح الحجز.`;
    } else if (warns > 0) {
      summaryEl.classList.add("hc-summary--warn");
      summaryEl.textContent = `الأساسيات تعمل مع ${warns} تنبيه — نفّذ الإجراءات أدناه.`;
    } else {
      summaryEl.classList.add("hc-summary--ok");
      summaryEl.textContent = "كل الفحوصات الأساسية ناجحة — جاهز للحجز.";
    }

    if (todos.length) {
      actionsEl.hidden = false;
      todoEl.replaceChildren();
      todos.forEach((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        todoEl.appendChild(li);
      });
    } else {
      actionsEl.hidden = true;
    }
  }

  async function runChecks() {
    items = [];
    todos = [];
    summaryEl.className = "hc-summary";
    summaryEl.textContent = "جاري الفحص…";
    listEl.replaceChildren();
    actionsEl.hidden = true;

    try {
      await withTimeout(globalThis.ThreaSupabase.ready, 5000, "Supabase init");
      const client = globalThis.ThreaSupabase.client;

      try {
        const { data } = await testSupabaseTable(client, "threa_student_roster", "id, entries");
        const row = data && data[0];
        const n = row && row.entries ? Object.keys(row.entries).length : 0;
        if (n >= 1) {
          add("ok", "قائمة الخريجين", `${n} اسم مسجّل في Supabase.`);
        } else {
          add("fail", "قائمة الخريجين", "فارغة — استورد threa_student_roster_rows.sql من لوحة Supabase.");
          addTodo("استورد قائمة الخريجين من supabase/threa_student_roster_rows.sql");
        }
      } catch (e) {
        add(
          "fail",
          "اتصال Supabase — قائمة الخريجين",
          (e && e.message) || String(e)
        );
        addTodo(
          "إذا ظهر ERR_CONNECTION_TIMED_OUT: جرّب شبكة أخرى (جوال hotspot)، أو VPN، أو عطّل حظر الإعلانات/الجدار الناري."
        );
      }

      try {
        const { data } = await testSupabaseTable(
          client,
          "threa_event_config",
          "student_seat_ids, companion_seat_ids, ceremony_guest_seat_ids, ceremony_guest_seat_quota, panorama_entrance"
        );
        const cfg = data && data[0];
        if (!cfg) {
          add("fail", "إعدادات الحدث", "لا يوجد مستند default في threa_event_config.");
          addTodo("نفّذ supabase/full-schema.sql أو reset-event-seat-pools.sql");
        } else {
          const s = (cfg.student_seat_ids || []).length;
          const c = (cfg.companion_seat_ids || []).length;
          const g = (cfg.ceremony_guest_seat_ids || []).length;
          add(
            "ok",
            "قوائم المقاعد",
            `خريج ${s} · مرافق ${c} · ضيوف ${g} (حد الضيوف ${cfg.ceremony_guest_seat_quota || 70}).`
          );
          if (!cfg.panorama_entrance) {
            add("warn", "مدخل البانوراما", "غير معرّف — حدّده من calibrate.html.");
            addTodo("افتح calibrate.html وحدّد نقطة مدخل القاعة على البانوراما");
          }
        }
      } catch (e) {
        add("fail", "إعدادات الحدث", (e && e.message) || String(e));
      }

      try {
        const { count } = await withTimeout(
          client.from("threa_seat_pins").select("seat_id", { count: "exact", head: true }),
          20000,
          "threa_seat_pins"
        );
        const n = count || 0;
        if (n >= 140) {
          add("ok", "معايرة المقاعد", `${n} مقعد معاير على البانوراما.`);
        } else if (n > 0) {
          add("warn", "معايرة المقاعد", `${n} فقط — المتوقع ~205. راجع calibrate.html أو import-seat-pins.sql.`);
        } else {
          add("fail", "معايرة المقاعد", "لا توجد معايرة — الحجز يعمل لكن الخريطة ستكون ناقصة.");
          addTodo("نفّذ supabase/import-seat-pins.sql أو استورد threa-panorama-pins.json من المعايرة");
        }
      } catch (e) {
        add("fail", "معايرة المقاعد", (e && e.message) || String(e));
      }

      try {
        const { count } = await withTimeout(
          client.from("threa_guest_assignments").select("id", { count: "exact", head: true }),
          20000,
          "threa_guest_assignments"
        );
        const n = count || 0;
        if (n === 0) {
          add("ok", "الحجوزات الحالية", "لا حجوزات — قاعدة نظيفة للانطلاق.");
        } else {
          add(
            "warn",
            "الحجوزات الحالية",
            `${n} حجز موجود (غالباً تجارب). امسحها قبل فتح الحجز الرسمي.`
          );
          addTodo(
            "افتح simulate.html → «مسح كل الحجوزات» (أو احذف من Supabase Table Editor) قبل الغد"
          );
        }
      } catch (e) {
        add("fail", "الحجوزات", (e && e.message) || String(e));
      }

      try {
        const wa = await testWhatsApp();
        if (wa.connected) {
          add("ok", "خادم واتساب", "متصل — جاهز لإرسال الدعوات.");
        } else if (wa.ok) {
          add(
            "warn",
            "خادم واتساب",
            `الخادم يعمل لكن غير متصل (الحالة: ${wa.status}).`
          );
          addTodo("افتح https://wpp.northelite0.com/qr وامسح QR من هاتف الإرسال قبل أول حجز");
        } else {
          add("fail", "خادم واتساب", "تعذّر الوصول للخادم.");
          addTodo("تحقق أن VPS واتساب يعمل وأن wpp.northelite0.com متاح");
        }
      } catch (e) {
        add("fail", "خادم واتساب", (e && e.message) || String(e));
      }

      const site =
        (globalThis.THREA_APP_CONFIG && globalThis.THREA_APP_CONFIG.siteBaseUrl) ||
        globalThis.location.origin;
      add("ok", "رابط الموقع", site);
    } catch (e) {
      add("fail", "تهيئة النظام", (e && e.message) || String(e));
    }

    render();
  }

  if (runBtn) runBtn.addEventListener("click", () => runChecks());
  runChecks();
})();
