const EVENTS_ADMIN_KEY_STORAGE = "events_admin_key";

export function getEventsAdminKey(): string | null {
  const value = localStorage.getItem(EVENTS_ADMIN_KEY_STORAGE);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function setEventsAdminKey(value: string): void {
  localStorage.setItem(EVENTS_ADMIN_KEY_STORAGE, value);
}

export function clearEventsAdminKey(): void {
  localStorage.removeItem(EVENTS_ADMIN_KEY_STORAGE);
}
