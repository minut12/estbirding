import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_CSV_PATH = "C:\\Users\\krist\\Downloads\\rariliin_ebird_speciescode_for_linnuliigid_settings.csv";
const FALLBACK_META_PATH = path.resolve("public/maps/linnuliigid/species-meta.json");
const CLOUD_BUCKET = "bird-avatars";
const CLOUD_FILE_PATH = "meta/species_meta_v1.json";

function fixMojibake(input) {
  const s = String(input ?? "");
  if (!s || !/[\u00C3\u00C2\u00E2]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const decodedBad = (decoded.match(/[\u00C3\u00C2\u00E2]/g) || []).length;
    const sourceBad = (s.match(/[\u00C3\u00C2\u00E2]/g) || []).length;
    const decodedEst = (decoded.match(/[\u00F5\u00E4\u00F6\u00FC\u0161\u017E\u00D5\u00C4\u00D6\u00DC\u0160\u017D]/g) || []).length;
    const sourceEst = (s.match(/[\u00F5\u00E4\u00F6\u00FC\u0161\u017E\u00D5\u00C4\u00D6\u00DC\u0160\u017D]/g) || []).length;
    if (decodedBad < sourceBad || decodedEst >= sourceEst) return decoded;
  } catch {
    return s;
  }
  return s;
}

function normalizeUiText(input) {
  return fixMojibake(String(input ?? "")).replace(/\uFFFD/g, "").trim();
}

function normalizeSpeciesName(input) {
  return normalizeUiText(input);
}

function parseEnvFile(filePath) {
  const out = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell || "").trim() !== ""));
}

function readCsvRows(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(raw);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => normalizeUiText(h));
  return rows.slice(1).map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = normalizeUiText(values[index] || "");
    });
    return item;
  });
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildFallbackIndex(items) {
  const index = new Map();
  for (const item of items) {
    const key = normalizeSpeciesName(item?.estonianName || "");
    if (!key) continue;
    index.set(key, item);
  }
  return index;
}

function buildCloudIndex(items) {
  const index = new Map();
  for (const [name, item] of Object.entries(items || {})) {
    const key = normalizeSpeciesName(name);
    if (!key) continue;
    index.set(key, item || {});
  }
  return index;
}

function shouldScientificNameMatch(rowScientificName, targetScientificName) {
  const rowName = normalizeUiText(rowScientificName || "");
  const targetName = normalizeUiText(targetScientificName || "");
  if (!rowName || !targetName) return true;
  return rowName === targetName;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSummary() {
  return {
    updated: 0,
    skipped_existing: 0,
    skipped_unmatched: 0,
    updated_species: [],
  };
}

function applyRowsToTarget(rows, targetIndex, options) {
  const summary = createSummary();
  for (const row of rows) {
    const status = normalizeUiText(row["Status"]);
    if (status !== "MATCH") {
      summary.skipped_unmatched++;
      continue;
    }
    const speciesName = normalizeSpeciesName(row["Eesti nimi"]);
    const scientificName = normalizeUiText(row["Teaduslik nimi"]);
    const ebirdCode = normalizeUiText(row["eBird speciesCode"]);
    if (!speciesName || !ebirdCode) {
      summary.skipped_unmatched++;
      continue;
    }
    const target = targetIndex.get(speciesName);
    if (!target) {
      summary.skipped_unmatched++;
      continue;
    }
    const targetScientificName = options.getScientificName(target);
    if (!shouldScientificNameMatch(scientificName, targetScientificName)) {
      summary.skipped_unmatched++;
      continue;
    }
    const existingCode = normalizeUiText(options.getEbirdCode(target));
    if (existingCode) {
      summary.skipped_existing++;
      continue;
    }
    options.setEbirdCode(target, ebirdCode);
    summary.updated++;
    summary.updated_species.push(speciesName);
  }
  return summary;
}

function mergeSummaryCounts(repoSummary, cloudSummary, allRows) {
  const matchedRows = allRows.filter((row) => normalizeUiText(row["Status"]) === "MATCH").length;
  const noExactRows = allRows.length - matchedRows;
  return {
    updated: cloudSummary.updated,
    skipped_existing: cloudSummary.skipped_existing,
    skipped_unmatched: cloudSummary.skipped_unmatched,
    repo_updated: repoSummary.updated,
    repo_skipped_existing: repoSummary.skipped_existing,
    repo_skipped_unmatched: repoSummary.skipped_unmatched,
    total_rows: allRows.length,
    match_rows: matchedRows,
    no_exact_match_rows: noExactRows,
    sample_updated_species: cloudSummary.updated_species.slice(0, 10),
  };
}

async function downloadCloudJson(supabase) {
  const { data, error } = await supabase.storage.from(CLOUD_BUCKET).download(CLOUD_FILE_PATH);
  if (error) throw new Error(`Cloud download failed: ${error.message}`);
  return JSON.parse(await data.text());
}

async function uploadCloudJson(supabase, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const { error } = await supabase.storage.from(CLOUD_BUCKET).upload(CLOUD_FILE_PATH, blob, {
    contentType: "application/json",
    cacheControl: "0",
    upsert: true,
  });
  if (error) throw new Error(`Cloud upload failed: ${error.message}`);
}

function parseArgs(argv) {
  const args = { csvPath: DEFAULT_CSV_PATH, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--csv" && argv[i + 1]) {
      args.csvPath = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = parseEnvFile(path.resolve(".env"));
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials in .env");
  }

  const rows = readCsvRows(args.csvPath);
  const fallbackItems = loadJson(FALLBACK_META_PATH);
  const cloudPayload = await downloadCloudJson(createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

  const nextFallbackItems = clone(fallbackItems);
  const nextCloudPayload = clone(cloudPayload);
  const fallbackSummary = applyRowsToTarget(rows, buildFallbackIndex(nextFallbackItems), {
    getScientificName: (item) => item.scientificName,
    getEbirdCode: (item) => item.ebirdCode,
    setEbirdCode: (item, ebirdCode) => {
      item.ebirdCode = ebirdCode;
    },
  });
  const cloudSummary = applyRowsToTarget(rows, buildCloudIndex(nextCloudPayload.items || {}), {
    getScientificName: (item) => item.scientificName,
    getEbirdCode: (item) => item.ebirdCode,
    setEbirdCode: (item, ebirdCode) => {
      item.ebirdCode = ebirdCode;
    },
  });

  if (!args.dryRun) {
    fs.writeFileSync(FALLBACK_META_PATH, `${JSON.stringify(nextFallbackItems, null, 2)}\n`, "utf8");
    nextCloudPayload.updatedAt = new Date().toISOString();
    await uploadCloudJson(createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }), nextCloudPayload);
  }

  const summary = mergeSummaryCounts(fallbackSummary, cloudSummary, rows);
  console.log(JSON.stringify({
    mode: args.dryRun ? "dry-run" : "apply",
    csvPath: args.csvPath,
    ...summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
