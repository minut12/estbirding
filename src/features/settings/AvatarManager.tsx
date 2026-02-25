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
import { Upload, Trash2, Bird, RefreshCw, Check, Cloud } from 'lucide-react';
import {
  getMergedAvatars, validateFile, processImage, notifyIframeUpdate,
  uploadSharedAvatar, removeSharedAvatar, fetchSpeciesList,
} from '@/lib/avatar-storage';
import { getSpeciesMeta, loadSpeciesMeta, upsertSpeciesMeta } from '@/lib/speciesMeta';

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
  const [isRarity, setIsRarity] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSpeciesMeta();
    fetchSpeciesList().then((list) => { if (list.length > 0) setSpecies(list); });
  }, []);

  useEffect(() => {
    if (!selected) {
      setCurrentAvatar(null);
      setPreview(null);
      setEbirdCode('');
      setIsRarity(false);
      return;
    }
    const avatars = getMergedAvatars();
    const meta = getSpeciesMeta(selected);
    setCurrentAvatar(meta.avatarUrl || avatars[selected] || null);
    setEbirdCode(meta.ebirdCode || '');
    setIsRarity(!!meta.isRarity);
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
      toast.success('Avatar salvestatud pilve — nähtav kõigil seadmetel');
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
    } catch { toast.error('Kaardi värskendamine ebaõnnestus'); }
  }, []);

  const handleMetaSave = useCallback(() => {
    if (!selected) return;
    upsertSpeciesMeta(selected, {
      ebirdCode: ebirdCode.trim(),
      isRarity,
      avatarUrl: currentAvatar || undefined,
    });
    toast.success('Liigi seaded salvestatud');
  }, [selected, ebirdCode, isRarity, currentAvatar]);

  const activeKey = selected || manualKey;
  const displayUrl = preview || currentAvatar || PLACEHOLDER_URL;
  const hasSpecies = species.length > 0;

  const filtered = search
    ? species.filter((s) => s.toLowerCase().includes(search.toLowerCase()))
    : species;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Cloud className="w-4 h-4 text-primary" />
        Liigi seaded
      </h3>
      <p className="text-xs text-muted-foreground">
        Hallatakse ühiselt: avatar, eBird speciesCode ja rarity-lipp.
      </p>

      {hasSpecies ? (
        <div className="space-y-1.5">
          <Label>Vali liik</Label>
          <Command className="border border-input rounded-md">
            <CommandInput placeholder="Otsi liiki…" value={search} onValueChange={setSearch} />
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
                  <p className="text-xs text-muted-foreground px-2 py-1">…ja veel {filtered.length - 50} liiki</p>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="manualSpecies">Liigi nimi (käsitsi)</Label>
          <Input id="manualSpecies" placeholder="nt. Sookurg" value={manualKey}
            onChange={(e) => { setManualKey(e.target.value); setSelected(e.target.value); }} />
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isRarity}
                onChange={(e) => setIsRarity(e.target.checked)}
              />
              Rarity liik
            </label>
            <Button variant="outline" className="w-full" onClick={handleMetaSave}>
              Salvesta liigi seaded
            </Button>
          </div>

          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileChange} />
            <Button variant="outline" className="w-full gap-2" disabled={processing || saving} onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4" />
              {processing ? 'Töötlen…' : 'Lae avatar üles'}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {preview && (
              <Button onClick={handleSave} className="w-full gap-2" disabled={saving}>
                <Cloud className="w-4 h-4" />
                {saving ? 'Salvestan…' : 'Salvesta pilve'}
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
        Värskenda kaarti
      </Button>
      <p className="text-xs text-muted-foreground">
        Kui avatar ei ilmu kohe kaardile, vajuta „Värskenda kaarti".
      </p>
    </div>
  );
}
