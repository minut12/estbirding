import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const upsert = vi.fn();
  const upload = vi.fn();
  const getPublicUrl = vi.fn();
  const getSession = vi.fn();
  return { upsert, upload, getPublicUrl, getSession };
});

vi.mock('@/config/supabaseClient', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    functions: { invoke: vi.fn() },
    storage: {
      from: () => ({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl }),
    },
    from: () => ({ upsert: mocks.upsert }),
  },
}));

vi.mock('@/config/supabaseConfig', () => ({
  getSupabaseUrl: () => 'https://project.supabase.co',
  getSupabaseAnonKey: () => 'anon-key-value',
  validateSupabaseConfig: () => ({ ok: true }),
}));

import {
  AVATAR_CREDITS_LS_KEY,
  avatarCreditUrlKey,
  buildAvatarCreditMap,
  fetchCandidateImageFile,
  parseAvatarCredit,
  parseCandidatesResponse,
  type AvatarCandidate,
  type AvatarCredit,
} from '@/lib/avatarCandidates';
import { uploadSharedAvatar } from '@/lib/avatar-storage';

const inatItem = {
  id: 'inat-123',
  source: 'inaturalist',
  thumbUrl: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg',
  fullUrl: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg',
  author: 'Jane Doe',
  license: 'cc-by',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  pageUrl: 'https://www.inaturalist.org/observations/1',
};

const wikiItem = {
  id: 'wm-456',
  source: 'wikimedia',
  thumbUrl: 'https://upload.wikimedia.org/thumb/a.jpg',
  fullUrl: 'https://upload.wikimedia.org/a.jpg',
  author: 'John Roe',
  license: 'cc-by-sa',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  pageUrl: 'https://commons.wikimedia.org/wiki/File:A.jpg',
};

const validCredit: AvatarCredit = {
  author: 'Jane Doe',
  source: 'inaturalist',
  license: 'cc-by',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  pageUrl: 'https://www.inaturalist.org/observations/1',
};

describe('parseCandidatesResponse', () => {
  it('keeps valid iNaturalist and Wikimedia items and drops invalid ones', () => {
    const data = {
      ok: true,
      candidates: [
        inatItem,
        wikiItem,
        { ...inatItem, id: 'nc', license: 'cc-by-nc' },
        { ...inatItem, id: 'no-author', author: '' },
        { ...wikiItem, id: 'http', thumbUrl: 'http://upload.wikimedia.org/thumb/a.jpg' },
        { ...inatItem, id: 'flickr', source: 'flickr' },
      ],
    };

    const result = parseCandidatesResponse(data);

    expect(result.map((c) => c.id)).toEqual(['inat-123', 'wm-456']);
    expect(result[0].source).toBe('inaturalist');
    expect(result[1].license).toBe('cc-by-sa');
  });

  it('returns an empty list when ok is not true', () => {
    expect(parseCandidatesResponse({ ok: false, candidates: [inatItem] })).toEqual([]);
    expect(parseCandidatesResponse(null)).toEqual([]);
  });
});

describe('parseAvatarCredit', () => {
  it('returns null for null input', () => {
    expect(parseAvatarCredit(null)).toBeNull();
  });

  it('parses a valid credit', () => {
    expect(parseAvatarCredit({ ...validCredit, extra: 1 })).toEqual(validCredit);
  });

  it('omits licenseUrl when it is not a string', () => {
    const { licenseUrl: _ignored, ...withoutUrl } = validCredit;
    expect(parseAvatarCredit({ ...withoutUrl, licenseUrl: 5 })).toEqual(withoutUrl);
  });

  it('returns null for an unsupported licence', () => {
    expect(parseAvatarCredit({ ...validCredit, license: 'cc-by-nc' })).toBeNull();
  });
});

describe('avatarCreditUrlKey', () => {
  it('strips the ?v= query and the #fragment', () => {
    expect(avatarCreditUrlKey('https://cdn.example/a.webp?v=123#x')).toBe('https://cdn.example/a.webp');
  });

  it('returns null for http, empty and non-URL input', () => {
    expect(avatarCreditUrlKey('http://cdn.example/a.webp')).toBeNull();
    expect(avatarCreditUrlKey('')).toBeNull();
    expect(avatarCreditUrlKey('not a url')).toBeNull();
  });
});

describe('buildAvatarCreditMap', () => {
  it('keys by origin+pathname and skips null/invalid credits and unusable URLs', () => {
    const rows: unknown[] = [
      { species_key: 'linnuliigid:Rasvatihane', public_url: 'https://cdn.example/u1.webp?v=1', credit: validCredit },
      { species_key: 'rariliin:X', public_url: 'https://cdn.example/u2.webp', credit: { ...validCredit, source: 'wikimedia' } },
      { species_key: 'linnuliigid:Sinitihane', public_url: 'https://cdn.example/u3.webp', credit: null },
      { species_key: 'linnuliigid:Bad', public_url: 'https://cdn.example/u4.webp', credit: { ...validCredit, license: 'gfdl' } },
      { species_key: 'linnuliigid:NoUrl', credit: validCredit },
      { species_key: 'linnuliigid:Http', public_url: 'http://cdn.example/u6.webp', credit: validCredit },
      null,
    ];

    const map = buildAvatarCreditMap(rows);

    expect(Object.keys(map).sort()).toEqual(['https://cdn.example/u1.webp', 'https://cdn.example/u2.webp']);
    expect(map['https://cdn.example/u2.webp'].source).toBe('wikimedia');
  });
});

describe('fetchCandidateImageFile', () => {
  const candidate: AvatarCandidate = {
    id: 'inat-123',
    source: 'inaturalist',
    thumbUrl: inatItem.thumbUrl,
    fullUrl: inatItem.fullUrl,
    author: inatItem.author,
    license: 'cc-by',
    licenseUrl: inatItem.licenseUrl,
    pageUrl: inatItem.pageUrl,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the session token as Bearer and returns a typed File', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'user-jwt' } } });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob([new Uint8Array([1, 2, 3])]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg; charset=binary' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = await fetchCandidateImageFile(candidate);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://project.supabase.co/functions/v1/avatar-candidates');
    expect(headers.Authorization).toBe('Bearer user-jwt');
    expect(headers.Authorization).not.toContain('anon-key-value');
    expect(headers.apikey).toBe('anon-key-value');
    expect(JSON.parse(String(init.body))).toEqual({ action: 'fetch', url: candidate.thumbUrl });
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toBe('inat-123.jpg');
  });

  it('throws when there is no session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCandidateImageFile(candidate)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('uploadSharedAvatar credit', () => {
  const dataUrl = 'data:image/webp;base64,AAAA';

  beforeEach(() => {
    localStorage.clear();
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
    mocks.upload.mockReset().mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: 'https://cdn.example/a.webp' } });
  });

  it('writes credit: null when no credit is passed', async () => {
    await uploadSharedAvatar('Rasvatihane', dataUrl);

    const payload = mocks.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toHaveProperty('credit', null);
    expect(payload.species_key).toBe('linnuliigid:Rasvatihane');
  });

  it('writes the credit object and stores it locally under the unversioned public URL', async () => {
    localStorage.setItem('bm_avatar_credits_v1', JSON.stringify({ 'linnuliigid:Rasvatihane': validCredit }));

    await uploadSharedAvatar('Rasvatihane', dataUrl, undefined, validCredit);

    const payload = mocks.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.credit).toEqual(validCredit);
    expect(String(payload.public_url)).toContain('?v=');
    const stored: unknown = JSON.parse(localStorage.getItem(AVATAR_CREDITS_LS_KEY) || '{}');
    expect(stored).toEqual({ 'https://cdn.example/a.webp': validCredit });
    expect(localStorage.getItem('bm_avatar_credits_v1')).toBeNull();
  });
});
