// src/features/overview/HkBackground.tsx
// P170d: "HK taust" box on Ulevaade Eesti species cards. Data: public.hk_species + public.hk_records
// (anon SELECT, P169/P170c). Renders nothing for species without HK data. Cached per taxon per session.
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  ET_MONTH_INESSIVE,
  filterSpeciesRecords,
  hkCreditText,
  isHkTaxon,
  pickYearStat,
  summarizeHkRecords,
  tallinnMonth,
  type HkRecordLite,
} from '@/lib/hk/hkSummary';

type HkStatus = 'current' | 'historical';

type HkSpeciesRow = {
  readonly taxon_sci: string;
  readonly hk_status: HkStatus | null;
  readonly hk_removed_from_year: number | null;
  readonly origin_text_et: string | null;
  readonly origin_report: { readonly report_no: number | null; readonly as_of: string | null } | null;
};

export type HkBackgroundData = {
  readonly sp: HkSpeciesRow | null;
  readonly recs: readonly HkRecordLite[];
};

// hk_* tables are not in the generated Database types; query them through an untyped client view.
const db = supabase as unknown as SupabaseClient;
const cache = new Map<string, Promise<HkBackgroundData | null>>();

function fetchHkBackground(sci: string): Promise<HkBackgroundData | null> {
  const k = sci.trim();
  if (!isHkTaxon(k)) return Promise.resolve(null);
  const hit = cache.get(k);
  if (hit) return hit;
  const p = Promise.all([
    db.from('hk_species')
      .select('taxon_sci,hk_status,hk_removed_from_year,origin_text_et,origin_report:hk_reports!origin_source_id(report_no,as_of)')
      .eq('taxon_sci', k)
      .maybeSingle(),
    db.from('hk_records')
      .select('taxon_sci,year,date_from')
      .eq('status', 'accepted')
      .like('taxon_sci', `${k}%`)
      .limit(2000),
  ]).then(([spRes, recRes]) => {
    if (spRes.error) throw spRes.error;
    if (recRes.error) throw recRes.error;
    // Untyped client infers the to-one embed as an array; PostgREST returns an object for it.
    const sp = (spRes.data as unknown as HkSpeciesRow | null) ?? null;
    const recs = filterSpeciesRecords((recRes.data as HkRecordLite[] | null) ?? [], k);
    if (!recs.length && !(sp && (sp.hk_status || sp.origin_text_et))) return null;
    return { sp, recs };
  });
  cache.set(k, p);
  p.catch(() => cache.delete(k));
  return p;
}

const LONG_TEXT = 220;

export function HkBackground({ sci }: { sci: string }) {
  const [data, setData] = useState<HkBackgroundData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    fetchHkBackground(sci)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { /* box is optional; stay hidden on error */ });
    return () => { alive = false; };
  }, [sci]);

  if (!data) return null;
  const { sp, recs } = data;
  const month = tallinnMonth(new Date());
  const s = summarizeHkRecords(recs, month);
  const yearStat = pickYearStat(s);
  const text = sp?.origin_text_et?.trim() || '';
  const isLong = text.length > LONG_TEXT;
  const canSubmit = sp?.hk_status === 'current' && !sp.hk_removed_from_year;

  return (
    <div className="mt-2 rounded-lg bg-emerald-50/70 p-3 space-y-2 dark:bg-emerald-950/30">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        HK taust
      </div>
      {s.total > 0 && (
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-base font-bold tabular-nums">{s.total}</div>
            <div className="text-xs text-muted-foreground">
              HK-kinnitatud {s.total === 1 ? 'leid' : 'leidu'} Eestis
            </div>
          </div>
          <div>
            <div className="text-base font-bold tabular-nums">{s.inMonth} / {s.total}</div>
            <div className="text-xs text-muted-foreground">leidu {ET_MONTH_INESSIVE[month - 1]}</div>
          </div>
          {yearStat && (
            <div>
              <div className="text-base font-bold tabular-nums">{yearStat.value}</div>
              <div className="text-xs text-muted-foreground">{yearStat.label}</div>
            </div>
          )}
        </div>
      )}
      {text && (
        <div className="space-y-1">
          <p className={isLong && !open ? 'text-sm leading-snug line-clamp-3' : 'text-sm leading-snug'}>{text}</p>
          {isLong && (
            <button type="button" onClick={() => setOpen((v) => !v)}
              className="text-xs font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300">
              {open ? <>N&auml;ita v&auml;hem</> : <>Loe edasi</>}
            </button>
          )}
          <div className="text-[11px] text-muted-foreground">
            {hkCreditText(sp?.origin_report?.report_no, sp?.origin_report?.as_of)}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {canSubmit && (
          <a href="https://www.eoy.ee/hk" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-300">
            Esita vaatlus HK-le <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
        <span className="text-[11px] text-muted-foreground">Arvud: Eesti linnuharulduste komisjon</span>
      </div>
    </div>
  );
}
