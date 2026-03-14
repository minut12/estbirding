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
import { normalizeSpeciesName, normalizeUiText } from '@/lib/textNormalize';
import { useAuth } from '@/features/auth/AuthContext';
import { PERMISSIONS } from '@/features/auth/permissions';
import { isSpeciesPredictionEnabled, loadSettings, saveSettings } from '@/lib/settings';
import { getFunctionsBaseUrl, getSupabaseAuthHeaders } from '@/config/supabaseConfig';
import { APP_VERSION } from '@/lib/version';

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
  const [backendStatus, setBackendStatus] = useState<SpeciesPredictionBackendStatus>({
    ok: false,
    configured: false,
    webhookConfigured: false,
    available: false,
    deployed: false,
    message: 'Prediction backend is not configured yet',
  });
  const [backendStatusLoading, setBackendStatusLoading] = useState(false);
  const [predictionFeatureEnabled, setPredictionFeatureEnabled] = useState(isSpeciesPredictionEnabled);
  const [form, setForm] = useState<SpeciesPredictionSettingsModel>(() => normalizeSpeciesPredictionSettings(null, '', 'linnuliigid'));

  const scope = SPECIES_SCOPES[scopeId];
  const predictionEnabled = isSpeciesPredictionEnabled();
  const selectedSpeciesKey = useMemo(() => normalizeSpeciesName(selectedSpecies), [selectedSpecies]);
  const hasValidSelectedSpecies = Boolean(selectedSpecies && selectedSpeciesKey);
  const isBackendReadyForConfiguration = (
    backendStatus.configured === true
    && backendStatus.webhookConfigured === true
    && backendStatus.available === true
    && backendStatus.deployed === true
  );
  const canValidateSpeciesSettings = predictionEnabled && isBackendReadyForConfiguration;
  const backendBadgeLabel = isBackendReadyForConfiguration
    ? 'Configured'
    : (backendStatus.available && backendStatus.deployed ? 'Missing env' : 'Unavailable');
  const backendStatusMessage = backendStatus.message || 'Prediction backend is not configured yet';
  const saveBlockedMessage = canValidateSpeciesSettings && !hasValidSelectedSpecies
    ? 'Select a valid species before saving prediction settings'
    : '';

  useEffect(() => {
    if (!isSpeciesPredictionEnabled()) return;
    fetchSpeciesList(scope).then((list) => {
      const normalized = list.map(normalizeUiText).filter(Boolean);
      setSpeciesList(normalized);
      if (!selectedSpecies && normalized[0]) setSelectedSpecies(normalized[0]);
    });
  }, [scope, selectedSpecies]);

  const loadSpeciesSettings = useCallback(async (speciesName: string) => {
    if (!isSpeciesPredictionEnabled()) return;
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
    if (!isSpeciesPredictionEnabled()) return;
    if (!selectedSpecies) return;
    void loadSpeciesSettings(selectedSpecies);
  }, [selectedSpecies, loadSpeciesSettings]);

  useEffect(() => {
    if (!isSpeciesPredictionEnabled()) {
      setBackendStatus({
        ok: false,
        configured: false,
        webhookConfigured: false,
        available: false,
        deployed: false,
        message: 'Prediction backend is not configured yet',
      });
      return;
    }

    setBackendStatusLoading(true);
    fetchSpeciesPredictionBackendStatus()
      .then((data) => {
        setBackendStatus(data);
      })
      .catch(() => {
        setBackendStatus({
          ok: false,
          configured: false,
          webhookConfigured: false,
          available: false,
          deployed: false,
          message: 'Prediction backend is not configured yet',
        });
      })
      .finally(() => setBackendStatusLoading(false));
  }, [predictionFeatureEnabled, scopeId]);

  const filtered = useMemo(() => (
    search
      ? speciesList.filter((species) => species.toLowerCase().includes(search.toLowerCase()))
      : speciesList
  ), [search, speciesList]);

  const patchForm = useCallback((patch: Partial<SpeciesPredictionSettingsModel>) => {
    setForm((prev) => normalizeSpeciesPredictionSettings({ ...prev, ...patch }, selectedSpecies || prev.speciesName, scopeId));
  }, [scopeId, selectedSpecies]);

  const saveForm = async () => {
    console.debug('[speciesPrediction] settings save requested', { enabled: isSpeciesPredictionEnabled() });
    if (!isSpeciesPredictionEnabled()) return;
    if (!predictionFeatureEnabled) return;
    if (!isBackendReadyForConfiguration) {
      toast.error('Prediction backend is not configured yet');
      return;
    }
    if (!hasValidSelectedSpecies) {
      toast.error('Select a valid species before saving prediction settings');
      return;
    }
    if (!canManage) {
      toast.error('Only admins can save species-specific prediction settings.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSpeciesPredictionSettings(
        scopeId,
        normalizeSpeciesPredictionSettings(form, selectedSpecies, scopeId),
        user?.id,
      );
      setForm(saved.settings);
      if (saved.storage === 'local') {
        toast.message(`Saved locally because backend save is unavailable: ${saved.reason || 'Backend save unavailable'}`);
      } else {
        toast.success('Species prediction settings saved');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Prediction settings save failed';
      console.error('[SpeciesPredictionSettings] save failed', error);
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
      <PredictionFeatureToggle
        enabled={predictionFeatureEnabled}
        onEnabledChange={setPredictionFeatureEnabled}
      />
      <p className="text-[11px] text-muted-foreground">
        prediction-settings-build: {APP_VERSION} / species-settings-v2
      </p>
      {!predictionEnabled ? (
        <p className="text-xs text-muted-foreground">Turn on Species Prediction to edit these settings</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            These settings apply only to the currently selected species.
          </p>
          <div className="rounded-lg border border-border bg-card p-4 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-foreground">Prediction backend status</span>
              <Badge variant={isBackendReadyForConfiguration ? 'default' : 'outline'}>
                {backendBadgeLabel}
              </Badge>
            </div>
            <p className="mt-2 text-muted-foreground">
              {backendStatusMessage}
            </p>
          </div>
          {!canManage && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Admin-managed species settings are visible here for review. Running prediction/research remains available from the maps.
            </div>
          )}

          {loading || backendStatusLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{loading ? 'Loading species settings...' : 'Checking prediction backend...'}</span>
            </div>
          ) : isBackendReadyForConfiguration ? (
            <>
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

              <div>
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
                      <SwitchRow label="Use eBird foreign sightings" checked={form.useEbirdForeignSightings} onCheckedChange={(checked) => patchForm({ useEbirdForeignSightings: checked })} />
                      <SwitchRow label="Use Elurikkus history" checked={form.useElurikkusHistory} onCheckedChange={(checked) => patchForm({ useElurikkusHistory: checked })} />
                      <SwitchRow label="Use Estonia recent records" checked={form.useEstoniaRecentRecords} onCheckedChange={(checked) => patchForm({ useEstoniaRecentRecords: checked })} />
                      <SwitchRow label="Use weather and wind" checked={form.useWeatherWind} onCheckedChange={(checked) => patchForm({ useWeatherWind: checked })} />
                      <SwitchRow label="Use Latvia as source country" checked={form.useLatvia} onCheckedChange={(checked) => patchForm({ useLatvia: checked })} />
                      <SwitchRow label="Use Lithuania as source country" checked={form.useLithuania} onCheckedChange={(checked) => patchForm({ useLithuania: checked })} />
                      <SwitchRow label="Use Belarus as source country" checked={form.useBelarus} onCheckedChange={(checked) => patchForm({ useBelarus: checked })} />
                      <SwitchRow label="Use Poland as source country" checked={form.usePoland} onCheckedChange={(checked) => patchForm({ usePoland: checked })} />
                      <SwitchRow label="Use Russia as source country" checked={form.useRussia} onCheckedChange={(checked) => patchForm({ useRussia: checked })} />
                      <SwitchRow label="Use Finland as optional context only" checked={form.useFinlandContextOnly} onCheckedChange={(checked) => patchForm({ useFinlandContextOnly: checked })} />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="windows" className="rounded-lg border border-border px-4">
                    <AccordionTrigger>Time Windows &amp; Weights</AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      <SwitchRow label="Foreign lookback 1d" checked={form.foreignLookback1d} onCheckedChange={(checked) => patchForm({ foreignLookback1d: checked })} />
                      <SwitchRow label="Foreign lookback 3d" checked={form.foreignLookback3d} onCheckedChange={(checked) => patchForm({ foreignLookback3d: checked })} />
                      <SwitchRow label="Foreign lookback 7d" checked={form.foreignLookback7d} onCheckedChange={(checked) => patchForm({ foreignLookback7d: checked })} />
                      <SwitchRow label="Foreign lookback 14d" checked={form.foreignLookback14d} onCheckedChange={(checked) => patchForm({ foreignLookback14d: checked })} />
                      <SwitchRow label="Estonia recent 7d" checked={form.estoniaRecentWindow7d} onCheckedChange={(checked) => patchForm({ estoniaRecentWindow7d: checked })} />
                      <SwitchRow label="Estonia recent 30d" checked={form.estoniaRecentWindow30d} onCheckedChange={(checked) => patchForm({ estoniaRecentWindow30d: checked })} />
                      <NumericField id="foreignPressureWeight" label="Foreign pressure weight" value={form.foreignPressureWeight} onChange={(value) => patchForm({ foreignPressureWeight: value })} />
                      <NumericField id="elurikkusHistoryWeight" label="Elurikkus history weight" value={form.elurikkusHistoryWeight} onChange={(value) => patchForm({ elurikkusHistoryWeight: value })} />
                      <NumericField id="springTimingWeight" label="Spring timing weight" value={form.springTimingWeight} onChange={(value) => patchForm({ springTimingWeight: value })} />
                      <NumericField id="weatherWindWeight" label="Weather/wind weight" value={form.weatherWindWeight} onChange={(value) => patchForm({ weatherWindWeight: value })} />
                      <NumericField id="hotspotHistoryWeight" label="Hotspot history weight" value={form.hotspotHistoryWeight} onChange={(value) => patchForm({ hotspotHistoryWeight: value })} />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="precision" className="rounded-lg border border-border px-4">
                    <AccordionTrigger>Precision &amp; Map Output</AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="predictionMode">Prediction mode</Label>
                        <Select value={form.predictionMode} onValueChange={(value) => patchForm({ predictionMode: value as SpeciesPredictionSettingsModel['predictionMode'] })}>
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
                      <NumericField id="searchRadiusKm" label="Search radius (km)" value={form.searchRadiusKm} onChange={(value) => patchForm({ searchRadiusKm: value })} />
                      <NumericField id="hotspotRadiusKm" label="Hotspot radius (km)" value={form.hotspotRadiusKm} onChange={(value) => patchForm({ hotspotRadiusKm: value })} />
                      <NumericField id="hotspotCount" label="Hotspot count" value={form.hotspotCount} onChange={(value) => patchForm({ hotspotCount: value })} />
                      <SwitchRow label="Show source flows on map" checked={form.mapShowSourceFlows} onCheckedChange={(checked) => patchForm({ mapShowSourceFlows: checked })} />
                      <SwitchRow label="Show confidence rings on map" checked={form.mapShowConfidenceRings} onCheckedChange={(checked) => patchForm({ mapShowConfidenceRings: checked })} />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="automation" className="rounded-lg border border-border px-4">
                    <AccordionTrigger>AI / n8n Integration</AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      <SwitchRow label="Enable server-side research" checked={form.enableN8nResearch} onCheckedChange={(checked) => patchForm({ enableN8nResearch: checked })} />
                      <SwitchRow label="Enable OpenAI summary" checked={form.enableOpenAISummary} onCheckedChange={(checked) => patchForm({ enableOpenAISummary: checked })} />
                      <div className="space-y-1.5">
                        <Label htmlFor="summaryStyle">Summary style</Label>
                        <Select value={form.summaryStyle} onValueChange={(value) => patchForm({ summaryStyle: value as SpeciesPredictionSettingsModel['summaryStyle'] })}>
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
                      <NumericField id="summaryMaxLength" label="Summary max length" value={form.summaryMaxLength} min={100} max={5000} onChange={(value) => patchForm({ summaryMaxLength: value })} />
                      <p className="text-xs text-muted-foreground">
                        Secrets should stay server-side. The app proxy function uses env vars if configured.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Prediction backend is not configured yet. Add the webhook secret in Supabase and redeploy the Edge Function.
            </div>
          )}

          {saveBlockedMessage && (
            <p className="text-xs text-destructive">{saveBlockedMessage}</p>
          )}

          {isBackendReadyForConfiguration && (
            <Button onClick={saveForm} className="w-full" disabled={!canManage || saving || !hasValidSelectedSpecies || !isBackendReadyForConfiguration}>
              {saving ? 'Saving...' : 'Save species settings'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

type SpeciesPredictionBackendStatus = {
  ok: boolean;
  configured: boolean;
  webhookConfigured: boolean;
  available: boolean;
  deployed: boolean;
  message: string;
};

async function fetchSpeciesPredictionBackendStatus(): Promise<SpeciesPredictionBackendStatus> {
  let response: Response;
  try {
    response = await fetch(`${getFunctionsBaseUrl()}/species-prediction?mode=status`, {
      method: 'GET',
      headers: {
        ...getSupabaseAuthHeaders(),
      },
    });
  } catch {
    throw new Error('Prediction backend is not configured yet');
  }

  const raw = await response.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      if (response.status === 404) {
        throw new Error('Prediction backend is unavailable or not deployed');
      }
      throw new Error('Prediction backend is not configured yet');
    }
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Prediction backend is unavailable or not deployed');
    }
    const message = typeof data === 'object' && data && 'message' in data
      ? String((data as { message?: unknown }).message || 'Prediction backend is not configured yet')
      : 'Prediction backend is not configured yet';
    throw new Error(message);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Prediction backend is not configured yet');
  }

  const status = data as Partial<SpeciesPredictionBackendStatus>;
  return {
    ok: status.ok === true,
    configured: status.configured === true,
    webhookConfigured: status.webhookConfigured === true,
    available: status.available === true,
    deployed: status.deployed === true,
    message: String(status.message || 'Prediction backend is not configured yet'),
  };
}

function PredictionFeatureToggle({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const togglePredictionFeature = (checked: boolean) => {
    const next = { ...loadSettings(), enableSpeciesPredictionBeta: checked };
    saveSettings(next);
    onEnabledChange(checked);
    console.debug('[speciesPrediction] feature flag', { enabled: checked });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Enable Species Prediction (beta)</Label>
          <p className="text-xs text-muted-foreground">
            Prediction settings are beta and apply only to the selected species
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={togglePredictionFeature} />
      </div>
      {!enabled && (
        <Badge variant="outline">Feature is disabled</Badge>
      )}
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
