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
import { ACTIVE_PREDICTION_SPECIES_EVENT, getActivePredictionSpecies, setActivePredictionSpecies } from '@/lib/activePredictionSpecies';

type NumericFieldProps = {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
};

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default function SpeciesPredictionSettings() {
  const { user, isAdmin, hasPermission } = useAuth();
  const canManage = isAdmin || hasPermission(PERMISSIONS.settingsManage);
  const [scopeId, setScopeId] = useState<SpeciesScopeId>('linnuliigid');
  const [speciesList, setSpeciesList] = useState<string[]>([]);
  const [activeSpeciesName, setActiveSpeciesName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backendConfig, setBackendConfig] = useState<BackendConfig>({
    webhookConfigured: false,
    webhookHost: null,
    backendBuild: '',
  });
  const [backendConfigLoading, setBackendConfigLoading] = useState(false);
  const [predictionFeatureEnabled, setPredictionFeatureEnabled] = useState(isSpeciesPredictionEnabled);
  const [form, setForm] = useState<SpeciesPredictionSettingsModel>(() => normalizeSpeciesPredictionSettings(null, '', 'linnuliigid'));

  const scope = SPECIES_SCOPES[scopeId];
  const predictionEnabled = isSpeciesPredictionEnabled();
  const activeSpeciesKey = useMemo(() => normalizeSpeciesName(activeSpeciesName), [activeSpeciesName]);
  const hasValidSelectedSpecies = Boolean(activeSpeciesName && activeSpeciesKey);
  const isBackendConfigured = backendConfig.webhookConfigured;
  const canValidateSpeciesSettings = predictionEnabled && isBackendConfigured;
  const saveBlockedMessage = canValidateSpeciesSettings && !hasValidSelectedSpecies
    ? 'Select a valid species before saving prediction settings'
    : '';
  const setActiveSpecies = useCallback((speciesName: string) => {
    const next = setActivePredictionSpecies(scopeId, speciesName);
    setActiveSpeciesName(next?.speciesName || normalizeUiText(speciesName));
  }, [scopeId]);

  useEffect(() => {
    if (!isSpeciesPredictionEnabled()) return;
    fetchSpeciesList(scope).then((list) => {
      const normalized = list.map(normalizeUiText).filter(Boolean);
      setSpeciesList(normalized);
      const persistedSpecies = getActivePredictionSpecies(scopeId)?.speciesName || '';
      const nextSpecies = (
        (persistedSpecies && normalized.includes(persistedSpecies) && persistedSpecies)
        || (activeSpeciesName && normalized.includes(activeSpeciesName) && activeSpeciesName)
        || normalized[0]
        || ''
      );
      if (nextSpecies && nextSpecies !== activeSpeciesName) {
        setActiveSpecies(nextSpecies);
      }
    });
  }, [scope, scopeId, activeSpeciesName, setActiveSpecies]);

  useEffect(() => {
    const syncFromSharedState = () => {
      const sharedSpecies = getActivePredictionSpecies(scopeId)?.speciesName || '';
      if (sharedSpecies && sharedSpecies !== activeSpeciesName) {
        setActiveSpeciesName(sharedSpecies);
      }
    };
    syncFromSharedState();
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ scope: SpeciesScopeId; speciesName: string }>).detail;
      if (!detail || detail.scope !== scopeId) return;
      setActiveSpeciesName(normalizeUiText(detail.speciesName || ''));
    };
    window.addEventListener(ACTIVE_PREDICTION_SPECIES_EVENT, handler as EventListener);
    return () => window.removeEventListener(ACTIVE_PREDICTION_SPECIES_EVENT, handler as EventListener);
  }, [scopeId, activeSpeciesName]);

  const loadSpeciesSettings = useCallback(async (speciesName: string) => {
    if (!isSpeciesPredictionEnabled()) return;
    if (!speciesName) return;
    const normalizedSpeciesName = normalizeUiText(speciesName);
    const speciesKey = normalizeSpeciesName(normalizedSpeciesName);
    setLoading(true);
    try {
      const loaded = await loadSpeciesPredictionSettings(scopeId, normalizedSpeciesName);
      setForm((prev) => {
        const currentSpeciesName = normalizeUiText(activeSpeciesName);
        const currentSpeciesKey = normalizeSpeciesName(currentSpeciesName);
        if (currentSpeciesName !== normalizedSpeciesName || currentSpeciesKey !== speciesKey) {
          return prev;
        }
        return normalizeSpeciesPredictionSettings(loaded, normalizedSpeciesName, scopeId);
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Prediction settings load failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [scopeId, activeSpeciesName]);

  useEffect(() => {
    if (!isSpeciesPredictionEnabled()) return;
    if (!activeSpeciesName) return;
    setForm((prev) => normalizeSpeciesPredictionSettings(prev, activeSpeciesName, scopeId));
    void loadSpeciesSettings(activeSpeciesName);
  }, [activeSpeciesName, loadSpeciesSettings, scopeId]);

  useEffect(() => {
    if (!isSpeciesPredictionEnabled()) {
      setBackendConfig({ webhookConfigured: false, webhookHost: null, backendBuild: '' });
      return;
    }
    setBackendConfigLoading(true);
    fetchBackendConfig()
      .then(setBackendConfig)
      .catch((error) => {
        console.error('[speciesPrediction] backend config fetch failed; SPECIES_PREDICTION_N8N_WEBHOOK_URL likely missing in Supabase env', error);
        setBackendConfig({ webhookConfigured: false, webhookHost: null, backendBuild: '' });
      })
      .finally(() => setBackendConfigLoading(false));
  }, [predictionFeatureEnabled, scopeId]);

  const filtered = useMemo(() => (
    search
      ? speciesList.filter((species) => species.toLowerCase().includes(search.toLowerCase()))
      : speciesList
  ), [search, speciesList]);

  const patchForm = useCallback((patch: Partial<SpeciesPredictionSettingsModel>) => {
    setForm((prev) => normalizeSpeciesPredictionSettings({ ...prev, ...patch }, activeSpeciesName || prev.speciesName, scopeId));
  }, [scopeId, activeSpeciesName]);

  const saveForm = async () => {
    if (!isSpeciesPredictionEnabled()) return;
    if (!predictionFeatureEnabled) return;
    if (!isBackendConfigured) {
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
        normalizeSpeciesPredictionSettings(form, activeSpeciesName, scopeId),
        user?.id,
      );
      setForm(saved.settings);
      if (saved.storage === 'local') {
        toast.message(`Saved locally because Supabase settings sync is unavailable: ${saved.reason || 'Backend save unavailable'}`);
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
      {!predictionEnabled ? (
        <p className="text-xs text-muted-foreground">Turn on Species Prediction to edit these settings</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            These settings apply only to the currently selected species.
          </p>
          <div className="flex items-center gap-2 text-xs">
            {backendConfigLoading ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking backend config…
              </span>
            ) : isBackendConfigured ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Backend configured{backendConfig.webhookHost ? `: ${backendConfig.webhookHost}` : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-600 dark:text-rose-400">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
                Backend not configured — contact your administrator
              </span>
            )}
          </div>
          {!canManage && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Admin-managed species settings are visible here for review. Running prediction/research remains available from the maps.
            </div>
          )}

          {loading || backendConfigLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{loading ? 'Loading species settings...' : 'Checking backend config...'}</span>
            </div>
          ) : isBackendConfigured ? (
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
                              setActiveSpecies(species);
                              setSearch('');
                            }}
                            className={`flex items-center justify-between gap-2 ${activeSpeciesName === species ? 'bg-accent text-accent-foreground' : ''}`}
                          >
                            <span>{species}</span>
                            {activeSpeciesName === species && <Badge variant="outline">Current</Badge>}
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
                      <SwitchRow label="Use Elurikkus history" checked={form.useElurikkusHistory} onCheckedChange={(checked) => patchForm({ useElurikkusHistory: checked })} />
                      <SwitchRow label="Use Latvia as source country" checked={form.useLatvia} onCheckedChange={(checked) => patchForm({ useLatvia: checked })} />
                      <SwitchRow label="Use Lithuania as source country" checked={form.useLithuania} onCheckedChange={(checked) => patchForm({ useLithuania: checked })} />
                      <SwitchRow label="Use Belarus as source country" checked={form.useBelarus} onCheckedChange={(checked) => patchForm({ useBelarus: checked })} />
                      <SwitchRow label="Use Poland as source country" checked={form.usePoland} onCheckedChange={(checked) => patchForm({ usePoland: checked })} />
                      <SwitchRow label="Use Russia as source country" checked={form.useRussia} onCheckedChange={(checked) => patchForm({ useRussia: checked })} />
                      <SwitchRow label="Use Finland as optional context only" checked={form.useFinlandContextOnly} onCheckedChange={(checked) => patchForm({ useFinlandContextOnly: checked })} />
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
                      <NumericField id="horizonDays" label="Prediction horizon (days)" value={form.horizonDays} min={1} max={30} onChange={(value) => patchForm({ horizonDays: value })} />
                      <SwitchRow label="Show prediction cone" checked={form.showPredictionCone} onCheckedChange={(checked) => patchForm({ showPredictionCone: checked })} />
                      <SwitchRow label="Recent-only map markers" checked={form.recentOnlyMapMarkers} onCheckedChange={(checked) => patchForm({ recentOnlyMapMarkers: checked })} />
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
          ) : null}

          {saveBlockedMessage && (
            <p className="text-xs text-destructive">{saveBlockedMessage}</p>
          )}

          {isBackendConfigured && (
            <Button onClick={saveForm} className="w-full" disabled={!canManage || saving || !hasValidSelectedSpecies || !isBackendConfigured}>
              {saving ? 'Saving...' : 'Save species settings'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

type BackendConfig = {
  webhookConfigured: boolean;
  webhookHost: string | null;
  backendBuild: string;
};

async function fetchBackendConfig(): Promise<BackendConfig> {
  const response = await fetch(`${getFunctionsBaseUrl()}/species-prediction?mode=config&_ts=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { ...getSupabaseAuthHeaders() },
  });
  if (!response.ok) throw new Error(`Backend config fetch failed: HTTP ${response.status}`);
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  const record = safeRecord(data);
  return {
    webhookConfigured: record.webhookConfigured === true,
    webhookHost: typeof record.webhookHost === 'string' && record.webhookHost ? record.webhookHost : null,
    backendBuild: safeString(record.backendBuild),
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

