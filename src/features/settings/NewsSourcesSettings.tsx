import { useMemo, useState } from 'react';
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

type NewsSource = NewsSourceConfigItem;

type DiagnosticsItem = {
  title: string;
  link: string | null;
  published_at: string | null;
  dedupe_key: string | null;
  status: 'inserted' | 'updated' | 'skipped' | 'error';
  skip_reason: string | null;
  db_error: string | null;
  translation_pending: boolean;
};

type DiagnosticsSource = {
  sourceId: string;
  slug: string;
  source: string;
  enabled: boolean;
  sourceType: string;
  rssUrl: string;
  ok: boolean;
  inserted: number;
  updated: number;
  skippedItems: number;
  skipReasons: string[];
  cachedImages: number;
  fetchedCount: number;
  fetchOk?: boolean;
  visibleInLatest?: number;
  visibleInArchive?: number;
  hiddenByActiveTab?: number;
  hiddenBySourceFilter?: number;
  hiddenBySearch?: number;
  errors: string[];
  latestItems?: DiagnosticsItem[];
};

type DiagnosticsReport = {
  ok?: boolean;
  perSource?: DiagnosticsSource[];
  errors?: Array<{ source: string; error: string }>;
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
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceTranslateToEt, setNewSourceTranslateToEt] = useState(true);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsReport, setDiagnosticsReport] = useState<DiagnosticsReport | null>(null);

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

    const updated = [...localSources, next];
    setLocalSources(updated);
    saveNewsSources(updated);
    setOrigin('stored');
    setNewSourceName('');
    setNewSourceUrl('');
    setNewSourceTranslateToEt(true);
    toast.success(`${name} lisatud`);
  };

  const sources = localSources;
  const birdingLatviaSummary = diagnosticsReport?.perSource?.find((source) => source.source.toLowerCase().includes('birding latvia'));

  const runDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('news-refresh', {
        method: 'POST',
        body: {
          reason: 'diagnostics',
          cache_images: true,
          cache_limit: 10,
          translateForeignNews: true,
        },
      });
      if (error) throw error;
      setDiagnosticsReport((data || null) as DiagnosticsReport);
      setDiagnosticsOpen(true);
      toast.success('Diagnostika käivitatud');
    } catch (error: unknown) {
      const maybeErr = error as { message?: string } | null;
      toast.error(`Diagnostika ebaõnnestus (${maybeErr?.message || 'Viga'})`);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const copyDiagnostics = async () => {
    if (!diagnosticsReport) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnosticsReport, null, 2));
      toast.success('Diagnostika kopeeritud');
    } catch {
      toast.error('Diagnostika kopeerimine ebaõnnestus');
    }
  };

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
        />
      ))}
      <details className="rounded-lg border border-border bg-card p-4" open={diagnosticsOpen} onToggle={(event) => setDiagnosticsOpen((event.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer list-none">
          <div className="space-y-1">
            <h3 className="font-semibold text-foreground">Uudiste diagnostika</h3>
            <p className="text-xs text-muted-foreground">Näitab, kas allikas salvestati, loeti sisse, parsiti, salvestati andmebaasi ja kuvati uudiste loendis.</p>
          </div>
        </summary>
        <div className="mt-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={runDiagnostics} disabled={diagnosticsLoading} className="w-full sm:w-auto">
              {diagnosticsLoading ? 'Käivitan…' : 'Käivita diagnostika'}
            </Button>
            <Button variant="outline" onClick={copyDiagnostics} disabled={!diagnosticsReport} className="w-full sm:w-auto">
              Kopeeri diagnostika
            </Button>
          </div>
          {birdingLatviaSummary && (
            <div className="rounded-md border border-border p-3 text-sm">
              Birding Latvia: fetched {birdingLatviaSummary.fetchOk ? birdingLatviaSummary.fetchedCount : 0}, parsed {birdingLatviaSummary.fetchedCount}, inserted {birdingLatviaSummary.inserted}, visible in News {birdingLatviaSummary.visibleInLatest ?? 0}
              {birdingLatviaSummary.errors[0] ? `, reason: ${birdingLatviaSummary.errors[0]}` : ''}
            </div>
          )}
          {(diagnosticsReport?.perSource || []).map((source) => (
            <div key={source.sourceId} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{source.source}</span>
                <Badge variant={source.ok ? 'secondary' : 'outline'}>{source.ok ? 'OK' : 'Viga'}</Badge>
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <div>Slug/ID: {source.slug} / {source.sourceId}</div>
                <div>Enabled: {String(source.enabled)} | Translate to ET: {String(source.source !== 'EOÜ' ? true : false)}</div>
                <div>Feed URL: {source.rssUrl || '(puudub)'}</div>
                <div>Fetch: {source.fetchOk ? 'OK' : 'Viga'}{source.errors[0] ? ` | ${source.errors[0]}` : ''}</div>
                <div>Parsed: {source.fetchedCount} | Inserted: {source.inserted} | Updated: {source.updated} | Skipped: {source.skippedItems}</div>
                <div>Visible latest: {source.visibleInLatest ?? 0} | Archive: {source.visibleInArchive ?? 0} | Hidden by tab: {source.hiddenByActiveTab ?? 0}</div>
              </div>
              {(source.latestItems || []).length > 0 && (
                <div className="space-y-2">
                  {(source.latestItems || []).map((item, index) => (
                    <div key={`${source.sourceId}-${index}`} className="rounded-md border border-border p-2 text-xs space-y-1">
                      <div className="font-medium text-foreground">{item.title || '(pealkiri puudub)'}</div>
                      <div className="text-muted-foreground break-all">{item.link || '(link puudub)'}</div>
                      <div className="text-muted-foreground">
                        {item.published_at || '(kuupäev puudub)'} | {item.dedupe_key || '(dedupe puudub)'} | {item.status}
                        {item.skip_reason ? ` | ${item.skip_reason}` : ''}
                        {item.translation_pending ? ' | translation pending' : ''}
                        {item.db_error ? ` | ${item.db_error}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
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

