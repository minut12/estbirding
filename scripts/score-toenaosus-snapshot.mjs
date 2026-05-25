// Re-scores a captured toenaosus_raport snapshot (the envelope produced by the
// "Kopeeri JSON" button on the Tõenäosus tab) using a proposed new probability
// formula and prints a comparison table.
//
// Read-only validation tool. Does NOT touch n8n, Supabase, or any production
// code. Pure stdlib, no dependencies.
//
// Usage:
//   node scripts/score-toenaosus-snapshot.mjs <path>
//   cat snapshot.json | node scripts/score-toenaosus-snapshot.mjs

import { readFile } from 'node:fs/promises';
import process from 'node:process';

// ─── Tunable formula constants ──────────────────────────────────────────────
// Tweak these to iterate on the scoring math. Nothing else in the script
// should need to change.

const TIER_BASE = { rare: 18, super: 12, mega: 6 };
const TIER_BASE_DEFAULT = 12;

const COUNT_K = 15;        // hill midpoint
const COUNT_EXP = 1.5;     // hill steepness
const COUNT_WEIGHT = 25;

const DISTANCE_LAMBDA_KM = 350;   // exp(-d / lambda)
const DISTANCE_WEIGHT = 25;
const DISTANCE_DEFAULT_KM = 9999;

const SEASON_SIGNAL = 0.5;        // hardcoded neutral fallback for validation
const SEASON_WEIGHT = 25;

const COUNTRY_WEIGHT = { LV: 10, FI: 10, LT: 8, SE: 7, PL: 5, RU: 4, BY: 3, EE: 10 };
const ADJACENCY_DEFAULT = 2;

const CORRIDOR_WEIGHT = 7;

const SCORE_MIN = 5;
const SCORE_MAX = 95;

// Ground-truth: species known to have actually arrived in Estonia during the
// snapshot window. Marked with ★ in the table and tracked separately in the
// summary so we can see if the new formula lifts them.
const GROUND_TRUTH_ARRIVALS = new Set([
  'Netta rufina',         // Punanokk-vart — arrived 24.05
  'Ficedula albicollis',  // Kaelus-kärbsenäpp — arrived 21.05
  'Phalaropus lobatus',   // Veetallaja — arrived 24.05
  'Egretta garzetta',     // Väike-valgehaigur — arrived 18-21.05 (NOT in candidate list)
]);

// ─── Scoring ────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function tierBase(level) {
  if (level && Object.prototype.hasOwnProperty.call(TIER_BASE, level)) {
    return TIER_BASE[level];
  }
  return TIER_BASE_DEFAULT;
}

function countSignal(n) {
  const N = Math.max(0, Number(n) || 0);
  const num = Math.pow(N, COUNT_EXP);
  const den = num + Math.pow(COUNT_K, COUNT_EXP);
  return den === 0 ? 0 : num / den;
}

function distanceSignal(d) {
  const D = Number.isFinite(d) ? d : DISTANCE_DEFAULT_KM;
  return Math.exp(-D / DISTANCE_LAMBDA_KM);
}

function adjacencyBonus(neighborBreakdown) {
  if (!Array.isArray(neighborBreakdown) || neighborBreakdown.length === 0) {
    return ADJACENCY_DEFAULT;
  }
  let best = ADJACENCY_DEFAULT;
  for (const b of neighborBreakdown) {
    const cc = b && typeof b.country_code === 'string' ? b.country_code : '';
    const w = Object.prototype.hasOwnProperty.call(COUNTRY_WEIGHT, cc)
      ? COUNTRY_WEIGHT[cc]
      : ADJACENCY_DEFAULT;
    if (w > best) best = w;
  }
  return best;
}

function corridorSignal(item) {
  const v = item?.probability_factors?.corridor_factor;
  return Number.isFinite(v) ? v : 0;
}

function scoreItem(item) {
  const tier = tierBase(item.rarity_level);
  const cSig = countSignal(item.total_neighbor_obs_30d);
  const dSig = distanceSignal(item.distance_to_ee_km);
  const sSig = SEASON_SIGNAL;
  const adj = adjacencyBonus(item.neighbor_breakdown);
  const corr = corridorSignal(item);

  const raw =
    tier +
    COUNT_WEIGHT * cSig +
    DISTANCE_WEIGHT * dSig +
    SEASON_WEIGHT * sSig +
    adj +
    CORRIDOR_WEIGHT * corr;

  const clamped = clamp(raw, SCORE_MIN, SCORE_MAX);
  return {
    newProb: Math.round(clamped),
    parts: {
      T: tier,
      C: COUNT_WEIGHT * cSig,
      D: DISTANCE_WEIGHT * dSig,
      S: SEASON_WEIGHT * sSig,
      A: adj,
      R: CORRIDOR_WEIGHT * corr,
      raw,
    },
  };
}

// ─── I/O ────────────────────────────────────────────────────────────────────

function usage() {
  process.stderr.write(
    [
      'Usage:',
      '  node scripts/score-toenaosus-snapshot.mjs <path-to-snapshot.json>',
      '  cat snapshot.json | node scripts/score-toenaosus-snapshot.mjs',
      '',
      'Re-scores a captured toenaosus_raport snapshot using a proposed new',
      'probability formula and prints a comparison table.',
      '',
    ].join('\n'),
  );
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function loadInput() {
  const arg = process.argv[2];
  if (arg) {
    try {
      return await readFile(arg, 'utf8');
    } catch (err) {
      process.stderr.write(`Could not read file '${arg}': ${err.message}\n`);
      process.exit(1);
    }
  }
  if (process.stdin.isTTY) {
    usage();
    process.exit(1);
  }
  return await readStdin();
}

// ─── Table formatting ───────────────────────────────────────────────────────

function padR(s, n) {
  s = String(s ?? '');
  if (s.length === n) return s;
  if (s.length > n) return s.slice(0, Math.max(0, n - 1)) + '…';
  return s + ' '.repeat(n - s.length);
}
function padL(s, n) {
  s = String(s ?? '');
  if (s.length >= n) return s;
  return ' '.repeat(n - s.length) + s;
}
function signed(n) {
  const r = Math.round(n);
  return (r > 0 ? '+' : '') + r;
}

const COLS = {
  star: 2,
  species: 26,
  tier: 6,
  old: 5,
  neu: 5,
  delta: 5,
  T: 4,
  C: 4,
  D: 4,
  A: 4,
  notes: 20,
};

function header() {
  return [
    padR('', COLS.star),
    padR('Species', COLS.species),
    padR('Tier', COLS.tier),
    padL('Old%', COLS.old),
    padL('New%', COLS.neu),
    padL('Δ', COLS.delta),
    padL('T', COLS.T),
    padL('C', COLS.C),
    padL('D', COLS.D),
    padL('A', COLS.A),
    padR(' Notes', COLS.notes + 1),
  ].join(' ');
}

function row({ star, species, tier, oldPct, newPct, parts, notes }) {
  return [
    padR(star ? '★' : '', COLS.star),
    padR(species, COLS.species),
    padR(tier ?? '', COLS.tier),
    padL(oldPct ?? '—', COLS.old),
    padL(newPct, COLS.neu),
    padL(signed(newPct - (oldPct ?? newPct)), COLS.delta),
    padL(Math.round(parts.T), COLS.T),
    padL(Math.round(parts.C), COLS.C),
    padL(Math.round(parts.D), COLS.D),
    padL(Math.round(parts.A), COLS.A),
    ' ' + padR(notes ?? '', COLS.notes),
  ].join(' ');
}

// ─── Main ───────────────────────────────────────────────────────────────────

const raw = await loadInput();

if (!raw || raw.trim() === '') {
  usage();
  process.exit(1);
}

let snapshot;
try {
  snapshot = JSON.parse(raw);
} catch (err) {
  process.stderr.write(`Invalid JSON input: ${err.message}\n`);
  process.exit(1);
}

const items = Array.isArray(snapshot?.items) ? snapshot.items : null;
if (!items || items.length === 0) {
  process.stderr.write('no items in snapshot\n');
  process.exit(1);
}

const scored = items.map((item) => {
  const { newProb, parts } = scoreItem(item);
  const oldPct = Number.isFinite(item.ee_probability_pct) ? item.ee_probability_pct : null;
  const notesParts = [];
  if (!Number.isFinite(item.distance_to_ee_km)) notesParts.push('no dist');
  if (!Number.isFinite(item.total_neighbor_obs_30d)) notesParts.push('no count');
  if (!Array.isArray(item.neighbor_breakdown) || item.neighbor_breakdown.length === 0) {
    notesParts.push('no neighbors');
  }
  return {
    species_et: item.species_et || '(unknown)',
    species_lat: item.species_lat || '',
    tier: item.rarity_level || '',
    oldPct,
    newPct: newProb,
    delta: oldPct == null ? 0 : newProb - oldPct,
    parts,
    star: GROUND_TRUTH_ARRIVALS.has(item.species_lat),
    notes: notesParts.join(', '),
  };
});

scored.sort((a, b) => b.newPct - a.newPct);

console.log(header());
console.log('-'.repeat(header().length));
for (const r of scored) {
  console.log(
    row({
      star: r.star,
      species: r.species_et,
      tier: r.tier,
      oldPct: r.oldPct,
      newPct: r.newPct,
      parts: r.parts,
      notes: r.notes,
    }),
  );
}

// ─── Summary ────────────────────────────────────────────────────────────────

const withDelta = scored.filter((r) => r.oldPct != null);
const mean = (arr) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);

const deltas = withDelta.map((r) => r.delta);
const meanDelta = mean(deltas);

const gain = withDelta.reduce((best, r) => (best == null || r.delta > best.delta ? r : best), null);
const lossCandidates = withDelta.filter((r) => r.delta < 0);
const loss = lossCandidates.reduce(
  (worst, r) => (worst == null || r.delta < worst.delta ? r : worst),
  null,
);

const groundTruthSeen = scored.filter((r) => r.star);
const groundTruthMissing = [...GROUND_TRUTH_ARRIVALS].filter(
  (lat) => !scored.some((r) => r.species_lat === lat),
);
const gtDeltas = groundTruthSeen.filter((r) => r.oldPct != null).map((r) => r.delta);
const otherDeltas = withDelta.filter((r) => !r.star).map((r) => r.delta);

console.log('');
console.log('SUMMARY');
console.log(`  Candidates:                  ${scored.length}`);
console.log(`  Mean Δ:                      ${signed(meanDelta)}`);
console.log(
  `  Largest gain:                ${gain ? `${gain.species_et} (${signed(gain.delta)})` : 'n/a'}`,
);
console.log(
  `  Largest loss:                ${loss ? `${loss.species_et} (${signed(loss.delta)})` : 'none lifted'}`,
);
console.log(
  `  Ground-truth species seen:   ${groundTruthSeen.length} of ${GROUND_TRUTH_ARRIVALS.size}` +
    (groundTruthMissing.length > 0 ? `   (${groundTruthMissing.join(', ')} missing from upstream)` : ''),
);
console.log(`  Ground-truth mean Δ:         ${gtDeltas.length === 0 ? 'n/a' : signed(mean(gtDeltas))}`);
console.log(`  Other candidates mean Δ:     ${otherDeltas.length === 0 ? 'n/a' : signed(mean(otherDeltas))}`);
console.log('');
console.log(
  '  Legend: T = tier_base, C = 25·count_signal, D = 25·distance_signal, A = adjacency_bonus.',
);
console.log(
  `  Constants omitted from per-row display: S = ${SEASON_WEIGHT * SEASON_SIGNAL} (season, fixed), R = corridor·${CORRIDOR_WEIGHT} (currently 0).`,
);
