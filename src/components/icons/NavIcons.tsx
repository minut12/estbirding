// src/components/icons/NavIcons.tsx
// P69 bottom-nav icons (Set 3 "Birds"). 24 grid, 1.9 stroke. `active` tints the duo shapes.
import type { ComponentType, ReactNode } from 'react';

export type NavIconProps = { active?: boolean; className?: string };
export type NavIcon = ComponentType<NavIconProps>;

const SOLID = { fill: 'currentColor', stroke: 'none' } as const;

function duo(active: boolean | undefined) {
  return { fill: 'currentColor', fillOpacity: active ? 0.2 : 0 } as const;
}

function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// Kaart: species pin + gull
export function KaartIcon({ active, className }: NavIconProps) {
  return (
    <Svg className={className}>
      <path {...duo(active)} d="M12 21.5c-4.3-4.4-6.5-7.8-6.5-10.8a6.5 6.5 0 0 1 13 0c0 3-2.2 6.4-6.5 10.8z" />
      <path {...SOLID} d="M7.25 12.05C8.91 8.52 9.86 8.41 12.00 10.61C14.14 8.41 15.09 8.52 16.75 12.05C14.85 10.42 13.90 10.52 12.00 12.23C10.10 10.52 9.15 10.42 7.25 12.05Z" />
    </Svg>
  );
}

// Ulevaade: owl
export function UlevaadeIcon({ active, className }: NavIconProps) {
  return (
    <Svg className={className}>
      <path {...duo(active)} d="M5 9.5V4l3.5 2.5h7L19 4v5.5c1.3 1.5 2 3.4 2 5.5 0 3.9-4 7-9 7s-9-3.1-9-7c0-2.1.7-4 2-5.5z" />
      <circle cx="8.8" cy="12.3" r="2.4" />
      <circle cx="15.2" cy="12.3" r="2.4" />
      <path d="M11.2 15.6 12 17l.8-1.4z" />
    </Svg>
  );
}

// Uudised: hatching egg
export function UudisedIcon({ active, className }: NavIconProps) {
  return (
    <Svg className={className}>
      <path {...duo(active)} d="M12 2.8c3.6 0 7 5.3 7 10.7 0 4.2-3.1 7.7-7 7.7s-7-3.5-7-7.7C5 8.1 8.4 2.8 12 2.8z" />
      <path d="M5.4 11.2l2.5 1.7 2-2.1 2.1 2.1 2.1-2.1 2 2.1 2.5-1.7" />
    </Svg>
  );
}

// Uritused: calendar + gull
export function UritusedIcon({ active, className }: NavIconProps) {
  return (
    <Svg className={className}>
      <rect {...duo(active)} x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path {...SOLID} d="M6.50 17.05C8.43 12.96 9.53 12.83 12.00 15.38C14.47 12.83 15.57 12.96 17.50 17.05C15.30 15.16 14.20 15.27 12.00 17.25C9.80 15.27 8.70 15.16 6.50 17.05Z" />
    </Svg>
  );
}

// Seaded: sliders with a bird perched on the top wire
export function SeadedIcon({ active, className }: NavIconProps) {
  return (
    <Svg className={className}>
      <path d="M3 10h18M4 17h2.5M11.5 17H20" />
      <circle {...duo(active)} cx="9" cy="17" r="2.5" />
      <g transform="translate(9.5 0.6) scale(0.42)">
        <path {...duo(active)} vectorEffect="non-scaling-stroke" d="M2.5 19.5 7 15.8c-.8-4.2 2-8.4 6.4-9.2 2.4-.4 4.2.5 5 2.2l2.9.9-2.7 1.5c0 5-3.5 8.3-8.4 8.3z" />
        <path vectorEffect="non-scaling-stroke" d="M10.5 19.5 10 22M14 19.2l.6 2.8" />
      </g>
    </Svg>
  );
}
