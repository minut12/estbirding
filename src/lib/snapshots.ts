export type Snapshot<T> = {
  version: string;
  createdAt: string;
  payload: T;
  meta?: Record<string, unknown>;
};

const PREFIX = "map_snapshot:";

function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

export async function saveSnapshot<T>(key: string, snapshot: Snapshot<T>): Promise<void> {
  localStorage.setItem(storageKey(key), JSON.stringify(snapshot));
}

export async function loadSnapshot<T>(key: string): Promise<Snapshot<T> | null> {
  const raw = localStorage.getItem(storageKey(key));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Snapshot<T>;
  } catch {
    return null;
  }
}

export async function clearSnapshot(key: string): Promise<void> {
  localStorage.removeItem(storageKey(key));
}
