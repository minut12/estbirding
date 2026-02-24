import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Newspaper, ChevronLeft, ExternalLink, Search, RefreshCw, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface NewsItemPublic {
  id: string;
  source_key: string;
  source_name: string;
  item_url: string;
  published_at: string | null;
  source_lang: string;
  target_lang: string;
  title_best: string;
  summary_best: string | null;
  content_best: string | null;
  is_translated: boolean;
}

const ET_MONTHS = ['jaanuar','veebruar','marts','aprill','mai','juuni','juuli','august','september','oktoober','november','detsember'];
function formatEstDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()}. ${ET_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function toPlainText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export default function NewsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selected, setSelected] = useState<NewsItemPublic | null>(null);

  const { data: newsItems = [], isLoading, isError } = useQuery<NewsItemPublic[]>({
    queryKey: ['news-items-public'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('news_items_public')
        .select('id, source_key, source_name, item_url, published_at, source_lang, target_lang, title_best, summary_best, content_best, is_translated')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as NewsItemPublic[];
    },
    staleTime: 30_000,
    retry: 1,
  });

  const pullMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cron_ingest_news', { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-items-public'] });
      toast.success('Uudised varskendatud');
    },
    onError: () => toast.error('Uudiste varskendamine ebaonnestus'),
  });

  const sourceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of newsItems) map.set(item.source_key, item.source_name || item.source_key);
    return Array.from(map.entries());
  }, [newsItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return newsItems.filter((item) => {
      if (sourceFilter !== 'all' && item.source_key !== sourceFilter) return false;
      if (!q) return true;
      return `${item.title_best} ${item.summary_best || ''}`.toLowerCase().includes(q);
    });
  }, [newsItems, sourceFilter, search]);

  if (selected) {
    const body = selected.content_best || selected.summary_best || '';
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="font-medium truncate text-sm flex-1">Uudis</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <h1 className="text-xl font-bold text-foreground">{selected.title_best}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selected.source_name}</Badge>
            {!selected.is_translated && <Badge variant="outline">orig</Badge>}
            <span className="text-xs text-muted-foreground">{formatEstDate(selected.published_at)}</span>
          </div>
          {body ? (
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{toPlainText(body)}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Sisu pole saadaval. Ava originaal.</p>
          )}
          <a href={selected.item_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Ava originaal
            </Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-lg">Uudised</h2>
          <Button variant="ghost" size="icon" onClick={() => pullMutation.mutate()} disabled={pullMutation.isPending} title="Varskenda">
            {pullMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
        <div className="flex gap-2">
          {sourceOptions.length > 1 && (
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Koik allikad</option>
              {sourceOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Otsi uudiseid..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
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
          <EmptyState />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((item) => (
              <button key={item.id} className="w-full text-left px-4 py-3 active:bg-muted/50 transition-colors" onClick={() => setSelected(item)}>
                <div className="flex gap-3">
                  <div className="w-20 h-20 rounded-lg shrink-0 bg-muted overflow-hidden flex items-center justify-center">
                    <Newspaper className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground line-clamp-2">{item.title_best}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">{item.source_name}</Badge>
                      {!item.is_translated && <Badge variant="outline" className="text-xs px-1.5 py-0">orig</Badge>}
                      <span className="text-xs text-muted-foreground">{formatEstDate(item.published_at)}</span>
                    </div>
                    {!!item.summary_best && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{toPlainText(item.summary_best).slice(0, 150)}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-3">
      <Newspaper className="w-14 h-14 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">Uudiseid pole veel.</p>
    </div>
  );
}
