import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { fetchGbifOccurrenceCount } from '@/lib/gbifOccurrenceCount';

const EBIRD_EOD_DATASET_KEY = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('fetchGbifOccurrenceCount', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves taxonKey, fetches the global eBird-EOD count, and caches within TTL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ usageKey: 2482802, matchType: 'EXACT' }))
      .mockResolvedValueOnce(jsonResponse({ count: 794353 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchGbifOccurrenceCount('Empidonax virescens');
    expect(first).toBe(794353);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'https://api.gbif.org/v1/species/match?name=Empidonax%20virescens',
    );
    // Occurrence URL is global + filtered to the eBird Observation Dataset — no region.
    const occurrenceUrl = String(fetchMock.mock.calls[1][0]);
    expect(occurrenceUrl).toContain(
      `https://api.gbif.org/v1/occurrence/search?taxonKey=2482802&datasetKey=${EBIRD_EOD_DATASET_KEY}&limit=0`,
    );
    expect(occurrenceUrl).not.toContain('country=');
    expect(occurrenceUrl).not.toContain('gadmGid=');

    // Second call within the 24h TTL: served from cache, no re-fetch.
    const second = await fetchGbifOccurrenceCount('Empidonax virescens');
    expect(second).toBe(794353);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches the count under a region-independent `<taxonKey>|eod` key', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ usageKey: 2482802, matchType: 'EXACT' }))
      .mockResolvedValueOnce(jsonResponse({ count: 794353 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchGbifOccurrenceCount('Empidonax virescens');
    const cache = JSON.parse(localStorage.getItem('estbirding.gbifObsCount.v1') || '{}');
    expect(Object.keys(cache)).toEqual(['2482802|eod']);
    expect(cache['2482802|eod'].count).toBe(794353);
  });

  it('returns null when the match finds no taxon (strict, then non-strict retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ matchType: 'NONE' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGbifOccurrenceCount('Nonexistus birdus');
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

    const result = await fetchGbifOccurrenceCount('Parus major');
    expect(result).toBeNull();
  });
});
