import { describe, expect, it, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const store = { text: '' };
  return {
    store,
    download: vi.fn(async () => ({ data: { text: async () => store.text }, error: null })),
    upload: vi.fn(async (_path: string, blob: Blob) => {
      store.text = await blob.text();
      return { error: null };
    }),
  };
});

vi.mock('@/config/supabaseClient', () => ({
  supabase: { storage: { from: () => ({ download: h.download, upload: h.upload }) } },
  getSupabaseInitError: () => null,
}));

vi.mock('@/config/supabaseConfig', () => ({
  validateSupabaseConfig: () => ({ ok: true }),
}));

vi.mock('@/lib/speciesMeta', () => ({
  loadSpeciesMeta: () => ({}),
  replaceSpeciesMeta: vi.fn(),
  SPECIES_META_LOCAL_UPDATED_AT_KEY: 'estbirding.speciesMeta.local.updatedAt',
}));

vi.mock('@/lib/eventLog', () => ({ log: vi.fn() }));

import { saveSpeciesMetaBatchToCloud } from '@/lib/speciesMetaCloud';
import { replaceSpeciesMeta } from '@/lib/speciesMeta';
import { USA_CO_SCOPE } from '@/lib/mapScope';

// jsdom's Blob has no .text(); provide a minimal stand-in so the upload mock can
// read the JSON payload uploadSpeciesMetaJson serializes.
class TextBlob {
  private parts: string[];
  constructor(parts: unknown[]) { this.parts = parts.map((p) => String(p)); }
  async text() { return this.parts.join(''); }
}

describe('saveSpeciesMetaBatchToCloud', () => {
  beforeEach(() => {
    vi.stubGlobal('Blob', TextBlob);
    localStorage.clear();
    h.download.mockClear();
    h.upload.mockClear();
    vi.mocked(replaceSpeciesMeta).mockClear();
    h.store.text = JSON.stringify({
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      items: {
        Alpha: { rarityLevel: 'none', is_migrant: true, notify: true, avatarUrl: 'urlA', ebirdCode: 'alpcod', scientificName: 'Alpha sci' },
        Beta: { rarityLevel: 'none', is_migrant: false, notify: true, avatarUrl: 'urlB', scientificName: 'Beta sci' },
        Gamma: { rarityLevel: 'none', avatarUrl: 'urlG', scientificName: 'Gamma sci' },
      },
    });
  });

  it('merges all patches into ONE upload, preserving other per-species fields', async () => {
    await saveSpeciesMetaBatchToCloud(
      {
        Alpha: { rarityLevel: 'rare' },
        Beta: { rarityLevel: 'super' },
        Gamma: { rarityLevel: 'mega' },
      },
      USA_CO_SCOPE,
    );

    // Exactly one download + one upload — no per-species round-trips.
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(h.upload).toHaveBeenCalledTimes(1);

    const uploaded = JSON.parse(h.store.text);
    const items = Object.values(uploaded.items) as Array<Record<string, unknown>>;
    const byAvatar = (u: string) => items.find((i) => i.avatarUrl === u)!;

    expect(byAvatar('urlA')).toMatchObject({ rarityLevel: 'rare', is_migrant: true, notify: true, ebirdCode: 'alpcod', scientificName: 'Alpha sci' });
    expect(byAvatar('urlB')).toMatchObject({ rarityLevel: 'super', is_migrant: false, notify: true, scientificName: 'Beta sci' });
    expect(byAvatar('urlG')).toMatchObject({ rarityLevel: 'mega', avatarUrl: 'urlG' });

    // Local mirror + timestamps updated once.
    expect(vi.mocked(replaceSpeciesMeta)).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(USA_CO_SCOPE.speciesMetaCloudUpdatedAtKey)).toBeTruthy();
    expect(localStorage.getItem(USA_CO_SCOPE.speciesMetaLastSyncAtKey)).toBeTruthy();
  });

  it('no-ops (no upload) when given an empty patch set', async () => {
    await saveSpeciesMetaBatchToCloud({}, USA_CO_SCOPE);
    expect(h.upload).not.toHaveBeenCalled();
    expect(vi.mocked(replaceSpeciesMeta)).not.toHaveBeenCalled();
  });
});
