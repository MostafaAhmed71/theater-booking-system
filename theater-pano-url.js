/**
 * اختيار نسخة بانوراما مضغوطة حسب الجهاز (WebP ثم JPEG).
 * المصدر الأصلي theater.JPG (~24MB) للتوليد فقط — انظر scripts/optimize-theater-pano.py
 */
(function (global) {
  "use strict";

  const ASSETS = {
    mobileWebp: "./assets/theater-mobile.webp",
    mobileJpg: "./assets/theater-mobile.jpg",
    desktopWebp: "./assets/theater.webp",
    desktopJpg: "./assets/theater.jpg",
    legacy: "./theater.JPG",
  };

  const MOBILE_MQ = "(max-width: 900px)";

  function prefersMobile() {
    if (typeof global.matchMedia !== "function") return true;
    return global.matchMedia(MOBILE_MQ).matches;
  }

  /** @returns {string[]} */
  function pickProbeUrls() {
    if (prefersMobile()) {
      return [ASSETS.mobileWebp, ASSETS.mobileJpg, ASSETS.legacy];
    }
    return [ASSETS.desktopWebp, ASSETS.desktopJpg, ASSETS.legacy];
  }

  /** أول رابط متاح للعرض */
  function pickUrl() {
    return pickProbeUrls()[0];
  }

  /**
   * @param {string} src
   * @returns {Promise<boolean>}
   */
  function probeOne(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(true);
      im.onerror = () => resolve(false);
      im.src = src;
    });
  }

  /** @returns {Promise<string | null>} */
  async function probeAvailable() {
    for (const url of pickProbeUrls()) {
      if (await probeOne(url)) return url;
    }
    return null;
  }

  /**
   * @param {HTMLImageElement} img
   * @param {string} [override]
   */
  function applyToImg(img, override) {
    if (!img) return;
    if (override && String(override).trim()) {
      img.src = override;
    }
    /* بدون تجاوز: يختار المتصفح من <picture> تلقائياً */
  }

  global.ThreaTheaterPano = {
    ASSETS,
    MOBILE_MQ,
    prefersMobile,
    pickUrl,
    pickProbeUrls,
    probeAvailable,
    probeOne,
    applyToImg,
  };
})(typeof window !== "undefined" ? window : globalThis);
