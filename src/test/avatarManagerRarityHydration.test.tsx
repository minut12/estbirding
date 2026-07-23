import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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
  fetchSpeciesList: vi.fn(async () => ['American Crow', 'Blue Jay']),
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

import AvatarManager from '@/features/settings/AvatarManager';
import { USA_CO_SCOPE } from '@/lib/mapScope';
import { getScopedSpeciesMeta } from '@/lib/speciesMeta';
import { downloadSpeciesMetaJson, type SpeciesMetaCloudJson } from '@/lib/speciesMetaCloud';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const STORED_META: Record<string, { rarityLevel: 'none' | 'rare' | 'super' | 'mega'; ebirdCode: string; scientificName: string }> = {
  'American Crow': { rarityLevel: 'none', ebirdCode: 'amecro', scientificName: 'Corvus brachyrhynchos' },
  'Blue Jay': { rarityLevel: 'super', ebirdCode: 'blujay', scientificName: 'Cyanocitta cristata' },
};

async function selectSpecies(name: string) {
  const item = await screen.findByText(name);
  fireEvent.click(item);
  return waitFor(() => {
    const el = document.getElementById('rarityLevel') as HTMLSelectElement | null;
    expect(el).not.toBeNull();
    return el!;
  });
}

describe('AvatarManager rarity hydration', () => {
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
    vi.mocked(getScopedSpeciesMeta).mockImplementation(
      (name: string) => ({ name, resolvedKey: name, found: true, ...(STORED_META[name] ?? {}) }),
    );
    vi.mocked(downloadSpeciesMetaJson).mockImplementation(async () => ({
      version: 1 as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
      items: {},
    }));
  });

  it('keeps an unsaved Haruldus edit when a background cloud refresh lands', async () => {
    // Cloud JSON download resolves only when the test says so — after the user edit.
    const cloud = deferred<SpeciesMetaCloudJson>();
    vi.mocked(downloadSpeciesMetaJson).mockImplementation(() => cloud.promise);

    render(<AvatarManager scope={USA_CO_SCOPE} />);

    const raritySelect = await selectSpecies('American Crow');
    // Hydrated from stored meta: "Tavaline"
    expect(raritySelect.value).toBe('none');

    // User picks "Haruldane" but does not save yet.
    fireEvent.change(raritySelect, { target: { value: 'rare' } });
    expect(raritySelect.value).toBe('rare');

    // Background cloud refresh lands after the edit → setCloudItems(new object).
    await act(async () => {
      cloud.resolve({
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        items: { 'American Crow': { is_migrant: null, notify: false } },
      });
    });

    // The unsaved edit must survive the refresh.
    expect(raritySelect.value).toBe('rare');
  });

  it('hydrates stored values when a different species is selected after an edit', async () => {
    render(<AvatarManager scope={USA_CO_SCOPE} />);

    const raritySelect = await selectSpecies('American Crow');
    expect(raritySelect.value).toBe('none');
    fireEvent.change(raritySelect, { target: { value: 'rare' } });
    expect(raritySelect.value).toBe('rare');

    // Selecting another species is a real selection change → hydrate its stored meta.
    await selectSpecies('Blue Jay');
    await waitFor(() => expect(raritySelect.value).toBe('super'));

    // Re-selecting the first species re-hydrates its stored value (unsaved edit discarded).
    await selectSpecies('American Crow');
    await waitFor(() => expect(raritySelect.value).toBe('none'));
  });
});
