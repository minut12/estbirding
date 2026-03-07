import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/config/supabaseClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, TestTube, Check, X } from 'lucide-react';
import { loadNewsSourcesWithOrigin, normalizeSourceUrl, resetNewsSourcesToDefaults, saveNewsSources, type NewsSourcesOrigin } from '@/lib/newsSourcesStorage';
import type { NewsSourceConfigItem } from '@/config/newsSources';
import { resolveProxyBase } from '@/config/proxyEndpoint';
import { normalizeDisplayText } from '@/lib/textNormalize';
import NewsDiagnosticsPanel from './NewsDiagnosticsPanel';

type NewsSource = NewsSourceConfigItem;
type CloudNewsSourceRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  feed_url: string | null;
  fetch_url?: string | null;
  homepage_url?: string | null;
  is_enabled: boolean;
  source_key?: string | null;
  key?: string | null;
  translate_to_et?: boolean | null;
};

function slugifySourceId(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || `rss_${Date.now()}`;
}

export default function NewsSourcesSettings() {
  const seeded = useMemo(() => loadNewsSourcesWithOrigin(), []);
  const [localSources, setLocalSources] = useState<NewsSource[]>(seeded.sources);
  const [origin, setOrigin] = useState<NewsSourcesOrigin>(seeded.source);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceTranslateToEt, setNewSourceTranslateToEt] = useState(true);

  const mapCloudRowToSource = (row: CloudNewsSourceRow): NewsSource => ({
    id: String(row.slug || row.source_key || row.key || row.id || '').trim(),
    name: String(row.name || '').trim(),
    kind: String(row.type || 'rss').trim() === 'scrape' ? 'scrape' : 'rss',
    url: normalizeSourceUrl(String(row.feed_url || row.fetch_url || row.homepage_url || '').trim()),
    enabled: row.is_enabled !== false,
    translate_to_et: String(row.slug || '').trim() === 'eoy' || String(row.name || '').trim() === 'EOÜ'
      ? false
      : row.translate_to_et === true,
  });

  const loadCloudSources = async () => {
    setLoadingCloud(true);
    try {
      let rows: CloudNewsSourceRow[] | null = null;
      let error: any = null;
      ({ data: rows, error } = await supabase
        .from('news_sources')
        .select('id, name, slug, type, feed_url, fetch_url, homepage_url, is_enabled, source_key, key, translate_to_et')
        .order('name', { ascending: true }) as any);

      if (error) {
        ({ data: rows, error } = await supabase
          .from('news_sources')
          .select('id, name, slug, type, feed_url, fetch_url, homepage_url, is_enabled, source_key, key')
          .order('name', { ascending: true }) as any);
      }

      if (error) throw error;
      const mapped = (rows || [])
        .map(mapCloudRowToSource)
        .filter((row) => row.id && row.name && row.url);

      if (mapped.length > 0) {
        setLocalSources(mapped);
        setOrigin('stored');
        saveNewsSources(mapped);
      }
    } catch (error) {
      console.error('[news-settings] failed to load cloud news sources', error);
      toast.error('Uudiste allikate laadimine pilvest ebaõnnestus');
    } finally {
      setLoadingCloud(false);
    }
  };

  useEffect(() => {
    void loadCloudSources();
  }, []);

  const onResetDefaults = () => {
    const defaults = resetNewsSourcesToDefaults();
    void (async () => {
      try {
        for (const source of defaults) {
          const normalizedUrl = normalizeSourceUrl(source.url);
          const { data, error } = await supabase.functions.invoke('news-source-update', {
            body: {
              id: source.id,
              slug: source.id,
              source_key: source.id,
              key: source.id,
              name: source.name,
              type: source.kind,
              feed_url: normalizedUrl,
              is_enabled: source.enabled,
              translate_to_et: source.id === 'eoy' ? false : source.translate_to_et === true,
            },
          });
          if ((data as { success?: boolean } | null)?.success === false) throw new Error(String((data as { error?: string } | null)?.error || 'Viga'));
          if (error) throw error;
        }
        await loadCloudSources();
        setOrigin('stored');
        toast.success('Vaikimisi allikad taastatud');
      } catch (error) {
        console.error('[news-settings] failed to reset defaults in cloud', error);
        toast.error('Vaikimisi allikate taastamine ebaõnnestus');
      }
    })();
  };

  const onLocalUpdate = (next: NewsSource) => {
    setLocalSources((prev) => prev.map((source) => (source.id === next.id ? next : source)));
  };

  const onAddSource = () => {
    const name = newSourceName.trim();
    const normalizedUrl = normalizeSourceUrl(newSourceUrl);
    if (!name || !normalizedUrl) {
      toast.error('Sisesta nimi ja RSS URL');
      return;
    }

    const idBase = slugifySourceId(name);
    const existingIds = new Set(localSources.map((source) => source.id));
    let id = idBase;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${idBase}_${suffix}`;
      suffix += 1;
    }

    const next: NewsSource = {
      id,
      name,
      kind: 'rss',
      url: normalizedUrl,
      enabled: true,
      translate_to_et: newSourceTranslateToEt,
    };

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('news-source-update', {
          body: {
            id,
            slug: id,
            source_key: id,
            key: id,
            name,
            type: 'rss',
            feed_url: normalizedUrl,
            is_enabled: true,
            translate_to_et: newSourceTranslateToEt,
          },
        });
        if ((data as { success?: boolean } | null)?.success === false) throw new Error(String((data as { error?: string } | null)?.error || 'Viga'));
        if (error) throw error;
        await loadCloudSources();
        setNewSourceName('');
        setNewSourceUrl('');
        setNewSourceTranslateToEt(true);
        toast.success(`${name} lisatud`);
      } catch (error) {
        console.error('[news-settings] failed to add cloud source', error);
        toast.error(`${name}: salvestamine ebaõnnestus`);
      }
    })();
  };

  const sources = localSources;

  if (sources.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{loadingCloud ? 'Laen uudiste allikaid…' : 'Uudiste allikaid pole.'}</p>
        <Button variant="outline" size="sm" onClick={onResetDefaults}>Taasta vaikimisi allikad</Button>
        <p className="text-xs text-muted-foreground">Allikad: 0 (source: {origin})</p>
      </div>
    );
  }

  return (
    <div className="block space-y-4">
      <h3 className="font-semibold text-foreground">Uudiste allikad</h3>
      {loadingCloud && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Laen allikaid pilvest</span>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Uue allika nimi</Label>
          <Input
            value={newSourceName}
            onChange={(event) => setNewSourceName(event.target.value)}
            placeholder="Näiteks BirdGuides"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Uue RSS allika URL</Label>
          <Input
            value={newSourceUrl}
            onChange={(event) => setNewSourceUrl(event.target.value)}
            placeholder="https://example.com/feed.xml"
            className="h-9 text-sm"
          />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label className="text-sm">Tõlgi eesti keelde</Label>
            <p className="text-xs text-muted-foreground">Kasuta võõrkeelse RSS allika jaoks.</p>
          </div>
          <Switch checked={newSourceTranslateToEt} onCheckedChange={setNewSourceTranslateToEt} />
        </div>
        <Button onClick={onAddSource} className="w-full sm:w-auto">Lisa RSS allikas</Button>
      </div>
      {sources.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          onLocalUpdate={onLocalUpdate}
          onSaved={loadCloudSources}
        />
      ))}
      <NewsDiagnosticsPanel />
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
  onSaved,
}: {
  source: NewsSource;
  onLocalUpdate: (next: NewsSource) => void;
  onSaved: () => Promise<void>;
}) {
  const [url, setUrl] = useState(source.url || '');
  const [enabled, setEnabled] = useState(source.enabled);
  const [translateToEt, setTranslateToEt] = useState(source.id === 'eoy' ? false : source.translate_to_et === true);
  const [testResult, setTestResult] = useState<{ ok: boolean; count?: number; sampleTitles?: string[]; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const translationLocked = source.name === 'EOÜ' || source.id === 'eoy';

  const saveChanges = async () => {
    const normalizedUrl = normalizeSourceUrl(url);
    onLocalUpdate({
      ...source,
      url: normalizedUrl,
      enabled,
      translate_to_et: translationLocked ? false : translateToEt,
    });
    try {
      const { data, error } = await supabase.functions.invoke('news-source-update', {
        body: {
          id: source.id,
          slug: source.id,
          source_key: source.id,
          key: source.id,
          name: source.name,
          type: source.kind,
          feed_url: normalizedUrl,
          is_enabled: enabled,
          translate_to_et: translationLocked ? false : translateToEt,
        },
      });
      if ((data as { success?: boolean } | null)?.success === false) {
        throw new Error(String((data as { error?: string } | null)?.error || 'Viga'));
      }
      if (error) throw error;
      await onSaved();
      toast.success(`${source.name} salvestatud`);
    } catch (error: unknown) {
      const maybeErr = error as { message?: string; context?: Response } | null;
      let reason = maybeErr?.message || 'Viga';
      if (maybeErr?.context instanceof Response) {
        try {
          const payload = await maybeErr.context.json();
          const parts = [
            payload?.error,
            payload?.code ? `code=${payload.code}` : '',
            payload?.details || '',
            payload?.hint || '',
          ].filter(Boolean);
          if (parts.length > 0) reason = parts.join(' | ');
        } catch {
          // keep generic reason
        }
      }
      toast.error(`${source.name}: DB salvestus ebaõnnestus (${reason})`);
    }
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
          name: source.name,
          source_key: source.id,
          feed_url: normalizeSourceUrl(url),
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
        const details = data?.details && typeof data.details === 'object' ? data.details : null;
        const status = details?.status ? `HTTP ${details.status}` : '';
        const ctype = details?.contentType ? ` ${String(details.contentType)}` : '';
        const snippet = details?.bodySnippet ? ` - ${String(details.bodySnippet)}` : '';
        const reason = data?.error || `${source.name}: Viga`;
        setTestResult({ ok: false, error: normalizeDisplayText(`${reason}${status ? ` (${status}${ctype})` : ''}${snippet}`) });
      }
    } catch (error: unknown) {
      const maybeErr = error as { message?: string; status?: number } | null;
      const message = maybeErr?.message || (maybeErr?.status ? `HTTP ${maybeErr.status}` : 'Viga');
      setTestResult({ ok: false, error: `${source.name}: ${message}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium text-sm text-foreground">{normalizeDisplayText(source.name)}</span>
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

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div className="space-y-1">
          <Label className="text-sm">Tõlgi eesti keelde</Label>
          <p className="text-xs text-muted-foreground">
            {translationLocked ? 'EOÜ jääb alati originaalsesse eesti keelde.' : 'Kasuta ainult võõrkeelsete uudisallikate jaoks.'}
          </p>
        </div>
        <Switch
          checked={translationLocked ? false : translateToEt}
          onCheckedChange={setTranslateToEt}
          disabled={translationLocked}
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
              <span>{normalizeDisplayText(testResult.error || 'Allika lugemine ebaõnnestus')}</span>
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
