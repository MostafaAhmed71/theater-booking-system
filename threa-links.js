/**
 * روابط مشتركة (مقعد، RSVP، الحجز).
 */
(function (global) {
  "use strict";

  function getSiteBaseUrl() {
    const cfg = global.THREA_APP_CONFIG;
    if (cfg && cfg.siteBaseUrl) {
      return String(cfg.siteBaseUrl).replace(/\/$/, "");
    }
    if (typeof global.location !== "undefined") {
      return global.location.origin.replace(/\/$/, "");
    }
    return "";
  }

  /**
   * @param {{ inviteCode?: string, nationalId?: string, checkInToken?: string }} rec
   */
  function buildSeatViewUrl(rec) {
    const base = getSiteBaseUrl();
    const t = encodeURIComponent(rec.checkInToken || "");
    if (rec.inviteCode) {
      return `${base}/seat.html?code=${encodeURIComponent(rec.inviteCode)}&t=${t}`;
    }
    const nid = encodeURIComponent(String(rec.nationalId || "").replace(/\D/g, ""));
    return `${base}/seat.html?nid=${nid}&t=${t}`;
  }

  /**
   * @param {{ inviteCode?: string, nationalId?: string, checkInToken?: string }} rec
   */
  function buildRsvpUrl(rec) {
    const base = getSiteBaseUrl();
    const t = encodeURIComponent(rec.checkInToken || "");
    if (rec.inviteCode) {
      return `${base}/rsvp.html?code=${encodeURIComponent(rec.inviteCode)}&t=${t}`;
    }
    const nid = encodeURIComponent(String(rec.nationalId || "").replace(/\D/g, ""));
    return `${base}/rsvp.html?nid=${nid}&t=${t}`;
  }

  function buildBookingUrl() {
    return `${getSiteBaseUrl()}/index.html`;
  }

  global.ThreaLinks = {
    getSiteBaseUrl,
    buildSeatViewUrl,
    buildRsvpUrl,
    buildBookingUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
