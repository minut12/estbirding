import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AlertTriangle, RefreshCw, X, ExternalLink } from 'lucide-react';

type VaatlusEntry = {
  species_et: string;
  species_lat: string;
  date: string;
  location: string;
  region: string;
  country_code: string;
  observers: string[];
  lat?: number | null;
  lng?: number | null;
  count?: number | null;
  is_rarity: boolean;
  rarity_reason?: string | null;
  documented?: string[];
  comparison_et?: string | null;
};

type SourceObservation = {
  species_lat?: string;
  date?: string;
  location?: string;
  sub_id?: string;
};

type VaatlusteRaport = {
  id: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  intro_et: string | null;
  estonia_narrative_et: string | null;
  estonia_entries: VaatlusEntry[];
  europe_narrative_et: string | null;
  europe_entries: VaatlusEntry[];
  source_data?: {
    estonia?: SourceObservation[];
    europe?: SourceObservation[];
  } | null;
};

function buildSubIdLookup(obs: SourceObservation[] | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!Array.isArray(obs)) return m;
  for (const o of obs) {
    if (!o?.sub_id) continue;
    const key = `${o.species_lat || ''}|${o.date || ''}|${o.location || ''}`;
    if (!m.has(key)) m.set(key, o.sub_id);
  }
  return m;
}

function findSubId(entry: VaatlusEntry, lookup: Map<string, string>): string | undefined {
  return lookup.get(`${entry.species_lat}|${entry.date}|${entry.location}`);
}

const FLAG: Record<string, string> = {
  EE: '🇪🇪', FI: '🇫🇮', LV: '🇱🇻', LT: '🇱🇹',
  SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰', PL: '🇵🇱',
  DE: '🇩🇪', RU: '🇷🇺', 'RU-LEN': '🇷🇺',
};

const dayMonthFmt = new Intl.DateTimeFormat('et-EE', { day: 'numeric', month: 'long' });
const dayMonthYearFmt = new Intl.DateTimeFormat('et-EE', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('et-EE', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatPeriod(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return `${start} – ${end}`;
  const sameYear = s.getFullYear() === e.getFullYear();
  const left = sameYear ? dayMonthFmt.format(s) : dayMonthYearFmt.format(s);
  const right = dayMonthYearFmt.format(e);
  return `${left} – ${right}`;
}

function formatRelative(iso: string): string {
  const d = parseDate(iso);
  if (!d) return '';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'just nüüd';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} ${min === 1 ? 'minut' : 'minutit'} tagasi`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? 'tund' : 'tundi'} tagasi`;
  return dateTimeFmt.format(d);
}

function formatEntryDate(s: string): string {
  const d = parseDate(s);
  return d ? dayMonthFmt.format(d) : s;
}

function formatObservers(observers: string[] | undefined): { text: string; unknown: boolean } {
  const cleaned = (observers || []).map((o) => (o || '').trim()).filter(Boolean);
  const onlyUnknown =
    cleaned.length === 0 ||
    cleaned.every((o) => o === '(vaatleja teadmata)' || o.toLowerCase() === 'vaatleja teadmata');
  if (onlyUnknown) return { text: 'Vaatleja teadmata', unknown: true };
  return { text: cleaned.join(', '), unknown: false };
}

function EntryCard({ entry }: { entry: VaatlusEntry }) {
  const isRarity = entry.is_rarity;
  const flag = entry.country_code && entry.country_code !== 'EE' ? FLAG[entry.country_code] : undefined;
  const obs = formatObservers(entry.observers);
  return (
    <Card
      className={cn(
        'p-4 space-y-2',
        isRarity && 'border-l-4 border-l-destructive bg-destructive/5',
      )}
    >
      {isRarity && (
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            HARULDUS
          </Badge>
        </div>
      )}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold">{entry.species_et}</span>
        <span className="italic text-muted-foreground text-sm">({entry.species_lat})</span>
      </div>
      {isRarity && entry.rarity_reason && (
        <p className="text-sm text-destructive">{entry.rarity_reason}</p>
      )}
      <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{formatEntryDate(entry.date)}</span>
        <span>·</span>
        <span>{entry.location}</span>
        {entry.region && (
          <>
            <span>·</span>
            <span>
              {flag ? `${flag} ` : ''}
              {entry.region}
            </span>
          </>
        )}
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">Vaatleja(d): </span>
        <span className={cn(obs.unknown && 'text-muted-foreground italic')}>{obs.text}</span>
      </div>
      {typeof entry.count === 'number' && entry.count > 1 && (
        <div className="text-sm">
          <span className="text-muted-foreground">Arv: </span>
          {entry.count} isendit
        </div>
      )}
      {entry.documented && entry.documented.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.documented.map((d) => (
            <Badge key={d} variant="secondary" className="capitalize">{d}</Badge>
          ))}
        </div>
      )}
      {entry.comparison_et && (
        <p className="text-sm italic text-muted-foreground">{entry.comparison_et}</p>
      )}
    </Card>
  );
}

function sortEntries(entries: VaatlusEntry[]): VaatlusEntry[] {
  return [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export default function OverviewTab() {
  const [report, setReport] = useState<VaatlusteRaport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<'ee' | 'eu'>('ee');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const fetchLatest = useCallback(async (): Promise<VaatlusteRaport | null> => {
    setError(null);
    try {
      const { data, error } = await (supabase as any)
        .from('vaatluste_raport')
        .select('*')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = (data || null) as VaatlusteRaport | null;
      if (row) {
        row.estonia_entries = Array.isArray(row.estonia_entries) ? row.estonia_entries : [];
        row.europe_entries = Array.isArray(row.europe_entries) ? row.europe_entries : [];
      }
      setReport(row);
      return row;
    } catch (e: any) {
      setError(e?.message || 'Tundmatu viga');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    const startedAt = new Date().toISOString();

    try {
      const { error } = await supabase.functions.invoke('trigger-vaatluste-refresh', {
        method: 'POST',
        body: {},
      });

      if (error) {
        const ctx: any = (error as any)?.context;
        const status = ctx?.status;
        if (status === 429 && ctx) {
          const body = await ctx.json?.().catch(() => null);
          const seconds = body?.retry_after_seconds ?? 60;
          setRefreshError(
            `Eelmine värskendus toimus hiljuti. Proovi uuesti ${seconds} sekundi pärast.`,
          );
        } else {
          setRefreshError('Värskendamine ebaõnnestus. Proovi hiljem uuesti.');
        }
        setRefreshing(false);
        return;
      }

      const TIMEOUT_MS = 90_000;
      const POLL_MS = 3_000;
      const deadline = Date.now() + TIMEOUT_MS;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const { data: row } = await (supabase as any)
          .from('vaatluste_raport')
          .select('*')
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (row && row.generated_at > startedAt) {
          row.estonia_entries = Array.isArray(row.estonia_entries) ? row.estonia_entries : [];
          row.europe_entries = Array.isArray(row.europe_entries) ? row.europe_entries : [];
          setReport(row as VaatlusteRaport);
          setRefreshing(false);
          return;
        }
      }

      setRefreshError('Värskendamine kestab oodatust kauem. Proovi hetke pärast lehte uuendada.');
      setRefreshing(false);
    } catch {
      setRefreshError('Värskendamine ebaõnnestus. Proovi hiljem uuesti.');
      setRefreshing(false);
    }
  }, []);

  const eeEntries = useMemo(() => sortEntries(report?.estonia_entries || []), [report]);
  const euEntries = useMemo(() => sortEntries(report?.europe_entries || []), [report]);
  const eeRarities = eeEntries.filter((e) => e.is_rarity).length;
  const euRarities = euEntries.filter((e) => e.is_rarity).length;
  const activeEntries = section === 'ee' ? eeEntries : euEntries;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="text-2xl font-semibold">Ülevaade</h1>
            {report && (
              <>
                <p className="text-sm text-muted-foreground">
                  Periood: {formatPeriod(report.period_start, report.period_end)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Värskendatud {formatRelative(report.generated_at)}
                </p>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="shrink-0 gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            {refreshing ? 'Värskendan...' : 'Värskenda'}
          </Button>
        </header>

        {refreshError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span className="flex-1">{refreshError}</span>
            <button
              onClick={() => setRefreshError(null)}
              className="shrink-0 opacity-70 hover:opacity-100"
              aria-label="Sulge"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {!loading && error && (
          <Card className="p-6 text-center space-y-3">
            <p className="text-sm">Andmete laadimisel tekkis viga.</p>
            <Button onClick={() => { setLoading(true); fetchLatest(); }}>Proovi uuesti</Button>
          </Card>
        )}

        {!loading && !error && !report && (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Ülevaadet pole veel koostatud. Vajuta Värskenda või oota järgmist automaatset uuendust kell 06:00 või 18:00.
            </p>
          </Card>
        )}

        {!loading && !error && report && (
          <>
            {report.intro_et && (
              <p className="text-sm leading-relaxed">{report.intro_et}</p>
            )}

            <div className="flex gap-2 border-b border-border">
              {([
                { id: 'ee' as const, label: 'Eesti', count: eeRarities },
                { id: 'eu' as const, label: 'Euroopa', count: euRarities },
              ]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSection(t.id)}
                  className={cn(
                    'px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 transition-colors',
                    section === t.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                  {t.count > 0 && (
                    <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{t.count}</Badge>
                  )}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {activeEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sel perioodil silmapaistvaid vaatlusi ei registreeritud.
                </p>
              ) : (
                activeEntries.map((entry, idx) => (
                  <EntryCard key={`${entry.species_lat}-${entry.date}-${idx}`} entry={entry} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
