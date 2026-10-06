import { useEffect, useState } from "react";
import { Check, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { et } from "@/localization/et";
import { getProxiedImageUrl } from "@/features/news/newsImage";
import { resolveProxyBase } from "@/config/proxyEndpoint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  createManualEvent,
  EventFromUrlError,
  fetchEventFromUrl,
  updateManualEvent,
  type EventFromUrlResult,
  type EventFromUrlSourceHint,
  type ManualEventInput,
  type ManualEventPatch,
  type ManualEventRow,
  type ManualEventType,
} from "./eventsService";

const MAX_DESCRIPTION_CHARS = 2000;
const MAX_INLINE_IMAGE_CHARS = 300000;
const MAX_IMAGE_EDGE_PX = 640;
const PROGRESS_STEP_MS = 1200;
const t = et.eventLink;

type Step = "idle" | "loading" | "form";

type FormState = {
  title: string;
  starts_at: string;
  ends_at: string;
  location_name: string;
  type: ManualEventType;
  description: string;
  url: string;
  lat: number | null;
  lon: number | null;
  image_url: string | null;
  image_path: string | null;
};

const emptyForm: FormState = {
  title: "",
  starts_at: "",
  ends_at: "",
  location_name: "",
  type: "estbirding",
  description: "",
  url: "",
  lat: null,
  lon: null,
  image_url: null,
  image_path: null,
};

const SOURCE_CHIPS: ReadonlyArray<{ value: ManualEventType; label: string }> = [
  { value: "estbirding", label: et.chips.estbirding },
  { value: "eoy", label: et.chips.eoy },
  { value: "muud", label: t.sourceOther },
];

const PROGRESS_LINES: readonly string[] = [t.progressLoaded, t.progressParsed, t.progressLocating];

/** ISO (any offset) -> "YYYY-MM-DDTHH:mm" in the browser's local zone, as EventEditDialog did. */
function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sourceFromHint(hint: EventFromUrlSourceHint): ManualEventType {
  return hint === "muu" ? "muud" : hint;
}

function formFromRow(row: ManualEventRow): FormState {
  return {
    title: row.title,
    starts_at: toLocalDatetime(row.starts_at),
    ends_at: toLocalDatetime(row.ends_at),
    location_name: row.location_name || "",
    type: row.type,
    description: row.description || "",
    url: row.url || "",
    lat: row.lat,
    lon: row.lon,
    image_url: row.image_url,
    image_path: row.image_path,
  };
}

function formFromResult(result: EventFromUrlResult): FormState {
  const f = result.fields;
  return {
    title: f.title || "",
    starts_at: toLocalDatetime(f.starts_at),
    ends_at: toLocalDatetime(f.ends_at),
    location_name: f.location_name || "",
    type: sourceFromHint(result.source_hint),
    description: (f.description || "").slice(0, MAX_DESCRIPTION_CHARS),
    url: result.url,
    lat: f.lat,
    lon: f.lon,
    image_url: f.image_url,
    image_path: null,
  };
}

function validateForm(form: FormState): string | null {
  if (!form.title.trim()) return t.errTitleRequired;
  if (!form.starts_at) return t.errStartRequired;
  const starts = new Date(form.starts_at).getTime();
  if (Number.isNaN(starts)) return t.errStartInvalid;
  if (form.ends_at) {
    const ends = new Date(form.ends_at).getTime();
    if (Number.isNaN(ends)) return t.errEndInvalid;
    if (ends < starts) return t.errEndBeforeStart;
  }
  return null;
}

function buildPayload(form: FormState): ManualEventInput {
  const description = form.description.trim().slice(0, MAX_DESCRIPTION_CHARS);
  const hasCoords = form.lat != null && form.lon != null;
  return {
    title: form.title.trim(),
    starts_at: new Date(form.starts_at).toISOString(),
    ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    type: form.type,
    location_name: form.location_name.trim() || null,
    lat: hasCoords ? form.lat : null,
    lon: hasCoords ? form.lon : null,
    url: form.url.trim() || null,
    description: description || null,
  };
}

function imagePathFor(form: FormState): string | null {
  if (!form.image_url) return null;
  if (form.image_url.startsWith("data:")) return form.image_path ?? "inline-base64";
  return form.image_path;
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
  const longestEdge = Math.max(image.width, image.height);
  const scale = longestEdge > MAX_IMAGE_EDGE_PX ? MAX_IMAGE_EDGE_PX / longestEdge : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas not available");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function linkErrorMessage(err: unknown): string {
  if (err instanceof EventFromUrlError) {
    if (err.status === 403) return t.errForbidden;
    if (err.status === 502) return t.errFetchFailed;
  }
  return t.errGeneric;
}

type ProgressListProps = { stage: number };

function ProgressList({ stage }: ProgressListProps) {
  return (
    <ul className="space-y-2 py-2" aria-live="polite">
      {PROGRESS_LINES.map((line, index) => {
        const done = index < stage;
        const active = index === stage;
        return (
          <li
            key={line}
            className={cn("flex items-center gap-2 text-sm", done || active ? "text-foreground" : "text-muted-foreground")}
          >
            {done ? (
              <Check className="h-4 w-4 text-primary" />
            ) : active ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="inline-block h-4 w-4" />
            )}
            {line}
          </li>
        );
      })}
    </ul>
  );
}

type SourceChipsProps = { value: ManualEventType; onChange: (value: ManualEventType) => void };

function SourceChips({ value, onChange }: SourceChipsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.fieldSource}>
      {SOURCE_CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          role="radio"
          aria-checked={value === chip.value}
          onClick={() => onChange(chip.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition",
            value === chip.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-foreground",
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

type ImageFieldProps = {
  imageUrl: string | null;
  hint: string | null;
  onPick: (dataUrl: string) => void;
  onRemove: () => void;
};

function ImageField({ imageUrl, hint, onPick, onRemove }: ImageFieldProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [imageUrl]);
  const handleFile = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      if (dataUrl.length > MAX_INLINE_IMAGE_CHARS) {
        toast.error(t.imageTooLarge);
        return;
      }
      onPick(dataUrl);
    } catch (err) {
      toast.error(`${t.imageProcessFailed}: ${toErrorMessage(err)}`);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="eventLinkImage">{t.fieldImage}</Label>
      {imageUrl ? (
        <div className="space-y-2">
          {broken ? (
            <p className="text-xs text-muted-foreground">{t.imageAlt}</p>
          ) : (
            <img
              src={imageUrl.startsWith("data:") ? imageUrl : getProxiedImageUrl(imageUrl, resolveProxyBase())}
              alt={t.imageAlt}
              className="h-28 w-full rounded-md object-cover"
              onError={() => setBroken(true)}
            />
          )}
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            {t.removeImage}
          </Button>
        </div>
      ) : null}
      <Input
        id="eventLinkImage"
        type="file"
        accept="image/*"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type WarningFlags = { facebook: boolean; facebookMeta: boolean; facebookNoImage: boolean; geocode: boolean; llm: boolean };

function warningFlags(warnings: string[]): WarningFlags {
  return {
    facebook: warnings.includes("facebook_og_only"),
    facebookMeta: warnings.includes("facebook_og_meta"),
    facebookNoImage: warnings.includes("facebook_no_image"),
    geocode: warnings.includes("geocode_no_hit") || warnings.includes("geocode_failed"),
    llm: warnings.some((w) => w.startsWith("llm_")),
  };
}

type EventFormProps = {
  form: FormState;
  warnings: string[];
  setForm: (updater: (prev: FormState) => FormState) => void;
  onImagePick: (dataUrl: string) => void;
  onImageRemove: () => void;
};

function EventForm({ form, warnings, setForm, onImagePick, onImageRemove }: EventFormProps) {
  const flags = warningFlags(warnings);
  const hasCoords = form.lat != null && form.lon != null;
  return (
    <div className="grid grid-cols-1 gap-3">
      {flags.facebook ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.noteFacebook}</p>
      ) : null}
      {flags.facebookMeta && !flags.facebook ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.noteFacebookMeta}</p>
      ) : null}
      {flags.llm ? <p className="text-xs text-muted-foreground">{t.hintLlm}</p> : null}
      <div>
        <Label htmlFor="eventLinkTitle">{t.fieldTitle}</Label>
        <Input id="eventLinkTitle" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="eventLinkStart">{t.fieldStart}</Label>
          <Input id="eventLinkStart" type="datetime-local" value={form.starts_at} onChange={(e) => setForm((p) => ({ ...p, starts_at: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="eventLinkEnd">{t.fieldEnd}</Label>
          <Input id="eventLinkEnd" type="datetime-local" value={form.ends_at} onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))} />
        </div>
      </div>
      <div>
        <Label htmlFor="eventLinkLocation">{t.fieldLocation}</Label>
        <Input id="eventLinkLocation" value={form.location_name} onChange={(e) => setForm((p) => ({ ...p, location_name: e.target.value }))} />
        {hasCoords ? (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {form.lat?.toFixed(4)}, {form.lon?.toFixed(4)}
          </span>
        ) : null}
        {flags.geocode ? <p className="mt-1 text-xs text-muted-foreground">{t.hintGeocode}</p> : null}
      </div>
      <div className="space-y-1">
        <Label>{t.fieldSource}</Label>
        <SourceChips value={form.type} onChange={(type) => setForm((p) => ({ ...p, type }))} />
      </div>
      <ImageField
        imageUrl={form.image_url}
        hint={flags.facebookNoImage ? t.hintFacebookImage : null}
        onPick={onImagePick}
        onRemove={onImageRemove}
      />
      <div>
        <Label htmlFor="eventLinkDescription">{t.fieldDescription}</Label>
        <Textarea
          id="eventLinkDescription"
          rows={4}
          maxLength={MAX_DESCRIPTION_CHARS}
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value.slice(0, MAX_DESCRIPTION_CHARS) }))}
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {form.description.length}/{MAX_DESCRIPTION_CHARS}
        </p>
      </div>
    </div>
  );
}

type LinkStepProps = {
  url: string;
  onUrlChange: (url: string) => void;
  onRead: () => void;
  onManual: () => void;
};

function LinkStep({ url, onUrlChange, onRead, onManual }: LinkStepProps) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onRead();
      }}
    >
      <div>
        <Label htmlFor="eventLinkUrl">{t.urlLabel}</Label>
        <Input
          id="eventLinkUrl"
          type="url"
          inputMode="url"
          placeholder={t.urlPlaceholder}
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{t.readButton}</Button>
        <Button type="button" variant="ghost" onClick={onManual}>
          {t.manualButton}
        </Button>
      </div>
    </form>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** undefined/null = create mode (link step first); ManualEventRow = edit mode (opens on the form) */
  initial?: ManualEventRow | null;
  /** called after successful save so parent can refetch */
  onSaved: () => void;
};

export function EventLinkSheet({ open, onOpenChange, initial, onSaved }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [linkUrl, setLinkUrl] = useState("");
  const [stage, setStage] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [imageChanged, setImageChanged] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(initial ? "form" : "idle");
    setForm(initial ? formFromRow(initial) : emptyForm);
    setLinkUrl("");
    setWarnings([]);
    setImageChanged(false);
    setSaving(false);
  }, [open, initial]);

  useEffect(() => {
    if (step !== "loading") return;
    setStage(0);
    const timer = window.setInterval(() => {
      setStage((s) => Math.min(s + 1, PROGRESS_LINES.length - 1));
    }, PROGRESS_STEP_MS);
    return () => window.clearInterval(timer);
  }, [step]);

  const readLink = async () => {
    const url = linkUrl.trim();
    if (!url) {
      toast.error(t.errUrlRequired);
      return;
    }
    setStep("loading");
    try {
      const result = await fetchEventFromUrl(url);
      setForm(formFromResult(result));
      setWarnings(result.warnings);
      setImageChanged(Boolean(result.fields.image_url));
      setStep("form");
    } catch (err) {
      toast.error(linkErrorMessage(err));
      setStep("idle");
    }
  };

  const startManual = () => {
    setForm({ ...emptyForm, url: linkUrl.trim() });
    setWarnings([]);
    setStep("form");
  };

  const submit = async () => {
    const error = validateForm(form);
    if (error) {
      toast.error(error);
      return;
    }
    const payload = buildPayload(form);
    const image = { image_url: form.image_url, image_path: imagePathFor(form) };
    setSaving(true);
    try {
      if (initial) {
        const patch: ManualEventPatch = imageChanged ? { ...payload, ...image } : payload;
        await updateManualEvent(initial.id, patch);
      } else {
        await createManualEvent({ ...payload, ...image });
      }
      toast.success(t.saved);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{initial ? t.titleEdit : t.titleCreate}</SheetTitle>
          <SheetDescription>{t.description}</SheetDescription>
        </SheetHeader>

        <div className="py-4">
          {step === "idle" ? (
            <LinkStep url={linkUrl} onUrlChange={setLinkUrl} onRead={() => void readLink()} onManual={startManual} />
          ) : null}
          {step === "loading" ? <ProgressList stage={stage} /> : null}
          {step === "form" ? (
            <EventForm
              form={form}
              warnings={warnings}
              setForm={setForm}
              onImagePick={(dataUrl) => {
                setImageChanged(true);
                setForm((p) => ({ ...p, image_url: dataUrl, image_path: "inline-base64" }));
              }}
              onImageRemove={() => {
                setImageChanged(true);
                setForm((p) => ({ ...p, image_url: null, image_path: null }));
              }}
            />
          ) : null}
        </div>

        {step === "form" ? (
          <SheetFooter className="gap-2">
            {!initial ? (
              <Button type="button" variant="ghost" disabled={saving} onClick={() => setStep("idle")}>
                {t.back}
              </Button>
            ) : null}
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              {t.cancel}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submit()}>
              {saving ? t.saving : t.save}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
