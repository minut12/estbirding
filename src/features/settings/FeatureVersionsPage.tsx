// src/features/settings/FeatureVersionsPage.tsx
// P109: Seaded > Versioonid - per-feature versions and changelog from src/lib/featureVersions.ts.
// Keep this file ASCII (Estonian letters as HTML entities in JSX, \u escapes in strings).
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  FEATURES,
  FEATURE_AREAS,
  currentVersion,
  lastChanged,
  versionHistory,
  type ChangeKind,
  type Feature,
  type FeatureArea,
} from '@/lib/featureVersions';

const GROUP_CLASS = 'rounded-[14px] border border-border bg-card overflow-hidden divide-y divide-border';
const COLLAPSED_COUNT = 5;

const MONTHS_SHORT: readonly string[] = [
  'jaan', 'veebr', 'm\u00e4rts', 'apr', 'mai', 'juuni', 'juuli', 'aug', 'sept', 'okt', 'nov', 'dets',
];

const KIND_LABEL: Record<ChangeKind, string> = {
  major: 'Suur muudatus',
  minor: 'Uus',
  patch: 'Parandus',
};

const KIND_CLASS: Record<ChangeKind, string> = {
  major: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  minor: 'bg-accent text-primary',
  patch: 'bg-muted text-muted-foreground',
};

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const thisYear = new Date().getFullYear();
  return `${d}. ${MONTHS_SHORT[m - 1] ?? ''}${y !== thisYear ? ` ${y}` : ''}`;
}

export function latestFeatureChangeDate(): string {
  return FEATURES.reduce((max, f) => {
    const d = lastChanged(f);
    return d > max ? d : max;
  }, '');
}

interface FeatureRowProps {
  feature: Feature;
  isOpen: boolean;
  onToggle: () => void;
}

function FeatureRow({ feature, isOpen, onToggle }: FeatureRowProps) {
  const [showAll, setShowAll] = useState(false);
  const history = useMemo(() => versionHistory(feature).slice().reverse(), [feature]);
  const visible = showAll ? history : history.slice(0, COLLAPSED_COUNT);
  const count = feature.changes.length;
  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className={`min-h-[58px] px-3.5 py-2.5 flex items-center gap-3 w-full text-left${isOpen ? ' bg-muted/40' : ''}`}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium">{feature.name}</div>
          <div className="text-[13px] text-muted-foreground">
            muudetud {formatShortDate(lastChanged(feature))} &middot; {count} {count === 1 ? 'muudatus' : 'muudatust'}
          </div>
        </div>
        <span className="font-mono text-xs font-semibold rounded-full bg-accent text-primary px-2 py-1 whitespace-nowrap">
          v{currentVersion(feature)}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform${isOpen ? ' rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <ul className="px-3.5 pt-1 pb-3 flex flex-col gap-2.5">
            {visible.map((c) => (
              <li key={`${c.version}-${c.ref}`} className="grid grid-cols-[64px_1fr] gap-x-2.5 gap-y-0.5 text-[13px]">
                <span className="font-mono text-xs font-semibold text-muted-foreground leading-5">{c.version}</span>
                <span>{c.text}</span>
                <span className="col-start-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <span className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${KIND_CLASS[c.kind]}`}>
                    {KIND_LABEL[c.kind]}
                  </span>
                  {formatShortDate(c.date)} &middot; {c.ref}
                </span>
              </li>
            ))}
          </ul>
          {history.length > COLLAPSED_COUNT && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full border-t border-border py-2.5 text-[13px] font-semibold text-primary"
            >
              N&auml;ita k&otilde;iki ({history.length})
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function FeatureVersionsPage() {
  const [area, setArea] = useState<FeatureArea>('kaart');
  const [openId, setOpenId] = useState<string | null>(null);
  const features = FEATURES.filter((f) => f.area === area);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rakenduse osad">
        {FEATURE_AREAS.map((a) => {
          const isActive = a.id === area;
          const n = FEATURES.filter((f) => f.area === a.id).length;
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => { setArea(a.id); setOpenId(null); }}
              className={`rounded-full border px-3 py-1 text-[13px] ${isActive ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-border text-foreground'}`}
            >
              {a.name} {n}
            </button>
          );
        })}
      </div>
      <div className={GROUP_CLASS}>
        {features.map((f) => (
          <FeatureRow
            key={f.id}
            feature={f}
            isOpen={openId === f.id}
            onToggle={() => setOpenId(openId === f.id ? null : f.id)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground ml-1">
        Suur muudatus &rarr; x.0.0 &middot; Uus &rarr; x.y.0 &middot; Parandus &rarr; x.y.z
      </p>
    </div>
  );
}
