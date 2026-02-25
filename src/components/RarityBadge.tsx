import { cn } from '@/lib/utils';

type RarityLevel = 'none' | 'rare' | 'super' | 'mega';

export default function RarityBadge({ rarityLevel, className }: { rarityLevel?: RarityLevel; className?: string }) {
  const lvl = rarityLevel || 'none';
  if (lvl === 'none') return null;
  const text = lvl === 'rare' ? 'R' : lvl === 'super' ? 'SR' : 'MR';
  return (
    <span
      className={cn(
        'inline-flex min-w-6 h-5 items-center justify-center rounded-full border px-1.5 text-[10px] font-bold leading-none',
        lvl === 'rare' && 'border-amber-300 bg-amber-50 text-amber-900',
        lvl === 'super' && 'border-rose-300 bg-rose-50 text-rose-900',
        lvl === 'mega' && 'border-violet-300 bg-violet-50 text-violet-900',
        className,
      )}
      title="Haruldus"
    >
      {text}
    </span>
  );
}