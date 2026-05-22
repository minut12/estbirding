import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import RareObservationCard, { type RareObservation } from './RareObservationCard';
import RareObservationsFilters, { type RareFilters } from './RareObservationsFilters';

const PAGE_SIZE = 20;
const MAX_DISTANCE_NO_LIMIT = 1500;

const DEFAULT_FILTERS: RareFilters = {
  countries: [],
  rarities: [],
  maxDistanceKm: MAX_DISTANCE_NO_LIMIT,
  search: '',
  timeWindowDays: 30,
};

export default function RareObservationsFeed() {
  const [filters, setFilters] = useState<RareFilters>(DEFAULT_FILTERS);
  const [observations, setObservations] = useState<RareObservation[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (
      pageIndex: number,
      f: RareFilters,
    ): Promise<{ rows: RareObservation[]; totalCount: number }> => {
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from('ebird_rare_observations')
        .select(
          'id,species_et_name,species_lat_name,rarity_level,country_code,region,location,obs_date,obs_count,observer_names,distance_to_ee_km',
          { count: 'exact' },
        )
        .order('obs_date', { ascending: false })
        .range(from, to);

      if (f.countries.length > 0) {
        q = q.in('country_code', f.countries);
      }
      if (f.rarities.length > 0) {
        q = q.in('rarity_level', f.rarities);
      }
      if (f.maxDistanceKm < MAX_DISTANCE_NO_LIMIT) {
        q = q.lte('distance_to_ee_km', f.maxDistanceKm);
      }
      const term = f.search.trim().replace(/,/g, '');
      if (term) {
        const like = `%${term}%`;
        q = q.or(`species_et_name.ilike.${like},species_lat_name.ilike.${like}`);
      }
      if (f.timeWindowDays !== 'all') {
        const cutoff = new Date(Date.now() - f.timeWindowDays * 24 * 60 * 60 * 1000);
        q = q.gte('obs_date', cutoff.toISOString());
      }

      const { data, count, error: qErr } = await q;
      if (qErr) throw qErr;
      return {
        rows: (data ?? []) as RareObservation[],
        totalCount: count ?? 0,
      };
    },
    [],
  );

  // Reset + refetch whenever filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage(0, filters)
      .then(({ rows, totalCount: tc }) => {
        if (cancelled) return;
        setObservations(rows);
        setTotalCount(tc);
        setPage(0);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[RareObservationsFeed] fetch failed', err);
        setError('Vaatluste laadimine ebaõnnestus.');
        setObservations([]);
        setTotalCount(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, fetchPage]);

  const loadMore = async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const { rows } = await fetchPage(next, filters);
      setObservations((prev) => [...prev, ...rows]);
      setPage(next);
    } catch (err) {
      console.error('[RareObservationsFeed] loadMore failed', err);
      setError('Järgmise lehe laadimine ebaõnnestus.');
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = observations.length < (totalCount ?? 0);

  return (
    <section className="mt-8 pt-6 border-t border-border space-y-4 w-full max-w-full overflow-x-hidden">
      <header className="space-y-1">
        <h3 className="text-base font-semibold">Hiljutised vaatlused naabermaades</h3>
        <p className="text-sm text-muted-foreground">
          Arhiveeritud haruldaste liikide vaatlused LV, LT, BY, PL ja Kaliningradi piirkonnast.
          Andmed kogutakse eBirdi kaudu kaks korda päevas.
        </p>
      </header>

      <RareObservationsFilters filters={filters} onChange={setFilters} />

      {error && (
        <p className="text-sm text-destructive py-2">{error}</p>
      )}

      {loading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Laadin vaatlusi…
        </div>
      ) : observations.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Valitud filtritega vaatlusi ei leitud.
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Näitan {observations.length} vaatlust
            {typeof totalCount === 'number' ? ` ${totalCount}-st` : ''}
          </p>
          <ul className="space-y-3 w-full max-w-full">
            {observations.map((o) => (
              <RareObservationCard key={o.id} observation={o} />
            ))}
          </ul>
          {hasMore && (
            <Button
              variant="outline"
              className="w-full"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Laadin…' : 'Lae rohkem'}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
