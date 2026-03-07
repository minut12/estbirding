import linnudTsv from '../../../data/Linnud.txt?raw';

type MatchType = 'latin' | 'english';

type BirdMatch = {
  token: string;
  matchType: MatchType;
  estonianName: string;
};

function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/[()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitAliases(value: string): string[] {
  return normalizeWhitespace(value)
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

function stripEstonianNotes(value: string): string {
  return normalizeWhitespace(value).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildLookupMaps() {
  const lines = String(linnudTsv || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = lines[0]?.split('\t').map((cell) => normalizeWhitespace(cell)) || [];
  const latinIndex = header.indexOf('nimi_lk');
  const estonianIndex = header.indexOf('nimi_ek');
  const englishIndex = header.indexOf('nimi_ik');

  const latinToEt = new Map<string, string>();
  const englishToEt = new Map<string, string>();

  for (const line of lines.slice(1)) {
    const cells = line.split('\t');
    const estonianName = stripEstonianNotes(cells[estonianIndex] || '');
    if (!estonianName) continue;

    for (const latin of splitAliases(cells[latinIndex] || '')) {
      const key = normalizeKey(latin);
      if (key && !latinToEt.has(key)) latinToEt.set(key, estonianName);
    }

    for (const english of splitAliases(cells[englishIndex] || '')) {
      const key = normalizeKey(english);
      if (key && !englishToEt.has(key)) englishToEt.set(key, estonianName);
    }
  }

  return { latinToEt, englishToEt };
}

const LOOKUPS = buildLookupMaps();

function detectBirdMatches(originalText: string): BirdMatch[] {
  const text = String(originalText || '');
  if (!text.trim()) return [];

  const matches: BirdMatch[] = [];
  const seen = new Set<string>();

  const latinEntries = Array.from(LOOKUPS.latinToEt.entries()).sort((a, b) => b[0].length - a[0].length);
  const englishEntries = Array.from(LOOKUPS.englishToEt.entries()).sort((a, b) => b[0].length - a[0].length);

  for (const [latin, estonianName] of latinEntries) {
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(latin)})(?=[^\\p{L}]|$)`, 'giu');
    const hit = pattern.exec(text);
    if (!hit) continue;
    const key = `latin:${latin}:${estonianName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ token: hit[2], matchType: 'latin', estonianName });
  }

  for (const [english, estonianName] of englishEntries) {
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(english)})(?=[^\\p{L}]|$)`, 'giu');
    const hit = pattern.exec(text);
    if (!hit) continue;
    const key = `english:${english}:${estonianName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ token: hit[2], matchType: 'english', estonianName });
  }

  return matches.sort((a, b) => {
    if (a.matchType !== b.matchType) return a.matchType === 'latin' ? -1 : 1;
    return b.token.length - a.token.length;
  });
}

export function correctTranslatedBirdSpecies(translatedText: string, originalText: string, logContext: string): string {
  let output = String(translatedText || '');
  const matches = detectBirdMatches(originalText);
  if (!output.trim() || matches.length === 0) return output;

  const logs: Array<{ matched_token: string; match_type: MatchType; replacement: string; replacement_count: number }> = [];

  for (const match of matches) {
    let replacementCount = 0;

    if (match.matchType === 'latin') {
      const phraseWithLatin = new RegExp(`([\\p{L}-]+(?:\\s+[\\p{L}-]+){0,5})\\s*\\(\\s*${escapeRegex(match.token)}\\s*\\)`, 'giu');
      output = output.replace(phraseWithLatin, () => {
        replacementCount += 1;
        return `${match.estonianName} (${match.token})`;
      });

      const bareLatin = new RegExp(`(^|[^\\p{L}])(${escapeRegex(match.token)})(?=[^\\p{L}]|$)`, 'giu');
      output = output.replace(bareLatin, (_full, prefix: string) => {
        replacementCount += 1;
        return `${prefix}${match.estonianName} (${match.token})`;
      });
    } else {
      const englishPattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(match.token)})(?=[^\\p{L}]|$)`, 'giu');
      output = output.replace(englishPattern, (_full, prefix: string) => {
        replacementCount += 1;
        return `${prefix}${match.estonianName}`;
      });
    }

    if (replacementCount > 0) {
      logs.push({
        matched_token: match.token,
        match_type: match.matchType,
        replacement: match.estonianName,
        replacement_count: replacementCount,
      });
    }
  }

  if (logs.length > 0 && import.meta.env.DEV) {
    console.info('[news-bird-names]', { context: logContext, corrections: logs });
  }

  return output;
}
