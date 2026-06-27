import { supabase } from '@/config/supabaseClient';

export interface PoiPin {
  poiId: string;
  lat: number;
  lon: number;
  cat: string;
  name: string;
  notes: string;
  url: string;
  created: number;
}

const PIN_ENABLED_SCOPES = new Set(['usa_co_poi', 'usa_pa_poi', 'usa_i70_poi']);
function isPinEnabledScope(s: string): boolean { return PIN_ENABLED_SCOPES.has(s); }

export async function loadPoiPins(mapScope: string): Promise<PoiPin[]> {
  if (!isPinEnabledScope(mapScope)) return [];
  try {
    const { data, error } = await supabase
      .from('poi_pins')
      .select('poi_id, lat, lon, cat, name, notes, url, created_ms')
      .eq('map_scope', mapScope);
    if (error) { console.warn('[poiPins] load failed', error); return []; }
    return (data || []).map((r: any) => ({
      poiId: String(r.poi_id),
      lat: Number(r.lat),
      lon: Number(r.lon),
      cat: String(r.cat || 'other'),
      name: String(r.name || ''),
      notes: String(r.notes || ''),
      url: String(r.url || ''),
      created: Number(r.created_ms) || 0,
    }));
  } catch (e) { console.warn('[poiPins] load threw', e); return []; }
}

function rowFromPin(userId: string, mapScope: string, pin: PoiPin) {
  return {
    user_id: userId,
    map_scope: mapScope,
    poi_id: String(pin.poiId),
    lat: Number(pin.lat),
    lon: Number(pin.lon),
    cat: String(pin.cat || 'other'),
    name: String(pin.name || ''),
    notes: String(pin.notes || ''),
    url: String(pin.url || ''),
    created_ms: Number(pin.created) || 0,
  };
}

export async function upsertPoiPin(mapScope: string, pin: PoiPin): Promise<boolean> {
  if (!isPinEnabledScope(mapScope)) return false;
  try {
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) { console.warn('[poiPins] no auth user; cannot pin'); return false; }
    if (!pin.poiId || !Number.isFinite(pin.lat) || !Number.isFinite(pin.lon)) return false;
    const { error } = await supabase
      .from('poi_pins')
      .upsert(rowFromPin(userId, mapScope, pin), { onConflict: 'user_id,map_scope,poi_id' });
    if (error) { console.warn('[poiPins] upsert failed', error); return false; }
    return true;
  } catch (e) { console.warn('[poiPins] upsert threw', e); return false; }
}

export async function upsertManyPoiPins(mapScope: string, pins: PoiPin[]): Promise<boolean> {
  if (!isPinEnabledScope(mapScope)) return false;
  if (!pins || pins.length === 0) return true;
  try {
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) { console.warn('[poiPins] no auth user; cannot bootstrap'); return false; }
    const rows = pins
      .filter(p => p.poiId && Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map(p => rowFromPin(userId, mapScope, p));
    if (rows.length === 0) return true;
    const { error } = await supabase
      .from('poi_pins')
      .upsert(rows, { onConflict: 'user_id,map_scope,poi_id' });
    if (error) { console.warn('[poiPins] upsertMany failed', error); return false; }
    return true;
  } catch (e) { console.warn('[poiPins] upsertMany threw', e); return false; }
}

export async function removePoiPin(mapScope: string, poiId: string): Promise<boolean> {
  if (!isPinEnabledScope(mapScope)) return false;
  try {
    const { error } = await supabase
      .from('poi_pins')
      .delete()
      .eq('map_scope', mapScope)
      .eq('poi_id', String(poiId));
    if (error) { console.warn('[poiPins] remove failed', error); return false; }
    return true;
  } catch (e) { console.warn('[poiPins] remove threw', e); return false; }
}
