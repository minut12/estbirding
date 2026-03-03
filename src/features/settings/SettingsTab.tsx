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
const LS_RESOLVED_PROXY_BASE = 'resolved_proxy_base_v1';
const LS_TRANSLATE_ENDPOINT = 'translate_endpoint_v1';
const LS_SUPABASE_PROXY_BASE = 'supabase_proxy_base_v1';

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

function storeResolvedProxyBase(v: unknown): void {
  try {
    const s = safeStr(v);
    if (s) localStorage.setItem(LS_RESOLVED_PROXY_BASE, s);
  } catch {}
}

// Finds first occurrence of a proxy base like: https://<ref>.supabase.co/functions/v1/proxy?url=
function scanDomForProxyBase(): string {
  try {
    const txt = document.body?.innerText || '';
    const m = txt.match(/https?:\/\/[^\s]+\.supabase\.co\/functions\/v1\/proxy\?url=/i);
    if (m) return safeStr(m[0]);
  } catch {}

  // also scan input values (Proxy Base URL field)
  try {
    const inputs = Array.from(document.querySelectorAll('input'));
    for (const inp of inputs) {
      const v = safeStr((inp as HTMLInputElement).value);
      if (/\.supabase\.co\/functions\/v1\/proxy\?url=/.test(v)) return v;
      const ph = safeStr(inp.getAttribute('placeholder'));
      if (/\.supabase\.co\/functions\/v1\/proxy\?url=/.test(ph)) return ph;
    }
  } catch {}

  return '';
}

function getResolvedProxyBaseAny(): string {
  // 1) localStorage
  try {
    const stored = safeStr(localStorage.getItem(LS_RESOLVED_PROXY_BASE));
    if (stored) return stored;
  } catch {}

  // 2) DOM scan fallback
  const dom = scanDomForProxyBase();
  if (dom) {
    try { localStorage.setItem(LS_RESOLVED_PROXY_BASE, dom); } catch {}
    return dom;
  }

  return '';
}

function getProxyTranslateEndpointSafe(): string {
  return deriveProxyTranslateEndpointFromBase(getResolvedProxyBaseAny());
}

function deriveSupabaseProxyBaseFromTranslateEndpoint(endpoint: unknown): string {
  const s = safeStr(endpoint);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (!u.hostname.endsWith('.supabase.co')) return '';
    return `${u.origin}/functions/v1/proxy?url=`;
  } catch {
    return '';
  }
}

function ensureSupabaseProxyBaseStored(): string {
  try {
    const existing = safeStr(localStorage.getItem(LS_SUPABASE_PROXY_BASE));
    if (existing) return existing;
    const te = safeStr(localStorage.getItem(LS_TRANSLATE_ENDPOINT));
    const derived = deriveSupabaseProxyBaseFromTranslateEndpoint(te);
    if (derived) {
      localStorage.setItem(LS_SUPABASE_PROXY_BASE, derived);
      return derived;
    }
  } catch {}
  return '';
}

function getSupabaseProxyBase(): string {
  try {
    const v = safeStr(localStorage.getItem(LS_SUPABASE_PROXY_BASE));
    if (v) return v;
  } catch {}
  return ensureSupabaseProxyBaseStored();
}

function getProxyTranslateEndpointFromSupabaseProxyBase(): string {
  const base = safeStr(getSupabaseProxyBase());
  if (!base) return '';
  const origin = base.split('?')[0].replace(/\/+$/, '');
  if (!origin.endsWith('/proxy')) return '';
  return `${origin}/translate-et`;
}

function _ss(x: unknown): string { try { return String(x ?? ''); } catch { return ''; } }
function _trim(x: unknown): string { return _ss(x).trim(); }

function _findAllProxyUrlsInText(txt: unknown): string[] {
  const out: string[] = [];
  const s = _ss(txt);
  const re = /https?:\/\/[^\s'"]+\.supabase\.co\/functions\/v1\/proxy\?url=/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[0]);
  return Array.from(new Set(out));
}

function _deriveProxyOriginFromProxyBase(proxyBase: unknown): string {
  const s = _trim(proxyBase);
  if (!s) return '';
  const base = s.split('?')[0].replace(/\/+$/, '');
  if (!base.endsWith('/proxy')) return '';
  return base;
}

function _deriveProxyTranslateFromProxyBase(proxyBase: unknown): string {
  const origin = _deriveProxyOriginFromProxyBase(proxyBase);
  return origin ? `${origin}/translate-et` : '';
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
  const resolvedProxyTranslateEndpoint = getProxyTranslateEndpointFromSupabaseProxyBase() || getProxyTranslateEndpoint();
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
    try { ensureSupabaseProxyBaseStored(); } catch {}
  }, []);

  useEffect(() => {
    try {
      const dom = scanDomForProxyBase();
      if (dom) localStorage.setItem(LS_RESOLVED_PROXY_BASE, dom);
    } catch {}
  }, []);

  useEffect(() => {
    const w = window as Window & { __dbgProxyDiscBound?: boolean };
    if (w.__dbgProxyDiscBound) return;
    w.__dbgProxyDiscBound = true;

    const onClick = async (e: Event) => {
      const target = e.target as Element | null;
      const btn = target?.closest?.('#debugProxyDiscoveryBtn');
      if (!btn) return;
      e.preventDefault();

      const report: any = {
        now: new Date().toISOString(),
        locationHref: _ss(window?.location?.href),
        userAgent: _ss(window?.navigator?.userAgent),
        localStorage: {},
        dom: {
          proxyUrlsInBodyText: [],
          proxyUrlsInInputs: [],
          inputValuesMatching: [],
          inputPlaceholdersMatching: [],
        },
        chosen: {
          storedTranslateEndpoint: '',
          storedProxyBaseCandidates: [],
          pickedProxyBase: '',
          derivedProxyOrigin: '',
          derivedProxyTranslate: '',
        },
        probe: {
          proxyBaseFetchOk: null,
          proxyBaseFetchStatus: null,
          proxyBaseFetchError: null,
          proxyBaseUsedForProbe: null,
        },
      };

      const keysToCheck = [
        'proxy_base', 'proxyBase', 'proxyBaseUrl', 'proxy_base_url',
        'translate_endpoint_v1', 'translate_endpoint', 'translation_endpoint',
        'resolved_proxy_base_v1', 'resolvedProxyBase', 'supabase_proxy_base_v1',
      ];
      try {
        for (const k of keysToCheck) {
          const v = localStorage.getItem(k);
          if (v !== null) report.localStorage[k] = v;
        }
      } catch (err) {
        report.localStorageError = String(err);
      }

      try {
        report.dom.proxyUrlsInBodyText = _findAllProxyUrlsInText(document.body ? document.body.innerText : '');
      } catch (err) {
        report.domBodyTextError = String(err);
      }

      try {
        const inputs = Array.from(document.querySelectorAll('input'));
        for (const inp of inputs) {
          const v = _trim((inp as HTMLInputElement).value);
          const ph = _trim(inp.getAttribute('placeholder'));
          if (v.includes('.supabase.co/functions/v1/proxy?url=')) report.dom.inputValuesMatching.push(v);
          if (ph.includes('.supabase.co/functions/v1/proxy?url=')) report.dom.inputPlaceholdersMatching.push(ph);
        }
        report.dom.proxyUrlsInInputs = Array.from(new Set([
          ...report.dom.inputValuesMatching,
          ...report.dom.inputPlaceholdersMatching,
        ]));
      } catch (err) {
        report.domInputsError = String(err);
      }

      try {
        report.chosen.storedTranslateEndpoint = _trim(localStorage.getItem('translate_endpoint_v1'));
      } catch {}

      const lsCandidates: string[] = [];
      for (const k of ['supabase_proxy_base_v1', 'proxy_base', 'proxyBase', 'proxy_base_url', 'proxyBaseUrl', 'resolved_proxy_base_v1']) {
        const v = report.localStorage[k];
        if (v && _trim(v).includes('/functions/v1/proxy')) lsCandidates.push(_trim(v));
      }
      report.chosen.storedProxyBaseCandidates = Array.from(new Set(lsCandidates));

      const candidates = [
        ...report.chosen.storedProxyBaseCandidates,
        ...report.dom.inputValuesMatching,
        ...report.dom.proxyUrlsInBodyText,
      ].map(_trim).filter(Boolean);

      report.chosen.pickedProxyBase = candidates[0] || '';
      report.chosen.derivedProxyOrigin = _deriveProxyOriginFromProxyBase(report.chosen.pickedProxyBase);
      report.chosen.derivedProxyTranslate = _deriveProxyTranslateFromProxyBase(report.chosen.pickedProxyBase);

      try {
        const base = report.chosen.pickedProxyBase;
        if (base) {
          report.probe.proxyBaseUsedForProbe = base;
          const testUrl = base + encodeURIComponent('https://example.com/');
          const r = await fetch(testUrl, { method: 'GET' });
          report.probe.proxyBaseFetchOk = r.ok;
          report.probe.proxyBaseFetchStatus = r.status;
        } else {
          report.probe.proxyBaseFetchOk = false;
          report.probe.proxyBaseFetchError = 'NO_PROXY_BASE_CANDIDATE';
        }
      } catch (err) {
        report.probe.proxyBaseFetchOk = false;
        report.probe.proxyBaseFetchError = String(err);
      }

      const pretty = JSON.stringify(report, null, 2);
      setTestTranslateResult(pretty);
      const outEl =
        document.querySelector('#translateAdminOutput') ||
        document.querySelector('#adminTestOutput') ||
        document.querySelector('pre');
      if (outEl) {
        (outEl as HTMLElement).textContent = pretty;
      } else {
        console.log('proxy discovery report', report);
        alert('Debug report printed to console (no output element found).');
      }
    };

    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      w.__dbgProxyDiscBound = false;
    };
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
    ensureSupabaseProxyBaseStored();
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
    ensureSupabaseProxyBaseStored();
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
    const proxyFallbackEndpoint = getProxyTranslateEndpointFromSupabaseProxyBase() || getProxyTranslateEndpoint();
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
      const proxyEndpoint = getProxyTranslateEndpointFromSupabaseProxyBase();
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
        if (!endpoint) return { ok: false, error: 'endpoint_missing', hint: 'supabase_proxy_base_v1 not set and cannot derive from translate endpoint' };
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

      const endpointProbe = async (url: string) => {
        try {
          const r = await fetch(url, { method: 'GET' });
          const ct = String(r.headers.get('content-type') || '').toLowerCase();
          const body = await r.text();
          const preview = body.slice(0, 60);
          return {
            url,
            ok: r.ok,
            status: r.status,
            contentType: ct || '(empty)',
            bodyPreview: preview,
            route_not_registered: ct.includes('text/html'),
          };
        } catch (error: any) {
          return {
            url,
            ok: false,
            error: String(error?.message || error),
          };
        }
      };

      const primary = await ping(primaryEndpoint);
      const apiPing = await endpointProbe('/api/ping');
      const apiTranslatePing = await endpointProbe('/api/translate-et?ping=1');
      if (primary.ok) {
        setTestTranslateResult(JSON.stringify({ apiPing, apiTranslatePing, primary }, null, 2));
        toast.success('Ping OK');
        return;
      }
      let proxy: any;
      if (!proxyEndpoint) {
        proxy = { ok: false, error: 'endpoint_missing', hint: 'supabase_proxy_base_v1 not set and cannot derive from translate endpoint' };
      } else {
        try {
          const r = await fetch(`${proxyEndpoint}?ping=1`, { method: 'GET' });
          const body = await r.text();
          let j: any = null;
          try { j = JSON.parse(body); } catch {}
          proxy = r.ok
            ? { ok: true, endpoint: proxyEndpoint, json: j || null }
            : { ok: false, endpoint: proxyEndpoint, status: r.status, body: body.slice(0, 160) };
        } catch (error: any) {
          proxy = { ok: false, endpoint: proxyEndpoint, error: String(error?.message || error) };
        }
      }
      setTestTranslateResult(JSON.stringify({ apiPing, apiTranslatePing, primary, proxy }, null, 2));
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
    ensureSupabaseProxyBaseStored();
    const saved = getStoredEndpoint();
    setStoredEndpointView(saved);
    setTranslationApiUrlInput(saved || getEnvEndpoint());
    toast.success('Translation endpoint saved');
  };

  const handleUseWorkerDefault = () => {
    setStoredEndpoint(WORKER_DEFAULT_ENDPOINT);
    ensureSupabaseProxyBaseStored();
    const saved = getStoredEndpoint();
    setStoredEndpointView(saved);
    setTranslationApiUrlInput(saved);
    toast.success('Translation endpoint saved');
  };

  const handleUseBuiltInTranslateRecommended = () => {
    const builtin = '/api/translate-et';
    setStoredEndpoint(builtin);
    const saved = getStoredEndpoint();
    setStoredEndpointView(saved);
    setTranslationApiUrlInput(saved || builtin);
    toast.success('OK');
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
    storeResolvedProxyBase(saved);
    toast.success('Proxy base saved');
  };

  const handleUseProxyTranslateRecommended = () => {
    const proxyTranslateEndpoint = getProxyTranslateEndpointFromSupabaseProxyBase() || getProxyTranslateEndpoint();
    if (!proxyTranslateEndpoint) {
      toast.error('Proxy translate endpoint puudub');
      return;
    }
    setStoredEndpoint(proxyTranslateEndpoint);
    ensureSupabaseProxyBaseStored();
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
          placeholder="/api/translate-et"
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
          Recommended: /api/translate-et (same-origin). You can still use a full Supabase/custom URL.
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
          <Button
            variant="outline"
            onClick={handleUseBuiltInTranslateRecommended}
            className="w-full"
          >
            Use built-in translate (recommended)
          </Button>
          <Button
            id="debugProxyDiscoveryBtn"
            variant="outline"
            className="w-full"
          >
            Debug proxy discovery
          </Button>
          {testTranslateResult && (
            <pre id="translateAdminOutput" className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-words">
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
