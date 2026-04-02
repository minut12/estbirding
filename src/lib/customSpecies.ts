const CUSTOM_SPECIES_KEY = "estbirding.customSpecies.v1";

export function loadCustomSpecies(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SPECIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s: unknown) => typeof s === "string" && s.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveCustomSpecies(list: string[]): void {
  const unique = [...new Set(list.filter((s) => s.trim().length > 0))];
  unique.sort((a, b) => a.localeCompare(b, "et"));
  localStorage.setItem(CUSTOM_SPECIES_KEY, JSON.stringify(unique));
}

export function addCustomSpecies(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const existing = loadCustomSpecies();
  if (existing.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return false;
  existing.push(trimmed);
  saveCustomSpecies(existing);
  return true;
}

export function removeCustomSpecies(name: string): void {
  const existing = loadCustomSpecies();
  const filtered = existing.filter((s) => s.toLowerCase() !== name.trim().toLowerCase());
  saveCustomSpecies(filtered);
}

export function isCustomSpecies(name: string): boolean {
  const existing = loadCustomSpecies();
  return existing.some((s) => s.toLowerCase() === name.trim().toLowerCase());
}
