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
import { LINNULIIGID_SCOPE, type SpeciesScopeConfig } from '@/lib/mapScope';
import {
  getMergedAvatars, validateFile, processImage, notifyIframeUpdate,
  uploadSharedAvatar, removeSharedAvatar, fetchSpeciesList, fetchSharedAvatars,
} from '@/lib/avatar-storage';
import {
  buildSpeciesMetaLookupFallback,
  getRariliinSpeciesMeta,
  getScopedSpeciesMeta,
  loadSpeciesMeta,
  seedSpeciesMetaFallback,
  upsertSpeciesMeta,
  type SpeciesMeta,
  type SpeciesMetaLookupFallback,
} from '@/lib/speciesMeta';
import {
  SPECIES_META_LAST_SYNC_AT_KEY,
  downloadSpeciesMetaJson,
  getSpeciesMetaSyncStatus,
  refreshSpeciesMetaFromCloud,
  saveSpeciesMetaToCloud,
  type SpeciesMetaCloudItem,
} from '@/lib/speciesMetaCloud';
import { addCustomSpecies, removeCustomSpecies, isCustomSpecies } from '@/lib/customSpecies';
import { addCustomSpeciesToCloud, removeCustomSpeciesFromCloud, refreshCustomSpeciesFromCloud } from '@/lib/customSpeciesCloud';
import { fetchEbirdTaxon } from '@/lib/ebirdTaxon';
import { ET_STRINGS } from '@/lib/etStrings';
import { normalizeUiText } from '@/lib/textNormalize';

export default function AvatarManager({ scope = LINNULIIGID_SCOPE }: { scope?: SpeciesScopeConfig }) {
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
  const [lastSyncAt, setLastSyncAt] = useState<string>(() => localStorage.getItem(scope.speciesMetaLastSyncAtKey || SPECIES_META_LAST_SYNC_AT_KEY) || '');
  const [syncStatus, setSyncStatus] = useState(() => getSpeciesMetaSyncStatus(scope));
  const [scopeMetadata, setScopeMetadata] = useState<SpeciesMetaLookupFallback>({});
  const [avatarsReady, setAvatarsReady] = useState(false);
  const [scientificName, setScientificName] = useState('');
  const [isMigrantMode, setIsMigrantMode] = useState<'heuristic' | 'true' | 'false'>('heuristic');
  const [notify, setNotify] = useState<boolean>(false);
  const [cloudItems, setCloudItems] = useState<Record<string, SpeciesMetaCloudItem>>({});
  const [fetchingTaxon, setFetchingTaxon] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSpeciesName, setNewSpeciesName] = useState('');
  const [bundledSpecies, setBundledSpecies] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSpeciesMeta(scope);
    refreshSpeciesMetaFromCloud({ force: true, scope }).catch(() => {});
    refreshCustomSpeciesFromCloud({ force: true }).catch(() => {});
    setSyncStatus(getSpeciesMetaSyncStatus(scope));
    fetchSpeciesList(scope).then((list) => { if (list.length > 0) setSpecies(list.map(normalizeUiText)); });
    // Load bundled species set (species.json only, no custom merge) for remove-button guard
    fetch(scope.speciesJsonPath).then(r => r.ok ? r.json() : []).then((list: string[]) => {
      if (Array.isArray(list)) setBundledSpecies(new Set(list.map(s => normalizeUiText(s).toLowerCase())));
    }).catch(() => {});
    if (scope.speciesMetaAssetPath) {
      fetch(scope.speciesMetaAssetPath)
        .then((res) => res.ok ? res.json() : {})
        .then((items) => {
          const next = buildSpeciesMetaLookupFallback(items);
          setScopeMetadata(next);
          const seeded = seedSpeciesMetaFallback(next, scope);
          if (seeded.changed) {
            window.dispatchEvent(new CustomEvent('species-meta-updated'));
          }
        })
        .catch(() => {});
    } else {
      setScopeMetadata({});
    }
    fetchSharedAvatars(scope).then((map) => {
      console.log('[AvatarManager] fetchSharedAvatars returned', Object.keys(map).length, 'entries');
      setAvatarsReady(true);
    }).catch((err) => {
      console.error('[AvatarManager] fetchSharedAvatars failed:', err);
      setAvatarsReady(true);
    });
  }, [scope]);

  useEffect(() => {
    const onMetaUpdated = () => setSyncStatus(getSpeciesMetaSyncStatus(scope));
    window.addEventListener('species-meta-updated', onMetaUpdated as EventListener);
    return () => window.removeEventListener('species-meta-updated', onMetaUpdated as EventListener);
  }, [scope]);

  // Local merge strips is_migrant — read it directly from cloud JSON.
  useEffect(() => {
    let cancelled = false;
    downloadSpeciesMetaJson(scope)
      .then((json) => { if (!cancelled) setCloudItems(json?.items ?? {}); })
      .catch(() => { if (!cancelled) setCloudItems({}); });
    return () => { cancelled = true; };
  }, [scope]);

  useEffect(() => {
    const onCustomSpeciesUpdated = () => {
      fetchSpeciesList(scope).then((list) => { if (list.length > 0) setSpecies(list.map(normalizeUiText)); });
    };
    window.addEventListener('custom-species-updated', onCustomSpeciesUpdated as EventListener);
    return () => window.removeEventListener('custom-species-updated', onCustomSpeciesUpdated as EventListener);
  }, [scope]);

  useEffect(() => {
    if (!selected) {
      setCurrentAvatar(null);
      setPreview(null);
      setEbirdCode('');
      setRarityLevel('none');
      setScientificName('');
      return;
    }
    const avatars = getMergedAvatars(scope);
    const meta = scope.id === 'rariliin'
      ? getRariliinSpeciesMeta(selected, scopeMetadata)
      : getScopedSpeciesMeta(selected, scope);
    setCurrentAvatar(meta.avatarUrl || avatars[selected] || null);
    setEbirdCode(meta.ebirdCode || '');
    setRarityLevel(meta.rarityLevel || 'none');
    setScientificName(meta.scientificName || '');
    const cloudItem = cloudItems[selected];
    setIsMigrantMode(
      cloudItem?.is_migrant === true ? 'true' :
      cloudItem?.is_migrant === false ? 'false' : 'heuristic'
    );
    setNotify(cloudItem?.notify === true);
    setPreview(null);
  }, [scope, selected, scopeMetadata, avatarsReady, cloudItems]);

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
    if (saving) return;
    if (!selected) {
      toast.error('Vali liik enne salvestamist.');
      return;
    }
    if (!preview) {
      toast.error('Avaatar puudub üleslaadimiseks.');
      return;
    }
    setSaving(true);
    try {
      console.info('[avatar-manager] save start', { species: selected, hasPreview: true });
      const migrantValue: boolean | null =
        isMigrantMode === 'true' ? true : isMigrantMode === 'false' ? false : null;
      const patch = {
        ebirdCode: ebirdCode.trim(),
        rarityLevel,
        scientificName: scientificName.trim() || undefined,
        notify,
      };
      console.info('[avatar-manager] avatar upload start', { species: selected });
      const publicUrl = await uploadSharedAvatar(selected, preview, scope);
      console.info('[avatar-manager] avatar upload end', { species: selected, publicUrl });
      const cloudPatch = { ...patch, avatarUrl: publicUrl, is_migrant: migrantValue };
      console.info('[avatar-manager] metadata save start', { species: selected, patch: cloudPatch });
      const merged = await saveSpeciesMetaToCloud(selected, cloudPatch as unknown as Partial<SpeciesMeta>, scope);
      console.info('[avatar-manager] metadata save end', { species: selected, saved: Boolean(merged[selected]) });
      setCurrentAvatar(publicUrl);
      setPreview(null);
      upsertSpeciesMeta(selected, { ...patch, avatarUrl: publicUrl }, scope);
      notifyIframeUpdate('update', selected, publicUrl, scope);
      setLastSyncAt(localStorage.getItem(scope.speciesMetaLastSyncAtKey || SPECIES_META_LAST_SYNC_AT_KEY) || '');
      setSyncStatus(getSpeciesMetaSyncStatus(scope));
      const refreshed = await downloadSpeciesMetaJson(scope).catch(() => null);
      if (refreshed) setCloudItems(refreshed.items ?? {});
      toast.success('Liigi seaded salvestati pilve.');
    } catch (ex: any) {
      console.error('[avatar-manager] save error', { species: selected, error: ex });
      setSyncStatus(getSpeciesMetaSyncStatus(scope));
      const message = String(ex?.message || '');
      if (/eelvaade|avatar/i.test(message)) toast.error(message || 'Avatari üleslaadimine ebaõnnestus.');
      else if (/võrguühendus|network/i.test(message)) toast.error(message || 'Võrguühendus ebaõnnestus.');
      else toast.error(message || 'Pilve salvestamine ebaõnnestus.');
    } finally {
      setSaving(false);
    }
  }, [saving, scope, selected, preview, ebirdCode, rarityLevel, scientificName, notify, isMigrantMode]);

  const handleRemove = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await removeSharedAvatar(selected, scope);
      setCurrentAvatar(null);
      setPreview(null);
      upsertSpeciesMeta(selected, { avatarUrl: '' }, scope);
      notifyIframeUpdate('reset', selected, undefined, scope);
      toast.success('Avatar eemaldatud');
    } catch (ex: any) {
      toast.error(ex?.message || 'Eemaldamine ebaõnnestus');
    } finally {
      setSaving(false);
    }
  }, [scope, selected]);

  const handleRefreshMap = useCallback(() => {
    try {
      const iframe = document.querySelector(`iframe[src*="${scope.mapPath.replace('/index.html', '')}"]`) as HTMLIFrameElement | null;
      if (iframe) {
        const src = iframe.src;
        const base = src.replace(/[?&]v=[^&]*/, '');
        iframe.src = base + (base.includes('?') ? '&' : '?') + 'v=' + Date.now();
        toast.success('Kaart värskendatud');
      }
    } catch {
      toast.error('Kaardi värskendamine ebaõnnestus');
    }
  }, [scope]);

  const handleFetchTaxon = useCallback(async () => {
    const code = ebirdCode.trim();
    if (!code) {
      toast.warning('Sisesta esmalt eBird speciesCode');
      return;
    }
    setFetchingTaxon(true);
    try {
      const taxon = await fetchEbirdTaxon(code);
      if (taxon?.sciName) {
        setScientificName(taxon.sciName);
        toast.success(`Laadisin eBirdist: ${taxon.sciName}`);
      } else {
        toast.warning('eBirdist ei leitud — sisesta käsitsi');
      }
    } catch {
      toast.warning('eBirdist ei leitud — sisesta käsitsi');
    } finally {
      setFetchingTaxon(false);
    }
  }, [ebirdCode]);

  const handleMetaSave = useCallback(() => {
    if (saving) return;
    if (!selected) {
      toast.error('Vali liik enne salvestamist.');
      return;
    }
    setSaving(true);

    // Silent auto-fetch scientific name if missing but ebirdCode is set
    const doSave = async () => {
      let resolvedSciName = scientificName.trim();
      if (!resolvedSciName && ebirdCode.trim()) {
        try {
          const taxon = await fetchEbirdTaxon(ebirdCode.trim());
          if (taxon?.sciName) {
            resolvedSciName = taxon.sciName;
            setScientificName(resolvedSciName);
          }
        } catch {}
      }

      const migrantValue: boolean | null =
        isMigrantMode === 'true' ? true : isMigrantMode === 'false' ? false : null;
      const patch = {
        ebirdCode: ebirdCode.trim(),
        rarityLevel,
        avatarUrl: currentAvatar || undefined,
        scientificName: resolvedSciName || undefined,
        notify,
      };
      const cloudPatch = { ...patch, is_migrant: migrantValue };
      upsertSpeciesMeta(selected, patch, scope);
      window.dispatchEvent(new CustomEvent('species-meta-updated'));
      console.info('[avatar-manager] metadata-only save start', { species: selected, patch: cloudPatch });
      return cloudPatch;
    };

    doSave().then((patch) => saveSpeciesMetaToCloud(selected, patch as unknown as Partial<SpeciesMeta>, scope))
      .then(async () => {
        await refreshSpeciesMetaFromCloud({ force: true, scope }).catch(() => {});
        const refreshed = await downloadSpeciesMetaJson(scope).catch(() => null);
        if (refreshed) setCloudItems(refreshed.items ?? {});
        setLastSyncAt(localStorage.getItem(scope.speciesMetaLastSyncAtKey || SPECIES_META_LAST_SYNC_AT_KEY) || '');
        setSyncStatus(getSpeciesMetaSyncStatus(scope));
        console.info('[avatar-manager] metadata-only save end', { species: selected });
        toast.success('Liigi seaded salvestati pilve.');
      })
      .catch((error) => {
        console.error('[avatar-manager] metadata-only save error', { species: selected, error });
        setSyncStatus(getSpeciesMetaSyncStatus(scope));
        const message = String(error?.message || '');
        if (/võrguühendus|network/i.test(message)) toast.error(message || 'Võrguühendus ebaõnnestus.');
        else toast.error(message || 'Liigi metaandmete salvestamine ebaõnnestus.');
      })
      .finally(() => {
        setSaving(false);
      });
  }, [saving, scope, selected, ebirdCode, rarityLevel, currentAvatar, scientificName, notify, isMigrantMode]);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await refreshSpeciesMetaFromCloud({ force: true, scope });
      setLastSyncAt(localStorage.getItem(scope.speciesMetaLastSyncAtKey || SPECIES_META_LAST_SYNC_AT_KEY) || '');
      setSyncStatus(getSpeciesMetaSyncStatus(scope));
      toast.success('Sünkroonitud');
    } catch {
      toast.warning('Sünkroon ebaõnnestus (kasutan lokaalseid seadeid)');
      setSyncStatus(getSpeciesMetaSyncStatus(scope));
    } finally {
      setSyncing(false);
    }
  }, [scope]);

  const handleAddSpecies = useCallback(() => {
    const trimmed = newSpeciesName.trim();
    if (!trimmed) {
      toast.error('Sisesta liigi nimi');
      return;
    }
    if (species.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('See liik on juba nimekirjas');
      return;
    }
    const added = addCustomSpecies(trimmed);
    if (added) {
      fetchSpeciesList(scope).then((list) => {
        if (list.length > 0) setSpecies(list.map(normalizeUiText));
      });
      setNewSpeciesName('');
      setShowAddForm(false);
      setSelected(trimmed);
      toast.success(`Liik "${trimmed}" lisatud`);
      addCustomSpeciesToCloud(trimmed).catch((err) => {
        console.warn('[AvatarManager] cloud sync failed for added species:', err);
        toast.warning('Liik lisatud lokaalselt, kuid pilve sünkroon ebaõnnestus.');
      });
    } else {
      toast.error('Liigi lisamine ebaõnnestus');
    }
  }, [newSpeciesName, species, scope]);

  const handleRemoveCustomSpecies = useCallback(() => {
    if (!selected || !isCustomSpecies(selected)) return;
    // Guard: never remove bundled species
    if (bundledSpecies.has(normalizeUiText(selected).toLowerCase())) {
      toast.error('Sisseehitatud liike ei saa eemaldada.');
      return;
    }
    removeCustomSpecies(selected);
    fetchSpeciesList(scope).then((list) => {
      if (list.length > 0) setSpecies(list.map(normalizeUiText));
    });
    const removedName = selected;
    setSelected('');
    toast.success(`Liik "${removedName}" eemaldatud`);
    removeCustomSpeciesFromCloud(removedName).catch((err) => {
      console.warn('[AvatarManager] cloud remove failed:', err);
      toast.warning('Liik eemaldatud lokaalselt, kuid pilve sünkroon ebaõnnestus.');
    });
  }, [selected, scope, bundledSpecies]);

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
  const displayUrl = preview || currentAvatar || scope.placeholderAvatarUrl;
  const hasSpecies = species.length > 0;
  const selectedScopeMeta = selected
    ? (scope.id === 'rariliin'
      ? getRariliinSpeciesMeta(selected, scopeMetadata)
      : getScopedSpeciesMeta(selected, scope))
    : null;

  const filtered = search
    ? species.filter((s) => normalizeUiText(s).toLowerCase().includes(search.toLowerCase()))
    : species;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Cloud className="w-4 h-4 text-primary" />
        {scope.displayName} {ET_STRINGS.speciesSettings.toLowerCase()}
      </h3>
      <p className="text-xs text-muted-foreground">{ET_STRINGS.sharedManaged}</p>

      {hasSpecies ? (
        <div className="space-y-1.5">
          <Label>Vali liik</Label>
          <Command className="border border-input rounded-md">
            <CommandInput placeholder="Otsi liiki..." value={search} onValueChange={setSearch} />
            <CommandList className="max-h-[400px]">
              <CommandEmpty>Liiki ei leitud</CommandEmpty>
              <CommandGroup>
                {filtered.map((s) => (
                  <CommandItem key={s} value={s} onSelect={() => { setSelected(s); setSearch(''); }} className="flex items-center gap-2">
                    {selected === s && <Check className="w-3 h-3 text-primary" />}
                    <span>{s}</span>
                  </CommandItem>
                ))}
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

      {/* Add new species section */}
      <div className="flex items-center gap-2">
        {!showAddForm ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="text-xs"
          >
            + Lisa uus liik
          </Button>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <Input
              placeholder="Uue liigi nimi, nt. Sookurg"
              value={newSpeciesName}
              onChange={(e) => setNewSpeciesName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSpecies(); }}
              className="text-sm"
              autoFocus
            />
            <Button size="sm" onClick={handleAddSpecies}>Lisa</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowAddForm(false); setNewSpeciesName(''); }}
            >
              Tühista
            </Button>
          </div>
        )}
      </div>

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
              {isCustomSpecies(selected) && !bundledSpecies.has(normalizeUiText(selected).toLowerCase()) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive h-6 px-2"
                  onClick={handleRemoveCustomSpecies}
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Eemalda liik
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {preview ? 'Eelvaade (salvestamata)' : currentAvatar ? 'Pilves salvestatud avatar' : 'Vaikimisi / placeholder'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {selectedScopeMeta && (
              <div className="rounded-md border border-border bg-muted/20 p-3 text-xs space-y-1">
                {selectedScopeMeta.rariliinCode && <div>3+3 kood: {selectedScopeMeta.rariliinCode}</div>}
                {selectedScopeMeta.notificationNote && <div>Teate märkus: {selectedScopeMeta.notificationNote}</div>}
              </div>
            )}
            <Label htmlFor="ebirdCode">eBird speciesCode</Label>
            <Input
              id="ebirdCode"
              placeholder="nt comred2"
              value={ebirdCode}
              onChange={(e) => setEbirdCode(e.target.value)}
            />
            <Label htmlFor="scientificName">Teaduslik nimi (ladina)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="scientificName"
                placeholder="nt Erithacus rubecula"
                value={scientificName}
                onChange={(e) => setScientificName(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleFetchTaxon}
                disabled={fetchingTaxon || !ebirdCode.trim()}
                className="shrink-0 text-xs"
              >
                {fetchingTaxon ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Lae eBirdist'}
              </Button>
            </div>
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
            <Label>Saabumise klassifikatsioon</Label>
            <div className="flex flex-col gap-1 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="is_migrant"
                  value="heuristic"
                  checked={isMigrantMode === 'heuristic'}
                  onChange={() => setIsMigrantMode('heuristic')}
                />
                <span>Heuristika otsustab (vaikeväärtus)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="is_migrant"
                  value="true"
                  checked={isMigrantMode === 'true'}
                  onChange={() => setIsMigrantMode('true')}
                />
                <span>Alati saabuja (jäta talvine vaatlus tähelepanuta)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="is_migrant"
                  value="false"
                  checked={isMigrantMode === 'false'}
                  onChange={() => setIsMigrantMode('false')}
                />
                <span>Ei ole saabuja (alati välistatud)</span>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />
              <span>Saada teavitus uutest vaatlustest</span>
            </label>
            <Button variant="outline" className="w-full" onClick={handleMetaSave} disabled={saving}>
              {ET_STRINGS.saveSpeciesSettings}
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={handleSyncNow} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {syncing ? 'Sünkroonin...' : 'Sünkrooni nüüd'}
            </Button>
            <p className="text-xs text-muted-foreground">Viimane sünkroon: {formatLastSync(lastSyncAt)}</p>
            <div className="rounded-md border border-border bg-muted/20 p-2 text-xs space-y-1">
              <div className="font-medium">Meta Sync Status</div>
              <div>cloudLoaded: {syncStatus.cloudLoaded ? 'yes' : 'no'}</div>
              <div>cloudUpdatedAt: {syncStatus.cloudUpdatedAt || '-'}</div>
              <div>localUpdatedAt: {syncStatus.localUpdatedAt || '-'}</div>
              <div>lastSyncAt: {syncStatus.lastSyncAt || '-'}</div>
              <div>lastSyncError: {syncStatus.lastSyncError || '-'}</div>
            </div>
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
