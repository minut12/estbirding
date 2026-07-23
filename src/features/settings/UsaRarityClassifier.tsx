import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { USA_CO_SCOPE, USA_I70_SCOPE, USA_PA_SCOPE, type SpeciesScopeConfig } from '@/lib/mapScope';
import { fetchSpeciesList, notifyIframeUpdate } from '@/lib/avatar-storage';
import { downloadSpeciesMetaJson, saveSpeciesMetaBatchToCloud } from '@/lib/speciesMetaCloud';
import { fetchGbifOccurrenceCount } from '@/lib/gbifOccurrenceCount';
import { fetchEbirdTaxon } from '@/lib/ebirdTaxon';
import { rarityFromObsCount, type RarityLevel } from '@/lib/rarityFromObs';
import { normalizeSpeciesName } from '@/lib/textNormalize';
import { ET_STRINGS } from '@/lib/etStrings';

const US_SCOPES: SpeciesScopeConfig[] = [USA_CO_SCOPE, USA_PA_SCOPE, USA_I70_SCOPE];
const GBIF_CONCURRENCY = 3;

type SkipReason = '>500k' | 'käsitsi' | 'nimi puudub' | 'vaatlusi ei leitud';

type ProposalRow = {
  scopeId: string;
  scopeName: string;
  species: string;
  obs: number | null;
  current: RarityLevel;
  proposed: RarityLevel | null; // non-null → change; null → skip (see reason)
  reason?: SkipReason;
};

const RARITY_ET: Record<RarityLevel, string> = {
  none: ET_STRINGS.rarityNormal,
  rare: ET_STRINGS.rarityRare,
  super: ET_STRINGS.raritySuper,
  mega: ET_STRINGS.rarityMega,
};

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, () => worker()));
  return results;
}

type CloudItem = { rarityLevel?: string; scientificName?: string; ebirdCode?: string };

async function evaluateSpecies(scope: SpeciesScopeConfig, species: string, item: CloudItem | undefined): Promise<ProposalRow> {
  const base: ProposalRow = {
    scopeId: scope.id,
    scopeName: scope.displayName,
    species,
    obs: null,
    current: (item?.rarityLevel as RarityLevel) || 'none',
    proposed: null,
  };

  // Rule 2 — never override a manual (non-'none') choice.
  if (base.current !== 'none') return { ...base, reason: 'käsitsi' };

  // Rule 3 — need a scientific name; resolve from ebirdCode if absent.
  let sci = (item?.scientificName || '').trim();
  if (!sci && item?.ebirdCode) {
    try {
      const taxon = await fetchEbirdTaxon(item.ebirdCode);
      if (taxon?.sciName) sci = taxon.sciName.trim();
    } catch (err) {
      console.warn('[UsaRarityClassifier] taxon resolve failed', { species, error: err });
    }
  }
  if (!sci) return { ...base, reason: 'nimi puudub' };

  // Rule 4 — need an eBird global count.
  let count: number | null = null;
  try {
    count = await fetchGbifOccurrenceCount(sci);
  } catch (err) {
    console.warn('[UsaRarityClassifier] obs count failed', { species, sci, error: err });
    count = null;
  }
  if (count == null) return { ...base, reason: 'vaatlusi ei leitud' };

  // Rule 5 — leave common species (> 500k) untouched.
  const proposed = rarityFromObsCount(count);
  if (proposed == null) return { ...base, obs: count, reason: '>500k' };

  // Rule 6 — propose the banded rarity.
  return { ...base, obs: count, proposed };
}

export default function UsaRarityClassifier({ scope }: { scope: SpeciesScopeConfig }) {
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [rows, setRows] = useState<ProposalRow[]>([]);

  const handleClassify = useCallback(async () => {
    setProcessing(true);
    setProgress({ done: 0, total: 0 });
    try {
      const perScope = await Promise.all(
        US_SCOPES.map(async (s) => {
          const [list, json] = await Promise.all([fetchSpeciesList(s), downloadSpeciesMetaJson(s)]);
          const items = (json?.items ?? {}) as Record<string, CloudItem>;
          return { scope: s, species: list, items };
        }),
      );

      const flat = perScope.flatMap(({ scope: s, species, items }) =>
        species.map((sp) => ({ scope: s, species: sp, item: items[sp] ?? items[normalizeSpeciesName(sp)] })),
      );

      setProgress({ done: 0, total: flat.length });
      let done = 0;
      const computed = await mapWithConcurrency(flat, GBIF_CONCURRENCY, async (entry) => {
        const row = await evaluateSpecies(entry.scope, entry.species, entry.item);
        done += 1;
        setProgress({ done, total: flat.length });
        return row;
      });

      setRows(computed);
      setOpen(true);
    } catch (err) {
      console.error('[UsaRarityClassifier] classify failed', err);
    } finally {
      setProcessing(false);
    }
  }, []);

  const changeCount = rows.filter((r) => r.proposed != null).length;
  const skipCount = rows.length - changeCount;
  const groups = US_SCOPES
    .map((s) => ({ scope: s, rows: rows.filter((r) => r.scopeId === s.id) }))
    .filter((g) => g.rows.length > 0);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const changes = rows.filter((r) => r.proposed != null);
      const byScope = new Map<string, { scope: SpeciesScopeConfig; patches: Record<string, { rarityLevel: RarityLevel }> }>();
      for (const r of changes) {
        const target = US_SCOPES.find((s) => s.id === r.scopeId);
        if (!target || r.proposed == null) continue;
        if (!byScope.has(r.scopeId)) byScope.set(r.scopeId, { scope: target, patches: {} });
        byScope.get(r.scopeId)!.patches[r.species] = { rarityLevel: r.proposed };
      }

      let saved = 0;
      for (const { scope: target, patches } of byScope.values()) {
        await saveSpeciesMetaBatchToCloud(patches, target);
        saved += Object.keys(patches).length;
        try { notifyIframeUpdate('update', '', undefined, target); } catch { /* iframe may be absent */ }
      }
      toast.success(`Salvestatud: ${saved} liiki`);
      setOpen(false);
    } catch (err) {
      console.error('[UsaRarityClassifier] save failed', err);
    } finally {
      setSaving(false);
    }
  }, [rows]);

  return (
    <div data-scope={scope.id}>
      <Button variant="outline" size="sm" className="gap-2" onClick={handleClassify} disabled={processing}>
        {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        {processing ? `Töötlen… ${progress.done}/${progress.total}` : 'Haruldused vaatluste järgi (USA)'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Eelvaade — haruldused vaatluste järgi</DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto space-y-4">
            {groups.map((g) => (
              <div key={g.scope.id} className="space-y-1">
                <div className="text-sm font-medium">{g.scope.displayName}</div>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1 pr-2">Liik</th>
                      <th className="py-1 pr-2">Vaatlusi</th>
                      <th className="py-1 pr-2">Praegune</th>
                      <th className="py-1 pr-2">Uus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={`${r.scopeId}:${r.species}`} className="border-t border-border">
                        <td className="py-1 pr-2">{r.species}</td>
                        <td className="py-1 pr-2 tabular-nums">{r.obs == null ? '—' : r.obs.toLocaleString('et-EE')}</td>
                        <td className="py-1 pr-2">{RARITY_ET[r.current]}</td>
                        <td className="py-1 pr-2">
                          {r.proposed != null
                            ? <span className="font-medium text-foreground">{RARITY_ET[r.proposed]}</span>
                            : <span className="text-muted-foreground">{r.reason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">Muudetakse: {changeCount} · Jäetakse vahele: {skipCount}</p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Tühista</Button>
            <Button onClick={handleSave} disabled={saving || changeCount === 0} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Salvesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
