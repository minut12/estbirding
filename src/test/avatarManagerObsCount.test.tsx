import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/avatar-storage', () => ({
  getMergedAvatars: vi.fn(() => ({})),
  validateFile: vi.fn(() => null),
  processImage: vi.fn(async () => ''),
  notifyIframeUpdate: vi.fn(),
  uploadSharedAvatar: vi.fn(async () => ''),
  removeSharedAvatar: vi.fn(async () => undefined),
  fetchSpeciesList: vi.fn(async () => ['American Crow']),
  fetchSharedAvatars: vi.fn(async () => ({})),
}));

vi.mock('@/lib/speciesMeta', () => ({
  buildSpeciesMetaLookupFallback: vi.fn(() => ({})),
  getRariliinSpeciesMeta: vi.fn(() => ({})),
  getScopedSpeciesMeta: vi.fn(() => ({})),
  loadSpeciesMeta: vi.fn(),
  seedSpeciesMetaFallback: vi.fn(() => ({ changed: false })),
  upsertSpeciesMeta: vi.fn(),
}));

vi.mock('@/lib/speciesMetaCloud', () => ({
  SPECIES_META_LAST_SYNC_AT_KEY: 'estbirding.speciesMeta.lastSyncAt',
  downloadSpeciesMetaJson: vi.fn(async () => ({ version: 1, updatedAt: '', items: {} })),
  getSpeciesMetaSyncStatus: vi.fn(() => ({
    cloudLoaded: false,
    cloudUpdatedAt: '',
    localUpdatedAt: '',
    lastSyncAt: '',
    lastSyncError: '',
  })),
  refreshSpeciesMetaFromCloud: vi.fn(async () => undefined),
  saveSpeciesMetaToCloud: vi.fn(async () => ({})),
}));

vi.mock('@/lib/customSpecies', () => ({
  addCustomSpecies: vi.fn(() => true),
  removeCustomSpecies: vi.fn(),
  isCustomSpecies: vi.fn(() => false),
}));

vi.mock('@/lib/customSpeciesCloud', () => ({
  addCustomSpeciesToCloud: vi.fn(async () => undefined),
  removeCustomSpeciesFromCloud: vi.fn(async () => undefined),
  refreshCustomSpeciesFromCloud: vi.fn(async () => undefined),
}));

vi.mock('@/lib/ebirdTaxon', () => ({
  fetchEbirdTaxon: vi.fn(async () => null),
}));

vi.mock('@/lib/gbifOccurrenceCount', () => ({
  fetchGbifOccurrenceCount: vi.fn(async () => 794353),
}));

import AvatarManager from '@/features/settings/AvatarManager';
import { USA_CO_SCOPE } from '@/lib/mapScope';
import { getScopedSpeciesMeta } from '@/lib/speciesMeta';
import { saveSpeciesMetaToCloud } from '@/lib/speciesMetaCloud';
import { fetchGbifOccurrenceCount } from '@/lib/gbifOccurrenceCount';

describe('AvatarManager GBIF obs-count line', () => {
  beforeEach(() => {
    localStorage.clear();
    (window as Window & typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [],
      text: async () => '[]',
    } as unknown as Response);
    vi.mocked(getScopedSpeciesMeta).mockImplementation((name: string) => ({
      name,
      resolvedKey: name,
      found: true,
      rarityLevel: 'none' as const,
      ebirdCode: 'amecro',
      scientificName: 'Corvus brachyrhynchos',
    }));
    vi.mocked(fetchGbifOccurrenceCount).mockClear();
    vi.mocked(fetchGbifOccurrenceCount).mockImplementation(async () => 794353);
    vi.mocked(saveSpeciesMetaToCloud).mockClear();
  });

  async function selectAmericanCrow() {
    const item = await screen.findByText('American Crow');
    fireEvent.click(item);
  }

  it('renders the formatted global eBird count under the scientific name', async () => {
    render(<AvatarManager scope={USA_CO_SCOPE} />);
    await selectAmericanCrow();

    // The read-only line renders the global eBird label…
    await screen.findByText(/Vaatlusi kokku \(eBird\):/);
    // …and the et-EE formatted count (NBSP-family group separators normalized).
    await screen.findByText((content) => content.replace(/[  ]/g, ' ') === '794 353');

    // The lookup is keyed off the form's sciName only — no region argument.
    expect(vi.mocked(fetchGbifOccurrenceCount)).toHaveBeenCalledWith('Corvus brachyrhynchos');
  });

  it('never leaks an obs-count field into the cloud save patch', async () => {
    render(<AvatarManager scope={USA_CO_SCOPE} />);
    await selectAmericanCrow();
    await screen.findByRole('button', { name: 'Salvesta liigi seaded' });

    fireEvent.click(screen.getByRole('button', { name: 'Salvesta liigi seaded' }));

    await waitFor(() => expect(vi.mocked(saveSpeciesMetaToCloud)).toHaveBeenCalledTimes(1));
    const patch = vi.mocked(saveSpeciesMetaToCloud).mock.calls[0][1] as Record<string, unknown>;
    // Display-only guarantee: the patch carries exactly the existing meta fields.
    expect(Object.keys(patch).sort()).toEqual(
      ['avatarUrl', 'ebirdCode', 'is_migrant', 'notify', 'rarityLevel', 'scientificName'],
    );
    expect(Object.keys(patch).some((key) => /gbif|obs|count/i.test(key))).toBe(false);
  });
});
