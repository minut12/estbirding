import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/config/supabaseClient';
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
import { getProxyMode } from '@/config/proxyEndpoint';
import { getSupabaseUrl } from '@/config/supabaseConfig';
import { normalizeDisplayText } from '@/lib/textNormalize';
import { getNewsImageSrc, getProxiedImageUrl, getProxyBase, isProxiedImageUrl } from './newsImage';

/* Types */
interface NewsItem {
  id: string;
  source_slug: string | null;
  source_id?: string | null;
  source_name?: string | null;
  source_key?: string | null;
  title: string;
  title_et?: string | null;
  summary: string | null;
  body: string | null;
  content?: string | null;
  body_et?: string | null;
  content_html: string | null;
  url: string | null;
  permalink_url?: string | null;
  image_url?: string | null;
  display_image_url?: string | null;
  cached_image_url?: string | null;
  fetched_at?: string | null;
  raw_json?: Record<string, any> | null;
  excerpt?: string | null;
  published_at: string | null;
  created_at?: string | null;
  language: string | null;
  source_lang?: string | null;
  translated_at?: string | null;
  translation_status?: string | null;
  guid: string | null;
  is_archived: boolean;
}

interface NewsSource {
  id: string;
  name: string;
  slug: string;
  source_key?: string | null;
  key?: string | null;
}

const NEWS_VIEW_SELECT = 'id,source_key,title,title_et,body,body_et,summary,published_at,url,image_url,archived,translation_status,translation_error,translated_at,created_at,external_id,source_id,source_slug,source_name,cached_image_url,cached_image_path,display_image_url,content_html,fetched_at,guid,raw_json,language,source_lang,translated_title,translated_body';
const ALL_SOURCES_LABEL = normalizeDisplayText("Kõik allikad");
const NEWS_TABLE_FALLBACK_SELECT = 'id, source_key, title, title_et, body, body_et, summary, published_at, url, image_url, archived, translation_status, translation_error, translated_at, source_id, source_slug, permalink_url, content_html, created_at, cached_image_url, image_cached_url, language, source_lang, guid, raw_json, fetched_at';

/* Format date */
const ET_MONTHS = ['jaanuar','veebruar','märts','aprill','mai','juuni','juuli','august','september','oktoober','november','detsember'];
function formatEstDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()}. ${ET_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } catch { return iso; }
}

/* Source display names */
function sourceLabel(item: NewsItem, sources: NewsSource[]): string {
  const directName = normalizeDisplayText(String(item.source_name || '').trim());
  if (directName) return directName;
  const byId = item.source_id ? sources.find((it) => it.id === item.source_id) : null;
  if (byId?.name) return normalizeDisplayText(byId.name);
  if (item.source_slug) return item.source_slug.toUpperCase();
  return normalizeDisplayText('EOÜ');
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

function formatErrorReason(error: unknown): string {
  if (error instanceof Error) return error.message || 'Viga';
  const asAny = error as { message?: string; status?: number } | null | undefined;
  if (asAny?.message) return asAny.message;
  if (typeof asAny?.status === 'number') return `HTTP ${asAny.status}`;
  return 'Viga';
}

function getErrorHostLabel(): string {
  try {
    const host = new URL(getSupabaseUrl()).host;
    return host || 'unknown-host';
  } catch {
    return 'unknown-host';
  }
}

const shownTranslationWarnings = new Set<string>();
function notifyTranslationWarning(message: string): void {
  const normalized = String(message || 'Viga').trim().slice(0, 160) || 'Viga';
  if (shownTranslationWarnings.has(normalized)) return;
  shownTranslationWarnings.add(normalized);
  toast.warning(`Tõlge ebaõnnestus: ${normalized}`);
}

function ensureImageUrl(item: NewsItem): NewsItem {
  const cached = decodeUrl(item.cached_image_url);
  const display = decodeUrl(item.display_image_url);
  const decoded = display || cached || decodeUrl(item.image_url);
  if (decoded) return { ...item, cached_image_url: cached || undefined, image_url: decoded, display_image_url: display || decoded };
  return { ...item, image_url: extractImageUrlFromRaw(item) };
}

function shouldFallbackNewsQuery(error: unknown): boolean {
  const reason = formatErrorReason(error).toLowerCase();
  return reason.includes('does not exist')
    || reason.includes('schema cache')
    || reason.includes('could not find the table')
    || reason.includes('relation')
    || reason.includes('column');
}

const BIRDING_POLAND_NAME = 'birding poland';
const DEBUG_NEWS_IMAGE = import.meta.env.DEV
  && typeof window !== 'undefined'
  && (window.localStorage.getItem('debugNewsImg') === '1' || new URLSearchParams(window.location.search).has('debugNewsImg'));
const IMAGE_PLACEHOLDER_LOCAL = '/placeholder.svg';

function rewriteImgSrcToProxy(html: string, sourceName: string, proxyBase: string): string {
  if (!html) return html;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((img) => {
      const src = (img.getAttribute('src') || img.getAttribute('data-src') || '').trim();
      if (!src) return;
      const rewritten = getProxiedImageUrl(src, proxyBase);
      if (rewritten) img.setAttribute('src', rewritten);
      img.removeAttribute('data-src');
    });
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

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
      sourceLang: sourceLang || undefined,
    })
      .then((result) => {
        if (cancelled || !result) return;
        setTranslated(result);
      })
      .catch((error) => {
        if (cancelled) return;
        if (formatErrorReason(error).includes('TRANSLATE_ENDPOINT_MISSING')) {
          toast.error('Tõlke endpoint puudub. Ava Seaded → Tõlge ja salvesta URL.');
          return;
        }
        notifyTranslationWarning(formatErrorReason(error));
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

/* Main component */
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
  const [resolvedProxyBase, setResolvedProxyBase] = useState(() => getProxyBase());
  const [activeProxyName, setActiveProxyName] = useState(() => getProxyMode(getProxyBase()));
  const [lastNewsFetchErrorShort, setLastNewsFetchErrorShort] = useState('');
  const endpointConfigured = Boolean(translateEndpoint);
  const utf8Probe = 'Kõik allikad õäöü';

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const el = document.querySelector('[data-utf8-probe="news-tab"]');
    const rendered = (el?.textContent || '').trim();
    if (rendered && rendered !== utf8Probe) {
      console.error('[utf8-check] Render mismatch detected', {
        expected: utf8Probe,
        rendered,
        suspectedTransforms: ['decodeURIComponent(escape(...))', 'unescape(encodeURIComponent(...))', 'latin1/iso-8859-1 decoders'],
      });
    }
  }, [utf8Probe]);

  useEffect(() => {
    const refreshEndpoint = () => setTranslateEndpoint(resolveEndpoint());
    window.addEventListener('storage', refreshEndpoint);
    window.addEventListener(TRANSLATION_ENDPOINT_UPDATED_EVENT, refreshEndpoint);
    return () => {
      window.removeEventListener('storage', refreshEndpoint);
      window.removeEventListener(TRANSLATION_ENDPOINT_UPDATED_EVENT, refreshEndpoint);
    };
  }, []);

  useEffect(() => {
    const refreshProxy = () => {
      const resolved = getProxyBase();
      setResolvedProxyBase(resolved);
      setActiveProxyName(getProxyMode(resolved));
    };
    refreshProxy();
    window.addEventListener('storage', refreshProxy);
    return () => window.removeEventListener('storage', refreshProxy);
  }, []);

  // Sources
  const { data: sources = [] } = useQuery<NewsSource[]>({
    queryKey: ['news-sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_sources')
        .select('id, name, slug, source_key, key')
        .eq('is_active', true)
        .eq('is_enabled', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('[NEWS] sources query failed', error);
        throw error;
      }
      return (data || []) as NewsSource[];
    },
    staleTime: 60_000,
  });

  const birdingPolandSourceId = useMemo(() => {
    const hit = sources.find((s) => String(s.name || "").trim().toLowerCase() === BIRDING_POLAND_NAME);
    return hit?.id || null;
  }, [sources]);

const {
    data: newsItems = [], isLoading, isError, error: newsQueryError,
  } = useQuery({
    queryKey: ['news-items', tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_items_v')
        .select(NEWS_VIEW_SELECT)
        .eq('archived', tab === 'archive')
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(50);

      if (error) {
        if (!shouldFallbackNewsQuery(error)) {
          console.error('[NEWS] items query failed', error);
          throw error;
        }
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('news_items')
          .select(NEWS_TABLE_FALLBACK_SELECT)
          .eq('archived', tab === 'archive')
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(50);
        if (fallbackError) {
          console.error('[NEWS] fallback items query failed', fallbackError);
          throw fallbackError;
        }
        const bySourceId = new Map<string, NewsSource>();
        for (const source of sources) bySourceId.set(source.id, source);
        const fallbackMapped = ((fallbackData || []) as Array<Record<string, any>>).map((row) => {
          const source = row?.source_id ? bySourceId.get(String(row.source_id)) : null;
          return {
            ...row,
            source_name: source?.name || row?.source_slug || row?.source_key || 'Unknown source',
            cached_image_url: row?.cached_image_url || row?.image_cached_url || null,
            display_image_url: row?.cached_image_url || row?.image_cached_url || row?.image_url || null,
            content: row?.content || row?.body || null,
            is_archived: Boolean(row?.archived),
          } as NewsItem;
        });
        const items = fallbackMapped.map(ensureImageUrl);
        return items.sort((a, b) => {
          const ta = new Date(a.published_at || a.created_at || '').getTime() || 0;
          const tb = new Date(b.published_at || b.created_at || '').getTime() || 0;
          return tb - ta;
        });
      }
      const mapped = ((data || []) as Array<Record<string, any>>).map((row) => ({
        ...row,
        is_archived: Boolean(row.archived),
        display_image_url: row.display_image_url || row.cached_image_url || row.image_cached_url || row.image_url || null,
        content: row.content || row.body || row.summary || null,
        summary: row.summary || null,
        body: row.body || row.summary || null,
        content_html: row.content_html || null,
        source_name: row.source_name || row.source_slug || row.source_key || 'Unknown source',
      })) as NewsItem[];
      if (import.meta.env.DEV) console.log('[NEWS] first item', mapped?.[0]);
      const items = mapped.map(ensureImageUrl);
      return items.sort((a, b) => {
        const ta = new Date(a.published_at || a.created_at || '').getTime() || 0;
        const tb = new Date(b.published_at || b.created_at || '').getTime() || 0;
        return tb - ta;
      });
    },
    staleTime: 30_000,
    retry: 1,
  });
  const allItems = useMemo(() => {
    const filteredBySource = newsItems.filter((item) => {
      if (sourceFilter === 'all') return true;
      if (sourceFilter === 'legacy_null') return item.source_id == null;
      return item.source_id === sourceFilter;
    });

    const filteredBySearch = search.trim()
      ? filteredBySource.filter((item) =>
        (item.title || '').toLowerCase().includes(search.trim().toLowerCase()))
      : filteredBySource;

    if (tab === 'archive') return filteredBySearch;
    let seenBirdingPoland = false;
    return filteredBySearch.filter((item) => {
      const displaySourceId = item.source_id || '';
      if (displaySourceId !== birdingPolandSourceId) return true;
      if (seenBirdingPoland) return false;
      seenBirdingPoland = true;
      return true;
    });
  }, [newsItems, sourceFilter, search, tab, birdingPolandSourceId]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const bp = newsItems.find((item) => String(item.source_name || '').trim() === 'Birding Poland');
    if (!bp) return;
    const imageUrl = decodeUrl(bp.image_url);
    const cached = decodeUrl(bp.cached_image_url);
    const resolvedThumbnailSrc = getNewsImageSrc({ ...bp, display_image_url: cached || imageUrl }, resolvedProxyBase);
    console.log('[news-image] birding-poland newest item', {
      url: bp.url,
      image_url: bp.image_url || null,
      cached_image_url: bp.cached_image_url || null,
      resolvedThumbnailSrc,
    });
  }, [newsItems, resolvedProxyBase]);

  useEffect(() => {
    if (!isError) return;
    const shortReason = formatErrorReason(newsQueryError);
    setLastNewsFetchErrorShort(shortReason.slice(0, 120));
    toast.error('Uudiste laadimine ebaõnnestus (fetch): ' + shortReason.slice(0, 120) + ' [' + getErrorHostLabel() + ']');
  }, [isError, newsQueryError]);

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
      const fnName = 'news-refresh';
      const { data, error } = await supabase.functions.invoke(fnName, {
        method: 'POST',
        body: { reason: 'manual', cache_images: true, cache_limit: 10 },
      });
      if (error) throw new Error(error.message || `${fnName}: ${formatErrorReason(error)}`);
      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['news-items'] });
      const total = Number(
        data?.itemsUpserted
        ?? ((Number(data?.totalInserted || 0) + Number(data?.totalUpdated || 0)) || 0)
        ?? data?.upserts
        ?? data?.inserted
        ?? 0,
      ) || 0;
      const errors = Array.isArray(data?.errors) ? data.errors : [];
      if (errors.length > 0) {
        const reason = String(errors[0]?.error || 'Viga').slice(0, 120);
        setLastNewsFetchErrorShort(reason);
        toast.warning(`${errors.length} allika viga (${String(errors[0]?.source || 'allikas')}: ${reason})`);
      } else {
        setLastNewsFetchErrorShort('');
      }
      if (total > 0) toast.success(`${total} uudist uuendatud`);
      else toast.info('Uusi uudiseid pole');
    },
    onError: (error) => {
      const reason = formatErrorReason(error) || JSON.stringify(error, Object.getOwnPropertyNames(error as object));
      setLastNewsFetchErrorShort(reason.slice(0, 120));
      toast.error('Refresh failed: news-refresh - ' + reason.slice(0, 160));
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
        showEtContent={showEtContent}
        autoTranslateEnabled={autoTranslateEnabled}
        onBack={closeArticle}
        onToggleArchive={() => toggleArchive(selected.id, selected.is_archived)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card space-y-3">
        {import.meta.env.DEV && (
          <span data-utf8-probe="news-tab" className="sr-only">{utf8Probe}</span>
        )}
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
              <option value="all">{ALL_SOURCES_LABEL}</option>
              {sources.map((s) => {
                return <option key={s.id} value={s.id}>{normalizeDisplayText(s.name)}</option>;
              })}
              <option value="legacy_null">Legacy (source_id puudub)</option>
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
        {import.meta.env.DEV && (
          <p className="text-xs text-muted-foreground">
            proxy={activeProxyName} base={resolvedProxyBase || '(empty)'} lastError={lastNewsFetchErrorShort || '(none)'}
          </p>
        )}
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
                proxyBase={resolvedProxyBase}
                birdingPolandSourceId={birdingPolandSourceId}
                showEtContent={showEtContent}
                autoTranslateEnabled={autoTranslateEnabled}
                endpointConfigured={endpointConfigured}
                onOpen={() => openArticle(item)}
                onToggleArchive={() => toggleArchive(item.id, item.is_archived)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* News Card */
function NewsCard({ item, sources, proxyBase, birdingPolandSourceId, showEtContent, autoTranslateEnabled, endpointConfigured, onOpen, onToggleArchive }: {
  item: NewsItem;
  sources: NewsSource[];
  proxyBase: string;
  birdingPolandSourceId: string | null;
  showEtContent: boolean;
  autoTranslateEnabled: boolean;
  endpointConfigured: boolean;
  onOpen: () => void;
  onToggleArchive: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [cardRef, isVisible] = useOnceVisible<HTMLDivElement>();
  const debouncedVisible = useDebouncedTrue(isVisible, 180);
  const sourceName = sourceLabel(item, sources);
  const isBirdingPoland = sourceName === 'Birding Poland';
  const primaryThumb = getNewsImageSrc(item, proxyBase);
  const [thumbSrc, setThumbSrc] = useState<string | null>(primaryThumb);
  const translation = useEtTranslation({
    enabled: showEtContent && autoTranslateEnabled && debouncedVisible,
    id: item.id,
    title: item.title,
    body: item.content || item.body || item.summary,
    sourceLang: item.source_lang || item.language,
    fallbackTitleEt: item.title_et,
    fallbackBodyEt: item.body_et,
    endpointConfigured,
  });
  const useEtDisplay = showEtContent && autoTranslateEnabled;
  const displayTitle = useEtDisplay ? (item.title_et || item.title || '') : (item.title || '');
  const snippetSource = useEtDisplay
    ? (item.body_et || item.body || item.summary || '')
    : (item.body || item.summary || item.excerpt || '');
  const snippet = toPlainText(snippetSource).slice(0, 150);
  const originalUrl = item.permalink_url || item.url || '#';
  const isTranslated = Boolean(translation.translated?.title_et || translation.translated?.body_et || item.title_et || item.body_et);

  useEffect(() => {
    setImageFailed(false);
    setThumbSrc(primaryThumb);
  }, [primaryThumb, item.id]);

  return (
    <div ref={cardRef} className="px-4 py-3 active:bg-muted/50 transition-colors">
      <div className="flex gap-3">
        <button onClick={onOpen} className="w-20 h-20 rounded-lg shrink-0 bg-muted overflow-hidden">
          {thumbSrc && !imageFailed ? (
            <img
              src={thumbSrc}
              alt={item.title ?? 'news image'}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                if (import.meta.env.DEV && isBirdingPoland) {
                  const maybeStatus = (e as any)?.nativeEvent?.target?.status ?? (e.currentTarget as any)?.naturalWidth ?? null;
                  console.warn('[news-image] birding-poland load failed', { thumbSrc, image_url: item.image_url, cached_image_url: item.cached_image_url, status: maybeStatus });
                }
                const current = (e.currentTarget as HTMLImageElement).src || '';
                const proxiedFallback = getProxiedImageUrl(item.image_url, proxyBase);
                if (!isProxiedImageUrl(current, proxyBase) && proxiedFallback && proxiedFallback !== current) {
                  setThumbSrc(proxiedFallback);
                  return;
                }
                if (current !== IMAGE_PLACEHOLDER_LOCAL) {
                  setThumbSrc(IMAGE_PLACEHOLDER_LOCAL);
                  return;
                }
                setImageFailed(true);
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Newspaper className="w-8 h-8 text-muted-foreground/30" />
            </div>
          )}
        </button>
        {DEBUG_NEWS_IMAGE && (
          <p className="text-[10px] text-muted-foreground break-all mt-1">
            img: {(thumbSrc || '(empty)').slice(0, 80)} | source: {item.source_slug || 'unknown'}
          </p>
        )}
        <div className="flex-1 min-w-0">
          <button onClick={onOpen} className="text-left w-full">
            <p className="font-medium text-sm text-foreground line-clamp-2">{displayTitle}</p>
          </button>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {sourceLabel(item, sources)}
            </Badge>
            {translation.loading && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Tõlgin...
              </Badge>
            )}
            {isTranslated && <Badge variant="outline" className="text-xs px-1.5 py-0">Tõlgitud</Badge>}
            <span className="text-xs text-muted-foreground">{formatEstDate(item.published_at || item.created_at || item.fetched_at || '')}</span>
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
              {item.is_archived ? <ArchiveRestore className="w-3.5 h-3.5 mr-1" /> : <Archive className="w-3.5 h-3.5 mr-1" />}
              {item.is_archived ? 'Taasta' : 'Arhiveeri'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Article View (lazy-loads content) */
function ArticleView({ item, sources, showEtContent, autoTranslateEnabled, onBack, onToggleArchive }: {
  item: NewsItem;
  sources: NewsSource[];
  showEtContent: boolean;
  autoTranslateEnabled: boolean;
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

  const sourceName = sourceLabel(item, sources);
  const isBirdingPoland = sourceName.trim().toLowerCase() === BIRDING_POLAND_NAME;
  const proxyBase = getProxyBase();
  const normalizedLang = normalizeLocale(item.source_lang || item.language || '');
  const isLikelyEstonian = normalizedLang === 'et';
  const canShowTranslate = !isLikelyEstonian || isBirdingPoland;
  const [translateEndpoint, setTranslateEndpoint] = useState(() => resolveEndpoint());

  useEffect(() => {
    const refreshEndpoint = () => setTranslateEndpoint(resolveEndpoint());
    window.addEventListener('storage', refreshEndpoint);
    window.addEventListener(TRANSLATION_ENDPOINT_UPDATED_EVENT, refreshEndpoint);
    return () => {
      window.removeEventListener('storage', refreshEndpoint);
      window.removeEventListener(TRANSLATION_ENDPOINT_UPDATED_EVENT, refreshEndpoint);
    };
  }, []);
  const mergedBody = item.content || item.body || item.summary;
  const bodyText = toPlainText(contentHtml || mergedBody);
  const bodyFallback = item.excerpt || '';
  const normalizedBodyText = toPlainText(contentHtml || bodyFallback);
  const hasTranslatedContent = showManualTranslation
    && Boolean(manualTranslation?.title_et || manualTranslation?.body_et);
  const useEtDisplay = showEtContent && autoTranslateEnabled;
  const showTitleBase = useEtDisplay ? (item.title_et || item.title || '') : (item.title || '');
  const showBodyBase = useEtDisplay
    ? (item.body_et || item.body || item.summary || '')
    : (item.body || item.summary || '');
  const displayTitle = hasTranslatedContent ? (manualTranslation?.title_et || showTitleBase) : showTitleBase;
  const displayBody = hasTranslatedContent
    ? (manualTranslation?.body_et || normalizedBodyText)
    : (useEtDisplay ? showBodyBase : (contentHtml || normalizedBodyText));
  const heroImageUrl = getNewsImageSrc(item, proxyBase);
  const [heroSrc, setHeroSrc] = useState<string | null>(heroImageUrl);
  const [heroFailed, setHeroFailed] = useState(false);
  const rewrittenContentHtml = contentHtml ? rewriteImgSrcToProxy(contentHtml, sourceName, proxyBase) : null;
  const bodyHtmlWithoutDuplicateHero = rewrittenContentHtml ? stripLeadingSameImage(rewrittenContentHtml, heroSrc) : null;
  const originalUrl = item.permalink_url || item.url || '#';
  const isTranslated = Boolean(hasTranslatedContent);

  useEffect(() => {
    setHeroSrc(heroImageUrl);
    setHeroFailed(false);
  }, [heroImageUrl, item.id]);

  const handleToggleTranslate = useCallback(async () => {
    if (showManualTranslation) {
      setShowManualTranslation(false);
      return;
    }
    if (manualTranslation) {
      setShowManualTranslation(true);
      return;
    }

    if (!translateEndpoint.trim()) {
      toast.error('Tõlke endpoint puudub. Ava Seaded → Tõlge ja salvesta URL.');
      return;
    }

    setManualTranslateLoading(true);
    try {

      const result = await translateEt({
        id: item.id,
        title: item.title,
        body: bodyText,
        sourceLang: item.source_lang || item.language || undefined,
      }, translateEndpoint);
      if (!result) return;
      setManualTranslation(result);
      setShowManualTranslation(true);
    } catch (error) {
      const message = formatErrorReason(error);
      console.error('[translate] detail translate failed', error);
      notifyTranslationWarning(message);
    } finally {
      setManualTranslateLoading(false);
    }
  }, [bodyText, item.id, item.title, manualTranslation, normalizedBodyText, showManualTranslation, translateEndpoint]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium truncate text-sm flex-1">Uudis</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {heroSrc && !heroFailed ? (
          <img
            src={heroSrc}
            alt=""
            className="w-full rounded-xl object-cover max-h-56 bg-muted"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={() => {
              const proxiedFallback = getProxiedImageUrl(item.image_url, proxyBase);
              if (heroSrc && !isProxiedImageUrl(heroSrc, proxyBase) && proxiedFallback && proxiedFallback !== heroSrc) {
                setHeroSrc(proxiedFallback);
                return;
              }
              if (heroSrc && heroSrc !== IMAGE_PLACEHOLDER_LOCAL) {
                setHeroSrc(IMAGE_PLACEHOLDER_LOCAL);
                return;
              }
              setHeroFailed(true);
            }}
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
          <span className="text-xs text-muted-foreground">{formatEstDate(item.published_at || item.created_at || item.fetched_at || '')}</span>
        </div>

        {loadingContent ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : bodyHtmlWithoutDuplicateHero && !hasTranslatedContent && !useEtDisplay ? (
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
            {item.is_archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            {item.is_archived ? 'Taasta' : 'Arhiveeri'}
          </Button>
          {canShowTranslate && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleToggleTranslate}
              disabled={manualTranslateLoading}
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

/* Empty States */
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





