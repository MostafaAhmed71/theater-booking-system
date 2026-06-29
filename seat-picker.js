/**
 * اختيار المقاعد بترتيب ملء — صفاً ثم مقعداً (بدون قفز لمقعد 19 مع وجود فراغات قبله).
 */
(function (global) {
  "use strict";

  const SECTION_ORDER = { LEFT: 0, BRIDGE: 1, RIGHT: 2, BACK: 3 };

  /**
   * @param {{ section?: string, row?: number, seatInRow?: number }} a
   * @param {{ section?: string, row?: number, seatInRow?: number }} b
   */
  function compareSeatsFillOrder(a, b) {
    const sa = SECTION_ORDER[a.section] ?? 9;
    const sb = SECTION_ORDER[b.section] ?? 9;
    if (sa !== sb) return sa - sb;
    const ra = a.row || 0;
    const rb = b.row || 0;
    if (ra !== rb) return ra - rb;
    return (a.seatInRow || 0) - (b.seatInRow || 0);
  }

  /**
   * @param {Array<{ section?: string, row?: number, seatInRow?: number }>} seats
   */
  function sortSeatsFillOrder(seats) {
    return [...seats].sort(compareSeatsFillOrder);
  }

  /**
   * @param {string} key
   */
  function rowKeyOrder(key) {
    const [section, rowStr] = String(key).split("|");
    return compareSeatsFillOrder({
      section,
      row: parseInt(rowStr, 10) || 0,
      seatInRow: 1,
    });
  }

  /**
   * أول مقعد(ات) متاحة بالترتيب؛ للمرافق يُفضَّل متجاورة في نفس الصف.
   * @param {Array<{ id: string, section?: string, row?: number, seatInRow?: number }>} pool
   * @param {number} count
   * @returns {typeof pool | null}
   */
  function pickSeatsInFillOrder(pool, count) {
    if (count < 1 || pool.length < count) return null;
    const sorted = sortSeatsFillOrder(pool);
    if (count === 1) return [sorted[0]];

    const byRow = new Map();
    for (const s of sorted) {
      const k = `${s.section}|${s.row}`;
      if (!byRow.has(k)) byRow.set(k, []);
      byRow.get(k).push(s);
    }

    const rowKeys = [...byRow.keys()].sort((a, b) => rowKeyOrder(a) - rowKeyOrder(b));
    for (const k of rowKeys) {
      const arr = byRow.get(k);
      for (let i = 0; i <= arr.length - count; i++) {
        const base = arr[i].seatInRow;
        let adjacent = true;
        for (let j = 1; j < count; j++) {
          if (arr[i + j].seatInRow !== base + j) {
            adjacent = false;
            break;
          }
        }
        if (adjacent) return arr.slice(i, i + count);
      }
    }

    return sorted.slice(0, count);
  }

  global.ThreaSeatPicker = {
    compareSeatsFillOrder,
    sortSeatsFillOrder,
    pickSeatsInFillOrder,
  };
})(typeof window !== "undefined" ? window : globalThis);
