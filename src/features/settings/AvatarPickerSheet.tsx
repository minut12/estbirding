import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  candidateToCredit,
  fetchCandidateImageFile,
  searchAvatarCandidates,
  type AvatarCandidate,
  type AvatarCredit,
  type AvatarLicense,
  type AvatarSource,
} from '@/lib/avatarCandidates';

const DESKTOP_PICKER_QUERY = '(min-width: 901px)';
const INITIAL_VISIBLE = 6;

const LICENSE_LABELS: Record<AvatarLicense, string> = {
  cc0: 'CC0',
  'cc-by': 'CC BY',
  'cc-by-sa': 'CC BY-SA',
};

const SOURCE_LABELS: Record<AvatarSource, string> = {
  inaturalist: 'iNaturalist',
  wikimedia: 'Wikimedia',
};

const SOURCE_ORDER: ReadonlyArray<AvatarSource> = ['inaturalist', 'wikimedia'];

export function licenseLabel(license: AvatarLicense): string {
  return LICENSE_LABELS[license];
}

export function sourceLabel(source: AvatarSource): string {
  return SOURCE_LABELS[source];
}

/** "Foto: author / Source, Licence" - shared by the picker preview and AvatarManager. */
export function creditLine(credit: Pick<AvatarCredit, 'author' | 'source' | 'license'>): string {
  return `Foto: ${credit.author} / ${sourceLabel(credit.source)}, ${licenseLabel(credit.license)}`;
}

function useIsDesktopPicker(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(DESKTOP_PICKER_QUERY).matches
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(DESKTOP_PICKER_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

type SearchStatus = 'idle' | 'loading' | 'error' | 'ready';

export type AvatarPickerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  speciesName: string;
  scientificName: string;
  onPicked: (file: File, credit: AvatarCredit) => Promise<void>;
  onUploadOwn: () => void;
};

export function AvatarPickerSheet({
  open,
  onOpenChange,
  speciesName,
  scientificName,
  onPicked,
  onUploadOwn,
}: AvatarPickerSheetProps) {
  const isDesktop = useIsDesktopPicker();
  const cacheRef = useRef<Map<string, AvatarCandidate[]>>(new Map());
  const requestRef = useRef(0);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [candidates, setCandidates] = useState<AvatarCandidate[]>([]);
  const [source, setSource] = useState<AvatarSource>('inaturalist');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const applyResults = useCallback((results: AvatarCandidate[]) => {
    const hasInat = results.some((c) => c.source === 'inaturalist');
    const hasWiki = results.some((c) => c.source === 'wikimedia');
    setCandidates(results);
    setSource(!hasInat && hasWiki ? 'wikimedia' : 'inaturalist');
    setSelectedId(null);
    setShowAll(false);
    setStatus('ready');
  }, []);

  const load = useCallback(async (name: string, bypassCache: boolean) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const cached = bypassCache ? undefined : cacheRef.current.get(name);
    if (cached) {
      applyResults(cached);
      return;
    }
    setStatus('loading');
    setSelectedId(null);
    try {
      const results = await searchAvatarCandidates(name);
      if (requestId !== requestRef.current) return;
      cacheRef.current.set(name, results);
      applyResults(results);
    } catch {
      if (requestId !== requestRef.current) return;
      setCandidates([]);
      setStatus('error');
    }
  }, [applyResults]);

  const trimmedName = scientificName.trim();

  useEffect(() => {
    setSelectedId(null);
    setShowAll(false);
    if (!open) {
      requestRef.current += 1;
      return;
    }
    if (!trimmedName) return;
    void load(trimmedName, false);
  }, [open, trimmedName, load]);

  const counts: Record<AvatarSource, number> = {
    inaturalist: candidates.filter((c) => c.source === 'inaturalist').length,
    wikimedia: candidates.filter((c) => c.source === 'wikimedia').length,
  };
  const sourceCandidates = candidates.filter((c) => c.source === source);
  const visibleCandidates = showAll ? sourceCandidates : sourceCandidates.slice(0, INITIAL_VISIBLE);
  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  const handleSourceChange = (next: AvatarSource) => {
    if (next === source) return;
    setSource(next);
    setSelectedId(null);
    setShowAll(false);
  };

  const handleUploadOwn = () => {
    onOpenChange(false);
    onUploadOwn();
  };

  const handleUse = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      let file: File;
      try {
        file = await fetchCandidateImageFile(selected);
      } catch {
        toast.error('Pildi laadimine eba\u00f5nnestus');
        return;
      }
      try {
        await onPicked(file, candidateToCredit(selected));
      } catch {
        // onPicked already reported the failure; keep the sheet open.
        return;
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const renderBody = () => {
    if (!trimmedName) return null;
    if (status === 'loading' || status === 'idle') {
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" />
          Otsin pilte&hellip;
        </p>
      );
    }
    if (status === 'error') {
      return (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-destructive">Pildiotsing eba&otilde;nnestus</p>
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => { void load(trimmedName, true); }}
          >
            Proovi uuesti
          </button>
        </div>
      );
    }
    if (candidates.length === 0) {
      return <p className="text-sm text-muted-foreground">Pilte ei leitud</p>;
    }
    return (
      <div className="space-y-3">
        <div className="flex gap-2" role="radiogroup" aria-label="Pildi allikas">
          {SOURCE_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={source === s}
              onClick={() => handleSourceChange(s)}
              className={cn(
                'flex-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                source === s
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted',
              )}
            >
              {`${sourceLabel(s)} (${counts[s]})`}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">
          Ainult &auml;rilist kasutust lubavad litsentsid (CC0, CC BY, CC BY-SA)
        </p>
        {sourceCandidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Pilte ei leitud</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleCandidates.map((c) => {
              const isSelected = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedId(c.id)}
                  className="min-w-0 space-y-1 text-left"
                >
                  <span className="relative block">
                    <img
                      src={c.thumbUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className={cn(
                        'h-[132px] w-full rounded-xl object-cover',
                        isSelected && 'outline outline-[3px] outline-primary',
                      )}
                    />
                    {isSelected && (
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">&copy; {c.author}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                      {licenseLabel(c.license)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!showAll && sourceCandidates.length > INITIAL_VISIBLE && (
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setShowAll(true)}>
            N&auml;ita rohkem
          </Button>
        )}
        {selected && (
          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <img
              src={selected.thumbUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-[72px] w-[72px] shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">Eelvaade kaardil</p>
              <p className="text-xs text-muted-foreground break-words">{creditLine(selected)}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className={cn(
          'flex flex-col gap-0 overflow-y-auto p-0 [&>button:last-child]:hidden',
          isDesktop
            ? 'w-full sm:max-w-md'
            : 'mx-auto max-h-[85vh] w-full rounded-t-2xl sm:max-w-lg',
        )}
      >
        <div className="flex items-start gap-2 px-5 pt-5">
          <SheetHeader className="min-w-0 flex-1 text-left">
            <SheetTitle>Vali pilt</SheetTitle>
            <SheetDescription>
              {speciesName} &middot; <i>{scientificName}</i>
            </SheetDescription>
          </SheetHeader>
          <SheetClose
            className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Sulge"
          >
            <X className="h-4 w-4" />
          </SheetClose>
        </div>

        <div className="flex-1 space-y-4 px-5 py-4">
          {renderBody()}
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            onClick={handleUploadOwn}
          >
            Lae oma pilt &uuml;les
          </button>
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background px-5 py-3">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            T&uuml;hista
          </Button>
          <Button
            type="button"
            className="flex-1 gap-1.5"
            disabled={!selected || busy}
            onClick={() => { void handleUse(); }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Kasuta seda pilti
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
