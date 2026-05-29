import { supabase } from '@/config/supabaseClient';

export interface EbirdPin {
  ebirdId: string;        // composite fingerprint subId+lat+lng+obsDt
  species: string;
  speciesCode: string | null;
  lat: number;
  lon: number;
  obsDate: string | null;
  locationName: string | null;
  countObserved: number | null;
  checklistSubId: string | null;
}

const USA_SCOPES = new Set(['usa_co', 'usa_pa', 'usa_i70']);
const isUsaScope = (s: string) => USA_SCOPES.has(s);

export async function loadEbirdPins(mapScope: string): Promise<EbirdPin[]> {
  if (!isUsaScope(mapScope)) return [];
  try {
    const { data, error } = await supabase
      .from('ebird_pins')
      .select('ebird_id, species, species_code, lat, lon, obs_date, location_name, count_observed, checklist_sub_id')
      .eq('map_scope', mapScope);
    if (error) { console.warn('[ebirdPins] load failed', error); return []; }
    return (data || []).map((r: any) => ({
      ebirdId: String(r.ebird_id),
      species: String(r.species),
      speciesCode: r.species_code ?? null,
      lat: Number(r.lat),
      lon: Number(r.lon),
      obsDate: r.obs_date ?? null,
      locationName: r.location_name ?? null,
      countObserved: r.count_observed ?? null,
      checklistSubId: r.checklist_sub_id ?? null,
    }));
  } catch (e) {
    console.warn('[ebirdPins] load threw', e);
    return [];
  }
}

export async function addEbirdPin(mapScope: string, pin: EbirdPin): Promise<boolean> {
  if (!isUsaScope(mapScope)) return false;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) { console.warn('[ebirdPins] no auth user; cannot pin'); return false; }
    const { error } = await supabase
      .from('ebird_pins')
      .upsert({
        user_id: userId,
        map_scope: mapScope,
        ebird_id: String(pin.ebirdId),
        species: pin.species,
        species_code: pin.speciesCode ?? null,
        lat: pin.lat,
        lon: pin.lon,
        obs_date: pin.obsDate ?? null,
        location_name: pin.locationName ?? null,
        count_observed: pin.countObserved ?? null,
        checklist_sub_id: pin.checklistSubId ?? null,
      }, { onConflict: 'user_id,map_scope,ebird_id' });
    if (error) { console.warn('[ebirdPins] add failed', error); return false; }
    return true;
  } catch (e) {
    console.warn('[ebirdPins] add threw', e);
    return false;
  }
}

export async function removeEbirdPin(mapScope: string, ebirdId: string): Promise<boolean> {
  if (!isUsaScope(mapScope)) return false;
  try {
    const { error } = await supabase
      .from('ebird_pins')
      .delete()
      .eq('map_scope', mapScope)
      .eq('ebird_id', String(ebirdId));
    if (error) { console.warn('[ebirdPins] remove failed', error); return false; }
    return true;
  } catch (e) {
    console.warn('[ebirdPins] remove threw', e);
    return false;
  }
}
