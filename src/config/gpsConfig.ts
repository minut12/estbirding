// Broadcasts the user's "allow GPS" gate to the same-origin map iframes.
// Mirrors broadcastSupabaseConfigToMapIframes() in supabaseConfig.ts.
import { isGpsEnabled } from '@/lib/settings';

export function broadcastGpsConfigToMapIframes(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const enabled = isGpsEnabled();
  const targetOrigin = window.location.origin;
  const iframes = Array.from(
    document.querySelectorAll('iframe[data-map-iframe="true"]'),
  ) as HTMLIFrameElement[];

  for (const iframe of iframes) {
    if (!iframe.contentWindow) continue;
    try {
      iframe.contentWindow.postMessage({ type: 'GPS_CONFIG', enabled }, targetOrigin);
    } catch {
      // iframe may be unloading — ignore
    }
  }
}
