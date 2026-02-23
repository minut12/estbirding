import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient, useMutation } from '@tanstack/react-query';
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
import { toast } from 'sonner';

/* ── Types ──────────────────────────────────────── */
interface NewsItem {
  id: string;
  source_slug: string;
  source_key?: string | null;
  title: string;
  summary: string | null;
  body: string | null;
  content_html: string | null;
  url: string;
  permalink_url?: string | null;
  image_url?: string | null;
  raw_json?: Record<string, any> | null;
  published_at: string;
  language: string;
  guid: string;
  archived: boolean;
}

interface NewsSource {
  id: string;
  name: string;
  slug: string;
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
function sourceLabel(slug: string, sources: NewsSource[]): string {
  const s = sources.find(s => s.slug === slug);
  return s?.name || slug.toUpperCase();
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
  const trimmed = url?.trim();
  return trimmed ? trimmed : null;
}

function ensureImageUrl(item: NewsItem): NewsItem {
  if (item.image_url) return item;
  return { ...item, image_url: extractImageUrlFromRaw(item) };
}

/* ── Page size ──────────────────────────────────── */
const PAGE_SIZE = 20;
const BIRDING_POLAND_SLUG = 'facebook_birdingpoland';

/* ── Main component ─────────────────────────────── */
export default function NewsTab() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'latest' | 'archive'>('latest');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);

  // Sources
  const { data: sources = [] } = useQuery<NewsSource[]>({
    queryKey: ['news-sources'],
    queryFn: async () => {
      const { data } = await supabase.from('news_sources').select('id, name, slug').eq('is_active', true);
      return (data || []) as NewsSource[];
    },
    staleTime: 60_000,
  });

  // News items (infinite scroll)
  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch,
  } = useInfiniteQuery({
    queryKey: ['news-items', sourceFilter, search, tab],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('news_items')
        .select('id, source_slug, source_key, title, summary, body, content_html, raw_json, url, permalink_url, image_url, published_at, language, guid, archived')
        .order('published_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      // Filter by archive state in DB
      query = query.eq('archived', tab === 'archive');

      if (sourceFilter !== 'all') {
        query = query.eq('source_slug', sourceFilter);
      }
      if (search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,summary.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      const items = ((data || []) as NewsItem[]).map(ensureImageUrl);
      return items;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
    initialPageParam: 0,
    staleTime: 30_000,
  });

  const allItems = useMemo(() => {
    const flat = data?.pages.flat() ?? [];
    if (tab === 'archive') return flat;

    let seenBirdingPoland = false;
    return flat.filter((item) => {
      if (item.source_slug !== BIRDING_POLAND_SLUG) return true;
      if (seenBirdingPoland) return false;
      seenBirdingPoland = true;
      return true;
    });
  }, [data?.pages, tab]);

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['news-items'] });
      const total = data?.results?.reduce((s: number, r: any) => s + (r.inserted || 0), 0) || 0;
      if (total > 0) toast.success(`${total} uut uudist`);
      else toast.info('Uusi uudiseid pole');
    },
    onError: () => {
      toast.error('Uudiste tõmbamine ebaõnnestus');
    },
  });

  // Infinite scroll observer
  const observerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!observerRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(observerRef.current);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
              {sources.map(s => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
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
        ) : allItems.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="divide-y divide-border">
            {allItems.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                sources={sources}
                onOpen={() => openArticle(item)}
                onToggleArchive={() => toggleArchive(item.id, item.archived)}
              />
            ))}
          </div>
        )}
        {/* Infinite scroll sentinel */}
        <div ref={observerRef} className="h-10" />
        {isFetchingNextPage && (
          <div className="p-4 text-center text-sm text-muted-foreground">Laen lisaks…</div>
        )}
      </div>
    </div>
  );
}

/* ── News Card ──────────────────────────────────── */
function NewsCard({ item, sources, onOpen, onToggleArchive }: {
  item: NewsItem;
  sources: NewsSource[];
  onOpen: () => void;
  onToggleArchive: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const snippet = toPlainText(item.body || item.summary).slice(0, 150);
  const originalUrl = item.permalink_url || item.url;

  useEffect(() => {
    setImageFailed(false);
  }, [item.image_url]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('NEWS THUMB', item.source_key, item.image_url);
  }, [item.source_key, item.image_url]);

  return (
    <div className="px-4 py-3 active:bg-muted/50 transition-colors">
      <div className="flex gap-3">
        <button onClick={onOpen} className="w-20 h-20 rounded-lg shrink-0 bg-muted overflow-hidden">
          {item.image_url && !imageFailed ? (
            <img
              src={item.image_url ?? undefined}
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
            <p className="font-medium text-sm text-foreground line-clamp-2">{item.title}</p>
          </button>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {sourceLabel(item.source_slug, sources)}
            </Badge>
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

  const displayBody = contentHtml || toPlainText(item.body || item.summary);
  const originalUrl = item.permalink_url || item.url;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium truncate text-sm flex-1">Uudis</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            className="w-full rounded-xl object-cover max-h-56 bg-muted"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full rounded-xl bg-muted flex items-center justify-center h-40">
            <Newspaper className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}
        <h1 className="text-xl font-bold text-foreground">{item.title}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{sourceLabel(item.source_slug, sources)}</Badge>
          <span className="text-xs text-muted-foreground">{formatEstDate(item.published_at)}</span>
        </div>

        {loadingContent ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : contentHtml ? (
          <div
            className="prose prose-sm max-w-none text-foreground [&_a]:text-primary"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
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
