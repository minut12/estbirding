import { useState, useEffect } from 'react';
import { loadSettings, saveSettings, NEWS_AUTO_TRANSLATE_ET_KEY, type AppSettings } from '@/lib/settings';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_CONFIG_ERROR } from '@/config/supabase';
import { invokeEdgeFunction } from '@/lib/edge-functions';
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

type ResetMode = 'soft' | 'hard' | null;

export default function SettingsTab() {
  const [form, setForm] = useState<AppSettings>(loadSettings);
  const [confirmMode, setConfirmMode] = useState<ResetMode>(null);
  const [resetting, setResetting] = useState(false);
  const [translationConfigured, setTranslationConfigured] = useState(false);
  const [translationProvider, setTranslationProvider] = useState('openai');
  const [translationModel, setTranslationModel] = useState('gpt-4.1-mini');
  const [translationStatusLoading, setTranslationStatusLoading] = useState(true);
  const [translationStatusUnavailable, setTranslationStatusUnavailable] = useState(false);
  const [pingLoading, setPingLoading] = useState(false);

  useEffect(() => {
    setForm(loadSettings());
    void loadTranslationStatus();
  }, []);

  const loadTranslationStatus = async () => {
    setTranslationStatusLoading(true);
    try {
      const data = await invokeEdgeFunction<any>(supabase, 'translation-status');
      setTranslationConfigured(data?.configured === true);
      setTranslationProvider(data?.provider || 'openai');
      setTranslationModel(data?.model || 'gpt-4.1-mini');
      setTranslationStatusUnavailable(false);
    } catch (error) {
      console.error('[SETTINGS] translation-status invoke failed', error);
      setTranslationConfigured(false);
      setTranslationStatusUnavailable(true);
      toast.error((error as Error)?.message || 'Failed to load translation status');
    } finally {
      setTranslationStatusLoading(false);
    }
  };

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveSettings(form);
    toast.success('Seaded salvestatud');
  };

  const handleAutoTranslateToggle = async (checked: boolean) => {
    const next = { ...form, autoTranslateToEstonian: checked };
    setForm(next);
    saveSettings(next);
    localStorage.setItem(NEWS_AUTO_TRANSLATE_ET_KEY, checked ? '1' : '0');

    if (!checked) return;
    if (!translationConfigured) {
      toast.error('Translation not configured');
      return;
    }

    let data: any;
    try {
      data = await invokeEdgeFunction<any>(supabase, 'translate-news-pending', { limit: 10 });
    } catch (error) {
      console.error('[SETTINGS] translate-news-pending invoke failed', error);
      toast.error((error as Error)?.message || 'Tolge ebaonnestus');
      return;
    }
    if (data?.error === 'Translation not configured') {
      toast.error('Translation not configured');
      return;
    }

    const translated = Number(data?.translated || 0);
    if (translated > 0) toast.success(`Tolgiti ${translated} uudist`);
    else toast.info('Tolkida pole midagi');
  };

  const handlePingEdge = async () => {
    setPingLoading(true);
    try {
      const data = await invokeEdgeFunction<any>(supabase, 'ping');
      if (data?.ok === true) toast.success('Edge ping ok');
      else toast.error('Edge ping failed');
    } catch (error) {
      console.error('[SETTINGS] ping invoke failed', error);
      toast.error((error as Error)?.message || 'Edge ping failed');
    } finally {
      setPingLoading(false);
    }
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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h2 className="font-semibold text-foreground">Seaded</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-6">
        <NewsSourcesSettings />

        {SUPABASE_CONFIG_ERROR && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {SUPABASE_CONFIG_ERROR}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="eventsUrl">Urituste allikas URL</Label>
          <Input
            id="eventsUrl"
            placeholder="https://example.com/events.json"
            value={form.eventsSourceUrl}
            onChange={(e) => update('eventsSourceUrl', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">JSON-vormingus urituste voo URL</p>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {translationStatusUnavailable ? 'OpenAI status unavailable' : `OpenAI configured: ${translationConfigured ? 'yes' : 'no'}`}
            {translationConfigured ? ` (${translationProvider}, ${translationModel})` : ''}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="space-y-1">
              <Label htmlFor="autoTranslate">Tolgi uudised automaatselt eesti keelde</Label>
              <p className="text-xs text-muted-foreground">
                Mojub serveripoolses uudiste importimises.
              </p>
            </div>
            <Switch
              id="autoTranslate"
              checked={form.autoTranslateToEstonian}
              disabled={!translationConfigured || translationStatusLoading}
              onCheckedChange={handleAutoTranslateToggle}
            />
          </div>
          {!translationConfigured && (
            <p className="text-xs text-muted-foreground">
              Admin: set OPENAI_API_KEY in Supabase Secrets.
            </p>
          )}
        </div>

        <Button onClick={handleSave} className="w-full">Salvesta</Button>

        <Separator />

        <AvatarManager />

        <Separator />

        <DeveloperSettings />

        {import.meta.env.DEV && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Edge Health Check</h3>
              <Button variant="outline" onClick={handlePingEdge} disabled={pingLoading}>
                {pingLoading ? 'Pinging...' : 'Ping Edge Functions'}
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
