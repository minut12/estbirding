// BirdPlaceholder.tsx - P92e4: illustrated placeholder for events without a usable image.
// Six original flat bird silhouettes (64x64 viewBox, currentColor), tinted by event source.
// The bird is picked from the event id so the same event always shows the same bird.
import type { SVGProps } from "react";
import { cn } from "@/lib/utils";
import type { EventCategory } from "@/data/events";

type BirdShape = ReadonlyArray<SVGProps<SVGPathElement>>;

const STROKE: SVGProps<SVGPathElement> = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
};

const BIRDS: readonly BirdShape[] = [
  // owl
  [
    {
      fillRule: "evenodd",
      d: "M22 19 L24 12 L28.5 18 Q32 17 35.5 18 L40 12 L42 19 Q48 23 48 33 Q48.5 46 42 53 Q37 57.5 32 57.5 Q27 57.5 22 53 Q15.5 46 16 33 Q16 23 22 19 Z M27 24.5 a4.2 4.2 0 1 0 0.01 0 Z M37 24.5 a4.2 4.2 0 1 0 0.01 0 Z M30.4 33 L33.6 33 L32 37.5 Z",
    },
    { d: "M26 57 h4 v3 h-4z M34 57 h4 v3 h-4z" },
  ],
  // heron
  [
    { d: "M41 9 Q46 8 47 11 L58 13 L47 14 Q45 18 41 18 Q36 22 37 28 Q38 33 34 37 Q42 36 46 41 Q44 46 36 46 L30 46 Q22 44 18 37 Q16 34 20 33 Q26 36 30 34 Q33 31 32 26 Q30 18 34 12 Q37 9 41 9 Z" },
    { ...STROKE, strokeWidth: 2, d: "M30 45 L29 60 M34 45 L36 60" },
  ],
  // swallow
  [{ d: "M6 22 Q20 20 30 28 Q34 24 40 24 Q44 24 46 27 L52 26 L47 29 Q46 33 41 35 L58 52 L40 40 L38 54 L33 38 Q22 36 6 22 Z" }],
  // duck
  [
    { d: "M38 18 Q46 17 47 24 L54 26 L47 28 Q46 31 43 33 Q50 36 52 42 Q50 48 40 49 L18 49 Q10 47 9 40 Q12 42 16 40 Q20 34 30 34 Q36 34 39 33 Q34 30 34 25 Q34 19 38 18 Z" },
    { ...STROKE, strokeWidth: 2.2, d: "M6 54 Q12 51 18 54 T30 54 T42 54 T54 54" },
  ],
  // gull
  [{ d: "M4 30 Q14 22 24 26 Q28 28 30 33 Q32 31 34 31 Q36 31 38 33 Q40 28 44 26 Q54 22 60 30 Q52 28 46 31 Q41 34 38 38 L36 40 Q34 42 32 42 Q30 42 28 40 L26 38 Q22 34 18 31 Q12 28 4 30 Z" }],
  // small songbird on a branch
  [
    {
      fillRule: "evenodd",
      d: "M24 22 Q28 15 35 16 Q41 17 42 23 L48 24 L42 26 Q42 30 40 32 Q46 36 46 42 Q45 47 40 49 L16 56 L22 48 Q16 44 17 36 Q18 28 24 22 Z M36 20.4 a1.6 1.6 0 1 0 0.01 0 Z",
    },
    { ...STROKE, strokeWidth: 2.4, d: "M8 54 L56 50" },
    { ...STROKE, strokeWidth: 1.6, d: "M33 49 L32 53 M37 48 L37 52" },
  ],
];

const TINT_CLASS: Record<EventCategory, string> = {
  EstBirding: "bg-primary/10 text-primary",
  EOY: "bg-sky-500/10 text-sky-600",
  Muud: "bg-muted text-muted-foreground",
};

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function birdIndexFor(id: string): number {
  return hashId(id) % BIRDS.length;
}

interface BirdPlaceholderProps {
  id: string;
  category: EventCategory;
  className?: string;
  /** Fraction of the box the bird fills (default 0.66). */
  scale?: number;
}

export function BirdPlaceholder({ id, category, className, scale = 0.66 }: BirdPlaceholderProps) {
  const shape = BIRDS[birdIndexFor(id)];
  const size = `${Math.round(scale * 100)}%`;
  return (
    <div className={cn("flex shrink-0 items-center justify-center", TINT_CLASS[category], className)} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size} fill="currentColor">
        {shape.map((props, index) => (
          <path key={index} {...props} />
        ))}
      </svg>
    </div>
  );
}
