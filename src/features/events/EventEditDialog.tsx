import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createManualEvent,
  updateManualEvent,
  type ManualEventInput,
  type ManualEventPatch,
  type ManualEventRow,
} from "./eventsService";

type FormState = {
  title: string;
  starts_at: string;
  ends_at: string;
  type: "estbirding" | "muud";
  location_name: string;
  lat: string;
  lon: string;
  url: string;
  description: string;
  image_url: string | null;
  image_path: string | null;
};

const emptyForm: FormState = {
  title: "",
  starts_at: "",
  ends_at: "",
  type: "estbirding",
  location_name: "",
  lat: "",
  lon: "",
  url: "",
  description: "",
  image_url: null,
  image_path: null,
};

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function eventToForm(event: ManualEventRow): FormState {
  return {
    title: event.title,
    starts_at: toLocalDatetime(event.starts_at),
    ends_at: event.ends_at ? toLocalDatetime(event.ends_at) : "",
    type: event.type,
    location_name: event.location_name || "",
    lat: event.lat == null ? "" : String(event.lat),
    lon: event.lon == null ? "" : String(event.lon),
    url: event.url || "",
    description: event.description || "",
    image_url: event.image_url || null,
    image_path: event.image_path || null,
  };
}

function validateForm(form: FormState): string | null {
  if (!form.title.trim()) return "Pealkiri on kohustuslik.";
  if (!form.starts_at) return "Algusaeg on kohustuslik.";
  const starts = new Date(form.starts_at).getTime();
  if (Number.isNaN(starts)) return "Algusaeg on vigane.";
  if (form.ends_at) {
    const ends = new Date(form.ends_at).getTime();
    if (Number.isNaN(ends)) return "Lõpuaeg on vigane.";
    if (ends < starts) return "Lõpuaeg peab olema suurem või võrdne algusajaga.";
  }
  if ((form.lat && !form.lon) || (!form.lat && form.lon)) return "Lat ja Lon peavad olema mõlemad täidetud.";
  if (form.lat && Number.isNaN(Number(form.lat))) return "Lat peab olema number.";
  if (form.lon && Number.isNaN(Number(form.lon))) return "Lon peab olema number.";
  return null;
}

function parseCoord(value: string, min: number, max: number): number | null {
  const trimmed = value?.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

function buildPayload(form: FormState): ManualEventInput {
  const lat = parseCoord(form.lat, -90, 90);
  const lon = parseCoord(form.lon, -180, 180);
  return {
    title: form.title.trim(),
    starts_at: new Date(form.starts_at).toISOString(),
    ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    type: form.type,
    location_name: form.location_name.trim() || null,
    lat,
    lon,
    url: form.url.trim() || null,
    description: form.description.trim() || null,
  };
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const fileDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("file read failed"));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = fileDataUrl;
  });

  const maxEdge = 640;
  const longestEdge = Math.max(image.width, image.height);
  const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1;
  const targetW = Math.max(1, Math.round(image.width * scale));
  const targetH = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas not available");
  ctx.drawImage(image, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", 0.7);
}

function toErrorMessage(err: unknown): string {
  const e = err as any;
  return String(e?.message ?? String(err));
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode, ManualEventRow = edit mode */
  initial: ManualEventRow | null;
  /** called after successful save so parent can refetch */
  onSaved: () => void;
};

export function EventEditDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageChanged, setImageChanged] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm(eventToForm(initial));
      setImagePreviewUrl(initial.image_url);
    } else {
      setForm(emptyForm);
      setImagePreviewUrl(null);
    }
    setImageChanged(false);
    setRemoveImage(false);
  }, [open, initial]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const submitForm = async () => {
    const error = validateForm(form);
    if (error) {
      toast.error(error);
      return;
    }

    try {
      const payload = buildPayload(form);
      if (removeImage) {
        payload.image_url = null;
        payload.image_path = null;
      }
      if (imageChanged && form.image_url && form.image_url.length > 300000) {
        toast.error("Pilt liiga suur — vähenda (või vali väiksem pilt).");
        return;
      }

      if (initial) {
        const patch: ManualEventPatch = { ...payload };
        if (imageChanged) {
          patch.image_url = form.image_url ?? null;
          patch.image_path = form.image_url ? (form.image_path ?? "inline-base64") : null;
        }
        await updateManualEvent(initial.id, patch);
      } else {
        await createManualEvent({
          ...payload,
          image_url: form.image_url ?? null,
          image_path: form.image_url ? (form.image_path ?? "inline-base64") : null,
        } as ManualEventInput);
      }

      toast.success("Üritus salvestatud");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Muuda üritust" : "Lisa üritus"}</DialogTitle>
          <DialogDescription>Täida väljad ja salvesta.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label>Pealkiri*</Label>
            <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <Label>Algusaeg*</Label>
            <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((p) => ({ ...p, starts_at: e.target.value }))} />
          </div>
          <div>
            <Label>Lõpuaeg</Label>
            <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))} />
          </div>
          <div>
            <Label>Tüüp</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as "estbirding" | "muud" }))}
            >
              <option value="estbirding">EstBirding</option>
              <option value="muud">Muud</option>
            </select>
          </div>
          <div>
            <Label>Asukoha nimi</Label>
            <Input value={form.location_name} onChange={(e) => setForm((p) => ({ ...p, location_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Laiuskraad</Label>
              <Input value={form.lat} onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))} />
            </div>
            <div>
              <Label>Pikkuskraad</Label>
              <Input value={form.lon} onChange={(e) => setForm((p) => ({ ...p, lon: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>URL</Label>
            <Input value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} />
          </div>
          <div>
            <Label>Kirjeldus</Label>
            <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eventImage">Pilt</Label>
            <Input
              id="eventImage"
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0] ?? null;
                setRemoveImage(false);
                if (file) {
                  try {
                    const preview = await fileToCompressedDataUrl(file);
                    if (preview.length > 300000) {
                      toast.error("Pilt liiga suur — vähenda (või vali väiksem pilt).");
                      return;
                    }
                    setImagePreviewUrl(preview);
                    setImageChanged(true);
                    setForm((p) => ({ ...p, image_url: preview, image_path: "inline-base64" }));
                  } catch (err) {
                    toast.error(`Pildi töötlemine ebaõnnestus: ${toErrorMessage(err)}`);
                  }
                }
              }}
            />
            {imagePreviewUrl ? (
              <div className="space-y-2">
                <img src={imagePreviewUrl} alt="Ürituse eelvaade" className="h-28 w-full rounded-md object-cover" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImagePreviewUrl(null);
                    setImageChanged(true);
                    setForm((p) => ({ ...p, image_url: null, image_path: null }));
                    setRemoveImage(true);
                  }}
                >
                  Eemalda pilt
                </Button>
              </div>
            ) : (
              <img
                src="https://images.unsplash.com/photo-1448375240586-882707db888b?w=360&h=280&fit=crop"
                alt="Kohatäide"
                className="h-28 w-full rounded-md object-cover"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Tühista</Button>
          <Button onClick={submitForm}>Salvesta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
