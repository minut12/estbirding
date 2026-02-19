import { useState, useEffect } from 'react';
import { loadSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export default function SettingsTab() {
  const [form, setForm] = useState<AppSettings>(loadSettings);

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

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h2 className="font-semibold text-foreground">Seaded</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* News source */}
        <div className="space-y-2">
          <Label htmlFor="newsUrl">Uudiste allikas URL</Label>
          <Input
            id="newsUrl"
            placeholder="https://example.com/rss"
            value={form.newsSourceUrl}
            onChange={(e) => update('newsSourceUrl', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">RSS või JSON voo URL</p>
        </div>

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
      </div>
    </div>
  );
}
