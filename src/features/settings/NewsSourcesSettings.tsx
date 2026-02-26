import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/config/supabaseClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, TestTube, Check, X } from 'lucide-react';

interface NewsSource {
  id: string;
  name: string;
  slug: string;
  source_key?: string | null;
  type: string;
  homepage_url: string | null;
  feed_url: string | null;
  is_enabled: boolean;
}

export default function NewsSourcesSettings() {
  const queryClient = useQueryClient();

  const { data: sources = [], isLoading } = useQuery<NewsSource[]>({
    queryKey: ['news-sources-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('news_sources').select('id, name, slug, source_key, type, homepage_url, feed_url, is_enabled').eq('is_active', true);
      return (data || []) as NewsSource[];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Laen allikaidâ€¦</p>;
  if (sources.length === 0) return <p className="text-sm text-muted-foreground">Uudiste allikaid pole.</p>;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground">Uudiste allikad</h3>
      {sources.map(source => (
        <SourceCard key={source.id} source={source} queryClient={queryClient} />
      ))}
    </div>
  );
}

function SourceCard({ source, queryClient }: { source: NewsSource; queryClient: ReturnType<typeof useQueryClient> }) {
  const [feedUrl, setFeedUrl] = useState(source.feed_url || '');
  const [enabled, setEnabled] = useState(source.is_enabled);
  const [testResult, setTestResult] = useState<{ ok: boolean; count?: number; sampleTitles?: string[]; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('news-source-update', {
        body: { id: source.id, feed_url: feedUrl || null, is_enabled: enabled },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-sources-settings'] });
      queryClient.invalidateQueries({ queryKey: ['news-sources'] });
      toast.success(`${source.name} uuendatud`);
    },
    onError: () => toast.error('Salvestamine ebaÃµnnestus'),
  });

  const testFeed = async () => {
    if (!feedUrl) { toast.error('Sisesta RSS URL'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('news-pull-test', {
        body: {
          slug: source.slug,
          source_key: source.source_key,
          feed_url: feedUrl,
          type: source.type,
          kind: source.type,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        setTestResult({
          ok: true,
          count: Number(data?.count || 0),
          sampleTitles: Array.isArray(data?.sampleTitles) ? data.sampleTitles : [],
        });
      } else {
        setTestResult({ ok: false, error: data?.error || 'Voogu ei Ãµnnestunud lugeda' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message || 'Voogu ei Ãµnnestunud lugeda' });
    } finally {
      setTesting(false);
    }
  };

  const isFacebook = source.slug.includes('facebook');

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">{source.name}</span>
          <Badge variant="outline" className="text-xs">{source.type}</Badge>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">RSS / Atom URL</Label>
        <Input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="https://rss.app/feeds/..."
          className="h-9 text-sm"
        />
        {isFacebook && (
          <p className="text-xs text-muted-foreground">
            Kasuta Facebookâ†’RSS teenust (nt RSS.app / FetchRSS). Facebooki tokenit pole vaja.
          </p>
        )}
      </div>

      {testResult && (
        <div className={`text-xs p-2 rounded-md ${testResult.ok ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
          {testResult.ok ? (
            <div className="flex items-start gap-1.5">
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Leitud: {testResult.count ?? 0}</p>
                {testResult.sampleTitles?.[0] && <p className="opacity-70">{testResult.sampleTitles[0]}</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" />
              <span>{testResult.error || 'Voogu ei õnnestunud lugeda'}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={testFeed}
          disabled={testing || !feedUrl}
          className="gap-1.5"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
          Testi voogu
        </Button>
        <Button
          size="sm"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
        >
          Salvesta
        </Button>
      </div>
    </div>
  );
}

