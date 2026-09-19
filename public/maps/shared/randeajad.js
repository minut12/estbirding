/* P46b: Randeajad (migration windows) from per-species [week,count] histograms.
   Pure logic, ES5. Exposes window.__bmRandeajad and module.exports when present. */
(function () {
  var MONTHS = ["jaan", "veebr", "m\u00e4rts", "apr", "mai", "juuni", "juuli", "aug", "sept", "okt", "nov", "dets"];
  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var WEEKS = 52;
  var FEW_MIN_TOTAL = 30;
  var FEW_MAX_PEAK_SHARE = 0.5;
  var RESIDENT_LEVEL = 0.1;
  var RESIDENT_WEEK_SHARE = 0.85;
  var WINTER_SHARE = 0.25;
  var HALF_MIN_TOTAL = 15;
  var WINDOW_LEVEL = 0.6;
  var LO_SHARE = 0.5;

  function toWeeks(pairs) {
    var w = [];
    var i;
    for (i = 0; i <= WEEKS; i++) w[i] = 0;
    if (!pairs || !pairs.length) return w;
    for (i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (!p) continue;
      var wk = Number(p[0]);
      var c = Number(p[1]);
      if (wk >= 1 && wk <= WEEKS && c > 0) w[wk] += c;
    }
    return w;
  }

  function sumRange(w, from, to) {
    var s = 0;
    for (var i = from; i <= to; i++) s += w[i];
    return s;
  }

  function maxRange(w, from, to) {
    var m = 0;
    for (var i = from; i <= to; i++) if (w[i] > m) m = w[i];
    return m;
  }

  function winterWindow(w, tot) {
    var order = [];
    var i;
    for (i = 27; i <= WEEKS; i++) order.push(i);
    for (i = 1; i <= 26; i++) order.push(i);
    var cum = 0;
    var a = null;
    var b = null;
    for (i = 0; i < order.length; i++) {
      cum += w[order[i]];
      if (a === null && cum >= tot * 0.1) a = order[i];
      if (b === null && cum >= tot * 0.9) b = order[i];
    }
    return { a: a, b: b };
  }

  function halfWindow(w, from, to) {
    if (sumRange(w, from, to) < HALF_MIN_TOTAL) return null;
    var pk = from;
    var i;
    for (i = from; i <= to; i++) if (w[i] > w[pk]) pk = i;
    var th = w[pk] * WINDOW_LEVEL;
    var a = null;
    var b = null;
    for (i = from; i <= to; i++) {
      if (w[i] >= th) {
        if (a === null) a = i;
        b = i;
      }
    }
    if (a === b) {
      a = Math.max(from, a - 1);
      b = Math.min(to, b + 1);
    }
    return { a: a, b: b, pk: pk };
  }

  function analyse(pairs) {
    var w = toWeeks(pairs);
    var tot = sumRange(w, 1, WEEKS);
    var mx = maxRange(w, 1, WEEKS);
    if (tot < FEW_MIN_TOTAL || mx / tot > FEW_MAX_PEAK_SHARE) return { kind: "few" };

    var active = 0;
    for (var i = 1; i <= WEEKS; i++) if (w[i] >= mx * RESIDENT_LEVEL) active++;
    if (active >= WEEKS * RESIDENT_WEEK_SHARE) return { kind: "resident" };

    var winterTot = sumRange(w, 1, 8) + sumRange(w, 49, WEEKS);
    if (winterTot / tot > WINTER_SHARE) return { kind: "winter", winter: winterWindow(w, tot) };

    return { kind: "migrant", spring: halfWindow(w, 1, 26), autumn: halfWindow(w, 27, WEEKS) };
  }

  function weekToDoy(wk) {
    return (wk - 1) * 7 + 1;
  }

  function doyToMonthDay(doy) {
    var d = Math.max(1, Math.min(365, Math.round(doy)));
    var m = 0;
    while (m < 11 && d > MONTH_DAYS[m]) {
      d -= MONTH_DAYS[m];
      m++;
    }
    return { m: m, d: d };
  }

  function fmtDoy(doy) {
    var md = doyToMonthDay(doy);
    return md.d + ". " + MONTHS[md.m];
  }

  function fmtRange(win) {
    if (!win) return "";
    return fmtDoy(weekToDoy(win.a)) + " \u2013 " + fmtDoy(win.b * 7);
  }

  function isNow(win, wk) {
    return !!win && wk >= win.a && wk <= win.b;
  }

  function isNowWinter(win, wk) {
    if (!win) return false;
    if (win.a <= win.b) return isNow(win, wk);
    return wk >= win.a || wk <= win.b;
  }

  /* 12 month cells: {cls:'s'|'a'|'', lo:bool}. A week belongs to the month of its midpoint day. */
  function monthBuckets(pairs, result) {
    var w = toWeeks(pairs);
    var totals = [];
    var cls = [];
    var m;
    for (m = 0; m < 12; m++) {
      totals[m] = 0;
      cls[m] = "";
    }
    var spring = result && result.kind === "migrant" ? result.spring : null;
    var autumn = result && result.kind === "migrant" ? result.autumn : null;
    var winter = result && result.kind === "winter" ? result.winter : null;
    for (var wk = 1; wk <= WEEKS; wk++) {
      m = doyToMonthDay(weekToDoy(wk) + 3).m;
      totals[m] += w[wk];
      if (isNow(spring, wk)) cls[m] = "s";
      else if (cls[m] !== "s" && (isNow(autumn, wk) || isNowWinter(winter, wk))) cls[m] = "a";
    }
    var maxMonth = 0;
    for (m = 0; m < 12; m++) if (totals[m] > maxMonth) maxMonth = totals[m];
    var out = [];
    for (m = 0; m < 12; m++) {
      out.push({ cls: cls[m], lo: !!cls[m] && totals[m] < maxMonth * LO_SHARE });
    }
    return out;
  }

  var api = {
    analyse: analyse,
    weekToDoy: weekToDoy,
    fmtDoy: fmtDoy,
    fmtRange: fmtRange,
    monthBuckets: monthBuckets,
    isNow: isNow,
    isNowWinter: isNowWinter
  };
  if (typeof window !== "undefined") window.__bmRandeajad = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
