import { ArrowLeft, CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { formatEventCountdown, formatEventDate, et } from "@/localization/et";
import type { EventItem } from "@/data/events";

interface EventDetailsScreenProps {
  event: EventItem;
  onBack: () => void;
}

export default function EventDetailsScreen({ event, onBack }: EventDetailsScreenProps) {
  const countdown = formatEventCountdown(event.startAt);
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
          {event.endAt && (
            <p className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Lõpeb: {formatEventDate(event.endAt)}
            </p>
          )}
          <div>
            <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs text-foreground">{countdown}</span>
          </div>
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {event.locationName}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-[#DDEBE3] px-3 py-1 text-xs font-medium text-primary">
            {event.category}
          </span>
        </div>

        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground">
          {event.description?.trim() ? event.description : "Selle ürituse kohta kuvatakse peagi lisainfo."}
        </p>

        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Ava algallikas
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
