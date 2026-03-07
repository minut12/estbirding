type MatchType = "latin" | "english";

type LookupMaps = {
  latinToEt: Map<string, string>;
  englishToEt: Map<string, string>;
};

export type BirdNameMatch = {
  token: string;
  matchType: MatchType;
  estonianName: string;
};

export type PreparedBirdNameCorrection = {
  maskedText: string;
  matches: BirdNameMatch[];
};

const LINNUD_TXT_RELATIVE_PATH = "../../../data/Linnud.txt";

const FALLBACK_ROWS = [
  "nimi_lk\tnimi_ek\tnimi_ik",
  "Surnia ulula\tvöötkakk\tNorthern Hawk-Owl, Northern Hawk Owl, Hawk Owl",
  "Galerida cristata\ttuttlõoke\tCrested Lark, Common Crested Lark",
].join("\n");

function normalizeWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeLookupKey(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/[()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readLinnudText(): string {
  try {
    const path = new URL(LINNUD_TXT_RELATIVE_PATH, import.meta.url);
    return Deno.readTextFileSync(path);
  } catch (error) {
    console.warn("[news-bird-names] failed to read data/Linnud.txt, using fallback subset", {
      error: String((error as Error)?.message || error),
    });
    return FALLBACK_ROWS;
  }
}

function splitAliases(value: string): string[] {
  return normalizeWhitespace(value)
    .split(",")
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

function stripPreferredNameNotes(value: string): string {
  return normalizeWhitespace(value).replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function parseLinnudTsv(tsv: string): LookupMaps {
  const lines = String(tsv || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { latinToEt: new Map(), englishToEt: new Map() };

  const header = lines[0].split("\t").map((cell) => normalizeWhitespace(cell));
  const latinIndex = header.indexOf("nimi_lk");
  const estonianIndex = header.indexOf("nimi_ek");
  const englishIndex = header.indexOf("nimi_ik");
  if (latinIndex < 0 || estonianIndex < 0 || englishIndex < 0) {
    return { latinToEt: new Map(), englishToEt: new Map() };
  }

  const latinToEt = new Map<string, string>();
  const englishToEt = new Map<string, string>();

  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const latinCell = cells[latinIndex] || "";
    const estonianCell = stripPreferredNameNotes(cells[estonianIndex] || "");
    const englishCell = cells[englishIndex] || "";
    if (!estonianCell) continue;

    for (const latinName of splitAliases(latinCell)) {
      const normalizedLatin = normalizeLookupKey(latinName);
      if (!normalizedLatin || latinToEt.has(normalizedLatin)) continue;
      latinToEt.set(normalizedLatin, estonianCell);
    }

    for (const englishName of splitAliases(englishCell)) {
      const normalizedEnglish = normalizeLookupKey(englishName);
      if (!normalizedEnglish || englishToEt.has(normalizedEnglish)) continue;
      englishToEt.set(normalizedEnglish, estonianCell);
    }
  }

  return { latinToEt, englishToEt };
}

const LOOKUPS = parseLinnudTsv(readLinnudText());

function detectBirdMatches(originalText: string): BirdNameMatch[] {
  const text = String(originalText || "");
  if (!text.trim()) return [];

  const matches: BirdNameMatch[] = [];
  const seen = new Set<string>();

  const latinEntries = Array.from(LOOKUPS.latinToEt.entries()).sort((a, b) => b[0].length - a[0].length);
  const englishEntries = Array.from(LOOKUPS.englishToEt.entries()).sort((a, b) => b[0].length - a[0].length);

  for (const [token, estonianName] of latinEntries) {
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(token)})(?=[^\\p{L}]|$)`, "giu");
    const hit = pattern.exec(text);
    if (!hit) continue;
    const key = `latin:${token}:${estonianName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ token: hit[2], matchType: "latin", estonianName });
  }

  for (const [token, estonianName] of englishEntries) {
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(token)})(?=[^\\p{L}]|$)`, "giu");
    const hit = pattern.exec(text);
    if (!hit) continue;
    const key = `english:${token}:${estonianName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ token: hit[2], matchType: "english", estonianName });
  }

  matches.sort((a, b) => {
    if (a.matchType !== b.matchType) return a.matchType === "latin" ? -1 : 1;
    return b.token.length - a.token.length;
  });
  return matches;
}

function maskBirdMatches(originalText: string, matches: BirdNameMatch[]): string {
  let output = String(originalText || "");
  matches.forEach((match, index) => {
    const placeholder = `__NEWS_BIRD_${index}__`;
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(match.token)})(?=[^\\p{L}]|$)`, "giu");
    output = output.replace(pattern, (_full, prefix: string) => `${prefix}${placeholder}`);
  });
  return output;
}

export function prepareBirdNameCorrectionFromOriginalText(input: string | null | undefined): PreparedBirdNameCorrection {
  const text = String(input || "");
  if (!text.trim()) return { maskedText: "", matches: [] };
  const matches = detectBirdMatches(text);
  return {
    maskedText: maskBirdMatches(text, matches),
    matches,
  };
}

export function applyBirdNameCorrections(maskedTranslatedText: string | null | undefined, matches: BirdNameMatch[], context: string): string {
  let output = String(maskedTranslatedText || "");
  if (!output.trim() || matches.length === 0) return output;

  const logs: Array<{ matched_token: string; match_type: MatchType; replacement: string; replacement_count: number }> = [];

  matches.forEach((match, index) => {
    const placeholder = `__NEWS_BIRD_${index}__`;
    const pattern = new RegExp(escapeRegex(placeholder), "g");
    const replacementCount = (output.match(pattern) || []).length;
    output = output.replace(pattern, match.estonianName);
    logs.push({
      matched_token: match.token,
      match_type: match.matchType,
      replacement: match.estonianName,
      replacement_count: replacementCount,
    });
  });

  const appliedLogs = logs.filter((entry) => entry.replacement_count > 0);
  if (appliedLogs.length > 0) {
    console.log("[news-bird-names]", { context, corrections: appliedLogs });
  }

  return output;
}
