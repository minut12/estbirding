import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Upload, Trash2, Bird, RefreshCw, Cloud, Loader2, ChevronLeft, ChevronRight, Bell, Images } from 'lucide-react';
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
import { fetchGbifOccurrenceCount } from '@/lib/gbifOccurrenceCount';
import UsaRarityClassifier from '@/features/settings/UsaRarityClassifier';
import { ET_STRINGS } from '@/lib/etStrings';
import { normalizeUiText } from '@/lib/textNormalize';
import { isDeveloperModeEnabled } from '@/config/supabaseConfig';
import type { AvatarCredit } from '@/lib/avatarCandidates';
import { AvatarPickerSheet, creditLine } from '@/features/settings/AvatarPickerSheet';

type RarityLevel = 'none' | 'rare' | 'super' | 'mega';
type MigrantMode = 'heuristic' | 'true' | 'false';
type ListFilter = 'all' | 'nocode' | 'noavatar' | 'notify';
type SpeciesRow = {
  name: string;
  avatar: string;
  latin: string;
  code: string;
  rarity: RarityLevel;
  notify: boolean;
  migrant: MigrantMode;
};

const RARITY_OPTIONS: ReadonlyArray<{ value: RarityLevel; label: string }> = [
  { value: 'none', label: ET_STRINGS.rarityNormal },
  { value: 'rare', label: ET_STRINGS.rarityRare },
  { value: 'super', label: ET_STRINGS.raritySuper },
  { value: 'mega', label: ET_STRINGS.rarityMega },
];
const NOTE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'V\u00e4ljas' },
  { value: 'k\u00f5ik teated', label: 'K\u00f5ik teated' },
  { value: 'ainult haruldused', label: 'Ainult haruldused' },
];
const MIGRANT_OPTIONS: ReadonlyArray<{ value: MigrantMode; title: string; sub: string }> = [
  { value: 'heuristic', title: 'Heuristika otsustab', sub: 'Vaikimisi' },
  { value: 'true', title: 'Alati saabuja', sub: 'Talvist vaatlust ei arvestata' },
  { value: 'false', title: 'Ei ole saabuja', sub: 'Kevadr\u00e4ndest alati v\u00e4lja j\u00e4etud' },
];
const MIGRANT_CHIP_LABEL: Record<MigrantMode, string> = {
  true: 'Saabuja',
  false: 'Ei saabu',
  heuristic: 'Heuristika',
};
const LIST_FILTER_OPTIONS: ReadonlyArray<{ value: ListFilter; label: string }> = [
  { value: 'all', label: 'K\u00f5ik' },
  { value: 'nocode', label: 'Koodita' },
  { value: 'noavatar', label: 'Avatarita' },
  { value: 'notify', label: 'Teavitusega' },
];
const SECTION_LABEL_CLASS = 'text-[13px] font-semibold text-muted-foreground mb-2 ml-1';
const SECTION_BODY_CLASS = 'rounded-[14px] border border-border bg-card p-3.5 space-y-3';

export default function AvatarManager({ scope = LINNULIIGID_SCOPE }: { scope?: SpeciesScopeConfig }) {
  const [species, setSpecies] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingCredit, setPendingCredit] = useState<AvatarCredit | null>(null);
  const [saving, setSaving] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [ebirdCode, setEbirdCode] = useState('');
  const [rarityLevel, setRarityLevel] = useState<'none' | 'rare' | 'super' | 'mega'>('none');
  const [rariliinCode, setRariliinCode] = useState('');
  const [notificationNote, setNotificationNote] = useState('');
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
  // Read-only GBIF obs-count line — display-only local state, never persisted.
  const [obsCount, setObsCount] = useState<number | null>(null);
  const [obsLoading, setObsLoading] = useState(false);
  const [obsError, setObsError] = useState(false);
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const hydratedSelectionRef = useRef<string | null>(null);

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
    const onDiscoveredUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { scopeId?: string } | undefined;
      // Only refresh if the discovery belongs to the currently-viewed scope.
      if (detail && detail.scopeId && detail.scopeId !== scope.id) return;
      fetchSpeciesList(scope).then((list) => { if (list.length > 0) setSpecies(list.map(normalizeUiText)); });
    };
    window.addEventListener('discovered-species-updated', onDiscoveredUpdated as EventListener);
    return () => window.removeEventListener('discovered-species-updated', onDiscoveredUpdated as EventListener);
  }, [scope]);

  useEffect(() => {
    if (!selected) {
      hydratedSelectionRef.current = null;
      setCurrentAvatar(null);
      setPreview(null);
      setPendingCredit(null);
      setEbirdCode('');
      setRarityLevel('none');
      setScientificName('');
      return;
    }
    const selectionKey = `${scope.id}::${selected}`;
    if (hydratedSelectionRef.current === selectionKey) return; // background refresh: don't clobber unsaved edits
    hydratedSelectionRef.current = selectionKey;
    const avatars = getMergedAvatars(scope);
    const meta = scope.id === 'rariliin'
      ? getRariliinSpeciesMeta(selected, scopeMetadata)
      : getScopedSpeciesMeta(selected, scope);
    setCurrentAvatar(meta.avatarUrl || avatars[selected] || null);
    setEbirdCode(meta.ebirdCode || '');
    setRarityLevel(meta.rarityLevel || 'none');
    setRariliinCode(meta.rariliinCode || '');
    setNotificationNote(meta.notificationNote || '');
    setScientificName(meta.scientificName || '');
    const cloudItem = cloudItems[selected];
    setIsMigrantMode(
      cloudItem?.is_migrant === true ? 'true' :
      cloudItem?.is_migrant === false ? 'false' : 'heuristic'
    );
    setNotify(cloudItem?.notify === true);
    setPreview(null);
    setPendingCredit(null);
  }, [scope, selected, scopeMetadata, avatarsReady, cloudItems]);

  // Live global eBird observation count (via GBIF's eBird dataset) for the current
  // sciName (display-only; never saved).
  useEffect(() => {
    if (scope.id === 'rariliin' || !selected || !scientificName.trim()) {
      setObsCount(null);
      setObsLoading(false);
      setObsError(false);
      return;
    }
    let cancelled = false;
    setObsLoading(true);
    setObsError(false);
    fetchGbifOccurrenceCount(scientificName.trim())
      .then((count) => {
        if (cancelled) return;
        setObsCount(count);
        setObsError(count == null);
      })
      .catch(() => {
        if (cancelled) return;
        setObsCount(null);
        setObsError(true);
      })
      .finally(() => {
        if (!cancelled) setObsLoading(false);
      });
    return () => { cancelled = true; };
  }, [scope, selected, scientificName]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) { toast.error(err); return; }
    setProcessing(true);
    try {
      const dataUrl = await processImage(file);
      setPreview(dataUrl);
      setPendingCredit(null);
    } catch (ex: any) {
      toast.error(ex?.message || 'Pildi töötlemine ebaõnnestus');
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  const handlePickedFile = useCallback(async (file: File, credit: AvatarCredit): Promise<void> => {
    const err = validateFile(file);
    if (err) {
      toast.error(err);
      throw new Error(err);
    }
    setProcessing(true);
    try {
      const dataUrl = await processImage(file);
      setPreview(dataUrl);
      setPendingCredit(credit);
    } catch (ex: unknown) {
      toast.error(ex instanceof Error && ex.message ? ex.message : 'Pildi t\u00f6\u00f6tlemine eba\u00f5nnestus');
      throw ex;
    } finally {
      setProcessing(false);
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
      const creditToSave = pendingCredit;
      const publicUrl = await uploadSharedAvatar(selected, preview, scope, creditToSave);
      console.info('[avatar-manager] avatar upload end', { species: selected, publicUrl });
      const cloudPatch = { ...patch, avatarUrl: publicUrl, is_migrant: migrantValue };
      console.info('[avatar-manager] metadata save start', { species: selected, patch: cloudPatch });
      const merged = await saveSpeciesMetaToCloud(selected, cloudPatch as unknown as Partial<SpeciesMeta>, scope);
      console.info('[avatar-manager] metadata save end', { species: selected, saved: Boolean(merged[selected]) });
      setCurrentAvatar(publicUrl);
      setPreview(null);
      setPendingCredit(null);
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
  }, [saving, scope, selected, preview, pendingCredit, ebirdCode, rarityLevel, scientificName, notify, isMigrantMode]);

  const handleRemove = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await removeSharedAvatar(selected, scope);
      setCurrentAvatar(null);
      setPreview(null);
      setPendingCredit(null);
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
      if (scope.id === 'rariliin') {
        const patch = {
          rarityLevel,
          rariliinCode: rariliinCode.trim() || undefined,
          notificationNote: notificationNote || undefined,
          notify,
        };
        upsertSpeciesMeta(selected, patch as unknown as Partial<SpeciesMeta>, scope);
        window.dispatchEvent(new CustomEvent('species-meta-updated'));
        return patch;
      }
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
  }, [saving, scope, selected, ebirdCode, rarityLevel, currentAvatar, scientificName, notify, isMigrantMode, rariliinCode, notificationNote]);

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

  const handleSaveAll = useCallback(async () => {
    if (!preview) { handleMetaSave(); return; }
    await handleSave();
    if (scope.id === 'rariliin') handleMetaSave();
  }, [preview, scope, handleSave, handleMetaSave]);

  const isRariliin = scope.id === 'rariliin';
  const activeKey = selected || manualKey;
  const displayUrl = preview || currentAvatar || scope.placeholderAvatarUrl;
  const hasSpecies = species.length > 0;
  const selectedScopeMeta = selected
    ? (scope.id === 'rariliin'
      ? getRariliinSpeciesMeta(selected, scopeMetadata)
      : getScopedSpeciesMeta(selected, scope))
    : null;

  // avatarsReady is a dep so the merged avatar cache is re-read once shared avatars load.
  const rowData = useMemo(() => {
    const avatars = getMergedAvatars(scope);
    return species.map((s): SpeciesRow => {
      const meta = scope.id === 'rariliin'
        ? getRariliinSpeciesMeta(s, scopeMetadata)
        : getScopedSpeciesMeta(s, scope);
      const cloud = cloudItems[s];
      return {
        name: s,
        avatar: meta.avatarUrl || avatars[s] || '',
        latin: meta.scientificName || '',
        code: meta.rariliinCode || '',
        rarity: meta.rarityLevel || 'none',
        notify: cloud?.notify === true || meta.notify === true,
        migrant: cloud?.is_migrant === true ? 'true' : cloud?.is_migrant === false ? 'false' : 'heuristic',
      };
    });
  }, [species, scope, scopeMetadata, avatarsReady, cloudItems]);

  const searchNeedle = normalizeUiText(search).toLowerCase().trim();
  const visibleRows = rowData.filter((row) => {
    if (listFilter === 'nocode' && row.code) return false;
    if (listFilter === 'noavatar' && row.avatar) return false;
    if (listFilter === 'notify' && !row.notify) return false;
    if (!searchNeedle) return true;
    const haystack = [row.name, row.latin, isRariliin ? row.code : ''];
    return haystack.some((value) => normalizeUiText(value).toLowerCase().includes(searchNeedle));
  });

  const filterOptions = LIST_FILTER_OPTIONS.filter((opt) => isRariliin || opt.value !== 'nocode');
  const headerLatin = isRariliin ? (selectedScopeMeta?.scientificName || '') : scientificName.trim();
  const canRemoveCustom = isCustomSpecies(selected) && !bundledSpecies.has(normalizeUiText(selected).toLowerCase());

  const renderRarityGrid = () => (
    <>
      <div role="radiogroup" aria-label={ET_STRINGS.rarityLabel} className="grid grid-cols-2 gap-2">
        {RARITY_OPTIONS.map((opt) => {
          const isActive = rarityLevel === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setRarityLevel(opt.value)}
              className={`rounded-[10px] border px-3 py-2 text-sm text-left ${isActive ? 'border-primary bg-accent font-semibold' : 'border-border bg-card'}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <select
        id="rarityLevel"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        value={rarityLevel}
        onChange={(e) => setRarityLevel(e.target.value as 'none' | 'rare' | 'super' | 'mega')}
      >
        {RARITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </>
  );

  const renderNotifyRow = () => (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="speciesNotify" className="text-sm font-normal">Saada teavitus uutest vaatlustest</Label>
      <Switch id="speciesNotify" checked={notify} onCheckedChange={(c) => setNotify(c)} />
    </div>
  );

  const renderRariliinSections = () => (
    <section>
      <h3 className={SECTION_LABEL_CLASS}>Rariliin</h3>
      <div className={SECTION_BODY_CLASS}>
        <div className="space-y-1.5">
          <Label htmlFor="rariliinCode">3+3 kood</Label>
          <Input
            id="rariliinCode"
            placeholder="nt SAXOLA"
            maxLength={6}
            className="h-[52px] text-[22px] font-mono font-semibold tracking-[0.14em] uppercase border-2 border-primary text-center"
            value={rariliinCode}
            onChange={(e) => setRariliinCode(e.target.value)}
          />
          <p className="text-[13px] text-muted-foreground">Perekonna ja liigi nime kolm esimest t&auml;hte</p>
        </div>
        <div className="space-y-1.5">
          <Label>{ET_STRINGS.rarityLabel}</Label>
          {renderRarityGrid()}
        </div>
        {renderNotifyRow()}
        <div className="space-y-1.5">
          <Label>Teate m&auml;rkus</Label>
          <div id="notificationNote" className="flex bg-muted rounded-[10px] p-[3px]">
            {NOTE_OPTIONS.map((opt) => {
              const isActive = notificationNote === opt.value;
              return (
                <button
                  key={opt.value || 'off'}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setNotificationNote(opt.value)}
                  className={`flex-1 rounded-[8px] py-1.5 text-sm ${isActive ? 'bg-card shadow-sm font-semibold text-foreground' : 'text-muted-foreground'}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );

  const renderSpeciesSections = () => (
    <>
      <section>
        <h3 className={SECTION_LABEL_CLASS}>Nimed ja koodid</h3>
        <div className={SECTION_BODY_CLASS}>
          <div className="space-y-1.5">
            <Label htmlFor="ebirdCode">eBird speciesCode</Label>
            <Input
              id="ebirdCode"
              placeholder="nt comred2"
              value={ebirdCode}
              onChange={(e) => setEbirdCode(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
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
            {scientificName.trim() && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>Vaatlusi kokku (eBird):</span>
                {obsLoading
                  ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> laen&hellip;</span>
                  : obsError || obsCount == null
                    ? <span title={'GBIF p\u00e4ring eba\u00f5nnestus'}>&mdash;</span>
                    : <span className="font-medium text-foreground tabular-nums">{obsCount.toLocaleString('et-EE')}</span>}
              </p>
            )}
          </div>
        </div>
      </section>
      <section>
        <h3 className={SECTION_LABEL_CLASS}>{ET_STRINGS.rarityLabel}</h3>
        <div className={SECTION_BODY_CLASS}>
          {renderRarityGrid()}
        </div>
      </section>
      <section>
        <h3 className={SECTION_LABEL_CLASS}>Saabumine</h3>
        <div className="rounded-[14px] border border-border bg-card overflow-hidden divide-y divide-border">
          {MIGRANT_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer">
              <input
                type="radio"
                name="is_migrant"
                value={opt.value}
                checked={isMigrantMode === opt.value}
                onChange={() => setIsMigrantMode(opt.value)}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-foreground">{opt.title}</span>
                <span className="block text-[13px] text-muted-foreground">{opt.sub}</span>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section>
        <h3 className={SECTION_LABEL_CLASS}>Teavitused</h3>
        <div className={SECTION_BODY_CLASS}>
          {renderNotifyRow()}
        </div>
      </section>
    </>
  );

  const renderDevSync = () => (
    <div className="space-y-2">
      <Button variant="outline" className="w-full gap-2" onClick={handleSyncNow} disabled={syncing}>
        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {syncing ? 'S\u00fcnkroonin...' : 'S\u00fcnkrooni n\u00fc\u00fcd'}
      </Button>
      <p className="text-xs text-muted-foreground">Viimane s&uuml;nkroon: {formatLastSync(lastSyncAt)}</p>
      <div className="rounded-md border border-border bg-muted/20 p-2 text-xs space-y-1">
        <div className="font-medium">Meta Sync Status</div>
        <div>cloudLoaded: {syncStatus.cloudLoaded ? 'yes' : 'no'}</div>
        <div>cloudUpdatedAt: {syncStatus.cloudUpdatedAt || '-'}</div>
        <div>localUpdatedAt: {syncStatus.localUpdatedAt || '-'}</div>
        <div>lastSyncAt: {syncStatus.lastSyncAt || '-'}</div>
        <div>lastSyncError: {syncStatus.lastSyncError || '-'}</div>
      </div>
    </div>
  );

  const renderEditor = (showBack: boolean) => (
    <div className="space-y-4">
      {showBack && (
        <button
          type="button"
          onClick={() => { setSelected(''); setManualKey(''); }}
          className="inline-flex items-center gap-1 text-primary font-medium text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Liigid
        </button>
      )}
      <div className="rounded-[14px] border border-border bg-card p-3.5 flex items-center gap-4">
        <Avatar className="w-24 h-24 border border-border shrink-0">
          <AvatarImage src={displayUrl} alt={activeKey} />
          <AvatarFallback><Bird className="w-8 h-8 text-muted-foreground" /></AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-lg font-semibold text-foreground truncate">{activeKey}</p>
          {headerLatin && <p className="text-[13px] italic text-muted-foreground truncate">{headerLatin}</p>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileChange} />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={processing || saving} onClick={() => fileRef.current?.click()}>
              {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Vaheta pilti
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!headerLatin || processing || saving}
              onClick={() => setPickerOpen(true)}
            >
              <Images className="w-3.5 h-3.5" />
              Vali pilt
            </Button>
            {currentAvatar && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRemove} disabled={saving}>
                <Trash2 className="w-3.5 h-3.5" />
                Eemalda
              </Button>
            )}
          </div>
          {!headerLatin && <p className="text-xs text-muted-foreground">Lisa enne teaduslik nimi</p>}
          <p className="text-xs text-muted-foreground">
            {preview ? 'Eelvaade (salvestamata)' : currentAvatar ? 'Pilves salvestatud avatar' : 'Vaikimisi / placeholder'}
          </p>
          {pendingCredit && preview && (
            <p className="text-xs text-muted-foreground">{creditLine(pendingCredit)}</p>
          )}
          <AvatarPickerSheet
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            speciesName={activeKey}
            scientificName={headerLatin}
            onPicked={handlePickedFile}
            onUploadOwn={() => fileRef.current?.click()}
          />
        </div>
      </div>

      {isRariliin ? renderRariliinSections() : renderSpeciesSections()}

      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-card border-t border-border">
        <Button className="w-full" onClick={() => { void handleSaveAll(); }} disabled={saving || processing}>
          Salvesta
        </Button>
      </div>
      {isDeveloperModeEnabled() && renderDevSync()}

      {canRemoveCustom && (
        <button type="button" className="text-destructive text-sm font-medium" onClick={handleRemoveCustomSpecies}>
          Eemalda liik
        </button>
      )}
    </div>
  );

  const renderRowChips = (row: SpeciesRow) => (
    <div className="flex items-center gap-1.5 shrink-0">
      {isRariliin
        ? (row.code
          ? <span className="font-mono text-xs font-semibold tracking-wider rounded-md bg-foreground text-background px-1.5 py-0.5">{row.code}</span>
          : <span className="rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs px-1.5 py-0.5">Kood puudub</span>)
        : <span className="rounded-md bg-muted text-muted-foreground text-xs px-1.5 py-0.5">{MIGRANT_CHIP_LABEL[row.migrant]}</span>}
      {row.notify && <Bell className="w-4 h-4 text-primary" />}
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </div>
  );

  const renderSpeciesList = () => (
    <div className="space-y-3">
      <Input
        placeholder={isRariliin ? 'Otsi liiki, ladinakeelset nime v\u00f5i koodi' : 'Otsi liiki v\u00f5i ladinakeelset nime'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((opt) => {
          const isActive = listFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setListFilter(opt.value)}
              className={`rounded-full px-3 py-1 text-[13px] border ${isActive ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div data-testid="species-list" className="rounded-[14px] border border-border bg-card overflow-hidden divide-y divide-border">
        {visibleRows.length === 0 && (
          <p className="px-3.5 py-3 text-sm text-muted-foreground">Tulemusi pole</p>
        )}
        {visibleRows.map((row) => {
          const rarityLabel = isRariliin && row.rarity !== 'none'
            ? RARITY_OPTIONS.find((opt) => opt.value === row.rarity)?.label
            : undefined;
          return (
            <button
              key={row.name}
              type="button"
              className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 min-h-[58px]"
              onClick={() => { setSelected(row.name); setSearch(''); }}
            >
              {row.avatar
                ? <img src={row.avatar} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" />
                : (
                  <span className="w-10 h-10 rounded-full border-2 border-dashed border-border grid place-items-center text-sm font-semibold text-muted-foreground shrink-0">
                    {row.name.charAt(0).toUpperCase()}
                  </span>
                )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{row.name}</div>
                {row.latin && <div className="text-[13px] italic text-muted-foreground truncate">{row.latin}</div>}
                {rarityLabel && <div className="text-[13px] text-muted-foreground truncate">{rarityLabel}</div>}
              </div>
              {renderRowChips(row)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderAddSpecies = () => (
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
            T&uuml;hista
          </Button>
        </div>
      )}
    </div>
  );

  // Editor replaces the list once a species is picked. Without a species list the
  // manual-name input stays on screen (it sets `selected` on every keystroke) and the
  // editor renders below it, without a back button.
  if (hasSpecies && activeKey) {
    return renderEditor(true);
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Cloud className="w-4 h-4 text-primary" />
        {scope.displayName} {ET_STRINGS.speciesSettings.toLowerCase()}
      </h3>
      <p className="text-xs text-muted-foreground">{isRariliin ? 'Ainult Rariliini v\u00e4ljad: 3+3 kood ja teate m\u00e4rkus.' : ET_STRINGS.sharedManaged}</p>

      {renderAddSpecies()}

      {hasSpecies ? renderSpeciesList() : (
        <div className="space-y-1.5">
          <Label htmlFor="manualSpecies">Liigi nimi (k&auml;sitsi)</Label>
          <Input
            id="manualSpecies"
            placeholder="nt. Sookurg"
            value={manualKey}
            onChange={(e) => { setManualKey(e.target.value); setSelected(e.target.value); }}
          />
          <p className="text-xs text-destructive">species.json ei laadunud. Sisesta liigi nimi k&auml;sitsi.</p>
        </div>
      )}

      {!hasSpecies && activeKey && (
        <>
          <Separator />
          {renderEditor(false)}
        </>
      )}

      {scope.id.startsWith('usa_') && (
        <>
          <Separator />
          <UsaRarityClassifier scope={scope} />
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
