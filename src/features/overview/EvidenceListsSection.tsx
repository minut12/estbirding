// P184d2: Ulevaade > Toenaosus -- the three evidence lists (Juba Eestis /
// Lahenemas / Hooaeg). Presentational: OverviewTab owns the segment and the
// Hooaeg-expanded state (so the P6 map jump can open the right list), the
// rating chips (renderRating) and the map navigation (onShowOnMap).
// Desktop (md+): three columns. Phone: a segmented control; all three lists stay
// in the DOM and CSS hides the unselected ones.

import type { ReactNode } from 'react';
import { AlertTriangle, Bird, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  CHANCE_STYLE,
  HOOAEG_TOP_N,
  TEXT,
  chanceChip,
  chancePeriodLine,
  countLine,
  distanceLine,
  earlierLine,
  currentTallinnMonth,
  fill,
  firstOccurrences,
  hkSentence,
  hooSinceLine,
  hooWindowLine,
  jubaLine,
  monthBars,
  monthChartLabel,
  staySentence,
  trackLine,
  type EvidenceLists,
  type EvidenceSegment,
  type HooaegItem,
  type JubaEestisItem,
  type LahenemasItem,
  type RarityLevel,
} from './evidenceLists';

interface AvatarSource {
  avatar_url: string | null;
  species_lat: string;
}

export interface EvidenceListsSectionProps {
  lists: EvidenceLists;
  segment: EvidenceSegment;
  onSegmentChange: (segment: EvidenceSegment) => void;
  hooaegExpanded: boolean;
  onHooaegExpandedChange: (expanded: boolean) => void;
  /** Species-level rating chips, or null when rating is not possible. */
  renderRating: (ebirdCode: string) => ReactNode;
  onShowOnMap: (speciesEt: string) => void;
  resolveAvatar: (item: AvatarSource) => string | undefined;
}

const SEGMENT_STYLE: Record<EvidenceSegment, { fg: string; bg: string }> = {
  juba: { fg: '#15803d', bg: '#e3f4ea' },
  lah: { fg: '#1d4ed8', bg: '#e4ebfb' },
  hoo: { fg: '#6d4fd8', bg: '#efeafd' },
};

const SEGMENT_ORDER: readonly EvidenceSegment[] = ['juba', 'lah', 'hoo'];

const SEGMENT_TITLE: Record<EvidenceSegment, string> = {
  juba: TEXT.juba_title,
  lah: TEXT.lah_title,
  hoo: TEXT.hoo_title,
};

const SEGMENT_INTRO: Record<EvidenceSegment, string> = {
  juba: TEXT.juba_intro,
  lah: TEXT.lah_intro,
  hoo: TEXT.hoo_intro,
};

function RarityPill({ level }: { level: RarityLevel }) {
  if (level === 'rare') {
    return <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500/90 border-transparent">{TEXT.rarity.rare}</Badge>;
  }
  if (level === 'super') {
    return (
      <Badge className="gap-1 bg-red-600 text-white hover:bg-red-600/90 border-transparent">
        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
        {TEXT.rarity.super}
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-red-800 text-white hover:bg-red-800/90 border-transparent font-bold shadow-sm">
      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
      {TEXT.rarity.mega}
    </Badge>
  );
}

function SpeciesHeader({ speciesEt, speciesLat, level, avatarUrl, chip }: {
  speciesEt: string;
  speciesLat: string;
  level: RarityLevel;
  avatarUrl: string | undefined;
  chip?: { text: string; fg: string; bg: string } | null;
}) {
  return (
    <div className="flex items-start gap-3">
      {avatarUrl ? (
        <img src={avatarUrl} alt={speciesEt} loading="lazy" className="w-14 h-14 rounded-md object-cover shrink-0 bg-muted" />
      ) : (
        <div className="w-14 h-14 rounded-md shrink-0 bg-muted flex items-center justify-center text-muted-foreground">
          <Bird className="w-7 h-7" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{speciesEt}</span>
          <span className="italic text-muted-foreground text-sm">({speciesLat})</span>
        </div>
        <RarityPill level={level} />
      </div>
      {chip && (
        <span
          className="self-start shrink-0 rounded-md px-2 py-0.5 text-[18px] leading-tight font-medium tabular-nums"
          style={{ color: chip.fg, backgroundColor: chip.bg }}
        >
          {chip.text}
        </span>
      )}
    </div>
  );
}

/** id + data-ebird only on the first occurrence of a code (P6 jump target). */
function jumpAttrs(code: string | null, isTarget: boolean): { id?: string; 'data-ebird'?: string } {
  return code && isTarget ? { id: `toenaosus-${code}`, 'data-ebird': code } : {};
}

function MonthChart({ yearsByMonth, currentMonth, accent }: {
  yearsByMonth: readonly number[];
  currentMonth: number;
  accent: string;
}) {
  const bars = monthBars(yearsByMonth, currentMonth);
  return (
    <figure className="space-y-1">
      <div role="img" aria-label={monthChartLabel(yearsByMonth)} className="flex items-end gap-0.5 h-[30px]">
        {bars.map((b, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn('flex-1 rounded-sm', !b.current && 'bg-muted-foreground/30')}
            style={{ height: `${b.heightPx}px`, ...(b.current ? { backgroundColor: accent } : {}) }}
          />
        ))}
      </div>
      <div className="flex gap-0.5" aria-hidden="true">
        {bars.map((b, i) => (
          <span
            key={i}
            className={cn('flex-1 text-center text-[10px] leading-none', b.current ? 'font-bold' : 'text-muted-foreground')}
            style={b.current ? { color: accent } : undefined}
          >
            {b.label}
          </span>
        ))}
      </div>
      <figcaption className="text-[11px] text-muted-foreground">{TEXT.hoo_chart}</figcaption>
    </figure>
  );
}

function JubaCard({ item, isTarget, avatarUrl, onShowOnMap }: {
  item: JubaEestisItem;
  isTarget: boolean;
  avatarUrl: string | undefined;
  onShowOnMap: (speciesEt: string) => void;
}) {
  const hk = hkSentence(item.hk);
  const chance = chanceChip(item.chance_pct);
  return (
    <Card {...jumpAttrs(item.ebird_code, isTarget)} className="p-4 space-y-2">
      <SpeciesHeader
        speciesEt={item.species_et}
        speciesLat={item.species_lat}
        level={item.rarity_level}
        avatarUrl={avatarUrl}
        chip={chance ? { text: chance, ...CHANCE_STYLE.juba } : null}
      />
      <p className="text-sm">{jubaLine(item)}</p>
      <p className="text-xs text-muted-foreground">{staySentence(item.stay)}</p>
      {chance && <p className="text-xs text-muted-foreground">{TEXT.chance_stay}</p>}
      {hk && <p className="text-xs text-muted-foreground">{hk}</p>}
      <button
        type="button"
        onClick={() => onShowOnMap(item.species_et)}
        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium hover:border-primary"
      >
        <MapPin className="w-3 h-3" aria-hidden="true" /> N&auml;ita kaardil
      </button>
    </Card>
  );
}

function LahenemasCard({ item, isTarget, avatarUrl, asOf, rating }: {
  item: LahenemasItem;
  isTarget: boolean;
  avatarUrl: string | undefined;
  asOf: string;
  rating: ReactNode;
}) {
  const count = countLine(item.events);
  const earlier = earlierLine(item.events);
  const chance = chanceChip(item.chance_pct);
  return (
    <Card {...jumpAttrs(item.ebird_code, isTarget)} className="p-4 space-y-2">
      <SpeciesHeader
        speciesEt={item.species_et}
        speciesLat={item.species_lat}
        level={item.rarity_level}
        avatarUrl={avatarUrl}
        chip={chance ? { text: chance, ...CHANCE_STYLE.lah } : null}
      />
      <p className="text-sm">{trackLine(item.events)}</p>
      <p className="text-xs text-muted-foreground">
        {distanceLine(item.events)}
        {count && <> &middot; {count}</>}
      </p>
      {earlier && <p className="text-xs text-muted-foreground">{earlier}</p>}
      {chance && (
        <>
          <p className="text-xs text-muted-foreground">{chancePeriodLine(asOf)}</p>
          <p className="text-xs text-muted-foreground">{TEXT.chance_basis}</p>
        </>
      )}
      {item.hooaeg_years !== null && (
        <span
          className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium"
          style={{ color: SEGMENT_STYLE.hoo.fg, backgroundColor: SEGMENT_STYLE.hoo.bg }}
        >
          {fill(TEXT.hoo_badge, { n: item.hooaeg_years })}
        </span>
      )}
      {rating}
    </Card>
  );
}

function HooaegCard({ item, isTarget, avatarUrl, currentMonth, asOf, rating }: {
  item: HooaegItem;
  isTarget: boolean;
  avatarUrl: string | undefined;
  currentMonth: number;
  asOf: string;
  rating: ReactNode;
}) {
  const chance = chanceChip(item.chance_pct);
  const windowLine = hooWindowLine(item, asOf);
  return (
    <Card {...jumpAttrs(item.ebird_code, isTarget)} className="p-4 space-y-2">
      <SpeciesHeader
        speciesEt={item.species_et}
        speciesLat={item.species_lat}
        level={item.rarity_level}
        avatarUrl={avatarUrl}
        chip={chance ? { text: chance, ...CHANCE_STYLE.hoo } : null}
      />
      {windowLine && <p className="text-sm">{windowLine}</p>}
      <p className="text-xs text-muted-foreground">{hooSinceLine(item)}</p>
      {chance && (
        <>
          <p className="text-xs text-muted-foreground">{chancePeriodLine(asOf)}</p>
          <p className="text-xs text-muted-foreground">{TEXT.chance_basis}</p>
        </>
      )}
      <MonthChart yearsByMonth={item.years_by_month} currentMonth={currentMonth} accent={SEGMENT_STYLE.hoo.fg} />
      {rating}
    </Card>
  );
}

function ColumnHeader({ segment, count }: { segment: EvidenceSegment; count: number }) {
  const st = SEGMENT_STYLE[segment];
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: st.fg }} />
        <h2 className="text-sm font-semibold">{SEGMENT_TITLE[segment]}</h2>
        <span className="rounded-full px-2 text-xs font-semibold tabular-nums" style={{ color: st.fg, backgroundColor: st.bg }}>
          {count}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{SEGMENT_INTRO[segment]}</p>
    </div>
  );
}

function EmptyList() {
  return <p className="text-sm text-muted-foreground text-center py-6">{TEXT.empty_list}</p>;
}

export function EvidenceListsSection({
  lists,
  segment,
  onSegmentChange,
  hooaegExpanded,
  onHooaegExpandedChange,
  renderRating,
  onShowOnMap,
  resolveAvatar,
}: EvidenceListsSectionProps) {
  const targets = firstOccurrences(lists);
  const isTarget = (code: string | null, seg: EvidenceSegment, index: number): boolean => {
    if (!code) return false;
    const t = targets.get(code);
    return t !== undefined && t.segment === seg && t.index === index;
  };
  const currentMonth = currentTallinnMonth();
  const counts: Record<EvidenceSegment, number> = {
    juba: lists.juba_eestis.length,
    lah: lists.lahenemas.length,
    hoo: lists.hooaeg.length,
  };
  const hooaegShown = hooaegExpanded ? lists.hooaeg : lists.hooaeg.slice(0, HOOAEG_TOP_N);
  const columnClass = (seg: EvidenceSegment) => cn('space-y-3 min-w-0', segment === seg ? 'block' : 'hidden md:block');

  return (
    <div className="space-y-3">
      <div role="tablist" className="md:hidden grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {SEGMENT_ORDER.map((seg) => {
          const on = segment === seg;
          return (
            <button
              key={seg}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSegmentChange(seg)}
              className={cn(
                'min-h-10 rounded-md px-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                on ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              style={on ? { color: SEGMENT_STYLE[seg].fg } : undefined}
            >
              {SEGMENT_TITLE[seg]} {counts[seg]}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <section className={columnClass('juba')}>
          <ColumnHeader segment="juba" count={counts.juba} />
          {lists.juba_eestis.length === 0 ? <EmptyList /> : lists.juba_eestis.map((item, i) => (
            <JubaCard
              key={`${item.species_lat}-${i}`}
              item={item}
              isTarget={isTarget(item.ebird_code, 'juba', i)}
              avatarUrl={resolveAvatar(item)}
              onShowOnMap={onShowOnMap}
            />
          ))}
        </section>

        <section className={columnClass('lah')}>
          <ColumnHeader segment="lah" count={counts.lah} />
          {lists.lahenemas.length === 0 ? <EmptyList /> : lists.lahenemas.map((item, i) => (
            <LahenemasCard
              key={`${item.ebird_code}-${i}`}
              item={item}
              isTarget={isTarget(item.ebird_code, 'lah', i)}
              avatarUrl={resolveAvatar(item)}
              asOf={lists.as_of}
              rating={renderRating(item.ebird_code)}
            />
          ))}
          <p className="text-[11px] text-muted-foreground">{TEXT.lah_rule}</p>
        </section>

        <section className={columnClass('hoo')}>
          <ColumnHeader segment="hoo" count={counts.hoo} />
          {lists.hooaeg.length === 0 ? <EmptyList /> : hooaegShown.map((item, i) => (
            <HooaegCard
              key={`${item.species_lat}-${i}`}
              item={item}
              isTarget={isTarget(item.ebird_code, 'hoo', i)}
              avatarUrl={resolveAvatar(item)}
              currentMonth={currentMonth}
              asOf={lists.as_of}
              rating={item.ebird_code ? renderRating(item.ebird_code) : null}
            />
          ))}
          {!hooaegExpanded && lists.hooaeg.length > HOOAEG_TOP_N && (
            <button
              type="button"
              onClick={() => onHooaegExpandedChange(true)}
              className="inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium hover:border-primary"
            >
              {fill(TEXT.show_all, { n: lists.hooaeg.length })}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
