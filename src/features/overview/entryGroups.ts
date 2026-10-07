// src/features/overview/entryGroups.ts
// P98: one Ulevaade card per species. Input = the already sorted list (sortEntries).
// A group sits where its first entry sat; items are newest first (stable on equal dates);
// idx = the entry's position in the input (entryDomId / MegaItem keep using it).
// Unverified entries and entries without species_lat are never merged.
export type GroupableEntry = {
  species_lat: string;
  date: string;
  data_integrity?: 'verified' | 'unverified';
};

export type EntryGroupItem<T> = { entry: T; idx: number };
export type EntryGroup<T> = { key: string; items: EntryGroupItem<T>[] };

export function groupEntriesBySpecies<T extends GroupableEntry>(sorted: T[]): EntryGroup<T>[] {
  const groups: EntryGroup<T>[] = [];
  const byKey = new Map<string, EntryGroup<T>>();
  sorted.forEach((entry, idx) => {
    const sp = String(entry.species_lat ?? '').toLowerCase().trim();
    const mergeable = sp !== '' && entry.data_integrity !== 'unverified';
    const key = mergeable ? sp : `__single_${idx}`;
    let g = mergeable ? byKey.get(key) : undefined;
    if (!g) {
      g = { key, items: [] };
      groups.push(g);
      if (mergeable) byKey.set(key, g);
    }
    g.items.push({ entry, idx });
  });
  for (const g of groups) {
    g.items = g.items
      .map((it, order) => ({ it, order }))
      .sort((a, b) => (b.it.entry.date || '').localeCompare(a.it.entry.date || '') || a.order - b.order)
      .map((x) => x.it);
  }
  return groups;
}
