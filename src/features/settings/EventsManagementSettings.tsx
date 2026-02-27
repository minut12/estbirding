import { useEffect, useMemo, useState } from "react";
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
  archiveManualEvent,
  createManualEvent,
  deleteManualEvent,
  listPublicEventsManual,
  testEventsAdminHealth,
  type ManualEventInput,
  type ManualEventPatch,
  type ManualEventRow,
  unarchiveManualEvent,
  updateManualEvent,
} from "@/features/events/eventsService";
import { clearEventsAdminKey, getEventsAdminKey, setEventsAdminKey } from "@/features/events/adminKey";

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

function buildPayload(form: FormState): ManualEventInput {
  return {
    title: form.title.trim(),
    starts_at: new Date(form.starts_at).toISOString(),
    ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    type: form.type,
    location_name: form.location_name.trim() || null,
    lat: form.lat ? Number(form.lat) : null,
    lon: form.lon ? Number(form.lon) : null,
    url: form.url.trim() || null,
    description: form.description.trim() || null,
  };
}

function maskKey(value: string): string {
  if (!value) return "(pole salvestatud)";
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

export default function EventsManagementSettings() {
  const [events, setEvents] = useState<ManualEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState(() => getEventsAdminKey() || "");
  const [savedAdminKey, setSavedAdminKey] = useState(() => getEventsAdminKey() || "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const canWrite = Boolean(savedAdminKey.trim());

  const visibleEvents = useMemo(() => {
    const now = Date.now();
    return events
      .filter((event) => showArchived || event.status !== "archived")
      .filter((event) => new Date(event.starts_at).getTime() >= now || event.status === "archived");
  }, [events, showArchived]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const rows = await listPublicEventsManual();
      setEvents(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (event: ManualEventRow) => {
    setEditingId(event.id);
    setForm(eventToForm(event));
    setDialogOpen(true);
  };

  const saveKey = () => {
    const next = adminKeyInput.trim();
    if (!next) {
      toast.error("Sisesta võti.");
      return;
    }
    setEventsAdminKey(next);
    setSavedAdminKey(next);
    setAdminKeyInput(next);
    toast.success("Events admin key salvestatud");
  };

  const clearKey = () => {
    clearEventsAdminKey();
    setSavedAdminKey("");
    setAdminKeyInput("");
    toast.success("Events admin key eemaldatud");
  };

  const testAdminEndpoint = async () => {
    try {
      const result = await testEventsAdminHealth(savedAdminKey.trim());
      if (result.ok) {
        toast.success("OK");
        return;
      }
      toast.error("Test events admin ebaõnnestus");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const submitForm = async () => {
    const error = validateForm(form);
    if (error) {
      toast.error(error);
      return;
    }

    try {
      if (editingId) {
        const patch: ManualEventPatch = buildPayload(form);
        await updateManualEvent(editingId, patch);
      } else {
        await createManualEvent(buildPayload(form));
      }
      toast.success("Üritus salvestatud");
      setDialogOpen(false);
      await loadEvents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onArchiveToggle = async (event: ManualEventRow) => {
    try {
      if (event.status === "archived") await unarchiveManualEvent(event.id);
      else await archiveManualEvent(event.id);
      await loadEvents();
      toast.success(event.status === "archived" ? "Üritus taastatud" : "Üritus arhiveeritud");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async (event: ManualEventRow) => {
    if (!window.confirm("Kustutan ürituse?")) return;
    try {
      await deleteManualEvent(event.id);
      await loadEvents();
      toast.success("Üritus kustutatud");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h3 className="font-semibold text-foreground">Ürituste haldus</h3>

      <div className="space-y-2">
        <Label htmlFor="eventsAdminKeyInput">Events admin key</Label>
        <Input
          id="eventsAdminKeyInput"
          type="password"
          placeholder="EVENTS_ADMIN_KEY"
          value={adminKeyInput}
          onChange={(e) => setAdminKeyInput(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Salvestatud võtme mask: {maskKey(savedAdminKey)}</p>
        <div className="flex gap-2">
          <Button onClick={saveKey} className="flex-1">Salvesta</Button>
          <Button variant="outline" onClick={clearKey} className="flex-1">Eemalda</Button>
        </div>
        <Button variant="outline" onClick={testAdminEndpoint} className="w-full">
          Test events admin
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <Button onClick={openCreate} disabled={!canWrite} className="w-full sm:w-auto">Lisa üritus</Button>
        <Button variant="outline" onClick={() => setShowArchived((v) => !v)} className="w-full sm:w-auto">
          {showArchived ? "Peida arhiveeritud" : "Kuva arhiveeritud"}
        </Button>
        <Button variant="ghost" onClick={loadEvents} disabled={loading} className="w-full sm:w-auto">Värskenda</Button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Laen üritusi...</p>
        ) : visibleEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Üritusi ei leitud.</p>
        ) : (
          visibleEvents.map((event) => (
            <div key={event.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{new Date(event.starts_at).toLocaleString("et-EE")}</p>
                </div>
                <div className="flex gap-1 text-xs">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5">{event.type}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{event.status}</span>
                </div>
              </div>
              {canWrite && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(event)}>Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => onArchiveToggle(event)}>
                    {event.status === "archived" ? "Unarchive" : "Archive"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(event)}>Delete</Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Muuda üritust" : "Lisa üritus"}</DialogTitle>
            <DialogDescription>Täida väljad ja salvesta.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Title*</Label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <Label>Start datetime*</Label>
              <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((p) => ({ ...p, starts_at: e.target.value }))} />
            </div>
            <div>
              <Label>End datetime</Label>
              <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))} />
            </div>
            <div>
              <Label>Type</Label>
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
              <Label>Location name</Label>
              <Input value={form.location_name} onChange={(e) => setForm((p) => ({ ...p, location_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Lat</Label>
                <Input value={form.lat} onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))} />
              </div>
              <div>
                <Label>Lon</Label>
                <Input value={form.lon} onChange={(e) => setForm((p) => ({ ...p, lon: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>URL</Label>
              <Input value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitForm} disabled={!canWrite}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
