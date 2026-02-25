export function fixMojibake(input: string): string {
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

export function normalizeUiText(input: string): string {
  return fixMojibake(input).replace(/\uFFFD/g, "").trim();
}

export function normalizeSpeciesName(input: string): string {
  return normalizeUiText(input);
}