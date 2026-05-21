interface Corridor {
  id?: string;
  name_et?: string;
  direction_text_et?: string;
  example_species_et?: string[];
  direction_deg?: number;
  avg_wind_speed_kmh?: number;
  strength?: string;
}

interface WeatherCorridors {
  fetched_at?: string;
  source?: string;
  location?: { lat?: number; lon?: number; name?: string };
  horizon?: string;
  error?: unknown;
  summary?: {
    avg_wind_speed_kmh?: number;
    avg_wind_dir_deg?: number;
    avg_pressure_hpa?: number;
    max_pressure_hpa?: number;
    is_high_pressure?: boolean;
  };
  active_corridors?: Corridor[];
}

const CORRIDOR_COLORS: Record<string, string> = {
  caspian_central_asia: '#f59e0b',
  black_sea_pannonian: '#eab308',
  north_atlantic: '#3b82f6',
};
const NEUTRAL = '#9ca3af';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface Props {
  weatherCorridors?: WeatherCorridors | null;
}

export default function CorridorBadge({ weatherCorridors }: Props) {
  if (!weatherCorridors || typeof weatherCorridors !== 'object') return null;
  if ((weatherCorridors as any).error) return null;
  if (!weatherCorridors.summary) return null;

  const summary = weatherCorridors.summary;
  const corridor = Array.isArray(weatherCorridors.active_corridors)
    ? weatherCorridors.active_corridors[0]
    : undefined;

  const color = corridor?.id ? CORRIDOR_COLORS[corridor.id] ?? NEUTRAL : NEUTRAL;
  const windDirDeg = Number(summary.avg_wind_dir_deg ?? 0);
  const windSpeed = Math.round(Number(summary.avg_wind_speed_kmh ?? 0));

  const speciesLine =
    corridor && Array.isArray(corridor.example_species_et) && corridor.example_species_et.length > 0
      ? `Tüüpilised liigid sellest piirkonnast: ${corridor.example_species_et.slice(0, 3).join(', ')}`
      : null;

  return (
    <div
      className="rounded-lg border p-3 flex items-center gap-3"
      style={{
        borderLeft: `4px solid ${color}`,
        backgroundColor: hexToRgba(color, 0.08),
      }}
    >
      <svg viewBox="0 0 100 100" width="80" height="80" className="shrink-0">
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
        <line x1="50" y1="4" x2="50" y2="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
        <line x1="96" y1="50" x2="90" y2="50" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
        <line x1="50" y1="96" x2="50" y2="90" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
        <line x1="4" y1="50" x2="10" y2="50" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
        <text x="50" y="14" textAnchor="middle" fontSize="7" fill="currentColor" opacity="0.5">N</text>
        <text x="92" y="53" textAnchor="end" fontSize="7" fill="currentColor" opacity="0.5">E</text>
        <text x="50" y="98" textAnchor="middle" fontSize="7" fill="currentColor" opacity="0.5">S</text>
        <text x="8" y="53" textAnchor="start" fontSize="7" fill="currentColor" opacity="0.5">W</text>
        <g transform={`rotate(${windDirDeg} 50 50)`}>
          <line x1="50" y1="10" x2="50" y2="48" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <polygon points="50,52 45,42 55,42" fill={color} />
        </g>
        <circle cx="50" cy="50" r="3" fill="currentColor" />
      </svg>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        {corridor ? (
          <p className="text-sm font-bold leading-tight">{corridor.name_et}</p>
        ) : (
          <p className="text-sm font-medium text-muted-foreground leading-tight">
            Ei ole aktiivset õhuvoolukoridori
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          850 hPa: {windSpeed} km/h · suund {Math.round(windDirDeg)}°
          {summary.is_high_pressure ? ' · kõrgrõhkkond Euroopa kohal' : ''}
        </p>
        {speciesLine && <p className="text-xs text-muted-foreground">{speciesLine}</p>}
      </div>
    </div>
  );
}
