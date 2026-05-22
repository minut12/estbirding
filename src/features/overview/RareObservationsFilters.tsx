import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export type TimeWindow = 7 | 30 | 90 | 180 | 'all';

export interface RareFilters {
  countries: string[];
  rarities: Array<'rare' | 'super' | 'mega'>;
  maxDistanceKm: number;
  search: string;
  timeWindowDays: TimeWindow;
}

const TIME_WINDOWS: Array<{ value: TimeWindow; label: string }> = [
  { value: 7, label: '7 päeva' },
  { value: 30, label: '30 päeva' },
  { value: 90, label: '90 päeva' },
  { value: 180, label: '180 päeva' },
  { value: 'all', label: 'Kogu aeg' },
];

const COUNTRIES: Array<{ value: string; label: string }> = [
  { value: 'LV', label: 'LV' },
  { value: 'LT', label: 'LT' },
  { value: 'BY', label: 'BY' },
  { value: 'PL', label: 'PL' },
  { value: 'RU-KGD', label: 'RU-KGD' },
];

const RARITIES: Array<{ value: 'rare' | 'super' | 'mega'; label: string }> = [
  { value: 'rare', label: 'Rari' },
  { value: 'super', label: 'Super' },
  { value: 'mega', label: 'Mega' },
];

const MAX_DISTANCE_NO_LIMIT = 1500;

interface Props {
  filters: RareFilters;
  onChange: (next: RareFilters) => void;
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      className={cn('h-8 px-3 text-xs shrink-0', !active && 'bg-background')}
    >
      {children}
    </Button>
  );
}

export default function RareObservationsFilters({ filters, onChange }: Props) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [sliderVisible, setSliderVisible] = useState(filters.maxDistanceKm);

  // Debounce search → parent
  useEffect(() => {
    if (searchInput === filters.search) return;
    const id = window.setTimeout(() => {
      onChange({ ...filters, search: searchInput });
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Keep slider's visible value in sync if parent resets filters
  useEffect(() => {
    setSliderVisible(filters.maxDistanceKm);
  }, [filters.maxDistanceKm]);

  const toggleCountry = (cc: string) => {
    const has = filters.countries.includes(cc);
    onChange({
      ...filters,
      countries: has ? filters.countries.filter((c) => c !== cc) : [...filters.countries, cc],
    });
  };

  const toggleRarity = (r: 'rare' | 'super' | 'mega') => {
    const has = filters.rarities.includes(r);
    onChange({
      ...filters,
      rarities: has ? filters.rarities.filter((x) => x !== r) : [...filters.rarities, r],
    });
  };

  const setTimeWindow = (tw: TimeWindow) => {
    onChange({ ...filters, timeWindowDays: tw });
  };

  const distanceLabel =
    sliderVisible >= MAX_DISTANCE_NO_LIMIT
      ? 'Kogu Euroopa'
      : `≤ ${sliderVisible} km`;

  return (
    <div className="space-y-3 w-full max-w-full">
      <div className="flex flex-wrap gap-2 min-w-0">
        {TIME_WINDOWS.map((tw) => (
          <ChipButton
            key={String(tw.value)}
            active={filters.timeWindowDays === tw.value}
            onClick={() => setTimeWindow(tw.value)}
          >
            {tw.label}
          </ChipButton>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 min-w-0">
        {COUNTRIES.map((c) => (
          <ChipButton
            key={c.value}
            active={filters.countries.includes(c.value)}
            onClick={() => toggleCountry(c.value)}
          >
            {c.label}
          </ChipButton>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 min-w-0">
        {RARITIES.map((r) => (
          <ChipButton
            key={r.value}
            active={filters.rarities.includes(r.value)}
            onClick={() => toggleRarity(r.value)}
          >
            {r.label}
          </ChipButton>
        ))}
      </div>

      <div className="relative w-full max-w-full">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Otsi liigi nime järgi…"
          className="pl-9 w-full"
          inputMode="search"
        />
      </div>

      <div className="space-y-1.5 w-full max-w-full">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground min-w-0">
          <span className="shrink-0">Kaugus Eestist</span>
          <span className="shrink-0 font-medium text-foreground">{distanceLabel}</span>
        </div>
        <Slider
          value={[sliderVisible]}
          min={50}
          max={MAX_DISTANCE_NO_LIMIT}
          step={50}
          onValueChange={(v) => setSliderVisible(v[0] ?? MAX_DISTANCE_NO_LIMIT)}
          onValueCommit={(v) => onChange({ ...filters, maxDistanceKm: v[0] ?? MAX_DISTANCE_NO_LIMIT })}
          aria-label="Kaugus Eestist"
        />
      </div>
    </div>
  );
}
