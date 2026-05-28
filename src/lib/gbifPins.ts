import { supabase } from '@/config/supabaseClient';

export interface GbifPin {
  gbifId: string;
  species: string;
  lat: number;
  lon: number;
  date: string | null;
}

const USA_SCOPES = new Set(['usa_co', 'usa_pa', 'usa_i70']);

function isUsaScope(mapScope: string): boolean {
  return USA_SCOPES.has(mapScope);
}

export async function loadGbifPins(mapScope: string): Promise<GbifPin[]> {
  if (!isUsaScope(mapScope)) return [];
  try {
    const { data, error } = await supabase
      .from('gbif_pins')
      .select('gbif_id, species, lat, lon, event_date')
      .eq('map_scope', mapScope);
    if (error) { console.warn('[gbifPins] load failed', error); return []; }
    return (data || []).map((r: any) => ({
      gbifId: String(r.gbif_id),
      species: String(r.species),
      lat: Number(r.lat),
      lon: Number(r.lon),
      date: r.event_date ?? null,
    }));
  } catch (e) {
    console.warn('[gbifPins] load threw', e);
    return [];
  }
}

export async function addGbifPin(mapScope: string, pin: GbifPin): Promise<boolean> {
  if (!isUsaScope(mapScope)) return false;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) { console.warn('[gbifPins] no auth user; cannot pin'); return false; }
    const { error } = await supabase
      .from('gbif_pins')
      .upsert({
        user_id: userId,
        map_scope: mapScope,
        gbif_id: String(pin.gbifId),
        species: pin.species,
        lat: pin.lat,
        lon: pin.lon,
        event_date: pin.date ?? null,
      }, { onConflict: 'user_id,map_scope,gbif_id' });
    if (error) { console.warn('[gbifPins] add failed', error); return false; }
    return true;
  } catch (e) {
    console.warn('[gbifPins] add threw', e);
    return false;
  }
}

export async function removeGbifPin(mapScope: string, gbifId: string): Promise<boolean> {
  if (!isUsaScope(mapScope)) return false;
  try {
    const { error } = await supabase
      .from('gbif_pins')
      .delete()
      .eq('map_scope', mapScope)
      .eq('gbif_id', String(gbifId));
    if (error) { console.warn('[gbifPins] remove failed', error); return false; }
    return true;
  } catch (e) {
    console.warn('[gbifPins] remove threw', e);
    return false;
  }
}
