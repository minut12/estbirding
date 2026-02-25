import { useMemo, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";

interface MapPickerScreenProps {
  initialLat?: number | null;
  initialLng?: number | null;
  onBack: () => void;
  onConfirm: (coords: { lat: number; lng: number }) => void;
}

export default function MapPickerScreen({
  initialLat,
  initialLng,
  onBack,
  onConfirm,
}: MapPickerScreenProps) {
  const [coords, setCoords] = useState(() => ({
    lat: initialLat ?? 58.7,
    lng: initialLng ?? 25.0,
  }));

  const pinPosition = useMemo(() => {
    const x = ((coords.lng - 21.5) / (28.3 - 21.5)) * 100;
    const y = 100 - ((coords.lat - 57.2) / (59.8 - 57.2)) * 100;
    return {
      left: `${Math.max(8, Math.min(92, x))}%`,
      top: `${Math.max(8, Math.min(92, y))}%`,
    };
  }, [coords.lat, coords.lng]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <button
          onClick={onBack}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white"
          aria-label="Tagasi"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-sm font-semibold">Vali asukoht kaardilt</h2>
      </div>

      <div className="flex-1 p-4">
        <div
          className="relative h-80 rounded-2xl border border-border bg-[radial-gradient(circle_at_20%_20%,#f5faf5,transparent_45%),linear-gradient(165deg,#eef4ef_0%,#dce7de_100%)]"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            const lng = 21.5 + x * (28.3 - 21.5);
            const lat = 57.2 + (1 - y) * (59.8 - 57.2);
            setCoords({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
          }}
        >
          <span
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-2 shadow"
            style={pinPosition}
          >
            <MapPin className="h-5 w-5 text-primary" />
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm">
            Laiuskraad
            <input
              type="number"
              value={coords.lat}
              step="0.000001"
              onChange={(e) => setCoords((prev) => ({ ...prev, lat: Number(e.target.value) }))}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3"
            />
          </label>
          <label className="text-sm">
            Pikkuskraad
            <input
              type="number"
              value={coords.lng}
              step="0.000001"
              onChange={(e) => setCoords((prev) => ({ ...prev, lng: Number(e.target.value) }))}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3"
            />
          </label>
        </div>
      </div>

      <div className="border-t border-border bg-card p-4">
        <button
          onClick={() => onConfirm(coords)}
          className="h-11 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground"
        >
          Vali asukoht
        </button>
      </div>
    </div>
  );
}
