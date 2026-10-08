// redeploy-marker: P104f 2026-10-08 (also writes Rariliin meta + backfill_rariliin)
// supabase/functions/europe-new-species/index.ts
//
// P104: auto-add brand-new species seen in eBird "notable" (FI, SE, LV, LT, PL, BY + NW Russia).
// Called by the Netlify Europe job (netlify/lib/ebird.js) with the notable species codes that are NOT
// in species_meta_v1.json. For each new code: Estonian name from the EOU list
// (_shared/eoy-bird-names.json, bundled as a JSON import - Linnud.txt is not bundled on deploy),
// add the species to meta/custom_species_v1.json + meta/species_meta_v1.json (ebirdCode,
// scientificName, rarity mega, notify) and send one broadcast push. Every code is recorded once in
// public.europe_new_species, so it is handled and pushed only once.
//
// POST body: { candidates: Candidate[], dry_run?: boolean, max_add?: number }
// Auth: x-webhook-secret = VAATLUSTE_WEBHOOK_SECRET.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import EOU_NAMES from "../_shared/eoy-bird-names.json" with { type: "json" };

type LatestObs = {
  obsDt?: string;
  locName?: string;
  lat?: number;
  lng?: number;
  subId?: string;
  obsReviewed?: boolean;
  obsValid?: boolean;
};

type Candidate = {
  code?: string;
  comName?: string;
  sciName?: string;
  region?: string;
  count?: number;
  exoticCategory?: string | null;
  latest?: LatestObs | null;
};

type Merged = {
  code: string;
  comName: string;
  sciName: string;
  regions: string[];
  count: number;
  exoticCategory: string;
  hasNonExotic: boolean;
  latest: LatestObs | null;
};

type Status =
  | "added"
  | "linked"
  | "skipped_known"
  | "skipped_exotic"
  | "skipped_taxon"
  | "no_et_name"
  | "failed";

type Outcome = {
  code: string;
  status: Status | "deferred_cap";
  name_et: string | null;
  sci: string;
  com: string;
  regions: string[];
};

type MetaItem = Record<string, unknown> & { ebirdCode?: string; scientificName?: string };
type MetaJson = { version: 1; updatedAt: string; items: Record<string, MetaItem> };
type CustomJson = { version: 1; updatedAt: string; items: string[] };
type SeenRow = { ebird_code: string; status: Status; regions: string[] | null; first_seen_at: string };

const BUCKET = "bird-avatars";
const META_PATH = "meta/species_meta_v1.json";
const CUSTOM_PATH = "meta/custom_species_v1.json";
// P104f: Rariliin keeps its own species meta; added species get an entry there too.
const RARILIIN_META_PATH = "meta/species_meta_rariliin_v1.json";
const DEFAULT_MAX_ADD = 5;
const A_UML = String.fromCharCode(228);
const COUNTRY_ET: Record<string, string> = {
  FI: "Soome",
  SE: "Rootsi",
  LV: "L" + A_UML + "ti",
  LT: "Leedu",
  PL: "Poola",
  BY: "Valgevene",
  RU: "Venemaa",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function normKey(s: string): string {
  return String(s || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function binomial(sci: string): string {
  return normKey(sci).split(" ").slice(0, 2).join(" ");
}

// Lowercase Latin name -> Estonian name (first entry wins, parenthetical notes stripped).
const LATIN_TO_ET = new Map<string, string>();
for (const entry of EOU_NAMES as Array<{ et?: string; latin?: string[] }>) {
  const et = String(entry?.et || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (!et) continue;
  for (const latin of entry?.latin || []) {
    const key = normKey(latin);
    if (key && !LATIN_TO_ET.has(key)) LATIN_TO_ET.set(key, et);
  }
}

function displayName(et: string): string {
  const s = et.normalize("NFC").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function countryOf(region: string): string {
  return String(region || "").slice(0, 2).toUpperCase();
}

// Spuhs ("gull sp."), slashes and hybrids are not species.
function isNotSpecies(c: Merged): boolean {
  const n = c.comName.toLowerCase();
  const s = c.sciName.toLowerCase();
  const words = s.split(" ").filter(Boolean);
  // P104c2: trinomials are eBird subspecies groups/forms, not species.
  if (words.length !== 2) return true;
  return /\bsp\.?$/.test(n) || /\bsp\.?$/.test(s) || n.includes("/") || s.includes("/") ||
    / x /.test(n) || / x /.test(s);
}

function mergeCandidates(list: Candidate[]): Merged[] {
  const byCode = new Map<string, Merged>();
  for (const c of list) {
    const code = String(c?.code || "").trim();
    if (!code) continue;
    const m: Merged = byCode.get(code) || {
      code,
      comName: "",
      sciName: "",
      regions: [],
      count: 0,
      exoticCategory: "",
      hasNonExotic: false,
      latest: null,
    };
    if (!m.comName && c.comName) m.comName = String(c.comName).trim();
    if (!m.sciName && c.sciName) m.sciName = String(c.sciName).trim();
    const region = String(c.region || "").trim().toUpperCase();
    if (region && !m.regions.includes(region)) m.regions.push(region);
    const n = Number(c.count);
    if (Number.isFinite(n) && n > 0) m.count += Math.floor(n);
    const ex = String(c.exoticCategory || "").trim().toUpperCase();
    if (ex) m.exoticCategory = ex;
    else m.hasNonExotic = true;
    const t = String(c.latest?.obsDt || "");
    if (c.latest && (!m.latest || t > String(m.latest.obsDt || ""))) m.latest = c.latest;
    byCode.set(code, m);
  }
  return [...byCode.values()];
}

async function readJson(sb: SupabaseClient, path: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error) {
    const msg = errorMessage(error);
    if (/not found|404/i.test(msg)) return null;
    throw new Error(path + ": " + msg);
  }
  const text = await data.text();
  if (!text) return null;
  return JSON.parse(text) as Record<string, unknown>;
}

async function writeJson(sb: SupabaseClient, path: string, body: unknown): Promise<void> {
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: "application/json",
    cacheControl: "0",
    upsert: true,
  });
  if (error) throw new Error(path + ": " + error.message);
}

function asMeta(raw: Record<string, unknown> | null): MetaJson {
  const items = raw && raw.items && typeof raw.items === "object" ? raw.items as Record<string, MetaItem> : {};
  return { version: 1, updatedAt: String(raw?.updatedAt || ""), items: { ...items } };
}

function asCustom(raw: Record<string, unknown> | null): CustomJson {
  const items = raw && Array.isArray(raw.items) ? (raw.items as unknown[]).filter((s): s is string => typeof s === "string") : [];
  return { version: 1, updatedAt: String(raw?.updatedAt || ""), items: [...items] };
}

// P104f: Rariliin 3+3 code = first 3 letters of genus + first 3 of species epithet (Cursorius cursor -> CURCUR).
function rariliinCode(sci: string): string {
  const w = String(sci || "").trim().split(/\s+/);
  if (w.length < 2) return "";
  return (w[0].slice(0, 3) + w[1].slice(0, 3)).toUpperCase();
}

// P104f: add-only write of Rariliin meta entries. Existing (user) values win; only missing
// scientificName / ebirdCode / rariliinCode are filled. Aborts if the file is missing or empty.
async function ensureRariliin(
  sb: SupabaseClient,
  entries: Array<{ name: string; sci: string; code: string }>,
): Promise<{ written: string[]; error: string | null }> {
  if (!entries.length) return { written: [], error: null };
  try {
    const raw = await readJson(sb, RARILIIN_META_PATH);
    if (!raw) return { written: [], error: "rariliin_meta_missing_abort" };
    const meta = asMeta(raw);
    const count0 = Object.keys(meta.items).length;
    if (count0 === 0) return { written: [], error: "rariliin_meta_empty_abort" };
    const written: string[] = [];
    for (const e of entries) {
      const prev = meta.items[e.name] || {};
      const next: MetaItem = {
        rarityLevel: "mega",
        notify: true,
        ...prev,
      };
      if (!String(next.scientificName || "").trim() && e.sci) next.scientificName = e.sci;
      if (!String(next.ebirdCode || "").trim() && e.code) next.ebirdCode = e.code;
      if (!String((next as Record<string, unknown>).rariliinCode || "").trim()) {
        const rc = rariliinCode(e.sci);
        if (rc) (next as Record<string, unknown>).rariliinCode = rc;
      }
      meta.items[e.name] = next;
      written.push(e.name);
    }
    await writeJson(sb, RARILIIN_META_PATH, { version: 1, updatedAt: new Date().toISOString(), items: meta.items });
    return { written, error: null };
  } catch (e) {
    return { written: [], error: "rariliin_write: " + errorMessage(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const secret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET") || "";
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return json(401, { error: "unauthorized" });

  let body: { candidates?: Candidate[]; dry_run?: boolean; max_add?: number; backfill_rariliin?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const dryRun = body?.dry_run === true;

  // P104f: one-off backfill of Rariliin meta for every species this function has added so far.
  if (body?.backfill_rariliin === true) {
    const sbB = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: addedRows, error: addedErr } = await sbB
      .from("europe_new_species")
      .select("ebird_code, sci_name, name_et")
      .eq("status", "added");
    if (addedErr) return json(500, { error: "db_read", detail: addedErr.message });
    const entries = ((addedRows || []) as Array<{ ebird_code: string; sci_name: string | null; name_et: string | null }>)
      .filter((r) => r.name_et)
      .map((r) => ({ name: String(r.name_et), sci: String(r.sci_name || ""), code: r.ebird_code }));
    if (dryRun) return json(200, { ok: true, dry_run: true, backfill_rariliin: entries });
    const res = await ensureRariliin(sbB, entries);
    return json(res.error ? 500 : 200, { ok: !res.error, backfill_rariliin: res });
  }
  const maxAddRaw = body?.max_add;
  const maxAdd = typeof maxAddRaw === "number" && Number.isFinite(maxAddRaw) && maxAddRaw >= 0
    ? Math.min(20, Math.floor(maxAddRaw))
    : DEFAULT_MAX_ADD;
  const merged = mergeCandidates(Array.isArray(body?.candidates) ? body.candidates : []);
  if (!merged.length) return json(200, { ok: true, dry_run: dryRun, received: 0, added: [], linked: [], outcomes: [] });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const nowIso = new Date().toISOString();

  // 1. Codes already handled (any status but 'failed') only get their sighting fields refreshed.
  const { data: seenData, error: seenErr } = await sb
    .from("europe_new_species")
    .select("ebird_code, status, regions, first_seen_at")
    .in("ebird_code", merged.map((m) => m.code));
  if (seenErr) return json(500, { error: "db_read", detail: seenErr.message });
  const seen = new Map<string, SeenRow>(((seenData || []) as SeenRow[]).map((r) => [r.ebird_code, r]));

  // 2. Current species lists.
  let meta: MetaJson;
  let custom: CustomJson;
  try {
    const metaRaw = await readJson(sb, META_PATH);
    // P104c2: never classify (or later write) against a missing/empty meta file.
    if (!metaRaw) return json(500, { error: "meta_missing_abort" });
    meta = asMeta(metaRaw);
    custom = asCustom(await readJson(sb, CUSTOM_PATH));
  } catch (e) {
    return json(500, { error: "storage_read", detail: errorMessage(e) });
  }
  const metaCount0 = Object.keys(meta.items).length;
  const customCount0 = custom.items.length;
  if (metaCount0 === 0) return json(500, { error: "meta_empty_abort" });
  const codeSet = new Set(Object.values(meta.items).map((v) => String(v?.ebirdCode || "").trim()).filter(Boolean));
  const nameToKey = new Map<string, string>();
  for (const k of Object.keys(meta.items)) nameToKey.set(normKey(k), k);
  for (const n of custom.items) if (!nameToKey.has(normKey(n))) nameToKey.set(normKey(n), n);
  const binToKey = new Map<string, string>();
  for (const [k, v] of Object.entries(meta.items)) {
    const s = String(v?.scientificName || "");
    const b = s ? binomial(s) : "";
    if (b && !binToKey.has(b)) binToKey.set(b, k);
  }

  // 3. Classify.
  const outcomes: Outcome[] = [];
  const toAdd: Array<{ c: Merged; name: string }> = [];
  const toLink: Array<{ c: Merged; key: string }> = [];
  const refresh: Merged[] = [];
  let addCount = 0;
  const addedNames = new Set<string>();
  for (const c of merged) {
    const prev = seen.get(c.code);
    if (prev && prev.status !== "failed") {
      refresh.push(c);
      continue;
    }
    const sciKey = normKey(c.sciName);
    const bin = binomial(c.sciName);
    const et = LATIN_TO_ET.get(sciKey) || LATIN_TO_ET.get(bin) || "";
    const name = et ? displayName(et) : "";
    let status: Status | "deferred_cap";
    let nameEt: string | null = name || null;
    // P104c2: a code whose previous run failed half-way is re-added (writes are idempotent).
    const retrying = prev?.status === "failed" && !!name;
    if (codeSet.has(c.code) && !retrying) {
      status = "skipped_known";
    } else if (isNotSpecies(c)) {
      status = "skipped_taxon";
    } else if (!c.hasNonExotic && (c.exoticCategory === "X" || c.exoticCategory === "P")) {
      status = "skipped_exotic";
    } else {
      const byBin = binToKey.get(bin);
      const byName = name ? nameToKey.get(normKey(name)) : undefined;
      // P104c3: on retry, only our own half-done add (key == EOU name) is re-added; a failed link stays a link.
      let key = byBin || byName;
      if (retrying && key && normKey(key) === normKey(name)) key = undefined;
      if (name && addedNames.has(normKey(name))) {
        status = "skipped_known";
      } else if (key) {
        const item = meta.items[key];
        const itemCode = String(item?.ebirdCode || "").trim();
        const itemSci = normKey(String(item?.scientificName || ""));
        if ((!itemCode || itemCode === c.code) && (!itemSci || itemSci === sciKey)) {
          status = "linked";
          nameEt = key;
          toLink.push({ c, key });
        } else {
          status = "skipped_known";
          nameEt = key;
        }
      } else if (!name) {
        status = "no_et_name";
      } else if (addCount >= maxAdd) {
        status = "deferred_cap";
      } else {
        status = "added";
        addCount++;
        addedNames.add(normKey(name));
        toAdd.push({ c, name });
      }
    }
    outcomes.push({ code: c.code, status, name_et: nameEt, sci: c.sciName, com: c.comName, regions: c.regions });
  }

  if (dryRun) {
    return json(200, {
      ok: true,
      dry_run: true,
      received: merged.length,
      already_handled: refresh.map((c) => c.code),
      would_add: toAdd.map((a) => ({ code: a.c.code, name: a.name, regions: a.c.regions })),
      would_link: toLink.map((l) => ({ code: l.c.code, name: l.key })),
      outcomes,
    });
  }

  // 4. Write meta + custom list (re-read right before writing to keep the race with browser saves small).
  const errorsByCode = new Map<string, string>();
  if (toAdd.length || toLink.length) {
    try {
      const meta2Raw = await readJson(sb, META_PATH);
      const meta2 = asMeta(meta2Raw);
      if (!meta2Raw || Object.keys(meta2.items).length < metaCount0) {
        throw new Error("meta_shrank_abort (" + Object.keys(meta2.items).length + " < " + metaCount0 + ")");
      }
      for (const a of toAdd) {
        // P104c2: defaults first, any existing (user) values win, ebirdCode always ours.
        meta2.items[a.name] = {
          scientificName: a.c.sciName,
          rarityLevel: "mega",
          notify: true,
          ...(meta2.items[a.name] || {}),
          ebirdCode: a.c.code,
        };
      }
      for (const l of toLink) {
        const prevItem = meta2.items[l.key] || {};
        meta2.items[l.key] = {
          ...prevItem,
          ebirdCode: l.c.code,
          ...(prevItem.scientificName ? {} : { scientificName: l.c.sciName }),
        };
      }
      await writeJson(sb, META_PATH, { version: 1, updatedAt: new Date().toISOString(), items: meta2.items });
      if (toAdd.length) {
        const custom2Raw = await readJson(sb, CUSTOM_PATH);
        const custom2 = asCustom(custom2Raw);
        if ((customCount0 > 0 && !custom2Raw) || custom2.items.length < customCount0) {
          throw new Error("custom_shrank_abort (" + custom2.items.length + " < " + customCount0 + ")");
        }
        const have = new Set(custom2.items.map(normKey));
        for (const a of toAdd) if (!have.has(normKey(a.name))) custom2.items.push(a.name);
        custom2.items.sort((x, y) => x.localeCompare(y, "et"));
        await writeJson(sb, CUSTOM_PATH, { version: 1, updatedAt: new Date().toISOString(), items: custom2.items });
      }
    } catch (e) {
      const msg = "storage_write: " + errorMessage(e);
      for (const a of toAdd) errorsByCode.set(a.c.code, msg);
      for (const l of toLink) errorsByCode.set(l.c.code, msg);
      console.error("[p104]", msg);
    }
  }

  // 4b. P104f: Rariliin meta for added species (failure is reported, not fatal).
  const rariliin = await ensureRariliin(
    sb,
    toAdd.filter((a) => !errorsByCode.has(a.c.code)).map((a) => ({ name: a.name, sci: a.c.sciName, code: a.c.code })),
  );
  if (rariliin.error) console.warn("[p104] rariliin", rariliin.error);

  // 5. One broadcast push per added species.
  const pushed = new Set<string>();
  for (const a of toAdd) {
    if (errorsByCode.has(a.c.code)) continue;
    const countries = [...new Set(a.c.regions.map(countryOf))].map((x) => COUNTRY_ET[x] || x).join(", ");
    const loc = String(a.c.latest?.locName || "").slice(0, 60).trim();
    const unconfirmed = !a.c.latest || a.c.latest.obsReviewed !== true;
    const text = a.name + " - " + countries + (loc ? ", " + loc : "") + (unconfirmed ? " (kinnitamata)" : "");
    try {
      const r = await fetch(supabaseUrl + "/functions/v1/send-push-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
        body: JSON.stringify({
          species: [a.name],
          broadcast: true,
          notification_title: "Uus liik Euroopas",
          notification_body: text,
          notification_tag: "new-species-" + a.c.code,
        }),
      });
      const t = await r.text();
      if (r.ok) pushed.add(a.c.code);
      else console.warn("[p104] push failed", a.c.code, r.status, t.slice(0, 200));
    } catch (e) {
      console.warn("[p104] push error", a.c.code, errorMessage(e));
    }
  }

  // 6. Record outcomes. Two upserts with uniform shapes (missing keys would otherwise become NULL).
  const refreshRows = refresh.map((c) => {
    const prev = seen.get(c.code)!;
    return {
      ebird_code: c.code,
      status: prev.status,
      regions: [...new Set([...(prev.regions || []), ...c.regions])],
      obs_count: c.count,
      latest: c.latest,
      last_seen_at: nowIso,
    };
  });
  const newRows = outcomes
    .filter((o) => o.status !== "deferred_cap")
    .map((o) => {
      const c = merged.find((m) => m.code === o.code)!;
      const prev = seen.get(o.code);
      const err = errorsByCode.get(o.code) || null;
      const status: Status = err ? "failed" : (o.status as Status);
      return {
        ebird_code: o.code,
        sci_name: c.sciName || null,
        com_name: c.comName || null,
        name_et: o.name_et,
        status,
        regions: c.regions,
        obs_count: c.count,
        latest: c.latest,
        first_seen_at: prev?.first_seen_at || nowIso,
        last_seen_at: nowIso,
        added_at: status === "added" || status === "linked" ? nowIso : null,
        notified_at: pushed.has(o.code) ? nowIso : null,
        error: err,
      };
    });
  const dbErrors: string[] = [];
  if (refreshRows.length) {
    const { error } = await sb.from("europe_new_species").upsert(refreshRows, { onConflict: "ebird_code" });
    if (error) dbErrors.push("refresh: " + error.message);
  }
  if (newRows.length) {
    const { error } = await sb.from("europe_new_species").upsert(newRows, { onConflict: "ebird_code" });
    if (error) dbErrors.push("new: " + error.message);
  }

  const added = toAdd.filter((a) => !errorsByCode.has(a.c.code)).map((a) => ({ code: a.c.code, name: a.name }));
  const linked = toLink.filter((l) => !errorsByCode.has(l.c.code)).map((l) => ({ code: l.c.code, name: l.key }));
  console.log("[p104] done", JSON.stringify({ received: merged.length, added, linked, pushed: [...pushed], dbErrors }));
  return json(dbErrors.length ? 500 : 200, {
    ok: dbErrors.length === 0,
    dry_run: false,
    received: merged.length,
    added,
    linked,
    pushed: [...pushed],
    already_handled: refresh.map((c) => c.code),
    outcomes,
    errors: Object.fromEntries(errorsByCode),
    rariliin,
    db_errors: dbErrors,
  });
});
