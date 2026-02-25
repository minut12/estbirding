import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { toast } from "sonner";
import { createEvent, updateEvent } from "@/services/events";
import type { EventCategory, EventRow } from "@/types/events";

interface CreateEventScreenProps {
  initialEvent?: EventRow | null;
  onBack: () => void;
  onSaved: () => void;
  onOpenMapPicker: (coords: { lat: number | null; lng: number | null }) => void;
  pickedCoords?: { lat: number; lng: number } | null;
}

export default function CreateEventScreen({
  initialEvent,
  onBack,
  onSaved,
  onOpenMapPicker,
  pickedCoords,
}: CreateEventScreenProps) {
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");
  const [startAt, setStartAt] = useState(
    initialEvent?.start_at ? toLocalDatetime(initialEvent.start_at) : ""
  );
  const [endAt, setEndAt] = useState(initialEvent?.end_at ? toLocalDatetime(initialEvent.end_at) : "");
  const [locationName, setLocationName] = useState(initialEvent?.location_name ?? "");
  const [category, setCategory] = useState<EventCategory>(initialEvent?.category ?? "EstBirding");
  const [url, setUrl] = useState(initialEvent?.url ?? "");
  const [imageUrl, setImageUrl] = useState(initialEvent?.image_url ?? "");
  const [lat, setLat] = useState<number | null>(initialEvent?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initialEvent?.lng ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pickedCoords) return;
    setLat(pickedCoords.lat);
    setLng(pickedCoords.lng);
  }, [pickedCoords]);

  const save = async () => {
    if (!title.trim()) {
      toast.error("Pealkiri on kohustuslik");
      return;
    }
    if (!startAt) {
      toast.error("Algusaeg on kohustuslik");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        start_at: new Date(startAt).toISOString(),
        end_at: endAt ? new Date(endAt).toISOString() : null,
        location_name: locationName.trim() || null,
        category,
        url: url.trim() || null,
        image_url: imageUrl.trim() || null,
        lat,
        lng,
      };

      if (initialEvent) {
        await updateEvent(initialEvent.id, payload);
      } else {
        await createEvent(payload);
      }
      toast.success("Üritus salvestatud");
      onSaved();
    } catch (error: any) {
      toast.error(error?.message || "Salvestamine ebaõnnestus");
    } finally {
      setSaving(false);
    }
  };

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
        <h2 className="text-sm font-semibold">Lisa üritus</h2>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <Field label="Pealkiri *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Kirjeldus">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} min-h-20 py-2`}
          />
        </Field>
        <Field label="Algus *">
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Lõpp">
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Asukoht">
          <input
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Kategooria">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as EventCategory)}
            className={inputClass}
          >
            <option value="EstBirding">EstBirding</option>
            <option value="Muud">Muud</option>
          </select>
        </Field>
        <Field label="URL">
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Pildi URL">
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lat">
            <input
              type="number"
              step="0.000001"
              value={lat ?? ""}
              onChange={(e) => setLat(e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            />
          </Field>
          <Field label="Lng">
            <input
              type="number"
              step="0.000001"
              value={lng ?? ""}
              onChange={(e) => setLng(e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            />
          </Field>
        </div>
        <button
          onClick={() => onOpenMapPicker({ lat, lng })}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm"
        >
          <MapPin className="h-4 w-4" />
          Kasuta kaarti
        </button>
      </div>
      <div className="border-t border-border bg-card p-4">
        <button
          onClick={save}
          disabled={saving}
          className="h-11 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Salvestan..." : "Salvesta"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "h-10 w-full rounded-xl border border-border bg-white px-3";

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}
