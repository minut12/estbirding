import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AlertTriangle, RefreshCw, X, ExternalLink, Bird, MapPin, Eye, BarChart3, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { loadSpeciesMeta, type SpeciesMetaMap } from '@/lib/speciesMeta';
import CorridorBadge from './CorridorBadge';
import WindyChart from './WindyChart';
import RareObservationsFeed from './RareObservationsFeed';

function buildSciNameToEbirdCode(map: SpeciesMetaMap): Map<string, string> {
  const out = new Map<string, string>();
  Object.values(map || {}).forEach((m) => {
    const sci = (m?.scientificName || '').trim().toLowerCase();
    const code = (m?.ebirdCode || '').trim();
    if (sci && code && !out.has(sci)) out.set(sci, code);
  });
  return out;
}

function buildSciNameToAvatarUrl(map: SpeciesMetaMap): Map<string, string> {
  const out = new Map<string, string>();
  Object.values(map || {}).forEach((m) => {
    const sci = (m?.scientificName || '').trim().toLowerCase();
    const url = (m?.avatarUrl || '').trim();
    if (sci && url && !out.has(sci)) out.set(sci, url);
  });
  return out;
}

function lookupEbirdCode(speciesLat: string, lookup: Map<string, string>): string | undefined {
  const k = (speciesLat || '').trim().toLowerCase();
  return k ? lookup.get(k) : undefined;
}

function lookupAvatarUrl(speciesLat: string, lookup: Map<string, string>): string | undefined {
  const k = (speciesLat || '').trim().toLowerCase();
  return k ? lookup.get(k) : undefined;
}

type RarityTier = 'none' | 'rare' | 'super' | 'mega';

type EntrySource = 'ebird' | 'et_rarity_topup' | 'elurikkus';

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
  rarity_level?: RarityTier | null;
  rarity_reason?: string | null;
  documented?: string[];
  comparison_et?: string | null;
  ee_probability_pct?: number;
  source?: EntrySource | string;
  sub_id?: string | null;
  biology_et?: EntryBiology | null;
  sights_stats?: SightsStats | null;
  data_integrity?: 'verified' | 'unverified';
};

type EntryBiology = {
  habitat_behavior?: string;
  identification?: string;
};

type SightsStats = {
  total_obs: number;
  observer_count: number;
  first_date: string;
  last_date: string;
};

function pluralizeObs(n: number): string {
  return n === 1 ? '1 vaatlus' : `${n} vaatlust`;
}

function pluralizeObserver(n: number): string {
  return n === 1 ? '1 vaatleja' : `${n} vaatlejat`;
}

function formatDateRange(first: string, last: string): string {
  const f = parseDate(first);
  const l = parseDate(last);
  if (!f && !l) return '';
  if (!f) return dayMonthFmt.format(l!);
  if (!l) return dayMonthFmt.format(f);
  if (first === last) return dayMonthFmt.format(f);
  return `${dayMonthFmt.format(f)} – ${dayMonthFmt.format(l)}`;
}

const SOURCE_DISPLAY: Record<string, { label: string; emoji: string }> = {
  ebird: { label: 'eBird', emoji: '🐦' },
  et_rarity_topup: { label: 'eBird', emoji: '🐦' },
  elurikkus: { label: 'elurikkus.ee', emoji: '🌿' },
};

function getSourceDisplay(source: string | undefined): { label: string; emoji: string } | null {
  if (!source) return null;
  return SOURCE_DISPLAY[source] ?? null;
}

function effectiveRarityTier(entry: VaatlusEntry): RarityTier {
  const lvl = entry.rarity_level;
  if (lvl === 'mega' || lvl === 'super' || lvl === 'rare' || lvl === 'none') return lvl;
  // Backwards compat: old rows without rarity_level
  return entry.is_rarity ? 'super' : 'none';
}

const TIER_RANK: Record<RarityTier, number> = { mega: 3, super: 2, rare: 1, none: 0 };

// Probability % badge color bands (Phase 2 §8):
//   green  ≥60   →  emerald
//   amber  30–59 →  amber
//   red    <30   →  red
function getProbabilityBadgeClass(pct: number): string {
  if (pct >= 60) return 'bg-emerald-500 text-white hover:bg-emerald-500/90 border-transparent';
  if (pct >= 30) return 'bg-amber-500 text-white hover:bg-amber-500/90 border-transparent';
  return 'bg-red-500 text-white hover:bg-red-500/90 border-transparent';
}

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

// ───────── Tõenäosus tab types (Phase 7) ─────────
// ToenaosusEntry is a strict superset of VaatlusEntry — the existing card
// fields render the same way; the four new fields power the probability
// badge, "Lähim vaatlus", "Naabermaad", and "Miks tõenäoline?" lines.
type ToenaosusNeighborBreakdown = {
  country_code: string;
  obs_count: number;
  last_date: string;
};

type ToenaosusEntry = VaatlusEntry & {
  ee_probability_pct: number;          // 10..85, mandatory here
  distance_to_ee_km: number;
  total_neighbor_obs_30d: number;
  neighbor_breakdown: ToenaosusNeighborBreakdown[];
  why_likely_et: string;
  probability_factors?: {
    tier_base: number;
    distance_factor: number;
    count_factor: number;
    season_factor: number;
  };
  avatar_url?: string | null;
};

type ToenaosusRaport = {
  id: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  season: 'spring_summer' | 'fall_winter';
  regions: string[];
  intro_et: string | null;
  entries: ToenaosusEntry[];
  source_data: Record<string, unknown> | null;
  model: string | null;
  generation_meta: Record<string, unknown> | null;
};

type KevadranneArrival = {
  species_et: string;
  species_lat: string | null;
  first_obs_date: string;
  locality: string | null;
  county: string | null;
  observer: string | null;
  obs_count_in_period: number;
};

type ElurikkusRaport = {
  id: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  intro_et: string | null;
  estonia_entries: VaatlusEntry[];
  kevadranne_narrative_et: string | null;
  kevadranne_arrivals: KevadranneArrival[];
  generation_meta?: Record<string, unknown>;
};

function mergeEstoniaEntries(
  fromVaatluste: VaatlusEntry[] | undefined,
  fromElurikkus: VaatlusEntry[] | undefined,
): VaatlusEntry[] {
  const all = [...(fromVaatluste ?? []), ...(fromElurikkus ?? [])];
  const seen = new Set<string>();
  const merged: VaatlusEntry[] = [];
  for (const e of all) {
    const key = [
      String(e.species_lat ?? '').toLowerCase().trim(),
      String(e.date ?? '').trim(),
      String(e.location ?? '').toLowerCase().trim(),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }
  return merged;
}

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
  return lookup.get(`${entry.species_lat}|${entry.date}|${entry.location}`) ?? entry.sub_id ?? undefined;
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

function EntryCard({ entry, subId, ebirdCode, avatarUrl }: { entry: VaatlusEntry; subId?: string; ebirdCode?: string; avatarUrl?: string }) {
  const tier = effectiveRarityTier(entry);
  const flag = entry.country_code && entry.country_code !== 'EE' ? FLAG[entry.country_code] : undefined;
  const obs = formatObservers(entry.observers);
  const isUnverified = entry.data_integrity === 'unverified';
  return (
    <Card
      className={cn(
        'p-4 space-y-2',
        tier === 'rare' && 'border-l-4 border-l-amber-500 bg-amber-50/40',
        tier === 'super' && 'border-l-4 border-l-destructive bg-destructive/5',
        tier === 'mega' && 'border-l-8 border-l-red-800 bg-red-900/5 ring-1 ring-red-800/40 shadow-md',
      )}
    >
      {tier !== 'none' && (
        <div className="flex items-center gap-2">
          {tier === 'rare' && (
            <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500/90 border-transparent">
              Rari
            </Badge>
          )}
          {tier === 'super' && (
            <Badge className="gap-1 bg-red-600 text-white hover:bg-red-600/90 border-transparent">
              <AlertTriangle className="w-3 h-3" />
              Super rari
            </Badge>
          )}
          {tier === 'mega' && (
            <Badge className="gap-1 bg-red-800 text-white hover:bg-red-800/90 border-transparent font-bold shadow-sm">
              <AlertTriangle className="w-3 h-3" />
              Mega rari
            </Badge>
          )}
        </div>
      )}
      <div className="flex items-start gap-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={entry.species_et}
            loading="lazy"
            className="w-14 h-14 rounded-md object-cover shrink-0 bg-muted"
          />
        ) : (
          <div className="w-14 h-14 rounded-md shrink-0 bg-muted flex items-center justify-center text-muted-foreground">
            <Bird className="w-7 h-7" />
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-2 min-w-0 flex-1">
          <span className="font-semibold">{entry.species_et}</span>
          <span className="italic text-muted-foreground text-sm">({entry.species_lat})</span>
        </div>
      </div>
      {tier !== 'none' && entry.rarity_reason && (
        <p className={cn('text-sm', tier === 'rare' ? 'text-amber-700' : 'text-destructive')}>{entry.rarity_reason}</p>
      )}
      <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{formatEntryDate(entry.date)}</span>
        <span>·</span>
        <span>{entry.location}</span>
        {entry.country_code && entry.country_code !== 'EE' && (flag || entry.region) && (
          <>
            <span>·</span>
            {flag && <span aria-hidden>{flag}</span>}
            {entry.region && <span>{entry.region}</span>}
          </>
        )}
        {(!entry.country_code || entry.country_code === 'EE') && entry.region && (
          <>
            <span>·</span>
            <span>{entry.region}</span>
          </>
        )}
        {(() => {
          const src = getSourceDisplay(entry.source);
          if (!src) return null;
          return (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-xs">
                <span aria-hidden>{src.emoji}</span>
                <span>{src.label}</span>
              </span>
            </>
          );
        })()}
      </div>
      {!obs.unknown && (
        <div className="text-sm">
          <span className="text-muted-foreground">Vaatleja(d): </span>
          <span>{obs.text}</span>
        </div>
      )}
      {subId && (entry.source === 'ebird' || entry.source === 'et_rarity_topup') && (
        <a
          href={`https://ebird.org/checklist/${subId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Vaata kontrollnimekirja
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
      {typeof entry.count === 'number' && entry.count > 1 && (
        <div className="text-sm">
          <span className="text-muted-foreground">Arv: </span>
          {entry.count} isendit
        </div>
      )}
      {!isUnverified && entry.documented && entry.documented.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.documented.map((d) => {
            const isFoto = d.toLowerCase() === 'foto';
            if (isFoto && avatarUrl) return null;
            if (isFoto && ebirdCode) {
              return (
                <a
                  key={d}
                  href={`https://ebird.org/species/${ebirdCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Badge variant="secondary" className="capitalize gap-1 hover:bg-secondary/80 cursor-pointer">
                    {d}
                    <ExternalLink className="w-3 h-3" />
                  </Badge>
                </a>
              );
            }
            if (isFoto && subId) {
              return (
                <a
                  key={d}
                  href={`https://ebird.org/checklist/${subId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Badge variant="secondary" className="capitalize gap-1 hover:bg-secondary/80 cursor-pointer">
                    {d}
                    <ExternalLink className="w-3 h-3" />
                  </Badge>
                </a>
              );
            }
            return (
              <Badge key={d} variant="secondary" className="capitalize">{d}</Badge>
            );
          })}
        </div>
      )}
      {Number.isFinite(entry.ee_probability_pct) && (
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Hetkeline tõenäosus liiki Eestis kohata">
          <span className="font-medium">Eesti tõenäosus:</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
            {entry.ee_probability_pct}%
          </span>
        </div>
      )}
      {entry.comparison_et && (
        <p className="text-sm italic text-muted-foreground">{entry.comparison_et}</p>
      )}
      {entry.biology_et && typeof entry.biology_et === 'object' && (
        (entry.biology_et.habitat_behavior || entry.biology_et.identification) && (
          <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
            {entry.biology_et.habitat_behavior && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Elupaik ja käitumine
                </h4>
                <p className="text-sm">{entry.biology_et.habitat_behavior}</p>
              </div>
            )}
            {entry.biology_et.identification && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  Tunnused
                </h4>
                <p className="text-sm">{entry.biology_et.identification}</p>
              </div>
            )}
          </div>
        )
      )}
      {!isUnverified && entry.sights_stats && typeof entry.sights_stats === 'object' && Number.isFinite(entry.sights_stats.total_obs) && (
        <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <BarChart3 className="h-3 w-3 shrink-0" />
          <span>{pluralizeObs(entry.sights_stats.total_obs)}</span>
          {entry.sights_stats.observer_count != null && entry.sights_stats.observer_count > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{pluralizeObserver(entry.sights_stats.observer_count)}</span>
            </>
          )}
          {(entry.sights_stats.first_date || entry.sights_stats.last_date) && (
            <>
              <span aria-hidden>·</span>
              <span>{formatDateRange(entry.sights_stats.first_date, entry.sights_stats.last_date)}</span>
            </>
          )}
        </div>
      )}
      {isUnverified && (
        <p className="text-xs text-muted-foreground italic mt-2">
          Üldised andmed liigi kohta; konkreetne vaatluskirje ei ole kättesaadav
        </p>
      )}
    </Card>
  );
}

function ArrivalsList({
  arrivals,
  periodStart,
  periodEnd,
}: {
  arrivals: KevadranneArrival[];
  periodStart?: string;
  periodEnd?: string;
}) {
  if (!Array.isArray(arrivals) || arrivals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Selles perioodis uusi saabujaid ei tuvastatud.
      </p>
    );
  }

  const periodLabel =
    periodStart && periodEnd ? `${formatEntryDate(periodStart)} – ${formatEntryDate(periodEnd)}` : '';

  return (
    <div className="space-y-3 py-4">
      {periodLabel && (
        <p className="text-sm font-medium">Uusi saabujad perioodil {periodLabel}:</p>
      )}
      <ul className="space-y-2 list-none pl-0">
        {arrivals.map((arr, idx) => (
          <li
            key={`${arr.species_lat ?? arr.species_et}-${arr.first_obs_date}-${idx}`}
            className="text-sm leading-relaxed"
          >
            <strong>{arr.species_et}</strong>
            {arr.species_lat && (
              <em className="text-muted-foreground"> ({arr.species_lat})</em>
            )}
            {' – '}
            <span>{formatEntryDate(arr.first_obs_date)}</span>
            {arr.locality && (
              <span>
                {', '}
                {arr.locality}
                {arr.county && `, ${arr.county}`}
              </span>
            )}
            {arr.observer && (
              <span className="text-muted-foreground"> ({arr.observer})</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function sortEntries(entries: VaatlusEntry[]): VaatlusEntry[] {
  return [...entries].sort((a, b) => {
    const tierDiff = TIER_RANK[effectiveRarityTier(b)] - TIER_RANK[effectiveRarityTier(a)];
    if (tierDiff !== 0) return tierDiff;
    return (b.date || '').localeCompare(a.date || '');
  });
}

async function fetchLatestVaatluste(): Promise<VaatlusteRaport | null> {
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
  return row;
}

async function fetchLatestToenaosus(): Promise<ToenaosusRaport | null> {
  const { data, error } = await supabase
    .from('toenaosus_raport')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = (data || null) as ToenaosusRaport | null;
  if (row) {
    row.entries = Array.isArray(row.entries) ? row.entries : [];
    row.regions = Array.isArray(row.regions) ? row.regions : [];
  }
  return row;
}

async function fetchLatestElurikkus(): Promise<ElurikkusRaport | null> {
  const { data, error } = await (supabase as any)
    .from('elurikkus_raport')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = (data || null) as ElurikkusRaport | null;
  if (row) {
    const raw = Array.isArray(row.estonia_entries) ? row.estonia_entries : [];
    // elurikkus.ee rows store a single `observer` (string); the UI expects `observers` (string[]).
    row.estonia_entries = raw.map((e: any) => {
      if (Array.isArray(e?.observers)) return e;
      const single = typeof e?.observer === 'string' ? e.observer.trim() : '';
      return { ...e, observers: single ? [single] : [] };
    });
    row.kevadranne_arrivals = Array.isArray(row.kevadranne_arrivals) ? row.kevadranne_arrivals : [];
  }
  return row;
}

export default function OverviewTab() {
  const [report, setReport] = useState<VaatlusteRaport | null>(null);
  const [elurikkusReport, setElurikkusReport] = useState<ElurikkusRaport | null>(null);
  const [toenaosusReport, setToenaosusReport] = useState<ToenaosusRaport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<'ee' | 'eu' | 'arrivals' | 'toenaosus' | 'arhiiv'>('ee');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshingToenaosus, setIsRefreshingToenaosus] = useState(false);
  const [copiedToenaosus, setCopiedToenaosus] = useState(false);

  const fetchLatest = useCallback(async (): Promise<VaatlusteRaport | null> => {
    setError(null);
    try {
      // Fetch all three reports in parallel. eBird is required; elurikkus and
      // toenaosus are best-effort (the user can still see the eBird tabs).
      const [vaatlusteResult, elurikkusResult, toenaosusResult] = await Promise.allSettled([
        fetchLatestVaatluste(),
        fetchLatestElurikkus(),
        fetchLatestToenaosus(),
      ]);

      if (vaatlusteResult.status === 'rejected') {
        throw vaatlusteResult.reason;
      }
      const vaatlusteRow = vaatlusteResult.value;
      setReport(vaatlusteRow);

      if (elurikkusResult.status === 'fulfilled') {
        setElurikkusReport(elurikkusResult.value);
      } else {
        setElurikkusReport(null);
      }

      if (toenaosusResult.status === 'fulfilled') {
        setToenaosusReport(toenaosusResult.value);
      } else {
        setToenaosusReport(null);
      }

      return vaatlusteRow;
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

      let gotVaatluste = false;
      let gotElurikkus = false;

      while (Date.now() < deadline && !(gotVaatluste && gotElurikkus)) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const [vRes, eRes] = await Promise.allSettled([
          gotVaatluste ? Promise.resolve(null) : fetchLatestVaatluste(),
          gotElurikkus ? Promise.resolve(null) : fetchLatestElurikkus(),
        ]);
        if (!gotVaatluste && vRes.status === 'fulfilled' && vRes.value && vRes.value.generated_at > startedAt) {
          setReport(vRes.value);
          gotVaatluste = true;
        }
        if (!gotElurikkus && eRes.status === 'fulfilled' && eRes.value && eRes.value.generated_at > startedAt) {
          setElurikkusReport(eRes.value);
          gotElurikkus = true;
        }
      }

      if (!gotVaatluste) {
        setRefreshError('Värskendamine kestab oodatust kauem. Proovi hetke pärast lehte uuendada.');
      }
      setRefreshing(false);
    } catch {
      setRefreshError('Värskendamine ebaõnnestus. Proovi hiljem uuesti.');
      setRefreshing(false);
    }
  }, []);

  const handleRefreshToenaosus = useCallback(async () => {
    setIsRefreshingToenaosus(true);
    try {
      const { error } = await supabase.functions.invoke('trigger-toenaosus-refresh', {
        method: 'POST',
        body: {},
      });
      if (error) {
        const ctx: any = (error as any)?.context;
        let detail = error.message || 'Tundmatu viga';
        try {
          const body = await ctx?.json?.();
          if (body?.error) detail = body.error;
          else if (body?.message) detail = body.message;
        } catch { /* ignore */ }
        toast.error(`Viga: ${detail}`);
        setIsRefreshingToenaosus(false);
        return;
      }
      toast.success('Värskendamine käivitatud — uus raport ilmub ~1-2 minuti pärast');
      await new Promise((r) => setTimeout(r, 90_000));
      try {
        const fresh = await fetchLatestToenaosus();
        setToenaosusReport(fresh);
      } catch { /* ignore refetch errors */ }
    } catch (e: any) {
      toast.error(`Viga: ${e?.message || 'tundmatu viga'}`);
    } finally {
      setIsRefreshingToenaosus(false);
    }
  }, []);

  const mergedEstonia = useMemo(
    () => mergeEstoniaEntries(report?.estonia_entries, elurikkusReport?.estonia_entries),
    [report, elurikkusReport],
  );
  const eeEntries = useMemo(() => sortEntries(mergedEstonia), [mergedEstonia]);
  const euEntries = useMemo(() => sortEntries(report?.europe_entries || []), [report]);
  const eeSubIdLookup = useMemo(() => buildSubIdLookup(report?.source_data?.estonia), [report]);
  const euSubIdLookup = useMemo(() => buildSubIdLookup(report?.source_data?.europe), [report]);
  // Use the most recent generated_at across both reports as the displayed "Värskendatud" timestamp.
  const lastUpdated = useMemo(() => {
    return [report?.generated_at, elurikkusReport?.generated_at]
      .filter((s): s is string => Boolean(s))
      .sort()
      .pop();
  }, [report, elurikkusReport]);
  // Prefer eBird's intro/period (richer Estonia + Europe context); fall back to elurikkus if eBird missing.
  const introEt = report?.intro_et ?? elurikkusReport?.intro_et ?? null;
  const periodStart = report?.period_start ?? elurikkusReport?.period_start;
  const periodEnd = report?.period_end ?? elurikkusReport?.period_end;
  const eeRarities = eeEntries.filter((e) => effectiveRarityTier(e) !== 'none').length;
  const euRarities = euEntries.filter((e) => effectiveRarityTier(e) !== 'none').length;
  const kevadranneNarrative = elurikkusReport?.kevadranne_narrative_et ?? null;
  const arrivals = useMemo(
    () => (Array.isArray(elurikkusReport?.kevadranne_arrivals) ? elurikkusReport!.kevadranne_arrivals : []),
    [elurikkusReport],
  );
  const arrivalsCount = arrivals.length;
  const toenaosusEntries = useMemo(
    () => (Array.isArray(toenaosusReport?.entries) ? toenaosusReport!.entries : []),
    [toenaosusReport],
  );
  const sortedToenaosusEntries = useMemo(() => {
    return [...toenaosusEntries].sort((a, b) => {
      if (b.ee_probability_pct !== a.ee_probability_pct) {
        return b.ee_probability_pct - a.ee_probability_pct;
      }
      return (TIER_RANK[b.rarity_level ?? 'none'] || 0) - (TIER_RANK[a.rarity_level ?? 'none'] || 0);
    });
  }, [toenaosusEntries]);
  const toenaosusCount = sortedToenaosusEntries.length;
  const handleCopyToenaosusJson = async () => {
    const payload = {
      source: 'toenaosus_raport',
      copied_at: new Date().toISOString(),
      period_label: periodStart && periodEnd ? formatPeriod(periodStart, periodEnd) : null,
      period_start: toenaosusReport?.period_start ?? null,
      period_end: toenaosusReport?.period_end ?? null,
      generated_at: toenaosusReport?.generated_at ?? null,
      candidate_count: sortedToenaosusEntries.length,
      items: sortedToenaosusEntries,
    };
    const json = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopiedToenaosus(true);
      setTimeout(() => setCopiedToenaosus(false), 2000);
    } catch (err) {
      console.error('[toenaosus-copy] clipboard write failed', err);
      toast.error('Kopeerimine ebaõnnestus');
    }
  };
  const activeEntries = section === 'eu' ? euEntries : eeEntries;
  const activeLookup = section === 'eu' ? euSubIdLookup : eeSubIdLookup;
  const speciesMetaMap = useMemo(() => loadSpeciesMeta(), [report]);
  const ebirdCodeLookup = useMemo(() => buildSciNameToEbirdCode(speciesMetaMap), [speciesMetaMap]);
  const avatarUrlLookup = useMemo(() => buildSciNameToAvatarUrl(speciesMetaMap), [speciesMetaMap]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="text-2xl font-semibold">Ülevaade</h1>
            {report && periodStart && periodEnd && (
              <>
                <p className="text-sm text-muted-foreground">
                  Periood: {formatPeriod(periodStart, periodEnd)}
                </p>
                {lastUpdated && (
                  <p className="text-xs text-muted-foreground">
                    Värskendatud {formatRelative(lastUpdated)}
                  </p>
                )}
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
            {introEt && (
              <p className="text-sm leading-relaxed">{introEt}</p>
            )}
            {kevadranneNarrative && (
              <p className="text-sm leading-relaxed text-foreground/90">{kevadranneNarrative}</p>
            )}

            <div className="flex w-full gap-1 sm:gap-2 border-b border-border">
              {([
                { id: 'ee' as const, label: 'Eesti', count: eeRarities, disabled: false },
                { id: 'eu' as const, label: 'Euroopa', count: euRarities, disabled: false },
                { id: 'arrivals' as const, label: 'Saabujad', count: arrivalsCount, disabled: arrivalsCount === 0 },
                { id: 'toenaosus' as const, label: 'Tõenäosus', count: toenaosusCount, disabled: false },
                { id: 'arhiiv' as const, label: 'Arhiiv', count: 0, disabled: false },
              ]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => !t.disabled && setSection(t.id)}
                  disabled={t.disabled}
                  className={cn(
                    'flex-1 min-w-0 px-1 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 -mb-px flex items-center justify-center gap-1 sm:gap-2 transition-colors',
                    section === t.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                    t.disabled && 'opacity-50 cursor-not-allowed hover:text-muted-foreground',
                  )}
                >
                  <span className="truncate">{t.label}</span>
                  {t.count > 0 && (
                    t.id === 'toenaosus' ? (
                      <Badge className="h-5 px-1 sm:px-1.5 text-[10px] shrink-0 bg-emerald-100 text-emerald-700 border-transparent hover:bg-emerald-100">
                        {t.count}
                      </Badge>
                    ) : (
                      <Badge
                        variant={t.id === 'arrivals' ? 'secondary' : 'destructive'}
                        className="h-5 px-1 sm:px-1.5 text-[10px] shrink-0"
                      >
                        {t.count}
                      </Badge>
                    )
                  )}
                </button>
              ))}
            </div>

            {section === 'arrivals' ? (
              <ArrivalsList
                arrivals={arrivals}
                periodStart={elurikkusReport?.period_start ?? periodStart}
                periodEnd={elurikkusReport?.period_end ?? periodEnd}
              />
            ) : section === 'toenaosus' ? (
              <div className="space-y-3 w-full max-w-full overflow-x-hidden">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyToenaosusJson}
                    disabled={sortedToenaosusEntries.length === 0}
                    className="gap-2"
                  >
                    {copiedToenaosus ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedToenaosus ? 'Kopeeritud!' : 'Kopeeri JSON'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshToenaosus}
                    disabled={isRefreshingToenaosus}
                    className="gap-2"
                  >
                    <RefreshCw className={cn('w-4 h-4', isRefreshingToenaosus && 'animate-spin')} />
                    {isRefreshingToenaosus ? 'Värskendab...' : 'Värskenda nüüd'}
                  </Button>
                </div>
                {toenaosusReport === null ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Tõenäosuse andmed pole veel saadaval. Vajuta Värskenda nuppu.
                </p>
              ) : sortedToenaosusEntries.length === 0 ? (
                <>
                  {toenaosusReport.intro_et && (
                    <p className="text-sm leading-relaxed">{toenaosusReport.intro_et}</p>
                  )}
                  <CorridorBadge weatherCorridors={(toenaosusReport as any)?.source_data?.weather_corridors} />
                  <WindyChart />
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Selles perioodis ei tuvastatud naabermaades vaatlusi haruldastest liikidest, kes võiksid lähiajal Eestisse jõuda.
                  </p>
                </>
              ) : (
                <>
                  {toenaosusReport.intro_et && (
                    <p className="text-sm leading-relaxed">{toenaosusReport.intro_et}</p>
                  )}
                  <CorridorBadge weatherCorridors={(toenaosusReport as any)?.source_data?.weather_corridors} />
                  <WindyChart />
                  <div className="space-y-3">
                    {sortedToenaosusEntries.map((entry, idx) => {
                      const tier = effectiveRarityTier(entry);
                      const avatarUrl = entry.avatar_url || lookupAvatarUrl(entry.species_lat, avatarUrlLookup);
                      const countNum = entry.count ?? 1;
                      return (
                        <Card
                          key={`${entry.species_lat}-${entry.sub_id ?? entry.date}-${idx}`}
                          className={cn(
                            'p-4 space-y-2',
                            tier === 'rare' && 'border-l-4 border-l-amber-500 bg-amber-50/40',
                            tier === 'super' && 'border-l-4 border-l-destructive bg-destructive/5',
                            tier === 'mega' && 'border-l-8 border-l-red-800 bg-red-900/5 ring-1 ring-red-800/40 shadow-md',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              {tier === 'rare' && (
                                <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500/90 border-transparent">
                                  Rari
                                </Badge>
                              )}
                              {tier === 'super' && (
                                <Badge className="gap-1 bg-red-600 text-white hover:bg-red-600/90 border-transparent">
                                  <AlertTriangle className="w-3 h-3" />
                                  Super rari
                                </Badge>
                              )}
                              {tier === 'mega' && (
                                <Badge className="gap-1 bg-red-800 text-white hover:bg-red-800/90 border-transparent font-bold shadow-sm">
                                  <AlertTriangle className="w-3 h-3" />
                                  Mega rari
                                </Badge>
                              )}
                            </div>
                            <Badge className={cn('px-2 py-1 text-base font-bold', getProbabilityBadgeClass(entry.ee_probability_pct))}>
                              {entry.ee_probability_pct}%
                            </Badge>
                          </div>

                          <div className="flex items-start gap-3">
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={entry.species_et}
                                loading="lazy"
                                className="w-14 h-14 rounded-md object-cover shrink-0 bg-muted"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-md shrink-0 bg-muted flex items-center justify-center text-muted-foreground">
                                <Bird className="w-7 h-7" />
                              </div>
                            )}
                            <div className="flex flex-wrap items-baseline gap-x-2 min-w-0 flex-1">
                              <span className="font-semibold">{entry.species_et}</span>
                              <span className="italic text-muted-foreground text-sm">({entry.species_lat})</span>
                            </div>
                          </div>

                          {entry.rarity_reason && (
                            <p className={cn('text-sm', tier === 'rare' ? 'text-amber-700' : 'text-destructive')}>
                              {entry.rarity_reason}
                            </p>
                          )}

                          <p className="text-xs text-muted-foreground">
                            <span className="font-semibold">Lähim vaatlus:</span>{' '}
                            {entry.country_code} · {entry.location} · {entry.date} ·{' '}
                            {countNum} {countNum === 1 ? 'isend' : 'isendit'} ·{' '}
                            {entry.distance_to_ee_km} km Eestist
                          </p>

                          {entry.neighbor_breakdown.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              <span className="font-semibold">Naabermaad:</span>{' '}
                              {entry.neighbor_breakdown
                                .map((b) => `${b.country_code} ×${b.obs_count}`)
                                .join(' · ')}
                            </p>
                          )}

                          {entry.why_likely_et && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground">Miks tõenäoline?</p>
                              <p className="text-sm italic text-muted-foreground">{entry.why_likely_et}</p>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
              </div>
            ) : section === 'arhiiv' ? (
              <div className="overflow-x-hidden w-full max-w-full pt-4">
                <RareObservationsFeed />
              </div>
            ) : (
              <div className="space-y-3">
                {activeEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Sel perioodil silmapaistvaid vaatlusi ei registreeritud.
                  </p>
                ) : (
                  activeEntries.map((entry, idx) => (
                    <EntryCard
                      key={`${entry.species_lat}-${entry.date}-${idx}`}
                      entry={entry}
                      subId={findSubId(entry, activeLookup)}
                      ebirdCode={lookupEbirdCode(entry.species_lat, ebirdCodeLookup)}
                      avatarUrl={lookupAvatarUrl(entry.species_lat, avatarUrlLookup)}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
