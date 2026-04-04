import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/config/supabaseClient';
import {
  Newspaper, ChevronLeft, Archive, ArchiveRestore, ExternalLink,
  Search, RefreshCw, Loader2, Languages,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isAutoTranslateNewsToEtEnabled } from '@/lib/settings';
import { isEstonianLocale, normalizeLocale, resolveAppLocale } from '@/lib/locale';
import { toast } from 'sonner';
import { getProxyMode } from '@/config/proxyEndpoint';
import { getSupabaseUrl } from '@/config/supabaseConfig';
import { normalizeDisplayText } from '@/lib/textNormalize';
import { getNewsImageSrc, getProxiedImageUrl, getProxyBase, isProxiedImageUrl } from './newsImage';
import { useAuth } from '@/features/auth/AuthContext';
import { PERMISSIONS } from '@/features/auth/permissions';

/* Types */
interface NewsItem {
  id: string;
  source_slug: string | null;
  source_id?: string | null;
  source_name?: string | null;
  source_key?: string | null;
  title: string;
  title_et?: string | null;
  translated_title?: string | null;
  summary: string | null;
  body: string | null;
  body_et?: string | null;
  translated_body?: string | null;
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

type NewsListState = {
  tab: 'latest' | 'archive';
  sourceFilter: string;
  search: string;
  scrollTop: number;
};

const NEWS_MAX_AGE_DAYS = 14;
const NEWS_LIST_STATE_KEY = 'estbirding.news.listState.v1';
const NEWS_HASH_LIST = '#news';
const NEWS_HASH_ARTICLE = '#news-article';
const NEWS_LAST_REFRESH_KEY = 'estbirding.news.lastRefreshAt.v1';

const NEWS_VIEW_SELECT = 'id,source_key,title,title_et,body,body_et,summary,published_at,url,image_url,archived,translation_status,translation_error,translated_at,created_at,external_id,source_id,source_slug,source_name,cached_image_url,cached_image_path,display_image_url,content_html,fetched_at,guid,raw_json,language,source_lang,translated_title,translated_body';
const ALL_SOURCES_LABEL = normalizeDisplayText("Kõik allikad");
const NEWS_TABLE_FALLBACK_SELECT = 'id,source_key,title,title_et,body,body_et,summary,published_at,url,image_url,archived,translation_status,translation_error,translated_at,source_id,source_slug,permalink_url,content_html,created_at,cached_image_url,image_cached_url,language,source_lang,guid,raw_json,fetched_at';
const NEWS_MIN_SELECT = 'id,source_key,title,body,summary,published_at,url,image_url,archived,source_id,source_slug,created_at,cached_image_url,content_html,fetched_at,guid,raw_json,language,source_lang';

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
  return stripNewsBoilerplate(decoded.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const NEWS_BOILERPLATE_PATTERNS = [
  /feed\s+generated\s+with\s+fetchrss/gi,
  /sisu\s+genereeritud\s+fetchrss\s+abil/gi,
  /sööt\s+genereeritud\s+fetchrss-iga/gi,
  /content\s+generated\s+by\s+fetchrss/gi,
  /generated\s+by\s+fetchrss/gi,
];

function stripNewsBoilerplate(value: string | null | undefined): string {
  if (!value) return '';
  return NEWS_BOILERPLATE_PATTERNS.reduce((next, pattern) => next.replace(pattern, ' '), String(value));
}

function cleanupNewsText(value: string | null | undefined): string {
  return stripNewsBoilerplate(value)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isGeneratedFallbackTitle(value: string | null | undefined): boolean {
  const title = cleanupNewsText(value).toLowerCase();
  if (!title) return true;
  return title.includes('fotod')
    || title.includes('postitusest')
    || title.includes('postitused')
    || title.includes('facebook post')
    || title.includes('facebooki post')
    || title.includes('instagram post')
    || title.includes('rss app');
}

function buildSourceFallbackTitle(sourceName: string): string {
  const source = normalizeDisplayText(sourceName || '').trim() || 'Linnuuudised';
  if (/birding estonia/i.test(source)) return 'Birding Estonia linnuuudised';
  if (/birding latvia/i.test(source)) return 'Birding Latvia linnuuudised';
  if (/birding poland/i.test(source)) return 'Birding Poland linnuuudised';
  if (/birding belgium/i.test(source)) return 'Birding Belgium linnuuudised';
  return `${source} linnuuudised`;
}

function getDisplayTitleForSource(sourceName: string, title: string | null | undefined): string {
  const cleanedTitle = cleanupNewsText(title);
  return isGeneratedFallbackTitle(cleanedTitle) ? buildSourceFallbackTitle(sourceName) : cleanedTitle;
}

function getCanonicalSourceValue(source: Partial<NewsSource> | NewsItem): string {
  const sourceKey = String((source as NewsItem).source_key || (source as NewsSource).source_key || '').trim().toLowerCase();
  const slug = String((source as NewsItem).source_slug || (source as NewsSource).slug || '').trim().toLowerCase();
  const name = String((source as NewsItem).source_name || (source as NewsSource).name || '').trim().toLowerCase();
  return sourceKey || slug || name;
}

function readLastNewsRefreshAt(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(NEWS_LAST_REFRESH_KEY);
}

function writeLastNewsRefreshAt(value: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NEWS_LAST_REFRESH_KEY, value);
}

function formatNewsRefreshTimestamp(value: string | null): string {
  if (!value) return 'Pole veel värskendatud';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Pole veel värskendatud';
  return date.toLocaleString('et-EE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cleanupNewsHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const cleaned = stripNewsBoilerplate(html)
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<div>\s*<\/div>/gi, '')
    .trim();
  return cleaned || null;
}

function getTranslatedTitle(item: NewsItem): string {
  return cleanupNewsText(item.title_et || item.translated_title || '');
}

function getTranslatedBody(item: NewsItem): string {
  return cleanupNewsText(item.body_et || item.translated_body || '');
}

type PreservedMediaBlock = {
  afterTextBlock: number;
  html: string;
  key: string;
};

const ARTICLE_MEDIA_PROSE_CLASS = 'prose prose-sm max-w-none overflow-x-hidden text-foreground [&_a]:text-primary [&>*]:my-0 [&_p]:my-0 [&_div]:my-0 [&_figure]:my-0 [&_figcaption]:mt-2 [&_figcaption]:mb-0 [&_blockquote]:my-0 [&_iframe]:block [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:border-0 [&_video]:block [&_video]:w-full [&_video]:max-w-full [&_video]:h-auto [&_video]:rounded-xl [&_embed]:block [&_embed]:w-full [&_embed]:max-w-full [&_embed]:rounded-xl [&_object]:block [&_object]:w-full [&_object]:max-w-full [&_object]:rounded-xl [&_img]:max-w-full [&_figure]:max-w-full [&_.instagram-media]:max-w-full [&_.twitter-tweet]:max-w-full';

function isSocialEmbedBlock(node: Element): boolean {
  if (node.tagName.toLowerCase() !== 'blockquote') return false;
  return Boolean(
    node.getAttribute('class')
    || node.getAttribute('cite')
    || node.getAttribute('data-instgrm-captioned')
    || node.getAttribute('data-instgrm-permalink')
    || node.querySelector('a[href]'),
  );
}

function isEmbeddableMediaNode(node: Element): boolean {
  const tag = node.tagName.toLowerCase();
  if (['iframe', 'video', 'embed', 'object'].includes(tag)) return true;
  if (isSocialEmbedBlock(node)) return true;
  if (node.querySelector('iframe, video, embed, object')) return true;
  if (tag === 'div' && node.querySelector('blockquote')) return true;
  return false;
}

function isCountedTextBlock(node: Element): boolean {
  const tag = node.tagName.toLowerCase();
  if (!['p', 'li', 'ul', 'ol', 'h2', 'h3', 'blockquote', 'figcaption'].includes(tag)) return false;
  if (isEmbeddableMediaNode(node)) return false;
  return Boolean(node.textContent?.trim());
}

function extractPreservedMediaBlocks(html: string | null | undefined): PreservedMediaBlock[] {
  if (!html) return [];

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks: PreservedMediaBlock[] = [];
    let textBlockCount = 0;

    Array.from(doc.body.children).forEach((child, index) => {
      if (!(child instanceof Element)) return;

      if (isEmbeddableMediaNode(child)) {
        const blockHtml = child.outerHTML.trim();
        if (!blockHtml) return;
        blocks.push({
          afterTextBlock: textBlockCount,
          html: blockHtml,
          key: `${textBlockCount}:${index}:${child.tagName.toLowerCase()}`,
        });
        return;
      }

      if (isCountedTextBlock(child)) {
        textBlockCount += 1;
      }
    });

    return blocks;
  } catch {
    return [];
  }
}

function splitTranslatedParagraphs(value: string | null | undefined): string[] {
  const cleaned = cleanupNewsText(value);
  if (!cleaned) return [];
  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function isEffectivelyEmptyNode(node: Element): boolean {
  const html = (node.innerHTML || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>/gi, '')
    .trim();
  const text = (node.textContent || '').replace(/\s+/g, '');
  return !html || !text;
}

function collapseEmbedSpacingHtml(html: string | null | undefined): string | null {
  if (!html) return null;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;
    const mediaNodes = Array.from(body.children).filter((child): child is Element => (
      child instanceof Element && isEmbeddableMediaNode(child)
    ));

    for (const mediaNode of mediaNodes) {
      let prev = mediaNode.previousElementSibling as Element | null;
      while (prev && ['p', 'div', 'section'].includes(prev.tagName.toLowerCase()) && isEffectivelyEmptyNode(prev)) {
        const nextPrev = prev.previousElementSibling as Element | null;
        prev.remove();
        prev = nextPrev;
      }

      let next = mediaNode.nextElementSibling as Element | null;
      while (next && ['p', 'div', 'section'].includes(next.tagName.toLowerCase()) && isEffectivelyEmptyNode(next)) {
        const nextNext = next.nextElementSibling as Element | null;
        next.remove();
        next = nextNext;
      }
    }

    body.querySelectorAll('p, div, section').forEach((node) => {
      if (!(node instanceof Element)) return;
      if (!isEmbeddableMediaNode(node) && isEffectivelyEmptyNode(node)) node.remove();
    });

    return body.innerHTML.trim() || html;
  } catch {
    return html;
  }
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

function extractAllImageUrlsFromHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const urls = Array.from(doc.querySelectorAll('img'))
      .map((img) => cleanUrl(
        img.getAttribute('src')
        || img.getAttribute('data-src')
        || img.getAttribute('data-original')
        || extractFirstSrcsetUrl(img.getAttribute('srcset')),
      ))
      .filter((url): url is string => Boolean(url));
    return Array.from(new Set(urls));
  } catch {
    const urls: string[] = [];
    const imgMatches = html.match(/<img\b[^>]*>/gi) || [];
    for (const match of imgMatches) {
      const src = cleanUrl(
        extractAttribute(match, 'src')
        || extractAttribute(match, 'data-src')
        || extractAttribute(match, 'data-original')
        || extractFirstSrcsetUrl(extractAttribute(match, 'srcset')),
      );
      if (src) urls.push(src);
    }
    return Array.from(new Set(urls));
  }
}

function extractArticleImages(item: NewsItem): string[] {
  const htmlCandidates = [
    item.content_html,
    item.body,
    item.summary,
    item.raw_json && typeof item.raw_json === 'object'
      ? ((item.raw_json as any).rss_item?.['content:encoded']
        || (item.raw_json as any).rss_item?.content
        || (item.raw_json as any).rss_item?.description
        || (item.raw_json as any)['content:encoded']
        || (item.raw_json as any).content
        || (item.raw_json as any).description)
      : null,
  ];

  const images = htmlCandidates.flatMap((candidate) => extractAllImageUrlsFromHtml(candidate));
  const hero = cleanUrl(item.display_image_url || item.cached_image_url || item.image_url);
  const ordered = hero ? [hero, ...images] : images;
  return Array.from(new Set(ordered.filter(Boolean)));
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

function isWithinNewsMaxAge(value: string | null | undefined): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return false;
  return ms >= Date.now() - NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function readNewsListState(): NewsListState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(NEWS_LIST_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NewsListState>;
    return {
      tab: parsed.tab === 'archive' ? 'archive' : 'latest',
      sourceFilter: typeof parsed.sourceFilter === 'string' ? parsed.sourceFilter : 'all',
      search: typeof parsed.search === 'string' ? parsed.search : '',
      scrollTop: typeof parsed.scrollTop === 'number' ? parsed.scrollTop : 0,
    };
  } catch {
    return null;
  }
}

function writeNewsListState(state: NewsListState): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(NEWS_LIST_STATE_KEY, JSON.stringify(state));
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

function isColumnMismatchError(error: unknown): boolean {
  const reason = formatErrorReason(error).toLowerCase();
  return reason.includes('column') && reason.includes('does not exist');
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

/* Main component */
export default function NewsTab() {
  const { isAdmin, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const initialListState = useMemo(() => readNewsListState(), []);
  const [tab, setTab] = useState<'latest' | 'archive'>(initialListState?.tab || 'latest');
  const [search, setSearch] = useState(initialListState?.search || '');
  const [sourceFilter, setSourceFilter] = useState<string>(initialListState?.sourceFilter || 'all');
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const appLocale = resolveAppLocale();
  const showEtContent = isEstonianLocale(appLocale);
  const autoTranslateEnabled = isAutoTranslateNewsToEtEnabled();
  const [resolvedProxyBase, setResolvedProxyBase] = useState(() => getProxyBase());
  const [activeProxyName, setActiveProxyName] = useState(() => getProxyMode(getProxyBase()));
  const [lastNewsFetchErrorShort, setLastNewsFetchErrorShort] = useState('');
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(() => readLastNewsRefreshAt());
  const utf8Probe = 'Kõik allikad õäöü';
  const canArchiveNews = isAdmin || hasPermission(PERMISSIONS.newsArchive);

  const persistListState = useCallback((overrides: Partial<NewsListState> = {}) => {
    writeNewsListState({
      tab,
      sourceFilter,
      search,
      scrollTop: scrollRef.current?.scrollTop ?? scrollPosRef.current ?? 0,
      ...overrides,
    });
  }, [tab, sourceFilter, search]);

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
    const refreshProxy = () => {
      const resolved = getProxyBase();
      setResolvedProxyBase(resolved);
      setActiveProxyName(getProxyMode(resolved));
    };
    refreshProxy();
    window.addEventListener('storage', refreshProxy);
    return () => window.removeEventListener('storage', refreshProxy);
  }, []);

  useEffect(() => {
    persistListState();
  }, [persistListState]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current && initialListState?.scrollTop) {
        scrollRef.current.scrollTop = initialListState.scrollTop;
        scrollPosRef.current = initialListState.scrollTop;
      }
    });
  }, [initialListState]);

  useEffect(() => {
    const onPopState = () => {
      const hash = window.location.hash;
      if (hash === NEWS_HASH_LIST || hash === '') {
        setSelected(null);
        const saved = readNewsListState();
        requestAnimationFrame(() => {
          const scrollTop = saved?.scrollTop ?? scrollPosRef.current;
          if (scrollRef.current) scrollRef.current.scrollTop = scrollTop;
        });
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
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

  const filterSources = useMemo(() => {
    const seen = new Set<string>();
    const seenNames = new Set<string>();
    return sources.filter((source) => {
      const canonical = getCanonicalSourceValue(source);
      if (!canonical || seen.has(canonical)) return false;
      // Deduplicate by name (case-insensitive) to merge e.g. duplicate "Birding Poland"
      const nameLower = (source.name || '').trim().toLowerCase();
      if (nameLower && seenNames.has(nameLower)) return false;
      seen.add(canonical);
      if (nameLower) seenNames.add(nameLower);
      return true;
    });
  }, [sources]);

const {
    data: newsItems = [], isLoading, isError, error: newsQueryError,
  } = useQuery({
    queryKey: ['news-items', tab],
    queryFn: async () => {
      let primaryResult = await supabase
        .from('news_items_v')
        .select(NEWS_VIEW_SELECT)
        .eq('archived', tab === 'archive')
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(50);
      if (primaryResult.error && isColumnMismatchError(primaryResult.error)) {
        console.warn('[news] selectWithEt failed on news_items_v, retrying minimal:', formatErrorReason(primaryResult.error));
        primaryResult = await supabase
          .from('news_items_v')
          .select(NEWS_MIN_SELECT)
          .eq('archived', tab === 'archive')
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(50) as any;
      }
      const { data, error } = primaryResult;

      if (error) {
        if (!shouldFallbackNewsQuery(error)) {
          console.error('[NEWS] items query failed', error);
          throw error;
        }
        let fallbackResult = await supabase
          .from('news_items')
          .select(NEWS_TABLE_FALLBACK_SELECT)
          .eq('archived', tab === 'archive')
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(50);
        if (fallbackResult.error && isColumnMismatchError(fallbackResult.error)) {
          console.warn('[news] selectWithEt failed on news_items, retrying minimal:', formatErrorReason(fallbackResult.error));
          fallbackResult = await supabase
            .from('news_items')
            .select(NEWS_MIN_SELECT)
            .eq('archived', tab === 'archive')
            .order('published_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false, nullsFirst: false })
            .limit(50) as any;
        }
        const { data: fallbackData, error: fallbackError } = fallbackResult;
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
      return getCanonicalSourceValue(item) === sourceFilter;
    });

    const ageFiltered = tab === 'latest'
      ? filteredBySource.filter((item) => item.is_archived || isWithinNewsMaxAge(item.published_at || item.created_at || item.fetched_at || null))
      : filteredBySource;

    const filteredBySearch = search.trim()
      ? ageFiltered.filter((item) =>
        (item.title || '').toLowerCase().includes(search.trim().toLowerCase()))
      : ageFiltered;

    return filteredBySearch;
  }, [newsItems, sourceFilter, search, tab]);

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
      if (!canArchiveNews) {
        throw new Error('Puudub õigus uudist arhiveerida');
      }
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
        body: {
          reason: 'manual',
          cache_images: true,
          cache_limit: 10,
          translateForeignNews: autoTranslateEnabled,
        },
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
      const refreshedAt = new Date().toISOString();
      writeLastNewsRefreshAt(refreshedAt);
      setLastRefreshAt(refreshedAt);
      if (total > 0) toast.success(`${total} uudist uuendatud`);
      else toast.info('Uusi uudiseid pole');
    },
    onError: (error) => {
      const reason = formatErrorReason(error) || JSON.stringify(error, Object.getOwnPropertyNames(error as object));
      setLastNewsFetchErrorShort(reason.slice(0, 120));
      toast.error('Refresh failed: news-refresh - ' + reason.slice(0, 160));
    },
  });

  const retranslateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('translate-missing-news-et', {
        method: 'POST',
        body: { force: true, limit: 100 },
      });
      if (error) throw new Error(error.message || 'Tõlkimise viga');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['news-items'] });
      const count = Number(data?.updated ?? 0);
      toast.success(`Tõlgitud: ${count} uudist`);
    },
    onError: (error) => {
      toast.error('Tõlkimise viga: ' + formatErrorReason(error).slice(0, 160));
    },
  });

  // Save/restore scroll
  const openArticle = (item: NewsItem) => {
    scrollPosRef.current = scrollRef.current?.scrollTop ?? 0;
    persistListState({ scrollTop: scrollPosRef.current });
    window.history.pushState(
      {
        ...(window.history.state || {}),
        estbirding: { ...(window.history.state?.estbirding || {}), activeTab: 'uudised' },
        estbirdingNews: { view: 'article', articleId: item.id },
      },
      '',
      NEWS_HASH_ARTICLE,
    );
    setSelected(item);
  };
  const closeArticle = () => {
    persistListState({ scrollTop: scrollPosRef.current });
    if (window.location.hash === NEWS_HASH_ARTICLE) {
      window.history.back();
      return;
    }
    setSelected(null);
    window.history.replaceState(
      {
        ...(window.history.state || {}),
        estbirding: { ...(window.history.state?.estbirding || {}), activeTab: 'uudised' },
        estbirdingNews: { view: 'list' },
      },
      '',
      NEWS_HASH_LIST,
    );
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
        canArchiveNews={canArchiveNews}
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
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatNewsRefreshTimestamp(lastRefreshAt)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => retranslateMutation.mutate()}
              disabled={retranslateMutation.isPending}
              title="Tõlgi uuesti"
            >
              {retranslateMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Languages className="w-4 h-4" />}
            </Button>
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
          {filterSources.length > 1 && (
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">{ALL_SOURCES_LABEL}</option>
              {filterSources.map((s) => {
                const canonical = getCanonicalSourceValue(s);
                return <option key={canonical} value={canonical}>{normalizeDisplayText(s.name)}</option>;
              })}
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
                showEtContent={showEtContent}
                autoTranslateEnabled={autoTranslateEnabled}
                canArchiveNews={canArchiveNews}
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
function NewsCard({ item, sources, proxyBase, showEtContent, autoTranslateEnabled, canArchiveNews, onOpen, onToggleArchive }: {
  item: NewsItem;
  sources: NewsSource[];
  proxyBase: string;
  showEtContent: boolean;
  autoTranslateEnabled: boolean;
  canArchiveNews: boolean;
  onOpen: () => void;
  onToggleArchive: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const sourceName = sourceLabel(item, sources);
  const isBirdingPoland = sourceName === 'Birding Poland';
  const primaryThumb = getNewsImageSrc(item, proxyBase);
  const [thumbSrc, setThumbSrc] = useState<string | null>(primaryThumb);
  const isNonEtSource = normalizeLocale(item.source_lang || item.language || '') !== 'et';
  const translatedTitle = useMemo(() => getTranslatedTitle(item), [item]);
  const translatedBody = useMemo(() => getTranslatedBody(item), [item]);
  const hasTranslation = Boolean(translatedTitle || translatedBody);
  const useEtDisplay = showEtContent && autoTranslateEnabled && isNonEtSource && hasTranslation && sourceName !== 'EOÜ';
  const isPending = showEtContent && autoTranslateEnabled && isNonEtSource && !hasTranslation && sourceName !== 'EOÜ';
  const displayTitle = useMemo(() => (
    useEtDisplay
      ? getDisplayTitleForSource(sourceName, translatedTitle || item.title || '')
      : getDisplayTitleForSource(sourceName, item.title ?? '')
  ), [useEtDisplay, sourceName, translatedTitle, item.title]);
  const snippet = useMemo(() => {
    const snippetSource = useEtDisplay
      ? (translatedBody || item.body || item.summary || '')
      : (item.body ?? item.summary ?? item.excerpt ?? '');
    return toPlainText(snippetSource).slice(0, 150);
  }, [useEtDisplay, translatedBody, item.body, item.summary, item.excerpt]);
  const originalUrl = item.permalink_url || item.url || '#';

  useEffect(() => {
    setImageFailed(false);
    setThumbSrc(primaryThumb);
  }, [primaryThumb, item.id]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Don't open article if user clicked an interactive element (button, link)
    const target = e.target as HTMLElement;
    if (target.closest('a[href], button:not([data-card-trigger])')) return;
    onOpen();
  }, [onOpen]);

  return (
    <div
      className="px-4 py-3 active:bg-muted/50 transition-colors cursor-pointer"
      onClick={handleCardClick}
      role="article"
    >
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-lg shrink-0 bg-muted overflow-hidden" data-card-trigger="true">
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
        </div>
        {DEBUG_NEWS_IMAGE && (
          <p className="text-[10px] text-muted-foreground break-all mt-1">
            img: {(thumbSrc || '(empty)').slice(0, 80)} | source: {item.source_slug || 'unknown'}
          </p>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground line-clamp-2">{displayTitle}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {sourceLabel(item, sources)}
            </Badge>
            {isPending && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 text-amber-600 border-amber-300">
                Tõlkimisel…
              </Badge>
            )}
            {useEtDisplay && <Badge variant="outline" className="text-xs px-1.5 py-0">Tõlgitud</Badge>}
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
            {canArchiveNews && (
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onToggleArchive}>
                {item.is_archived ? <ArchiveRestore className="w-3.5 h-3.5 mr-1" /> : <Archive className="w-3.5 h-3.5 mr-1" />}
                {item.is_archived ? 'Taasta' : 'Arhiveeri'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Article View (lazy-loads content) */
function ArticleView({ item, sources, showEtContent, autoTranslateEnabled, canArchiveNews, onBack, onToggleArchive }: {
  item: NewsItem;
  sources: NewsSource[];
  showEtContent: boolean;
  autoTranslateEnabled: boolean;
  canArchiveNews: boolean;
  onBack: () => void;
  onToggleArchive: () => void;
}) {
  const [contentHtml, setContentHtml] = useState<string | null>(item.content_html);
  const [loadingContent, setLoadingContent] = useState(!item.content_html && item.source_slug === 'eoy');
  const [contentError, setContentError] = useState<string | null>(null);
  const sourceName = sourceLabel(item, sources);

  const normalizedLang = normalizeLocale(item.source_lang || item.language || '');
  const isNonEtSource = normalizedLang !== 'et';
  const translatedTitle = useMemo(() => getTranslatedTitle(item), [item]);
  const translatedBody = useMemo(() => getTranslatedBody(item), [item]);
  const hasTranslation = Boolean(translatedTitle || translatedBody);
  const canShowTranslated = showEtContent && autoTranslateEnabled && isNonEtSource && hasTranslation && sourceName !== 'EOÜ';

  // Per-item view mode persisted in localStorage, default = translated when available
  const storageKey = `news_view_mode_${item.id}`;
  const [viewMode, setViewMode] = useState<'translated' | 'original'>(() => {
    if (!canShowTranslated) return 'original';
    const stored = localStorage.getItem(storageKey);
    if (stored === 'original') return 'original';
    return 'translated';
  });

  const handleViewMode = (mode: 'translated' | 'original') => {
    setViewMode(mode);
    localStorage.setItem(storageKey, mode);
  };

  useEffect(() => {
    if (canShowTranslated) return;
    setViewMode('original');
    localStorage.setItem(storageKey, 'original');
  }, [canShowTranslated, storageKey]);

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

  const proxyBase = getProxyBase();
  const showTranslated = canShowTranslated && viewMode === 'translated';
  const showToggle = canShowTranslated;

  const displayTitle = useMemo(() => (
    showTranslated
      ? getDisplayTitleForSource(sourceName, translatedTitle || item.title || '')
      : getDisplayTitleForSource(sourceName, item.title || '')
  ), [showTranslated, sourceName, translatedTitle, item.title]);
  const mergedBody = useMemo(() => cleanupNewsText(item.body || item.summary), [item.body, item.summary]);
  const cleanedContentHtml = useMemo(() => cleanupNewsHtml(contentHtml), [contentHtml]);
  const bodyText = useMemo(() => toPlainText(cleanedContentHtml || mergedBody), [cleanedContentHtml, mergedBody]);
  const displayBody = useMemo(() => (
    showTranslated ? translatedBody : (cleanedContentHtml || bodyText)
  ), [showTranslated, translatedBody, cleanedContentHtml, bodyText]);
  const translatedParagraphs = useMemo(() => splitTranslatedParagraphs(translatedBody), [translatedBody]);
  const articleImages = useMemo(() => extractArticleImages({
    ...item,
    content_html: cleanedContentHtml,
  }), [item, cleanedContentHtml]);

  const heroImageUrl = getNewsImageSrc(item, proxyBase);
  const [heroSrc, setHeroSrc] = useState<string | null>(heroImageUrl);
  const [heroFailed, setHeroFailed] = useState(false);
  const rewrittenContentHtml = useMemo(() => (
    cleanedContentHtml ? rewriteImgSrcToProxy(cleanedContentHtml, sourceName, proxyBase) : null
  ), [cleanedContentHtml, sourceName, proxyBase]);
  const compactedContentHtml = useMemo(
    () => collapseEmbedSpacingHtml(rewrittenContentHtml),
    [rewrittenContentHtml],
  );
  const bodyHtmlWithoutDuplicateHero = useMemo(() => (
    compactedContentHtml ? stripLeadingSameImage(compactedContentHtml, heroSrc) : null
  ), [compactedContentHtml, heroSrc]);
  const preservedMediaBlocks = useMemo(
    () => extractPreservedMediaBlocks(bodyHtmlWithoutDuplicateHero),
    [bodyHtmlWithoutDuplicateHero],
  );
  const hasTranslatedInlineMedia = showTranslated && preservedMediaBlocks.length > 0 && translatedParagraphs.length > 0;
  const originalUrl = item.permalink_url || item.url || '#';
  const isPending = showEtContent && autoTranslateEnabled && isNonEtSource && !hasTranslation && sourceName !== 'EOÜ';

  useEffect(() => {
    if (showTranslated && !hasTranslation && import.meta.env.DEV) {
      console.warn('[news-translation] translated mode requested without Estonian body', {
        id: item.id,
        source: sourceName,
        title_et: item.title_et,
        translated_title: item.translated_title,
        body_et: item.body_et,
        translated_body: item.translated_body,
      });
    }
  }, [showTranslated, hasTranslation, item.id, item.title_et, item.translated_title, item.body_et, item.translated_body, sourceName]);

  useEffect(() => {
    setHeroSrc(heroImageUrl);
    setHeroFailed(false);
  }, [heroImageUrl, item.id]);

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
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{sourceName}</Badge>
          {isPending && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              Tõlkimisel…
            </Badge>
          )}
          {showTranslated && <Badge variant="outline">Tõlgitud</Badge>}
          <span className="text-xs text-muted-foreground">{formatEstDate(item.published_at || item.created_at || item.fetched_at || '')}</span>
        </div>

        {/* Tõlgitud / Originaal toggle */}
        {showToggle && (
          <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
            <button
              onClick={() => handleViewMode('translated')}
              className={cn(
                'px-3 py-1 text-sm font-medium rounded-md transition-colors',
                viewMode === 'translated' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              Tõlgitud
            </button>
            <button
              onClick={() => handleViewMode('original')}
              className={cn(
                'px-3 py-1 text-sm font-medium rounded-md transition-colors',
                viewMode === 'original' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              Originaal
            </button>
          </div>
        )}

        {loadingContent ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : !showTranslated && bodyHtmlWithoutDuplicateHero ? (
          <div
            className={ARTICLE_MEDIA_PROSE_CLASS}
            dangerouslySetInnerHTML={{ __html: bodyHtmlWithoutDuplicateHero }}
          />
        ) : hasTranslatedInlineMedia ? (
          <div className="space-y-2 overflow-x-hidden text-sm leading-relaxed text-foreground">
            {preservedMediaBlocks
              .filter((block) => block.afterTextBlock === 0)
              .map((block) => (
                <div
                  key={block.key}
                  className={ARTICLE_MEDIA_PROSE_CLASS}
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
              ))}
            {translatedParagraphs.map((paragraph, index) => (
              <div key={`translated-block-${index}`} className="space-y-2">
                <p className="whitespace-pre-line my-0">
                  {paragraph}
                </p>
                {preservedMediaBlocks
                  .filter((block) => block.afterTextBlock === index + 1)
                  .map((block) => (
                    <div
                      key={block.key}
                      className={ARTICLE_MEDIA_PROSE_CLASS}
                      dangerouslySetInnerHTML={{ __html: block.html }}
                    />
                  ))}
              </div>
            ))}
          </div>
        ) : contentError ? (
          <p className="text-sm text-muted-foreground italic">{contentError}</p>
        ) : displayBody ? (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
            {showTranslated ? displayBody : toPlainText(displayBody)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Sisu pole saadaval. Ava originaal.</p>
        )}

        {showTranslated && !hasTranslatedInlineMedia && articleImages.length > 0 ? (
          <div className="space-y-3">
            {articleImages.map((imageUrl, index) => {
              const src = getProxiedImageUrl(imageUrl, proxyBase) || imageUrl;
              const matchesHero = heroSrc && (src === heroSrc || imageUrl === heroSrc);
              if (matchesHero) return null;
              return (
                <img
                  key={`${imageUrl}-${index}`}
                  src={src}
                  alt=""
                  className="w-full rounded-xl object-cover bg-muted"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                />
              );
            })}
          </div>
        ) : null}

        <div className="flex gap-2 pt-2">
          <a href={originalUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Ava originaal
            </Button>
          </a>
          {canArchiveNews && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleArchive}>
              {item.is_archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              {item.is_archived ? 'Taasta' : 'Arhiveeri'}
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
