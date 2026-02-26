import { useState, useEffect } from 'react';
import { loadSettings, saveSettings, NEWS_AUTO_TRANSLATE_ET_KEY, type AppSettings } from '@/lib/settings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { clearAppCaches, fullReset, doSoftReload, doHardReload, type ResetReport } from '@/lib/cache-reset';
import { APP_VERSION } from '@/lib/version';
import { Trash2, RotateCcw } from 'lucide-react';
import AvatarManager from './AvatarManager';
import DeveloperSettings from './DeveloperSettings';
import NewsSourcesSettings from './NewsSourcesSettings';
import { refreshSpeciesMetaFromCloud } from '@/lib/speciesMetaCloud';
import {
  getEnvEndpoint,
  getStoredEndpoint,
  resolveBaseEndpoint,
  resolveEndpoint,
  resolveHealthUrl,
  setStoredEndpoint,
  TRANSLATION_ENDPOINT_UPDATED_EVENT,
  WORKER_DEFAULT_ENDPOINT,
} from '@/config/translationEndpoint';
import { isNativePlatform, postJson } from '@/lib/httpClient';
import {
  FALLBACK_PROXY_BASE,
  getEnvProxyBase,
  getProxyMode,
  getStoredProxyBase,
  PROXY_ENDPOINT_UPDATED_EVENT,
  resolveProxyBase,
  setStoredProxyBase,
} from '@/config/proxyEndpoint';
import { isAdmin } from '@/services/profile';
import AdminEventsScreen from '@/screens/AdminEventsScreen';
import CreateEventScreen from '@/screens/CreateEventScreen';
import MapPickerScreen from '@/screens/MapPickerScreen';
import type { EventRow } from '@/types/events';
import { getSupabaseInitError } from '@/config/supabaseClient';

type ResetMode = 'soft' | 'hard' | null;

export default function SettingsTab() {
  const [adminMode, setAdminMode] = useState<'settings' | 'admin-events' | 'create-event' | 'map-picker'>('settings');
  const [adminReady, setAdminReady] = useState(false);
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapPickerInitial, setMapPickerInitial] = useState<{ lat: number | null; lng: number | null } | null>(null);
  const [form, setForm] = useState<AppSettings>(loadSettings);
  const [confirmMode, setConfirmMode] = useState<ResetMode>(null);
  const [resetting, setResetting] = useState(false);
  const [testTranslateLoading, setTestTranslateLoading] = useState(false);
  const [testTranslateResult, setTestTranslateResult] = useState('');
  const [translationApiUrl, setTranslationApiUrlInput] = useState('');
  const [storedEndpointView, setStoredEndpointView] = useState('');
  const [proxyBaseUrl, setProxyBaseUrl] = useState('');
  const [storedProxyBaseView, setStoredProxyBaseView] = useState('');
  const envEndpoint = getEnvEndpoint();
  const resolvedEndpoint = resolveEndpoint(translationApiUrl);
  const envProxyBase = getEnvProxyBase();
  const resolvedProxyBase = resolveProxyBase(proxyBaseUrl);
  const proxyMode = getProxyMode(resolvedProxyBase);
  const supabaseInitError = getSupabaseInitError();

  useEffect(() => {
    setForm(loadSettings());
    const initialStored = getStoredEndpoint();
    setStoredEndpointView(initialStored);
    setTranslationApiUrlInput(initialStored || getEnvEndpoint());
    const initialProxyStored = getStoredProxyBase();
    setStoredProxyBaseView(initialProxyStored);
    setProxyBaseUrl(initialProxyStored || getEnvProxyBase());
    refreshSpeciesMetaFromCloud({ force: true }).catch(() => {});
  }, []);

  useEffect(() => {
    isAdmin()
      .then((value) => setAdminAllowed(value))
      .finally(() => setAdminReady(true));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshSpeciesMetaFromCloud().catch(() => {});
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const refreshStored = () => setStoredEndpointView(getStoredEndpoint());
    window.addEventListener('storage', refreshStored);
    window.addEventListener(TRANSLATION_ENDPOINT_UPDATED_EVENT, refreshStored);
    return () => {
      window.removeEventListener('storage', refreshStored);
      window.removeEventListener(TRANSLATION_ENDPOINT_UPDATED_EVENT, refreshStored);
    };
  }, []);

  useEffect(() => {
    const refreshStored = () => setStoredProxyBaseView(getStoredProxyBase());
    window.addEventListener('storage', refreshStored);
    window.addEventListener(PROXY_ENDPOINT_UPDATED_EVENT, refreshStored);
    return () => {
      window.removeEventListener('storage', refreshStored);
      window.removeEventListener(PROXY_ENDPOINT_UPDATED_EVENT, refreshStored);
    };
  }, []);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setStoredEndpoint(translationApiUrl);
    setStoredEndpointView(getStoredEndpoint());
    setStoredProxyBase(proxyBaseUrl);
    setStoredProxyBaseView(getStoredProxyBase());
    saveSettings(form);
    toast.success('Translation endpoint saved');
    toast.success('Proxy base saved');
    toast.success('Seaded salvestatud');
  };

  const handleAutoTranslateToggle = (checked: boolean) => {
    const next = { ...form, autoTranslateToEstonian: checked };
    setStoredEndpoint(translationApiUrl);
    setStoredEndpointView(getStoredEndpoint());
    setForm(next);
    saveSettings(next);
    localStorage.setItem(NEWS_AUTO_TRANSLATE_ET_KEY, checked ? '1' : '0');
    toast.success(checked
      ? 'Automaatne tõlkimine sisse lülitatud'
      : 'Automaatne tõlkimine välja lülitatud');
  };

  const handleTestTranslate = async () => {
    setTestTranslateLoading(true);
    setTestTranslateResult('');
    const baseEndpoint = resolveBaseEndpoint(translationApiUrl);
    const endpoint = resolveEndpoint(translationApiUrl);
    if (import.meta.env.DEV) {
      const health = resolveHealthUrl(endpoint);
      console.info('[translate] native=', isNativePlatform(), 'health=', health, 'translate=', endpoint);
    }
    try {
      const healthUrl = resolveHealthUrl(endpoint);
      try {
        const healthRes = await fetch(healthUrl, { method: 'GET' });
        if (!healthRes.ok) {
          const preview = (await healthRes.text()).slice(0, 120).replace(/\s+/g, ' ');
          throw new Error(`status=${healthRes.status} ${preview || '[empty body]'}`);
        }
      } catch (error: any) {
        throw new Error(`Translation backend blocked or unreachable. Open this URL in browser: ${healthUrl}`);
      }

      const payload = {
        id: 'dev-test-pl',
        title: 'Jedna z dwóch mew wróciła na zbiornik',
        body: 'Powróciła dziś rano. Szczegóły: https://example.com #ptaki',
      };
      const translateRes = await postJson(endpoint, payload);
      if (translateRes.status !== 200) {
        const preview = String(translateRes.rawText || JSON.stringify(translateRes.data) || '').slice(0, 120).replace(/\s+/g, ' ');
        throw new Error(`status=${translateRes.status}. endpoint=${endpoint}. ${preview || '[empty body]'}`);
      }
      const result = (translateRes.data || {}) as { title_et?: unknown; body_et?: unknown; error?: unknown };
      if (typeof result.title_et !== 'string' || typeof result.body_et !== 'string') {
        throw new Error(`Invalid JSON payload from ${endpoint}`);
      }
      setTestTranslateResult(JSON.stringify(result, null, 2));
      toast.success(`Translation OK: ${(result.title_et || '').slice(0, 80)} (${baseEndpoint})`);
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      setTestTranslateResult(`REQUEST FAILED\n${message}`);
      toast.error(`Test failed. ${message}`);
    } finally {
      setTestTranslateLoading(false);
    }
  };

  const handleSaveTranslateEndpoint = () => {
    setStoredEndpoint(translationApiUrl);
    const saved = getStoredEndpoint();
    setStoredEndpointView(saved);
    setTranslationApiUrlInput(saved || getEnvEndpoint());
    toast.success('Translation endpoint saved');
  };

  const handleUseWorkerDefault = () => {
    setStoredEndpoint(WORKER_DEFAULT_ENDPOINT);
    const saved = getStoredEndpoint();
    setStoredEndpointView(saved);
    setTranslationApiUrlInput(saved);
    toast.success('Translation endpoint saved');
  };

  const handleSaveProxyBase = () => {
    setStoredProxyBase(proxyBaseUrl);
    const saved = getStoredProxyBase();
    setStoredProxyBaseView(saved);
    setProxyBaseUrl(saved || getEnvProxyBase());
    toast.success('Proxy base saved');
  };

  const handleUseProxyFallback = () => {
    setStoredProxyBase(FALLBACK_PROXY_BASE);
    const saved = getStoredProxyBase();
    setStoredProxyBaseView(saved);
    setProxyBaseUrl(saved);
    toast.success('Proxy base saved');
  };

  const showReport = (report: ResetReport) => {
    if (report.errors.length > 0) {
      toast.warning('Osaline tuhjendus', {
        description: report.errors.join('; '),
        duration: 4000,
      });
    } else {
      toast.success('Vahemalu tuhjendatud. Laen uuesti...');
    }
  };

  const handleReset = async () => {
    const mode = confirmMode;
    setConfirmMode(null);
    if (!mode) return;
    setResetting(true);
    try {
      const report = mode === 'soft' ? await clearAppCaches() : await fullReset();
      showReport(report);
      await new Promise((r) => setTimeout(r, 800));
      if (mode === 'soft') doSoftReload(); else doHardReload();
    } catch {
      toast.error('Tuhjendamine ebaonnestus');
      setResetting(false);
    }
  };

  if (adminMode === 'admin-events') {
    return (
      <AdminEventsScreen
        onBack={() => setAdminMode('settings')}
        onCreate={() => {
          setEditingEvent(null);
          setPickedCoords(null);
          setAdminMode('create-event');
        }}
        onEdit={(event) => {
          setEditingEvent(event);
          setPickedCoords(null);
          setAdminMode('create-event');
        }}
      />
    );
  }

  if (adminMode === 'create-event') {
    return (
      <CreateEventScreen
        initialEvent={editingEvent}
        pickedCoords={pickedCoords}
        onBack={() => setAdminMode('admin-events')}
        onSaved={() => setAdminMode('admin-events')}
        onOpenMapPicker={(coords) => {
          setMapPickerInitial(coords);
          setAdminMode('map-picker');
        }}
      />
    );
  }

  if (adminMode === 'map-picker') {
    return (
      <MapPickerScreen
        initialLat={mapPickerInitial?.lat}
        initialLng={mapPickerInitial?.lng}
        onBack={() => setAdminMode('create-event')}
        onConfirm={(coords) => {
          setPickedCoords(coords);
          setAdminMode('create-event');
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h2 className="font-semibold text-foreground">Seaded</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-6">
        {supabaseInitError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Supabase seadistus puudub: {supabaseInitError}
          </div>
        )}
        <NewsSourcesSettings />

        <div className="space-y-2">
          <Label htmlFor="translateApiUrl">Translation API URL</Label>
          <Input
            id="translateApiUrl"
            placeholder="https://<backend-domain>/translate-et"
            value={translationApiUrl}
            onChange={(e) => setTranslationApiUrlInput(e.target.value)}
          />
          <Button variant="outline" onClick={handleSaveTranslateEndpoint} className="w-full">
            Save translation endpoint
          </Button>
          <Button variant="outline" onClick={handleUseWorkerDefault} className="w-full">
            Clear translation endpoint
          </Button>
          <p className="text-xs text-muted-foreground">
            Use your translation backend base URL (query params supported).
          </p>
          <p className="text-xs text-muted-foreground">
            Resolved endpoint: {resolvedEndpoint || '(empty)'}
          </p>
          <p className="text-xs text-muted-foreground">
            Stored endpoint: {storedEndpointView || '(empty)'}
          </p>
          <p className="text-xs text-muted-foreground">
            Env endpoint: {envEndpoint || '(empty)'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="proxyBaseUrl">Proxy Base URL</Label>
          <Input
            id="proxyBaseUrl"
            placeholder="https://<project-ref>.supabase.co/functions/v1/proxy?url="
            value={proxyBaseUrl}
            onChange={(e) => setProxyBaseUrl(e.target.value)}
          />
          <Button variant="outline" onClick={handleSaveProxyBase} className="w-full">
            Save proxy base
          </Button>
          <Button variant="outline" onClick={handleUseProxyFallback} className="w-full">
            Use fallback proxy
          </Button>
          <p className="text-xs text-muted-foreground">
            Active proxy: {proxyMode}
          </p>
          <p className="text-xs text-muted-foreground">
            Resolved proxy base: {resolvedProxyBase || '(empty)'}
          </p>
          <p className="text-xs text-muted-foreground">
            Stored proxy base: {storedProxyBaseView || '(empty)'}
          </p>
          <p className="text-xs text-muted-foreground">
            Env proxy base: {envProxyBase || '(empty)'}
          </p>
          <p className="text-xs text-muted-foreground">
            If this is empty or invalid, map data fetches may fail due to CORS.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="space-y-1">
              <Label htmlFor="autoTranslate">Tolgi uudised automaatselt eesti keelde</Label>
              <p className="text-xs text-muted-foreground">
                Mojub ainult kliendipoolses kuvamises.
              </p>
            </div>
            <Switch
              id="autoTranslate"
              checked={form.autoTranslateToEstonian}
              onCheckedChange={handleAutoTranslateToggle}
            />
          </div>
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="text-sm font-medium">Admin test</div>
            <Button
              variant="outline"
              onClick={handleTestTranslate}
              disabled={testTranslateLoading}
              className="w-full"
            >
              {testTranslateLoading ? 'Testin...' : 'Test translate'}
            </Button>
            {testTranslateResult && (
              <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-words">
                {testTranslateResult}
              </pre>
            )}
          </div>
        </div>

        <Button onClick={handleSave} className="w-full">Salvesta</Button>

        <Separator />

        <AvatarManager />

        <Separator />

        <DeveloperSettings />

        {adminReady && adminAllowed && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Admin</h3>
              <Button
                onClick={() => setAdminMode('admin-events')}
                className="w-full justify-start"
              >
                Halda üritusi
              </Button>
            </div>
          </>
        )}

        <Separator />

        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Torkeotsing</h3>
          <p className="text-xs text-muted-foreground">
            Kui rakendus ei laadi uusimat versiooni, tuhjenda vahemalu.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              disabled={resetting}
              onClick={() => setConfirmMode('soft')}
              className="w-full justify-start gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Tuhjenda vahemalu
            </Button>
            <Button
              variant="destructive"
              disabled={resetting}
              onClick={() => setConfirmMode('hard')}
              className="w-full justify-start gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Taielik lahtestus
            </Button>
          </div>
          {resetting && (
            <p className="text-sm text-muted-foreground animate-pulse">Tuhjendamine...</p>
          )}

          <Separator className="my-2" />

          <a
            href="/reset/"
            className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Ava lähtestusleht &rarr;
          </a>
          <p className="text-xs text-muted-foreground">
            Kasuta seda linki, kui rakendus on taiesti kinni jaanud ja nupud ei toota.
          </p>

          <Separator className="my-2" />

          <p className="text-xs text-muted-foreground">
            Versioon: {APP_VERSION}
          </p>
        </div>
      </div>

      <AlertDialog open={confirmMode !== null} onOpenChange={(open) => { if (!open) setConfirmMode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === 'hard' ? 'Taielik lahtestus' : 'Vahemalu tuhjendamine'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === 'hard'
                ? 'Koik salvestatud seaded ja vahemalu kustutatakse. Rakendus laaditakse uuesti.'
                : 'Vahemalu tuhjendatakse ja rakendus laaditakse uuesti. Seaded jaavad alles.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tuhista</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
              {confirmMode === 'hard' ? 'Lahtesta' : 'Tuhjenda'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

