import { ExternalLink } from 'lucide-react';
import { CountryFlag } from '@/components/icons/CountryFlag';
import { cn } from '@/lib/utils';

export type RareObservation = {
  id: string;
  species_et_name: string | null;
  species_lat_name: string | null;
  rarity_level: 'rare' | 'super' | 'mega' | null;
  country_code: string | null;
  region: string | null;
  location: string | null;
  obs_date: string;
  obs_count: number | null;
  observer_names: string[] | null;
  distance_to_ee_km: number | null;
  ebird_sub_id: string | null;
};

const RARITY_LABEL: Record<NonNullable<RareObservation['rarity_level']>, string> = {
  rare: 'Rari',
  super: 'Super rari',
  mega: 'Mega rari',
};

const STRIPE: Record<NonNullable<RareObservation['rarity_level']>, string> = {
  rare: 'border-l-amber-500',
  super: 'border-l-destructive',
  mega: 'border-l-red-800 bg-red-900/5',
};

const TAG: Record<NonNullable<RareObservation['rarity_level']>, string> = {
  rare: 'bg-amber-500 text-white',
  super: 'bg-red-600 text-white',
  mega: 'bg-red-800 text-white',
};

interface Props {
  observation: RareObservation;
}

export default function RareObservationCard({ observation: o }: Props) {
  const tier = o.rarity_level;
  const hasEt = !!o.species_et_name;
  const primaryName = hasEt ? o.species_et_name! : (o.species_lat_name || 'Tundmatu liik');
  const latin = hasEt ? o.species_lat_name : null;
  const countNum = o.obs_count ?? 1;
  const observers = Array.isArray(o.observer_names) ? o.observer_names.filter(Boolean) : [];
  const place = [o.location, o.region].filter(Boolean).join(', ');
  const km = typeof o.distance_to_ee_km === 'number' ? Math.round(o.distance_to_ee_km) : null;
  return (
    <li className={cn('grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-r-lg border-l-[3px] border-border py-2 pr-1', tier && STRIPE[tier])}>
      <div className="flex justify-center"><CountryFlag code={o.country_code} height={18} className="rounded-[3px]" /></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="font-semibold text-sm">{primaryName}</span>
          {latin && <span className="text-xs italic text-muted-foreground">{latin}</span>}
          {tier && <span className={cn('rounded-full px-1.5 py-px text-[10px] font-semibold', TAG[tier])}>{RARITY_LABEL[tier]}</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {place}{place && ' \u00b7 '}{countNum} {countNum === 1 ? 'isend' : 'isendit'}
          {km !== null && <> {'\u00b7'} <b className="text-foreground">{km} km</b></>}
        </div>
        {observers.length > 0 && <div className="text-[11px] text-muted-foreground truncate">{observers.join(', ')}</div>}
      </div>
      {o.ebird_sub_id ? (
        <a href={`https://ebird.org/checklist/${o.ebird_sub_id}`} target="_blank" rel="noopener noreferrer" className="p-2 text-primary" aria-label="Ava eBirdis">
          <ExternalLink className="w-4 h-4" />
        </a>
      ) : <span className="w-8" />}
    </li>
  );
}
