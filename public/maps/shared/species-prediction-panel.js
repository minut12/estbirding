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
  var debugWrap = null;
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
    statusLine.textContent = getStatusText();
    modeLine.textContent = formatMode(state.settings);
    if (debugWrap) debugWrap.open = shouldOpenDebugDetails();
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
    var warnings = normalizeStringArray(result.warnings);
    var consistencyChecks = result.consistencyChecks || null;
    var preferredPoints = Array.isArray(result.topPredictedPoints) ? result.topPredictedPoints : [];
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
    html += renderStateCard('spp-state-success', 'Prediction complete', 'Rendering the latest backend result for this species.');
    if (summaryText) {
      html += '<div class="spp-card spp-summary"><h4>Insight summary</h4><p class="spp-summary-text">' + escapeHtml(summaryText) + '</p></div>';
    }
    if (confidenceNote) {
      html += '<div class="spp-card"><div class="spp-confidence-note"><h5>Confidence note</h5><p>' + escapeHtml(confidenceNote) + '</p></div></div>';
    }
    html += '<div class="spp-card"><h4>Route fit</h4><div class="spp-grid">' +
      metricCell('External pressure', result.externalPressureScore) +
      metricCell('Spring fit', result.springFitScore) +
      metricCell('Wind support', result.windSupportScore) +
      metricCell('Missed risk', result.alreadyMissedRisk) +
      metricCell('Route vector', result.routeVector) +
      metricCell('Best entry zone', result.bestEntryZone) +
      '</div></div>';
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
    html += '<div class="spp-card"><h4>Country scores</h4><div class="spp-country">' +
      scoreCell('Latvia', result.countryScores && result.countryScores.latvia) +
      scoreCell('Lithuania', result.countryScores && result.countryScores.lithuania) +
      scoreCell('Belarus', result.countryScores && result.countryScores.belarus) +
      scoreCell('Poland', result.countryScores && result.countryScores.poland) +
      scoreCell('Russia', result.countryScores && result.countryScores.russia) +
      (result.countryScores && result.countryScores.finlandContextOnly != null ? scoreCell('Finland context only', result.countryScores.finlandContextOnly) : '') +
      '</div></div>';
    html += '<div class="spp-card"><h4>Top predicted points</h4><div class="spp-points">';
    if (!preferredPoints.length) {
      html += '<div class="spp-point"><div class="spp-point-reason-text">No precise hotspot results returned.</div></div>';
    } else {
      preferredPoints.forEach(function (point) {
        html += renderPredictedPoint(point);
      });
    }
    html += '</div></div>';
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
      debugItem('Analysis version', result.analysisVersion || '(empty)'),
      debugItem('Generated at', result.generatedAt || '(empty)'),
      debugItem('Stage', result.stage || '(empty)'),
      debugItem('Elapsed ms', result.elapsedMs != null ? String(result.elapsedMs) : '(empty)'),
      debugItem('Timeout budget (ms)', result.timeoutMsUsed != null ? String(result.timeoutMsUsed) : '(empty)'),
      debugItem('Edge function version', result.edgeFunctionVersion || '(empty)'),
      debugItem('Warning count', String(normalizeStringArray(result.warnings).length)),
      debugItem('Top points', String(points.length)),
    ].join('');
    debugBody.innerHTML = '' +
      '<div class="spp-debug-copy">' +
      '  <button type="button" class="btn secondary" data-copy-target="result-json">Copy result JSON</button>' +
      '  <button type="button" class="btn secondary" data-copy-target="summary">Copy summary</button>' +
      '</div>' +
      '<div class="spp-debug-grid">' + debugItems + '</div>' +
      '<pre class="spp-debug-pre">' + escapeHtml(formatJson(state.result)) + '</pre>';
  }

  function renderPredictedPoint(point) {
    var confidencePct = formatConfidence(point && point.confidence);
    var fillPct = String(clampConfidencePercent(point && point.confidence)) + '%';
    return '' +
      '<div class="spp-point">' +
      '  <div class="spp-point-head">' +
      '    <div class="spp-point-title">' +
      '      <div class="spp-point-rank">#' + escapeHtml(point && point.rank) + '</div>' +
      '      <div>' +
      '        <div class="spp-point-name">' + escapeHtml(point && point.name) + '</div>' +
      '        <div class="spp-point-place">' + escapeHtml(point && point.countyOrParish ? point.countyOrParish : 'County/parish unavailable') + '</div>' +
      '        <div class="spp-point-place">' + escapeHtml(formatCoords(point && point.lat, point && point.lon)) + '</div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="spp-confidence">' +
      '      <div class="spp-confidence-value">' + escapeHtml(confidencePct) + '</div>' +
      '      <div class="spp-confidence-bar"><div class="spp-confidence-fill" style="width:' + escapeHtml(fillPct) + '"></div></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="spp-point-grid">' +
      metricCell('ETA', point && point.eta) +
      metricCell('Radius', appendKm(point && point.searchRadiusKm)) +
      metricCell('Habitat', point && point.habitatCue) +
      metricCell('Confidence', confidencePct) +
      '</div>' +
      '  <div class="spp-point-reason">' +
      '    <div class="spp-point-reason-label">Reason</div>' +
      '    <div class="spp-point-reason-text">' + escapeHtml(point && point.reason) + '</div>' +
      '  </div>' +
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
    return String(Math.round(n * 100)) + '%';
  }

  function clampConfidencePercent(value) {
    var n = Number(value);
    if (!isFiniteNumber(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n * 100)));
  }

  function appendKm(value) {
    var text = value == null || value === '' ? 'Unavailable' : String(value);
    return text === 'Unavailable' ? text : text + ' km';
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
        'analysisVersion=' + ((state.result && state.result.analysisVersion) || '(empty)'),
        'generatedAt=' + ((state.result && state.result.generatedAt) || '(empty)'),
        'edgeFunctionVersion=' + ((state.result && state.result.edgeFunctionVersion) || '(empty)'),
        'timeoutMsUsed=' + ((state.result && state.result.timeoutMsUsed != null) ? state.result.timeoutMsUsed : '(empty)'),
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
