import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Upload, Trash2, Bird, RefreshCw, Check, Cloud, Loader2 } from 'lucide-react';
import {
  getMergedAvatars, validateFile, processImage, notifyIframeUpdate,
  uploadSharedAvatar, removeSharedAvatar, fetchSpeciesList,
} from '@/lib/avatar-storage';
import { getSpeciesMeta, loadSpeciesMeta, upsertSpeciesMeta } from '@/lib/speciesMeta';
import { SPECIES_META_LAST_SYNC_AT_KEY, refreshSpeciesMetaFromCloud, saveSpeciesMetaToCloud } from '@/lib/speciesMetaCloud';
import { ET_STRINGS } from '@/lib/etStrings';
import { normalizeUiText } from '@/lib/textNormalize';

const PLACEHOLDER_URL = '/maps/linnuliigid/avatars/placeholder.webp';

export default function AvatarManager() {
  const [species, setSpecies] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [ebirdCode, setEbirdCode] = useState('');
  const [rarityLevel, setRarityLevel] = useState<'none' | 'rare' | 'super' | 'mega'>('none');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string>(() => localStorage.getItem(SPECIES_META_LAST_SYNC_AT_KEY) || '');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSpeciesMeta();
    refreshSpeciesMetaFromCloud().catch(() => {});
    fetchSpeciesList().then((list) => { if (list.length > 0) setSpecies(list.map(normalizeUiText)); });
  }, []);

  useEffect(() => {
    if (!selected) {
      setCurrentAvatar(null);
      setPreview(null);
      setEbirdCode('');
      setRarityLevel('none');
      return;
    }
    const avatars = getMergedAvatars();
    const meta = getSpeciesMeta(selected);
    setCurrentAvatar(meta.avatarUrl || avatars[selected] || null);
    setEbirdCode(meta.ebirdCode || '');
    setRarityLevel(meta.rarityLevel || 'none');
    setPreview(null);
  }, [selected]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) { toast.error(err); return; }
    setProcessing(true);
    try {
      const dataUrl = await processImage(file);
      setPreview(dataUrl);
    } catch (ex: any) {
      toast.error(ex?.message || 'Pildi töötlemine ebaõnnestus');
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!selected || !preview) return;
    setSaving(true);
    try {
      const publicUrl = await uploadSharedAvatar(selected, preview);
      setCurrentAvatar(publicUrl);
      setPreview(null);
      upsertSpeciesMeta(selected, { avatarUrl: publicUrl });
      notifyIframeUpdate('update', selected, publicUrl);
      toast.success('Avatar salvestatud pilve - nähtav kõigil seadmetel');
    } catch (ex: any) {
      toast.error(ex?.message || 'Salvestamine ebaõnnestus');
    } finally {
      setSaving(false);
    }
  }, [selected, preview]);

  const handleRemove = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await removeSharedAvatar(selected);
      setCurrentAvatar(null);
      setPreview(null);
      upsertSpeciesMeta(selected, { avatarUrl: '' });
      notifyIframeUpdate('reset', selected);
      toast.success('Avatar eemaldatud');
    } catch (ex: any) {
      toast.error(ex?.message || 'Eemaldamine ebaõnnestus');
    } finally {
      setSaving(false);
    }
  }, [selected]);

  const handleRefreshMap = useCallback(() => {
    try {
      const iframe = document.querySelector('iframe[src*="linnuliigid"]') as HTMLIFrameElement | null;
      if (iframe) {
        const src = iframe.src;
        const base = src.replace(/[?&]v=[^&]*/, '');
        iframe.src = base + (base.includes('?') ? '&' : '?') + 'v=' + Date.now();
        toast.success('Kaart värskendatud');
      }
    } catch {
      toast.error('Kaardi värskendamine ebaõnnestus');
    }
  }, []);

  const handleMetaSave = useCallback(() => {
    if (!selected) return;
    const patch = {
      ebirdCode: ebirdCode.trim(),
      rarityLevel,
      avatarUrl: currentAvatar || undefined,
    };
    upsertSpeciesMeta(selected, patch);
    window.dispatchEvent(new CustomEvent('species-meta-updated'));
    saveSpeciesMetaToCloud(selected, patch)
      .then(async () => {
        await refreshSpeciesMetaFromCloud({ force: true }).catch(() => {});
        setLastSyncAt(localStorage.getItem(SPECIES_META_LAST_SYNC_AT_KEY) || '');
        toast.success(ET_STRINGS.saveSpeciesSettingsOk);
      })
      .catch(() => toast.warning(ET_STRINGS.saveSpeciesSettingsLocalOnly));
  }, [selected, ebirdCode, rarityLevel, currentAvatar]);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await refreshSpeciesMetaFromCloud({ force: true });
      setLastSyncAt(localStorage.getItem(SPECIES_META_LAST_SYNC_AT_KEY) || '');
      toast.success('Sünkroonitud');
    } catch {
      toast.warning('Sünkroon ebaõnnestus (kasutan lokaalseid seadeid)');
    } finally {
      setSyncing(false);
    }
  }, []);

  const formatLastSync = useCallback((iso: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    const now = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 24 * 60 * 60 * 1000) return `${hh}:${mm}`;
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mo}.${yyyy} ${hh}:${mm}`;
  }, []);

  const activeKey = selected || manualKey;
  const displayUrl = preview || currentAvatar || PLACEHOLDER_URL;
  const hasSpecies = species.length > 0;

  const filtered = search
    ? species.filter((s) => normalizeUiText(s).toLowerCase().includes(search.toLowerCase()))
    : species;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Cloud className="w-4 h-4 text-primary" />
        {ET_STRINGS.speciesSettings}
      </h3>
      <p className="text-xs text-muted-foreground">{ET_STRINGS.sharedManaged}</p>

      {hasSpecies ? (
        <div className="space-y-1.5">
          <Label>Vali liik</Label>
          <Command className="border border-input rounded-md">
            <CommandInput placeholder="Otsi liiki..." value={search} onValueChange={setSearch} />
            <CommandList className="max-h-[200px]">
              <CommandEmpty>Liiki ei leitud</CommandEmpty>
              <CommandGroup>
                {filtered.slice(0, 50).map((s) => (
                  <CommandItem key={s} value={s} onSelect={() => { setSelected(s); setSearch(''); }} className="flex items-center gap-2">
                    {selected === s && <Check className="w-3 h-3 text-primary" />}
                    <span>{s}</span>
                  </CommandItem>
                ))}
                {filtered.length > 50 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">...ja veel {filtered.length - 50} liiki</p>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="manualSpecies">Liigi nimi (käsitsi)</Label>
          <Input
            id="manualSpecies"
            placeholder="nt. Sookurg"
            value={manualKey}
            onChange={(e) => { setManualKey(e.target.value); setSelected(e.target.value); }}
          />
          <p className="text-xs text-destructive">species.json ei laadunud. Sisesta liigi nimi käsitsi.</p>
        </div>
      )}

      {activeKey && (
        <>
          <Separator />
          <div className="flex items-center gap-3">
            <Avatar className="w-16 h-16 border border-border">
              <AvatarImage src={displayUrl} alt={activeKey} />
              <AvatarFallback><Bird className="w-6 h-6 text-muted-foreground" /></AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground truncate">{activeKey}</p>
              <p className="text-xs text-muted-foreground">
                {preview ? 'Eelvaade (salvestamata)' : currentAvatar ? 'Pilves salvestatud avatar' : 'Vaikimisi / placeholder'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ebirdCode">eBird speciesCode</Label>
            <Input
              id="ebirdCode"
              placeholder="nt comred2"
              value={ebirdCode}
              onChange={(e) => setEbirdCode(e.target.value)}
            />
            <Label htmlFor="rarityLevel">{ET_STRINGS.rarityLabel}</Label>
            <select
              id="rarityLevel"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={rarityLevel}
              onChange={(e) => setRarityLevel(e.target.value as 'none' | 'rare' | 'super' | 'mega')}
            >
              <option value="none">{ET_STRINGS.rarityNormal}</option>
              <option value="rare">{ET_STRINGS.rarityRare}</option>
              <option value="super">{ET_STRINGS.raritySuper}</option>
              <option value="mega">{ET_STRINGS.rarityMega}</option>
            </select>
            <Button variant="outline" className="w-full" onClick={handleMetaSave}>
              {ET_STRINGS.saveSpeciesSettings}
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={handleSyncNow} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {syncing ? 'Sünkroonin...' : 'Sünkrooni nüüd'}
            </Button>
            <p className="text-xs text-muted-foreground">Viimane sünkroon: {formatLastSync(lastSyncAt)}</p>
          </div>

          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileChange} />
            <Button variant="outline" className="w-full gap-2" disabled={processing || saving} onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4" />
              {processing ? 'Töötlen...' : ET_STRINGS.uploadAvatar}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {preview && (
              <Button onClick={handleSave} className="w-full gap-2" disabled={saving}>
                <Cloud className="w-4 h-4" />
                {saving ? 'Salvestan...' : 'Salvesta pilve'}
              </Button>
            )}
            {currentAvatar && (
              <Button variant="outline" onClick={handleRemove} className="w-full gap-2" disabled={saving}>
                <Trash2 className="w-4 h-4" />
                Eemalda
              </Button>
            )}
          </div>
        </>
      )}

      <Separator />
      <Button variant="outline" size="sm" onClick={handleRefreshMap} className="gap-2">
        <RefreshCw className="w-3.5 h-3.5" />
        {ET_STRINGS.refreshMap}
      </Button>
      <p className="text-xs text-muted-foreground">Kui avatar ei ilmu kohe kaardile, vajuta "{ET_STRINGS.refreshMap}".</p>
    </div>
  );
}
