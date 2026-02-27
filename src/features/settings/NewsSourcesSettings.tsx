import { useMemo, useState } from 'react';
import { supabase } from '@/config/supabaseClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, TestTube, Check, X } from 'lucide-react';
import { loadNewsSourcesWithOrigin, resetNewsSourcesToDefaults, saveNewsSources, type NewsSourcesOrigin } from '@/lib/newsSourcesStorage';
import type { NewsSourceConfigItem } from '@/config/newsSources';
import { resolveProxyBase } from '@/config/proxyEndpoint';

interface NewsSource extends NewsSourceConfigItem {}

export default function NewsSourcesSettings() {
  const seeded = useMemo(() => loadNewsSourcesWithOrigin(), []);
  const [localSources, setLocalSources] = useState<NewsSource[]>(seeded.sources);
  const [origin, setOrigin] = useState<NewsSourcesOrigin>(seeded.source);

  const onResetDefaults = () => {
    const defaults = resetNewsSourcesToDefaults();
    setLocalSources(defaults);
    setOrigin('default');
    toast.success('Vaikimisi allikad taastatud');
  };

  const onLocalUpdate = (next: NewsSource) => {
    setLocalSources((prev) => {
      const updated = prev.map((source) => (source.id === next.id ? next : source));
      saveNewsSources(updated);
      return updated;
    });
    setOrigin('stored');
  };

  const sources = localSources;

  if (sources.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Uudiste allikaid pole.</p>
        <Button variant="outline" size="sm" onClick={onResetDefaults}>Taasta vaikimisi allikad</Button>
        <p className="text-xs text-muted-foreground">Allikad: 0 (source: {origin})</p>
      </div>
    );
  }

  return (
    <div className="block space-y-4">
      <h3 className="font-semibold text-foreground">Uudiste allikad</h3>
      {sources.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          onLocalUpdate={onLocalUpdate}
        />
      ))}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Allikad: {sources.length} (source: {origin})</p>
        <Button variant="ghost" size="sm" onClick={onResetDefaults}>Taasta vaikimisi allikad</Button>
      </div>
    </div>
  );
}

function SourceCard({
  source,
  onLocalUpdate,
}: {
  source: NewsSource;
  onLocalUpdate: (next: NewsSource) => void;
}) {
  const [url, setUrl] = useState(source.url || '');
  const [enabled, setEnabled] = useState(source.enabled);
  const [testResult, setTestResult] = useState<{ ok: boolean; count?: number; sampleTitles?: string[]; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const saveChanges = () => {
    onLocalUpdate({ ...source, url: url.trim(), enabled });
    toast.success(`${source.name} salvestatud`);
  };

  const testFeed = async () => {
    if (!url) {
      toast.error('Sisesta URL');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('news-pull-test', {
        body: {
          id: source.id,
          source_key: source.id,
          feed_url: url,
          type: source.kind,
          kind: source.kind,
          proxyBase: resolveProxyBase(),
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
        setTestResult({ ok: false, error: data?.error || 'Allika lugemine ebaonnestus' });
      }
    } catch (error: any) {
      setTestResult({ ok: false, error: error?.message || 'Allika lugemine ebaonnestus' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium text-sm text-foreground">{source.name}</span>
          <Badge variant="outline" className="text-xs">{source.kind}</Badge>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
            >
              Ava allikas
            </a>
          )}
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">URL</Label>
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/feed.xml"
          className="h-9 text-sm"
        />
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
              <span>{testResult.error || 'Allika lugemine ebaonnestus'}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          size="sm"
          onClick={testFeed}
          disabled={testing || !url}
          className="gap-1.5 w-full sm:w-auto"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
          Testi allikat
        </Button>
        <Button
          size="sm"
          onClick={saveChanges}
          className="w-full sm:w-auto"
        >
          Salvesta
        </Button>
      </div>
    </div>
  );
}
