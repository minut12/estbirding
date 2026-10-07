import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvatarCandidate, AvatarCredit } from '@/lib/avatarCandidates';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/avatarCandidates', () => ({
  searchAvatarCandidates: vi.fn(),
  fetchCandidateImageFile: vi.fn(),
  candidateToCredit: (c: AvatarCandidate): AvatarCredit => ({
    author: c.author,
    source: c.source,
    license: c.license,
    licenseUrl: c.licenseUrl,
    pageUrl: c.pageUrl,
  }),
}));

import { toast } from 'sonner';
import { AvatarPickerSheet } from '@/features/settings/AvatarPickerSheet';
import { fetchCandidateImageFile, searchAvatarCandidates } from '@/lib/avatarCandidates';

function makeCandidate(source: AvatarCandidate['source'], n: number): AvatarCandidate {
  return {
    id: `${source}-${n}`,
    source,
    thumbUrl: `https://img.example/${source}/${n}.jpg`,
    fullUrl: `https://img.example/${source}/${n}-full.jpg`,
    author: `${source === 'inaturalist' ? 'Inat' : 'Wiki'} Author ${n}`,
    license: n % 2 === 0 ? 'cc-by' : 'cc0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    pageUrl: `https://page.example/${source}/${n}`,
  };
}

function makeList(source: AvatarCandidate['source'], count: number): AvatarCandidate[] {
  return Array.from({ length: count }, (_, i) => makeCandidate(source, i + 1));
}

type RenderOptions = {
  onPicked?: (file: File, credit: AvatarCredit) => Promise<void>;
  onOpenChange?: (open: boolean) => void;
};

function renderSheet(options: RenderOptions = {}) {
  const onPicked = options.onPicked ?? vi.fn(async () => undefined);
  const onOpenChange = options.onOpenChange ?? vi.fn();
  const onUploadOwn = vi.fn();
  render(
    <AvatarPickerSheet
      open
      onOpenChange={onOpenChange}
      speciesName="Hallhaigur"
      scientificName="Ardea cinerea"
      onPicked={onPicked}
      onUploadOwn={onUploadOwn}
    />,
  );
  return { onPicked, onOpenChange, onUploadOwn };
}

function tiles(): HTMLElement[] {
  return screen.queryAllByRole('button').filter((el) => el.hasAttribute('aria-pressed'));
}

describe('AvatarPickerSheet', () => {
  beforeEach(() => {
    vi.mocked(searchAvatarCandidates).mockReset();
    vi.mocked(fetchCandidateImageFile).mockReset();
    vi.mocked(toast.error).mockClear();
  });

  it('shows source counts and switches to Wikimedia tiles', async () => {
    vi.mocked(searchAvatarCandidates).mockResolvedValue([...makeList('inaturalist', 3), ...makeList('wikimedia', 2)]);
    renderSheet();

    const inat = await screen.findByRole('radio', { name: 'iNaturalist (3)' });
    const wiki = screen.getByRole('radio', { name: 'Wikimedia (2)' });
    expect(inat).toHaveAttribute('aria-checked', 'true');
    expect(tiles()).toHaveLength(3);
    expect(screen.getByText(/Inat Author 1/)).toBeInTheDocument();

    fireEvent.click(wiki);
    expect(wiki).toHaveAttribute('aria-checked', 'true');
    expect(tiles()).toHaveLength(2);
    expect(screen.getByText(/Wiki Author 2/)).toBeInTheDocument();
    expect(screen.queryByText(/Inat Author 1/)).not.toBeInTheDocument();
    expect(vi.mocked(searchAvatarCandidates)).toHaveBeenCalledWith('Ardea cinerea');
  });

  it('shows the first 6 tiles and reveals the rest on demand', async () => {
    vi.mocked(searchAvatarCandidates).mockResolvedValue(makeList('inaturalist', 9));
    renderSheet();

    await screen.findByRole('radio', { name: 'iNaturalist (9)' });
    expect(tiles()).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: /N.ita rohkem/ }));
    expect(tiles()).toHaveLength(9);
    expect(screen.queryByRole('button', { name: /N.ita rohkem/ })).not.toBeInTheDocument();
  });

  it('starts on Wikimedia when iNaturalist has no results', async () => {
    vi.mocked(searchAvatarCandidates).mockResolvedValue(makeList('wikimedia', 2));
    renderSheet();

    const wiki = await screen.findByRole('radio', { name: 'Wikimedia (2)' });
    expect(wiki).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'iNaturalist (0)' })).toHaveAttribute('aria-checked', 'false');
    expect(tiles()).toHaveLength(2);
  });

  it('shows the empty state when both sources are empty', async () => {
    vi.mocked(searchAvatarCandidates).mockResolvedValue([]);
    renderSheet();

    await screen.findByText('Pilte ei leitud');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('shows the error state and retries the search', async () => {
    vi.mocked(searchAvatarCandidates)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(makeList('inaturalist', 2));
    renderSheet();

    await screen.findByText(/Pildiotsing eba.nnestus/);
    fireEvent.click(screen.getByRole('button', { name: 'Proovi uuesti' }));

    await screen.findByRole('radio', { name: 'iNaturalist (2)' });
    expect(vi.mocked(searchAvatarCandidates)).toHaveBeenCalledTimes(2);
    expect(tiles()).toHaveLength(2);
  });

  it('fetches the selected candidate, passes its credit to onPicked and closes', async () => {
    const list = makeList('inaturalist', 3);
    vi.mocked(searchAvatarCandidates).mockResolvedValue(list);
    const file = new File(['x'], 'inaturalist-2.jpg', { type: 'image/jpeg' });
    vi.mocked(fetchCandidateImageFile).mockResolvedValue(file);
    const { onPicked, onOpenChange } = renderSheet();

    await screen.findByRole('radio', { name: 'iNaturalist (3)' });
    const useButton = screen.getByRole('button', { name: 'Kasuta seda pilti' });
    expect(useButton).toBeDisabled();

    fireEvent.click(tiles()[1]);
    expect(tiles()[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Eelvaade kaardil')).toBeInTheDocument();
    expect(screen.getByText('Foto: Inat Author 2 / iNaturalist, CC BY')).toBeInTheDocument();

    fireEvent.click(useButton);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(vi.mocked(fetchCandidateImageFile)).toHaveBeenCalledWith(list[1]);
    expect(onPicked).toHaveBeenCalledWith(file, {
      author: 'Inat Author 2',
      source: 'inaturalist',
      license: 'cc-by',
      licenseUrl: list[1].licenseUrl,
      pageUrl: list[1].pageUrl,
    });
  });

  it('keeps the sheet open and toasts when the image fetch fails', async () => {
    vi.mocked(searchAvatarCandidates).mockResolvedValue(makeList('inaturalist', 2));
    vi.mocked(fetchCandidateImageFile).mockRejectedValue(new Error('avatar_fetch_failed_502'));
    const { onPicked, onOpenChange } = renderSheet();

    await screen.findByRole('radio', { name: 'iNaturalist (2)' });
    fireEvent.click(tiles()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Kasuta seda pilti' }));

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/Pildi laadimine eba.nnestus/);
    expect(onPicked).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kasuta seda pilti' })).toBeEnabled());
  });
});
