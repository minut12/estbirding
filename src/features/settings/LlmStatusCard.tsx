import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchLlmStatus, providerState,
  type LlmProviderState, type LlmProviderStatus, type LlmStatus,
} from './llmStatus';

// Same string as SETTINGS_GROUP_CLASS in SettingsTab (kept local on purpose).
const GROUP_CLASS = 'rounded-[14px] border border-border bg-card overflow-hidden divide-y divide-border';
const TZ = 'Europe/Tallinn';
const DASH = '\u2013';
const DOT = ' \u00b7 ';
const BILLING_URL = 'https://console.anthropic.com/settings/billing';

const RED = 'bg-[#FBE9E7] text-[#9B2C1F]';
const AMBER = 'bg-[#FFF1D1] text-[#7A4F00]';

const STATE_PILL: Record<LlmProviderState, { label: string; className: string }> = {
  ok: { label: 'T\u00f6\u00f6tab', className: 'bg-[#E6F0E9] text-[#24603D]' },
  credit: { label: 'Krediit otsas', className: RED },
  rate_limit: { label: 'P\u00e4ringute piirang', className: AMBER },
  overload: { label: '\u00dclekoormus', className: AMBER },
  auth: { label: 'Kontrolli v\u00f5tit', className: RED },
  error: { label: 'Viga', className: RED },
  nodata: { label: 'Andmed puuduvad', className: 'bg-[#EEF2EF] text-[#5B6B62]' },
};

const DATE_TIME_FMT = new Intl.DateTimeFormat('et-EE', {
  timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const TIME_FMT = new Intl.DateTimeFormat('et-EE', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const DAY_KEY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

function formatDateTime(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  if (DAY_KEY_FMT.format(d) === DAY_KEY_FMT.format(new Date())) return `t\u00e4na ${TIME_FMT.format(d)}`;
  return DATE_TIME_FMT.format(d);
}

function fmt(n: number): string {
  return n.toLocaleString('et-EE');
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ready'; status: LlmStatus };

function StatePill({ state }: { state: LlmProviderState }) {
  const pill = STATE_PILL[state];
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${pill.className}`}>
      {pill.label}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums text-right">{value}</div>
    </>
  );
}

interface ProviderBlockProps {
  name: string;
  sub?: string;
  provider: LlmProviderStatus;
  creditOutSince: string | null;
}

function ProviderBlock({ name, sub, provider: p, creditOutSince }: ProviderBlockProps) {
  const lastError = p.lastErrorAt
    ? formatDateTime(p.lastErrorAt) + (p.lastErrorStatus !== null ? DOT + p.lastErrorStatus : '')
    : DASH;
  const hasTokens = p.tokensIn24h + p.tokensOut24h > 0;
  return (
    <div className="px-3.5 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{name}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
        <StatePill state={providerState(p, creditOutSince)} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
        <StatRow label="Viimati edukas" value={formatDateTime(p.lastOkAt)} />
        <StatRow label="Viimane viga" value={lastError} />
        <StatRow label="24 h" value={`${fmt(p.calls24h)} p\u00e4ringut${DOT}${fmt(p.errors24h)} viga`} />
        <StatRow label={'7 p\u00e4eva'} value={`${fmt(p.calls7d)} p\u00e4ringut${DOT}${fmt(p.errors7d)} viga`} />
        {hasTokens && (
          <StatRow
            label={'M\u00e4rgid 24 h'}
            value={`${fmt(p.tokensIn24h)} sisse${DOT}${fmt(p.tokensOut24h)} v\u00e4lja`}
          />
        )}
      </div>
    </div>
  );
}

function CreditBanner({ since, fallbacks }: { since: string; fallbacks: number }) {
  return (
    <div role="alert" className="flex gap-2.5 items-start px-3.5 py-3 bg-[#FBE9E7] text-[#B42318] border-b border-[#F1C9C5] text-[13.5px]">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <div className="font-semibold">{`Claude'i krediit on otsas alates ${formatDateTime(since)}.`}</div>
        {fallbacks > 0 && (
          <div>{`Gemini asendas Claude'i 24 tunni jooksul ${fallbacks.toLocaleString('et-EE')} korda.`}</div>
        )}
      </div>
    </div>
  );
}

function ReadyBody({ status }: { status: LlmStatus }) {
  const since = status.anthropicCreditOutSince;
  return (
    <>
      {since && <CreditBanner since={since} fallbacks={status.fallbacks24h} />}
      <ProviderBlock name="Claude" provider={status.providers.anthropic} creditOutSince={since} />
      <ProviderBlock name="Gemini" sub="tasuta tase" provider={status.providers.gemini} creditOutSince={since} />
      <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
        <span>Saldot API kaudu ei n&auml;e.</span>
        <a href={BILLING_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
          {"Ava Claude'i arveldus"}
        </a>
      </div>
    </>
  );
}

export function LlmStatusCard() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    setState({ kind: 'loading' });
    try {
      const result = await fetchLlmStatus();
      if (!mountedRef.current || id !== requestRef.current) return;
      setState(result.kind === 'forbidden' ? { kind: 'forbidden' } : { kind: 'ready', status: result.status });
    } catch {
      if (!mountedRef.current || id !== requestRef.current) return;
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const generatedAt = state.kind === 'ready' ? state.status.generatedAt : '';

  return (
    <div className={GROUP_CLASS}>
      <div className="px-3.5 py-2.5 flex items-center gap-3">
        <span className="text-[13px] text-muted-foreground">
          Keelemudelite olek
          {generatedAt && `${DOT}uuendatud ${formatDateTime(generatedAt)}`}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 w-8 p-0"
          onClick={() => { void load(); }}
          disabled={state.kind === 'loading'}
          aria-label={'V\u00e4rskenda'}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>
      {state.kind === 'loading' && (
        <div className="px-3.5 py-3 flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      {state.kind === 'forbidden' && (
        <div className="px-3.5 py-3 text-[13px] text-muted-foreground">Pole ligip&auml;&auml;su.</div>
      )}
      {state.kind === 'error' && (
        <div className="px-3.5 py-3 flex items-center justify-between gap-2">
          <span className="text-[13px] text-[#B42318]">Andmeid ei saanud laadida</span>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { void load(); }}>
            Proovi uuesti
          </Button>
        </div>
      )}
      {state.kind === 'ready' && <ReadyBody status={state.status} />}
    </div>
  );
}
