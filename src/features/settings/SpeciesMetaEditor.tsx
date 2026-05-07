// src/features/settings/SpeciesMetaEditor.tsx
//
// Editor for species_meta_v1.json metadata. Search-driven: user picks a
// species via cmdk Command palette, then edits its fields in a form below.
// Uses the existing speciesMetaCloud.ts client-side persistence.
//
// Gated by PERMISSIONS.speciesEdit (or admin role).

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { PERMISSIONS } from "@/features/auth/permissions";
import { LINNULIIGID_SCOPE } from "@/lib/mapScope";
import type { SpeciesMeta } from "@/lib/speciesMeta";
import {
  downloadSpeciesMetaJson,
  saveSpeciesMetaToCloud,
  type SpeciesMetaCloudItem,
} from "@/lib/speciesMetaCloud";

const RARITY_LEVELS = ["none", "rare", "super", "mega"] as const;

const formSchema = z.object({
  scientificName: z.string().trim().optional(),
  rarityLevel: z.enum(RARITY_LEVELS),
  ebirdCode: z.string().trim().optional(),
  notify: z.boolean(),
  // Tri-state: 'heuristic' (no field), 'true' (always migrant), 'false' (never migrant)
  isMigrantMode: z.enum(["heuristic", "true", "false"]),
});

type FormValues = z.infer<typeof formSchema>;

function deriveMigrantMode(value: boolean | null | undefined): "heuristic" | "true" | "false" {
  if (value === true) return "true";
  if (value === false) return "false";
  return "heuristic";
}

function migrantModeToValue(mode: "heuristic" | "true" | "false"): boolean | null {
  if (mode === "true") return true;
  if (mode === "false") return false;
  return null;
}

export function SpeciesMetaEditor() {
  const { hasPermission, isAdmin } = useAuth();
  const canEdit = isAdmin || hasPermission(PERMISSIONS.speciesEdit);

  const [items, setItems] = useState<Record<string, SpeciesMetaCloudItem>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      scientificName: "",
      rarityLevel: "none",
      ebirdCode: "",
      notify: false,
      isMigrantMode: "heuristic",
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await downloadSpeciesMetaJson(LINNULIIGID_SCOPE);
        if (!cancelled) setItems(data?.items ?? {});
      } catch (err) {
        toast.error(`Liigi-andmete laadimine ebaõnnestus: ${(err as Error).message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedSpecies) return;
    const item = items[selectedSpecies] ?? {};
    form.reset({
      scientificName: item.scientificName ?? "",
      rarityLevel: (item.rarityLevel as typeof RARITY_LEVELS[number]) ?? "none",
      ebirdCode: item.ebirdCode ?? "",
      notify: item.notify === true,
      isMigrantMode: deriveMigrantMode(item.is_migrant),
    });
  }, [selectedSpecies, items, form]);

  const speciesList = useMemo(
    () => Object.keys(items).sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const onSubmit = async (values: FormValues) => {
    if (!selectedSpecies) return;
    setSaving(true);
    try {
      // SpeciesMeta (the public patch type) doesn't include is_migrant, but
      // normalizeCloudItem in speciesMetaCloud.ts now passes it through.
      // Cast at the boundary; the runtime path is correct.
      const patch: Partial<SpeciesMetaCloudItem> = {
        scientificName: values.scientificName?.trim() || undefined,
        rarityLevel: values.rarityLevel,
        ebirdCode: values.ebirdCode?.trim() || undefined,
        notify: values.notify,
        is_migrant: migrantModeToValue(values.isMigrantMode),
      };
      await saveSpeciesMetaToCloud(
        selectedSpecies,
        patch as unknown as Partial<SpeciesMeta>,
        LINNULIIGID_SCOPE,
      );
      const fresh = await downloadSpeciesMetaJson(LINNULIIGID_SCOPE);
      setItems(fresh?.items ?? {});
      toast.success(`Salvestatud: ${selectedSpecies}`);
    } catch (err) {
      toast.error(`Salvestamine ebaõnnestus: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Liigi-andmete redigeerimiseks puudub luba.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Laen liigi-andmeid…
      </div>
    );
  }

  const selectedItem = selectedSpecies ? items[selectedSpecies] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liigi-andmete redigeerimine</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Liik</Label>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start font-normal"
            onClick={() => setSearchOpen((v) => !v)}
          >
            {selectedSpecies ?? "Vali liik…"}
          </Button>
          {searchOpen && (
            <div className="mt-2 rounded-md border bg-popover">
              <Command>
                <CommandInput placeholder="Otsi liiki…" autoFocus />
                <CommandList>
                  <CommandEmpty>Ei leitud.</CommandEmpty>
                  <CommandGroup>
                    {speciesList.map((name) => {
                      const rarity = items[name]?.rarityLevel;
                      return (
                        <CommandItem
                          key={name}
                          value={name}
                          onSelect={() => {
                            setSelectedSpecies(name);
                            setSearchOpen(false);
                          }}
                        >
                          {name}
                          {rarity && rarity !== "none" && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {rarity}
                            </span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          )}
        </div>

        {selectedSpecies && (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="scientificName">Teaduslik nimi</Label>
              <Input id="scientificName" {...form.register("scientificName")} placeholder="Genus species" />
            </div>

            <div className="space-y-1">
              <Label>Haruldus</Label>
              <RadioGroup
                value={form.watch("rarityLevel")}
                onValueChange={(v) => form.setValue("rarityLevel", v as typeof RARITY_LEVELS[number])}
                className="flex flex-wrap gap-3"
              >
                {RARITY_LEVELS.map((lvl) => (
                  <div key={lvl} className="flex items-center gap-2">
                    <RadioGroupItem value={lvl} id={`rarity-${lvl}`} />
                    <Label htmlFor={`rarity-${lvl}`} className="font-normal capitalize">
                      {lvl === "none" ? "tavaline" : lvl}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ebirdCode">eBird kood</Label>
              <Input id="ebirdCode" {...form.register("ebirdCode")} placeholder="nt. eurgri1" />
            </div>

            <div className="space-y-1">
              <Label>Saabumise klassifikatsioon</Label>
              <RadioGroup
                value={form.watch("isMigrantMode")}
                onValueChange={(v) =>
                  form.setValue("isMigrantMode", v as "heuristic" | "true" | "false")
                }
                className="space-y-1"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="heuristic" id="migrant-heuristic" />
                  <Label htmlFor="migrant-heuristic" className="font-normal">
                    Heuristika otsustab (vaikeväärtus)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="true" id="migrant-true" />
                  <Label htmlFor="migrant-true" className="font-normal">
                    Alati saabuja (jäta talvine vaatlus tähelepanuta)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="false" id="migrant-false" />
                  <Label htmlFor="migrant-false" className="font-normal">
                    Ei ole saabuja (alati välistatud)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="notify"
                checked={form.watch("notify")}
                onCheckedChange={(v) => form.setValue("notify", v === true)}
              />
              <Label htmlFor="notify" className="font-normal">
                Saada teavitus uutest vaatlustest
              </Label>
            </div>

            {selectedItem?.avatarUrl && (
              <div className="text-xs text-muted-foreground break-all">
                Avatar: <code>{selectedItem.avatarUrl}</code> (haldatav avatari haldurist)
              </div>
            )}

            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salvesta
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
