// The admin key is sourced from a Vite build-time env var
// (VITE_EVENTS_ADMIN_KEY). It is NOT user-configurable at runtime.
// Every admin sharing the same deployed build shares the same key.

export function getEventsAdminKey(): string {
  const raw = (import.meta.env.VITE_EVENTS_ADMIN_KEY ?? "") as string;
  return raw.trim();
}

export function hasEventsAdminKey(): boolean {
  return getEventsAdminKey().length > 0;
}
