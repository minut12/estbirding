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
    controls: {
      horizonDays: 7,
      useWeatherWind: true,
      showPredictionCone: true,
      useRegionalTargets: true,
      recentOnlyMapMarkers: false,
      snapToBestTarget: true,
      autoFeedEnabled: false,
      countryFilter: 'all'
    },
    layerToggles: {
      estoniaHistoryPoints: true,
      estoniaHistoryClusters: false,
      foreignRecentPoints: false,
      foreignPressureClusters: false,
      predictedLines: false,
      predictedCone: false,
      predictedTargets: true,
      diagnostics: false,
      recentOnly: false
    }
  };

  var panel = null;
  var styleEl = null;
  var speciesLine = null;
  var statusLine = null;
  var modeLine = null;
  var resultWrap = null;
  var debugWrap = null;
  var overlayGroups = null;
  var lastSelectionKey = '';
  var hasSyncedSpecies = false;
  var fallbackSelectionTimer = 0;
  var startupSyncPending = false;
  var STORAGE_PREFIX = 'speciesPrediction.activeSpecies';
  var runtimeInfo = readRuntimeInfo();

  console.debug('[speciesPrediction] panel script loaded', runtimeInfo);

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
      '  <div class="spp-header-copy">' +
      '    <div class="spp-eyebrow">Species Prediction & Research</div>' +
      '    <div class="spp-title">Selected species</div>' +
      '    <div class="spp-subtitle">Prediction results are shown directly from the backend response.</div>' +
      '  </div>' +
      '  <button type="button" class="spp-toggle" aria-expanded="true">Hide</button>' +
      '</div>' +
      '<div class="spp-body">' +
      '  <div class="spp-context">' +
      '    <div class="spp-chip">Species-specific prediction panel</div>' +
      '    <div class="spp-facts">' +
      '      <div class="spp-fact"><span>Species</span><strong data-role="species-name">No species selected</strong></div>' +
      '      <div class="spp-fact"><span>Status</span><strong data-role="status-line">Idle</strong></div>' +
      '      <div class="spp-fact"><span>Mode</span><strong data-role="mode-line">Waiting for species settings</strong></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="spp-actions">' +
      '    <button type="button" class="btn secondary" data-request-type="prediction">Prediction</button>' +
      '    <button type="button" class="btn secondary" data-request-type="insight">Insight</button>' +
      '    <button type="button" class="btn" data-request-type="prediction_and_insight">Both</button>' +
      '  </div>' +
      '  <div class="spp-card spp-controls" data-role="controls"></div>' +
      '  <div class="spp-results" data-role="results"></div>' +
      '  <details class="spp-debug" data-role="debug-wrap">' +
      '    <summary>Developer diagnostics</summary>' +
      '    <div class="spp-debug-body" data-role="debug-body"></div>' +
      '  </details>' +
      '</div>';
    document.body.appendChild(panel);

    styleEl = document.createElement('style');
    styleEl.textContent = [
      '#speciesPredictionPanel{position:absolute;right:12px;bottom:12px;z-index:860;width:min(440px,calc(100vw - 24px));font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:rgba(255,255,255,.97);border:1px solid rgba(148,163,184,.35);border-radius:20px;box-shadow:0 18px 45px rgba(15,23,42,.16);backdrop-filter:blur(10px);color:#0f172a}',
      '#speciesPredictionPanel .spp-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px 12px;border-bottom:1px solid #e2e8f0;background:linear-gradient(180deg,rgba(248,250,252,.96),rgba(255,255,255,.9));border-radius:20px 20px 0 0}',
      '#speciesPredictionPanel .spp-header-copy{min-width:0}',
      '#speciesPredictionPanel .spp-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}',
      '#speciesPredictionPanel .spp-title{margin-top:4px;font-size:17px;font-weight:700;color:#0f172a}',
      '#speciesPredictionPanel .spp-subtitle{margin-top:4px;font-size:12px;line-height:1.45;color:#64748b}',
      '#speciesPredictionPanel .spp-body{padding:14px 16px 16px;display:grid;gap:12px;max-height:min(70vh,680px);overflow:auto}',
      '#speciesPredictionPanel .spp-context{display:grid;gap:10px}',
      '#speciesPredictionPanel .spp-chip{display:inline-flex;align-items:center;max-width:max-content;padding:6px 10px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0;font-size:11px;color:#475569}',
      '#speciesPredictionPanel .spp-facts{display:grid;gap:8px}',
      '#speciesPredictionPanel .spp-fact{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;font-size:12px;color:#64748b}',
      '#speciesPredictionPanel .spp-fact span{flex:0 0 auto}',
      '#speciesPredictionPanel .spp-fact strong{color:#0f172a;text-align:right;line-height:1.4}',
      '#speciesPredictionPanel .spp-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
      '#speciesPredictionPanel .spp-controls{display:grid;gap:10px}',
      '#speciesPredictionPanel .spp-control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
      '#speciesPredictionPanel .spp-control-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:#334155;padding:8px 10px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}',
      '#speciesPredictionPanel .spp-control-row input,#speciesPredictionPanel .spp-control-row select{max-width:110px;border:1px solid #cbd5e1;border-radius:8px;padding:4px 6px;background:#fff;font-size:12px}',
      '#speciesPredictionPanel .spp-layer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
      '#speciesPredictionPanel .spp-layer-chip{display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;font-size:11px;color:#334155}',
      '#speciesPredictionPanel .spp-results{display:grid;gap:12px}',
      '#speciesPredictionPanel .spp-card{border:1px solid #dbe4ee;border-radius:16px;padding:12px;background:#fff;box-shadow:0 1px 0 rgba(255,255,255,.75) inset}',
      '#speciesPredictionPanel .spp-card h4{margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a}',
      '#speciesPredictionPanel .spp-card p{margin:0;font-size:12px;line-height:1.55;color:#334155}',
      '#speciesPredictionPanel .spp-state{padding:14px}',
      '#speciesPredictionPanel .spp-state-title{font-size:13px;font-weight:700;color:#0f172a;margin-bottom:6px}',
      '#speciesPredictionPanel .spp-state-copy{font-size:12px;line-height:1.55;color:#475569}',
      '#speciesPredictionPanel .spp-state-loading{border-color:#bfdbfe;background:#f8fbff}',
      '#speciesPredictionPanel .spp-state-success{border-color:#bbf7d0;background:#f6fff9}',
      '#speciesPredictionPanel .spp-state-error{border-color:#fed7aa;background:#fffaf5}',
      '#speciesPredictionPanel .spp-state-idle{border-color:#e2e8f0;background:#fbfdff}',
      '#speciesPredictionPanel .spp-summary{display:grid;gap:10px}',
      '#speciesPredictionPanel .spp-summary-text{font-size:13px;line-height:1.65;color:#1e293b}',
      '#speciesPredictionPanel .spp-confidence-note{border:1px solid #e2e8f0;background:#f8fafc;border-radius:12px;padding:10px 11px}',
      '#speciesPredictionPanel .spp-confidence-note h5{margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b}',
      '#speciesPredictionPanel .spp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
      '#speciesPredictionPanel .spp-metric{border:1px solid #edf2f7;border-radius:12px;padding:9px 10px;background:#f8fafc}',
      '#speciesPredictionPanel .spp-metric-label{font-size:11px;color:#64748b;line-height:1.35}',
      '#speciesPredictionPanel .spp-metric-value{margin-top:3px;font-size:13px;font-weight:700;color:#0f172a;line-height:1.35;word-break:break-word}',
      '#speciesPredictionPanel .spp-warning-card{border-color:#fed7aa;background:#fff8f1}',
      '#speciesPredictionPanel .spp-warning-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}',
      '#speciesPredictionPanel .spp-warning-item{padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.8);border:1px solid rgba(251,191,36,.35);font-size:12px;line-height:1.55;color:#7c2d12}',
      '#speciesPredictionPanel .spp-checks{display:grid;gap:8px}',
      '#speciesPredictionPanel .spp-check{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid #edf2f7;border-radius:12px;background:#f8fafc;font-size:12px;color:#334155}',
      '#speciesPredictionPanel .spp-check-label{line-height:1.45}',
      '#speciesPredictionPanel .spp-check-badge{display:inline-flex;align-items:center;justify-content:center;min-width:54px;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700}',
      '#speciesPredictionPanel .spp-check-badge.is-yes{background:#dcfce7;color:#166534}',
      '#speciesPredictionPanel .spp-check-badge.is-no{background:#fee2e2;color:#991b1b}',
      '#speciesPredictionPanel .spp-country{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
      '#speciesPredictionPanel .spp-country .spp-metric{padding:8px 9px}',
      '#speciesPredictionPanel .spp-points{display:grid;gap:10px}',
      '#speciesPredictionPanel .spp-point{border:1px solid #dbe4ee;border-radius:14px;padding:11px 12px;background:linear-gradient(180deg,#ffffff,#fbfdff)}',
      '#speciesPredictionPanel .spp-point-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
      '#speciesPredictionPanel .spp-point-rank{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;border-radius:999px;background:#e0f2fe;color:#0f172a;font-size:12px;font-weight:700}',
      '#speciesPredictionPanel .spp-point-title{display:flex;align-items:flex-start;gap:9px;min-width:0}',
      '#speciesPredictionPanel .spp-point-name{font-size:13px;font-weight:700;color:#0f172a;line-height:1.4}',
      '#speciesPredictionPanel .spp-point-place{margin-top:2px;font-size:12px;line-height:1.45;color:#475569}',
      '#speciesPredictionPanel .spp-confidence{display:grid;justify-items:end;gap:4px;min-width:78px}',
      '#speciesPredictionPanel .spp-confidence-value{font-size:13px;font-weight:700;color:#0f172a}',
      '#speciesPredictionPanel .spp-confidence-bar{position:relative;width:74px;height:7px;border-radius:999px;background:#e2e8f0;overflow:hidden}',
      '#speciesPredictionPanel .spp-confidence-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#38bdf8,#22c55e)}',
      '#speciesPredictionPanel .spp-point-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}',
      '#speciesPredictionPanel .spp-point-reason{margin-top:10px;padding-top:10px;border-top:1px solid #edf2f7}',
      '#speciesPredictionPanel .spp-point-reason-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:4px}',
      '#speciesPredictionPanel .spp-point-reason-text{font-size:12px;line-height:1.55;color:#334155}',
      '#speciesPredictionPanel .spp-debug{border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;color:#475569}',
      '#speciesPredictionPanel .spp-debug summary{cursor:pointer;list-style:none;padding:11px 12px;font-size:12px;font-weight:700}',
      '#speciesPredictionPanel .spp-debug summary::-webkit-details-marker{display:none}',
      '#speciesPredictionPanel .spp-debug-body{padding:0 12px 12px;display:grid;gap:10px}',
      '#speciesPredictionPanel .spp-debug-copy{display:flex;gap:8px;flex-wrap:wrap}',
      '#speciesPredictionPanel .spp-debug-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
      '#speciesPredictionPanel .spp-debug-item{border:1px solid #e2e8f0;border-radius:12px;padding:8px 9px;background:#fff}',
      '#speciesPredictionPanel .spp-debug-label{font-size:11px;color:#64748b}',
      '#speciesPredictionPanel .spp-debug-value{margin-top:3px;font-size:12px;color:#0f172a;line-height:1.45;word-break:break-word}',
      '#speciesPredictionPanel .spp-debug-pre{margin:0;max-height:220px;overflow:auto;border-radius:12px;background:#0f172a;color:#e2e8f0;padding:10px;font:11px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word}',
      '#speciesPredictionPanel .spp-toggle{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:6px 11px;font-size:11px;font-weight:700;color:#0f172a;cursor:pointer;flex:0 0 auto}',
      '#speciesPredictionPanel.is-collapsed .spp-body{display:none}',
      '@media (max-width:900px){#speciesPredictionPanel{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));width:auto;border-radius:18px}#speciesPredictionPanel .spp-header{padding:13px 14px 11px;border-radius:18px 18px 0 0}#speciesPredictionPanel .spp-body{padding:12px 14px 14px;max-height:min(68vh,620px)}#speciesPredictionPanel .spp-country,#speciesPredictionPanel .spp-grid,#speciesPredictionPanel .spp-point-grid,#speciesPredictionPanel .spp-debug-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media (max-width:560px){#speciesPredictionPanel .spp-actions,#speciesPredictionPanel .spp-country,#speciesPredictionPanel .spp-grid,#speciesPredictionPanel .spp-point-grid,#speciesPredictionPanel .spp-debug-grid{grid-template-columns:minmax(0,1fr)}#speciesPredictionPanel .spp-point-head{grid-template-columns:minmax(0,1fr);display:grid}#speciesPredictionPanel .spp-confidence{justify-items:start}#speciesPredictionPanel .spp-fact{display:grid;gap:3px}#speciesPredictionPanel .spp-fact strong{text-align:left}}'
    ].join('');
    document.head.appendChild(styleEl);

    speciesLine = panel.querySelector('[data-role="species-name"]');
    statusLine = panel.querySelector('[data-role="status-line"]');
    modeLine = panel.querySelector('[data-role="mode-line"]');
    resultWrap = panel.querySelector('[data-role="results"]');
    debugWrap = panel.querySelector('[data-role="debug-wrap"]');
    bindControlEvents();

    panel.querySelector('.spp-toggle').addEventListener('click', function () {
      var isCollapsed = panel.classList.toggle('is-collapsed');
      panel.querySelector('.spp-toggle').textContent = isCollapsed ? 'Show' : 'Hide';
      panel.querySelector('.spp-toggle').setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    });
    Array.prototype.slice.call(panel.querySelectorAll('[data-request-type]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        requestRun(String(btn.getAttribute('data-request-type') || 'prediction_and_insight'));
      });
    });
    var debugBody = panel.querySelector('[data-role="debug-body"]');
    if (debugBody) {
      debugBody.addEventListener('click', function (ev) {
        var target = ev && ev.target ? ev.target : null;
        if (!target || !target.getAttribute) return;
        var copyTarget = target.getAttribute('data-copy-target');
        if (!copyTarget) return;
        copyDebugValue(copyTarget);
      });
    }
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
    debugWrap = null;
    clearPredictionOverlay();
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
          runtimeSettingsOverride: buildRuntimeSettingsOverride(),
        }, '*');
      }
    } catch (e) {
      setError(String((e && e.message) || e || 'Prediction request failed'));
    }
  }

  function bindControlEvents() {
    if (!panel) return;
    panel.addEventListener('change', function (event) {
      var target = event && event.target;
      if (!target || !target.getAttribute) return;
      var control = target.getAttribute('data-control');
      if (control) {
        state.controls[control] = target.type === 'checkbox' ? !!target.checked : target.value;
      }
      var layer = target.getAttribute('data-layer-toggle');
      if (layer) {
        state.layerToggles[layer] = !!target.checked;
        applyResultToMap();
      }
    });
  }

  function syncControlsFromSettings() {
    var settings = state.settings || {};
    state.controls.horizonDays = Number(settings.horizonDays || state.controls.horizonDays || 7);
    state.controls.useWeatherWind = settings.useWeatherWind !== false;
    state.controls.showPredictionCone = settings.showPredictionCone !== false;
    state.controls.useRegionalTargets = settings.useRegionalTargets !== false;
    state.controls.recentOnlyMapMarkers = settings.recentOnlyMapMarkers === true;
    state.controls.snapToBestTarget = settings.snapToBestTarget !== false;
    state.controls.autoFeedEnabled = settings.autoFeedEnabled === true;
  }

  function buildRuntimeSettingsOverride() {
    return {
      horizonDays: Number(state.controls.horizonDays || 7),
      useWeatherWind: state.controls.useWeatherWind !== false,
      showPredictionCone: state.controls.showPredictionCone !== false,
      useRegionalTargets: state.controls.useRegionalTargets !== false,
      recentOnlyMapMarkers: state.controls.recentOnlyMapMarkers === true,
      snapToBestTarget: state.controls.snapToBestTarget !== false,
      autoFeedEnabled: state.controls.autoFeedEnabled === true,
    };
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
    syncControlsFromSettings();
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
    state.result = result ? cloneResult(result) : null;
    console.debug('[speciesPrediction] compare panel state replacement', {
      speciesKey: state.result && state.result.speciesKey ? state.result.speciesKey : state.speciesKey || '',
      insightSummary: state.result && state.result.insightSummary ? state.result.insightSummary : null,
      externalPressureScore: state.result ? state.result.externalPressureScore : null,
      lithuania: state.result && state.result.countryScores && state.result.countryScores.lithuania != null ? state.result.countryScores.lithuania : null,
      topPredictedPointReason: state.result && state.result.topPredictedPoints && state.result.topPredictedPoints[0] ? state.result.topPredictedPoints[0].reason || null : null,
    });
    if (isSpeciesPredictionDebugEnabled()) {
      console.debug('[SpeciesPredictionDebug] panelState', {
        speciesKey: state.result && state.result.speciesKey ? state.result.speciesKey : state.speciesKey || '',
        insightSummary: state.result && state.result.insightSummary ? state.result.insightSummary : null,
        externalPressureScore: state.result ? state.result.externalPressureScore : null,
        lithuania: state.result && state.result.countryScores && state.result.countryScores.lithuania != null ? state.result.countryScores.lithuania : null,
        topPredictedPointReason: state.result && state.result.topPredictedPoints && state.result.topPredictedPoints[0] ? state.result.topPredictedPoints[0].reason || null : null,
      });
    }
    if (state.result && state.result.mapLayers && typeof state.result.mapLayers === 'object') {
      state.layerToggles = Object.assign({}, state.layerToggles, {
        estoniaHistoryPoints: state.result.mapLayers.estoniaHistoryPoints !== false,
        estoniaHistoryClusters: state.result.mapLayers.estoniaHistoryClusters === true,
        foreignRecentPoints: state.result.mapLayers.foreignRecentPoints === true,
        foreignPressureClusters: state.result.mapLayers.foreignPressureClusters === true,
        predictedLines: state.result.mapLayers.predictedLines === true,
        predictedCone: state.result.mapLayers.predictedCone === true,
        predictedTargets: state.result.mapLayers.predictedTargets !== false,
        diagnostics: state.result.mapLayers.diagnostics === true,
        recentOnly: state.result.mapLayers.recentOnly === true
      });
    }
    ensurePanel();
    applyResultToMap();
    render();
  }

  function setError(message) {
    if (!state.featureEnabled) return;
    state.loading = false;
    state.result = null;
    state.error = String(message || 'Prediction request failed');
    clearPredictionOverlay();
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
    statusLine.textContent = getStatusText();
    modeLine.textContent = formatMode(state.settings);
    if (debugWrap) debugWrap.open = shouldOpenDebugDetails();
    renderControls();
    resultWrap.innerHTML = '';

    if (state.loading) {
      resultWrap.innerHTML = renderStateCard(
        'spp-state-loading',
        'Prediction running',
        'Prediction may take some time. The panel will update as soon as the backend result is available.'
      );
      renderDebug();
      return;
    }
    if (state.error) {
      resultWrap.innerHTML = renderStateCard(
        'spp-state-error',
        'Prediction failed',
        state.error
      );
      renderDebug();
      return;
    }
    if (!state.result) {
      resultWrap.innerHTML = renderStateCard(
        'spp-state-idle',
        'Ready when you are',
        'Run Prediction, Insight, or Both for the selected species to view backend-generated summary, checks, and hotspot targets.'
      );
      renderDebug();
      return;
    }

    var result = state.result;
    var summaryText = normalizeText(result.insightSummary);
    var confidenceNote = normalizeText(result.confidenceNote);
    var rankingNotes = normalizeText(result.rankingNotes);
    var warnings = normalizeStringArray(result.warnings);
    var consistencyChecks = result.consistencyChecks || null;
    var preferredPoints = Array.isArray(result.topPredictedPoints) ? result.topPredictedPoints.slice(0, 5) : [];
    var foreignClusters = Array.isArray(result.foreignClusters) ? result.foreignClusters : [];
    var predictedTargets = Array.isArray(result.predictedTargets) && result.predictedTargets.length ? result.predictedTargets.slice(0, 5) : preferredPoints;
    var weather = result.weather || null;
    var estoniaEvidence = result.estoniaEvidence || null;
    var sourceHealth = result.sourceHealth || null;
    var evidenceSummary = result.evidenceSummary || null;
    var speciesInfo = result.species || null;
    console.debug('[speciesPrediction] panel render state', {
      speciesKey: result.speciesKey || state.speciesKey || '',
      generatedAt: result.generatedAt || null,
      analysisVersion: result.analysisVersion || null,
      insightSummary: summaryText.slice(0, 140),
      externalPressureScore: result.externalPressureScore,
      springFitScore: result.springFitScore,
      windSupportScore: result.windSupportScore,
      countryScores: result.countryScores || null,
      topPredictedPoints: (preferredPoints || []).slice(0, 3).map(function (point) {
        return {
          rank: point && point.rank,
          name: point && point.name,
          confidence: point && point.confidence,
          eta: point && point.eta,
          reason: point && point.reason,
        };
      }),
    });
    console.debug('[speciesPrediction] compare panel render', {
      speciesKey: result.speciesKey || state.speciesKey || '',
      insightSummary: summaryText || null,
      externalPressureScore: result.externalPressureScore,
      lithuania: result.countryScores && result.countryScores.lithuania != null ? result.countryScores.lithuania : null,
      topPredictedPointReason: preferredPoints && preferredPoints[0] ? preferredPoints[0].reason || null : null,
    });
    publishPanelState(result, preferredPoints);

    var html = '';
    html += renderStateCard('spp-state-success', 'Prediction complete', 'Rendering the latest backend evidence and target ranking for this species.');
    html += '<div class="spp-card"><h4>Summary</h4><p class="spp-summary-text">' + escapeHtml(summarySentence(evidenceSummary, sourceHealth, weather, foreignClusters)) + '</p><div class="spp-grid">' +
      metricCell('Species', speciesInfo && speciesInfo.speciesName ? speciesInfo.speciesName : (result.speciesName || state.speciesName || 'Unavailable')) +
      meaningfulMetricCell('Sources used', summarizeAvailableSources(evidenceSummary, sourceHealth)) +
      metricCell('Ranking mode', formatRankingMode(evidenceSummary && evidenceSummary.rankingMode ? evidenceSummary.rankingMode : 'estonia_history_only')) +
      metricCell('Active evidence used', summarizeActiveEvidence(evidenceSummary, sourceHealth)) +
      meaningfulMetricCell('Freshest EE localities', summarizeFreshestEstoniaLocalities(estoniaEvidence)) +
      meaningfulMetricCell('Latest EE date', estoniaEvidence ? estoniaEvidence.latestEstoniaDate : '') +
      meaningfulMetricCell('Latest EE source', estoniaEvidence ? estoniaEvidence.latestEstoniaSource : '') +
      meaningfulMetricCell('Recent EE count', estoniaEvidence ? estoniaEvidence.recentCount7d : '') +
      meaningfulMetricCell('Weather', evidenceSummary && evidenceSummary.wasWeatherUsedInRanking ? weatherLine(weather, evidenceSummary) : '') +
      meaningfulMetricCell('Attempted but unavailable', summarizeAttemptedButNotUsed(evidenceSummary)) +
      '</div></div>';
    if (estoniaEvidence) {
      html += '<div class="spp-card"><h4>Fresh Estonia evidence</h4><div class="spp-grid">' +
        meaningfulMetricCell('Freshest localities', summarizeFreshestEstoniaLocalities(estoniaEvidence)) +
        meaningfulMetricCell('Latest EE date', estoniaEvidence.latestEstoniaDate || '') +
        meaningfulMetricCell('Latest EE coords', formatCoords(estoniaEvidence.latestEstoniaLat, estoniaEvidence.latestEstoniaLon)) +
        meaningfulMetricCell('Source mix', summarizeSourceMix(estoniaEvidence)) +
        meaningfulMetricCell('Recent count (7d)', estoniaEvidence.recentCount7d) +
        meaningfulMetricCell('Recent count (30d)', estoniaEvidence.recentCount30d) +
        '</div></div>';
    }
    if (shouldOpenDebugDetails()) {
      if (warnings.length) {
        html += '<div class="spp-card spp-warning-card"><h4>Warnings</h4><ul class="spp-warning-list">';
        warnings.forEach(function (warning) {
          html += '<li class="spp-warning-item">' + escapeHtml(warning) + '</li>';
        });
        html += '</ul></div>';
      }
      if (consistencyChecks) {
        html += '<div class="spp-card"><h4>Consistency checks</h4><div class="spp-checks">' +
          checkCell('Route looks plausible', consistencyChecks.routeLooksPlausible) +
          checkCell('Timing looks plausible', consistencyChecks.timingLooksPlausible) +
          checkCell('Weather looks supportive', consistencyChecks.weatherLooksSupportive) +
          checkCell('Foreign pressure matches narrative', consistencyChecks.foreignPressureMatchesNarrative) +
          '</div></div>';
      }
      html += renderPayloadSections(result);
    }
    html += '<div class="spp-card"><h4>Predicted targets</h4><div class="spp-points">';
    if (!predictedTargets.length) {
      html += '<div class="spp-point"><div class="spp-point-reason-text">No precise hotspot results returned.</div></div>';
    } else {
      predictedTargets.forEach(function (point) {
        html += renderPredictedPoint(point);
      });
    }
    html += '</div></div>';
    if (summaryText || confidenceNote) {
      html += '<details class="spp-card"><summary style="cursor:pointer;font-weight:700;color:#0f172a">OpenAI summary</summary>';
      if (summaryText) {
        html += '<div class="spp-summary" style="margin-top:10px"><p class="spp-summary-text">' + escapeHtml(summaryText) + '</p></div>';
      }
      if (confidenceNote) {
        html += '<div class="spp-confidence-note" style="margin-top:10px"><h5>Confidence note</h5><p>' + escapeHtml(confidenceNote) + '</p></div>';
      }
      if (rankingNotes) {
        html += '<div class="spp-confidence-note" style="margin-top:10px"><h5>Ranking notes</h5><p>' + escapeHtml(rankingNotes) + '</p></div>';
      }
      html += '</details>';
    }
    resultWrap.innerHTML = html;
    renderDebug();
  }

  function renderDebug() {
    if (!panel) return;
    var debugBody = panel.querySelector('[data-role="debug-body"]');
    if (!debugBody) return;
    var result = state.result || {};
    var points = Array.isArray(result.topPredictedPoints) ? result.topPredictedPoints : [];
    var debugItems = [
      debugItem('Panel build', runtimeInfo.visibleMarker),
      debugItem('Panel script', runtimeInfo.panelScript),
      debugItem('Scope', state.scope),
      debugItem('Species key', state.speciesKey || '(empty)'),
      debugItem('Species name', state.speciesName || '(empty)'),
      debugItem('Status', getStatusText()),
      debugItem('Mode', formatMode(state.settings)),
      debugItem('Analysis version', result.analysisVersion || 'Not provided'),
      debugItem('Generated at', result.generatedAt || '(empty)'),
      debugItem('Stage', result.stage || '(empty)'),
      debugItem('Elapsed ms', result.elapsedMs != null ? String(result.elapsedMs) : '(empty)'),
      debugItem('Timeout budget (ms)', result.timeoutMsUsed != null ? String(result.timeoutMsUsed) : 'Not provided'),
      debugItem('Edge function version', result.edgeFunctionVersion || 'Not provided'),
      debugItem('Primary source', result.sourceHealth && result.sourceHealth.primarySourceUsed ? result.sourceHealth.primarySourceUsed : '(empty)'),
      debugItem('Ranking mode', result.evidenceSummary && result.evidenceSummary.rankingMode ? result.evidenceSummary.rankingMode : '(empty)'),
      debugItem('Foreign groups', String(Array.isArray(result.foreignEvidence) ? result.foreignEvidence.length : 0)),
      debugItem('Estonia recent 7d', result.estoniaEvidence && result.estoniaEvidence.recentCount7d != null ? String(result.estoniaEvidence.recentCount7d) : '(empty)'),
      debugItem('Warning count', String(normalizeStringArray(result.warnings).length)),
      debugItem('Top points', String(points.length)),
    ].join('');
    var targetDiagnostics = points.map(function (point) {
      return '<div class="spp-debug-item">' +
        '<div class="spp-debug-label">#' + escapeHtml(point.rank || '?') + ' ' + escapeHtml(point.displayName || point.name || 'Target') + '</div>' +
        '<div class="spp-debug-value">source=' + escapeHtml(point.sourceType || 'Unavailable') +
        ' | rawClusterId=' + escapeHtml(point.rawClusterId || point.derivedFromClusterId || 'Unavailable') +
        ' | displayNameSource=' + escapeHtml(point.displayNameSource || 'Unavailable') +
        ' | coordinateSource=' + escapeHtml(point.coordinateSource || point.representativePointMethod || 'Unavailable') +
        ' | rankingMode=' + escapeHtml(point.rankingMode || 'Unavailable') +
        ' | representative=' + escapeHtml(point.representativePointMethod || 'Unavailable') +
        ' | support=' + escapeHtml(point.supportingPointCount || point.supportingEstoniaHistoryCount || 'Unavailable') +
        ' | habitatFit=' + escapeHtml(point.habitatFitScore != null ? point.habitatFitScore : 'Unavailable') +
        ' | historyScore=' + escapeHtml(point.historySupportScore != null ? point.historySupportScore : 'Unavailable') +
        ' | foreignScore=' + escapeHtml(point.foreignSupportScore != null ? point.foreignSupportScore : 'Unavailable') +
        ' | weatherScore=' + escapeHtml(point.weatherSupportScore != null ? point.weatherSupportScore : 'Unavailable') +
        ' | confBeforeCap=' + escapeHtml(point.confidenceBeforeCap != null ? point.confidenceBeforeCap : 'Unavailable') +
        ' | confAfterCap=' + escapeHtml(point.confidenceAfterCap != null ? point.confidenceAfterCap : 'Unavailable') +
        ' | habitatFilter=' + escapeHtml(point.habitatFilterAdjustedRanking ? 'Yes' : 'No') +
        ' | foreign=' + escapeHtml(point.usedForeignPressure ? 'Yes' : 'No') +
        ' | vectorsSuppressed=' + escapeHtml(point.vectorsSuppressed ? 'Yes' : 'No') +
        '</div></div>';
    }).join('');
    debugBody.innerHTML = '' +
      '<div class="spp-debug-copy">' +
      '  <button type="button" class="btn secondary" data-copy-target="result-json">Copy result JSON</button>' +
      '  <button type="button" class="btn secondary" data-copy-target="summary">Copy summary</button>' +
      '</div>' +
      '<div class="spp-debug-grid">' + debugItems + '</div>' +
      (targetDiagnostics ? '<div class="spp-debug-grid">' + targetDiagnostics + '</div>' : '') +
      '<pre class="spp-debug-pre">' + escapeHtml(formatJson(state.result)) + '</pre>';
  }

  function renderControls() {
    if (!panel) return;
    var host = panel.querySelector('[data-role="controls"]');
    if (!host) return;
    host.innerHTML = '' +
      '<h4>Map prediction mode</h4>' +
      '<div class="spp-control-grid">' +
      controlInput('Horizon', '<input type="number" min="1" max="30" data-control="horizonDays" value="' + escapeHtml(state.controls.horizonDays) + '">') +
      controlInput('Country filter', renderCountryFilter()) +
      controlInput('Use wind', checkboxControl('useWeatherWind', state.controls.useWeatherWind)) +
      controlInput('Show cone', checkboxControl('showPredictionCone', state.controls.showPredictionCone)) +
      controlInput('Regional', checkboxControl('useRegionalTargets', state.controls.useRegionalTargets)) +
      controlInput('Recent only', checkboxControl('recentOnlyMapMarkers', state.controls.recentOnlyMapMarkers)) +
      controlInput('Snap target', checkboxControl('snapToBestTarget', state.controls.snapToBestTarget)) +
      controlInput('Auto feed', checkboxControl('autoFeedEnabled', state.controls.autoFeedEnabled)) +
      '</div>' +
      '<div class="spp-layer-grid">' +
      layerChip('estoniaHistoryPoints', 'EE history points', state.layerToggles.estoniaHistoryPoints) +
      layerChip('estoniaHistoryClusters', 'EE history clusters', state.layerToggles.estoniaHistoryClusters) +
      layerChip('foreignRecentPoints', 'Foreign eBird points', state.layerToggles.foreignRecentPoints) +
      layerChip('foreignPressureClusters', 'Foreign pressure clusters', state.layerToggles.foreignPressureClusters) +
      layerChip('predictedLines', 'Prediction vectors', state.layerToggles.predictedLines) +
      layerChip('predictedCone', 'Prediction cone', state.layerToggles.predictedCone) +
      layerChip('predictedTargets', 'Predicted targets', state.layerToggles.predictedTargets) +
      layerChip('diagnostics', 'Diagnostics', state.layerToggles.diagnostics) +
      layerChip('recentOnly', 'Recent only', state.layerToggles.recentOnly) +
      '</div>';
  }

  function createOverlayGroups() {
    return {
      estoniaHistoryPoints: L.layerGroup().addTo(window.map),
      estoniaHistoryClusters: L.layerGroup().addTo(window.map),
      foreignRecentPoints: L.layerGroup().addTo(window.map),
      foreignPressureClusters: L.layerGroup().addTo(window.map),
      predictedLines: L.layerGroup().addTo(window.map),
      predictedCone: L.layerGroup().addTo(window.map),
      predictedTargets: L.layerGroup().addTo(window.map),
      diagnostics: L.layerGroup().addTo(window.map)
    };
  }

  function applyResultToMap() {
    clearPredictionOverlay();
    if (!state.result || !window.map || !window.L) return;
    var result = state.result;
    overlayGroups = createOverlayGroups();
    if (state.layerToggles.estoniaHistoryPoints !== false) renderEstoniaHistory(result.estoniaHistoryPoints || []);
    if (state.layerToggles.estoniaHistoryClusters !== false) renderEstoniaHistoryClusters(result.estoniaHistoryClusters || []);
    if (state.layerToggles.foreignRecentPoints !== false) renderForeignEvidencePoints(result.foreignRecentPoints || [], result.foreignClusters || []);
    if (state.layerToggles.foreignPressureClusters !== false) renderForeignPressureClusters(result.foreignClusters || []);
    if (state.layerToggles.predictedLines !== false) renderPredictionVectors(result.predictionVectors || [], false);
    if (state.layerToggles.predictedCone !== false) renderPredictionVectors(result.predictionVectors || [], true);
    if (state.layerToggles.predictedTargets !== false) renderPredictedTargetsOnMap((result.predictedTargets || result.topPredictedPoints || []).slice(0, 5));
    if (state.layerToggles.diagnostics === true && shouldOpenDebugDetails()) renderDiagnostics((result.predictedTargets || result.topPredictedPoints || []).slice(0, 5));
  }

  function clearPredictionOverlay() {
    if (overlayGroups && window.map) {
      Object.keys(overlayGroups).forEach(function (key) {
        try { overlayGroups[key].remove(); } catch (e) {}
      });
    }
    overlayGroups = null;
  }

  function renderPredictedPoint(point) {
    var confidencePct = formatConfidence(point && point.confidence);
    var fillPct = String(clampConfidencePercent(point && point.confidence)) + '%';
    var metrics = '' +
      metricCell('ETA', point && point.eta) +
      metricCell('Radius', appendKm(point && point.searchRadiusKm)) +
      metricCell('Confidence', confidencePct) +
      metricCell('EE support count', point && point.supportingEstoniaHistoryCount) +
      metricCell('Latest EE date', point && point.latestSupportingEstoniaDate ? point.latestSupportingEstoniaDate : 'Unavailable');
    return '' +
      '<div class="spp-point">' +
      '  <div class="spp-point-head">' +
      '    <div class="spp-point-title">' +
      '      <div class="spp-point-rank">#' + escapeHtml(point && point.rank) + '</div>' +
      '      <div>' +
        '        <div class="spp-point-name">' + escapeHtml(point && (point.displayName || point.name)) + '</div>' +
      '        <div class="spp-point-place">' + escapeHtml(formatCoords(point && point.lat, point && point.lon)) + '</div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="spp-confidence">' +
      '      <div class="spp-confidence-value">' + escapeHtml(confidencePct) + '</div>' +
      '      <div class="spp-confidence-bar"><div class="spp-confidence-fill" style="width:' + escapeHtml(fillPct) + '"></div></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="spp-point-grid">' + metrics + '</div>' +
      '  <div class="spp-point-reason">' +
      '    <div class="spp-point-reason-label">Reason</div>' +
      '    <div class="spp-point-reason-text">' + escapeHtml(cleanReasonText(point && point.reason, false)) + '</div>' +
      '  </div>' +
      '</div>';
  }

  function renderForeignEvidenceGroup(group) {
    var topClusters = Array.isArray(group && group.topClusters) ? group.topClusters : [];
    var html = '<div class="spp-point">';
    html += '<div class="spp-point-head"><div class="spp-point-title"><div><div class="spp-point-name">' + escapeHtml(group && group.countryName ? group.countryName : (group && group.countryCode ? String(group.countryCode).toUpperCase() : 'Country')) + '</div><div class="spp-point-place">' + escapeHtml(group && group.latestDate ? ('Latest: ' + group.latestDate) : 'Latest date unavailable') + '</div></div></div>';
    html += '<div class="spp-confidence"><div class="spp-confidence-value">' + escapeHtml(String(group && group.recordCount7d != null ? group.recordCount7d : 0) + ' / 7d') + '</div></div></div>';
    html += '<div class="spp-point-grid">' +
      metricCell('Records (7d)', group && group.recordCount7d) +
      metricCell('Records (30d)', group && group.recordCount30d) +
      metricCell('Nearest distance', formatDistance(group && group.nearestDistanceKm)) +
      metricCell('Clusters', group && group.clusterCount) +
      '</div>';
    if (topClusters.length) {
      html += '<div class="spp-point-reason"><div class="spp-point-reason-label">Representative clusters</div>';
      topClusters.forEach(function (cluster) {
        html += '<div class="spp-point-reason-text">' +
          escapeHtml(cluster && cluster.label ? cluster.label : 'Cluster') +
          ' | ' + escapeHtml(formatCoords(cluster && cluster.lat, cluster && cluster.lon)) +
          ' | 7d: ' + escapeHtml(cluster && cluster.count7d != null ? cluster.count7d : 0) +
          ' | ' + escapeHtml(cluster && cluster.lastDate ? cluster.lastDate : 'date unavailable') +
          ' | ' + escapeHtml(cluster && cluster.source ? cluster.source : 'source unavailable') +
          '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderHistoricalHotspot(point) {
    return '<div class="spp-point">' +
      '<div class="spp-point-name">' + escapeHtml(point && point.name ? point.name : 'Historical hotspot') + '</div>' +
      '<div class="spp-point-place">' + escapeHtml(point && point.countyOrParish ? point.countyOrParish : 'County/parish unavailable') + '</div>' +
      '<div class="spp-point-place">' + escapeHtml(formatCoords(point && point.lat, point && point.lon)) + '</div>' +
      '<div class="spp-point-reason-text" style="margin-top:8px">' + escapeHtml(point && point.reason ? point.reason : 'Historical hotspot evidence') + '</div>' +
      '</div>';
  }

  function renderStateCard(extraClass, title, message) {
    return '' +
      '<div class="spp-card spp-state ' + extraClass + '">' +
      '  <div class="spp-state-title">' + escapeHtml(title) + '</div>' +
      '  <div class="spp-state-copy">' + escapeHtml(message) + '</div>' +
      '</div>';
  }

  function metricCell(label, value) {
    return '' +
      '<div class="spp-metric">' +
      '  <div class="spp-metric-label">' + escapeHtml(label) + '</div>' +
      '  <div class="spp-metric-value">' + escapeHtml(value == null || value === '' ? 'Unavailable' : value) + '</div>' +
      '</div>';
  }

  function scoreCell(label, value) {
    return metricCell(label, value == null ? 0 : value);
  }

  function checkCell(label, value) {
    return '' +
      '<div class="spp-check">' +
      '  <div class="spp-check-label">' + escapeHtml(label) + '</div>' +
      '  <div class="spp-check-badge ' + (value ? 'is-yes' : 'is-no') + '">' + (value ? 'Yes' : 'No') + '</div>' +
      '</div>';
  }

  function controlInput(label, controlHtml) {
    return '<label class="spp-control-row"><span>' + escapeHtml(label) + '</span><span>' + controlHtml + '</span></label>';
  }

  function checkboxControl(name, checked) {
    return '<input type="checkbox" data-control="' + escapeHtml(name) + '"' + (checked ? ' checked' : '') + '>';
  }

  function layerChip(name, label, checked) {
    return '<label class="spp-layer-chip"><input type="checkbox" data-layer-toggle="' + escapeHtml(name) + '"' + (checked ? ' checked' : '') + '><span>' + escapeHtml(label) + '</span></label>';
  }

  function renderCountryFilter() {
    var options = ['all'];
    var groups = Array.isArray(state.result && state.result.foreignEvidence) ? state.result.foreignEvidence : [];
    groups.forEach(function (group) {
      var code = String(group.countryCode || '').toLowerCase();
      if (code && options.indexOf(code) < 0) options.push(code);
    });
    return '<select data-control="countryFilter">' + options.map(function (code) {
      var selected = state.controls.countryFilter === code ? ' selected' : '';
      return '<option value="' + escapeHtml(code) + '"' + selected + '>' + escapeHtml(code === 'all' ? 'All' : String(code).toUpperCase()) + '</option>';
    }).join('') + '</select>';
  }

  function summarizeCountries(foreignEvidence, foreignClusters) {
    var names = [];
    foreignEvidence.forEach(function (group) { if (group.countryName) names.push(String(group.countryName)); });
    if (!names.length) {
      foreignClusters.forEach(function (cluster) {
        (cluster.countries || []).forEach(function (country) { names.push(String(country)); });
      });
    }
    names = names.filter(function (name, index) { return name && names.indexOf(name) === index; });
    return names.join(', ') || 'Unavailable';
  }

  function renderEstoniaHistory(points) {
    points.filter(filterRecentHistoryPoint).forEach(function (point) {
      var color = '#6b7280';
      L.circleMarker([point.lat, point.lon], {
        radius: point.ageClass === 'recent' ? 4 : 3,
        color: color,
        weight: 1,
        fillColor: color,
        fillOpacity: point.ageClass === 'recent' ? 0.55 : 0.35
      }).bindPopup('<strong>Estonia history</strong><br>' + escapeHtml(point.locality || point.municipality || 'GBIF point') + '<br>' + escapeHtml(point.eventDate || 'Unknown date')).addTo(overlayGroups.estoniaHistoryPoints);
    });
  }

  function renderEstoniaHistoryClusters(clusters) {
    clusters.forEach(function (cluster) {
      L.circleMarker([cluster.representativeLat || cluster.lat, cluster.representativeLon || cluster.lon], {
        radius: Math.max(5, Math.min(11, Number(cluster.count || 1) + 3)),
        color: '#475569',
        weight: 2,
        fillColor: '#94a3b8',
        fillOpacity: 0.28
      }).bindPopup('<strong>Estonia history cluster</strong><br>' + escapeHtml(cluster.displayName || cluster.locality || 'Cluster') + '<br>' + escapeHtml(formatCoords(cluster.representativeLat || cluster.lat, cluster.representativeLon || cluster.lon)) + '<br>Support: ' + escapeHtml(cluster.count || 0)).addTo(overlayGroups.estoniaHistoryClusters);
    });
  }

  function renderForeignEvidencePoints(points, clusters) {
    var freshestClusterId = clusters[0] && clusters[0].id ? clusters[0].id : '';
    points.filter(filterCountryPoint).filter(filterRecentForeignPoint).forEach(function (point) {
      var isFreshest = freshestClusterId && point.clusterId === freshestClusterId;
      L.circleMarker([point.lat, point.lon], {
        radius: isFreshest ? 6 : 5,
        color: isFreshest ? '#ea580c' : '#f59e0b',
        weight: 2,
        fillColor: isFreshest ? '#fb923c' : '#fdba74',
        fillOpacity: 0.85
      }).bindPopup('<strong>Foreign eBird evidence</strong><br>' + escapeHtml(point.countryName || point.countryCode || '') + '<br>' + escapeHtml(point.locName || 'Location unavailable') + '<br>' + escapeHtml(point.obsDt || '')).addTo(overlayGroups.foreignRecentPoints);
    });
  }

  function renderForeignPressureClusters(clusters) {
    clusters.forEach(function (cluster) {
      L.circleMarker([cluster.lat, cluster.lon], {
        radius: Math.max(6, Math.min(12, Number(cluster.pointCount || 1) + 4)),
        color: '#c2410c',
        weight: 2,
        fillColor: '#fb923c',
        fillOpacity: 0.2
      }).bindPopup('<strong>Foreign pressure cluster</strong><br>' + escapeHtml((cluster.locNames || []).join(', ') || 'Cluster') + '<br>' + escapeHtml(formatCoords(cluster.lat, cluster.lon)) + '<br>Points: ' + escapeHtml(cluster.pointCount || 0)).addTo(overlayGroups.foreignPressureClusters);
    });
  }

  function renderPredictionVectors(vectors, conesOnly) {
    vectors.forEach(function (vector) {
      if (!!conesOnly !== (vector.kind === 'cone')) return;
      var points = Array.isArray(vector.points) ? vector.points : [];
      if (points.length < 2) return;
      L.polyline(points.map(function (point) { return [point.lat, point.lon]; }), {
        color: vector.kind === 'cone' ? 'rgba(251,146,60,0.65)' : '#ef4444',
        weight: vector.kind === 'cone' ? 2 : 3,
        fill: vector.kind === 'cone',
        fillOpacity: vector.kind === 'cone' ? 0.1 : 0
      }).addTo(vector.kind === 'cone' ? overlayGroups.predictedCone : overlayGroups.predictedLines);
    });
  }

  function renderPredictedTargetsOnMap(points) {
    points.forEach(function (point) {
      var icon = L.divIcon({
        className: 'species-prediction-target',
        html: '<div style="width:28px;height:28px;border-radius:999px;background:#111827;color:#fff;border:3px solid #facc15;display:flex;align-items:center;justify-content:center;font:700 12px/1 system-ui;">' + escapeHtml(point.rank || '?') + '</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      L.marker([point.lat, point.lon], { icon: icon, zIndexOffset: 1000 }).bindPopup(
        '<strong>#' + escapeHtml(point.rank) + ' ' + escapeHtml(point.displayName || point.name || 'Target') + '</strong><br>' +
        'Confidence: ' + escapeHtml(formatConfidence(point.confidence)) + '<br>' +
        'EE support: ' + escapeHtml(point.supportingEstoniaHistoryCount || point.supportingPointCount || '') + '<br>' +
        'Latest EE date: ' + escapeHtml(point.latestSupportingEstoniaDate || '') + '<br>' +
        escapeHtml(cleanReasonText(point.reason || '', Array.isArray(point.supportingCountries) && point.supportingCountries.length))
      ).addTo(overlayGroups.predictedTargets);
    });
  }

  function renderDiagnostics(points) {
    points.forEach(function (point) {
      if (!point || !isFiniteNumber(Number(point.lat)) || !isFiniteNumber(Number(point.lon))) return;
      L.circleMarker([point.lat, point.lon], {
        radius: 14,
        color: '#7c3aed',
        weight: 1,
        fillOpacity: 0
      }).bindPopup('<strong>Diagnostics</strong><br>' +
        'Source: ' + escapeHtml(point.sourceType || 'Unavailable') + '<br>' +
        'Representative point: ' + escapeHtml(point.representativePointMethod || 'Unavailable') + '<br>' +
        'Support points: ' + escapeHtml(point.supportingPointCount || 'Unavailable') + '<br>' +
        'Habitat filter adjusted ranking: ' + escapeHtml(point.habitatFilterAdjustedRanking ? 'Yes' : 'No') + '<br>' +
        'Foreign pressure used: ' + escapeHtml(point.usedForeignPressure ? 'Yes' : 'No') + '<br>' +
        'Vectors suppressed: ' + escapeHtml(point.vectorsSuppressed ? 'Yes' : 'No')).addTo(overlayGroups.diagnostics);
    });
  }

  function filterCountryPoint(point) {
    return state.controls.countryFilter === 'all' || String(point.countryCode || '').toLowerCase() === String(state.controls.countryFilter || '').toLowerCase();
  }

  function filterRecentForeignPoint(point) {
    if (state.layerToggles.recentOnly === true || state.controls.recentOnlyMapMarkers === true) return Number(point.daysAgo || 999) <= 7;
    return true;
  }

  function filterRecentHistoryPoint(point) {
    if (state.layerToggles.recentOnly === true || state.controls.recentOnlyMapMarkers === true) return point.ageClass === 'recent';
    return true;
  }

  function formatCoords(lat, lon) {
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return 'Coordinates unavailable';
    return String(Number(lat).toFixed(5)) + ', ' + String(Number(lon).toFixed(5));
  }

  function normalizeStringArray(values) {
    if (!Array.isArray(values)) return [];
    return values.map(function (value) { return String(value || '').trim(); }).filter(Boolean);
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function formatConfidence(value) {
    var n = Number(value);
    if (!isFiniteNumber(n)) return '0%';
    if (n > 1) return String(Math.round(n)) + '%';
    return String(Math.round(n * 100)) + '%';
  }

  function clampConfidencePercent(value) {
    var n = Number(value);
    if (!isFiniteNumber(n)) return 0;
    if (n > 1) return Math.max(0, Math.min(100, Math.round(n)));
    return Math.max(0, Math.min(100, Math.round(n * 100)));
  }

  function appendKm(value) {
    var text = value == null || value === '' ? 'Unavailable' : String(value);
    return text === 'Unavailable' ? text : text + ' km';
  }

  function formatDistance(value) {
    if (!isFiniteNumber(Number(value)) || Number(value) <= 0) return 'Unavailable';
    return String(Math.round(Number(value))) + ' km';
  }

  function sumForeignCount(groups, key) {
    if (!Array.isArray(groups)) return 0;
    return groups.reduce(function (sum, group) {
      return sum + Number((group && group[key]) || 0);
    }, 0);
  }

  function findNearestClusterDistance(groups) {
    if (!Array.isArray(groups)) return null;
    var distances = groups.map(function (group) { return Number(group && group.nearestDistanceKm); }).filter(function (value) {
      return Number.isFinite(value) && value > 0;
    });
    if (!distances.length) return null;
    return Math.min.apply(Math, distances);
  }

  function renderPayloadSections(result) {
    var html = '';
    html += renderOptionalSection('Source health', result && result.sourceHealth);
    html += renderOptionalSection('Evidence summary', result && result.evidenceSummary);
    html += renderOptionalSection('Estonia evidence', result && result.estoniaEvidence);
    html += renderOptionalSection('Foreign evidence', result && result.foreignEvidence);
    html += renderOptionalSection('Foreign clusters', result && result.foreignClusters);
    html += renderOptionalSection('Foreign recent points', result && result.foreignRecentPoints);
    html += renderOptionalSection('Weather payload', result && result.weather);
    html += renderOptionalSection('Prediction vectors', result && result.predictionVectors);
    html += renderOptionalSection('AI summary', result && (result.aiSummary || result.insightSummary));
    return html;
  }

  function renderOptionalSection(title, value) {
    if (value == null) return '';
    if (Array.isArray(value) && !value.length) return '';
    if (typeof value === 'string' && !String(value).trim()) return '';
    return '<details class="spp-card"><summary style="cursor:pointer;font-weight:700;color:#0f172a">' + escapeHtml(title) + '</summary><pre class="spp-debug-pre" style="margin-top:10px">' + escapeHtml(formatJson(value)) + '</pre></details>';
  }

  function summarizeSources(evidenceSummary, sourceHealth) {
    var sources = Array.isArray(evidenceSummary && evidenceSummary.dataSourcesUsed) ? evidenceSummary.dataSourcesUsed : [];
    if (!sources.length && sourceHealth && sourceHealth.primarySourceUsed) sources = [sourceHealth.primarySourceUsed];
    return sources.length ? sources.join(', ') : 'Unavailable';
  }

  function summarizeActiveEvidence(evidenceSummary, sourceHealth) {
    var sources = Array.isArray(evidenceSummary && evidenceSummary.activeEvidenceUsed) ? evidenceSummary.activeEvidenceUsed : [];
    if (!sources.length) return summarizeSources(evidenceSummary, sourceHealth);
    return sources.join(', ');
  }

  function summarizeAvailableSources(evidenceSummary, sourceHealth) {
    var sources = Array.isArray(evidenceSummary && evidenceSummary.availableSources) ? evidenceSummary.availableSources : [];
    if (!sources.length) return summarizeSources(evidenceSummary, sourceHealth);
    return sources.join(', ');
  }

  function summarizeFreshestEstoniaLocalities(estoniaEvidence) {
    var localities = Array.isArray(estoniaEvidence && estoniaEvidence.freshestLocalities) ? estoniaEvidence.freshestLocalities : [];
    if (localities.length) return localities.slice(0, 5).join(', ');
    return String(estoniaEvidence && estoniaEvidence.latestEstoniaLocality || '').trim();
  }

  function summarizeSourceMix(estoniaEvidence) {
    var sources = Array.isArray(estoniaEvidence && estoniaEvidence.sourceMix) ? estoniaEvidence.sourceMix : [];
    return sources.length ? sources.join(', ') : String(estoniaEvidence && estoniaEvidence.latestEstoniaSource || '').trim();
  }

  function summarizeAttemptedButNotUsed(evidenceSummary) {
    var items = Array.isArray(evidenceSummary && evidenceSummary.attemptedButNotUsed) ? evidenceSummary.attemptedButNotUsed : [];
    return items.length ? items.join(', ') : '';
  }

  function summarySentence(evidenceSummary, sourceHealth, weather, foreignClusters) {
    if (evidenceSummary && evidenceSummary.summaryText) return evidenceSummary.summaryText;
    var rankingMode = String(evidenceSummary && evidenceSummary.rankingMode || 'estonia_history_only');
    var evidence = summarizeActiveEvidence(evidenceSummary, sourceHealth);
    if (rankingMode === 'estonia_history_only' || rankingMode === 'estonia_history_plus_weather') {
      return 'Ranking is based mainly on Estonia evidence' + (evidence ? ' using ' + evidence : '') + '.';
    }
    return formatRankingMode(rankingMode) + (evidence ? ' using ' + evidence + '.' : '.');
  }

  function inferRankingMode(foreignClusters, weather) {
    if (foreignClusters && foreignClusters.length) return weatherLooksUsable(weather) ? 'Estonia history + foreign eBird + weather' : 'Estonia history + foreign eBird';
    return 'Estonia history only';
  }

  function weatherLooksUsable(weather) {
    return !!(weather && weather.fetchedAt && weather.weatherAvailable === true && weather.weatherPartial !== true && (Number(weather.windSpeedKph || 0) > 0 || Number(weather.windDirectionDeg || 0) > 0));
  }

  function weatherLine(weather, evidenceSummary) {
    if (!weather) return 'Unavailable';
    if (weather.weatherAvailable !== true) return weather.error ? 'Unavailable (' + String(weather.error) + ')' : 'Unavailable';
    if (weather.weatherPartial === true || !weather.fetchedAt) return 'Partial or unreliable weather payload';
    var status = evidenceSummary && evidenceSummary.wasWeatherUsedInRanking ? 'used' : 'available';
    return String(weather.windDirectionLabel || '') + ' ' + String(weather.windSpeedKph || 0) + ' km/h (' + status + ', ' + String(weather.fetchedAt || 'no timestamp') + ')';
  }

  function formatWeatherUsage(evidenceSummary, weather) {
    if (evidenceSummary && evidenceSummary.wasWeatherUsedInRanking) return 'Yes';
    if (weather && (weather.weatherPartial === true || !weather.fetchedAt)) return 'Partial';
    return 'No';
  }

  function formatCoordinateSource(value) {
    var method = String(value || '').trim();
    if (method === 'hotspot_coordinate') return 'Named hotspot coordinate';
    if (method === 'medoid') return 'Medoid of real support points';
    if (method === 'nearest_real_point') return 'Nearest real supporting point';
    if (method === 'centroid_fallback') return 'Centroid fallback';
    return method || 'Unavailable';
  }

  function formatRankingMode(value) {
    var mode = String(value || '').trim();
    if (!mode) return 'Unavailable';
    if (mode === 'estonia_history_only') return 'Estonia history only';
    if (mode === 'estonia_history_plus_weather') return 'Estonia history + weather';
    if (mode === 'estonia_history_plus_foreign') return 'Estonia history + foreign eBird';
    if (mode === 'estonia_history_plus_foreign_plus_weather') return 'Estonia history + foreign eBird + weather';
    return mode;
  }

  function cleanReasonText(reason, hasForeignEvidence) {
    var text = String(reason || '').trim();
    if (hasForeignEvidence) return text || 'Unavailable';
    return text
      .replace(/nearest relevant foreign cluster[^.]*\./ig, '')
      .replace(/foreign eBird pressure[^.]*\./ig, '')
      .replace(/flow bearing[^.]*\./ig, '')
      .replace(/wind is aligned[^.]*\./ig, '')
      .replace(/\s{2,}/g, ' ')
      .trim() || 'Unavailable';
  }

  function compactForeignSupportNote(point) {
    var rankingMode = String(point && point.rankingMode || '');
    if (rankingMode === 'estonia_history_only' || rankingMode === 'estonia_history_plus_weather') {
      return '';
    }
    return '';
  }

  function meaningfulMetricCell(label, value) {
    if (value == null || value === '' || value === 'Unavailable' || value === 'Not used' || value === 'None') return '';
    return metricCell(label, value);
  }

  function getStatusText() {
    if (state.loading) return 'Running';
    if (state.error) return 'Error';
    if (state.result) return 'Completed';
    return 'Idle';
  }

  function formatMode(settings) {
    if (!settings || !settings.predictionMode) return 'Waiting for species settings';
    var mode = String(settings.predictionMode || 'precise_hotspot').trim();
    var outputCount = String(settings.outputCount || 5).trim();
    return humanizeMode(mode) + ' - Top ' + outputCount;
  }

  function humanizeMode(value) {
    var input = String(value || '').trim();
    if (!input) return 'Prediction mode';
    return input
      .split('_')
      .map(function (part) {
        return part ? part.charAt(0).toUpperCase() + part.slice(1) : '';
      })
      .join(' ');
  }

  function debugItem(label, value) {
    return '' +
      '<div class="spp-debug-item">' +
      '  <div class="spp-debug-label">' + escapeHtml(label) + '</div>' +
      '  <div class="spp-debug-value">' + escapeHtml(value == null || value === '' ? '(empty)' : value) + '</div>' +
      '</div>';
  }

  function copyDebugValue(target) {
    var value = '';
    if (target === 'result-json') {
      value = formatJson(state.result);
    } else if (target === 'summary') {
      value = [
        'species=' + (state.speciesName || '(empty)'),
        'speciesKey=' + (state.speciesKey || '(empty)'),
        'scope=' + state.scope,
        'status=' + getStatusText(),
        'mode=' + formatMode(state.settings),
        'panelBuild=' + runtimeInfo.visibleMarker,
        'analysisVersion=' + ((state.result && state.result.analysisVersion) || 'not-provided'),
        'generatedAt=' + ((state.result && state.result.generatedAt) || '(empty)'),
        'edgeFunctionVersion=' + ((state.result && state.result.edgeFunctionVersion) || 'not-provided'),
        'timeoutMsUsed=' + ((state.result && state.result.timeoutMsUsed != null) ? state.result.timeoutMsUsed : 'not-provided'),
      ].join('\n');
    }
    if (!value) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value);
      }
    } catch (e) {}
  }

  function shouldOpenDebugDetails() {
    if (isSpeciesPredictionDebugEnabled()) return true;
    try {
      var params = new URLSearchParams(window.location.search || '');
      if (params.get('speciesPredictionDebug') === '1') return true;
      if (window.localStorage.getItem('speciesPrediction.debugPanel') === '1') return true;
    } catch (e) {}
    return false;
  }

  function formatJson(value) {
    try {
      return JSON.stringify(value == null ? null : value, null, 2);
    } catch (e) {
      return String(value == null ? '' : value);
    }
  }

  function cloneResult(result) {
    try {
      return JSON.parse(JSON.stringify(result));
    } catch (e) {
      return result;
    }
  }

  function publishPanelState(result, preferredPoints) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'SPECIES_PREDICTION_PANEL_STATE',
          speciesName: result && result.speciesName ? result.speciesName : state.speciesName || '',
          speciesKey: result && result.speciesKey ? result.speciesKey : state.speciesKey || '',
          scope: state.scope,
          generatedAt: result && result.generatedAt ? result.generatedAt : '',
          analysisVersion: result && result.analysisVersion ? result.analysisVersion : '',
          insightSummary: result && result.insightSummary ? result.insightSummary : '',
          externalPressureScore: result ? result.externalPressureScore : null,
          countryScores: result && result.countryScores ? result.countryScores : null,
          topPredictedPoints: Array.isArray(preferredPoints) ? preferredPoints : [],
          sourceHealth: result && result.sourceHealth ? result.sourceHealth : null,
          foreignEvidence: result && Array.isArray(result.foreignEvidence) ? result.foreignEvidence : [],
          estoniaEvidence: result && result.estoniaEvidence ? result.estoniaEvidence : null,
          historicalEvidence: result && result.historicalEvidence ? result.historicalEvidence : null,
          runtimeMarker: runtimeInfo.visibleMarker,
        }, '*');
      }
    } catch (e) {}
  }

  function isSpeciesPredictionDebugEnabled() {
    try {
      return window.localStorage.getItem('estbirding.devMode') === '1';
    } catch (e) {
      return false;
    }
  }

  function readRuntimeInfo() {
    var payload = window.__speciesPredictionRuntime || {};
    var marker = String(payload.marker || '').trim();
    var panelScript = String(payload.panelScript || currentScriptSrc() || '').trim();
    var page = String(payload.mapPage || detectScope()).trim();
    return {
      mapPage: page || detectScope(),
      marker: marker || 'no-marker',
      panelScript: panelScript || 'unknown-script',
      visibleMarker: [page || detectScope(), marker || 'no-marker'].join(' | '),
    };
  }

  function currentScriptSrc() {
    try {
      return (document.currentScript && document.currentScript.src) || '';
    } catch (e) {
      return '';
    }
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
