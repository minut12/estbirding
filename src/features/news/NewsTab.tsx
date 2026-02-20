import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Newspaper, ChevronLeft, Archive, ArchiveRestore, ExternalLink, Search, Filter, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/* ── Types ──────────────────────────────────────── */
interface NewsItem {
  id: string;
  source_slug: string;
  title: string;
  summary: string | null;
  content_html: string | null;
  url: string;
  image_url: string | null;
  published_at: string;
  language: string;
  guid: string;
}

interface NewsSource {
  id: string;
  name: string;
  slug: string;
}

/* ── Archive helpers (localStorage) ─────────────── */
const ARCHIVE_KEY = 'estbirding-news-archived';
function loadArchived(): Set<string> {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveArchived(ids: Set<string>) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...ids]));
}

/* ── Format date ────────────────────────────────── */
const ET_MONTHS = ['jaanuar','veebruar','märts','aprill','mai','juuni','juuli','august','september','oktoober','november','detsember'];
function formatEstDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()}. ${ET_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } catch { return iso; }
}

/* ── Page size ──────────────────────────────────── */
const PAGE_SIZE = 20;

/* ── Main component ─────────────────────────────── */
export default function NewsTab() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'latest' | 'archive'>('latest');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(loadArchived);
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
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['news-items', sourceFilter, search],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('news_items')
        .select('*')
        .order('published_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (sourceFilter !== 'all') {
        query = query.eq('source_slug', sourceFilter);
      }
      if (search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,summary.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as NewsItem[];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
    initialPageParam: 0,
    staleTime: 30_000,
  });

  const allItems = data?.pages.flat() ?? [];
  const visibleItems = tab === 'archive'
    ? allItems.filter(i => archivedIds.has(i.id))
    : allItems.filter(i => !archivedIds.has(i.id));

  // Toggle archive
  const toggleArchive = useCallback((id: string) => {
    setArchivedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveArchived(next);
      return next;
    });
  }, []);

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
    return <ArticleView item={selected} onBack={closeArticle} isArchived={archivedIds.has(selected.id)} onToggleArchive={() => toggleArchive(selected.id)} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-lg">Uudised</h2>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Värskenda">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setTab('latest')}
            className={cn(
              'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === 'latest' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            Viimased
          </button>
          <button
            onClick={() => setTab('archive')}
            className={cn(
              'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === 'archive' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
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
          <div className="p-6 text-center text-sm text-muted-foreground">Laen uudiseid…</div>
        ) : visibleItems.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="divide-y divide-border">
            {visibleItems.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                isArchived={archivedIds.has(item.id)}
                onOpen={() => openArticle(item)}
                onToggleArchive={() => toggleArchive(item.id)}
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
function NewsCard({ item, isArchived, onOpen, onToggleArchive }: {
  item: NewsItem;
  isArchived: boolean;
  onOpen: () => void;
  onToggleArchive: () => void;
}) {
  return (
    <div className="px-4 py-3 active:bg-muted/50 transition-colors">
      <div className="flex gap-3">
        {item.image_url && (
          <img
            src={item.image_url}
            alt=""
            className="w-20 h-20 rounded-lg object-cover shrink-0 bg-muted"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <button onClick={onOpen} className="text-left w-full">
            <p className="font-medium text-sm text-foreground line-clamp-2">{item.title}</p>
          </button>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{item.source_slug.toUpperCase()}</Badge>
            <span className="text-xs text-muted-foreground">{formatEstDate(item.published_at)}</span>
          </div>
          {item.summary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
          )}
          <div className="flex gap-2 mt-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onOpen}>
              Ava
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onToggleArchive}>
              {isArchived ? <ArchiveRestore className="w-3.5 h-3.5 mr-1" /> : <Archive className="w-3.5 h-3.5 mr-1" />}
              {isArchived ? 'Taasta' : 'Arhiveeri'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Article View (lazy-loads content) ──────────── */
function ArticleView({ item, onBack, isArchived, onToggleArchive }: {
  item: NewsItem;
  onBack: () => void;
  isArchived: boolean;
  onToggleArchive: () => void;
}) {
  const [contentHtml, setContentHtml] = useState<string | null>(item.content_html);
  const [loadingContent, setLoadingContent] = useState(!item.content_html);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    if (item.content_html) return;
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
  }, [item.id, item.content_html]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium truncate text-sm flex-1">Uudis</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {item.image_url && (
          <img
            src={item.image_url}
            alt=""
            className="w-full rounded-xl object-cover max-h-56 bg-muted"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <h1 className="text-xl font-bold text-foreground">{item.title}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{item.source_slug.toUpperCase()}</Badge>
          <span className="text-xs text-muted-foreground">{formatEstDate(item.published_at)}</span>
        </div>

        {loadingContent ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/6" />
          </div>
        ) : contentHtml ? (
          <div
            className="prose prose-sm max-w-none text-foreground [&_a]:text-primary"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        ) : contentError ? (
          <p className="text-sm text-muted-foreground italic">{contentError}</p>
        ) : item.summary ? (
          <p className="text-sm text-foreground leading-relaxed">{item.summary}</p>
        ) : null}

        <div className="flex gap-2 pt-2">
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Ava originaal
            </Button>
          </a>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleArchive}>
            {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            {isArchived ? 'Taasta' : 'Arhiveeri'}
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
        {tab === 'archive' ? 'Arhiivis pole ühtegi uudist.' : 'Uudiseid pole veel. Tõmba alla, et värskendada.'}
      </p>
    </div>
  );
}
