// scripts/ennustus-gbif-foreign-count.mjs
// Ennustus P3 / Phase A4 — READ-ONLY volume probe.
//
// Estimates how many GBIF occurrences a rare+ foreign pull would return per
// species x country, so the architect can pick batch_size / page_cap for the
// per-country batch-driver jobs. Touches no Supabase table and no edge
// function — it only reads the public species_meta_v1.json and the GBIF API.
//
// Run: node scripts/ennustus-gbif-foreign-count.mjs
// Out: tmp/gbif_foreign_counts.csv   (per species x country counts)
//      tmp/gbif_counts_cache.json    (every API response; re-runs fill gaps only)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const PROJECT_REF = "rfjhrosxbaihyrnbmmbl";
const SPECIES_META_URL =
  `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json`;
const GBIF = "https://api.gbif.org/v1";

const FOREIGN_TIERS = ["rare", "super", "mega"];
const COUNTRIES = ["FI", "SE", "LV", "LT", "RU"];
// NW Russia only: lon 19-40 E, lat 55-70 N. Ring is counter-clockwise (GBIF requirement).
const RU_BBOX_WKT = "POLYGON((19 55,40 55,40 70,19 70,19 55))";
const YEAR_RANGE = "2010,2026";

const PAGE_CAP_ROWS = 3000; // one call at page_cap 10 x limit 300
const BIG_CELL_ROWS = 30000; // needs year-chunking, not just a bigger page_cap

const REQUEST_GAP_MS = 150;
const CACHE_PATH = "tmp/gbif_counts_cache.json";
const CSV_PATH = "tmp/gbif_foreign_counts.csv";
const SAVE_EVERY = 25;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Retry 429 / 5xx with exponential backoff, mirroring the EF's fetchWithBackoff. */
async function fetchWithBackoff(url, tries = 5) {
  let delay = 600;
  for (let i = 0; i < tries; i++) {
    let r;
    try {
      r = await fetch(url);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(delay);
      delay *= 2;
      continue;
    }
    if (r.status !== 429 && r.status < 500) return r;
    if (i === tries - 1) return r;
    await sleep(delay);
    delay *= 2;
  }
  throw new Error("unreachable");
}

async function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await mkdir("tmp", { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

function countUrl(taxonKey, country) {
  const geo = country === "RU"
    ? `&geometry=${encodeURIComponent(RU_BBOX_WKT)}`
    : "";
  // /occurrence/count rejects hasCoordinate ("Invalid parameter name"), so use
  // the search endpoint with limit=0 and read its `count` — same filter set as
  // the real pull in gbif-bulk-refresh, minus paging.
  return `${GBIF}/occurrence/search?taxonKey=${taxonKey}&country=${country}` +
    `&hasCoordinate=true${geo}&year=${YEAR_RANGE}&limit=0`;
}

async function main() {
  const cache = await loadCache();
  let pending = 0;

  // --- species list ------------------------------------------------------
  const metaResp = await fetch(`${SPECIES_META_URL}?t=${Date.now()}`);
  if (!metaResp.ok) throw new Error(`species_meta_fetch_failed ${metaResp.status}`);
  const meta = await metaResp.json();
  const items = meta?.items ?? {};

  const withLat = Object.entries(items)
    .map(([estKey, v]) => ({
      species_name: cap(estKey),
      species_lat: String(v?.scientificName || "").trim(),
      tier: String(v?.rarityLevel ?? "none"),
    }))
    .filter((s) => s.species_lat)
    .sort((a, b) => a.species_name.localeCompare(b.species_name));

  const rarePlus = withLat.filter((s) => FOREIGN_TIERS.includes(s.tier));

  const tierCounts = {};
  for (const s of withLat) tierCounts[s.tier] = (tierCounts[s.tier] ?? 0) + 1;

  console.log("=== species_meta_v1.json ===");
  console.log(`total_with_lat : ${withLat.length}`);
  console.log(`rare_plus      : ${rarePlus.length}`);
  console.log(`per-tier       : ${JSON.stringify(tierCounts)}`);
  console.log(
    "NOTE: taxon keys resolved from GBIF species/match only. " +
      "Manual overrides in public.gbif_taxon_keys are IGNORED here — " +
      "acceptable for a volume estimate, not for the ingest itself.",
  );
  console.log(
    `Probing ${rarePlus.length} species x ${COUNTRIES.length} countries ` +
      `(+ ${rarePlus.length} taxon matches), year=${YEAR_RANGE}.`,
  );
  console.log("");

  // --- probe -------------------------------------------------------------
  const rows = [];
  const unresolved = [];
  const failedCells = [];

  for (let i = 0; i < rarePlus.length; i++) {
    const sp = rarePlus[i];

    const matchKey = `match:${sp.species_lat}`;
    if (!(matchKey in cache)) {
      const r = await fetchWithBackoff(
        `${GBIF}/species/match?name=${encodeURIComponent(sp.species_lat)}&kingdom=Animalia`,
      );
      const m = await r.json().catch(() => ({}));
      cache[matchKey] = m?.usageKey ?? null;
      pending++;
      await sleep(REQUEST_GAP_MS);
    }
    const taxonKey = cache[matchKey];

    if (!taxonKey) {
      unresolved.push(sp.species_lat);
      rows.push({ ...sp, taxon_key: "", counts: {}, total: 0 });
      continue;
    }

    const counts = {};
    for (const country of COUNTRIES) {
      const ck = `searchcount:${taxonKey}:${country}`;
      if (!(ck in cache)) {
        const r = await fetchWithBackoff(countUrl(taxonKey, country));
        const j = await r.json().catch(() => null);
        const n = Number(j?.count);
        if (!r.ok || !Number.isFinite(n)) {
          failedCells.push(`${sp.species_name}/${country} (HTTP ${r.status})`);
        }
        cache[ck] = r.ok && Number.isFinite(n) ? n : null;
        pending++;
        if (pending >= SAVE_EVERY) {
          await saveCache(cache);
          pending = 0;
        }
        await sleep(REQUEST_GAP_MS);
      }
      counts[country] = cache[ck] ?? 0;
    }

    const total = COUNTRIES.reduce((a, c) => a + counts[c], 0);
    rows.push({ ...sp, taxon_key: taxonKey, counts, total });

    if ((i + 1) % 25 === 0) {
      console.log(`  ... ${i + 1}/${rarePlus.length} species probed`);
    }
  }

  await saveCache(cache);

  // --- CSV ---------------------------------------------------------------
  const header = ["species_name", "species_lat", "taxon_key", "tier", ...COUNTRIES, "total"];
  const csv = [header.join(",")];
  for (const r of rows) {
    csv.push([
      `"${r.species_name.replace(/"/g, '""')}"`,
      `"${r.species_lat.replace(/"/g, '""')}"`,
      r.taxon_key,
      r.tier,
      ...COUNTRIES.map((c) => r.counts[c] ?? 0),
      r.total,
    ].join(","));
  }
  await mkdir("tmp", { recursive: true });
  await writeFile(CSV_PATH, csv.join("\n") + "\n", "utf8");

  // --- summary -----------------------------------------------------------
  const perCountry = {};
  for (const c of COUNTRIES) {
    perCountry[c] = rows.reduce((a, r) => a + (r.counts[c] ?? 0), 0);
  }
  const cells = [];
  for (const r of rows) {
    for (const c of COUNTRIES) {
      const n = r.counts[c] ?? 0;
      if (n > 0) cells.push({ species: r.species_name, country: c, n, tier: r.tier });
    }
  }
  cells.sort((a, b) => b.n - a.n);
  const over3k = cells.filter((c) => c.n > PAGE_CAP_ROWS);
  const over30k = cells.filter((c) => c.n > BIG_CELL_ROWS);
  const grand = Object.values(perCountry).reduce((a, b) => a + b, 0);

  console.log("");
  console.log("=== SUMMARY (rare+ only, year 2010-2026, hasCoordinate=true) ===");
  console.log(`csv                       : ${CSV_PATH} (${rows.length} rows)`);
  console.log(`unresolved_taxon_keys     : ${unresolved.length}` +
    (unresolved.length ? ` -> ${unresolved.slice(0, 10).join(", ")}` : ""));
  console.log(`failed_count_calls        : ${failedCells.length}` +
    (failedCells.length ? ` -> ${failedCells.slice(0, 10).join(", ")}` : ""));
  for (const c of COUNTRIES) {
    console.log(`sum ${c}                    : ${perCountry[c].toLocaleString("en-US")}`);
  }
  console.log(`sum ALL                   : ${grand.toLocaleString("en-US")}`);
  console.log(`non-empty cells           : ${cells.length}`);
  console.log(`cells > ${PAGE_CAP_ROWS} (page cap)  : ${over3k.length}`);
  console.log(`cells > ${BIG_CELL_ROWS} (chunking) : ${over30k.length}`);
  console.log("");
  console.log("--- top 10 cells ---");
  for (const c of cells.slice(0, 10)) {
    console.log(`  ${String(c.n).padStart(8)}  ${c.country}  ${c.species} (${c.tier})`);
  }
  if (over30k.length) {
    console.log("");
    console.log("--- cells > 30000 (need year-chunking, out of P3 scope) ---");
    for (const c of over30k) {
      console.log(`  ${String(c.n).padStart(8)}  ${c.country}  ${c.species} (${c.tier})`);
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
