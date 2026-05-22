import { MapPin, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
};

const RARITY_LABEL: Record<NonNullable<RareObservation['rarity_level']>, string> = {
  rare: 'Rari',
  super: 'Super rari',
  mega: 'Mega rari',
};

const RARITY_CLASS: Record<NonNullable<RareObservation['rarity_level']>, string> = {
  rare: 'bg-amber-500 text-white hover:bg-amber-500/90 border-transparent',
  super: 'bg-red-600 text-white hover:bg-red-600/90 border-transparent',
  mega: 'bg-red-800 text-white hover:bg-red-800/90 border-transparent',
};

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return 'täna';
  if (days === 1) return 'eile';
  if (days < 7) return `${days} päeva tagasi`;
  if (days < 14) return '1 nädal tagasi';
  if (days < 31) return `${Math.floor(days / 7)} nädalat tagasi`;
  return 'üle kuu tagasi';
}

interface Props {
  observation: RareObservation;
}

export default function RareObservationCard({ observation: o }: Props) {
  const tier = o.rarity_level;
  const hasEt = !!o.species_et_name;
  const primaryName = hasEt ? o.species_et_name! : (o.species_lat_name || 'Tundmatu liik');
  const subtitleLatin = hasEt ? o.species_lat_name : null;
  const countNum = o.obs_count ?? 1;
  const observers = Array.isArray(o.observer_names) ? o.observer_names.filter(Boolean) : [];
  const observerLine = observers.length > 0 ? observers.join(', ') : null;

  const locationParts = [o.location, o.region, o.country_code].filter(Boolean);
  const locationLine = locationParts.join(', ');

  return (
    <li className="rounded-lg border border-border bg-card p-3 space-y-2 overflow-hidden w-full max-w-full">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          {tier && (
            <Badge className={cn('shrink-0', RARITY_CLASS[tier])}>
              {RARITY_LABEL[tier]}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
          {formatRelativeDate(o.obs_date)}
        </span>
      </div>

      <div className="min-w-0">
        <p className={cn('font-semibold break-words', hasEt ? '' : 'italic')}>
          {primaryName}
        </p>
        {subtitleLatin && (
          <p className="text-sm italic text-muted-foreground break-words">
            {subtitleLatin}
          </p>
        )}
      </div>

      {locationLine && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5 min-w-0">
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            {locationLine}
            {typeof o.distance_to_ee_km === 'number' && (
              <> · {o.distance_to_ee_km} km Eestist</>
            )}
          </span>
        </p>
      )}

      {(observerLine || countNum > 0) && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5 min-w-0">
          <User className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            {observerLine && <>{observerLine}</>}
            {observerLine && countNum > 0 && <> · </>}
            {countNum > 0 && (
              <>{countNum} {countNum === 1 ? 'isend' : 'isendit'}</>
            )}
          </span>
        </p>
      )}
    </li>
  );
}
