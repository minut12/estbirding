import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { deleteEvent, listAllEventsAdmin, publishEvent } from "@/services/events";
import type { EventRow } from "@/types/events";

interface AdminEventsScreenProps {
  onBack: () => void;
  onCreate: () => void;
  onEdit: (event: EventRow) => void;
}

export default function AdminEventsScreen({ onBack, onCreate, onEdit }: AdminEventsScreenProps) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listAllEventsAdmin();
      setEvents(data);
    } catch (error: any) {
      toast.error(error?.message || "Ürituste laadimine ebaõnnestus");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white"
            aria-label="Tagasi"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold">Halda üritusi</h2>
        </div>
        <button
          onClick={onCreate}
          className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-sm text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Lisa üritus
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Laen üritusi...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Üritusi pole.</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-2xl border border-border bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{event.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.start_at).toLocaleString("et-EE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {event.is_archived && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
                        Arhiveeritud
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        event.is_published ? "bg-[#DDEBE3] text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {event.is_published ? "Avalik" : "Peidetud"}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await publishEvent(event.id, !event.is_published);
                        await load();
                      } catch (error: any) {
                        toast.error(error?.message || "Uuendamine ebaõnnestus");
                      }
                    }}
                    className="h-9 rounded-xl border border-border px-3 text-sm"
                  >
                    {event.is_published ? "Peida" : "Avalik"}
                  </button>
                  <button
                    onClick={() => onEdit(event)}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-border px-3 text-sm"
                  >
                    <Pencil className="h-4 w-4" /> Muuda
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm("Kustuta üritus?")) return;
                      try {
                        await deleteEvent(event.id);
                        await load();
                      } catch (error: any) {
                        toast.error(error?.message || "Kustutamine ebaõnnestus");
                      }
                    }}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-destructive/40 px-3 text-sm text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Kustuta
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
