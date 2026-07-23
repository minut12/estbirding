import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/avatar-storage', () => ({
  fetchSpeciesList: vi.fn(),
  notifyIframeUpdate: vi.fn(),
}));

vi.mock('@/lib/speciesMetaCloud', () => ({
  downloadSpeciesMetaJson: vi.fn(),
  saveSpeciesMetaBatchToCloud: vi.fn(async () => ({})),
}));

vi.mock('@/lib/gbifOccurrenceCount', () => ({
  fetchGbifOccurrenceCount: vi.fn(),
}));

vi.mock('@/lib/ebirdTaxon', () => ({
  fetchEbirdTaxon: vi.fn(),
}));

import UsaRarityClassifier from '@/features/settings/UsaRarityClassifier';
import { USA_CO_SCOPE } from '@/lib/mapScope';
import { fetchSpeciesList } from '@/lib/avatar-storage';
import { downloadSpeciesMetaJson, saveSpeciesMetaBatchToCloud } from '@/lib/speciesMetaCloud';
import { fetchGbifOccurrenceCount } from '@/lib/gbifOccurrenceCount';
import { fetchEbirdTaxon } from '@/lib/ebirdTaxon';

const CO_SPECIES = [
  'Rare Bird', 'Super Bird', 'Mega Bird', 'Code Bird',
  'Common Bird', 'Manual Bird', 'Noname Bird', 'Notfound Bird',
];

const CO_ITEMS: Record<string, { rarityLevel: string; scientificName?: string; ebirdCode?: string }> = {
  'Rare Bird': { rarityLevel: 'none', scientificName: 'Rara avis' },
  'Super Bird': { rarityLevel: 'none', scientificName: 'Super avis' },
  'Mega Bird': { rarityLevel: 'none', scientificName: 'Mega avis' },
  'Code Bird': { rarityLevel: 'none', ebirdCode: 'codbir' },
  'Common Bird': { rarityLevel: 'none', scientificName: 'Communis avis' },
  'Manual Bird': { rarityLevel: 'rare', scientificName: 'Manualis avis' },
  'Noname Bird': { rarityLevel: 'none' },
  'Notfound Bird': { rarityLevel: 'none', scientificName: 'Ignota avis' },
};

const COUNT_BY_SCI: Record<string, number | null> = {
  'Rara avis': 300_000,
  'Super avis': 150_000,
  'Mega avis': 50_000,
  'Codus birdus': 80_000,
  'Communis avis': 600_000,
  'Manualis avis': 50_000,
  'Ignota avis': null,
};

describe('UsaRarityClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchSpeciesList).mockImplementation(async (scope: { id: string }) =>
      scope.id === 'usa_co' ? [...CO_SPECIES] : [],
    );
    vi.mocked(downloadSpeciesMetaJson).mockImplementation(async (scope?: { id: string }) => ({
      version: 1 as const,
      updatedAt: '',
      items: (scope?.id === 'usa_co' ? CO_ITEMS : {}) as never,
    }));
    vi.mocked(fetchGbifOccurrenceCount).mockImplementation(async (sci: string) => COUNT_BY_SCI[sci] ?? null);
    vi.mocked(fetchEbirdTaxon).mockImplementation(async (code: string) =>
      code === 'codbir' ? ({ speciesCode: 'codbir', comName: '', sciName: 'Codus birdus' } as never) : null,
    );
  });

  it('previews banded changes and skips, then saves only eligible rarity changes', async () => {
    render(<UsaRarityClassifier scope={USA_CO_SCOPE} />);

    fireEvent.click(screen.getByRole('button', { name: 'Haruldused vaatluste järgi (USA)' }));

    // Preview dialog opens.
    await screen.findByText('Eelvaade — haruldused vaatluste järgi');

    // 4 changes (rare/super/mega/mega-via-ebird), 4 skips (>500k, käsitsi, nimi puudub, vaatlusi ei leitud).
    await screen.findByText(/Muudetakse:\s*4/);
    expect(screen.getByText(/Jäetakse vahele:\s*4/)).toBeInTheDocument();

    // Each skip reason tag is shown.
    expect(screen.getByText('>500k')).toBeInTheDocument();
    expect(screen.getByText('käsitsi')).toBeInTheDocument();
    expect(screen.getByText('nimi puudub')).toBeInTheDocument();
    expect(screen.getByText('vaatlusi ei leitud')).toBeInTheDocument();

    // Confirm.
    fireEvent.click(screen.getByRole('button', { name: 'Salvesta' }));

    await waitFor(() => expect(vi.mocked(saveSpeciesMetaBatchToCloud)).toHaveBeenCalledTimes(1));
    const [patches, scopeArg] = vi.mocked(saveSpeciesMetaBatchToCloud).mock.calls[0];
    expect((scopeArg as { id: string }).id).toBe('usa_co');
    expect(patches).toEqual({
      'Rare Bird': { rarityLevel: 'rare' },
      'Super Bird': { rarityLevel: 'super' },
      'Mega Bird': { rarityLevel: 'mega' },
      'Code Bird': { rarityLevel: 'mega' },
    });
  });
});
