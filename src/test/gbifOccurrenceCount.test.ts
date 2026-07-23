import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { regionQuery, fetchGbifOccurrenceCount } from '@/lib/gbifOccurrenceCount';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('regionQuery', () => {
  it('builds &gadmGid=... when gadmGid is present', () => {
    expect(regionQuery({ gadmGid: 'USA.6_1' })).toBe('&gadmGid=USA.6_1');
  });

  it('prefers gadmGid over country when both are present', () => {
    expect(regionQuery({ country: 'US', gadmGid: 'USA.6_1' })).toBe('&gadmGid=USA.6_1');
  });

  it('builds &country=... when only country is present', () => {
    expect(regionQuery({ country: 'EE' })).toBe('&country=EE');
  });

  it('returns an empty string for an empty or missing region', () => {
    expect(regionQuery({})).toBe('');
    expect(regionQuery(undefined)).toBe('');
  });
});

describe('fetchGbifOccurrenceCount', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves taxonKey, fetches the region-filtered count, and caches within TTL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ usageKey: 2482507, matchType: 'EXACT' }))
      .mockResolvedValueOnce(jsonResponse({ count: 564716 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchGbifOccurrenceCount('Corvus brachyrhynchos', { gadmGid: 'USA.6_1' });
    expect(first).toBe(564716);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'https://api.gbif.org/v1/species/match?name=Corvus%20brachyrhynchos',
    );
    // Occurrence URL carries the scope's region fragment and limit=0.
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      'https://api.gbif.org/v1/occurrence/search?taxonKey=2482507&gadmGid=USA.6_1&limit=0',
    );

    // Second call within the 24h TTL: served from cache, no re-fetch.
    const second = await fetchGbifOccurrenceCount('Corvus brachyrhynchos', { gadmGid: 'USA.6_1' });
    expect(second).toBe(564716);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when the match finds no taxon (strict, then non-strict retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ matchType: 'NONE' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGbifOccurrenceCount('Nonexistus birdus', { country: 'EE' });
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('&strict=true');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('&strict=true');
  });

  it('returns null when the occurrence request is not ok', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ usageKey: 111, matchType: 'EXACT' }))
      .mockResolvedValueOnce(jsonResponse({}, false, 500));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGbifOccurrenceCount('Parus major', { country: 'EE' });
    expect(result).toBeNull();
  });
});
