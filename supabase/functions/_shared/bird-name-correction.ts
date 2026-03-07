import rawBirdNames from "./eoy-bird-names.json" with { type: "json" };

type BirdNameRow = {
  et?: string;
  latin?: string[];
  english?: string[];
};

type BirdLookupIndex = {
  latinEntries: Array<[string, string]>;
  englishEntries: Array<[string, string]>;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function sortByLengthDesc<T extends [string, string]>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b[0].length - a[0].length);
}

function createLookup(): BirdLookupIndex {
  const latinMap = new Map<string, string>();
  const englishMap = new Map<string, string>();

  for (const row of rawBirdNames as BirdNameRow[]) {
    const et = normalizeWhitespace(row.et || "");
    if (!et) continue;

    for (const latinName of row.latin || []) {
      const normalized = normalizeLookupKey(latinName);
      if (!normalized || latinMap.has(normalized)) continue;
      latinMap.set(normalized, et);
    }

    for (const englishName of row.english || []) {
      const normalized = normalizeLookupKey(englishName);
      const tokenCount = normalized.split(" ").filter(Boolean).length;
      if (tokenCount < 2) continue;
      if (!normalized || englishMap.has(normalized)) continue;
      englishMap.set(normalized, et);
    }
  }

  return {
    latinEntries: sortByLengthDesc(Array.from(latinMap.entries())),
    englishEntries: sortByLengthDesc(Array.from(englishMap.entries())),
  };
}

const LOOKUP = createLookup();

type ReplacementHit = {
  matched: string;
  language: "latin" | "english";
  replacement: string;
};

function replaceExactNames(
  input: string,
  entries: Array<[string, string]>,
  language: "latin" | "english",
  hits: ReplacementHit[],
): string {
  let output = input;

  for (const [source, replacement] of entries) {
    if (!source || !replacement) continue;
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(source)})(?=[^\\p{L}]|$)`, "giu");
    output = output.replace(pattern, (full, prefix: string, matched: string) => {
      hits.push({ matched, language, replacement });
      return `${prefix}${replacement}`;
    });
  }

  return output;
}

export function correctBirdNamesToOfficialEstonian(input: string | null | undefined): string {
  const text = String(input || "");
  if (!text.trim()) return "";

  const hits: ReplacementHit[] = [];
  let corrected = replaceExactNames(text, LOOKUP.latinEntries, "latin", hits);
  corrected = replaceExactNames(corrected, LOOKUP.englishEntries, "english", hits);

  if (hits.length > 0) {
    console.log("[news-bird-names]", hits.slice(0, 12).map((hit) => ({
      matched: hit.matched,
      language: hit.language,
      replacement: hit.replacement,
    })));
  }

  return corrected;
}
