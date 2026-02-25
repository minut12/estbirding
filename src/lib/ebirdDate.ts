export function parseObsDt(input: unknown): number | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }

  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }

  const d = new Date(raw);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

export function isInLast7Days(input: unknown, nowMs = Date.now()): boolean {
  const ts = parseObsDt(input);
  if (ts == null) return false;
  const cutoff = nowMs - (7 * 24 * 60 * 60 * 1000);
  return ts >= cutoff;
}