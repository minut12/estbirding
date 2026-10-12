// P128: the viewer's Elurikkus observer name (as it appears in Elurikkus records). Stored only on
// this device; the Linnuliigid map iframe (same origin) reads the same key for the species info
// modal's "Sinu viimane vaatlus" line.
export const ELURIKKUS_OBSERVER_KEY = 'estbirding.elurikkusObserver.v1';

export function loadElurikkusObserver(): string {
  try {
    return localStorage.getItem(ELURIKKUS_OBSERVER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveElurikkusObserver(name: string): void {
  try {
    const v = name.trim().normalize('NFC');
    if (v) localStorage.setItem(ELURIKKUS_OBSERVER_KEY, v);
    else localStorage.removeItem(ELURIKKUS_OBSERVER_KEY);
  } catch {
    // storage unavailable (private mode): the field simply does not persist
  }
}
