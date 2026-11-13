// src/features/overview/PredictionTrackRecord.tsx
// P181k: "Ennustuste tapsus" card at the bottom of Ulevaade > Toenaosus. Collapsed by default to one
// line with the species count; expands to the per-species list (sortable) and the selected species'
// calibration bars. Buckets use all predictions, independent counts are shown beside them.
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  TRACK_RECORD_MIN_N,
  earliestWindowStart,
  formatDecimal,
  sortTrackRecord,
  usePredictionTrackRecord,
  type TrackRecordBucket,
  type TrackRecordRow,
  type TrackRecordSort,
  type TrackRecordState,
} from './trackRecordData';

const T = {
  title: 'Ennustuste t\u00e4psus',
  help: 'Kui h\u00e4sti on T\u00f5en\u00e4osuse ennustused liigiti t\u00e4ppi l\u00e4inud. Ennustus loetakse t\u00e4itunuks, kui liiki n\u00e4hti Eestis ennustuse ajavahemikus. Samale liigile tehakse ennustus kaks korda p\u00e4evas ja ajavahemikud kattuvad, seep\u00e4rast n\u00e4itame eraldi ka mittekattuvate ajavahemike arvu (s\u00f5ltumatud ennustused).',
  sortBy: 'Sordi:',
  badge: 'v\u00e4ike valim',
  brier: 'Brieri skoor',
  legendPred: 'Ennustatud t\u00f5en\u00e4osus',
  legendObs: 'Tegelikult n\u00e4htud',
  tileHits: 's\u00f5ltumatut ennustust t\u00e4itus',
  tileMean: 'ennustatud keskmiselt',
  emptyBucket: 'Ennustusi selles vahemikus ei tehtud.',
  hitWord: 't\u00e4itus',
  independentWord: 's\u00f5ltumatut',
  independentPl: 's\u00f5ltumatuid',
  totalWord: 'kokku',
  speciesOne: 'liik',
  speciesMany: 'liiki',
  fewData: 'liiga v\u00e4he andmeid',
  empty: `Andmeid on veel liiga v\u00e4he. Liigi t\u00e4psust n\u00e4itame, kui sellel on v\u00e4hemalt ${TRACK_RECORD_MIN_N} s\u00f5ltumatut ennustust.`,
  error: 'Andmeid ei saanud laadida.',
} as const;

const SORTS: readonly { id: TrackRecordSort; label: string }[] = [
  { id: 'independent', label: 'S\u00f5ltumatuid ennustusi' },
  { id: 'total', label: 'Kokku ennustusi' },
  { id: 'brier', label: T.brier },
];

const DOT = ' \u00b7 ';

function footerText(rows: readonly TrackRecordRow[]): string {
  const since = earliestWindowStart(rows);
  return `N\u00e4idatud on liigid, millel on v\u00e4hemalt ${TRACK_RECORD_MIN_N} s\u00f5ltumatut ennustust.`
    + (since ? ` Andmed alates ${since}.` : '')
    + ' Brieri skoor: mida v\u00e4iksem, seda t\u00e4psem (0 = t\u00e4pne, 1 = t\u00e4iesti vale).';
}

function detailFooter(row: TrackRecordRow): string {
  return `Kokku ${row.n} ennustust, neist t\u00e4itus ${row.hits}. Tulbad on arvutatud k\u00f5igi ennustuste pealt; kattuvate ajavahemike t\u00f5ttu vaata hinnangu andmisel s\u00f5ltumatute arvu.`;
}

function summaryText(state: TrackRecordState): string | null {
  if (state.kind === 'error') return '';
  if (state.kind === 'loading') return null;
  const n = state.rows.length;
  if (n === 0) return T.fewData;
  return `${n} ${n === 1 ? T.speciesOne : T.speciesMany}`;
}

function SmallBadge() {
  return (
    <span className="ml-1.5 inline-block rounded-full bg-amber-100 px-2 align-middle text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      {T.badge}
    </span>
  );
}

function Bar({ pct, className }: { pct: number; className: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', className)} style={{ width: `${w}%` }} />
      </div>
      <span className="w-14 text-right text-xs tabular-nums">{formatDecimal(pct, 1)} %</span>
    </div>
  );
}

function BucketRow({ b }: { b: TrackRecordBucket }) {
  return (
    <div className="grid grid-cols-[4.25rem_1fr] items-center gap-x-2 gap-y-1 border-t border-border py-2">
      <div className="text-xs font-semibold tabular-nums">{`${b.lo}\u2013${b.hi} %`}</div>
      {b.n === 0 ? (
        <div className="text-xs italic text-muted-foreground">{T.emptyBucket}</div>
      ) : (
        <>
          <div className="space-y-1">
            <Bar pct={b.mean_predicted_pct ?? 0} className="bg-muted-foreground/40" />
            <Bar pct={b.observed_pct ?? 0} className="bg-primary" />
          </div>
          <div className="col-start-2 text-[11px] text-muted-foreground tabular-nums">
            {`n = ${b.n} (${b.hits} ${T.hitWord})${DOT}${T.independentPl} ${b.n_independent} (${b.hits_independent} ${T.hitWord})`}
          </div>
        </>
      )}
    </div>
  );
}

function SpeciesDetail({ row }: { row: TrackRecordRow }) {
  const tiles = [
    { v: `${row.hits_independent} / ${row.n_independent}`, k: T.tileHits },
    { v: `${formatDecimal(row.mean_predicted_pct, 1)} %`, k: T.tileMean },
    { v: formatDecimal(row.brier_independent, 2), k: T.brier },
  ];
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <h4 className="text-sm font-semibold">
        {row.species_et}
        {row.small_sample && <SmallBadge />}
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-xl font-semibold tabular-nums leading-tight">{t.v}</div>
            <div className="text-xs text-muted-foreground">{t.k}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-3 w-3 rounded-sm bg-muted-foreground/40" aria-hidden />
          {T.legendPred}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-3 w-3 rounded-sm bg-primary" aria-hidden />
          {T.legendObs}
        </span>
      </div>
      <div>
        {row.buckets.map((b) => <BucketRow key={b.lo} b={b} />)}
      </div>
      <p className="text-xs text-muted-foreground">{detailFooter(row)}</p>
    </div>
  );
}

export function PredictionTrackRecordView({ state, defaultOpen = false }: { state: TrackRecordState; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [sortKey, setSortKey] = useState<TrackRecordSort>('independent');
  const [selected, setSelected] = useState<string | null>(null);

  const rows = state.kind === 'ready' ? state.rows : [];
  const sorted = useMemo(() => sortTrackRecord(rows, sortKey), [rows, sortKey]);
  const current = sorted.find((r) => r.ebird_code === selected) ?? sorted[0] ?? null;
  const summary = summaryText(state);

  return (
    <Card className="p-4 space-y-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <h3 className="text-sm font-semibold">{T.title}</h3>
        <span className="inline-flex items-center gap-1 text-xs text-primary">
          {summary === null ? <Skeleton className="h-3 w-12" /> : summary}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </span>
      </button>

      {open && state.kind === 'loading' && (
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {open && state.kind === 'error' && (
        <p className="text-xs text-muted-foreground">{T.error}</p>
      )}

      {open && state.kind === 'ready' && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">{T.empty}</p>
      )}

      {open && state.kind === 'ready' && current && (
        <>
          <p className="text-xs text-muted-foreground">{T.help}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{T.sortBy}</span>
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={sortKey === s.id}
                onClick={() => setSortKey(s.id)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium',
                  sortKey === s.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <ul className="space-y-1.5">
            {sorted.map((r) => (
              <li key={r.ebird_code}>
                <button
                  type="button"
                  aria-pressed={r.ebird_code === current.ebird_code}
                  onClick={() => setSelected(r.ebird_code)}
                  className={cn(
                    'grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-lg border px-3 py-2 text-left',
                    r.ebird_code === current.ebird_code ? 'border-primary bg-secondary' : 'border-border bg-card',
                  )}
                >
                  <span className="min-w-0 text-sm font-semibold">
                    {r.species_et}
                    {r.small_sample && <SmallBadge />}
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums">{formatDecimal(r.brier_independent, 2)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {`${r.n_independent} ${T.independentWord} (${r.hits_independent} ${T.hitWord})${DOT}${r.n} ${T.totalWord}`}
                  </span>
                  <span className="text-right text-[11px] text-muted-foreground">{T.brier}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{footerText(rows)}</p>
          <SpeciesDetail row={current} />
        </>
      )}
    </Card>
  );
}

export function PredictionTrackRecord() {
  const state = usePredictionTrackRecord();
  return <PredictionTrackRecordView state={state} />;
}
