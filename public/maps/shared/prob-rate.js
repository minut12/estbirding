/* P189: T\u00f5en\u00e4osuse kaart, new layer (Silutud + Hooaeg) and popup A.
   Reads ennustus_cells_cache.meta written by compute-ennustus v11 (rateLayer.ts):
   meta.w6 / meta.season = { periods, p0, maxEst, cells: [gi, gj, ownAny, ownSp, est, near] }.
   Cell bounds: lat gi*size .. (gi+1)*size, lon gj*size .. (gj+1)*size.
   Pure logic plus one Leaflet render(); ES5. Exposes window.__bmProbRate and module.exports. */
(function () {
  var RAMP = ['#e3f0e7', '#b5d8c1', '#7fbb96', '#3f8f63', '#17573a'];
  var MON = ['jaanuar', 'veebruar', 'm\u00e4rts', 'aprill', 'mai', 'juuni', 'juuli', 'august', 'september', 'oktoober', 'november', 'detsember'];
  var MON_SHORT = ['jaan', 'veebr', 'm\u00e4rts', 'apr', 'mai', 'juuni', 'juuli', 'aug', 'sept', 'okt', 'nov', 'dets'];
  var MON_LETTER = ['J', 'V', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  var VIEW_KEY = 'bm_prob_view_v1';
  var FIRST_YEAR = 2010;
  var state = { view: 'w6', last: null };
  try { var sv = localStorage.getItem(VIEW_KEY); if (sv === 'w6' || sv === 'season') state.view = sv; } catch (e) {}

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hasMeta(meta) {
    return !!(meta && meta.v === 1 && meta.w6 && meta.season && Array.isArray(meta.w6.cells) && Array.isArray(meta.season.cells));
  }
  function periodStart(p, year) { return new Date(year, 0, 1 + 14 * p); }
  function periodEnd(p, year) {
    if (p >= 25) return new Date(year, 11, 31);
    return new Date(year, 0, 14 * (p + 1));
  }
  // "5. nov \u2013 16. dets" for the w6 periods (they may wrap New Year).
  function periodRangeLabel(periods, year) {
    if (!periods || !periods.length) return '';
    var a = periodStart(periods[0], year);
    var b = periodEnd(periods[periods.length - 1], year);
    return a.getDate() + '. ' + MON_SHORT[a.getMonth()] + ' \u2013 ' + b.getDate() + '. ' + MON_SHORT[b.getMonth()];
  }
  function seasonLabelEt(months) {
    if (!months || !months.length || months.length >= 12) return 'aastaringne';
    if (months.length === 1) return MON[months[0]];
    return MON[months[0]] + '\u2013' + MON[months[months.length - 1]];
  }
  function layerStats(layer) {
    var min = Infinity, max = 0, withSp = 0;
    var cells = (layer && layer.cells) || [];
    for (var i = 0; i < cells.length; i++) {
      var e = cells[i][4];
      if (e < min) min = e;
      if (e > max) max = e;
      if (cells[i][3] > 0) withSp++;
    }
    if (!isFinite(min)) min = 0;
    return { min: min, max: max, withSp: withSp, count: cells.length };
  }
  function classOf(est, stats) {
    var span = stats.max - stats.min;
    if (!(span > 0)) return 0;
    var r = (est - stats.min) / span;
    return Math.max(0, Math.min(4, Math.floor(r * 5 - 1e-9)));
  }
  function colorFor(est, stats) { return RAMP[classOf(est, stats)]; }
  function opacityFor(near) { return Math.round((0.25 + 0.65 * Math.min(1, (near || 0) / 40)) * 100) / 100; }
  function confidence(ownAny) {
    if (ownAny < 5) return { level: 'madal', bars: 1, text: 'Usaldus madal \u00b7 alla 5 vaatlusp\u00e4eva' };
    if (ownAny < 20) return { level: 'keskmine', bars: 2, text: 'Usaldus keskmine \u00b7 ' + ownAny + ' vaatlusp\u00e4eva' };
    return { level: 'k\u00f5rge', bars: 3, text: 'Usaldus k\u00f5rge \u00b7 ' + ownAny + ' vaatlusp\u00e4eva' };
  }
  function pct(sp, any) { return any > 0 ? Math.round((100 * sp) / any) : null; }
  function estPct(est) {
    var v = 100 * (est || 0);
    return (v < 10 ? Math.round(v * 10) / 10 : Math.round(v)) + '%';
  }
  function daysOf(n, m) { return n + (n === 1 ? ' p\u00e4ev ' : ' p\u00e4eva ') + m + '-st'; }
  function cellKey(gi, gj) { return gi + '|' + gj; }
  function cellBounds(gi, gj, size) {
    return [[gi * size, gj * size], [(gi + 1) * size, (gj + 1) * size]];
  }
  // Old cells (cache .cells) carry freshness; map them onto the same grid.
  function freshKeysFrom(oldCells, size) {
    var out = {};
    (oldCells || []).forEach(function (c) {
      if (!c || !(c.markerInCell || (c.scoreRecency || 0) > 0)) return;
      out[cellKey(Math.round(c.latMin / size), Math.round(c.lonMin / size))] = true;
    });
    return out;
  }

  function monthBarsHtml(meta, nowMonth) {
    var md = meta.monthDays || [];
    var max = 0;
    for (var i = 0; i < 12; i++) if ((md[i] || 0) > max) max = md[i];
    var inSeason = {};
    (meta.seasonMonths || []).forEach(function (m) { inSeason[m] = true; });
    var bars = '', labs = '';
    for (var m = 0; m < 12; m++) {
      var n = md[m] || 0;
      var h = n > 0 && max > 0 ? Math.max(3, Math.round((n / max) * 54)) : 2;
      var bg = m === nowMonth ? '#1f2a24' : (n > 0 ? (inSeason[m] ? '#7fb596' : '#cfe0d5') : '#e3e8e4');
      bars += '<div title="' + esc(MON[m] + ' \u00b7 ' + n + ' p\u00e4eva') + '" style="height:' + h + 'px;border-radius:3px;background:' + bg + '"></div>';
      labs += '<span style="' + (m === nowMonth ? 'font-weight:700;color:#1f2a24' : '') + '">' + MON_LETTER[m] + '</span>';
    }
    var season = seasonLabelEt(meta.seasonMonths);
    return '<div style="margin-top:10px">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6c7f74">'
      + '<span>Eesti vaatlusp\u00e4evad kuu kaupa</span>'
      + '<span style="text-transform:none;letter-spacing:0;font-weight:600;color:#2d7a4b;white-space:nowrap">' + (season === 'aastaringne' ? 'Aastaringne' : 'Hooaeg ' + esc(season)) + '</span></div>'
      + '<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:4px;align-items:end;height:58px;margin-top:8px">' + bars + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:4px;margin-top:4px;text-align:center;font-size:11px;color:#6c7f74">' + labs + '</div>'
      + '</div>';
  }

  // Popup A for one cell tuple [gi, gj, ownAny, ownSp, est, near].
  function popupHtml(o) {
    var c = o.cell, meta = o.meta, view = o.view || 'w6';
    var ownAny = c[2], ownSp = c[3], est = c[4];
    var year = o.year || new Date().getFullYear();
    var when = view === 'season'
      ? 'hooajal (' + esc(seasonLabelEt(meta.seasonMonths)) + ')'
      : esc(periodRangeLabel(meta.w6.periods, year));
    var p = pct(ownSp, ownAny);
    var head;
    if (p !== null) {
      head = '<div style="display:flex;align-items:flex-end;gap:12px">'
        + '<span style="font-size:36px;font-weight:750;letter-spacing:-.02em;line-height:.9;color:#2d7a4b">' + p + '%</span>'
        + '<div style="font-size:12.5px;line-height:1.35;color:#4a5852">vaatlusp\u00e4evadest ' + (view === 'season' ? 'hooajal' : 'sel ajal')
        + '<br><b style="color:#1f2a24">' + daysOf(ownSp, ownAny) + '</b> \u00b7 ' + when + ' \u00b7 ' + FIRST_YEAR + '\u2013' + year + '</div></div>';
    } else {
      head = '<div style="display:flex;align-items:flex-end;gap:12px">'
        + '<span style="font-size:36px;font-weight:750;letter-spacing:-.02em;line-height:.9;color:#6c7f74">~' + estPct(est) + '</span>'
        + '<div style="font-size:12.5px;line-height:1.35;color:#4a5852">hinnang naaberruutude j\u00e4rgi<br>Selles ruudus pole ' + (view === 'season' ? 'hooajal' : 'sel ajal') + ' vaadeldud.</div></div>';
    }
    var conf = confidence(ownAny);
    var barsHtml = '';
    for (var b = 1; b <= 3; b++) barsHtml += '<i style="display:inline-block;width:6px;height:10px;border-radius:1px;margin-right:2px;background:' + (b <= conf.bars ? '#c27a1a' : '#ead3ad') + '"></i>';
    var confHtml = '<div><span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#8a4b0b;background:#fbefd9;border-radius:999px;padding:4px 10px">'
      + '<span style="display:inline-flex">' + barsHtml + '</span>' + esc(conf.text) + '</span></div>';
    var estLine = p !== null
      ? '<div style="font-size:12px;color:#4a5852">Hinnang koos naaberruutudega: <b>' + estPct(est) + '</b></div>'
      : '';
    var freshHtml = o.fresh
      ? '<div style="display:flex;align-items:center;gap:10px;background:#e6f4ee;border-radius:10px;padding:9px 11px">'
        + '<span style="width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px #0f8a63;flex:0 0 auto"></span>'
        + '<div style="font-size:12.5px;line-height:1.35"><b>V\u00e4rske vaatlus viimase 7 p\u00e4eva jooksul</b>'
        + '<div style="color:#3d5b4e">eraldi, protsenti ei t\u00f5sta</div></div></div>'
      : '';
    var totalDays = 0;
    (meta.monthDays || []).forEach(function (n) { totalDays += n || 0; });
    var stats = o.stats || layerStats(meta[view]);
    function tile(n, cap) {
      return '<div style="border:1px solid #dde4df;border-radius:10px;padding:7px 9px;min-width:0"><b style="font-size:15px;font-variant-numeric:tabular-nums">' + n + '</b>'
        + '<div style="font-size:11px;color:#6c7f74">' + cap + '</div></div>';
    }
    var tiles = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">'
      + tile(ownAny, 'vaatlusp\u00e4eva ruudus') + tile(totalDays, 'liigi p\u00e4eva Eestis') + tile(stats.withSp, 'ruutu liigiga') + '</div>';
    return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;min-width:270px;max-width:340px;color:#1f2a24;display:flex;flex-direction:column;gap:10px">'
      + '<div style="font-size:13px;font-weight:600;color:#4a5852">' + esc(o.species) + ' \u00b7 see ruut</div>'
      + head + confHtml + estLine + freshHtml + monthBarsHtml(meta, o.nowMonth == null ? new Date().getMonth() : o.nowMonth) + tiles
      + '<div style="font-size:11.5px;line-height:1.45;color:#6c7f74">Liigi vaatlusp\u00e4evad jagatud k\u00f5igi vaatlusp\u00e4evadega samas ruudus ja samal ajal, aastad ' + FIRST_YEAR + '\u2013' + year + '.</div>'
      + '</div>';
  }

  function legendHtml(meta, view, stats, year) {
    function btn(v, label) {
      var on = v === view;
      return '<button type="button" onclick="window.__bmProbRate&&window.__bmProbRate.setView(\'' + v + '\')" style="border:0;border-radius:999px;padding:6px 12px;min-height:32px;cursor:pointer;font:' + (on ? '600' : '500') + ' 12px system-ui;' + (on ? 'background:#1f2a24;color:#fff' : 'background:none;color:#4a5852') + '">' + label + '</button>';
    }
    var range = view === 'season' ? seasonLabelEt(meta.seasonMonths) : periodRangeLabel(meta.w6.periods, year || new Date().getFullYear());
    return '<div style="display:inline-flex;background:#f1f4f2;border-radius:999px;padding:3px;margin-bottom:8px">' + btn('w6', 'Silutud') + btn('season', 'Hooaeg') + '</div>'
      + '<div style="font-size:12px;color:#4a5852;margin-bottom:6px">' + esc(range) + '</div>'
      + '<div style="height:10px;border-radius:5px;background:linear-gradient(90deg,' + RAMP.join(',') + ')"></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:#6c7f74;margin:3px 0 8px"><span>harva</span><span>parim ' + estPct(stats.max) + '</span></div>'
      + '<div style="font-size:12px;color:#64748b;line-height:1.45">Tumedam ruut: liiki on seal sel ajal sagedamini n\u00e4htud.</div>'
      + '<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#64748b;margin-top:4px"><span style="width:12px;height:12px;border-radius:3px;background:#7fbb96;opacity:.35;flex:0 0 auto"></span>Kahvatum ruut: \u00fcmbruses on v\u00e4he vaatlusi.</div>'
      + '<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#64748b;margin-top:4px"><span style="width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 0 2.5px #0f8a63;margin:0 2px;flex:0 0 auto"></span>T\u00e4pp: n\u00e4htud viimase 7 p\u00e4eva jooksul.</div>';
  }

  // o = { L, group, meta, species, oldCells, legendEl }. The group is already on the map.
  function render(o) {
    state.last = o;
    var L = o.L, meta = o.meta, view = state.view;
    var layer = meta[view];
    var size = meta.cellSize;
    var stats = layerStats(layer);
    var fresh = freshKeysFrom(o.oldCells, size);
    var year = new Date().getFullYear();
    o.group.clearLayers();
    for (var i = 0; i < layer.cells.length; i++) {
      var c = layer.cells[i];
      var isFresh = !!fresh[cellKey(c[0], c[1])];
      var html = popupHtml({ cell: c, meta: meta, view: view, species: o.species, fresh: isFresh, stats: stats, year: year });
      var rect = L.rectangle(cellBounds(c[0], c[1], size), {
        fillColor: colorFor(c[4], stats), fillOpacity: opacityFor(c[5]),
        color: '#ffffff', weight: 0.6, opacity: 0.7, interactive: true
      });
      rect.bindPopup(html, { maxWidth: 360 });
      o.group.addLayer(rect);
      if (isFresh) {
        var ctr = [(c[0] + 0.5) * size, (c[1] + 0.5) * size];
        var dot = L.circleMarker(ctr, { radius: 6, color: '#0f8a63', weight: 3, fillColor: '#ffffff', fillOpacity: 1 });
        dot.bindPopup(html, { maxWidth: 360 });
        o.group.addLayer(dot);
      }
    }
    if (o.legendEl) o.legendEl.innerHTML = legendHtml(meta, view, stats, year);
    return stats;
  }
  function setView(v) {
    if (v !== 'w6' && v !== 'season') return;
    state.view = v;
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) {}
    if (state.last) render(state.last);
  }
  function forget() { state.last = null; }

  var api = {
    hasMeta: hasMeta, periodRangeLabel: periodRangeLabel, seasonLabelEt: seasonLabelEt, layerStats: layerStats,
    classOf: classOf, colorFor: colorFor, opacityFor: opacityFor, confidence: confidence, pct: pct, estPct: estPct,
    daysOf: daysOf, cellBounds: cellBounds, freshKeysFrom: freshKeysFrom, popupHtml: popupHtml, legendHtml: legendHtml,
    render: render, setView: setView, forget: forget, getView: function () { return state.view; }
  };
  if (typeof window !== 'undefined') window.__bmProbRate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
