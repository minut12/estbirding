import lookup from './birdNameLookup.json';

type MatchType = 'latin' | 'english';

type BirdMatch = {
  token: string;
  tokenKey: string;
  matchType: MatchType;
  estonianName: string;
};

const latinEntries = Object.entries(lookup.latin).sort((a, b) => b[0].length - a[0].length);
const englishEntries = Object.entries(lookup.english).sort((a, b) => b[0].length - a[0].length);

function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLookupKey(value: string): string {
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

function findBirdMatches(originalText: string): BirdMatch[] {
  const text = String(originalText || '');
  if (!text.trim()) return [];

  const matches: BirdMatch[] = [];
  const seen = new Set<string>();

  for (const [latinKey, estonianName] of latinEntries) {
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(latinKey)})(?=[^\\p{L}]|$)`, 'giu');
    const hit = pattern.exec(text);
    if (!hit) continue;
    const dedupe = `latin:${latinKey}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    matches.push({ token: hit[2], tokenKey: latinKey, matchType: 'latin', estonianName });
  }

  for (const [englishKey, estonianName] of englishEntries) {
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(englishKey)})(?=[^\\p{L}]|$)`, 'giu');
    const hit = pattern.exec(text);
    if (!hit) continue;
    const dedupe = `english:${englishKey}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    matches.push({ token: hit[2], tokenKey: englishKey, matchType: 'english', estonianName });
  }

  return matches.sort((a, b) => {
    if (a.matchType !== b.matchType) return a.matchType === 'latin' ? -1 : 1;
    return b.token.length - a.token.length;
  });
}

export function correctTranslatedBirdText(translatedText: string, originalText: string, articleId: string): string {
  let output = String(translatedText || '');
  if (!output.trim()) return output;

  const matches = findBirdMatches(originalText);
  if (matches.length === 0) return output;

  const logs: Array<{ matched: string; type: MatchType; replacement: string; count: number }> = [];

  for (const match of matches) {
    let count = 0;

    if (match.matchType === 'latin') {
      const latinPattern = new RegExp(
        `([\\p{L}-]+(?:\\s+[\\p{L}-]+){0,5})\\s*\\(\\s*${escapeRegex(match.token)}\\s*\\)`,
        'giu',
      );
      output = output.replace(latinPattern, () => {
        count += 1;
        return `${match.estonianName} (${match.token})`;
      });

      const bareLatinPattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(match.token)})(?=[^\\p{L}]|$)`, 'giu');
      output = output.replace(bareLatinPattern, (_full, prefix: string) => {
        count += 1;
        return `${prefix}${match.estonianName} (${match.token})`;
      });
    } else {
      const englishPattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(match.token)})(?=[^\\p{L}]|$)`, 'giu');
      output = output.replace(englishPattern, (_full, prefix: string) => {
        count += 1;
        return `${prefix}${match.estonianName}`;
      });
    }

    if (count > 0) {
      logs.push({
        matched: match.token,
        type: match.matchType,
        replacement: match.estonianName,
        count,
      });
    }
  }

  if (logs.length > 0 && import.meta.env.DEV) {
    console.info('[news-bird-names]', {
      articleId,
      matchedSpeciesCount: logs.length,
      replacements: logs.slice(0, 5),
    });
  }

  return output;
}

export function normalizeBirdLookupKey(value: string): string {
  return normalizeLookupKey(value);
}
