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
import { extractUsablePayloadFromErrorEnvelope, normalizeSpeciesPredictionSettings, type SpeciesPredictionSettings as SpeciesPredictionSettingsModel } from '@/lib/speciesPrediction';
import { normalizeSpeciesName, normalizeUiText } from '@/lib/textNormalize';
import { useAuth } from '@/features/auth/AuthContext';
import { PERMISSIONS } from '@/features/auth/permissions';
import { isSpeciesPredictionEnabled, loadSettings, saveSettings } from '@/lib/settings';
import { getFunctionsBaseUrl, getSupabaseAuthHeaders } from '@/config/supabaseConfig';
import { ACTIVE_PREDICTION_SPECIES_EVENT, getActivePredictionSpecies, setActivePredictionSpecies } from '@/lib/activePredictionSpecies';
import {
  clearSpeciesPredictionDebugMemory,
  clearSpeciesPredictionDebugStorage,
  getSpeciesPredictionDebugSnapshot,
  getSpeciesPredictionDebugStorageSnapshot,
  setSpeciesPredictionHealthCheckResult,
  SPECIES_PREDICTION_DEBUG_EVENT,
  SPECIES_PREDICTION_DEBUG_HEALTHCHECK_EVENT,
  SPECIES_PREDICTION_DEBUG_RERUN_EVENT,
  SPECIES_PREDICTION_DEBUG_RESYNC_EVENT,
  type SpeciesPredictionDebugSnapshot,
} from '@/lib/speciesPredictionDebug';
import { isDeveloperModeEnabled } from '@/config/supabaseConfig';

type NumericFieldProps = {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
};

function safeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

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
  const [backendStatus, setBackendStatus] = useState<SpeciesPredictionBackendStatus>({
    ok: false,
    configured: false,
    webhookConfigured: false,
    webhookValid: false,
    available: false,
    runtimeAvailable: null,
    deployed: false,
    statusCode: 'NOT_CONFIGURED',
    reasonCode: 'MISSING_WEBHOOK_URL',
    predictionBackendBuild: '',
    expectedWebhookPath: '',
    configuredWebhookPath: '',
    hasOutdatedWebhook: false,
    productionWebhookReachable: null,
    productionWebhookInactive: false,
    message: 'Prediction backend is not configured yet',
  });
  const [backendStatusLoading, setBackendStatusLoading] = useState(false);
  const [predictionFeatureEnabled, setPredictionFeatureEnabled] = useState(isSpeciesPredictionEnabled);
  const [form, setForm] = useState<SpeciesPredictionSettingsModel>(() => normalizeSpeciesPredictionSettings(null, '', 'linnuliigid'));
  const [showDebugData, setShowDebugData] = useState(false);
  const [debugSnapshot, setDebugSnapshot] = useState<SpeciesPredictionDebugSnapshot>(() => getSpeciesPredictionDebugSnapshot());
  const [storageSnapshot, setStorageSnapshot] = useState(() => getSpeciesPredictionDebugStorageSnapshot());

  const scope = SPECIES_SCOPES[scopeId];
  const predictionEnabled = isSpeciesPredictionEnabled();
  const activeSpeciesKey = useMemo(() => normalizeSpeciesName(activeSpeciesName), [activeSpeciesName]);
  const hasValidSelectedSpecies = Boolean(activeSpeciesName && activeSpeciesKey);
  const normalizedBackendStatus = useMemo(() => normalizeBackendStatus(backendStatus), [backendStatus]);
  const diagnosticWebhookError = useMemo(() => detectOutdatedWebhookFromDiagnostics(debugSnapshot), [debugSnapshot]);
  const displayState = useMemo(() => deriveSpeciesPredictionDisplayState(normalizedBackendStatus), [normalizedBackendStatus]);
  const statusCard = useMemo(() => buildSpeciesPredictionStatusCard(displayState, normalizedBackendStatus), [displayState, normalizedBackendStatus]);
  const isBackendReadyForConfiguration = displayState === 'CONFIGURED_AVAILABLE';
  const canValidateSpeciesSettings = predictionEnabled && isBackendReadyForConfiguration;
  const saveBlockedMessage = canValidateSpeciesSettings && !hasValidSelectedSpecies
    ? 'Select a valid species before saving prediction settings'
    : '';
  const canSeeDebugDiagnostics = canManage || isDeveloperModeEnabled();

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

  useEffect(() => {
    const refreshDebugState = () => {
      setDebugSnapshot(getSpeciesPredictionDebugSnapshot());
      setStorageSnapshot(getSpeciesPredictionDebugStorageSnapshot());
    };
    refreshDebugState();
    window.addEventListener(SPECIES_PREDICTION_DEBUG_EVENT, refreshDebugState as EventListener);
    window.addEventListener('storage', refreshDebugState);
    return () => {
      window.removeEventListener(SPECIES_PREDICTION_DEBUG_EVENT, refreshDebugState as EventListener);
      window.removeEventListener('storage', refreshDebugState);
    };
  }, []);

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
      setBackendStatus({
        ok: false,
        configured: false,
        webhookConfigured: false,
        webhookValid: false,
        available: false,
        runtimeAvailable: null,
        deployed: false,
        statusCode: 'NOT_CONFIGURED',
        reasonCode: 'MISSING_WEBHOOK_URL',
        productionWebhookReachable: null,
        productionWebhookInactive: false,
        message: 'Prediction backend is not configured yet',
      });
      return;
    }

    setBackendStatusLoading(true);
    fetchSpeciesPredictionBackendStatus()
      .then((data) => {
        setBackendStatus(data);
        setSpeciesPredictionHealthCheckResult({
          ok: true,
          status: 200,
          body: data,
          timestamp: new Date().toISOString(),
        });
      })
      .catch(() => {
        setBackendStatus({
          ok: false,
          configured: false,
          webhookConfigured: false,
          webhookValid: false,
          available: false,
          runtimeAvailable: null,
          deployed: false,
          statusCode: 'NOT_CONFIGURED',
          reasonCode: 'MISSING_WEBHOOK_URL',
          productionWebhookReachable: null,
          productionWebhookInactive: false,
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
    setForm((prev) => normalizeSpeciesPredictionSettings({ ...prev, ...patch }, activeSpeciesName || prev.speciesName, scopeId));
  }, [scopeId, activeSpeciesName]);

  const saveForm = async () => {
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

  const refreshDebugSnapshots = useCallback(() => {
    setDebugSnapshot(getSpeciesPredictionDebugSnapshot());
    setStorageSnapshot(getSpeciesPredictionDebugStorageSnapshot());
  }, []);

  const copyJson = useCallback(async (value: unknown, label: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value ?? null, null, 2));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Copy failed: ${label}`);
    }
  }, []);

  const copyDiagnosticsSummary = useCallback(async () => {
    const summary = buildDiagnosticsSummary(debugSnapshot);
    try {
      await navigator.clipboard.writeText(summary);
      toast.success('Diagnostics summary copied');
    } catch {
      toast.error('Copy failed: diagnostics summary');
    }
  }, [debugSnapshot]);

  const clearPredictionCache = useCallback(() => {
    clearSpeciesPredictionDebugMemory();
    refreshDebugSnapshots();
    toast.success('Prediction debug cache cleared');
  }, [refreshDebugSnapshots]);

  const clearPredictionStorage = useCallback(() => {
    clearSpeciesPredictionDebugStorage();
    refreshDebugSnapshots();
    toast.success('Species prediction storage cleared');
  }, [refreshDebugSnapshots]);

  const forceRerunPrediction = useCallback(() => {
    window.dispatchEvent(new Event(SPECIES_PREDICTION_DEBUG_RERUN_EVENT));
    toast.success('Prediction rerun requested');
  }, []);

  const runHealthCheck = useCallback(() => {
    window.dispatchEvent(new Event(SPECIES_PREDICTION_DEBUG_HEALTHCHECK_EVENT));
    toast.success('Backend health check requested');
  }, []);

  const resyncPanel = useCallback(() => {
    window.dispatchEvent(new Event(SPECIES_PREDICTION_DEBUG_RESYNC_EVENT));
    toast.success('Panel resync requested');
  }, []);

  const copyLastErrorJson = useCallback(() => {
    void copyJson(debugSnapshot.transport.error, 'Last error JSON');
  }, [copyJson, debugSnapshot.transport.error]);

  const copyTransportDiagnostics = useCallback(() => {
    void copyJson(debugSnapshot.transport, 'Transport diagnostics');
  }, [copyJson, debugSnapshot.transport]);

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
        prediction-settings-build: 2026-03-31-live-probe
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
                {statusCard.badge}
              </Badge>
            </div>
            <p className="mt-2 font-medium text-foreground">
              {statusCard.primaryText}
            </p>
            <p className="mt-1 text-muted-foreground">
              {statusCard.helperText}
            </p>
            <TestPredictionBackendButton onResult={(data) => {
              setBackendStatus(data);
              setSpeciesPredictionHealthCheckResult({
                ok: true,
                status: 200,
                body: data,
                timestamp: new Date().toISOString(),
              });
            }} />
          </div>
          {/* Temporary debug: derived status mapper values */}
          {canSeeDebugDiagnostics && (
            <div className="rounded border border-border bg-muted/20 p-2 text-[10px] font-mono text-muted-foreground space-y-0.5">
              <p className="font-semibold text-foreground text-[11px]">Status mapper debug (live-probe)</p>
              <p>healthCheck.hasOutdatedWebhook: {String(normalizedBackendStatus.hasOutdatedWebhookPathError)}</p>
              <p>diagnostics.detected: {String(diagnosticWebhookError.detected)}</p>
              <p>diagnostics.stage: {diagnosticWebhookError.stage || '–'}</p>
              <p>diagnostics.code: {diagnosticWebhookError.code != null ? String(diagnosticWebhookError.code) : '–'}</p>
              <p>diagnostics.message: {diagnosticWebhookError.message || '–'}</p>
              <p>diagnostics.matchedReason: {diagnosticWebhookError.matchedReason || '–'}</p>
              <p>effective.hasOutdatedWebhookPathError: {String(normalizedBackendStatus.hasOutdatedWebhookPathError)}</p>
              <p>displayState: {displayState}</p>
              <p>resolvedWebhookUrl: {backendStatus.resolvedWebhookUrl || '–'}</p>
              <p>environmentName: {backendStatus.environmentName || '–'}</p>
              <p>healthcheckUrl: {backendStatus.healthcheckUrl || '–'}</p>
              <p>lastSuccessfulHealthCheckAt: {backendStatus.lastSuccessfulHealthCheckAt || '–'}</p>
              <p>lastFailedHealthCheckAt: {backendStatus.lastFailedHealthCheckAt || '–'}</p>
              <p>lastHttpStatus: {backendStatus.upstreamStatus != null ? String(backendStatus.upstreamStatus) : '–'}</p>
              <p>responseSnippet: {backendStatus.responseSnippet || '–'}</p>
              {(() => {
                const recoveredState = buildRecoveryDebugState(debugSnapshot?.rawBackendResponse);
                return (
                  <>
                    <p className="mt-1 font-semibold text-foreground text-[11px]">Response envelope recovery</p>
                    <p>raw top-level code: {recoveredState.rawTopLevelCode || '–'}</p>
                    <p>summarySourcePath: {recoveredState.summarySourcePath || '–'}</p>
                    <p>insightSummary recovered: {recoveredState.insightSummaryRecovered ? 'yes' : 'no'}</p>
                    <p>normalizedPredictionShape: {recoveredState.normalizedPredictionShape || '–'}</p>
                  </>
                );
              })()}
            </div>
          )}
          {canSeeDebugDiagnostics && (
            <RawPredictionDebug speciesKey={activeSpeciesKey} scopeId={scopeId} />
          )}
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
                      <NumericField id="horizonDays" label="Prediction horizon (days)" value={form.horizonDays} min={1} max={30} onChange={(value) => patchForm({ horizonDays: value })} />
                      <SwitchRow label="Show source flows on map" checked={form.mapShowSourceFlows} onCheckedChange={(checked) => patchForm({ mapShowSourceFlows: checked })} />
                      <SwitchRow label="Show confidence rings on map" checked={form.mapShowConfidenceRings} onCheckedChange={(checked) => patchForm({ mapShowConfidenceRings: checked })} />
                      <SwitchRow label="Show prediction cone" checked={form.showPredictionCone} onCheckedChange={(checked) => patchForm({ showPredictionCone: checked })} />
                      <SwitchRow label="Use regional target mode" checked={form.useRegionalTargets} onCheckedChange={(checked) => patchForm({ useRegionalTargets: checked })} />
                      <SwitchRow label="Recent-only map markers" checked={form.recentOnlyMapMarkers} onCheckedChange={(checked) => patchForm({ recentOnlyMapMarkers: checked })} />
                      <SwitchRow label="Snap to best target" checked={form.snapToBestTarget} onCheckedChange={(checked) => patchForm({ snapToBestTarget: checked })} />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="automation" className="rounded-lg border border-border px-4">
                    <AccordionTrigger>AI / n8n Integration</AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      <SwitchRow label="Enable server-side research" checked={form.enableN8nResearch} onCheckedChange={(checked) => patchForm({ enableN8nResearch: checked })} />
                      <SwitchRow label="Enable OpenAI summary" checked={form.enableOpenAISummary} onCheckedChange={(checked) => patchForm({ enableOpenAISummary: checked })} />
                      <SwitchRow label="Enable auto feed" checked={form.autoFeedEnabled} onCheckedChange={(checked) => patchForm({ autoFeedEnabled: checked })} />
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

              {canSeeDebugDiagnostics && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="debug-diagnostics" className="rounded-lg border border-border px-4">
                    <AccordionTrigger>Debug / Diagnostics</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="flex items-center justify-between rounded-md border border-border p-3">
                        <div className="space-y-1">
                          <Label className="text-sm">Show debug data</Label>
                          <p className="text-xs text-muted-foreground">
                            Temporary diagnostics for backend vs payload vs panel state comparison
                          </p>
                        </div>
                        <Switch checked={showDebugData} onCheckedChange={setShowDebugData} />
                      </div>

                      {showDebugData && (
                        <div className="space-y-4">
                          <DebugSection title="Active context">
                            <div className="grid gap-2 text-xs md:grid-cols-2">
                              <DebugKeyValue label="Selected species name" value={debugSnapshot.activeContext.speciesName || activeSpeciesName || '(empty)'} />
                              <DebugKeyValue label="Selected species key" value={debugSnapshot.activeContext.speciesKey || activeSpeciesKey || '(empty)'} />
                              <DebugKeyValue label="Map scope" value={debugSnapshot.activeContext.mapScope || scopeId} />
                              <DebugKeyValue label="Panel build/version marker" value={debugSnapshot.activeContext.panelRuntimeMarker || '(empty)'} />
                              <DebugKeyValue label="Last prediction request time" value={debugSnapshot.activeContext.lastPredictionRequestAt || '(empty)'} />
                              <DebugKeyValue label="Last prediction response time" value={debugSnapshot.activeContext.lastPredictionResponseAt || '(empty)'} />
                              <DebugKeyValue label="Prediction status" value={debugSnapshot.activeContext.predictionStatus} />
                            </div>
                          </DebugSection>

                          <DebugSection title="Last request metadata">
                            <div className="grid gap-2 text-xs md:grid-cols-2">
                              <DebugKeyValue label="Request URL used" value={debugSnapshot.transport.requestUrl || `${getFunctionsBaseUrl()}/species-prediction`} />
                              <DebugKeyValue label="Invocation method" value={debugSnapshot.transport.invocationMethod || '(empty)'} />
                              <DebugKeyValue label="Auth session present" value={debugSnapshot.transport.authSessionPresent ? 'Yes' : 'No'} />
                              <DebugKeyValue label="Anon key present" value={debugSnapshot.transport.anonKeyPresent ? 'Yes' : 'No'} />
                              <DebugKeyValue label="Request timestamp" value={debugSnapshot.transport.requestTimestamp || '(empty)'} />
                              <DebugKeyValue label="Response timestamp" value={debugSnapshot.transport.responseTimestamp || '(empty)'} />
                              <DebugKeyValue label="Request ID" value={debugSnapshot.transport.requestId || '(empty)'} />
                              <DebugKeyValue label="Failed before response object" value={debugSnapshot.transport.failedBeforeResponse ? 'Yes' : 'No'} />
                              <DebugKeyValue label="Last HTTP status" value={String(debugSnapshot.transport.httpStatus ?? '(null)')} />
                              <DebugKeyValue label="Timeout budget (ms)" value={String(debugSnapshot.transport.timeoutMs ?? '(null)')} />
                              <DebugKeyValue label="Client timeout abort" value={debugSnapshot.transport.abortedByClientTimeout ? 'Yes' : 'No'} />
                              <DebugKeyValue label="Likely reached Edge Function" value={debugSnapshot.transport.likelyReachedEdgeFunction ? 'Yes' : 'No'} />
                              <DebugKeyValue label="Error stage" value={debugSnapshot.transport.error?.stage || '(empty)'} />
                              <DebugKeyValue label="Error code" value={debugSnapshot.transport.error?.code || '(empty)'} />
                              <DebugKeyValue label="Error type" value={debugSnapshot.transport.error?.errorType || '(empty)'} />
                              <DebugKeyValue label="Last error message" value={debugSnapshot.transport.error?.message || '(empty)'} />
                              <DebugKeyValue label="Upstream status" value={String(debugSnapshot.transport.error?.upstreamStatus ?? '(null)')} />
                              <DebugKeyValue label="Resolved webhook path" value={debugSnapshot.transport.error?.resolvedWebhookPath || backendStatus.resolvedWebhookPath || '(empty)'} />
                              <DebugKeyValue label="Resolved webhook URL" value={debugSnapshot.transport.error?.resolvedWebhookUrl || backendStatus.resolvedWebhookUrl || '(empty)'} />
                              <DebugKeyValue label="Webhook inactive" value={debugSnapshot.transport.error?.productionWebhookInactive ? 'Yes' : 'No'} />
                            </div>
                          </DebugSection>

                          <DebugSection title="Invocation / Safe Headers">
                            <JsonBox value={debugSnapshot.transport.intendedHeaders} />
                          </DebugSection>

                          <DebugSection
                            title="Last error object"
                            actions={<Button variant="outline" size="sm" onClick={copyLastErrorJson}>Copy last error JSON</Button>}
                          >
                            <JsonBox value={debugSnapshot.transport.error} />
                          </DebugSection>

                          <DebugSection
                            title="Last response body"
                            actions={<Button variant="outline" size="sm" onClick={copyTransportDiagnostics}>Copy transport diagnostics</Button>}
                          >
                            <JsonBox value={debugSnapshot.transport.responseBody} />
                          </DebugSection>

                          <DebugSection title="Backend health check">
                            <JsonBox value={debugSnapshot.transport.healthCheck} />
                            {canSeeDebugDiagnostics && (
                              <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                                <DebugKeyValue label="Configured" value={backendStatus.configured ? 'Yes' : 'No'} />
                                <DebugKeyValue label="Available" value={backendStatus.available ? 'Yes' : 'No'} />
                                <DebugKeyValue label="Runtime probe used" value={backendStatus.runtimeProbeUsed ? 'Yes' : 'No'} />
                                <DebugKeyValue label="Runtime probe method" value={backendStatus.runtimeProbeMethod || '(empty)'} />
                                <DebugKeyValue label="Runtime probe reason" value={backendStatus.runtimeProbeReason || '(empty)'} />
                                <DebugKeyValue label="Status decision reason" value={backendStatus.statusDecisionReason || '(empty)'} />
                                <DebugKeyValue label="Diagnostics mismatch" value={diagnosticWebhookError.detected ? 'Yes' : 'No'} />
                                <DebugKeyValue label="Diagnostics age (ms)" value={String(backendStatus.diagnosticsAgeMs ?? '(null)')} />
                                <DebugKeyValue label="Last invocation status" value={backendStatus.lastInvocationStatus || '(empty)'} />
                                <DebugKeyValue label="Last invocation error stage" value={backendStatus.lastInvocationErrorStage || '(empty)'} />
                                <DebugKeyValue label="Backend build" value={backendStatus.backendBuild || backendStatus.predictionBackendBuild || '(empty)'} />
                              </div>
                            )}
                          </DebugSection>

                          <DebugSection
                            title="Raw backend response"
                            actions={<Button variant="outline" size="sm" onClick={() => copyJson(debugSnapshot.rawBackendResponse, 'Backend JSON')}>Copy backend JSON</Button>}
                          >
                            <JsonBox value={debugSnapshot.rawBackendResponse} />
                          </DebugSection>

                          <DebugSection
                            title="Panel payload"
                            actions={<Button variant="outline" size="sm" onClick={() => copyJson(debugSnapshot.panelPayload, 'Panel payload JSON')}>Copy panel payload JSON</Button>}
                          >
                            <JsonBox value={debugSnapshot.panelPayload} />
                          </DebugSection>

                          <DebugSection
                            title="Final panel state"
                            actions={<Button variant="outline" size="sm" onClick={() => copyJson(debugSnapshot.panelState, 'Panel state JSON')}>Copy panel state JSON</Button>}
                          >
                            <JsonBox value={debugSnapshot.panelState} />
                          </DebugSection>

                          <DebugSection
                            title="Derived comparison summary"
                            actions={<Button variant="outline" size="sm" onClick={copyDiagnosticsSummary}>Copy diagnostics summary</Button>}
                          >
                            <DebugComparisonTable snapshot={debugSnapshot} />
                          </DebugSection>

                          <DebugSection title="Storage / Cache diagnostics">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <div className="mb-1 text-xs font-medium">localStorage</div>
                                <JsonBox value={storageSnapshot.localStorage} />
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-medium">sessionStorage</div>
                                <JsonBox value={storageSnapshot.sessionStorage} />
                              </div>
                            </div>
                            <div>
                              <div className="mb-1 text-xs font-medium">In-memory debug store</div>
                              <JsonBox value={debugSnapshot} />
                            </div>
                          </DebugSection>

                          <div className="grid gap-2 md:grid-cols-2">
                            <Button variant="outline" onClick={runHealthCheck}>Run backend health check</Button>
                            <Button variant="outline" onClick={clearPredictionCache}>Clear prediction cache</Button>
                            <Button variant="outline" onClick={clearPredictionStorage}>Clear species prediction local storage</Button>
                            <Button variant="outline" onClick={forceRerunPrediction}>Run prediction test now</Button>
                            <Button variant="outline" onClick={resyncPanel}>Resync panel from latest backend response</Button>
                          </div>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </>
          ) : null}

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

function DebugSection({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function DebugKeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="break-all font-mono text-xs">{value}</div>
    </div>
  );
}

function JsonBox({ value }: { value: unknown }) {
  return (
    <pre className="max-h-60 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words font-mono">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

function DebugComparisonTable({ snapshot }: { snapshot: SpeciesPredictionDebugSnapshot }) {
  const rows = [
    ['insightSummary', readDebugField(snapshot.rawBackendResponse, ['insightSummary']), readDebugField(snapshot.panelPayload, ['insightSummary']), readDebugField(snapshot.panelState, ['insightSummary'])],
    ['externalPressureScore', readDebugField(snapshot.rawBackendResponse, ['externalPressureScore']), readDebugField(snapshot.panelPayload, ['externalPressureScore']), readDebugField(snapshot.panelState, ['externalPressureScore'])],
    ['sourceHealth.primarySourceUsed', readDebugField(snapshot.rawBackendResponse, ['sourceHealth', 'primarySourceUsed']), readDebugField(snapshot.panelPayload, ['sourceHealth', 'primarySourceUsed']), readDebugField(snapshot.panelState, ['sourceHealth', 'primarySourceUsed'])],
    ['evidenceState', readDebugField(snapshot.rawBackendResponse, ['evidenceState']), readDebugField(snapshot.panelPayload, ['evidenceState']), readDebugField(snapshot.panelState, ['evidenceState'])],
    ['effectiveRankingMode', readDebugField(snapshot.rawBackendResponse, ['effectiveRankingMode']), readDebugField(snapshot.panelPayload, ['effectiveRankingMode']), readDebugField(snapshot.panelState, ['effectiveRankingMode'])],
    ['activeEvidenceSources', readDebugField(snapshot.rawBackendResponse, ['activeEvidenceSources']), readDebugField(snapshot.panelPayload, ['activeEvidenceSources']), readDebugField(snapshot.panelState, ['activeEvidenceSources'])],
    ['attemptedButUnavailable', readDebugField(snapshot.rawBackendResponse, ['attemptedButUnavailable']), readDebugField(snapshot.panelPayload, ['attemptedButUnavailable']), readDebugField(snapshot.panelState, ['attemptedButUnavailable'])],
    ['attemptedButReturnedNoUsableEvidence', readDebugField(snapshot.rawBackendResponse, ['attemptedButReturnedNoUsableEvidence']), readDebugField(snapshot.panelPayload, ['attemptedButReturnedNoUsableEvidence']), readDebugField(snapshot.panelState, ['attemptedButReturnedNoUsableEvidence'])],
    ['foreignEvidence[0].recordCount7d', readDebugField(snapshot.rawBackendResponse, ['foreignEvidence', 0, 'recordCount7d']), readDebugField(snapshot.panelPayload, ['foreignEvidence', 0, 'recordCount7d']), readDebugField(snapshot.panelState, ['foreignEvidence', 0, 'recordCount7d'])],
    ['estoniaEvidence.recentCount7d', readDebugField(snapshot.rawBackendResponse, ['estoniaEvidence', 'recentCount7d']), readDebugField(snapshot.panelPayload, ['estoniaEvidence', 'recentCount7d']), readDebugField(snapshot.panelState, ['estoniaEvidence', 'recentCount7d'])],
    ['countryScores.lithuania', readDebugField(snapshot.rawBackendResponse, ['countryScores', 'lithuania']), readDebugField(snapshot.panelPayload, ['countryScores', 'lithuania']), readDebugField(snapshot.panelState, ['countryScores', 'lithuania'])],
    ['topPredictedPoints[0].reason', readDebugField(snapshot.rawBackendResponse, ['topPredictedPoints', 0, 'reason']), readDebugField(snapshot.panelPayload, ['topPredictedPoints', 0, 'reason']), readDebugField(snapshot.panelState, ['topPredictedPoints', 0, 'reason'])],
    ['topPredictedPoints[0].confidence', readDebugField(snapshot.rawBackendResponse, ['topPredictedPoints', 0, 'confidence']), readDebugField(snapshot.panelPayload, ['topPredictedPoints', 0, 'confidence']), readDebugField(snapshot.panelState, ['topPredictedPoints', 0, 'confidence'])],
    ['analysisVersion', readDebugField(snapshot.rawBackendResponse, ['analysisVersion']), readDebugField(snapshot.panelPayload, ['analysisVersion']), readDebugField(snapshot.panelState, ['analysisVersion'])],
    ['generatedAt', readDebugField(snapshot.rawBackendResponse, ['generatedAt']), readDebugField(snapshot.panelPayload, ['generatedAt']), readDebugField(snapshot.panelState, ['generatedAt'])],
  ] as const;

  return (
    <div className="overflow-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Field</th>
            <th className="p-2 text-left">Backend</th>
            <th className="p-2 text-left">Panel payload</th>
            <th className="p-2 text-left">Final panel state</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, backend, payload, panel]) => (
            <tr key={label} className="border-t border-border">
              <td className="p-2 font-medium">{label}</td>
              <td className="p-2">{formatDebugValue(backend)}</td>
              <td className={`p-2 ${isEqualValue(backend, payload) ? 'text-green-600' : 'text-red-600'}`}>{formatDebugValue(payload)}</td>
              <td className={`p-2 ${isEqualValue(backend, panel) ? 'text-green-600' : 'text-red-600'}`}>{formatDebugValue(panel)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function readDebugField(source: unknown, path: Array<string | number>): unknown {
  let current = source as any;
  for (const key of path) {
    if (current == null) return null;
    current = current[key as any];
  }
  return current ?? null;
}

function isEqualValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function formatDebugValue(value: unknown): string {
  if (value == null) return '(null)';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function buildDiagnosticsSummary(snapshot: SpeciesPredictionDebugSnapshot): string {
  const fields = [
    'insightSummary',
    'externalPressureScore',
    'sourceHealth.primarySourceUsed',
    'evidenceState',
    'effectiveRankingMode',
    'activeEvidenceSources',
    'attemptedButUnavailable',
    'attemptedButReturnedNoUsableEvidence',
    'foreignEvidence[0].recordCount7d',
    'estoniaEvidence.recentCount7d',
    'countryScores.lithuania',
    'topPredictedPoints[0].reason',
    'topPredictedPoints[0].confidence',
    'analysisVersion',
    'generatedAt',
  ];
  const rows = fields.map((field) => {
    const path = field === 'countryScores.lithuania'
      ? ['countryScores', 'lithuania']
      : field === 'sourceHealth.primarySourceUsed'
        ? ['sourceHealth', 'primarySourceUsed']
        : field === 'evidenceState'
          ? ['evidenceState']
          : field === 'effectiveRankingMode'
            ? ['effectiveRankingMode']
            : field === 'activeEvidenceSources'
              ? ['activeEvidenceSources']
              : field === 'attemptedButUnavailable'
                ? ['attemptedButUnavailable']
                : field === 'attemptedButReturnedNoUsableEvidence'
                  ? ['attemptedButReturnedNoUsableEvidence']
        : field === 'foreignEvidence[0].recordCount7d'
          ? ['foreignEvidence', 0, 'recordCount7d']
          : field === 'estoniaEvidence.recentCount7d'
            ? ['estoniaEvidence', 'recentCount7d']
      : field === 'topPredictedPoints[0].reason'
        ? ['topPredictedPoints', 0, 'reason']
        : field === 'topPredictedPoints[0].confidence'
          ? ['topPredictedPoints', 0, 'confidence']
          : [field];
    return [
      field,
      formatDebugValue(readDebugField(snapshot.rawBackendResponse, path)),
      formatDebugValue(readDebugField(snapshot.panelPayload, path)),
      formatDebugValue(readDebugField(snapshot.panelState, path)),
    ].join(' | ');
  });

  return [
    `species=${snapshot.activeContext.speciesName || '(empty)'}`,
    `speciesKey=${snapshot.activeContext.speciesKey || '(empty)'}`,
    `scope=${snapshot.activeContext.mapScope || '(empty)'}`,
    `status=${snapshot.activeContext.predictionStatus}`,
    `requestUrl=${snapshot.transport.requestUrl || '(empty)'}`,
    `invocationMethod=${snapshot.transport.invocationMethod || '(empty)'}`,
    `authSessionPresent=${snapshot.transport.authSessionPresent ? 'yes' : 'no'}`,
    `anonKeyPresent=${snapshot.transport.anonKeyPresent ? 'yes' : 'no'}`,
    `requestId=${snapshot.transport.requestId || '(empty)'}`,
    `failedBeforeResponse=${snapshot.transport.failedBeforeResponse ? 'yes' : 'no'}`,
    `httpStatus=${snapshot.transport.httpStatus ?? '(null)'}`,
    `timeoutMs=${snapshot.transport.timeoutMs ?? '(null)'}`,
    `abortedByClientTimeout=${snapshot.transport.abortedByClientTimeout ? 'yes' : 'no'}`,
    `likelyReachedEdgeFunction=${snapshot.transport.likelyReachedEdgeFunction ? 'yes' : 'no'}`,
    `errorStage=${snapshot.transport.error?.stage || '(empty)'}`,
    `errorCode=${snapshot.transport.error?.code || '(empty)'}`,
    `errorType=${snapshot.transport.error?.errorType || '(empty)'}`,
    `errorMessage=${snapshot.transport.error?.message || '(empty)'}`,
    `upstreamStatus=${snapshot.transport.error?.upstreamStatus ?? '(null)'}`,
    `resolvedWebhookPath=${snapshot.transport.error?.resolvedWebhookPath || '(empty)'}`,
    `resolvedWebhookUrl=${snapshot.transport.error?.resolvedWebhookUrl || '(empty)'}`,
    `productionWebhookInactive=${snapshot.transport.error?.productionWebhookInactive ? 'yes' : 'no'}`,
    ...rows,
  ].join('\n');
}

type SpeciesPredictionBackendStatus = {
  ok: boolean;
  configured: boolean;
  webhookConfigured: boolean;
  webhookValid: boolean;
  available: boolean;
  runtimeAvailable: boolean | null;
  deployed: boolean;
  statusCode: 'NOT_CONFIGURED' | 'DEPLOYED_NOT_CONFIGURED' | 'CONFIGURED_AVAILABLE' | 'CONFIGURED_UNAVAILABLE' | 'RUNTIME_ERROR';
  reasonCode: string | null;
  predictionBackendBuild?: string;
  backendBuild?: string;
  runtimeReachable?: boolean | null;
  runtimeProbeUsed?: boolean;
  runtimeProbeMethod?: string;
  runtimeProbeReason?: string;
  lastInvocationStatus?: string;
  lastInvocationAt?: string;
  lastInvocationErrorStage?: string;
  lastInvocationMessage?: string;
  diagnosticsAgeMs?: number | null;
  statusDecisionReason?: string;
  envVarName?: string;
  envPresent?: boolean;
  envLength?: number;
  rawWebhookPreview?: string;
  parsedUrlOk?: boolean;
  configuredPathname?: string;
  normalizedConfiguredPath?: string;
  expectedPath?: string;
  fallbackUsed?: boolean;
  fallbackValue?: string;
  missingWebhookEnv?: boolean;
  invalidWebhookUrl?: boolean;
  expectedWebhookPath?: string;
  configuredWebhookPath?: string;
  configuredWebhookUrlPreview?: string;
  hasOutdatedWebhook?: boolean;
  configSource?: string;
  resolvedWebhookUrl?: string;
  resolvedWebhookPath?: string;
  expectedMethod?: string;
  healthcheckUrl?: string;
  environmentName?: string;
  webhookPathMatchesRegistration?: boolean;
  productionWebhookReachable?: boolean | null;
  productionWebhookInactive?: boolean;
  upstreamStatus?: number | null;
  upstreamStatusText?: string;
  upstreamMessage?: string;
  responseSnippet?: string;
  lastSuccessfulHealthCheckAt?: string;
  lastFailedHealthCheckAt?: string;
  validationErrorCode?: string | null;
  validationMessage?: string;
  message: string;
};

type SpeciesPredictionDisplayState =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_AVAILABLE'
  | 'CONFIGURED_UNAVAILABLE';

type SpeciesPredictionStatusCardModel = {
  badge: 'Configured' | 'Unavailable' | 'Missing config';
  primaryText: string;
  helperText: string;
};

async function fetchSpeciesPredictionBackendStatus(): Promise<SpeciesPredictionBackendStatus> {
  let response: Response;
  try {
    response = await fetch(`${getFunctionsBaseUrl()}/species-prediction?mode=status&verify=1&_ts=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
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
    setSpeciesPredictionHealthCheckResult({
      ok: false,
      status: response.status,
      statusText: response.statusText,
      body: data,
      timestamp: new Date().toISOString(),
    });
    throw new Error(message);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Prediction backend is not configured yet');
  }

  const status = safeRecord(data) as Partial<SpeciesPredictionBackendStatus>;
  setSpeciesPredictionHealthCheckResult({
    ok: true,
    status: response.status,
    statusText: response.statusText,
    body: data,
    timestamp: new Date().toISOString(),
  });
  return {
    ok: status.ok === true,
    configured: status.configured === true,
    webhookConfigured: status.webhookConfigured === true,
    webhookValid: status.webhookValid === true,
    available: status.available === true,
    runtimeAvailable: typeof status.runtimeAvailable === 'boolean' ? status.runtimeAvailable : null,
    deployed: status.deployed === true,
    statusCode: isBackendStatusCode(status.statusCode) ? status.statusCode : 'NOT_CONFIGURED',
    reasonCode: safeString(status.reasonCode) || null,
    predictionBackendBuild: safeString(status.predictionBackendBuild),
    backendBuild: safeString(status.backendBuild),
    runtimeReachable: typeof status.runtimeReachable === 'boolean' ? status.runtimeReachable : null,
    runtimeProbeUsed: status.runtimeProbeUsed === true,
    runtimeProbeMethod: safeString(status.runtimeProbeMethod),
    runtimeProbeReason: safeString(status.runtimeProbeReason),
    lastInvocationStatus: safeString(status.lastInvocationStatus),
    lastInvocationAt: safeString(status.lastInvocationAt),
    lastInvocationErrorStage: safeString(status.lastInvocationErrorStage),
    lastInvocationMessage: safeString(status.lastInvocationMessage),
    diagnosticsAgeMs: typeof status.diagnosticsAgeMs === 'number' ? status.diagnosticsAgeMs : null,
    statusDecisionReason: safeString(status.statusDecisionReason),
    envVarName: safeString(status.envVarName),
    envPresent: status.envPresent === true,
    envLength: typeof status.envLength === 'number' ? status.envLength : 0,
    rawWebhookPreview: safeString(status.rawWebhookPreview),
    parsedUrlOk: status.parsedUrlOk === true,
    configuredPathname: safeString(status.configuredPathname),
    normalizedConfiguredPath: safeString(status.normalizedConfiguredPath),
    expectedPath: safeString(status.expectedPath),
    fallbackUsed: status.fallbackUsed === true,
    fallbackValue: safeString(status.fallbackValue),
    missingWebhookEnv: status.missingWebhookEnv === true,
    invalidWebhookUrl: status.invalidWebhookUrl === true,
    expectedWebhookPath: safeString(status.expectedWebhookPath),
    configuredWebhookPath: safeString(status.configuredWebhookPath),
    configuredWebhookUrlPreview: safeString(status.configuredWebhookUrlPreview),
    hasOutdatedWebhook: status.hasOutdatedWebhook === true,
    configSource: safeString(status.configSource),
    resolvedWebhookUrl: safeString(status.resolvedWebhookUrl),
    resolvedWebhookPath: safeString(status.resolvedWebhookPath),
    expectedMethod: safeString(status.expectedMethod),
    healthcheckUrl: safeString(status.healthcheckUrl),
    environmentName: safeString(status.environmentName),
    webhookPathMatchesRegistration: typeof status.webhookPathMatchesRegistration === 'boolean' ? status.webhookPathMatchesRegistration : undefined,
    productionWebhookReachable: typeof status.productionWebhookReachable === 'boolean' ? status.productionWebhookReachable : null,
    productionWebhookInactive: status.productionWebhookInactive === true,
    upstreamStatus: typeof status.upstreamStatus === 'number' ? status.upstreamStatus : null,
    upstreamStatusText: safeString(status.upstreamStatusText),
    upstreamMessage: safeString(status.upstreamMessage),
    responseSnippet: safeString(status.responseSnippet),
    lastSuccessfulHealthCheckAt: safeString(status.lastSuccessfulHealthCheckAt),
    lastFailedHealthCheckAt: safeString(status.lastFailedHealthCheckAt),
    validationErrorCode: safeString(status.validationErrorCode) || null,
    validationMessage: safeString(status.validationMessage),
    message: safeString(status.message) || 'Prediction backend is not configured yet',
  };
}

function isBackendStatusCode(value: unknown): value is SpeciesPredictionBackendStatus['statusCode'] {
  return value === 'NOT_CONFIGURED'
    || value === 'DEPLOYED_NOT_CONFIGURED'
    || value === 'CONFIGURED_AVAILABLE'
    || value === 'CONFIGURED_UNAVAILABLE'
    || value === 'RUNTIME_ERROR';
}

export function normalizeBackendStatus(status: SpeciesPredictionBackendStatus) {
  const hasRuntimeReachableSignal = typeof status.runtimeReachable === 'boolean';
  const hasRuntimeAvailabilitySignal = typeof status.runtimeAvailable === 'boolean';
  const hasExplicitInvocationFailureSignal = Boolean(
    safeString(status.lastInvocationStatus)
    || safeString(status.lastInvocationAt)
    || safeString(status.lastInvocationErrorStage)
    || safeString(status.lastInvocationMessage)
    || safeString(status.upstreamMessage)
    || typeof status.upstreamStatus === 'number'
    || (hasRuntimeReachableSignal && status.runtimeReachable === false)
    || (hasRuntimeAvailabilitySignal && status.runtimeAvailable === false),
  );
  return {
    isConfigured: status.configured === true && status.missingWebhookEnv !== true,
    isDeployed: status.deployed === true,
    isHealthy: status.available === true || status.statusCode === 'CONFIGURED_AVAILABLE',
    isRuntimeAvailable: status.runtimeAvailable === true,
    statusDecisionReason: safeString(status.statusDecisionReason),
    diagnosticsAgeMs: status.diagnosticsAgeMs ?? null,
    hasFreshInvocationFailure: safeString(status.statusDecisionReason) === 'recent_real_invocation_failure' && hasExplicitInvocationFailureSignal,
    hasExplicitInvocationFailureSignal,
    lastRuntimeErrorCode: status.reasonCode,
    lastRuntimeErrorMessage: safeString(status.lastInvocationMessage) || safeString(status.upstreamMessage) || safeString(status.message),
    statusCode: status.statusCode,
    reasonCode: status.reasonCode,
    missingWebhookEnv: status.missingWebhookEnv === true,
    invalidWebhookUrl: status.invalidWebhookUrl === true,
    hasOutdatedWebhookPathError: status.hasOutdatedWebhook === true,
    backend: status,
  };
}

type DiagnosticWebhookDetection = {
  detected: boolean;
  stage: string;
  code: number | string | null;
  message: string;
  matchedReason: string;
};

type RecoveryDebugState = {
  rawTopLevelCode: string;
  summarySourcePath: string;
  insightSummaryRecovered: boolean;
  normalizedPredictionShape: string;
};

export function buildRecoveryDebugState(rawResponse: unknown): RecoveryDebugState {
  const record = safeRecord(rawResponse);
  if (!Object.keys(record).length) {
    return {
      rawTopLevelCode: '',
      summarySourcePath: '',
      insightSummaryRecovered: false,
      normalizedPredictionShape: '',
    };
  }
  const recovered = extractUsablePayloadFromErrorEnvelope(record);
  return {
    rawTopLevelCode: safeString(record.code),
    summarySourcePath: safeString(recovered?.summarySourcePath),
    insightSummaryRecovered: safeString(recovered?.insightSummary).length > 0,
    normalizedPredictionShape: safeString(recovered?.normalizedPredictionShape),
  };
}

function detectOutdatedWebhookFromDiagnostics(snapshot: SpeciesPredictionDebugSnapshot): DiagnosticWebhookDetection {
  const none: DiagnosticWebhookDetection = { detected: false, stage: '', code: null, message: '', matchedReason: '' };

  // Collect all candidate objects from snapshot
  const transport = snapshot.transport;
  const transportError = transport?.error;

  // Gather all searchable strings and codes from deeply nested paths
  const candidates: Array<{ stage?: string; code?: number | string | null; message?: string; source: string }> = [];

  function extractFromObj(obj: unknown, source: string) {
    const r = safeRecord(obj);
    if (!Object.keys(r).length) return;
    const msg = safeString(r.message);
    const hint = safeString(r.hint);
    const stage = safeString(r.stage);
    const code = typeof r.code === 'number' ? r.code : (typeof r.status === 'number' ? r.status : null);
    if (msg || hint || stage || code != null) {
      candidates.push({ stage, code, message: msg || hint, source });
    }
    // Recurse into known nested keys
    for (const key of ['body', 'responseBody', 'error', 'json', 'context']) {
      const nested = safeRecord(r[key]);
      if (Object.keys(nested).length) extractFromObj(nested, `${source}.${key}`);
    }
  }

  if (transportError) extractFromObj(transportError, 'transportError');
  if (transport?.responseBody) extractFromObj(transport.responseBody, 'responseBody');

  // Also check the stored result from last prediction
  const lastResponse = snapshot.rawBackendResponse;
  if (lastResponse) extractFromObj(lastResponse, 'lastBackendResponse');

  // Check each candidate for outdated webhook signature
  for (const c of candidates) {
    const lower = (c.message || '').toLowerCase();
    const is404 = c.code === 404;
    const hasNotRegistered = lower.includes('not registered');
    const hasSpeciesPrediction = lower.includes('species-prediction');
    const hasWebhookMention = lower.includes('webhook');
    const isGetMethodMismatch = lower.includes('not registered for get requests')
      || lower.includes('did you mean to make a post request');

    if (isGetMethodMismatch) {
      continue;
    }

    if (hasNotRegistered && (hasSpeciesPrediction || hasWebhookMention)) {
      return { detected: true, stage: c.stage || '', code: c.code, message: c.message || '', matchedReason: `message contains "not registered" + webhook ref (${c.source})` };
    }
    if (is404 && (hasSpeciesPrediction || hasNotRegistered)) {
      return { detected: true, stage: c.stage || '', code: c.code, message: c.message || '', matchedReason: `code=404 + species-prediction/not-registered (${c.source})` };
    }
    if (c.stage === 'n8n_upstream' && is404) {
      return { detected: true, stage: c.stage, code: c.code, message: c.message || '', matchedReason: `stage=n8n_upstream + code=404 (${c.source})` };
    }
  }

  return none;
}

export function deriveSpeciesPredictionDisplayState(
  status: ReturnType<typeof normalizeBackendStatus>,
): SpeciesPredictionDisplayState {
  if (status.missingWebhookEnv === true || !status.isConfigured) return 'NOT_CONFIGURED';
  if (status.statusCode === 'CONFIGURED_UNAVAILABLE' as string) return 'CONFIGURED_UNAVAILABLE';
  if (
    status.statusDecisionReason === 'configured_valid_no_runtime_probe'
    || status.statusDecisionReason === 'live_probe_success'
    || status.statusCode === 'CONFIGURED_AVAILABLE'
  ) return 'CONFIGURED_AVAILABLE';
  if (
    status.isDeployed
    && (status.isConfigured || status.invalidWebhookUrl === true)
    && (
      status.invalidWebhookUrl === true
      || status.hasOutdatedWebhookPathError === true
      || status.hasFreshInvocationFailure === true
      || ((status.statusCode as string) === 'CONFIGURED_UNAVAILABLE' && status.hasExplicitInvocationFailureSignal === true)
      || ((status.statusCode as string) === 'RUNTIME_ERROR' && status.hasExplicitInvocationFailureSignal === true)
      || (status.isHealthy !== true && status.statusDecisionReason === 'recent_real_invocation_failure' && status.hasExplicitInvocationFailureSignal === true)
    )
  ) {
    return 'CONFIGURED_UNAVAILABLE';
  }
  return 'CONFIGURED_AVAILABLE';
}

export function buildSpeciesPredictionStatusCard(
  displayState: SpeciesPredictionDisplayState,
  status: ReturnType<typeof normalizeBackendStatus>,
): SpeciesPredictionStatusCardModel {
  if (displayState === 'CONFIGURED_AVAILABLE') {
    return {
      badge: 'Configured',
      primaryText: 'Prediction backend is configured and available',
      helperText: status.statusDecisionReason === 'configured_valid_no_runtime_probe'
        ? 'The species prediction backend is configured. No dedicated runtime probe is required for the POST webhook.'
        : 'The species prediction backend is configured and ready for use.',
    };
  }
  if (displayState === 'CONFIGURED_UNAVAILABLE') {
    const helperText = status.invalidWebhookUrl === true
      ? 'The Supabase webhook URL is invalid. Check the backend config debug values below.'
      : status.hasOutdatedWebhookPathError === true
        ? 'The Supabase prediction function is still pointing to an outdated n8n webhook path.'
        : (status.backend.lastInvocationMessage || 'The latest real prediction invocation failed. Check the backend diagnostics below.');
    return {
      badge: 'Unavailable',
      primaryText: 'Prediction backend is configured but currently unavailable',
      helperText,
    };
  }
  return {
    badge: 'Missing config',
    primaryText: 'Prediction backend is not configured yet',
    helperText: 'Add the webhook secret in Supabase and redeploy the Edge Function.',
  };
}

function TestPredictionBackendButton({ onResult }: { onResult: (data: SpeciesPredictionBackendStatus) => void }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: number | null; snippet: string; available: boolean | null } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await fetchSpeciesPredictionBackendStatus();
      onResult(data);
      setTestResult({
        status: data.upstreamStatus ?? null,
        snippet: data.responseSnippet || data.message || '',
        available: data.available,
      });
    } catch (err: unknown) {
      setTestResult({
        status: null,
        snippet: err instanceof Error ? err.message : 'Test failed',
        available: false,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <Button variant="outline" size="sm" onClick={runTest} disabled={testing} className="text-xs">
        {testing ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Testing...</> : 'Test prediction backend now'}
      </Button>
      {testResult && (
        <div className="rounded border border-border bg-muted/30 p-2 text-[10px] font-mono space-y-0.5">
          <p>available: <span className={testResult.available ? 'text-green-600' : 'text-red-500'}>{String(testResult.available)}</span></p>
          {testResult.status != null && <p>httpStatus: {testResult.status}</p>}
          <p>response: {testResult.snippet.slice(0, 200) || '\u2013'}</p>
        </div>
      )}
    </div>
  );
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

function RawPredictionDebug({ speciesKey, scopeId }: { speciesKey: string; scopeId: string }) {
  const [dbRaw, setDbRaw] = useState<string | null>(null);
  const [edgeRaw, setEdgeRaw] = useState<string | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [edgeLoading, setEdgeLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [keyFields, setKeyFields] = useState<Record<string, unknown> | null>(null);

  const effectiveKey = speciesKey || 'Punanokk-vart';

  const loadDb = useCallback(async () => {
    setDbLoading(true);
    setKeyFields(null);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase
        .from('prediction_jobs')
        .select('*')
        .eq('species_key', effectiveKey)
        .eq('scope', scopeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setDbRaw('(no row found)');
        return;
      }
      setDbRaw(JSON.stringify(data, null, 2));
      // Extract key fields for summary
      const rj = (data as Record<string, unknown>).result_json as Record<string, unknown> | null;
      setKeyFields({
        status: (data as Record<string, unknown>).status ?? '–',
        updated_at: (data as Record<string, unknown>).updated_at ?? '–',
        analysis_version: (data as Record<string, unknown>).analysis_version ?? '–',
        'result_json.summaryOrigin': rj?.summaryOrigin ?? '–',
        'result_json.payloadSourceState': rj?.payloadSourceState ?? '–',
        'result_json.backendBuild': rj?.backendBuild ?? '–',
        'result_json.countryScores': rj?.countryScores ? JSON.stringify(rj.countryScores) : '–',
        'result_json.predictedTargets count': Array.isArray(rj?.predictedTargets) ? (rj.predictedTargets as unknown[]).length : '–',
        'result_json.globalMigrationEtas count': Array.isArray(rj?.globalMigrationEtas) ? (rj.globalMigrationEtas as unknown[]).length : '–',
      });
    } catch (err: unknown) {
      setDbRaw(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDbLoading(false);
    }
  }, [effectiveKey, scopeId]);

  const loadEdge = useCallback(async () => {
    setEdgeLoading(true);
    try {
      const baseUrl = getFunctionsBaseUrl();
      const headers = await getSupabaseAuthHeaders();
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: job } = await supabase
        .from('prediction_jobs')
        .select('request_id')
        .eq('species_key', effectiveKey)
        .eq('scope', scopeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!job?.request_id) { setEdgeRaw('(no prediction job found for this species)'); return; }
      const url = `${baseUrl}/species-prediction?mode=poll&requestId=${encodeURIComponent(job.request_id)}`;
      const resp = await fetch(url, { method: 'GET', headers });
      const text = await resp.text();
      try {
        setEdgeRaw(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setEdgeRaw(text);
      }
    } catch (err: unknown) {
      setEdgeRaw(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEdgeLoading(false);
    }
  }, [effectiveKey, scopeId]);

  const deleteCached = useCallback(async () => {
    if (!confirm(`Delete all cached prediction_jobs rows for "${effectiveKey}"?`)) return;
    setDeleting(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase
        .from('prediction_jobs')
        .delete()
        .eq('species_key', effectiveKey);
      if (error) throw error;
      toast.success(`Deleted cached results for ${effectiveKey}`);
      setDbRaw(null);
      setEdgeRaw(null);
      setKeyFields(null);
    } catch (err: unknown) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  }, [effectiveKey]);

  return (
    <div className="rounded border border-border bg-muted/20 p-3 space-y-3">
      <p className="font-semibold text-foreground text-xs">Raw DB prediction debug</p>
      <p className="text-[10px] text-muted-foreground font-mono">species_key: {effectiveKey} | scope: {scopeId}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={loadDb} disabled={dbLoading}>
          {dbLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Load raw DB result
        </Button>
        <Button variant="outline" size="sm" onClick={loadEdge} disabled={edgeLoading}>
          {edgeLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Load via edge function
        </Button>
        <Button variant="destructive" size="sm" onClick={deleteCached} disabled={deleting}>
          {deleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Delete cached result
        </Button>
      </div>

      {keyFields && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-foreground">Key fields summary</p>
          <table className="text-[10px] font-mono w-full border-collapse">
            <tbody>
              {Object.entries(keyFields).map(([k, v]) => (
                <tr key={k} className="border-b border-border/50">
                  <td className="py-0.5 pr-2 text-muted-foreground whitespace-nowrap">{k}</td>
                  <td className="py-0.5 text-foreground break-all">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(dbRaw || edgeRaw) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {dbRaw != null && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-foreground">DB RAW</p>
              <pre className="text-[9px] font-mono bg-background border border-border rounded p-2 max-h-[400px] overflow-auto whitespace-pre-wrap break-all">
                {dbRaw}
              </pre>
            </div>
          )}
          {edgeRaw != null && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-foreground">EDGE FUNCTION RESPONSE</p>
              <pre className="text-[9px] font-mono bg-background border border-border rounded p-2 max-h-[400px] overflow-auto whitespace-pre-wrap break-all">
                {edgeRaw}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}