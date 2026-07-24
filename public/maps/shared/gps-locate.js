/* EstBirding — shared GPS locate control.
   Self-contained. Depends only on Leaflet (global L) + a map instance passed to init().
   Hidden until the parent broadcasts {type:'GPS_CONFIG', enabled:true}.
   Estonian UI strings are MCP-verified — do not change. */
(function () {
  "use strict";
  if (window.EstGps) return; // idempotent

  var S = {
    map: null, enabled: false, opts: {},
    btn: null, dot: null, acc: null, watching: false, busy: false, hasFix: false
  };

  function injectStyle() {
    if (document.getElementById('estgps-style')) return;
    var css =
      '.estgps-fab{position:fixed;right:16px;z-index:900;' +
      'bottom:calc(env(safe-area-inset-bottom,0px) + var(--bottom-inset,0px) + 90px);' +
      'width:46px;height:46px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.10);' +
      'box-shadow:0 2px 8px rgba(0,0,0,.22);display:none;align-items:center;justify-content:center;cursor:pointer;padding:0}' +
      '.estgps-fab:active{transform:scale(.95)}' +
      '.estgps-fab svg{width:23px;height:23px;color:#1f2937}' +
      '.estgps-fab.on svg{color:#1a73e8}' +
      '.estgps-fab[disabled]{opacity:.55;cursor:default}' +
      '.estgps-dot{width:16px;height:16px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}' +
      '.estgps-toast{position:fixed;left:50%;transform:translateX(-50%);z-index:950;' +
      'bottom:calc(env(safe-area-inset-bottom,0px) + var(--bottom-inset,0px) + 150px);' +
      'background:#111827;color:#fff;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'padding:8px 13px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.3);opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}' +
      '.estgps-toast.show{opacity:1}';
    var st = document.createElement('style');
    st.id = 'estgps-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  var toastEl = null, toastTid = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'estgps-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTid) clearTimeout(toastTid);
    toastTid = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  var LOCATE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<circle cx="12" cy="12" r="3.4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>' +
    '<line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>';

  function buildButton() {
    if (S.btn) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'estgps-fab';
    b.setAttribute('aria-label', 'Minu asukoht');
    b.title = 'Minu asukoht';
    b.innerHTML = LOCATE_SVG;
    b.addEventListener('click', function () { locate(); });
    document.body.appendChild(b);
    S.btn = b;
  }

  function showBtn(show) { if (S.btn) S.btn.style.display = show ? 'flex' : 'none'; }

  function clearFix() {
    try { if (S.dot) { S.map.removeLayer(S.dot); S.dot = null; } } catch (e) {}
    try { if (S.acc) { S.map.removeLayer(S.acc); S.acc = null; } } catch (e) {}
    S.hasFix = false;
    if (S.btn) S.btn.classList.remove('on');
  }

  function onFix(pos) {
    S.busy = false;
    if (S.btn) S.btn.removeAttribute('disabled');
    var lat = pos.coords.latitude, lng = pos.coords.longitude;
    var acc = pos.coords.accuracy || 0;
    var ll = [lat, lng];
    if (S.acc) { S.acc.setLatLng(ll).setRadius(acc); }
    else {
      S.acc = L.circle(ll, {
        radius: acc, color: '#1a73e8', weight: 1, opacity: .5,
        fillColor: '#1a73e8', fillOpacity: .15, interactive: false
      }).addTo(S.map);
    }
    if (S.dot) { S.dot.setLatLng(ll); }
    else {
      S.dot = L.marker(ll, {
        interactive: false, keyboard: false, zIndexOffset: 1000,
        icon: L.divIcon({ className: '', html: '<div class="estgps-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
      }).addTo(S.map);
    }
    S.hasFix = true;
    if (S.btn) S.btn.classList.add('on');
    // "Zoom in like Google Maps": never zoom out, fly toward street level.
    var target = Math.max(S.map.getZoom() || 0, (S.opts.zoom || 16));
    try { S.map.flyTo(ll, target, { animate: true, duration: 0.6 }); }
    catch (e) { S.map.setView(ll, target); }
  }

  function onErr(err) {
    S.busy = false;
    if (S.btn) S.btn.removeAttribute('disabled');
    toast(err && err.code === 1 ? 'Asukoha luba on keelatud' : 'Asukohta ei õnnestunud tuvastada');
  }

  function locate() {
    if (!S.enabled || S.busy) return;
    if (!('geolocation' in navigator)) { toast('Asukohta ei õnnestunud tuvastada'); return; }
    S.busy = true;
    if (S.btn) S.btn.setAttribute('disabled', 'disabled');
    toast('Otsin asukohta…');
    navigator.geolocation.getCurrentPosition(onFix, onErr, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 10000
    });
  }

  function setEnabled(on) {
    S.enabled = !!on;
    showBtn(S.enabled);
    if (!S.enabled) clearFix();
  }

  window.addEventListener('message', function (ev) {
    try {
      if (!ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === 'GPS_CONFIG') setEnabled(!!ev.data.enabled);
    } catch (e) { /* never throw on parent broadcasts */ }
  });

  window.EstGps = {
    init: function (map, opts) {
      if (!map || S.map) return;
      S.map = map;
      S.opts = opts || {};
      injectStyle();
      buildButton();
      showBtn(false); // stay hidden until GPS_CONFIG enabled arrives
      // belt-and-suspenders: ask the parent for the current gate now
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'GPS_CONFIG_REQUEST' }, '*');
        }
      } catch (e) {}
    }
  };
})();
