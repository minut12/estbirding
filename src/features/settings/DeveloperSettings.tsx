import { useEffect, useMemo, useState } from "react";
import { Code, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SUPABASE_ANON_KEY_OVERRIDE_KEY,
  SUPABASE_URL_OVERRIDE_KEY,
  getFunctionsBaseUrl,
  getSupabaseUrl,
  validateSupabaseConfig,
} from "@/config/supabaseConfig";
import {
  adminCreateEvent,
  adminDeleteEvent,
  adminListEvents,
  adminPublishEvent,
  preflightSupabaseRestHealth,
  adminTestConnection,
  adminUpdateEvent,
  type EventCategory,
  type EventPayload,
  type EventRow,
} from "@/features/events/eventsService";
import {
  clearEventsAdminKey,
  getEventsAdminKey,
  setEventsAdminKey,
} from "@/features/events/adminKey";

const LS_KEY = "linn_admin_key";

type FormState = {
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  location_name: string;
  lat: string;
  lng: string;
  category: EventCategory;
  organizer_name: string;
  url: string;
  image_url: string;
  is_published: boolean;
};

const emptyForm: FormState = {
  title: "",
  description: "",
  start_at: "",
  end_at: "",
  location_name: "",
  lat: "",
  lng: "",
  category: "EstBirding",
  organizer_name: "",
  url: "",
  image_url: "",
  is_published: false,
};

export default function DeveloperSettings() {
  const [key, setKey] = useState(() => localStorage.getItem(LS_KEY) || "");
  const [eventsAdminKeyValue, setEventsAdminKeyValue] = useState(() => getEventsAdminKey() ?? "");
  const [savedEventsAdminKey, setSavedEventsAdminKey] = useState(() => getEventsAdminKey() ?? "");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [supabaseUrlOverride, setSupabaseUrlOverride] = useState(() => localStorage.getItem(SUPABASE_URL_OVERRIDE_KEY) || "");
  const [supabaseAnonOverride, setSupabaseAnonOverride] = useState(() => localStorage.getItem(SUPABASE_ANON_KEY_OVERRIDE_KEY) || "");
  const [supabaseConfigTick, setSupabaseConfigTick] = useState(0);

  const supabaseDiag = useMemo(() => {
    void supabaseConfigTick;
    return validateSupabaseConfig();
  }, [supabaseConfigTick]);

  const resolvedSupabaseUrl = useMemo(() => {
    void supabaseConfigTick;
    return getSupabaseUrl() || "(puudub)";
  }, [supabaseConfigTick]);

  const resolvedFunctionsBase = useMemo(() => {
    void supabaseConfigTick;
    return getFunctionsBaseUrl();
  }, [supabaseConfigTick]);

  const adminDisabled = !savedEventsAdminKey.trim() || !supabaseDiag.ok;

  const loadEvents = async () => {
    if (!supabaseDiag.ok) {
      toast.error(supabaseDiag.error || "Supabase config vigane");
      return;
    }
    setEventsLoading(true);
    try {
      const rows = await adminListEvents();
      setEvents(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    if (!savedEventsAdminKey.trim() || !supabaseDiag.ok) return;
    void loadEvents();
  }, [savedEventsAdminKey, supabaseDiag.ok]);

  const handleSave = () => {
    localStorage.setItem(LS_KEY, key);
    toast.success("Admin key salvestatud");
  };

  const handleClear = () => {
    localStorage.removeItem(LS_KEY);
    setKey("");
    toast.success("Admin key eemaldatud");
  };

  const startCreate = () => {
    if (!supabaseDiag.ok) {
      toast.error(supabaseDiag.error || "Supabase config vigane");
      return;
    }
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const startEdit = (event: EventRow) => {
    if (!supabaseDiag.ok) {
      toast.error(supabaseDiag.error || "Supabase config vigane");
      return;
    }
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description ?? "",
      start_at: toLocalDatetime(event.start_at),
      end_at: event.end_at ? toLocalDatetime(event.end_at) : "",
      location_name: event.location_name ?? "",
      lat: event.lat == null ? "" : String(event.lat),
      lng: event.lng == null ? "" : String(event.lng),
      category: event.category,
      organizer_name: event.organizer_name ?? "",
      url: event.url ?? "",
      image_url: event.image_url ?? "",
      is_published: event.is_published,
    });
    setFormOpen(true);
  };

  const validateError = useMemo(() => {
    if (!form.title.trim()) return "Pealkiri on kohustuslik.";
    if (!form.start_at) return "Algusaeg on kohustuslik.";
    if ((form.lat && !form.lng) || (!form.lat && form.lng)) return "Lat ja lng peavad mõlemad olemas olema.";
    return null;
  }, [form]);

  const submitForm = async () => {
    if (!supabaseDiag.ok) {
      toast.error(supabaseDiag.error || "Supabase config vigane");
      return;
    }
    if (validateError) {
      toast.error(validateError);
      return;
    }

    const payload: EventPayload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      start_at: new Date(form.start_at).toISOString(),
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      location_name: form.location_name.trim() || null,
      lat: form.lat ? Number(form.lat) : null,
      lng: form.lng ? Number(form.lng) : null,
      category: form.category,
      organizer_name: form.organizer_name.trim() || null,
      url: form.url.trim() || null,
      image_url: form.image_url.trim() || null,
      is_published: form.is_published,
    };

    try {
      if (editingId) {
        await adminUpdateEvent(editingId, payload);
      } else {
        await adminCreateEvent(payload);
      }
      toast.success("Üritus salvestatud");
      setFormOpen(false);
      await loadEvents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        <Code className="h-4 w-4 text-primary" />
        Arendaja
      </h3>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Supabase (test override)</h4>
        <Label htmlFor="supabaseUrlOverride">Supabase URL override</Label>
        <Input
          id="supabaseUrlOverride"
          type="text"
          placeholder="https://<project-ref>.supabase.co"
          value={supabaseUrlOverride}
          onChange={(e) => setSupabaseUrlOverride(e.target.value)}
        />
        <Label htmlFor="supabaseAnonOverride">Supabase anon key override</Label>
        <Input
          id="supabaseAnonOverride"
          type="password"
          placeholder="Optional"
          value={supabaseAnonOverride}
          onChange={(e) => setSupabaseAnonOverride(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const trimmedUrl = supabaseUrlOverride.trim();
              if (trimmedUrl) {
                localStorage.setItem(SUPABASE_URL_OVERRIDE_KEY, trimmedUrl);
              } else {
                localStorage.removeItem(SUPABASE_URL_OVERRIDE_KEY);
              }
              if (supabaseAnonOverride.trim()) {
                localStorage.setItem(SUPABASE_ANON_KEY_OVERRIDE_KEY, supabaseAnonOverride.trim());
              } else {
                localStorage.removeItem(SUPABASE_ANON_KEY_OVERRIDE_KEY);
              }
              setSupabaseConfigTick((v) => v + 1);
              toast.success("Supabase override salvestatud");
            }}
          >
            Salvesta
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              localStorage.removeItem(SUPABASE_URL_OVERRIDE_KEY);
              localStorage.removeItem(SUPABASE_ANON_KEY_OVERRIDE_KEY);
              setSupabaseUrlOverride("");
              setSupabaseAnonOverride("");
              setSupabaseConfigTick((v) => v + 1);
              toast.success("Supabase override tühjendatud");
            }}
          >
            Tühjenda
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!resolvedSupabaseUrl || resolvedSupabaseUrl === "(puudub)") {
                toast.error("Supabase URL puudub");
                return;
              }
              window.open(resolvedSupabaseUrl, "_blank");
            }}
          >
            Ava Supabase URL
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const result = await preflightSupabaseRestHealth();
                toast.success(`${result.message} (${result.url})`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : String(error));
              }
            }}
            disabled={!supabaseDiag.ok}
          >
            Testi REST health
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Kasuta ainult kui env on vale. Muudatus kehtib ainult selles seadmes.
        </p>
        <div className="space-y-0.5 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
          <p>Resolved Supabase URL: {resolvedSupabaseUrl}</p>
          <p>Functions base: {resolvedFunctionsBase}</p>
          {!supabaseDiag.ok && <p className="text-destructive">Hoiatus: {supabaseDiag.error}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="adminKey">Linnuliigid admin key</Label>
        <Input
          id="adminKey"
          type="password"
          placeholder="Valikuline - vajalik ainult Force refresh jaoks"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Seda võtit kasutatakse linnuliigid kaardi andmete jõuga värskendamiseks.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSave} className="gap-1.5" disabled={!key}>
          <Save className="h-3.5 w-3.5" />
          Salvesta
        </Button>
        <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5" disabled={!localStorage.getItem(LS_KEY)}>
          <Trash2 className="h-3.5 w-3.5" />
          Tühjenda
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <h4 className="font-semibold text-foreground">Üritused (Lisa/Halda)</h4>

        <div className="space-y-2">
          <Label htmlFor="eventsAdminKey">Events Admin Key</Label>
          <Input
            id="eventsAdminKey"
            type="password"
            value={eventsAdminKeyValue}
            onChange={(e) => setEventsAdminKeyValue(e.target.value)}
            placeholder="EVENTS_ADMIN_KEY"
          />
          <p className="text-xs text-muted-foreground">Võti salvestatakse ainult sinu brauserisse.</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEventsAdminKey(eventsAdminKeyValue.trim());
                setEventsAdminKeyValue(eventsAdminKeyValue.trim());
                setSavedEventsAdminKey(eventsAdminKeyValue.trim());
                toast.success("Salvestatud");
              }}
              disabled={!eventsAdminKeyValue.trim()}
            >
              Salvesta
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                clearEventsAdminKey();
                setEventsAdminKeyValue("");
                setSavedEventsAdminKey("");
                setEvents([]);
                toast.success("Tühjendatud");
              }}
            >
              Tühjenda
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!supabaseDiag.ok) {
                  toast.error(supabaseDiag.error || "Supabase config vigane");
                  return;
                }
                try {
                  await adminTestConnection();
                  toast.success("Ühendus OK");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : String(error));
                }
              }}
              disabled={adminDisabled}
            >
              Testi ühendust
            </Button>
          </div>
          <div className="space-y-0.5 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
            <p>Supabase URL: {resolvedSupabaseUrl}</p>
            <p>Functions URL: {`${resolvedFunctionsBase}/events-ingest`}</p>
          </div>
        </div>

        {!savedEventsAdminKey.trim() ? (
          <p className="text-sm text-muted-foreground">Lisa EVENTS_ADMIN_KEY, et luua ja hallata üritusi.</p>
        ) : !supabaseDiag.ok ? (
          <p className="text-sm text-destructive">{supabaseDiag.error}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Button onClick={startCreate} disabled={adminDisabled}>Lisa üritus</Button>
              <Button variant="outline" onClick={() => void loadEvents()} disabled={adminDisabled}>
                Värskenda
              </Button>
            </div>

            {eventsLoading ? (
              <p className="text-sm text-muted-foreground">Laen üritusi...</p>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Üritusi pole.</p>
            ) : (
              <div className="space-y-2">
                {events.map((event) => (
                  <div key={event.id} className="rounded-md border border-border p-3">
                    <div className="grid gap-1 text-sm">
                      <div className="font-medium">{event.title}</div>
                      <div className="text-muted-foreground">
                        {new Date(event.start_at).toLocaleString("et-EE")} | {event.location_name || "-"} | {event.category}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={event.is_published}
                          disabled={adminDisabled}
                          onChange={async (e) => {
                            try {
                              await adminPublishEvent(event.id, e.target.checked);
                              await loadEvents();
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : String(error));
                            }
                          }}
                        />
                        Avalik
                      </label>
                      <Button variant="outline" size="sm" onClick={() => startEdit(event)} disabled={adminDisabled}>
                        Muuda
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!window.confirm("Kustuta üritus?")) return;
                          try {
                            await adminDeleteEvent(event.id);
                            await loadEvents();
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : String(error));
                          }
                        }}
                        disabled={adminDisabled}
                      >
                        Kustuta
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {formOpen && (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <h5 className="font-medium">{editingId ? "Muuda üritust" : "Lisa üritus"}</h5>
                <AdminEventForm form={form} onChange={setForm} />
                <div className="flex gap-2">
                  <Button onClick={submitForm} disabled={adminDisabled}>Salvesta</Button>
                  <Button variant="outline" onClick={() => setFormOpen(false)}>
                    Tühista
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminEventForm({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (next: FormState) => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <Input placeholder="Pealkiri *" value={form.title} onChange={(e) => set("title", e.target.value)} />
      <Input
        type="datetime-local"
        placeholder="Algus *"
        value={form.start_at}
        onChange={(e) => set("start_at", e.target.value)}
      />
      <Input
        type="datetime-local"
        placeholder="Lõpp"
        value={form.end_at}
        onChange={(e) => set("end_at", e.target.value)}
      />
      <Input
        placeholder="Asukoht"
        value={form.location_name}
        onChange={(e) => set("location_name", e.target.value)}
      />
      <Input placeholder="Lat" value={form.lat} onChange={(e) => set("lat", e.target.value)} />
      <Input placeholder="Lng" value={form.lng} onChange={(e) => set("lng", e.target.value)} />
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={form.category}
        onChange={(e) => set("category", e.target.value as EventCategory)}
      >
        <option value="EstBirding">EstBirding</option>
        <option value="Muud">Muud</option>
      </select>
      <Input
        placeholder="Korraldaja"
        value={form.organizer_name}
        onChange={(e) => set("organizer_name", e.target.value)}
      />
      <Input placeholder="URL" value={form.url} onChange={(e) => set("url", e.target.value)} />
      <Input
        placeholder="Pildi URL"
        value={form.image_url}
        onChange={(e) => set("image_url", e.target.value)}
      />
      <Input
        className="md:col-span-2"
        placeholder="Kirjeldus"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
      />
      <label className="inline-flex items-center gap-2 text-sm md:col-span-2">
        <input
          type="checkbox"
          checked={form.is_published}
          onChange={(e) => set("is_published", e.target.checked)}
        />
        Avalik
      </label>
    </div>
  );
}

function toLocalDatetime(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}
