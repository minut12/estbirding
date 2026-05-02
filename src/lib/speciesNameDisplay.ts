// Display casing for Estonian bird names.
//
// Keys inside the canonical species_meta_v1.json (Supabase Storage:
// bird-avatars/meta/species_meta_v1.json) pass through normalizeSpeciesName
// before being written. That normalization fixes mojibake, strips the
// replacement character, and trims — it does NOT change letter case.
// In practice keys are stored in leading-cap form ("Punakurk-kaur") matching
// EOÜ convention. This helper exists so consumers that build their own
// strings from those keys (or from any other lowercased source) end up with
// the same display form.
//
// The Estonian bird-name convention is leading-cap only — internal segments
// after a hyphen stay lowercase ("Lühinokk-hani", not "Lühinokk-Hani").
//
// Sync target: this casing rule is also implemented inline in the n8n
// workflow `vaatluste-koordinaator`, Code Node 1 (see
// docs/vaatluste-koordinaator.md). If the convention changes — e.g. ICZN-
// style title case for compound names — update both this module and the
// n8n Code Node together. Grep for `toDisplayCase` to find call sites.

export function toDisplayCase(name: string): string {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
