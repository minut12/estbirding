import { useCallback, useEffect, useMemo, useState } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { fetchSpeciesList } from '@/lib/avatar-storage';
import { LINNULIIGID_SCOPE, RARILIIN_SCOPE, SPECIES_SCOPES, type SpeciesScopeId } from '@/lib/mapScope';
import { loadSpeciesPredictionSettings, saveSpeciesPredictionSettings } from '@/lib/speciesPredictionSettings';
import { normalizeSpeciesPredictionSettings, type SpeciesPredictionSettings as SpeciesPredictionSettingsModel } from '@/lib/speciesPrediction';
import { normalizeUiText } from '@/lib/textNormalize';
import { useAuth } from '@/features/auth/AuthContext';
import { PERMISSIONS } from '@/features/auth/permissions';

type NumericFieldProps = {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
};

export default function SpeciesPredictionSettings() {
  const { user, isAdmin, hasPermission } = useAuth();
  const canManage = isAdmin || hasPermission(PERMISSIONS.settingsManage);
  const [scopeId, setScopeId] = useState<SpeciesScopeId>('linnuliigid');
  const [speciesList, setSpeciesList] = useState<string[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SpeciesPredictionSettingsModel>(() => normalizeSpeciesPredictionSettings(null, '', 'linnuliigid'));

  const scope = SPECIES_SCOPES[scopeId];

  useEffect(() => {
    fetchSpeciesList(scope).then((list) => {
      const normalized = list.map(normalizeUiText).filter(Boolean);
      setSpeciesList(normalized);
      if (!selectedSpecies && normalized[0]) setSelectedSpecies(normalized[0]);
    });
  }, [scope, selectedSpecies]);

  const loadSpeciesSettings = useCallback(async (speciesName: string) => {
    if (!speciesName) return;
    setLoading(true);
    try {
      const loaded = await loadSpeciesPredictionSettings(scopeId, speciesName);
      setForm(loaded);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Prediction settings load failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [scopeId]);

  useEffect(() => {
    if (!selectedSpecies) return;
    void loadSpeciesSettings(selectedSpecies);
  }, [selectedSpecies, loadSpeciesSettings]);

  const filtered = useMemo(() => (
    search
      ? speciesList.filter((species) => species.toLowerCase().includes(search.toLowerCase()))
      : speciesList
  ), [search, speciesList]);

  const patchForm = useCallback((patch: Partial<SpeciesPredictionSettingsModel>) => {
    setForm((prev) => normalizeSpeciesPredictionSettings({ ...prev, ...patch }, selectedSpecies || prev.speciesName, scopeId));
  }, [scopeId, selectedSpecies]);

  const saveForm = async () => {
    if (!selectedSpecies) return;
    if (!canManage) {
      toast.error('Only admins can save prediction defaults.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSpeciesPredictionSettings(
        scopeId,
        normalizeSpeciesPredictionSettings(form, selectedSpecies, scopeId),
        user?.id,
      );
      setForm(saved);
      toast.success('Species prediction defaults saved');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Prediction defaults save failed';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Species Prediction &amp; Research</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        These settings apply only to the currently selected species.
      </p>
      {!canManage && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Admin defaults are visible here for review. Running prediction/research remains available from the maps.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="space-y-1.5">
          <Label>Map scope</Label>
          <Select value={scopeId} onValueChange={(value) => setScopeId(value as SpeciesScopeId)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LINNULIIGID_SCOPE.id}>{LINNULIIGID_SCOPE.displayName}</SelectItem>
              <SelectItem value={RARILIIN_SCOPE.id}>{RARILIIN_SCOPE.displayName}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Selected species</Label>
          <Command className="rounded-md border border-input">
            <CommandInput placeholder="Search species..." value={search} onValueChange={setSearch} />
            <CommandList className="max-h-[200px]">
              <CommandEmpty>No species found</CommandEmpty>
              <CommandGroup>
                {filtered.slice(0, 60).map((species) => (
                  <CommandItem
                    key={species}
                    value={species}
                    onSelect={() => {
                      setSelectedSpecies(species);
                      setSearch('');
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>{species}</span>
                    {selectedSpecies === species && <Badge variant="outline">Current</Badge>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading species defaults…</span>
        </div>
      ) : (
        <Accordion type="multiple" className="w-full space-y-2">
          <AccordionItem value="general" className="rounded-lg border border-border px-4">
            <AccordionTrigger>General</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <SwitchRow
                label="Enable prediction"
                checked={form.enablePrediction}
                onCheckedChange={(checked) => patchForm({ enablePrediction: checked })}
              />
              <SwitchRow
                label="Enable research insights"
                checked={form.enableResearchInsights}
                onCheckedChange={(checked) => patchForm({ enableResearchInsights: checked })}
              />
              <NumericField
                id="refreshIntervalMinutes"
                label="Refresh interval (minutes)"
                value={form.refreshIntervalMinutes}
                min={5}
                max={1440}
                onChange={(value) => patchForm({ refreshIntervalMinutes: value })}
              />
              <div className="space-y-1.5">
                <Label htmlFor="outputCount">Output count</Label>
                <Select value={String(form.outputCount)} onValueChange={(value) => patchForm({ outputCount: Number(value) as 3 | 5 })}>
                  <SelectTrigger id="outputCount">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Top 3</SelectItem>
                    <SelectItem value="5">Top 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sources" className="rounded-lg border border-border px-4">
            <AccordionTrigger>Sources &amp; Countries</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <SwitchRow label="Use eBird foreign sightings" checked={form.sources.ebirdForeign} onCheckedChange={(checked) => patchForm({ sources: { ...form.sources, ebirdForeign: checked } })} />
              <SwitchRow label="Use Elurikkus history" checked={form.sources.elurikkusHistory} onCheckedChange={(checked) => patchForm({ sources: { ...form.sources, elurikkusHistory: checked } })} />
              <SwitchRow label="Use Estonia recent records" checked={form.sources.estoniaRecent} onCheckedChange={(checked) => patchForm({ sources: { ...form.sources, estoniaRecent: checked } })} />
              <SwitchRow label="Use weather and wind" checked={form.sources.weatherWind} onCheckedChange={(checked) => patchForm({ sources: { ...form.sources, weatherWind: checked } })} />
              <SwitchRow label="Latvia" checked={form.countries.latvia} onCheckedChange={(checked) => patchForm({ countries: { ...form.countries, latvia: checked } })} />
              <SwitchRow label="Lithuania" checked={form.countries.lithuania} onCheckedChange={(checked) => patchForm({ countries: { ...form.countries, lithuania: checked } })} />
              <SwitchRow label="Belarus" checked={form.countries.belarus} onCheckedChange={(checked) => patchForm({ countries: { ...form.countries, belarus: checked } })} />
              <SwitchRow label="Poland" checked={form.countries.poland} onCheckedChange={(checked) => patchForm({ countries: { ...form.countries, poland: checked } })} />
              <SwitchRow label="Russia" checked={form.countries.russia} onCheckedChange={(checked) => patchForm({ countries: { ...form.countries, russia: checked } })} />
              <SwitchRow label="Finland context only" checked={form.countries.finlandContextOnly} onCheckedChange={(checked) => patchForm({ countries: { ...form.countries, finlandContextOnly: checked } })} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="windows" className="rounded-lg border border-border px-4">
            <AccordionTrigger>Time Windows &amp; Weights</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <SwitchRow label="Foreign lookback 1d" checked={form.windows.foreign1d} onCheckedChange={(checked) => patchForm({ windows: { ...form.windows, foreign1d: checked } })} />
              <SwitchRow label="Foreign lookback 3d" checked={form.windows.foreign3d} onCheckedChange={(checked) => patchForm({ windows: { ...form.windows, foreign3d: checked } })} />
              <SwitchRow label="Foreign lookback 7d" checked={form.windows.foreign7d} onCheckedChange={(checked) => patchForm({ windows: { ...form.windows, foreign7d: checked } })} />
              <SwitchRow label="Foreign lookback 14d" checked={form.windows.foreign14d} onCheckedChange={(checked) => patchForm({ windows: { ...form.windows, foreign14d: checked } })} />
              <SwitchRow label="Estonia recent 7d" checked={form.windows.estonia7d} onCheckedChange={(checked) => patchForm({ windows: { ...form.windows, estonia7d: checked } })} />
              <SwitchRow label="Estonia recent 30d" checked={form.windows.estonia30d} onCheckedChange={(checked) => patchForm({ windows: { ...form.windows, estonia30d: checked } })} />
              <NumericField id="foreignPressureWeight" label="Foreign pressure weight" value={form.weights.foreignPressure} onChange={(value) => patchForm({ weights: { ...form.weights, foreignPressure: value } })} />
              <NumericField id="elurikkusHistoryWeight" label="Elurikkus history weight" value={form.weights.elurikkusHistory} onChange={(value) => patchForm({ weights: { ...form.weights, elurikkusHistory: value } })} />
              <NumericField id="springTimingWeight" label="Spring timing weight" value={form.weights.springTiming} onChange={(value) => patchForm({ weights: { ...form.weights, springTiming: value } })} />
              <NumericField id="weatherWindWeight" label="Weather/wind weight" value={form.weights.weatherWind} onChange={(value) => patchForm({ weights: { ...form.weights, weatherWind: value } })} />
              <NumericField id="hotspotHistoryWeight" label="Hotspot history weight" value={form.weights.hotspotHistory} onChange={(value) => patchForm({ weights: { ...form.weights, hotspotHistory: value } })} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="precision" className="rounded-lg border border-border px-4">
            <AccordionTrigger>Precision &amp; Map Output</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="predictionMode">Prediction mode</Label>
                <Select value={form.precision.mode} onValueChange={(value) => patchForm({ precision: { ...form.precision, mode: value as SpeciesPredictionSettingsModel['precision']['mode'] } })}>
                  <SelectTrigger id="predictionMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="broad_area">Broad area</SelectItem>
                    <SelectItem value="hotspot">Hotspot</SelectItem>
                    <SelectItem value="precise_hotspot">Precise hotspot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumericField id="searchRadiusKm" label="Search radius (km)" value={form.precision.searchRadiusKm} onChange={(value) => patchForm({ precision: { ...form.precision, searchRadiusKm: value } })} />
              <NumericField id="hotspotRadiusKm" label="Hotspot radius (km)" value={form.precision.hotspotRadiusKm} onChange={(value) => patchForm({ precision: { ...form.precision, hotspotRadiusKm: value } })} />
              <NumericField id="hotspotCount" label="Hotspot count" value={form.precision.hotspotCount} onChange={(value) => patchForm({ precision: { ...form.precision, hotspotCount: value } })} />
              <SwitchRow label="Show source flows" checked={form.precision.showSourceFlows} onCheckedChange={(checked) => patchForm({ precision: { ...form.precision, showSourceFlows: checked } })} />
              <SwitchRow label="Show confidence rings" checked={form.precision.showConfidenceRings} onCheckedChange={(checked) => patchForm({ precision: { ...form.precision, showConfidenceRings: checked } })} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="automation" className="rounded-lg border border-border px-4">
            <AccordionTrigger>AI / n8n Integration</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <SwitchRow label="Enable n8n research" checked={form.automation.enableN8nResearch} onCheckedChange={(checked) => patchForm({ automation: { ...form.automation, enableN8nResearch: checked } })} />
              <div className="space-y-1.5">
                <Label htmlFor="n8nWebhookUrl">n8n webhook URL</Label>
                <Input id="n8nWebhookUrl" value={form.automation.n8nWebhookUrl} onChange={(event) => patchForm({ automation: { ...form.automation, n8nWebhookUrl: event.target.value } })} placeholder="https://n8n.example/webhook/species-prediction" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n8nAuthHeader">n8n auth header</Label>
                <Input id="n8nAuthHeader" value={form.automation.n8nAuthHeader} onChange={(event) => patchForm({ automation: { ...form.automation, n8nAuthHeader: event.target.value } })} placeholder="Optional. Prefer server-side env values." />
              </div>
              <SwitchRow label="Enable OpenAI summary" checked={form.automation.enableOpenAISummary} onCheckedChange={(checked) => patchForm({ automation: { ...form.automation, enableOpenAISummary: checked } })} />
              <div className="space-y-1.5">
                <Label htmlFor="summaryStyle">Summary style</Label>
                <Select value={form.automation.summaryStyle} onValueChange={(value) => patchForm({ automation: { ...form.automation, summaryStyle: value as SpeciesPredictionSettingsModel['automation']['summaryStyle'] } })}>
                  <SelectTrigger id="summaryStyle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short</SelectItem>
                    <SelectItem value="analytical">Analytical</SelectItem>
                    <SelectItem value="field_use">Field use</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumericField id="summaryMaxLength" label="Summary max length" value={form.automation.summaryMaxLength} min={100} max={5000} onChange={(value) => patchForm({ automation: { ...form.automation, summaryMaxLength: value } })} />
              <p className="text-xs text-muted-foreground">
                Secrets should stay server-side. The app proxy function uses env vars if configured.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      <Button onClick={saveForm} className="w-full" disabled={!canManage || saving || !selectedSpecies}>
        {saving ? 'Saving…' : 'Save species defaults'}
      </Button>
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function NumericField({ id, label, value, min, max, onChange }: NumericFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
