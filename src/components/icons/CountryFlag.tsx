// src/components/icons/CountryFlag.tsx
import { cn } from '@/lib/utils';

type FlagSpec = { w: number; h: number; body: string };

// Simplified national flags as inline SVG; emoji flags render as letters on Windows.
const FLAGS: Record<string, FlagSpec> = {
  EE: { w: 18, h: 12, body: '<rect width="18" height="4" fill="#0072CE"/><rect y="4" width="18" height="4" fill="#000"/><rect y="8" width="18" height="4" fill="#fff"/>' },
  FI: { w: 18, h: 11, body: '<rect width="18" height="11" fill="#fff"/><rect x="5" width="3" height="11" fill="#002F6C"/><rect y="4" width="18" height="3" fill="#002F6C"/>' },
  SE: { w: 16, h: 10, body: '<rect width="16" height="10" fill="#006AA7"/><rect x="5" width="2" height="10" fill="#FECC02"/><rect y="4" width="16" height="2" fill="#FECC02"/>' },
  NO: { w: 22, h: 16, body: '<rect width="22" height="16" fill="#BA0C2F"/><rect x="6" width="4" height="16" fill="#fff"/><rect y="6" width="22" height="4" fill="#fff"/><rect x="7" width="2" height="16" fill="#00205B"/><rect y="7" width="22" height="2" fill="#00205B"/>' },
  DK: { w: 37, h: 28, body: '<rect width="37" height="28" fill="#C8102E"/><rect x="12" width="4" height="28" fill="#fff"/><rect y="12" width="37" height="4" fill="#fff"/>' },
  LV: { w: 20, h: 10, body: '<rect width="20" height="10" fill="#9E3039"/><rect y="4" width="20" height="2" fill="#fff"/>' },
  LT: { w: 18, h: 12, body: '<rect width="18" height="4" fill="#FDB913"/><rect y="4" width="18" height="4" fill="#006A44"/><rect y="8" width="18" height="4" fill="#C1272D"/>' },
  PL: { w: 16, h: 10, body: '<rect width="16" height="5" fill="#fff"/><rect y="5" width="16" height="5" fill="#DC143C"/>' },
  DE: { w: 15, h: 9, body: '<rect width="15" height="3" fill="#000"/><rect y="3" width="15" height="3" fill="#DD0000"/><rect y="6" width="15" height="3" fill="#FFCE00"/>' },
  BE: { w: 15, h: 13, body: '<rect width="5" height="13" fill="#000"/><rect x="5" width="5" height="13" fill="#FDDA24"/><rect x="10" width="5" height="13" fill="#EF3340"/>' },
  BY: { w: 18, h: 9, body: '<rect width="18" height="6" fill="#C8313E"/><rect y="6" width="18" height="3" fill="#4AA657"/><rect width="2" height="9" fill="#fff"/>' },
  RU: { w: 18, h: 12, body: '<rect width="18" height="4" fill="#fff"/><rect y="4" width="18" height="4" fill="#0039A6"/><rect y="8" width="18" height="4" fill="#D52B1E"/>' },
};
FLAGS['RU-LEN'] = FLAGS.RU;
FLAGS['RU-PSK'] = FLAGS.RU;
FLAGS['RU-KGD'] = FLAGS.RU;

export type CountryCode = 'EE' | 'FI' | 'PL' | 'BE' | 'LV' | 'LT' | 'SE' | 'NO' | 'DK' | 'DE' | 'BY' | 'RU';

const SOURCE_COUNTRY: Record<string, CountryCode> = { eoy: 'EE', birding_estonia: 'EE', birdlife_suomi: 'FI', birdlife_poland: 'PL', birding_poland: 'PL', birding_belgium: 'BE', birding_latvia: 'LV', birding_lithuania: 'LT' };

const COUNTRY_CHIP_LABEL: Partial<Record<CountryCode, string>> = { FI: 'Soome', PL: 'Poola', BE: 'Belgia', LV: 'Läti', LT: 'Leedu' };

function normalizeSlug(slug: string | null | undefined): string {
  return String(slug ?? '').trim().toLowerCase();
}

export function sourceCountry(slug: string | null | undefined): CountryCode | null {
  const key = normalizeSlug(slug);
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(SOURCE_COUNTRY, key) ? SOURCE_COUNTRY[key] : null;
}

export function sourceChipLabel(slug: string | null | undefined, fallbackName: string): string {
  const key = normalizeSlug(slug);
  if (key === 'eoy') return 'EOÜ';
  if (key === 'birding_estonia') return 'Eesti';
  const code = sourceCountry(key);
  return (code && COUNTRY_CHIP_LABEL[code]) || fallbackName;
}

export function hasCountryFlag(code: string | null | undefined): boolean {
  return !!code && code in FLAGS;
}

export function CountryFlag({ code, className, height = 12 }: { code: string | null | undefined; className?: string; height?: number }) {
  if (!code) return null;
  const spec = FLAGS[code];
  if (!spec) return <span className={cn('text-[10px] font-semibold text-muted-foreground', className)}>{code}</span>;
  return (
    <svg
      viewBox={`0 0 ${spec.w} ${spec.h}`}
      className={cn('inline-block shrink-0 rounded-[2px] ring-1 ring-black/15 align-[-1px]', className)}
      style={{ height, width: Math.round((height * spec.w) / spec.h) }}
      aria-label={code}
      role="img"
      dangerouslySetInnerHTML={{ __html: spec.body }}
    />
  );
}
