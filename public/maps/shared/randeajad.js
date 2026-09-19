/* P46b/P46c: Randeajad (migration windows) from per-species [week,count] histograms.
   Rule v3 (2026-09-19): passage peak above the summer baseline, curated residents.
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
  var HALF_MIN_EXCESS = 15;
  var DIFFUSE_EXCESS_SHARE = 0.1;
  var WINDOW_EXCESS_SHARE = 0.5;
  var MAX_WINDOW_WEEKS = 6;
  var BASE_FROM = 23;
  var BASE_TO = 30;
  var LO_SHARE = 0.5;

  /* Curated residents (P46c-paigalinnud-kinnitamiseks.csv, paigalind = jah). Sorted, one per line. */
  var RESIDENTS = [
    "Habekakk",
    "Hakk",
    "Hallpea-r\u00e4hn",
    "Harakas",
    "H\u00e4ndkakk",
    "Kaelus-turteltuvi",
    "Kanakull",
    "Kassikakk",
    "Kodukakk",
    "Kodutuvi",
    "Laanep\u00fc\u00fc",
    "Laaner\u00e4hn",
    "Metsis",
    "Mustr\u00e4hn",
    "Musttihane",
    "Nurmkana",
    "Paskn\u00e4\u00e4r",
    "Porr",
    "Puukoristaja",
    "P\u00f5hjatihane",
    "P\u00f5ldvarblane",
    "Rabap\u00fc\u00fc",
    "Rasvatihane",
    "Ronk",
    "Roohabekas",
    "Sabatihane",
    "Salutihane",
    "Sinitihane",
    "Suur-kirjur\u00e4hn",
    "Tamme-kirjur\u00e4hn",
    "Tutt-tihane",
    "Tuttl\u00f5oke",
    "Valgeselg-kirjur\u00e4hn",
    "V\u00e4ike-kirjur\u00e4hn",
    "V\u00e4rbkakk"
  ];

  function normName(name) {
    var s = String(name);
    if (s.normalize) s = s.normalize("NFC");
    return s.toLowerCase();
  }

  var RESIDENT_SET = {};
  for (var r = 0; r < RESIDENTS.length; r++) RESIDENT_SET[normName(RESIDENTS[r])] = true;

  function isResident(name) {
    return RESIDENT_SET.hasOwnProperty(normName(name));
  }

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

  /* Median of w[23..30] (8 values: mean of the 4th and 5th sorted). */
  function summerBase(w) {
    var v = [];
    for (var i = BASE_FROM; i <= BASE_TO; i++) v.push(w[i]);
    v.sort(function (x, y) { return x - y; });
    var mid = v.length / 2;
    return (v[mid - 1] + v[mid]) / 2;
  }

  /* Shortest run a..b in [from,to] holding >= half of the excess; ties: larger sum, then earliest a. */
  function shortestRun(e, from, to, need) {
    for (var width = 1; width <= to - from + 1; width++) {
      var best = null;
      for (var a = from; a + width - 1 <= to; a++) {
        var s = 0;
        for (var k = a; k < a + width; k++) s += e[k];
        if (s >= need && (best === null || s > best.s)) best = { a: a, b: a + width - 1, s: s };
      }
      if (best) return best;
    }
    return null;
  }

  function halfWindow(w, from, to, base) {
    var e = [];
    var T = 0;
    var raw = 0;
    for (var k = from; k <= to; k++) {
      e[k] = Math.max(0, w[k] - base);
      T += e[k];
      raw += w[k];
    }
    if (T < HALF_MIN_EXCESS) return null;
    if (T < DIFFUSE_EXCESS_SHARE * raw) return { diffuse: true };
    var run = shortestRun(e, from, to, WINDOW_EXCESS_SHARE * T);
    if (!run || run.b - run.a + 1 > MAX_WINDOW_WEEKS) return { diffuse: true };
    var pk = run.a;
    for (k = run.a; k <= run.b; k++) if (e[k] > e[pk]) pk = k;
    var a = run.a;
    var b = run.b;
    if (a === b) {
      a = Math.max(from, a - 1);
      b = Math.min(to, b + 1);
    }
    return { a: a, b: b, pk: pk };
  }

  function analyse(pairs, opts) {
    var w = toWeeks(pairs);
    var tot = sumRange(w, 1, WEEKS);
    var mx = maxRange(w, 1, WEEKS);
    if (tot < FEW_MIN_TOTAL || mx / tot > FEW_MAX_PEAK_SHARE) return { kind: "few" };

    if (opts && opts.resident === true) return { kind: "resident" };

    var active = 0;
    for (var i = 1; i <= WEEKS; i++) if (w[i] >= mx * RESIDENT_LEVEL) active++;
    if (active >= WEEKS * RESIDENT_WEEK_SHARE) return { kind: "resident" };

    var winterTot = sumRange(w, 1, 8) + sumRange(w, 49, WEEKS);
    if (winterTot / tot > WINTER_SHARE) return { kind: "winter", winter: winterWindow(w, tot) };

    var base = summerBase(w);
    return { kind: "migrant", spring: halfWindow(w, 1, 26, base), autumn: halfWindow(w, 27, WEEKS, base) };
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

  /* A real window has numeric a/b; null and {diffuse:true} are never "now". */
  function isWindow(win) {
    return !!win && !win.diffuse && typeof win.a === "number" && typeof win.b === "number";
  }

  function isNow(win, wk) {
    return isWindow(win) && wk >= win.a && wk <= win.b;
  }

  function isNowWinter(win, wk) {
    if (!isWindow(win)) return false;
    if (win.a <= win.b) return isNow(win, wk);
    return wk >= win.a || wk <= win.b;
  }

  /* 12 month cells: {cls:'s'|'a'|'', lo:bool}. A week belongs to the month of its midpoint day. Only real windows colour. */
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
    isResident: isResident,
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
