// compute-ennustus
// redeploy-marker: v2 · 2026-07-06 · fix HISTORY predicate gbif_key→species_name
//
// Server-side port of the live Tõenäosus composite scorer
// (`calculateProbabilities` + the head of `computeProbForSpecies` in
// public/maps/linnuliigid/index.html). Computes per-species probability and
// writes RAW scores to public.ennustus_cache so the iframe can become a
// read-only consumer in Phase D.
//
// This is a VERBATIM numeric port. Constants, weights, log1p terms, floors,
// caps, percentile indices, padding and branches match the reference JS
// exactly. The only intentional divergences are the five accepted axes:
//   1. FRESHNESS scores every cell (all elurikkus obs), not one marker cell.
//   2. SEASON drops GBIF Jan-1 (month=1 & day=1) from date-binned paths only.
//   3. Five feeder-absent species have 0 freshness rows -> FRESHNESS = 0.
//   4. No eBird freshness (Phase B reverted).
//   5. HISTORY = gbif_occurrences only (no elurikkus history fold-in).
// See decisions/2026-07-05-compute-ennustus-*.md (binding).
//
// Auth: X-Webhook-Secret header against VAATLUSTE_WEBHOOK_SECRET (same secret
// as insert-toenaosus-raport / get-news-untranslated-v2). Scheduling is NOT
// part of this function (Phase C step 3 wires n8n).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// Ported helpers (verbatim from public/maps/linnuliigid/index.html)
// ============================================================================

// Server-only: Jan-1 predicate for the path-selective exclusion (gotcha #4).
function isJan1(d: any): boolean {
  return d.getMonth() === 0 && d.getDate() === 1;
}

// --- date primitives (index.html 11702-11720) ---
function parseProbDate(dateStr: any): Date | null {
  if (!dateStr) return null;
  var s = String(dateStr).trim();
  // Try "YYYY-MM-DD" manual parse first (avoids timezone issues)
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // Try "DD.MM.YYYY" (Estonian format)
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  // Try standard parse
  var d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900) return d;
  return null;
}

function getDayOfYear(date: any): number {
  var start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((+date - +start) / 86400000);
}

// --- _toDay: noon-anchored day bucketing for freshness (index.html 1381-1393) ---
function _toDay(s: any): number | null {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0).getTime();
  }
  m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) {
    return new Date(+m[3], +m[2] - 1, +m[1], 12, 0, 0, 0).getTime();
  }
  return null;
}

// --- season window from data (index.html 11757-11800) ---
// PORT CHANGE (gotcha #4): skip isJan1 records when building the DoY set.
// Everything else identical (p10/p90 indices, +-7 pad, <5 -> +-21 fallback).
function calculateSeasonFromData(occurrences: any[]): any {
  var daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function monthDayToDoy(m: number, d: number) {
    var doy = 0;
    for (var i = 1; i < m; i++) doy += daysInMonth[i];
    return doy + d;
  }
  function doyToDate(year: number, doy: number) {
    var d = new Date(year, 0, 1);
    d.setDate(d.getDate() + doy - 1);
    return d;
  }

  var doys: number[] = [];
  for (var i = 0; i < occurrences.length; i++) {
    var d = parseProbDate(occurrences[i].date);
    if (d && !isJan1(d)) doys.push(getDayOfYear(d)); // PORT CHANGE: drop GBIF Jan-1
  }

  if (doys.length < 5) {
    // Too few records -- fall back to +-21 days from now
    var now = new Date();
    var start = new Date(now); start.setDate(start.getDate() - 21);
    var end = new Date(now); end.setDate(end.getDate() + 21);
    var fmt = function (dd: Date) { return dd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
    return { start: start, end: end, label: fmt(start) + ' – ' + fmt(end) };
  }

  doys.sort(function (a: number, b: number) { return a - b; });

  var p10 = doys[Math.floor(doys.length * 0.10)];
  var p90 = doys[Math.floor(doys.length * 0.90)];

  // Pad by 7 days
  p10 = Math.max(1, p10 - 7);
  p90 = Math.min(365, p90 + 7);

  var year = new Date().getFullYear();
  var startDate = doyToDate(year, p10);
  var endDate = doyToDate(year, p90);

  var fmt2 = function (dd: Date) { return dd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  return { start: startDate, end: endDate, label: fmt2(startDate) + ' – ' + fmt2(endDate) };
}

// --- formatSeasonWindow (index.html 11747-11754) : +-45 fallback label ---
function formatSeasonWindow(windowDays?: any): string {
  windowDays = windowDays || 21;
  var now = new Date();
  var start = new Date(now); start.setDate(start.getDate() - windowDays);
  var end = new Date(now); end.setDate(end.getDate() + windowDays);
  var fmt = function (d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  return fmt(start) + ' – ' + fmt(end);
}

// --- season membership (index.html 11722-11745) ---
function isInSeasonWindow(occDateStr: any, windowDays?: any): boolean {
  windowDays = windowDays || 21;
  var occ = parseProbDate(occDateStr);
  if (!occ) return false;
  var now = new Date();
  var nowDoy = getDayOfYear(now);
  var occDoy = getDayOfYear(occ);
  var diff = Math.abs(nowDoy - occDoy);
  return Math.min(diff, 365 - diff) <= windowDays;
}

function isInSeasonRange(occDateStr: any, seasonStart: any, seasonEnd: any): boolean {
  var occ = parseProbDate(occDateStr);
  if (!occ) return false;
  var occDoy = getDayOfYear(occ);
  var startDoy = getDayOfYear(seasonStart);
  var endDoy = getDayOfYear(seasonEnd);
  if (startDoy <= endDoy) {
    return occDoy >= startDoy && occDoy <= endDoy;
  }
  // Wraps around year boundary
  return occDoy >= startDoy || occDoy <= endDoy;
}

// --- period template: fixed 14-day slices (index.html 11864-11888) ---
function getSeasonPeriods(seasonStart: any, seasonEnd: any): any[] {
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // If no season dates provided, fall back to +-21 days
  if (!seasonStart || !seasonEnd) {
    var now = new Date();
    seasonStart = new Date(now); seasonStart.setDate(seasonStart.getDate() - 21);
    seasonEnd = new Date(now); seasonEnd.setDate(seasonEnd.getDate() + 21);
  }
  var periods: any[] = [];
  var current = new Date(seasonStart);
  while (current < seasonEnd) {
    var periodEnd = new Date(current.getTime() + 14 * 86400000);
    if (periodEnd > seasonEnd) periodEnd = new Date(seasonEnd);
    // Skip very short tail periods (<3 days)
    if (+periodEnd - +current < 3 * 86400000 && periods.length > 0) break;
    periods.push({
      start: new Date(current),
      end: new Date(periodEnd),
      label: String(current.getDate()).padStart(2, '0') + ' ' + months[current.getMonth()] + '–' + String(periodEnd.getDate()).padStart(2, '0') + ' ' + months[periodEnd.getMonth()],
      count: 0,
    });
    current = periodEnd;
  }
  return periods;
}

// --- grid (index.html 11812-11861) ---
const ESTONIA_BOUNDS = { minLat: 57.50, maxLat: 59.75, minLon: 21.50, maxLon: 28.25 };

// Simple land mask -- only skip cells that are definitely deep open sea
function isLikelyLand(lat: number, lon: number): boolean {
  if (lat > 59.85) return false;    // well north of Estonia
  if (lat < 57.45) return false;    // south of Latvia border
  if (lon < 21.3) return false;     // far west of Saaremaa
  if (lon > 28.3) return false;     // east of Narva
  // Deep Baltic west of Saaremaa (not coastal)
  if (lon < 21.8 && lat < 57.9) return false;
  return true;  // everything else is potentially land or coastal
}

function buildEstoniaGrid(occs: any[], gridSize?: any): any[] {
  gridSize = gridSize || 0.15;
  var cells: any = {};
  var precision = gridSize < 0.1 ? 3 : 2;

  // Create cells covering all of Estonia
  for (var lat = ESTONIA_BOUNDS.minLat; lat < ESTONIA_BOUNDS.maxLat; lat += gridSize) {
    for (var lon = ESTONIA_BOUNDS.minLon; lon < ESTONIA_BOUNDS.maxLon; lon += gridSize) {
      var gLat = Math.floor(lat / gridSize) * gridSize;
      var gLon = Math.floor(lon / gridSize) * gridSize;
      var cLat = gLat + gridSize / 2;
      var cLon = gLon + gridSize / 2;
      if (!isLikelyLand(cLat, cLon)) continue;
      var key = gLat.toFixed(precision) + '|' + gLon.toFixed(precision);
      if (!cells[key]) {
        cells[key] = { latMin: gLat, latMax: gLat + gridSize, lonMin: gLon, lonMax: gLon + gridSize, occurrences: [], gbifCount: 0, gbifCountTotal: 0, eluCount: 0, centerLat: cLat, centerLon: cLon };
      }
    }
  }

  // Assign occurrences to cells
  occs.forEach(function (o: any) {
    var gLat = Math.floor(o.lat / gridSize) * gridSize;
    var gLon = Math.floor(o.lon / gridSize) * gridSize;
    var key = gLat.toFixed(precision) + '|' + gLon.toFixed(precision);
    if (!cells[key]) {
      cells[key] = { latMin: gLat, latMax: gLat + gridSize, lonMin: gLon, lonMax: gLon + gridSize, occurrences: [], gbifCount: 0, gbifCountTotal: 0, eluCount: 0, centerLat: gLat + gridSize / 2, centerLon: gLon + gridSize / 2 };
    }
    cells[key].occurrences.push(o);
    var _src = String(o.source || '').toLowerCase();
    if (_src === 'gbif') cells[key].gbifCount++;
    else if (_src.indexOf('elurikkus') !== -1) cells[key].eluCount++;
  });

  return Object.values(cells);
}

// --- dedup (index.html 11802-11810) ---
function deduplicateOccurrences(occs: any[]): any[] {
  var seen: any = {};
  return occs.filter(function (o: any) {
    var key = (o.date ? String(o.date).substring(0, 10) : 'nodate') + '|' + Math.round(o.lat * 200) + '|' + Math.round(o.lon * 200);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

// ============================================================================
// Composite scorer (index.html 11969-12231) with the two server substitutions:
//   (1) recentEluLocs is passed in (replaces the localStorage/points assembly).
//   (2) eBird removed (getEbirdCellStats deleted; freshEbirdCount = 0).
// flagTopScoreCell (render-only) is skipped. Everything else verbatim.
// ============================================================================
function calculateProbabilities(gridCells: any[], seasonal: any[], allOccs: any[], recentEluLocs: any[], speciesName: any, cellSize: any, seasonInfo: any): any[] {
  cellSize = cellSize || 0.15;

  // === Composite scoring (rebuilt 2026-04-14) ===
  var HISTORY_WEIGHT = 60;
  var FRESHNESS_WEIGHT = 35;
  var SEASON_WEIGHT = 5;

  // --- A: Per-cell history density (log-normalized against species' own max) ---
  var maxCellOcc = 0;
  for (var _ai = 0; _ai < gridCells.length; _ai++) {
    var _aoLen = (gridCells[_ai].occurrences || []).length;
    if (_aoLen > maxCellOcc) maxCellOcc = _aoLen;
  }

  // --- B: Confidence dampening based on total data volume ---
  // 500+ records -> 1.0, 50 -> ~0.63, 5 -> ~0.29, floor at 0.3
  // NOTE (gotcha #4): totalRecords is the raw allOccs count -- NOT Jan-1 excluded.
  var totalRecords = (allOccs || []).length;
  var confidence = Math.max(0.3, Math.min(1.0, Math.log1p(totalRecords) / Math.log1p(500)));

  // --- C: Season centrality per period ---
  var periodTemplate = getSeasonPeriods(seasonInfo && seasonInfo.start, seasonInfo && seasonInfo.end);
  // Pre-count total occurrences per period template slot across ALL cells.
  // PORT CHANGE (gotcha #4): skip isJan1 -- this is a date-binned path.
  var periodTotalCounts: number[] = [];
  for (var _ci = 0; _ci < periodTemplate.length; _ci++) periodTotalCounts.push(0);
  for (var _oi = 0; _oi < (allOccs || []).length; _oi++) {
    var _od = parseProbDate((allOccs[_oi] || {}).date || (allOccs[_oi] || {}).eventDate);
    if (!_od) continue;
    if (isJan1(_od)) continue; // PORT CHANGE: drop GBIF Jan-1 from centrality
    var _odoy = getDayOfYear(_od);
    for (var _pi = 0; _pi < periodTemplate.length; _pi++) {
      var _ps = getDayOfYear(periodTemplate[_pi].start);
      var _pe = getDayOfYear(periodTemplate[_pi].end);
      if (_odoy >= _ps && _odoy < _pe) { periodTotalCounts[_pi]++; break; }
    }
  }
  var maxPeriodTotal = Math.max.apply(null, periodTotalCounts.concat([1]));
  // centrality: peak period = 1.0, edge = 0.3+
  var periodCentrality: number[] = [];
  for (var _pj = 0; _pj < periodTemplate.length; _pj++) {
    periodCentrality.push(maxPeriodTotal > 0
      ? 0.3 + 0.7 * (periodTotalCounts[_pj] / maxPeriodTotal)
      : 0.3);
  }

  // --- D: Freshness input is passed in (recentEluLocs), built from
  //         elurikkus_observations. Client localStorage/points assembly deleted.

  // --- E: Score each cell, each period ---
  var nowMs = Date.now();

  gridCells.forEach(function (cell: any, cellIdx: number) {
    if (!Number.isFinite(cell.centerLat)) {
      cell.centerLat = (cell.latMin + cell.latMax) / 2;
      cell.centerLon = (cell.lonMin + cell.lonMax) / 2;
    }
    if (!Number.isFinite(cell.gbifCount)) cell.gbifCount = 0;

    // Cell-level history pct (0..1): log-normalized against species max.
    // NOTE (gotcha #4): cellOccCount is the RAW cell occurrence count -- NOT Jan-1 excluded.
    var cellOccCount = (cell.occurrences || []).length;
    var histPct = maxCellOcc > 0 ? Math.log1p(cellOccCount) / Math.log1p(maxCellOcc) : 0;

    // Cell-level freshness: combines best recency with density of recent obs.
    var freshPct = 0;
    var markerInCell = false;
    var cellRecentCount = 0;
    var baseFresh = 0;
    for (var _ri = 0; _ri < recentEluLocs.length; _ri++) {
      var _rl = recentEluLocs[_ri];
      if (_rl.lat >= cell.latMin && _rl.lat < cell.latMax &&
        _rl.lon >= cell.lonMin && _rl.lon < cell.lonMax) {
        markerInCell = true;
        cellRecentCount++;
        var _fp = Math.max(0, 1 - _rl.ageDays / 7);
        if (_fp > baseFresh) baseFresh = _fp;
      }
    }
    // Capture eElu-only count (for parity with popup breakdown)
    cell.freshEluCount = cellRecentCount;

    // PORT CHANGE (axis #4): eBird removed (Phase B reverted).
    cell.freshEbirdCount = 0;

    if (cellRecentCount > 0 && baseFresh > 0) {
      // Density multiplier: 1 obs -> 1.0, 3 -> 1.33, 9 -> 1.69, capped via min(1) on result
      var densityMul = 1 + 0.3 * Math.log1p(cellRecentCount);
      freshPct = Math.min(1, baseFresh * densityMul);
    }
    cell.freshRecentCount = cellRecentCount;
    cell.freshBaseRecency = baseFresh;
    cell.freshDensityMul = (cellRecentCount > 0 && baseFresh > 0) ? (1 + 0.3 * Math.log1p(cellRecentCount)) : 1;

    // Count this cell's obs per period for period-local history.
    // PORT CHANGE (gotcha #4): skip isJan1 -- date-binned path.
    var cellPeriodCounts: number[] = [];
    for (var _cpi = 0; _cpi < periodTemplate.length; _cpi++) cellPeriodCounts.push(0);
    for (var _coi = 0; _coi < (cell.occurrences || []).length; _coi++) {
      var _cod = parseProbDate((cell.occurrences[_coi] || {}).date || (cell.occurrences[_coi] || {}).eventDate);
      if (!_cod) continue;
      if (isJan1(_cod)) continue; // PORT CHANGE: drop GBIF Jan-1 from the 0.4 blend term
      var _codoy = getDayOfYear(_cod);
      for (var _cpj = 0; _cpj < periodTemplate.length; _cpj++) {
        var _cps = getDayOfYear(periodTemplate[_cpj].start);
        var _cpe = getDayOfYear(periodTemplate[_cpj].end);
        if (_codoy >= _cps && _codoy < _cpe) { cellPeriodCounts[_cpj]++; break; }
      }
    }
    var maxCellPeriod = Math.max.apply(null, cellPeriodCounts.concat([1]));

    // Build periods for this cell
    var cellPeriods: any[] = [];
    for (var pk = 0; pk < periodTemplate.length; pk++) {
      var central = periodCentrality[pk] || 0.3;
      var isCurrentPeriod = (nowMs >= periodTemplate[pk].start.getTime() && nowMs < periodTemplate[pk].end.getTime());

      // Period-local history: blend species-wide cell rank (60%) with period-specific density (40%)
      var localPeriodPct = maxCellPeriod > 0 ? cellPeriodCounts[pk] / maxCellPeriod : 0;
      var histBlended = 0.6 * histPct + 0.4 * localPeriodPct;

      // Freshness only applies to the current period
      var periodFresh = isCurrentPeriod ? freshPct : 0;

      // Composite: weighted sum x confidence
      var rawScore = (HISTORY_WEIGHT * histBlended +
        FRESHNESS_WEIGHT * periodFresh +
        SEASON_WEIGHT * central) * confidence;

      var score = Math.max(1, Math.min(95, Math.round(rawScore)));

      cellPeriods.push({
        label: periodTemplate[pk].label,
        start: periodTemplate[pk].start,
        end: periodTemplate[pk].end,
        count: cellPeriodCounts[pk],
        probability: score,
        isCurrent: isCurrentPeriod,
        obsCount: cellPeriodCounts[pk],
      });
    }

    cell.periods = cellPeriods;
    cell.markerInCell = markerInCell;
    cell.periodConfidence = confidence;

    // Headline probability: use current period if available, else max across periods
    var headlineProb = 1;
    for (var _hp = 0; _hp < cellPeriods.length; _hp++) {
      if (cellPeriods[_hp].isCurrent && cellPeriods[_hp].probability > 1) {
        headlineProb = cellPeriods[_hp].probability;
        break;
      }
    }
    if (headlineProb <= 1 && cellPeriods.length > 0) {
      headlineProb = Math.max.apply(null, cellPeriods.map(function (p: any) { return p.probability; }));
    }
    cell.probability = headlineProb;

    // Diagnostic fields -- use the current period's actual blended values
    var _cpIdx = -1;
    for (var _di = 0; _di < cellPeriods.length; _di++) { if (cellPeriods[_di].isCurrent) { _cpIdx = _di; break; } }
    var _diagHistBlended = _cpIdx >= 0 ? (0.6 * histPct + 0.4 * (maxCellPeriod > 0 ? cellPeriodCounts[_cpIdx] / maxCellPeriod : 0)) : histPct;
    var _diagFreshPct = _cpIdx >= 0 ? freshPct : 0;
    var _diagCentral = _cpIdx >= 0 ? (periodCentrality[_cpIdx] || 0.3) : (periodCentrality[0] || 0.3);
    cell.scoreHistory = Math.round(_diagHistBlended * HISTORY_WEIGHT * confidence);
    cell.scoreRecency = Math.round(_diagFreshPct * FRESHNESS_WEIGHT * confidence);
    cell.scoreSeason = Math.round(_diagCentral * SEASON_WEIGHT * confidence);
    cell.scoreHistoryGbif = cell.gbifCount;
    cell.scoreHistoryElu = cell.eluCount;
  });

  // flagTopScoreCell (index.html 12204) is render-only -> skipped server-side.

  return gridCells;
}

// ============================================================================
// Data access
// ============================================================================

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// HISTORY: all GBIF occurrences for the taxon key. PostgREST caps at 1000 rows
// per request, so page through until exhausted (page_cap ~3000/species).
async function fetchAllGbif(supabase: any, speciesName: string): Promise<any[]> {
  if (!speciesName) return [];
  const pageSize = 1000;
  let from = 0;
  const out: any[] = [];
  // Hard safety ceiling well above any real species' row count.
  for (let guard = 0; guard < 50; guard++) {
    const { data, error } = await supabase
      .from('gbif_occurrences')
      .select('lat,lon,observed_at')
      .eq('species_name', speciesName)
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error('gbif_occurrences read failed: ' + error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

// FRESHNESS: elurikkus obs in a rolling 7-day window (all cells, axis #1).
// SQL lower bound is a date-level superset; the exact rolling-ms membership is
// enforced in JS via _toDay, mirroring the client (index.html 12062-12067).
// SQL upper clamp (<= today) drops future-dated rows -- guards the A0 bug.
async function fetchFreshness(supabase: any, speciesName: string): Promise<any[]> {
  const nowD = new Date();
  const lowerStr = ymd(new Date(nowD.getTime() - 7 * 86400000));
  const upperStr = ymd(nowD);
  const { data, error } = await supabase
    .from('elurikkus_observations')
    .select('lat,lon,observed_at')
    .eq('species_name', speciesName)
    .not('lat', 'is', null)
    .not('lon', 'is', null)
    .gte('observed_at', lowerStr)
    .lte('observed_at', upperStr);
  if (error) throw new Error('elurikkus_observations read failed: ' + error.message);

  const _now = Date.now();
  const _7dMs = 7 * 24 * 60 * 60 * 1000;
  const recentEluLocs: any[] = [];
  for (const row of (data || [])) {
    const _lTs = _toDay(String(row.observed_at || ''));
    if (!_lTs || _lTs <= 0 || (_now - _lTs) > _7dMs) continue; // client 12065: rolling 7d
    if ((_now - _lTs) < 0) continue; // future-date guard (SQL already clamps)
    recentEluLocs.push({ lat: Number(row.lat), lon: Number(row.lon), ageDays: (_now - _lTs) / 86400000 });
  }
  return recentEluLocs;
}

// ============================================================================
// Per-species orchestration (port of computeProbForSpecies head, 12661-12928)
// ============================================================================

function exitRow(speciesName: string, reason: 'A' | 'B' | 'C'): any {
  return {
    species_name: speciesName,
    computed_at: Date.now(),
    score: 0,
    current_pct: null,
    cell_lat: null,
    cell_lon: null,
    season: null,
    no_data: true,
    exit_reason: reason,
    best_period_pct: null,
    best_period_label: null,
    updated_at: new Date().toISOString(),
  };
}

async function computeSpecies(supabase: any, speciesName: string, taxonKey: any): Promise<any> {
  // 1. HISTORY (allOccs) from GBIF, deduped (parity with client).
  const gbifRows = await fetchAllGbif(supabase, taxonKey);
  let allOccs = gbifRows.map((r: any) => ({
    lat: Number(r.lat),
    lon: Number(r.lon),
    date: String(r.observed_at || ''),
    source: 'gbif',
  }));
  allOccs = deduplicateOccurrences(allOccs);

  const computedAt = Date.now();

  // 2. Exit A -- no occurrences.
  if (!allOccs.length) return exitRow(speciesName, 'A');

  // 3. Season window (Jan-1-excluded DoY set). Exit B -- unreachable but kept for parity.
  let seasonInfo = calculateSeasonFromData(allOccs);
  if (!seasonInfo) return exitRow(speciesName, 'B');

  // 4. In-season subset, with the +-45-day fallback.
  let seasonal = allOccs.filter((o: any) => isInSeasonRange(o.date, seasonInfo.start, seasonInfo.end));
  if (seasonal.length === 0 && allOccs.length > 0) {
    seasonal = allOccs.filter((o: any) => isInSeasonWindow(o.date, 45));
    const now2 = new Date();
    const fb1 = new Date(now2); fb1.setDate(fb1.getDate() - 45);
    const fb2 = new Date(now2); fb2.setDate(fb2.getDate() + 45);
    seasonInfo = { start: fb1, end: fb2, label: formatSeasonWindow(45) };
  }
  if (seasonal.length === 0) return exitRow(speciesName, 'C');

  // 5. Cell size from GBIF volume (all history is GBIF here).
  const totalGbifRecords = allOccs.length;
  const probCellSize = totalGbifRecords > 500 ? 0.1 : totalGbifRecords > 100 ? 0.15 : 0.2;

  // 6. No synthetic marker injection (client 12846-12856 dropped -- axis #1).

  // 7. Grid from the SEASONAL subset.
  const gridCells = buildEstoniaGrid(seasonal, probCellSize);

  // 8. FRESHNESS input from elurikkus_observations.
  const recentEluLocs = await fetchFreshness(supabase, speciesName);

  // 9. Score. Grid holds seasonal occs; allOccs drives confidence + centrality (gotcha #5).
  const scored = calculateProbabilities(gridCells, seasonal, allOccs, recentEluLocs, speciesName, probCellSize, seasonInfo);

  // 10. topCell = simple max-probability sort (gotcha #6, NOT flagTopScoreCell).
  const topCell = scored.slice().sort((a: any, b: any) => b.probability - a.probability)[0];
  if (!topCell) return exitRow(speciesName, 'C');

  // 11. Cell center + raw score (cap 95).
  const cell_lat = (topCell.latMin + topCell.latMax) / 2;
  const cell_lon = (topCell.lonMin + topCell.lonMax) / 2;
  const score = topCell.probability;

  // 12. current_pct: current period's probability, else null (gotcha #2).
  let current_pct: number | null = null;
  if (topCell.periods) {
    for (let i = 0; i < topCell.periods.length; i++) {
      if (topCell.periods[i].isCurrent) { current_pct = topCell.periods[i].probability; break; }
    }
  }

  // 13. best_period: max-probability period (only if > 0).
  let best_period_pct: number | null = null;
  let best_period_label: string | null = null;
  if (topCell.periods && topCell.periods.length) {
    let bestP: any = null;
    for (let i = 0; i < topCell.periods.length; i++) {
      const p = topCell.periods[i];
      if (!bestP || (p.probability || 0) > (bestP.probability || 0)) bestP = p;
    }
    if (bestP && (bestP.probability || 0) > 0) {
      best_period_pct = bestP.probability;
      best_period_label = bestP.label;
    }
  }

  // 14. Result row (raw score only -- boosts stay render-side, gotcha #3).
  return {
    species_name: speciesName,
    computed_at: computedAt,
    score,
    current_pct,
    cell_lat,
    cell_lon,
    season: (seasonInfo && seasonInfo.label) || null,
    no_data: false,
    exit_reason: null,
    best_period_pct,
    best_period_label,
    updated_at: new Date().toISOString(),
  };
}

// ============================================================================
// HTTP handler -- one chunk of species, sequential, single upsert at the end.
// ============================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const expectedSecret = Deno.env.get('VAATLUSTE_WEBHOOK_SECRET');
  if (!expectedSecret) {
    return jsonResponse(500, { error: 'server_misconfigured', detail: 'VAATLUSTE_WEBHOOK_SECRET not set' });
  }
  if (req.headers.get('x-webhook-secret') !== expectedSecret) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const offset = Number.isFinite(Number(body.offset)) ? Math.max(0, Math.floor(Number(body.offset))) : 0;
  const limit = Number.isFinite(Number(body.limit)) ? Math.max(1, Math.floor(Number(body.limit))) : 25;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Deterministic species slice (diacritic-proof: GBIF keyed by integer taxon key).
  const { data: species, error: spErr } = await supabase
    .from('gbif_taxon_keys')
    .select('species_name,taxon_key')
    .order('species_name', { ascending: true })
    .range(offset, offset + limit - 1);
  if (spErr) {
    return jsonResponse(500, { error: 'species_read_failed', detail: spErr.message });
  }

  const slice = species || [];
  const exits = { A: 0, B: 0, C: 0, ok: 0 };
  const rows: any[] = [];

  // Sequential: release each species' occurrences before the next.
  for (const sp of slice) {
    const row = await computeSpecies(supabase, sp.species_name, sp.taxon_key);
    if (row.no_data) exits[row.exit_reason as 'A' | 'B' | 'C']++;
    else exits.ok++;
    rows.push(row);
  }

  if (rows.length) {
    const { error: upErr } = await supabase
      .from('ennustus_cache')
      .upsert(rows, { onConflict: 'species_name' });
    if (upErr) {
      return jsonResponse(500, { error: 'upsert_failed', detail: upErr.message });
    }
  }

  const processed = slice.length;
  const next_offset = offset + slice.length;
  const done = slice.length < limit;

  return jsonResponse(200, { processed, offset, limit, next_offset, done, exits });
});
