import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { broadcastGpsConfigToMapIframes } from '@/config/gpsConfig';

describe('broadcastGpsConfigToMapIframes', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('posts the GPS gate (disabled by default) to same-origin map iframes', () => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-map-iframe', 'true');
    document.body.appendChild(iframe);

    const postMessage = vi.fn();
    const win = iframe.contentWindow as Window;
    win.postMessage = postMessage as unknown as Window['postMessage'];

    broadcastGpsConfigToMapIframes();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'GPS_CONFIG', enabled: false },
      window.location.origin,
    );
  });
});
