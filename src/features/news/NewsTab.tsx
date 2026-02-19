import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadSettings } from '@/lib/settings';
import { fetchNewsFeed, type FeedItem } from '@/lib/feed-parser';
import { getTranslationProvider } from '@/lib/translation';
import { Newspaper, Settings, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { et } from 'date-fns/locale';

function EmptyState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
      <Newspaper className="w-16 h-16 text-muted-foreground/40" />
      <h2 className="text-lg font-semibold text-foreground">Uudiste allikas puudub</h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        Lisa uudiste allika URL seadetes, et näha linnuvaatluse uudiseid.
      </p>
      <Button onClick={onOpenSettings} variant="outline" className="gap-2">
        <Settings className="w-4 h-4" /> Ava seaded
      </Button>
    </div>
  );
}

function NewsDetail({ item, onBack }: { item: FeedItem; onBack: () => void }) {
  const provider = getTranslationProvider();
  const { data: translated } = useQuery({
    queryKey: ['translate', item.id],
    queryFn: async () => ({
      title: await provider.translate(item.title, 'et'),
      summary: await provider.translate(item.excerpt, 'et'),
    }),
    staleTime: Infinity,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="w-5 h-5" /></Button>
        <span className="font-medium truncate text-sm">Uudis</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h1 className="text-xl font-bold text-foreground">{translated?.title ?? item.title}</h1>
        <p className="text-xs text-muted-foreground">{item.source} · {formatDate(item.date)}</p>
        <p className="text-sm text-foreground leading-relaxed">{translated?.summary ?? item.excerpt}</p>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
              Näita originaalteksti
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 p-3 rounded-lg bg-muted text-sm text-muted-foreground">
            <p className="font-medium mb-1">{item.title}</p>
            <p>{item.content || item.excerpt}</p>
          </CollapsibleContent>
        </Collapsible>

        {item.link && (
          <a href={item.link} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">Ava originaal</Button>
          </a>
        )}
      </div>
    </div>
  );
}

function formatDate(d: string): string {
  try {
    return format(new Date(d), 'd. MMM yyyy', { locale: et });
  } catch {
    return d;
  }
}

export default function NewsTab({ onOpenSettings }: { onOpenSettings: () => void }) {
  const settings = loadSettings();
  const [selected, setSelected] = useState<FeedItem | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['news', settings.newsSourceUrl],
    queryFn: () => fetchNewsFeed(settings.newsSourceUrl),
    enabled: !!settings.newsSourceUrl,
    staleTime: 5 * 60 * 1000,
  });

  if (!settings.newsSourceUrl) return <EmptyState onOpenSettings={onOpenSettings} />;
  if (selected) return <NewsDetail item={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h2 className="font-semibold text-foreground">Uudised</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Laen uudiseid…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Uudiseid ei leitud.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li
                key={item.id}
                className="px-4 py-3 active:bg-muted cursor-pointer"
                onClick={() => setSelected(item)}
              >
                <p className="font-medium text-sm text-foreground line-clamp-2">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.source} · {formatDate(item.date)}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.excerpt}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
