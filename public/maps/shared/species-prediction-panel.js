(function () {
  if (window.__speciesPredictionPanelBound) return;
  window.__speciesPredictionPanelBound = true;

  var state = {
    speciesName: '',
    speciesKey: '',
    scope: detectScope(),
    settings: null,
    featureEnabled: false,
    loading: false,
    result: null,
    error: '',
  };

  var panel = null;
  var styleEl = null;
  var speciesLine = null;
  var statusLine = null;
  var modeLine = null;
  var resultWrap = null;
  var lastSelectionKey = '';
  var hasSyncedSpecies = false;
  var fallbackSelectionTimer = 0;
  var startupSyncPending = false;
  var STORAGE_PREFIX = 'speciesPrediction.activeSpecies';

  function detectScope() {
    var path = String((window.location && window.location.pathname) || '');
    return path.indexOf('/maps/rariliin/') >= 0 ? 'rariliin' : 'linnuliigid';
  }

  function ensurePanel() {
    if (!state.featureEnabled) {
      destroyPanel();
      return;
    }
    if (panel) return;

    panel = document.createElement('div');
    panel.id = 'speciesPredictionPanel';
    panel.innerHTML = '' +
      '<div class="spp-header">' +
      '  <div><div class="spp-eyebrow">Species Prediction & Research</div><div class="spp-title">Per selected species</div></div>' +
      '  <button type="button" class="spp-toggle">Prediction</button>' +
      '</div>' +
      '<div class="spp-body">' +
      '  <div class="spp-chip">These settings apply only to the currently selected species</div>' +
      '  <div class="spp-row"><span>Species</span><strong data-role="species-name">No species selected</strong></div>' +
      '  <div class="spp-row"><span>Status</span><strong data-role="status-line">Idle</strong></div>' +
      '  <div class="spp-row"><span>Mode</span><strong data-role="mode-line">Waiting for species settings</strong></div>' +
      '  <div class="spp-actions">' +
      '    <button type="button" class="btn secondary" data-request-type="prediction">Prediction</button>' +
      '    <button type="button" class="btn secondary" data-request-type="insight">Insight</button>' +
      '    <button type="button" class="btn" data-request-type="prediction_and_insight">Both</button>' +
      '  </div>' +
      '  <div class="spp-results" data-role="results"></div>' +
      '</div>';
    document.body.appendChild(panel);

    styleEl = document.createElement('style');
    styleEl.textContent = '' +
      '#speciesPredictionPanel{position:absolute;right:12px;bottom:12px;z-index:860;width:min(400px,calc(100vw - 24px));font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:rgba(255,255,255,.96);border:1px solid #cbd5e1;border-radius:16px;box-shadow:0 12px 30px rgba(15,23,42,.18);backdrop-filter:blur(8px)}' +
      '#speciesPredictionPanel .spp-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #e2e8f0}' +
      '#speciesPredictionPanel .spp-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#475569}' +
      '#speciesPredictionPanel .spp-title{font-size:15px;font-weight:700;color:#0f172a}' +
      '#speciesPredictionPanel .spp-body{padding:12px 14px;display:grid;gap:10px;max-height:min(65vh,560px);overflow:auto}' +
      '#speciesPredictionPanel .spp-chip{font-size:11px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:999px;padding:7px 10px}' +
      '#speciesPredictionPanel .spp-row{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#475569}' +
      '#speciesPredictionPanel .spp-row strong{color:#0f172a;text-align:right}' +
      '#speciesPredictionPanel .spp-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}' +
      '#speciesPredictionPanel .spp-results{display:grid;gap:10px}' +
      '#speciesPredictionPanel .spp-card{border:1px solid #dbe4ee;border-radius:12px;padding:10px;background:#fff}' +
      '#speciesPredictionPanel .spp-card h4{margin:0 0 6px;font-size:13px;color:#0f172a}' +
      '#speciesPredictionPanel .spp-card p{margin:0;font-size:12px;color:#334155;line-height:1.45}' +
      '#speciesPredictionPanel .spp-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;font-size:11px;color:#475569;margin-top:8px}' +
      '#speciesPredictionPanel .spp-country{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;font-size:11px;color:#334155}' +
      '#speciesPredictionPanel .spp-point{border-top:1px solid #eef2f7;padding-top:8px;margin-top:8px}' +
      '#speciesPredictionPanel .spp-point:first-child{border-top:0;padding-top:0;margin-top:0}' +
      '#speciesPredictionPanel.is-collapsed .spp-body{display:none}' +
      '#speciesPredictionPanel .spp-toggle{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:600;color:#0f172a;cursor:pointer}' +
      '@media (max-width: 900px){#speciesPredictionPanel{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));width:auto}}';
    document.head.appendChild(styleEl);

    speciesLine = panel.querySelector('[data-role="species-name"]');
    statusLine = panel.querySelector('[data-role="status-line"]');
    modeLine = panel.querySelector('[data-role="mode-line"]');
    resultWrap = panel.querySelector('[data-role="results"]');

    panel.querySelector('.spp-toggle').addEventListener('click', function () {
      panel.classList.toggle('is-collapsed');
    });
    Array.prototype.slice.call(panel.querySelectorAll('[data-request-type]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        requestRun(String(btn.getAttribute('data-request-type') || 'prediction_and_insight'));
      });
    });
  }

  function destroyPanel() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    panel = null;
    styleEl = null;
    speciesLine = null;
    statusLine = null;
    modeLine = null;
    resultWrap = null;
  }

  function requestRun(requestType) {
    if (!state.featureEnabled) return;
    if (!state.speciesKey || !state.speciesName) {
      setError('Select a species first');
      return;
    }
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'SPECIES_PREDICTION_RUN',
          scope: state.scope,
          speciesKey: state.speciesKey,
          speciesName: state.speciesName,
          requestType: requestType,
        }, '*');
      }
    } catch (e) {
      setError(String((e && e.message) || e || 'Prediction request failed'));
    }
  }

  function notifySelection(force) {
    if (!state.featureEnabled) return;
    if (hasSyncedSpecies && !force) return;
    var speciesName = readSelectedSpecies();
    var speciesKey = String(speciesName || '').trim();
    var nextKey = state.scope + '|' + speciesKey;
    if (!force && nextKey === lastSelectionKey) return;
    lastSelectionKey = nextKey;
    state.speciesName = speciesName;
    state.speciesKey = speciesKey;
    state.error = '';
    state.result = null;
    render();
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'SPECIES_PREDICTION_SELECTED',
          scope: state.scope,
          speciesKey: speciesKey,
          speciesName: speciesName,
        }, '*');
      }
    } catch (e) {}
  }

  function readSelectedSpecies() {
    if (hasSyncedSpecies && state.speciesName) return state.speciesName;
    var persisted = readPersistedPredictionSpecies();
    if (persisted) return persisted;
    var selected = String(window.__selectedSpecies || '').trim();
    if (selected) return selected;
    var row = document.querySelector('.row[data-key]');
    return row ? String(row.getAttribute('data-key') || '').trim() : '';
  }

  function readPersistedPredictionSpecies() {
    try {
      var stored = String(window.localStorage.getItem(STORAGE_PREFIX + '.' + state.scope) || '').trim();
      return stored || '';
    } catch (e) {
      return '';
    }
  }

  function clearFallbackSelectionTimer() {
    if (!fallbackSelectionTimer) return;
    window.clearTimeout(fallbackSelectionTimer);
    fallbackSelectionTimer = 0;
  }

  function scheduleFallbackSelection() {
    clearFallbackSelectionTimer();
    fallbackSelectionTimer = window.setTimeout(function () {
      fallbackSelectionTimer = 0;
      if (!state.featureEnabled || hasSyncedSpecies) return;
      notifySelection(true);
    }, 250);
  }

  function setFeatureFlags(payload) {
    state.featureEnabled = !!(payload && payload.flags && payload.flags.speciesPredictionEnabled);
    if (!state.featureEnabled) {
      clearFallbackSelectionTimer();
      startupSyncPending = false;
      hasSyncedSpecies = false;
      state.loading = false;
      state.result = null;
      state.error = '';
      destroyPanel();
      return;
    }
    var persistedSpecies = readPersistedPredictionSpecies();
    if (persistedSpecies) {
      state.speciesName = persistedSpecies;
      state.speciesKey = persistedSpecies;
      hasSyncedSpecies = true;
    }
    startupSyncPending = true;
    ensurePanel();
    render();
    sendReady();
    if (!persistedSpecies) {
      scheduleFallbackSelection();
    }
  }

  function setContext(payload) {
    if (!state.featureEnabled) return;
    state.settings = payload && payload.settings ? payload.settings : null;
    if (payload && payload.speciesName) state.speciesName = String(payload.speciesName || '').trim();
    if (payload && payload.speciesKey) state.speciesKey = String(payload.speciesKey || '').trim();
    ensurePanel();
    render();
  }

  function setActiveSpecies(payload) {
    if (!state.featureEnabled) return;
    clearFallbackSelectionTimer();
    startupSyncPending = false;
    hasSyncedSpecies = true;
    if (payload && payload.speciesName) state.speciesName = String(payload.speciesName || '').trim();
    if (payload && payload.speciesKey) state.speciesKey = String(payload.speciesKey || '').trim();
    state.error = '';
    state.result = null;
    ensurePanel();
    render();
  }

  function setLoading() {
    if (!state.featureEnabled) return;
    state.loading = true;
    state.error = '';
    state.result = null;
    ensurePanel();
    render();
  }

  function setResult(result) {
    if (!state.featureEnabled) return;
    state.loading = false;
    state.error = '';
    state.result = result || null;
    ensurePanel();
    render();
  }

  function setError(message) {
    if (!state.featureEnabled) return;
    state.loading = false;
    state.result = null;
    state.error = String(message || 'Prediction request failed');
    ensurePanel();
    render();
  }

  function render() {
    if (!state.featureEnabled) {
      destroyPanel();
      return;
    }
    ensurePanel();
    if (!panel) return;
    speciesLine.textContent = state.speciesName || 'No species selected';
    if (state.loading) statusLine.textContent = 'Loading...';
    else if (state.error) statusLine.textContent = state.error;
    else if (state.result) statusLine.textContent = 'Ready';
    else statusLine.textContent = 'Idle';
    modeLine.textContent = state.settings && state.settings.predictionMode
      ? String(state.settings.predictionMode || 'precise_hotspot') + ' / top ' + String(state.settings.outputCount || 5)
      : 'Waiting for species settings';
    resultWrap.innerHTML = '';

    if (state.loading) {
      resultWrap.innerHTML = '<div class="spp-card"><p>Running species-specific prediction and research...</p></div>';
      return;
    }
    if (state.error) {
      resultWrap.innerHTML = '<div class="spp-card"><p>' + escapeHtml(state.error) + '</p></div>';
      return;
    }
    if (!state.result) {
      resultWrap.innerHTML = '<div class="spp-card"><p>Run a request to see country scores, route fit, and exact hotspot-style targets.</p></div>';
      return;
    }

    var result = state.result;
    var html = '';
    if (result.insightSummary) {
      html += '<div class="spp-card"><h4>Insight summary</h4><p>' + escapeHtml(result.insightSummary) + '</p></div>';
    }
    html += '<div class="spp-card"><h4>Route fit</h4><div class="spp-meta">' +
      '<div>External pressure: <strong>' + escapeHtml(result.externalPressureScore) + '</strong></div>' +
      '<div>Spring fit: <strong>' + escapeHtml(result.springFitScore) + '</strong></div>' +
      '<div>Wind support: <strong>' + escapeHtml(result.windSupportScore) + '</strong></div>' +
      '<div>Missed risk: <strong>' + escapeHtml(result.alreadyMissedRisk) + '</strong></div>' +
      '<div>Route vector: <strong>' + escapeHtml(result.routeVector) + '</strong></div>' +
      '<div>Best entry zone: <strong>' + escapeHtml(result.bestEntryZone) + '</strong></div>' +
      '</div></div>';
    html += '<div class="spp-card"><h4>Country scores</h4><div class="spp-country">' +
      scoreCell('Latvia', result.countryScores && result.countryScores.latvia) +
      scoreCell('Lithuania', result.countryScores && result.countryScores.lithuania) +
      scoreCell('Belarus', result.countryScores && result.countryScores.belarus) +
      scoreCell('Poland', result.countryScores && result.countryScores.poland) +
      scoreCell('Russia', result.countryScores && result.countryScores.russia) +
      (result.countryScores && result.countryScores.finlandContextOnly != null ? scoreCell('Finland context only', result.countryScores.finlandContextOnly) : '') +
      '</div></div>';
    html += '<div class="spp-card"><h4>Top predicted points</h4>';
    if (!result.topPredictedPoints || !result.topPredictedPoints.length) {
      html += '<p>No precise hotspot results returned.</p>';
    } else {
      result.topPredictedPoints.forEach(function (point) {
        html += '<div class="spp-point">' +
          '<p><strong>#' + escapeHtml(point.rank) + ' ' + escapeHtml(point.name) + '</strong></p>' +
          '<p>' + escapeHtml(point.countyOrParish || 'County/parish unavailable') + '</p>' +
          '<p>' + escapeHtml(formatCoords(point.lat, point.lon)) + '</p>' +
          '<div class="spp-meta">' +
          '<div>Confidence: <strong>' + escapeHtml(point.confidence) + '</strong></div>' +
          '<div>ETA: <strong>' + escapeHtml(point.eta) + '</strong></div>' +
          '<div>Radius: <strong>' + escapeHtml(point.searchRadiusKm) + ' km</strong></div>' +
          '<div>Habitat: <strong>' + escapeHtml(point.habitatCue) + '</strong></div>' +
          '</div>' +
          '<p style="margin-top:8px">' + escapeHtml(point.reason) + '</p>' +
          '</div>';
      });
    }
    html += '</div>';
    resultWrap.innerHTML = html;
  }

  function scoreCell(label, value) {
    return '<div>' + escapeHtml(label) + ': <strong>' + escapeHtml(value == null ? 0 : value) + '</strong></div>';
  }

  function formatCoords(lat, lon) {
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return 'Coordinates unavailable';
    return String(Number(lat).toFixed(5)) + ', ' + String(Number(lon).toFixed(5));
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sendReady() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'SPECIES_PREDICTION_IFRAME_READY',
          scope: state.scope,
        }, '*');
      }
    } catch (e) {}
  }

  window.addEventListener('message', function (ev) {
    var data = ev && ev.data ? ev.data : null;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'APP_FEATURE_FLAGS') setFeatureFlags(data);
    if (data.type === 'SPECIES_PREDICTION_ACTIVE_SPECIES') setActiveSpecies(data);
    if (data.type === 'SPECIES_PREDICTION_CONTEXT') setContext(data);
    if (data.type === 'SPECIES_PREDICTION_LOADING') setLoading();
    if (data.type === 'SPECIES_PREDICTION_RESULT') setResult(data.result || null);
    if (data.type === 'SPECIES_PREDICTION_ERROR') setError(data.error || 'Prediction request failed');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      clearFallbackSelectionTimer();
      destroyPanel();
    }, { once: true });
  } else {
    clearFallbackSelectionTimer();
    destroyPanel();
  }
})();
