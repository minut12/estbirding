import rawBirdNames from "./eoy-bird-names.json" with { type: "json" };

type BirdNameRow = {
  et?: string;
  latin?: string[];
  english?: string[];
};

type MatchType = "latin" | "english";

export type BirdNameMatch = {
  token: string;
  matchType: MatchType;
  estonianName: string;
};

export type PreparedBirdNameCorrection = {
  maskedText: string;
  matches: BirdNameMatch[];
};

type LookupEntry = {
  token: string;
  normalized: string;
  estonianName: string;
  matchType: MatchType;
};

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

function sortBySpecificity(entries: LookupEntry[]): LookupEntry[] {
  return [...entries].sort((a, b) => {
    if (a.matchType !== b.matchType) return a.matchType === "latin" ? -1 : 1;
    return b.token.length - a.token.length;
  });
}

function buildLookupEntries(): LookupEntry[] {
  const latinSeen = new Set<string>();
  const englishSeen = new Set<string>();
  const out: LookupEntry[] = [];

  for (const row of rawBirdNames as BirdNameRow[]) {
    const estonianName = normalizeWhitespace(row.et || "");
    if (!estonianName) continue;

    for (const latinName of row.latin || []) {
      const token = normalizeWhitespace(latinName);
      const normalized = normalizeLookupKey(token);
      if (!token || !normalized || latinSeen.has(normalized)) continue;
      latinSeen.add(normalized);
      out.push({ token, normalized, estonianName, matchType: "latin" });
    }

    for (const englishName of row.english || []) {
      const token = normalizeWhitespace(englishName);
      const normalized = normalizeLookupKey(token);
      const tokenCount = normalized.split(" ").filter(Boolean).length;
      if (!token || !normalized || tokenCount < 2 || englishSeen.has(normalized)) continue;
      englishSeen.add(normalized);
      out.push({ token, normalized, estonianName, matchType: "english" });
    }
  }

  return sortBySpecificity(out);
}

const LOOKUP_ENTRIES = buildLookupEntries();

function detectMatchesFromOriginalText(input: string): BirdNameMatch[] {
  const text = String(input || "");
  if (!text.trim()) return [];

  const matches: BirdNameMatch[] = [];
  const seen = new Set<string>();

  for (const entry of LOOKUP_ENTRIES) {
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(entry.token)})(?=[^\\p{L}]|$)`, "giu");
    const hit = pattern.exec(text);
    if (!hit) continue;

    const dedupeKey = `${entry.matchType}:${entry.normalized}:${entry.estonianName}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    matches.push({
      token: hit[2],
      matchType: entry.matchType,
      estonianName: entry.estonianName,
    });
  }

  return matches;
}

function maskMatches(input: string, matches: BirdNameMatch[]): string {
  let output = String(input || "");
  matches.forEach((match, index) => {
    const placeholder = `__BIRD_NAME_${index}__`;
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(match.token)})(?=[^\\p{L}]|$)`, "giu");
    output = output.replace(pattern, (_full, prefix: string) => `${prefix}${placeholder}`);
  });
  return output;
}

export function prepareBirdNameCorrectionFromOriginalText(input: string | null | undefined): PreparedBirdNameCorrection {
  const text = String(input || "");
  if (!text.trim()) return { maskedText: "", matches: [] };

  const matches = detectMatchesFromOriginalText(text);
  return {
    maskedText: maskMatches(text, matches),
    matches,
  };
}

export function applyBirdNameCorrections(maskedTranslatedText: string | null | undefined, matches: BirdNameMatch[], logContext: string): string {
  let output = String(maskedTranslatedText || "");
  if (!output.trim() || matches.length === 0) return output;

  const summary: Array<{ original: string; match_type: MatchType; replacement: string; replacement_count: number }> = [];

  matches.forEach((match, index) => {
    const placeholder = `__BIRD_NAME_${index}__`;
    const pattern = new RegExp(escapeRegex(placeholder), "g");
    const count = (output.match(pattern) || []).length;
    output = output.replace(pattern, match.estonianName);
    summary.push({
      original: match.token,
      match_type: match.matchType,
      replacement: match.estonianName,
      replacement_count: count,
    });
  });

  if (summary.some((entry) => entry.replacement_count > 0)) {
    console.log("[news-bird-names]", {
      context: logContext,
      corrections: summary.filter((entry) => entry.replacement_count > 0),
    });
  }

  return output;
}
