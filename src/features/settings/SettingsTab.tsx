import { useState, useEffect, useRef } from 'react';
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
import EventsManagementSettings from './EventsManagementSettings';
import { refreshSpeciesMetaFromCloud } from '@/lib/speciesMetaCloud';
import {
  getTranslateEndpoint,
  getProxyTranslateEndpoint,
  getEnvEndpoint,
  getStoredEndpoint,
  resolveEndpoint,
  setStoredEndpoint,
  TRANSLATION_ENDPOINT_UPDATED_EVENT,
  WORKER_DEFAULT_ENDPOINT,
} from '@/config/translationEndpoint';
import { isNativePlatform } from '@/lib/httpClient';
import {
  FALLBACK_PROXY_BASE,
  getEnvProxyBase,
  getProxyMode,
  getStoredProxyBase,
  PROXY_ENDPOINT_UPDATED_EVENT,
  resolveProxyBase,
  setStoredProxyBase,
} from '@/config/proxyEndpoint';
import { isDeveloperModeEnabled, setDeveloperModeEnabled } from '@/config/supabaseConfig';

type ResetMode = 'soft' | 'hard' | null;
type SettingsPage = 'home' | 'news' | 'events' | 'translations' | 'species';

// --- SAFE proxy translate derivation ---
// Never throws, always returns '' on failure.
function safeStr(x: unknown): string { try { return String(x ?? '').trim(); } catch { return ''; } }

function deriveProxyTranslateEndpointFromBase(proxyBase: unknown): string {
  const s = safeStr(proxyBase);
  if (!s) return '';
  const base = s.split('?')[0].replace(/\/+$/, '');
  if (!base.endsWith('/proxy')) return '';
  return `${base}/translate-et`;
}

function getResolvedProxyBaseSafe(): string {
  try {
    const maybeFn = (globalThis as any)?.getProxyBase;
    if (typeof maybeFn === 'function') return safeStr(maybeFn());
  } catch {}

  try {
    if (typeof resolveProxyBase === 'function') return safeStr(resolveProxyBase());
  } catch {}

  try {
    if (typeof (globalThis as any)?.proxyBaseResolved !== 'undefined') return safeStr((globalThis as any).proxyBaseResolved);
  } catch {}

  try {
    const ls = safeStr(localStorage.getItem('proxy_base') || localStorage.getItem('proxyBase') || localStorage.getItem('estbirding.proxyBase') || '');
    if (ls) return ls;
  } catch {}

  return '';
}

function getProxyTranslateEndpointSafe(): string {
  return deriveProxyTranslateEndpointFromBase(getResolvedProxyBaseSafe());
}

export default function SettingsTab() {
  const newsSourcesSectionRef = useRef<HTMLDivElement | null>(null);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('home');
  const [devMode, setDevMode] = useState<boolean>(() => isDeveloperModeEnabled());
  const [devTapCount, setDevTapCount] = useState(0);
  const [form, setForm] = useState<AppSettings>(loadSettings);
  const [confirmMode, setConfirmMode] = useState<ResetMode>(null);
  const [resetting, setResetting] = useState(false);
  const [testTranslateLoading, setTestTranslateLoading] = useState(false);
  const [pingTranslateLoading, setPingTranslateLoading] = useState(false);
  const [testTranslateResult, setTestTranslateResult] = useState('');
  const [translationApiUrl, setTranslationApiUrlInput] = useState('');
  const [storedEndpointView, setStoredEndpointView] = useState('');
  const [proxyBaseUrl, setProxyBaseUrl] = useState('');
  const [storedProxyBaseView, setStoredProxyBaseView] = useState('');
  const envEndpoint = getEnvEndpoint();
  const resolvedEndpoint = resolveEndpoint(translationApiUrl);
  const resolvedProxyTranslateEndpoint = getProxyTranslateEndpointSafe() || getProxyTranslateEndpoint();
  const envProxyBase = getEnvProxyBase();
  const resolvedProxyBase = resolveProxyBase(proxyBaseUrl);
  const proxyMode = getProxyMode(resolvedProxyBase);

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

  useEffect(() => {
    if (!import.meta.env.DEV || settingsPage !== 'news') return;
    if (!newsSourcesSectionRef.current) {
      console.warn('[Settings] News sources section did not render while settings page is open');
    }
  }, [settingsPage]);

  const onVersionTap = () => {
    if (devMode) return;
    const next = devTapCount + 1;
    setDevTapCount(next);
    if (next >= 7) {
      setDeveloperModeEnabled(true);
      setDevMode(true);
      setDevTapCount(0);
      toast.success('Developer mode enabled');
    }
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
      ? 'Automaatne tolkimine sisse lulitatud'
      : 'Automaatne tolkimine valja lulitatud');
  };

  const handleTestTranslate = async () => {
    setTestTranslateLoading(true);
    setTestTranslateResult('');
    const endpoint = resolveEndpoint(translationApiUrl);
    const proxyFallbackEndpoint = getProxyTranslateEndpointSafe() || getProxyTranslateEndpoint();
    if (import.meta.env.DEV) {
      console.info('[translate] native=', isNativePlatform(), 'translate=', endpoint);
    }
    try {
      if (!endpoint) {
        toast.error('Tõlke endpoint puudub. Ava Seaded → Tõlge ja salvesta URL.');
        throw new Error('TRANSLATE_ENDPOINT_MISSING');
      }

      const payload = {
        text: 'Tere! This is a test.',
        targetLang: 'et',
      };
      const anon = String((import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || '').trim();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (anon) {
        headers.apikey = anon;
        headers.Authorization = `Bearer ${anon}`;
      }

      const doTranslateFetch = async (targetEndpoint: string) => {
        const response = await fetch(targetEndpoint, {
          method: 'POST',
          mode: 'cors',
          headers,
          body: JSON.stringify(payload),
        });
        const ct = (response.headers.get('content-type') || '').toLowerCase();
        const rawText = await response.text();
        if (!ct.includes('application/json')) {
          throw new Error(`NON_JSON_RESPONSE_${response.status}: ${rawText.slice(0, 120)}`);
        }
        const data: any = rawText ? JSON.parse(rawText) : {};
        if (!response.ok || data?.ok !== true || typeof data?.translatedText !== 'string') {
          throw new Error('BAD_JSON_RESPONSE');
        }
        return data;
      };

      let data: any;
      try {
        data = await doTranslateFetch(endpoint);
      } catch (error: any) {
        const message = String(error?.message || error || '');
        const isNetwork = /networkerror|failed to fetch|abort/i.test(message);
        if (!isNetwork || !proxyFallbackEndpoint || proxyFallbackEndpoint === endpoint) throw error;
        data = await doTranslateFetch(proxyFallbackEndpoint);
      }

      setTestTranslateResult(JSON.stringify(data, null, 2));
      toast.success('OK');
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      setTestTranslateResult(`REQUEST FAILED\n${message}`);
      toast.error(`Test failed. ${message}`);
    } finally {
      setTestTranslateLoading(false);
    }
  };

  const handlePingTranslate = async () => {
    setPingTranslateLoading(true);
    setTestTranslateResult('');
    try {
      const primaryEndpoint = resolveEndpoint(translationApiUrl);
      const proxyEndpoint = getProxyTranslateEndpointSafe() || getProxyTranslateEndpoint();
      if (!primaryEndpoint && !proxyEndpoint) {
        toast.error('Tõlke endpoint puudub. Ava Seaded → Tõlge ja salvesta URL.');
        throw new Error('TRANSLATE_ENDPOINT_MISSING');
      }
      const anon = String((import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || '').trim();
      const headers: Record<string, string> = {};
      if (anon) {
        headers.apikey = anon;
        headers.Authorization = `Bearer ${anon}`;
      }

      const ping = async (endpoint: string) => {
        if (!endpoint) return { ok: false, error: 'endpoint_missing', hint: 'resolvedProxyBase empty or unparsable' };
        try {
          const pingUrl = endpoint.includes('?') ? `${endpoint}&ping=1` : `${endpoint}?ping=1`;
          const response = await fetch(pingUrl, { method: 'GET', mode: 'cors', headers });
          const ct = (response.headers.get('content-type') || '').toLowerCase();
          const rawText = await response.text();
          if (!ct.includes('application/json')) {
            return { ok: false, error: `NON_JSON_RESPONSE_${response.status}: ${rawText.slice(0, 120)}` };
          }
          const data: any = rawText ? JSON.parse(rawText) : {};
          return { ok: response.ok && data?.ok === true, data, error: response.ok ? undefined : 'PING_FAILED' };
        } catch (error: any) {
          return { ok: false, error: error?.message || String(error) };
        }
      };

      const primary = await ping(primaryEndpoint);
      if (primary.ok) {
        setTestTranslateResult(JSON.stringify({ primary }, null, 2));
        toast.success('Ping OK');
        return;
      }
      let proxy: any;
      if (!proxyEndpoint) {
        proxy = { ok: false, error: 'endpoint_missing', hint: 'resolvedProxyBase empty or unparsable' };
      } else {
        try {
          const r = await fetch(`${proxyEndpoint}?ping=1`, { method: 'GET', mode: 'cors', headers });
          const txt = await r.text();
          let j: any = null;
          try { j = JSON.parse(txt); } catch {}
          proxy = r.ok
            ? { ok: true, endpoint: proxyEndpoint, json: j || null }
            : { ok: false, endpoint: proxyEndpoint, status: r.status, body: txt.slice(0, 160) };
        } catch (error: any) {
          proxy = { ok: false, endpoint: proxyEndpoint, error: String(error?.message || error) };
        }
      }
      setTestTranslateResult(JSON.stringify({ primary, proxy }, null, 2));
      if (proxy.ok) {
        toast.warning('Primary failed, proxy OK');
        return;
      }
      toast.error('Both failed');
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      setTestTranslateResult(`REQUEST FAILED\n${message}`);
      toast.error(`Ping failed. ${message}`);
    } finally {
      setPingTranslateLoading(false);
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

  const handleUseProxyTranslateRecommended = () => {
    const proxyTranslateEndpoint = getProxyTranslateEndpointSafe() || getProxyTranslateEndpoint();
    if (!proxyTranslateEndpoint) {
      toast.error('Proxy translate endpoint puudub');
      return;
    }
    setStoredEndpoint(proxyTranslateEndpoint);
    const saved = getStoredEndpoint();
    setStoredEndpointView(saved);
    setTranslationApiUrlInput(saved);
    toast.success('Proxy translate endpoint saved');
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
      toast.error('Tühjendamine ebaõnnestus');
      setResetting(false);
    }
  };

  const renderSettingsHeader = (title: string) => (
    <div className="mb-3 mt-1 flex items-center justify-between gap-3">
      <Button variant="outline" onClick={() => setSettingsPage('home')} className="rounded-xl px-3 py-2">
        ← Tagasi
      </Button>
      <div className="text-lg font-extrabold">{title}</div>
      <div className="w-11" />
    </div>
  );

  const renderSettingsNews = () => (
    <div ref={newsSourcesSectionRef} className="block">
      <NewsSourcesSettings />
    </div>
  );

  const renderSettingsEvents = () => <EventsManagementSettings />;

  const renderSettingsTranslations = () => (
    <>
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
        <Button variant="outline" onClick={handleUseProxyTranslateRecommended} className="w-full">
          Use proxy translate (recommended)
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
        <p className="text-xs text-muted-foreground">
          Active endpoint: {getTranslateEndpoint() || '(empty)'}
        </p>
        <p className="text-xs text-muted-foreground">
          Proxy translate endpoint: {resolvedProxyTranslateEndpoint || '(empty)'}
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
            onClick={handlePingTranslate}
            disabled={pingTranslateLoading}
            className="w-full"
          >
            {pingTranslateLoading ? 'Pingin...' : 'Ping translate'}
          </Button>
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
    </>
  );

  const renderSettingsSpecies = () => <AvatarManager />;

  const renderDebugLite = () => (
    <div className="space-y-3">
      {devMode && <DeveloperSettings />}
      <Separator />
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
        Ava lahtestusleht &rarr;
      </a>
      <p className="text-xs text-muted-foreground">
        Kasuta seda linki, kui rakendus on taiesti kinni jaanud ja nupud ei toota.
      </p>

      <Separator className="my-2" />

      <p className="text-xs text-muted-foreground cursor-default select-none" onClick={onVersionTap}>
        Versioon: {APP_VERSION}
      </p>
    </div>
  );

  const renderSettingsHome = () => (
    <>
      <div className="flex flex-col gap-2">
        <Button className="w-full justify-center py-6 text-base font-bold" onClick={() => setSettingsPage('news')}>
          Uudised
        </Button>
        <Button className="w-full justify-center py-6 text-base font-bold" onClick={() => setSettingsPage('events')}>
          Üritused
        </Button>
        <Button className="w-full justify-center py-6 text-base font-bold" onClick={() => setSettingsPage('translations')}>
          Tõlge
        </Button>
        <Button className="w-full justify-center py-6 text-base font-bold" onClick={() => setSettingsPage('species')}>
          Linnuliigid
        </Button>
      </div>
      <div className="mt-2">
        {renderDebugLite()}
      </div>
    </>
  );

  const renderSettings = () => {
    if (settingsPage === 'home') return renderSettingsHome();
    if (settingsPage === 'news') return <>{renderSettingsHeader('Uudised')}{renderSettingsNews()}</>;
    if (settingsPage === 'events') return <>{renderSettingsHeader('Üritused')}{renderSettingsEvents()}</>;
    if (settingsPage === 'translations') return <>{renderSettingsHeader('Tõlge')}{renderSettingsTranslations()}</>;
    if (settingsPage === 'species') return <>{renderSettingsHeader('Linnuliigid')}{renderSettingsSpecies()}</>;
    return renderSettingsHome();
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h2 className="font-semibold text-foreground">Seaded</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-6 max-h-[calc(100dvh-124px)] md:max-h-none pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {renderSettings()}
      </div>

      <AlertDialog open={confirmMode !== null} onOpenChange={(open) => { if (!open) setConfirmMode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === 'hard' ? 'Taielik lahtestus' : 'Vahemalu tuhjendamine'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === 'hard'
                ? 'Kõik salvestatud seaded ja vahemälu kustutatakse. Rakendus laaditakse uuesti.'
                : 'Vahemälu tühjendatakse ja rakendus laaditakse uuesti. Seaded jäävad alles.'}
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
