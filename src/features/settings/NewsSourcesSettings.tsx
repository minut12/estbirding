import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/config/supabaseClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, TestTube, Check, X, Plus, Activity, RotateCcw, ChevronDown, ChevronUp, ExternalLink, type LucideIcon } from 'lucide-react';
import { isDeveloperModeEnabled } from '@/config/supabaseConfig';
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

export type NewsSourceStat = {
  source_slug: string;
  items_7d: number;
  items_30d: number;
  last_published_at: string | null;
  translation_errors_30d: number;
};

type NewsSourceStatsRpcClient = {
  rpc: (fn: 'get_news_source_stats') => PromiseLike<{ data: unknown; error: unknown }>;
};

const SOURCE_COUNTRY_CODES: Record<string, string> = {
  birdlife_suomi: 'FI',
  birdlife_poland: 'PL',
  birding_poland: 'PL',
  birding_estonia: 'EE',
  eoy: 'EE',
  birding_latvia: 'LV',
  birding_lithuania: 'LT',
  birding_belgium: 'BE',
  birding_iceland: 'IS',
};

const QUIET_AMBER = '#D99A1E';

const STAT_DATE_FORMAT = new Intl.DateTimeFormat('et-EE', { day: 'numeric', month: 'short', timeZone: 'Europe/Tallinn' });

function getSourceCountryCode(source: NewsSourceConfigItem): string {
  return SOURCE_COUNTRY_CODES[source.id] ?? source.name.trim().slice(0, 2).toUpperCase();
}

function toFiniteNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseNewsSourceStats(data: unknown): Record<string, NewsSourceStat> | null {
  if (!Array.isArray(data)) return null;
  const entries = data
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row): NewsSourceStat => ({
      source_slug: String(row.source_slug ?? '').trim(),
      items_7d: toFiniteNumber(row.items_7d),
      items_30d: toFiniteNumber(row.items_30d),
      last_published_at: typeof row.last_published_at === 'string' ? row.last_published_at : null,
      translation_errors_30d: toFiniteNumber(row.translation_errors_30d),
    }))
    .filter((stat) => stat.source_slug !== '')
    .map((stat): [string, NewsSourceStat] => [stat.source_slug, stat]);
  return Object.fromEntries(entries);
}

function formatStatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : STAT_DATE_FORMAT.format(date);
}

function newsNoun(count: number): string {
  return count === 1 ? 'uudis' : 'uudist';
}

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
  const [showAdd, setShowAdd] = useState(false);
  const [pendingAddClose, setPendingAddClose] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [stats, setStats] = useState<Record<string, NewsSourceStat> | null>(null);

  const loadStats = async () => {
    try {
      const { data, error } = await (supabase as unknown as NewsSourceStatsRpcClient).rpc('get_news_source_stats');
      if (error) throw error;
      const parsed = parseNewsSourceStats(data);
      if (parsed) setStats(parsed);
    } catch (error) {
      console.error('[news-settings] failed to load news source stats', error);
    }
  };

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
    void loadStats();
  };

  useEffect(() => {
    void loadStats();
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

  // onAddSource clears name + URL only on its success path; arm a pending flag here
  // (only when its validation will pass) and close the form once the fields are cleared.
  const onSubmitAdd = () => {
    if (newSourceName.trim() && normalizeSourceUrl(newSourceUrl)) setPendingAddClose(true);
    onAddSource();
  };

  useEffect(() => {
    if (pendingAddClose && newSourceName === '' && newSourceUrl === '') {
      setPendingAddClose(false);
      setShowAdd(false);
    }
  }, [pendingAddClose, newSourceName, newSourceUrl]);

  const onCancelAdd = () => {
    setPendingAddClose(false);
    setShowAdd(false);
    setNewSourceName('');
    setNewSourceUrl('');
    setNewSourceTranslateToEt(true);
  };

  const sources = localSources;
  const enabledCount = sources.filter((source) => source.enabled).length;
  const items30dOf = (source: NewsSource): number => stats?.[source.id]?.items_30d ?? 0;
  const items7dOf = (source: NewsSource): number => stats?.[source.id]?.items_7d ?? 0;
  const enabledSources = sources.filter((source) => source.enabled);
  const enabledItems7d = enabledSources.reduce((sum, source) => sum + items7dOf(source), 0);
  const enabledItems30d = enabledSources.reduce((sum, source) => sum + items30dOf(source), 0);
  const maxItems30d = sources.reduce((max, source) => Math.max(max, items30dOf(source)), 0);
  const orderedSources = stats
    ? [...sources].sort((a, b) => (
      Number(b.enabled) - Number(a.enabled)
      || items30dOf(b) - items30dOf(a)
      || a.name.localeCompare(b.name, 'et')
    ))
    : sources;

  if (sources.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{loadingCloud ? 'Laen uudiste allikaid…' : 'Uudiste allikaid pole.'}</p>
        <Button variant="outline" size="sm" onClick={onResetDefaults}>Taasta vaikimisi allikad</Button>
        {isDeveloperModeEnabled() && <p className="text-xs text-muted-foreground">Allikad: 0 (source: {origin})</p>}
      </div>
    );
  }

  return (
    <div className="block space-y-4">
      {loadingCloud && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Laen allikaid pilvest&hellip;</span>
        </div>
      )}
      {showAdd ? (
        <div className="rounded-[14px] border border-border bg-card p-3.5 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Uue allika nimi</Label>
            <Input
              value={newSourceName}
              onChange={(event) => setNewSourceName(event.target.value)}
              placeholder={'N\u00e4iteks BirdGuides'}
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
              <Label className="text-sm">T&otilde;lgi eesti keelde</Label>
              <p className="text-xs text-muted-foreground">Kasuta v&otilde;&otilde;rkeelse RSS allika jaoks.</p>
            </div>
            <Switch checked={newSourceTranslateToEt} onCheckedChange={setNewSourceTranslateToEt} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={onSubmitAdd} className="w-full sm:w-auto">Lisa</Button>
            <Button variant="outline" onClick={onCancelAdd} className="w-full sm:w-auto">T&uuml;hista</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-border bg-card text-primary font-semibold"
        >
          <Plus className="h-4 w-4" />
          Lisa allikas
        </button>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-foreground p-4 text-background">
          <StatSummaryCell value={String(enabledItems7d)} label={<>uudist 7 p&auml;evaga</>} />
          <StatSummaryCell value={String(enabledItems30d)} label={<>uudist 30 p&auml;evaga</>} />
          <StatSummaryCell value={`${enabledCount}/${sources.length}`} label="allikat sees" />
        </div>
      )}

      <section>
        <h3 className="text-[13px] font-semibold text-muted-foreground mb-2 ml-1">
          {stats ? <>Aktiivsuse j&auml;rgi</> : <>{sources.length} allikat &middot; {enabledCount} sees</>}
        </h3>
        <div className="overflow-hidden rounded-[14px] border border-border bg-card divide-y divide-border">
          {orderedSources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onLocalUpdate={onLocalUpdate}
              onSaved={loadCloudSources}
              stat={stats?.[source.id] ?? null}
              maxItems30d={maxItems30d}
              countryCode={getSourceCountryCode(source)}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-muted-foreground mb-2 ml-1">Hooldus</h3>
        <div className="overflow-hidden rounded-[14px] border border-border bg-card divide-y divide-border">
          <div>
            <button
              type="button"
              aria-expanded={showDiagnostics}
              onClick={() => setShowDiagnostics((prev) => !prev)}
              className={MAINTENANCE_ROW_CLASS}
            >
              <MaintenanceIconTile icon={Activity} />
              <MaintenanceRowText
                title="Uudiste diagnostika"
                sub={<>Viimase v&auml;rskenduse tulemus allikate kaupa</>}
              />
              {showDiagnostics
                ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </button>
            {showDiagnostics && <NewsDiagnosticsPanel embedded />}
          </div>
          <button type="button" onClick={onResetDefaults} className={MAINTENANCE_ROW_CLASS}>
            <MaintenanceIconTile icon={RotateCcw} />
            <MaintenanceRowText title="Taasta vaikimisi allikad" sub="Lisab puuduvad vaikeallikad tagasi" />
          </button>
        </div>
      </section>

      {isDeveloperModeEnabled() && (
        <p className="text-xs text-muted-foreground">Allikad: {sources.length} (source: {origin})</p>
      )}
    </div>
  );
}

const MAINTENANCE_ROW_CLASS = 'flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2.5 text-left';

type MaintenanceIconTileProps = {
  icon: LucideIcon;
};

function MaintenanceIconTile({ icon: Icon }: MaintenanceIconTileProps) {
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-muted text-muted-foreground">
      <Icon className="h-[18px] w-[18px]" />
    </div>
  );
}

type MaintenanceRowTextProps = {
  title: ReactNode;
  sub: ReactNode;
};

function MaintenanceRowText({ title, sub }: MaintenanceRowTextProps) {
  return (
    <div className="min-w-0 flex-1">
      <div className="font-medium text-foreground">{title}</div>
      <div className="text-[13px] text-muted-foreground">{sub}</div>
    </div>
  );
}

type StatSummaryCellProps = {
  value: string;
  label: ReactNode;
};

function StatSummaryCell({ value, label }: StatSummaryCellProps) {
  return (
    <div className="min-w-0">
      <div className="tabular-nums text-[26px] font-bold leading-tight">{value}</div>
      <div className="text-xs opacity-70">{label}</div>
    </div>
  );
}

function getSourceHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function SourceCard({
  source,
  onLocalUpdate,
  onSaved,
  stat,
  maxItems30d,
  countryCode,
}: {
  source: NewsSource;
  onLocalUpdate: (next: NewsSource) => void;
  onSaved: () => Promise<void>;
  stat: NewsSourceStat | null;
  maxItems30d: number;
  countryCode: string;
}) {
  const [url, setUrl] = useState(source.url || '');
  const [enabled, setEnabled] = useState(source.enabled);
  const [translateToEt, setTranslateToEt] = useState(source.id === 'eoy' ? false : source.translate_to_et === true);
  const [testResult, setTestResult] = useState<{ ok: boolean; count?: number; sampleTitles?: string[]; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const translationLocked = source.name === 'EOÜ' || source.id === 'eoy';

  const saveChanges = async (overrides?: { enabled?: boolean }): Promise<boolean> => {
    const normalizedUrl = normalizeSourceUrl(url);
    const nextEnabled = overrides?.enabled ?? enabled;
    onLocalUpdate({
      ...source,
      url: normalizedUrl,
      enabled: nextEnabled,
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
          is_enabled: nextEnabled,
          translate_to_et: translationLocked ? false : translateToEt,
        },
      });
      if ((data as { success?: boolean } | null)?.success === false) {
        throw new Error(String((data as { error?: string } | null)?.error || 'Viga'));
      }
      if (error) throw error;
      await onSaved();
      toast.success(`${source.name} salvestatud`);
      return true;
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
      return false;
    }
  };

  const onToggleEnabled = async (value: boolean) => {
    setEnabled(value);
    const ok = await saveChanges({ enabled: value });
    if (!ok) setEnabled(!value);
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

  const host = getSourceHost(source.url || '');
  const subParts = [source.kind === 'scrape' ? 'Veebileht' : 'RSS'];
  if (host) subParts.push(host);
  if (!enabled) subParts.push('v\u00e4ljas');
  const subLine = subParts.join(' \u00b7 ');

  const translationChip = translationLocked ? (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Eesti keeles</span>
  ) : translateToEt ? (
    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary">T&otilde;lgitakse</span>
  ) : null;

  const isQuiet = Boolean(stat) && enabled && stat?.items_7d === 0;
  const lastDate = formatStatDate(stat?.last_published_at ?? null);
  let statsLine: string | null = null;
  if (stat) {
    statsLine = enabled
      ? [
        `${stat.items_7d} ${newsNoun(stat.items_7d)} 7 p`,
        `${stat.items_30d} ${newsNoun(stat.items_30d)} 30 p`,
        ...(lastDate ? [`viimane ${lastDate}`] : []),
      ].join(' \u00b7 ')
      : ['V\u00e4ljas', ...(lastDate ? [`viimane uudis ${lastDate}`] : [])].join(' \u00b7 ');
  }
  const meterPercent = stat && maxItems30d > 0 ? Math.min(100, (stat.items_30d / maxItems30d) * 100) : 0;

  const expandedBody = (
    <div className="space-y-3 bg-muted/30 px-3.5 pb-3.5 pt-3">
      {stat && (
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{subLine}</span>
          {translationChip}
        </div>
      )}
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ava allikas
        </a>
      )}

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
          onClick={() => void saveChanges()}
          className="w-full sm:w-auto"
        >
          Salvesta
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex min-h-[60px] items-center gap-3 px-3.5 py-2.5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            aria-hidden="true"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-[11px] text-sm font-bold ${enabled ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'}`}
          >
            {countryCode}
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className={`truncate text-[15px] font-medium ${enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                {normalizeDisplayText(source.name)}
              </span>
              {stat && stat.translation_errors_30d > 0 && (
                <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  {stat.translation_errors_30d} t&otilde;lkeviga
                </span>
              )}
              {isQuiet && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: `${QUIET_AMBER}26`, color: QUIET_AMBER }}
                >
                  Vaikne
                </span>
              )}
              {!stat && translationChip}
            </span>
            <span className="flex w-full min-w-0 items-center gap-1 text-xs text-muted-foreground">
              {statsLine
                ? <span className="truncate text-[12.5px] tabular-nums">{statsLine}</span>
                : <span className="truncate">{subLine}</span>}
              {expanded
                ? <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
            </span>
            {stat && enabled && (
              <span className="mt-1 block h-[5px] w-full overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full rounded-full ${isQuiet ? '' : 'bg-primary'}`}
                  style={{ width: `${meterPercent}%`, ...(isQuiet ? { backgroundColor: QUIET_AMBER } : {}) }}
                />
              </span>
            )}
          </span>
        </button>
        <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
          <Switch checked={enabled} onCheckedChange={(value) => void onToggleEnabled(value)} />
        </div>
      </div>
      {expanded && expandedBody}
    </div>
  );
}
