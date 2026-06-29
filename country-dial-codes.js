/**
 * رمز واتساب — السعودية (+966) فقط
 */
(function (global) {
  "use strict";

  const DEFAULT_DIAL = "966";

  /** @type {{ iso: string, name: string, dial: string }} */
  const COUNTRY = { iso: "SA", name: "السعودية", dial: "966" };

  const COUNTRIES = [COUNTRY];
  const SORTED = [COUNTRY];

  function formatE164(dial, localRaw) {
    const d = String(dial || DEFAULT_DIAL).replace(/\D/g, "");
    let l = String(localRaw || "").replace(/\D/g, "");
    if (!d || !l) return "";
    if (l.startsWith("00")) l = l.slice(2);
    while (l.startsWith("0")) l = l.slice(1);
    if (l.startsWith(d)) return l;
    return d + l;
  }

  function isValidE164(e164) {
    const p = String(e164 || "").replace(/\D/g, "");
    return p.length >= 10 && p.length <= 15;
  }

  /** @deprecated قائمة الدول مُزالة — يُبقى للتوافق مع الكود القديم */
  function populateSelect(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = COUNTRY.dial;
    opt.textContent = `${COUNTRY.name} (+${COUNTRY.dial})`;
    opt.selected = true;
    selectEl.appendChild(opt);
  }

  function getCountryByDial(dial) {
    const d = String(dial).replace(/\D/g, "");
    return d === COUNTRY.dial ? COUNTRY : null;
  }

  global.ThreaDialCodes = {
    DEFAULT_DIAL,
    COUNTRY,
    COUNTRIES: SORTED,
    formatE164,
    isValidE164,
    populateSelect,
    getCountryByDial,
  };
})(typeof window !== "undefined" ? window : globalThis);
