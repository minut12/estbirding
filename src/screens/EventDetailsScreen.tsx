import { useState } from "react";
import { ArrowLeft, CalendarDays, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { formatEventDate, et } from "@/localization/et";
import type { EventItem } from "@/data/events";
import { getEventsAdminKey } from "@/features/events/adminKey";
import {
  adminArchiveEvent,
  adminDeleteEvent,
  adminListEvents,
  adminUpdateEvent,
  type EventCategory,
} from "@/features/events/eventsService";

interface EventDetailsScreenProps {
  event: EventItem;
  onBack: () => void;
}

type EditForm = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  locationName: string;
  lat: string;
  lng: string;
  category: EventCategory;
  organizerName: string;
  url: string;
  imageUrl: string;
  isPublished: boolean;
};

export default function EventDetailsScreen({ event, onBack }: EventDetailsScreenProps) {
  const [eventState, setEventState] = useState<EventItem>(event);
  const [isArchived, setIsArchived] = useState(Boolean(event.isArchived));
  const [isSaving, setIsSaving] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    title: event.title,
    description: event.description ?? "",
    startAt: toLocalDatetime(event.startAt),
    endAt: event.endAt ? toLocalDatetime(event.endAt) : "",
    locationName: event.locationName,
    lat: String(event.lat ?? ""),
    lng: String(event.lng ?? ""),
    category: event.category,
    organizerName: event.organizerName ?? "",
    url: event.url ?? "",
    imageUrl: event.imageUrl,
    isPublished: Boolean(event.isPublished),
  });

  const canAdmin = Boolean(getEventsAdminKey()?.trim());

  const handleArchiveToggle = async () => {
    const nextArchived = !isArchived;
    const message = nextArchived
      ? "Arhiveerin ürituse? See eemaldatakse ürituste loendist."
      : "Taastan ürituse? See kuvatakse uuesti.";

    if (!window.confirm(message)) return;
    setIsSaving(true);
    try {
      const updated = await adminArchiveEvent(eventState.id, nextArchived);
      setIsArchived(updated.is_archived);
      toast.success(nextArchived ? "Üritus arhiveeritud" : "Üritus taastatud");
      if (nextArchived) onBack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Kustutan ürituse? Seda ei saa tagasi võtta.")) return;
    setIsSaving(true);
    try {
      await adminDeleteEvent(eventState.id);
      toast.success("Üritus kustutatud");
      onBack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editForm.title.trim()) {
      toast.error("Pealkiri on kohustuslik.");
      return;
    }
    if (!editForm.startAt) {
      toast.error("Algusaeg on kohustuslik.");
      return;
    }
    if ((editForm.lat && !editForm.lng) || (!editForm.lat && editForm.lng)) {
      toast.error("Lat ja lng peavad mõlemad olemas olema.");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await adminUpdateEvent(eventState.id, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        start_at: new Date(editForm.startAt).toISOString(),
        end_at: editForm.endAt ? new Date(editForm.endAt).toISOString() : null,
        location_name: editForm.locationName.trim() || null,
        lat: editForm.lat ? Number(editForm.lat) : null,
        lng: editForm.lng ? Number(editForm.lng) : null,
        category: editForm.category,
        organizer_name: editForm.organizerName.trim() || null,
        url: editForm.url.trim() || null,
        image_url: editForm.imageUrl.trim() || null,
        is_published: editForm.isPublished,
      });

      setEventState({
        ...eventState,
        title: updated.title,
        description: updated.description ?? undefined,
        startAt: updated.start_at,
        endAt: updated.end_at ?? undefined,
        locationName: updated.location_name ?? "Asukoht täpsustamisel",
        lat: updated.lat ?? eventState.lat,
        lng: updated.lng ?? eventState.lng,
        category: updated.category,
        organizerName: updated.organizer_name ?? undefined,
        url: updated.url ?? undefined,
        imageUrl: updated.image_url || eventState.imageUrl,
        isPublished: updated.is_published,
        isArchived: updated.is_archived,
      });

      setIsArchived(updated.is_archived);
      setIsEditOpen(false);
      toast.success("Salvestatud");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAdminApi = async () => {
    try {
      await adminListEvents();
      toast.success("OK");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
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
        <h2 className="text-sm font-semibold">{et.detailsTitle}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <img
          src={eventState.imageUrl}
          alt={eventState.title}
          className="h-52 w-full rounded-2xl object-cover bg-muted"
        />
        <h1 className="mt-4 text-xl font-semibold text-foreground">{eventState.title}</h1>

        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            {formatEventDate(eventState.startAt)}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {eventState.locationName}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-[#DDEBE3] px-3 py-1 text-xs font-medium text-primary">
            {eventState.category}
          </span>
          {isArchived && (
            <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Arhiveeritud
            </span>
          )}
        </div>

        {canAdmin && (
          <div className="mt-3 space-y-2">
            <button
              onClick={() => setIsEditOpen(true)}
              disabled={isSaving}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-border bg-white px-3 text-sm font-medium disabled:opacity-60"
            >
              Muuda
            </button>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                onClick={handleArchiveToggle}
                disabled={isSaving}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-white px-3 text-sm font-medium disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : isArchived ? "Taasta" : "Arhiveeri"}
              </button>
              <button
                onClick={handleDelete}
                disabled={isSaving}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-red-300 bg-red-50 px-3 text-sm font-medium text-red-700 disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kustuta"}
              </button>
            </div>
            <button
              onClick={handleTestAdminApi}
              className="text-xs text-primary underline underline-offset-2"
              disabled={isSaving}
            >
              Testi admin API
            </button>
          </div>
        )}

        <p className="mt-4 text-sm leading-relaxed text-foreground">
          {eventState.description ?? "Selle ürituse kohta kuvatakse peagi lisainfo."}
        </p>
      </div>

      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
          <div className="w-full rounded-t-2xl bg-white p-4 sm:max-w-xl sm:rounded-2xl">
            <h3 className="mb-3 text-base font-semibold">Muuda üritust</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input className={inputClass} placeholder="Pealkiri *" value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
              <input className={inputClass} type="datetime-local" value={editForm.startAt} onChange={(e) => setEditForm((p) => ({ ...p, startAt: e.target.value }))} />
              <input className={inputClass} type="datetime-local" value={editForm.endAt} onChange={(e) => setEditForm((p) => ({ ...p, endAt: e.target.value }))} />
              <input className={inputClass} placeholder="Asukoht" value={editForm.locationName} onChange={(e) => setEditForm((p) => ({ ...p, locationName: e.target.value }))} />
              <input className={inputClass} placeholder="Lat" value={editForm.lat} onChange={(e) => setEditForm((p) => ({ ...p, lat: e.target.value }))} />
              <input className={inputClass} placeholder="Lng" value={editForm.lng} onChange={(e) => setEditForm((p) => ({ ...p, lng: e.target.value }))} />
              <select className={inputClass} value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value as EventCategory }))}>
                <option value="EstBirding">EstBirding</option>
                <option value="Muud">Muud</option>
              </select>
              <input className={inputClass} placeholder="Korraldaja" value={editForm.organizerName} onChange={(e) => setEditForm((p) => ({ ...p, organizerName: e.target.value }))} />
              <input className={inputClass} placeholder="URL" value={editForm.url} onChange={(e) => setEditForm((p) => ({ ...p, url: e.target.value }))} />
              <input className={inputClass} placeholder="Pildi URL" value={editForm.imageUrl} onChange={(e) => setEditForm((p) => ({ ...p, imageUrl: e.target.value }))} />
              <input className={`${inputClass} sm:col-span-2`} placeholder="Kirjeldus" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
              <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={editForm.isPublished} onChange={(e) => setEditForm((p) => ({ ...p, isPublished: e.target.checked }))} />
                Avalik
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handleSaveEdit} disabled={isSaving} className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60">
                {isSaving ? "Salvestan..." : "Salvesta"}
              </button>
              <button onClick={() => setIsEditOpen(false)} disabled={isSaving} className="h-10 flex-1 rounded-xl border border-border bg-white text-sm font-medium">
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass = "h-10 rounded-xl border border-border bg-white px-3 text-sm";

function toLocalDatetime(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}
