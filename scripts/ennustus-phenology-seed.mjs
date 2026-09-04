import { readFileSync, writeFileSync } from 'node:fs';
import { TextDecoder } from 'node:util';

// ---------------------------------------------------------------------------
// RFC 4180 CSV parser (standard-library only; handles quoted fields with commas)
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += ch;
        i++;
        continue;
      }
    }
    // not in quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      i++;
      if (ch === '\r' && i < text.length && text[i] === '\n') i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

function csvToRows(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const header = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    header.forEach((h, i) => obj[h.trim()] = (row[i] ?? '').trim());
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function nfc(s) { return s.normalize('NFC'); }
function isBlank(s) { return s === '' || s == null; }
const FLIGHT_CLASS_CRUISE = {
  passerine_nocturnal: 45,
  raptor_soaring: 35,
  wader: 60,
  waterbird: 65,
  seabird: 50,
  heron_stork: 40,
};
const ALLOWED_MODES = new Set(['spring_overshoot', 'autumn_drift', 'post_breeding_dispersal', 'winter_irruption', 'reverse_migration']);
const ALLOWED_FC = new Set(Object.keys(FLIGHT_CLASS_CRUISE));
const WINDOW_RE = /^\[2000-\d\d-\d\d,2000-\d\d-\d\d\]$/;

function sqlEscape(s) { return s.replace(/'/g, "''"); }

// ---------------------------------------------------------------------------
// Read inputs
// ---------------------------------------------------------------------------
const draftRaw = readFileSync('tmp/phenology_draft.csv', 'utf8');
const overrideRaw = readFileSync('tmp/phenology_overrides.csv', 'utf8');

const draftRows = csvToRows(draftRaw);
const overrideRows = csvToRows(overrideRaw);

// Build maps keyed by NFC-normalized scientific_name
const draftMap = new Map();
for (const r of draftRows) draftMap.set(nfc(r.scientific_name), r);
const overrideMap = new Map();
for (const r of overrideRows) overrideMap.set(nfc(r.scientific_name), r);

// Join validation
const draftKeys = new Set(draftMap.keys());
const overrideKeys = new Set(overrideMap.keys());
const joinErrors = [];
for (const k of draftKeys) {
  const cnt = overrideMap.has(k) ? 1 : 0;
  if (cnt === 0) joinErrors.push(`Draft row "${k}" has no override match`);
  else if (cnt > 1) joinErrors.push(`Draft row "${k}" has multiple override matches`);
}
for (const k of overrideKeys) {
  if (!draftMap.has(k)) joinErrors.push(`Override row "${k}" has no draft match`);
}
if (joinErrors.length) {
  console.error('JOIN ERRORS:');
  for (const e of joinErrors) console.error('  ' + e);
  process.exit(1);
}

if (draftKeys.size !== draftRows.length) {
  console.error('Duplicate draft scientific_name detected');
  process.exit(1);
}
if (overrideKeys.size !== overrideRows.length) {
  console.error('Duplicate override scientific_name detected');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------
const OVERRIDE_COLS = [
  'arrival_modes', 'arrival_bearing_spring', 'arrival_bearing_autumn',
  'spring_window', 'autumn_window', 'flight_class',
  'source_regions_spring', 'source_regions_autumn'
];

const merged = [];
const overrideApplied = {};
for (const col of OVERRIDE_COLS) overrideApplied[col] = 0;

for (const [key, d] of draftMap) {
  const o = overrideMap.get(key);
  const m = { scientific_name: nfc(d.scientific_name) };

  for (const col of OVERRIDE_COLS) {
    const ov = o[col] ?? '';
    if (isBlank(ov)) {
      m[col] = d[col] ?? '';
    } else {
      m[col] = ov;
      overrideApplied[col]++;
    }
  }

  // ebird_code, cruise_kmh, refs_json from draft
  m.ebird_code = d.ebird_code ?? '';

  // Recompute cruise_kmh if flight_class changed
  if (m.flight_class !== (d.flight_class ?? '')) {
    m.cruise_kmh = FLIGHT_CLASS_CRUISE[m.flight_class] ?? d.cruise_kmh;
  } else {
    m.cruise_kmh = d.cruise_kmh;
  }

  // refs
  let refsObj;
  try {
    refsObj = JSON.parse(d.refs_json ?? '{}');
  } catch {
    refsObj = {};
  }
  if (d.notes) refsObj.draft_notes = d.notes;
  if (o.note) refsObj.override_note = o.note;
  if (d.bearing_hint_breeding) refsObj.bearing_hint_breeding = d.bearing_hint_breeding;
  if (d.window_source) refsObj.window_source = d.window_source;
  m.refs_json = JSON.stringify(refsObj);

  // curated_by
  m.curated_by = (o.source ?? '') === 'architect_proposal' ? 'architect_proposal' : (o.source ?? '');

  merged.push(m);
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------
const validationErrors = [];

for (let i = 0; i < merged.length; i++) {
  const r = merged[i];
  const label = `#${i + 1} ${r.scientific_name}`;

  // arrival_modes in allowed set (or {}).
  const rawModes = r.arrival_modes.trim();
  if (rawModes === '{}') {
    // empty array — allowed (excluded species)
  } else {
    const parts = rawModes.replace(/^\{\s*/, '').replace(/\s*\}$/, '').split(',').map(s => s.trim());
    for (const p of parts) {
      if (!ALLOWED_MODES.has(p)) {
        validationErrors.push(`${label}: arrival_modes contains "${p}" — not in allowed set`);
      }
    }
  }

  // flight_class in allowed set
  if (!ALLOWED_FC.has(r.flight_class)) {
    validationErrors.push(`${label}: flight_class "${r.flight_class}" not in allowed set`);
  }

  // bearings 0-359 or blank
  for (const bc of ['arrival_bearing_spring', 'arrival_bearing_autumn']) {
    const bv = r[bc];
    if (!isBlank(bv)) {
      const n = Number(bv);
      if (!Number.isInteger(n) || n < 0 || n > 359) {
        validationErrors.push(`${label}: ${bc} = "${bv}" — not integer 0-359`);
      }
    }
  }

  // windows blank or match regex with start <= end
  for (const wc of ['spring_window', 'autumn_window']) {
    const wv = r[wc];
    if (!isBlank(wv)) {
      if (!WINDOW_RE.test(wv)) {
        validationErrors.push(`${label}: ${wc} = "${wv}" — does not match expected format`);
      } else {
        const inner = wv.slice(1, -1);
        const [s, e] = inner.split(',');
        if (s > e) {
          validationErrors.push(`${label}: ${wc} window start > end (${s} > ${e})`);
        }
      }
    }
  }

  // source_regions arrays in {a,b} form with no spaces after commas
  for (const ac of ['source_regions_spring', 'source_regions_autumn']) {
    const av = r[ac];
    if (!isBlank(av)) {
      if (!/^\{[^,}\s]*(,[^,}\s]+)*\}$/.test(av)) {
        validationErrors.push(`${label}: ${ac} = "${av}" — not valid {a,b} form`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------
console.log('=== Phenology Seed Summary ===');
console.log(`Draft rows read: ${draftRows.length}`);
console.log(`Override rows read: ${overrideRows.length}`);
console.log(`Rows merged: ${merged.length}`);
console.log();
console.log('Override-applied cell counts:');
for (const col of OVERRIDE_COLS) {
  console.log(`  ${col}: ${overrideApplied[col]}`);
}
console.log();

const modeDist = {};
const fcDist = {};
let emptyModesCount = 0;
let noBearingCount = 0;

for (const r of merged) {
  const raw = r.arrival_modes.trim();
  modeDist[raw] = (modeDist[raw] || 0) + 1;
  fcDist[r.flight_class] = (fcDist[r.flight_class] || 0) + 1;
  if (raw === '{}') emptyModesCount++;
  if (isBlank(r.arrival_bearing_spring) && isBlank(r.arrival_bearing_autumn)) noBearingCount++;
}

console.log('Mode distribution:');
for (const [k, v] of Object.entries(modeDist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

console.log();
console.log('Flight class distribution:');
for (const [k, v] of Object.entries(fcDist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

console.log();
console.log(`Rows with {} (empty) modes: ${emptyModesCount}`);
console.log(`Rows with no bearing at all: ${noBearingCount}`);
console.log();
console.log(`Validation errors: ${validationErrors.length}`);

for (const e of validationErrors) {
  console.error(`  ERROR: ${e}`);
}

if (validationErrors.length > 0) {
  console.error('\nAborting — not writing SQL file.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write SQL
// ---------------------------------------------------------------------------
let sql = '-- tmp/phenology_seed.sql - generated by scripts/ennustus-phenology-seed.mjs; do not edit by hand\n';
sql += 'begin;\n';

for (const r of merged) {
  const sci = `'${sqlEscape(r.scientific_name)}'`;
  const ebird = isBlank(r.ebird_code) ? 'null' : `'${sqlEscape(r.ebird_code)}'`;
  const modes = `'${sqlEscape(r.arrival_modes)}'`;
  const springWin = isBlank(r.spring_window) ? 'null' : `'${sqlEscape(r.spring_window)}'`;
  const autumnWin = isBlank(r.autumn_window) ? 'null' : `'${sqlEscape(r.autumn_window)}'`;
  const bSpring = isBlank(r.arrival_bearing_spring) ? 'null' : String(Number(r.arrival_bearing_spring));
  const bAutumn = isBlank(r.arrival_bearing_autumn) ? 'null' : String(Number(r.arrival_bearing_autumn));
  const srSpring = isBlank(r.source_regions_spring) ? `'{}'` : `'${sqlEscape(r.source_regions_spring)}'`;
  const srAutumn = isBlank(r.source_regions_autumn) ? `'{}'` : `'${sqlEscape(r.source_regions_autumn)}'`;
  const fc = `'${sqlEscape(r.flight_class)}'`;
  const cruise = isBlank(r.cruise_kmh) ? 'null' : String(Number(r.cruise_kmh));
  const refs = `'${sqlEscape(r.refs_json)}'::jsonb`;
  const curatedBy = `'${sqlEscape(r.curated_by)}'`;

  sql += `insert into public.species_phenology\n`;
  sql += `  (scientific_name, ebird_code, arrival_modes, spring_window, autumn_window,\n`;
  sql += `   arrival_bearing_spring, arrival_bearing_autumn, source_regions_spring, source_regions_autumn,\n`;
  sql += `   flight_class, cruise_kmh, refs, curated_by, updated_at)\n`;
  sql += `values\n`;
  sql += `  (${sci}, ${ebird}, ${modes}, ${springWin}, ${autumnWin},\n`;
  sql += `   ${bSpring}, ${bAutumn}, ${srSpring}, ${srAutumn},\n`;
  sql += `   ${fc}, ${cruise}, ${refs}, ${curatedBy}, now())\n`;
  sql += `on conflict (scientific_name) do update set\n`;
  sql += `  ebird_code = excluded.ebird_code, arrival_modes = excluded.arrival_modes,\n`;
  sql += `  spring_window = excluded.spring_window, autumn_window = excluded.autumn_window,\n`;
  sql += `  arrival_bearing_spring = excluded.arrival_bearing_spring, arrival_bearing_autumn = excluded.arrival_bearing_autumn,\n`;
  sql += `  source_regions_spring = excluded.source_regions_spring, source_regions_autumn = excluded.source_regions_autumn,\n`;
  sql += `  flight_class = excluded.flight_class, cruise_kmh = excluded.cruise_kmh,\n`;
  sql += `  refs = excluded.refs, curated_by = excluded.curated_by, updated_at = now();\n`;
}

sql += 'commit;\n';
sql += '\n';
sql += "select count(*) as rows_total from public.species_phenology;                                  -- 190\n";
sql += "select count(*) filter (where arrival_modes = '{}') as excluded_species from public.species_phenology;  -- expect 6\n";
sql += 'select flight_class, count(*) from public.species_phenology group by 1 order by 2 desc;\n';
sql += "select count(*) filter (where arrival_bearing_spring is null and arrival_bearing_autumn is null) as no_bearing from public.species_phenology;  -- expect 6 (the {} rows)\n";
sql += "select scientific_name, arrival_modes, spring_window, autumn_window, arrival_bearing_autumn from public.species_phenology where scientific_name in ('Oenanthe deserti','Ardeola ralloides','Phalaropus lobatus');\n";

writeFileSync('tmp/phenology_seed.sql', sql);
console.log(`\nWrote tmp/phenology_seed.sql (${merged.length} insert statements).`);
