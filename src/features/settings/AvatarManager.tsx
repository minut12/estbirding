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
import { Upload, Trash2, RotateCcw, Bird, RefreshCw, Check } from 'lucide-react';
import {
  loadAvatars, saveAvatar, removeAvatar, resetAvatar,
  validateFile, processImage, notifyIframe, fetchSpeciesList,
} from '@/lib/avatar-storage';

const PLACEHOLDER_URL = '/maps/linnuliigid/avatars/placeholder.webp';

export default function AvatarManager() {
  const [species, setSpecies] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Load species list on mount
  useEffect(() => {
    fetchSpeciesList().then((list) => {
      if (list.length > 0) {
        setSpecies(list);
      }
    });
  }, []);

  // Load current avatar when selection changes
  useEffect(() => {
    if (!selected) { setCurrentAvatar(null); setPreview(null); return; }
    const avatars = loadAvatars();
    setCurrentAvatar(avatars[selected] || null);
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

  const handleSave = useCallback(() => {
    if (!selected || !preview) return;
    try {
      saveAvatar(selected, preview);
      setCurrentAvatar(preview);
      setPreview(null);
      notifyIframe('update', selected, preview);
      toast.success('Avatar salvestatud');
    } catch (ex: any) {
      toast.error(ex?.message || 'Salvestamine ebaõnnestus');
    }
  }, [selected, preview]);

  const handleRemove = useCallback(() => {
    if (!selected) return;
    removeAvatar(selected);
    setCurrentAvatar(null);
    setPreview(null);
    notifyIframe('reset', selected);
    toast.success('Avatar eemaldatud');
  }, [selected]);

  const handleReset = useCallback(() => {
    if (!selected) return;
    resetAvatar(selected);
    setCurrentAvatar(null);
    setPreview(null);
    notifyIframe('reset', selected);
    toast.success('Avatar lähtestatud vaikimisi väärtusele');
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

  const activeKey = selected || manualKey;
  const displayUrl = preview || currentAvatar || PLACEHOLDER_URL;
  const hasSpecies = species.length > 0;

  const filtered = search
    ? species.filter((s) => s.toLowerCase().includes(search.toLowerCase()))
    : species;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground">Avatarid</h3>
      <p className="text-xs text-muted-foreground">
        Lae üles linnuliikide avatarid kaardil kuvamiseks.
      </p>

      {/* Species selector */}
      {hasSpecies ? (
        <div className="space-y-1.5">
          <Label>Vali liik</Label>
          <Command className="border border-input rounded-md">
            <CommandInput
              placeholder="Otsi liiki…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-[200px]">
              <CommandEmpty>Liiki ei leitud</CommandEmpty>
              <CommandGroup>
                {filtered.slice(0, 50).map((s) => (
                  <CommandItem
                    key={s}
                    value={s}
                    onSelect={() => { setSelected(s); setSearch(''); }}
                    className="flex items-center gap-2"
                  >
                    {selected === s && <Check className="w-3 h-3 text-primary" />}
                    <span>{s}</span>
                  </CommandItem>
                ))}
                {filtered.length > 50 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    …ja veel {filtered.length - 50} liiki
                  </p>
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
          <p className="text-xs text-destructive">
            species.json ei laadunud. Sisesta liigi nimi käsitsi.
          </p>
        </div>
      )}

      {/* Selected species info */}
      {activeKey && (
        <>
          <Separator />
          <div className="flex items-center gap-3">
            <Avatar className="w-16 h-16 border border-border">
              <AvatarImage src={displayUrl} alt={activeKey} />
              <AvatarFallback>
                <Bird className="w-6 h-6 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground truncate">{activeKey}</p>
              <p className="text-xs text-muted-foreground">
                {preview ? 'Eelvaade (salvestamata)' : currentAvatar ? 'Kohandatud avatar' : 'Vaikimisi / placeholder'}
              </p>
            </div>
          </div>

          {/* Upload */}
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={processing}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4" />
              {processing ? 'Töötlen…' : 'Lae avatar üles'}
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {preview && (
              <Button onClick={handleSave} className="w-full gap-2">
                <Check className="w-4 h-4" />
                Salvesta
              </Button>
            )}
            {currentAvatar && (
              <Button variant="outline" onClick={handleRemove} className="w-full gap-2">
                <Trash2 className="w-4 h-4" />
                Eemalda
              </Button>
            )}
            <Button variant="ghost" onClick={handleReset} className="w-full gap-2">
              <RotateCcw className="w-4 h-4" />
              Lähtesta vaikimisi
            </Button>
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
