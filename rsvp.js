(function () {
  "use strict";

  const params = new URLSearchParams(globalThis.location.search);
  const code = params.get("code") || "";
  const nid = params.get("nid") || "";
  const token = params.get("t") || "";

  const leadEl = document.getElementById("rsvp-lead");
  const guestEl = document.getElementById("rsvp-guest");
  const studentEl = document.getElementById("rsvp-student");
  const companionEl = document.getElementById("rsvp-companion");
  const currentEl = document.getElementById("rsvp-current");
  const actionsEl = document.getElementById("rsvp-actions");
  const confirmBtn = document.getElementById("rsvp-confirm");
  const declineBtn = document.getElementById("rsvp-decline");
  const msgEl = document.getElementById("rsvp-msg");
  const seatLink = document.getElementById("rsvp-seat-link");

  /** @type {import('./guest-assignments.js').GuestRec | null} */
  let guest = null;

  function publicId() {
    return code || nid;
  }

  function setMsg(text, isErr) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.color = isErr ? "#ffb0b0" : "";
  }

  function rsvpLabel(status) {
    if (status === "confirmed") return "تم تأكيد حضوركم مسبقاً.";
    if (status === "declined") return "تم تسجيل اعتذاركم مسبقاً.";
    return "";
  }

  function refreshUi() {
    if (!guest) return;
    if (leadEl) leadEl.hidden = false;
    if (guestEl) guestEl.hidden = false;
    if (studentEl) studentEl.textContent = guest.studentName || "ضيف";
    if (companionEl) {
      if (guest.companionName) {
        companionEl.hidden = false;
        companionEl.textContent = `المرافق: ${guest.companionName}`;
      } else {
        companionEl.hidden = true;
      }
    }
    const rs = guest.rsvpStatus || "pending";
    if (currentEl) {
      const label = rsvpLabel(rs);
      currentEl.hidden = !label;
      currentEl.textContent = label;
      currentEl.className = "rsvp-status";
      if (rs === "confirmed") currentEl.classList.add("rsvp-status--confirmed");
      if (rs === "declined") currentEl.classList.add("rsvp-status--declined");
    }
    const done = rs === "confirmed" || rs === "declined";
    if (actionsEl) actionsEl.hidden = done;
    if (confirmBtn) confirmBtn.disabled = done;
    if (declineBtn) declineBtn.disabled = done;
    if (seatLink && globalThis.ThreaLinks) {
      if (guest.seatIds && guest.seatIds.length && rs !== "declined") {
        seatLink.hidden = false;
        seatLink.href = globalThis.ThreaLinks.buildSeatViewUrl(guest);
      } else {
        seatLink.hidden = true;
      }
    }
  }

  async function loadGuest() {
    const ga = globalThis.ThreaGuestAssignments;
    if (!ga) {
      setMsg("تعذّر تحميل النظام.", true);
      return;
    }
    await ga.ready;
    const pub = publicId();
    if (!pub || !token) {
      setMsg("رابط غير صالح — افتح الرابط من رسالة الواتساب.", true);
      return;
    }
    const rec = await ga.verifyCheckIn(pub, token);
    if (!rec) {
      setMsg("لم يُعثر على دعوتكم أو انتهت صلاحية الرابط.", true);
      return;
    }
    guest = rec;
    refreshUi();
    setMsg("");
  }

  async function submitRsvp(status) {
    const ga = globalThis.ThreaGuestAssignments;
    if (!ga || !guest) return;
    if (confirmBtn) confirmBtn.disabled = true;
    if (declineBtn) declineBtn.disabled = true;
    setMsg("جاري الحفظ…");
    try {
      const pub = guest.inviteCode || guest.nationalId || publicId();
      const updated = await ga.updateRsvp(pub, status);
      guest = updated;
      refreshUi();
      if (status === "confirmed") {
        setMsg("شكراً — تم تأكيد حضوركم. نراكم في الحفل!");
      } else {
        setMsg(
          "تم تسجيل اعتذاركم وتحرير مقعدكم لمن في قائمة الانتظار. شكراً لإبلاغنا."
        );
      }
    } catch (e) {
      setMsg((e && e.message) || "تعذّر الحفظ. حاول مرة أخرى.", true);
      if (confirmBtn) confirmBtn.disabled = false;
      if (declineBtn) declineBtn.disabled = false;
    }
  }

  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => submitRsvp("confirmed"));
  }
  if (declineBtn) {
    declineBtn.addEventListener("click", () => {
      if (
        !globalThis.confirm(
          "هل أنت متأكد من الاعتذار؟ سيُحرَّر مقعدكم لشخص آخر في قائمة الانتظار."
        )
      ) {
        return;
      }
      submitRsvp("declined");
    });
  }

  loadGuest();
})();
