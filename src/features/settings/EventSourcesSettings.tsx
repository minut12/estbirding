import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type EventSourceConfig, loadEventSources, resetEventSourcesToDefaults, saveEventSources } from "@/config/eventSources";
import { fetchEventsForSource } from "@/features/events/eventsService";
import { Check, Loader2, TestTube, X } from "lucide-react";
import { toast } from "sonner";

type TestState = {
  ok: boolean;
  status?: number;
  message: string;
};

export default function EventSourcesSettings() {
  const initial = useMemo(() => loadEventSources(), []);
  const [sources, setSources] = useState<EventSourceConfig[]>(initial);

  const onUpdate = (next: EventSourceConfig) => {
    setSources((prev) => {
      const updated = prev.map((source) => (source.id === next.id ? next : source));
      saveEventSources(updated);
      return updated;
    });
  };

  const onReset = () => {
    const defaults = resetEventSourcesToDefaults();
    setSources(defaults);
    toast.success("Vaikimisi allikad taastatud");
  };

  return (
    <div className="block space-y-4">
      <h3 className="font-semibold text-foreground">Ürituste allikad</h3>
      {sources.map((source) => (
        <EventSourceCard key={source.id} source={source} onUpdate={onUpdate} />
      ))}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Allikad: {sources.length}</p>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Taasta vaikimisi allikad
        </Button>
      </div>
    </div>
  );
}

function EventSourceCard({
  source,
  onUpdate,
}: {
  source: EventSourceConfig;
  onUpdate: (next: EventSourceConfig) => void;
}) {
  const [url, setUrl] = useState(source.url);
  const [enabled, setEnabled] = useState(source.enabled);
  const [testing, setTesting] = useState(false);
  const [testState, setTestState] = useState<TestState | null>(null);

  const saveChanges = () => {
    const normalizedUrl = url.trim();
    onUpdate({ ...source, url: normalizedUrl, enabled });
    toast.success(`${source.name} salvestatud`);
  };

  const testSource = async () => {
    setTesting(true);
    setTestState(null);
    const probe = { ...source, url: url.trim(), enabled };
    const result = await fetchEventsForSource(probe);
    setTestState({
      ok: result.ok,
      status: result.status,
      message: result.ok ? result.message : result.error || result.message,
    });
    setTesting(false);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium text-sm text-foreground">{source.name}</span>
          <Badge variant="outline" className="text-xs">
            {source.kind}
          </Badge>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">URL</Label>
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.estbirding.ee/uritused"
          className="h-9 text-sm"
        />
      </div>

      {testState && (
        <div className={`text-xs p-2 rounded-md ${testState.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
          {testState.ok ? (
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>{testState.status ? `HTTP ${testState.status}. ` : ""}{testState.message}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" />
              <span>{testState.status ? `HTTP ${testState.status}. ` : ""}{testState.message}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" size="sm" onClick={testSource} disabled={testing} className="gap-1.5 w-full sm:w-auto">
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
          Testi allikat
        </Button>
        <Button size="sm" onClick={saveChanges} className="w-full sm:w-auto">
          Salvesta
        </Button>
      </div>
    </div>
  );
}
