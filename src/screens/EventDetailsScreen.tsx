import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { formatEventDate, et } from "@/localization/et";
import type { EventItem } from "@/data/events";
import { getEventsAdminKey } from "@/features/events/adminKey";
import { adminArchiveEvent, adminDeleteEvent } from "@/features/events/eventsService";

interface EventDetailsScreenProps {
  event: EventItem;
  onBack: () => void;
}

export default function EventDetailsScreen({ event, onBack }: EventDetailsScreenProps) {
  const [isArchived, setIsArchived] = useState(Boolean(event.isArchived));
  const [isSaving, setIsSaving] = useState(false);
  const canAdmin = useMemo(() => {
    const key = getEventsAdminKey();
    return Boolean(key && key.trim().length > 0);
  }, []);

  const handleArchiveToggle = async () => {
    const nextArchived = !isArchived;
    const message = nextArchived
      ? "Arhiveerin ürituse? See eemaldatakse ürituste loendist."
      : "Taastan ürituse? See kuvatakse uuesti.";

    if (!window.confirm(message)) return;
    setIsSaving(true);
    try {
      const updated = await adminArchiveEvent(event.id, nextArchived);
      setIsArchived(updated.is_archived);
      toast.success(nextArchived ? "Üritus arhiveeritud" : "Üritus taastatud");
      if (nextArchived) onBack();
    } catch (error: any) {
      toast.error(error?.message || "Arhiveerimine ebaõnnestus");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Kustutan ürituse? Seda ei saa tagasi võtta.")) return;
    setIsSaving(true);
    try {
      await adminDeleteEvent(event.id);
      toast.success("Üritus kustutatud");
      onBack();
    } catch (error: any) {
      toast.error(error?.message || "Kustutamine ebaõnnestus");
    } finally {
      setIsSaving(false);
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
          src={event.imageUrl}
          alt={event.title}
          className="h-52 w-full rounded-2xl object-cover bg-muted"
        />
        <h1 className="mt-4 text-xl font-semibold text-foreground">{event.title}</h1>

        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            {formatEventDate(event.startAt)}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {event.locationName}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-[#DDEBE3] px-3 py-1 text-xs font-medium text-primary">
            {event.category}
          </span>
          {isArchived && (
            <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Arhiveeritud
            </span>
          )}
        </div>

        {canAdmin && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        )}

        <p className="mt-4 text-sm leading-relaxed text-foreground">
          {event.description ?? "Selle ürituse kohta kuvatakse peagi lisainfo."}
        </p>
      </div>
    </div>
  );
}
