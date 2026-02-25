import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { formatEventDate, et } from "@/localization/et";
import type { EventItem } from "@/data/events";

interface EventDetailsScreenProps {
  event: EventItem;
  onBack: () => void;
}

export default function EventDetailsScreen({ event, onBack }: EventDetailsScreenProps) {
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

        <span className="mt-4 inline-flex rounded-full bg-[#DDEBE3] px-3 py-1 text-xs font-medium text-primary">
          {event.category}
        </span>

        <p className="mt-4 text-sm leading-relaxed text-foreground">
          {event.description ?? "Selle ürituse kohta kuvatakse peagi lisainfo."}
        </p>
      </div>
    </div>
  );
}
