import { useState, useEffect } from 'react';
import { loadSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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

  useEffect(() => {
    setForm(loadSettings());
  }, []);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveSettings(form);
    toast.success('Seaded salvestatud');
  };

  const showReport = (report: ResetReport) => {
    if (report.errors.length > 0) {
      toast.warning('Osaline tühjendus', {
        description: report.errors.join('; '),
        duration: 4000,
      });
    } else {
      toast.success('Vahemälu tühjendatud. Laen uuesti…');
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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h2 className="font-semibold text-foreground">Seaded</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-6">
        {/* News Sources */}
        <NewsSourcesSettings />

        {/* Events source */}
        <div className="space-y-2">
          <Label htmlFor="eventsUrl">Ürituste allikas URL</Label>
          <Input
            id="eventsUrl"
            placeholder="https://example.com/events.json"
            value={form.eventsSourceUrl}
            onChange={(e) => update('eventsSourceUrl', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">JSON-vormingus ürituste voo URL</p>
        </div>

        {/* Translation provider */}
        <div className="space-y-2">
          <Label>Tõlketeenuse pakkuja</Label>
          <Select
            value={form.translationProvider}
            onValueChange={(v) => update('translationProvider', v as AppSettings['translationProvider'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">Mock (läbipääs)</SelectItem>
              <SelectItem value="deepl" disabled>DeepL (tulekul)</SelectItem>
              <SelectItem value="google" disabled>Google (tulekul)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Translation API key */}
        <div className="space-y-2">
          <Label htmlFor="apiKey">Tõlke API võti</Label>
          <Input
            id="apiKey"
            type="password"
            placeholder="Valikuline"
            value={form.translationApiKey}
            onChange={(e) => update('translationApiKey', e.target.value)}
          />
        </div>

        <Button onClick={handleSave} className="w-full">Salvesta</Button>

        <Separator />

        {/* Avatar Manager */}
        <AvatarManager />

        <Separator />

        {/* Developer Settings */}
        <DeveloperSettings />

        <Separator />

        {/* Troubleshooting section */}
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Tõrkeotsing</h3>
          <p className="text-xs text-muted-foreground">
            Kui rakendus ei laadi uusimat versiooni, tühjenda vahemälu.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              disabled={resetting}
              onClick={() => setConfirmMode('soft')}
              className="w-full justify-start gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Tühjenda vahemälu
            </Button>
            <Button
              variant="destructive"
              disabled={resetting}
              onClick={() => setConfirmMode('hard')}
              className="w-full justify-start gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Täielik lähtestus
            </Button>
          </div>
          {resetting && (
            <p className="text-sm text-muted-foreground animate-pulse">Tühjendamine…</p>
          )}

          <Separator className="my-2" />

          <a
            href="/reset/"
            className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Ava lähtestusleht ↗
          </a>
          <p className="text-xs text-muted-foreground">
            Kasuta seda linki, kui rakendus on täiesti kinni jäänud ja nupud ei tööta.
          </p>

          <Separator className="my-2" />

          <p className="text-xs text-muted-foreground">
            Versioon: {APP_VERSION}
          </p>
        </div>
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={confirmMode !== null} onOpenChange={(open) => { if (!open) setConfirmMode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === 'hard' ? 'Täielik lähtestus' : 'Vahemälu tühjendamine'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === 'hard'
                ? 'Kõik salvestatud seaded ja vahemälu kustutatakse. Rakendus laaditakse uuesti.'
                : 'Vahemälu tühjendatakse ja rakendus laaditakse uuesti. Seaded jäävad alles.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tühista</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
              {confirmMode === 'hard' ? 'Lähtesta' : 'Tühjenda'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
