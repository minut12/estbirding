export function formatDateEE(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "";
  if (typeof input === "number") {
    const d = new Date(input);
    if (isNaN(d.getTime())) return String(input);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  }
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return "";
    return `${String(input.getDate()).padStart(2, "0")}.${String(input.getMonth() + 1).padStart(2, "0")}.${input.getFullYear()}`;
  }
  const raw = String(input).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function formatAgeEE(lastLoadedAt: string | number | Date | null | undefined, nowInput?: string | number | Date): string {
  if (lastLoadedAt === null || lastLoadedAt === undefined || lastLoadedAt === "") return "";
  const loadedAt = lastLoadedAt instanceof Date ? lastLoadedAt : new Date(lastLoadedAt);
  if (isNaN(loadedAt.getTime())) return formatDateEE(lastLoadedAt);
  const now = nowInput ? (nowInput instanceof Date ? nowInput : new Date(nowInput)) : new Date();
  if (isNaN(now.getTime())) return formatDateEE(lastLoadedAt);
  const diffMs = Math.max(0, now.getTime() - loadedAt.getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return formatDateEE(loadedAt);
}
