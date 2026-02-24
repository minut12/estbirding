import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Newspaper, ChevronLeft, Archive, ArchiveRestore, ExternalLink,
  Search, RefreshCw, Loader2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isAutoTranslateNewsToEtEnabled } from '@/lib/settings';
import { isEstonianLocale, normalizeLocale, resolveAppLocale } from '@/lib/locale';
import { TranslateEtHttpError, translateEt, type TranslateEtOutput } from '@/lib/translateEt';
import { toast } from 'sonner';
import { resolveEndpoint, TRANSLATION_ENDPOINT_UPDATED_EVENT } from '@/config/translationEndpoint';

/* ── Types ──────────────────────────────────────── */
interface NewsItem {
  id: string;
  source_slug: string | null;
  source_key?: string | null;
  title: string;
  title_et?: string | null;
  summary: string | null;
  body: string | null;
  body_et?: string | null;
  content_html: string | null;
  url: string | null;
  permalink_url?: string | null;
  image_url?: string | null;
  fetched_at?: string | null;
  raw_json?: Record<string, any> | null;
  published_at: string;
  language: string | null;
  source_lang?: string | null;
  translated_at?: string | null;
  translation_status?: string | null;
  guid: string | null;
  archived: boolean;
}

interface NewsSource {
  id: string;
  name: string;
  slug: string;
  source_key?: string | null;
  key?: string | null;
}

/* ── Format date ────────────────────────────────── */
const ET_MONTHS = ['jaanuar','veebruar','märts','aprill','mai','juuni','juuli','august','september','oktoober','november','detsember'];
function formatEstDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()}. ${ET_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } catch { return iso; }
}

/* ── Source display names ───────────────────────── */
function sourceLabel(source: string | null | undefined, sources: NewsSource[]): string {
  if (!source) return 'EOU';
  const s = sources.find((it) => it.slug === source || it.source_key === source || it.key === source);
  return s?.name || source.toUpperCase();
}

function toPlainText(value: string | null | undefined): string {
  if (!value) return '';
  const decoded = value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripLeadingSameImage(html: string, heroUrl?: string | null): string {
  if (!html) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const firstImg = doc.body.querySelector('img');
    if (!firstImg) return html;

    const imgSrc = decodeUrl(firstImg.getAttribute('src'));
    const normalizedHero = decodeUrl(heroUrl);
    const isFirstContentImage = doc.body.firstElementChild?.tagName.toLowerCase() === 'img'
      || doc.body.firstElementChild?.querySelector('img') != null;

    const sameAsHero = normalizedHero && imgSrc
      ? imgSrc.includes(normalizedHero) || normalizedHero.includes(imgSrc)
      : false;

    if (sameAsHero || isFirstContentImage) {
      const firstFigure = firstImg.closest('figure');
      if (firstFigure && !firstFigure.textContent?.trim()) firstFigure.remove();
      else firstImg.remove();
    }
    return doc.body.innerHTML;
  } catch {
    return html.replace(/^\s*(<figure[^>]*>\s*)?<img[^>]*>(\s*<\/figure>)?/i, '');
  }
}

function decodeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.replace(/&amp;/g, "&").replace(/&#38;/g, "&");
}

function extractImageUrlFromRaw(item: NewsItem): string | null {
  const rssCandidate = item.raw_json && typeof item.raw_json === 'object'
    ? ((item.raw_json as any).rss_item ?? item.raw_json)
    : null;
  if (!rssCandidate) return null;

  const enclosure = pickArrayOrObjectUrl(rssCandidate.enclosure, rssCandidate.enclosures);
  if (enclosure) return enclosure;

  const mediaContent = pickArrayOrObjectUrl(
    rssCandidate['media:content'],
    rssCandidate['media:content:list'],
  );
  if (mediaContent) return mediaContent;

  const mediaThumbnail = pickArrayOrObjectUrl(
    rssCandidate['media:thumbnail'],
    rssCandidate['media:thumbnail:list'],
  );
  if (mediaThumbnail) return mediaThumbnail;

  const html = rssCandidate['content:encoded']
    || rssCandidate.content
    || rssCandidate.description
    || rssCandidate.summary
    || item.content_html
    || item.body
    || '';

  return extractFirstImageFromHtml(html);
}

function extractFirstImageFromHtml(html: string): string | null {
  if (!html) return null;
  const imgTagMatch = html.match(/<img\b[^>]*>/i);
  if (!imgTagMatch) return null;
  const imgTag = imgTagMatch[0];

  const src = extractAttribute(imgTag, 'src');
  const dataSrc = extractAttribute(imgTag, 'data-src');
  const dataOriginal = extractAttribute(imgTag, 'data-original');
  const srcSet = extractFirstSrcsetUrl(extractAttribute(imgTag, 'srcset'));

  return cleanUrl(src) || cleanUrl(dataSrc) || cleanUrl(dataOriginal) || cleanUrl(srcSet) || null;
}

function extractAttribute(tag: string, attribute: string): string | null {
  const attrMatch = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return attrMatch?.[1] || null;
}

function extractFirstSrcsetUrl(srcset: string | null): string | null {
  if (!srcset) return null;
  const first = srcset.split(',')[0]?.trim();
  if (!first) return null;
  const url = first.split(/\s+/)[0]?.trim();
  return url || null;
}

function pickArrayOrObjectUrl(
  single: { url?: string } | undefined,
  many: Array<{ url?: string }> | undefined,
): string | null {
  return cleanUrl(single?.url) || cleanUrl(many?.[0]?.url) || null;
}

function cleanUrl(url: string | null | undefined): string | null {
  const trimmed = decodeUrl(url)?.trim();
  return trimmed ? trimmed : null;
}

function ensureImageUrl(item: NewsItem): NewsItem {
  const decoded = decodeUrl(item.image_url);
  if (decoded) return { ...item, image_url: decoded };
  return { ...item, image_url: extractImageUrlFromRaw(item) };
}

const BIRDING_POLAND_KEY = 'facebook_birdingpoland';

interface EtTranslationState {
  translated: TranslateEtOutput | null;
  loading: boolean;
  errorStatus: number | null;
}

function useEtTranslation({
  enabled,
  id,
  title,
  body,
  sourceLang,
  fallbackTitleEt,
  fallbackBodyEt,
  endpointConfigured,
}: {
  enabled: boolean;
  id: string;
  title: string;
  body: string | null | undefined;
  sourceLang?: string | null;
  fallbackTitleEt?: string | null;
  fallbackBodyEt?: string | null;
  endpointConfigured: boolean;
}): EtTranslationState {
  const hasFallback = Boolean((fallbackTitleEt || '').trim() || (fallbackBodyEt || '').trim());
  const [translated, setTranslated] = useState<TranslateEtOutput | null>(
    hasFallback ? {
      title_et: (fallbackTitleEt || '').trim(),
      body_et: (fallbackBodyEt || '').trim(),
    } : null,
  );
  const [loading, setLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const bodyText = (body || '').trim();
  const normalizedLang = normalizeLocale(sourceLang || '');
  const isLikelyEstonian = normalizedLang === 'et';
  const shouldTranslate = enabled && endpointConfigured && !isLikelyEstonian && Boolean(title.trim() || bodyText);

  useEffect(() => {
    if (!hasFallback) {
      setTranslated(null);
      return;
    }
    setTranslated({
      title_et: (fallbackTitleEt || '').trim(),
      body_et: (fallbackBodyEt || '').trim(),
    });
  }, [fallbackTitleEt, fallbackBodyEt, hasFallback]);

  useEffect(() => {
    let cancelled = false;

    if (!shouldTranslate) {
      setLoading(false);
      setErrorStatus(null);
      return () => { cancelled = true; };
    }

    setLoading(true);
    setErrorStatus(null);
    translateEt({
      id,
      title,
      body: bodyText,
    })
      .then((result) => {
        if (cancelled || !result) return;
        setTranslated(result);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof TranslateEtHttpError) {
          setErrorStatus(error.status);
        } else {
          setErrorStatus(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [shouldTranslate, id, title, bodyText]);

  return { translated, loading, errorStatus };
}

function useOnceVisible<T extends HTMLElement>(rootMargin = '120px') {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin, threshold: 0.01 });

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return [ref, visible] as const;
}

function useDebouncedTrue(value: boolean, delayMs: number): boolean {
  const [debounced, setDebounced] = useState(false);

  useEffect(() => {
    if (!value) {
      setDebounced(false);
      return;
    }
    const timer = window.setTimeout(() => setDebounced(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/* ── Main component ─────────────────────────────── */
export default function NewsTab() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'latest' | 'archive'>('latest');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const appLocale = resolveAppLocale();
  const showEtContent = isEstonianLocale(appLocale);
  const autoTranslateEnabled = isAutoTranslateNewsToEtEnabled();
  const [translateEndpoint, setTranslateEndpoint] = useState(() => resolveEndpoint());
  const endpointConfigured = Boolean(translateEndpoint);

  useEffect(() => {
    const refreshEndpoint = () => setTranslateEndpoint(resolveEndpoint());
    window.addEventListener('storage', refreshEndpoint);
    window.addEventListener(TRANSLATION_ENDPOINT_UPDATED_EVENT, refreshEndpoint);
    return () => {
      window.removeEventListener('storage', refreshEndpoint);
      window.removeEventListener(TRANSLATION_ENDPOINT_UPDATED_EVENT, refreshEndpoint);
    };
  }, []);

  // Sources
  const { data: sources = [] } = useQuery<NewsSource[]>({
    queryKey: ['news-sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_sources')
        .select('id, name, slug, source_key, key')
        .eq('is_enabled', true);
      if (error) {
        console.error('[NEWS] sources query failed', error);
        throw error;
      }
      return (data || []) as NewsSource[];
    },
    staleTime: 60_000,
  });

  const {
    data: newsItems = [], isLoading, isError,
  } = useQuery({
    queryKey: ['news-items', tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_items')
        .select('id, source_key, source_slug, title, body, image_url, permalink_url, published_at, fetched_at, archived, raw_json, summary, content_html, url, language, guid, title_et, body_et, translation_status, translated_at, source_lang')
        .eq('archived', tab === 'archive')
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('fetched_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[NEWS] items query failed', error);
        throw error;
      }
      if (import.meta.env.DEV) console.log('[NEWS] first item', data?.[0]);
      return ((data || []) as NewsItem[]).map(ensureImageUrl);
    },
    staleTime: 30_000,
    retry: 1,
  });

  const allItems = useMemo(() => {
    const filteredBySource = newsItems.filter((item) => {
      const displaySourceKey = item.source_key ?? 'eoy';
      if (sourceFilter === 'all') return true;
      if (sourceFilter === 'legacy_null') return item.source_key == null;
      return displaySourceKey === sourceFilter;
    });

    const filteredBySearch = search.trim()
      ? filteredBySource.filter((item) =>
        (item.title || '').toLowerCase().includes(search.trim().toLowerCase()))
      : filteredBySource;

    if (tab === 'archive') return filteredBySearch;
    let seenBirdingPoland = false;
    return filteredBySearch.filter((item) => {
      const displaySourceKey = item.source_key ?? 'eoy';
      if (displaySourceKey !== BIRDING_POLAND_KEY) return true;
      if (seenBirdingPoland) return false;
      seenBirdingPoland = true;
      return true;
    });
  }, [newsItems, sourceFilter, search, tab]);

  useEffect(() => {
    if (!isError) return;
    toast.error('Uudiste laadimine ebaõnnestus');
  }, [isError]);

  // Toggle archive via DB update
  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.functions.invoke('news-archive', {
        body: { id, archived },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-items'] });
    },
    onError: () => {
      toast.error('Arhiveerimise viga');
    },
  });

  const toggleArchive = useCallback((id: string, currentArchived: boolean) => {
    archiveMutation.mutate({ id, archived: !currentArchived });
  }, [archiveMutation]);

  // Pull / refresh
  const pullMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('news-pull', {
        body: { force: false },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['news-items'] });
      const total = data?.results?.reduce((s: number, r: any) => s + (r.inserted || 0), 0) || 0;
      if (total > 0) toast.success(`${total} uut uudist`);
      else toast.info('Uusi uudiseid pole');
    },
    onError: () => {
      toast.error('Uudiste tõmbamine ebaõnnestus');
    },
  });

  // Save/restore scroll
  const openArticle = (item: NewsItem) => {
    scrollPosRef.current = scrollRef.current?.scrollTop ?? 0;
    setSelected(item);
  };
  const closeArticle = () => {
    setSelected(null);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollPosRef.current;
    });
  };

  // Article detail view
  if (selected) {
    return (
      <ArticleView
        item={selected}
        sources={sources}
        onBack={closeArticle}
        onToggleArchive={() => toggleArchive(selected.id, selected.archived)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-lg">Uudised</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => pullMutation.mutate()}
            disabled={pullMutation.isPending}
            title="Värskenda"
          >
            {pullMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setTab('latest')}
            className={cn(
              'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === 'latest' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            Viimased
          </button>
          <button
            onClick={() => setTab('archive')}
            className={cn(
              'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === 'archive' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            Arhiiv
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {sources.length > 1 && (
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Kõik allikad</option>
              {sources.map((s) => {
                const sourceKey = s.source_key || s.key || s.slug;
                return <option key={sourceKey} value={sourceKey}>{s.name}</option>;
              })}
              <option value="legacy_null">Legacy (source_key puudub)</option>
            </select>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Otsi uudiseid…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3 px-4 py-3">
                <Skeleton className="w-20 h-20 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <EmptyState tab={tab} />
        ) : allItems.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="divide-y divide-border">
            {allItems.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                sources={sources}
                showEtContent={showEtContent}
                autoTranslateEnabled={autoTranslateEnabled}
                endpointConfigured={endpointConfigured}
                onOpen={() => openArticle(item)}
                onToggleArchive={() => toggleArchive(item.id, item.archived)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── News Card ──────────────────────────────────── */
function NewsCard({ item, sources, showEtContent, autoTranslateEnabled, endpointConfigured, onOpen, onToggleArchive }: {
  item: NewsItem;
  sources: NewsSource[];
  showEtContent: boolean;
  autoTranslateEnabled: boolean;
  endpointConfigured: boolean;
  onOpen: () => void;
  onToggleArchive: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [cardRef, isVisible] = useOnceVisible<HTMLDivElement>();
  const debouncedVisible = useDebouncedTrue(isVisible, 180);
  const thumb = decodeUrl(item.image_url);
  const translation = useEtTranslation({
    enabled: showEtContent && autoTranslateEnabled && debouncedVisible,
    id: item.id,
    title: item.title,
    body: item.body || item.summary,
    sourceLang: item.source_lang || item.language,
    fallbackTitleEt: item.title_et,
    fallbackBodyEt: item.body_et,
    endpointConfigured,
  });
  const displayTitle = showEtContent ? (translation.translated?.title_et || item.title_et || item.title) : item.title;
  const snippetSource = showEtContent
    ? (translation.translated?.body_et || item.body_et || item.body || item.summary)
    : (item.body || item.summary);
  const snippet = toPlainText(snippetSource).slice(0, 150);
  const originalUrl = item.permalink_url || item.url || '#';
  const isTranslated = Boolean(translation.translated?.title_et || translation.translated?.body_et || item.title_et || item.body_et);

  useEffect(() => {
    setImageFailed(false);
  }, [thumb]);

  return (
    <div ref={cardRef} className="px-4 py-3 active:bg-muted/50 transition-colors">
      <div className="flex gap-3">
        <button onClick={onOpen} className="w-20 h-20 rounded-lg shrink-0 bg-muted overflow-hidden">
          {thumb && !imageFailed ? (
            <img
              src={thumb}
              alt={item.title ?? 'news image'}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                setImageFailed(true);
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Newspaper className="w-8 h-8 text-muted-foreground/30" />
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={onOpen} className="text-left w-full">
            <p className="font-medium text-sm text-foreground line-clamp-2">{displayTitle}</p>
          </button>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {sourceLabel(item.source_key || item.source_slug, sources)}
            </Badge>
            {translation.loading && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Tõlgin...
              </Badge>
            )}
            {isTranslated && <Badge variant="outline" className="text-xs px-1.5 py-0">Tõlgitud</Badge>}
            <span className="text-xs text-muted-foreground">{formatEstDate(item.published_at)}</span>
          </div>
          {snippet && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{snippet}</p>
          )}
          <div className="flex gap-2 mt-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onOpen}>
              Ava
            </Button>
            <a href={originalUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1">
                <ExternalLink className="w-3 h-3" /> Originaal
              </Button>
            </a>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onToggleArchive}>
              {item.archived ? <ArchiveRestore className="w-3.5 h-3.5 mr-1" /> : <Archive className="w-3.5 h-3.5 mr-1" />}
              {item.archived ? 'Taasta' : 'Arhiveeri'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Article View (lazy-loads content) ──────────── */
function ArticleView({ item, sources, onBack, onToggleArchive }: {
  item: NewsItem;
  sources: NewsSource[];
  onBack: () => void;
  onToggleArchive: () => void;
}) {
  const [contentHtml, setContentHtml] = useState<string | null>(item.content_html);
  const [loadingContent, setLoadingContent] = useState(!item.content_html && item.source_slug === 'eoy');
  const [contentError, setContentError] = useState<string | null>(null);
  const [manualTranslation, setManualTranslation] = useState<TranslateEtOutput | null>(null);
  const [showManualTranslation, setShowManualTranslation] = useState(false);
  const [manualTranslateLoading, setManualTranslateLoading] = useState(false);

  useEffect(() => {
    if (item.content_html || item.source_slug !== 'eoy') return;
    let cancelled = false;
    (async () => {
      setLoadingContent(true);
      setContentError(null);
      try {
        const { data, error } = await supabase.functions.invoke('fetch-eoy-article-content', {
          body: { news_item_id: item.id },
        });
        if (cancelled) return;
        if (error) throw error;
        if (data?.content_html) {
          setContentHtml(data.content_html);
        } else if (data?.error) {
          setContentError(data.error);
        }
      } catch (e: any) {
        if (!cancelled) setContentError(e.message || 'Sisu laadimine ebaõnnestus');
      } finally {
        if (!cancelled) setLoadingContent(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item.id, item.content_html, item.source_slug]);

  useEffect(() => {
    setManualTranslation(null);
    setShowManualTranslation(false);
    setManualTranslateLoading(false);
  }, [item.id]);

  const sourceName = sourceLabel(item.source_key || item.source_slug, sources);
  const isBirdingPoland = item.source_key === BIRDING_POLAND_KEY
    || item.source_slug === BIRDING_POLAND_KEY
    || sourceName.trim().toLowerCase() === 'birding poland';
  const normalizedLang = normalizeLocale(item.source_lang || item.language || '');
  const isLikelyEstonian = normalizedLang === 'et';
  const canShowTranslate = !isLikelyEstonian || isBirdingPoland;
  const [translateEndpoint, setTranslateEndpoint] = useState(() => resolveEndpoint());
  const endpointConfigured = Boolean(translateEndpoint);

  useEffect(() => {
    const refreshEndpoint = () => setTranslateEndpoint(resolveEndpoint());
    window.addEventListener('storage', refreshEndpoint);
    window.addEventListener(TRANSLATION_ENDPOINT_UPDATED_EVENT, refreshEndpoint);
    return () => {
      window.removeEventListener('storage', refreshEndpoint);
      window.removeEventListener(TRANSLATION_ENDPOINT_UPDATED_EVENT, refreshEndpoint);
    };
  }, []);
  const bodyText = toPlainText(contentHtml || item.body || item.summary);
  const hasTranslatedContent = showManualTranslation
    && Boolean(manualTranslation?.title_et || manualTranslation?.body_et);
  const displayTitle = hasTranslatedContent ? (manualTranslation?.title_et || item.title) : item.title;
  const displayBody = hasTranslatedContent
    ? (manualTranslation?.body_et || bodyText)
    : (contentHtml || bodyText);
  const heroImageUrl = decodeUrl(item.image_url);
  const bodyHtmlWithoutDuplicateHero = contentHtml ? stripLeadingSameImage(contentHtml, heroImageUrl) : null;
  const originalUrl = item.permalink_url || item.url || '#';
  const isTranslated = Boolean(hasTranslatedContent);

  const handleToggleTranslate = useCallback(async () => {
    if (!endpointConfigured) {
      toast.error('Translation backend not configured. Set it in Settings.');
      return;
    }
    if (showManualTranslation) {
      setShowManualTranslation(false);
      return;
    }
    if (manualTranslation) {
      setShowManualTranslation(true);
      return;
    }

    setManualTranslateLoading(true);
    try {
      const result = await translateEt({
        id: item.id,
        title: item.title,
        body: bodyText,
      }, translateEndpoint);
      if (!result) return;
      setManualTranslation(result);
      setShowManualTranslation(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[translate] detail translate failed', error);
      toast.error(`Translate failed. ${message}`);
    } finally {
      setManualTranslateLoading(false);
    }
  }, [bodyText, endpointConfigured, item.id, item.title, manualTranslation, showManualTranslation, translateEndpoint]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium truncate text-sm flex-1">Uudis</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt=""
            className="w-full rounded-xl object-cover max-h-56 bg-muted"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full rounded-xl bg-muted flex items-center justify-center h-40">
            <Newspaper className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}
        <h1 className="text-xl font-bold text-foreground">{displayTitle}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{sourceName}</Badge>
          {manualTranslateLoading && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Tõlgin...
            </Badge>
          )}
          {isTranslated && <Badge variant="outline">Tõlgitud</Badge>}
          <span className="text-xs text-muted-foreground">{formatEstDate(item.published_at)}</span>
        </div>

        {loadingContent ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : bodyHtmlWithoutDuplicateHero && !hasTranslatedContent ? (
          <div
            className="prose prose-sm max-w-none text-foreground [&_a]:text-primary"
            dangerouslySetInnerHTML={{ __html: bodyHtmlWithoutDuplicateHero }}
          />
        ) : contentError ? (
          <p className="text-sm text-muted-foreground italic">{contentError}</p>
        ) : displayBody ? (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{displayBody}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Sisu pole saadaval. Ava originaal.</p>
        )}

        <div className="flex gap-2 pt-2">
          <a href={originalUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Ava originaal
            </Button>
          </a>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleArchive}>
            {item.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            {item.archived ? 'Taasta' : 'Arhiveeri'}
          </Button>
          {canShowTranslate && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleToggleTranslate}
              disabled={manualTranslateLoading || !endpointConfigured}
              title={endpointConfigured ? undefined : 'Translation backend not configured. Set it in Settings.'}
            >
              {manualTranslateLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {showManualTranslation ? 'Original' : (manualTranslateLoading ? 'Translating...' : 'Translate')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Empty States ───────────────────────────────── */
function EmptyState({ tab }: { tab: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-3">
      <Newspaper className="w-14 h-14 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        {tab === 'archive' ? 'Arhiivis pole ühtegi uudist.' : 'Uudiseid pole veel. Vajuta värskendamisnuppu.'}
      </p>
    </div>
  );
}
