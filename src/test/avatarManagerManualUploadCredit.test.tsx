import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

vi.mock('@/lib/avatarCandidates', () => ({
  searchAvatarCandidates: vi.fn(async () => []),
  fetchCandidateImageFile: vi.fn(),
  candidateToCredit: vi.fn(),
}));

import AvatarManager from '@/features/settings/AvatarManager';
import { USA_CO_SCOPE } from '@/lib/mapScope';
import { getScopedSpeciesMeta } from '@/lib/speciesMeta';
import { processImage, uploadSharedAvatar } from '@/lib/avatar-storage';

describe('AvatarManager manual upload credit', () => {
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
    vi.mocked(processImage).mockResolvedValue('data:image/webp;base64,AAAA');
    vi.mocked(uploadSharedAvatar).mockClear();
  });

  it('saves a manually uploaded file with a null credit', async () => {
    render(<AvatarManager scope={USA_CO_SCOPE} />);
    fireEvent.click(await within(await screen.findByTestId('species-list')).findByText('American Crow'));
    await screen.findByRole('button', { name: 'Salvesta' });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'crow.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText('Eelvaade (salvestamata)');
    expect(screen.queryByText(/^Foto: /)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvesta' }));
    await waitFor(() => expect(vi.mocked(uploadSharedAvatar)).toHaveBeenCalledTimes(1));
    const call = vi.mocked(uploadSharedAvatar).mock.calls[0];
    expect(call[0]).toBe('American Crow');
    expect(call[1]).toBe('data:image/webp;base64,AAAA');
    expect(call[3]).toBeNull();
  });
});
