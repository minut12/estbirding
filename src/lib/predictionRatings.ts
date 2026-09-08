// src/lib/predictionRatings.ts
// P7a: user ratings of Tõenäosus predictions. The map iframe never touches
// Supabase or auth — it posts a message and the React parent calls in here.
//
// `prediction_ratings` is not in the generated Database types yet, so the two
// table calls below are cast. Same precedent as OverviewTab.tsx:707. Do not
// regenerate types.ts for this.
import { supabase } from '@/integrations/supabase/client';

export type PredictionRating = 'oige' | 'osaliselt' | 'vale' | 'voimatu';

/** Enum values are ASCII; the Estonian labels with diacritics are display-only. */
export const PREDICTION_RATING_VALUES: readonly PredictionRating[] = [
  'oige',
  'osaliselt',
  'vale',
  'voimatu',
];

/** Display labels, keyed by the stored ASCII value. */
export const PREDICTION_RATING_LABELS: Readonly<Record<PredictionRating, string>> = {
  oige: 'õige',
  osaliselt: 'osaliselt',
  vale: 'vale',
  voimatu: 'võimatu',
};

/** Watch-list items and species-level (Ülevaade card) ratings carry this. */
export const SITE_INDEX_SPECIES_LEVEL = -1;

export function isPredictionRating(value: unknown): value is PredictionRating {
  return typeof value === 'string' &&
    (PREDICTION_RATING_VALUES as readonly string[]).includes(value);
}

export interface PredictionRatingRow {
  raportId: string;
  ebirdCode: string;
  siteIndex: number;
  rating: PredictionRating;
  note: string | null;
}

export interface UpsertPredictionRatingInput {
  raportId: string;
  ebirdCode: string;
  siteIndex: number;
  rating: PredictionRating;
  note?: string | null;
}

export type PredictionRatingFailure = 'anon' | 'error';

export interface UpsertPredictionRatingResult {
  ok: boolean;
  reason?: PredictionRatingFailure;
}

/**
 * Upsert on (raport_id, ebird_code, site_index, user_id) — re-rating replaces,
 * never duplicates. `user_id` is never sent: the column defaults to auth.uid()
 * and RLS enforces it.
 */
export async function upsertPredictionRating(
  input: UpsertPredictionRatingInput,
): Promise<UpsertPredictionRatingResult> {
  if (!input.raportId || !input.ebirdCode || !isPredictionRating(input.rating)) {
    return { ok: false, reason: 'error' };
  }
  if (!Number.isFinite(input.siteIndex)) return { ok: false, reason: 'error' };
  try {
    // No session -> report it without hitting the network.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) return { ok: false, reason: 'anon' };

    const { error } = await (supabase as any)
      .from('prediction_ratings')
      .upsert(
        {
          raport_id: input.raportId,
          ebird_code: input.ebirdCode,
          site_index: input.siteIndex,
          rating: input.rating,
          note: input.note ?? null,
        },
        { onConflict: 'raport_id,ebird_code,site_index,user_id' },
      );
    if (error) {
      console.warn('[pred_rate] upsert failed', error);
      return { ok: false, reason: 'error' };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[pred_rate] upsert threw', e);
    return { ok: false, reason: 'error' };
  }
}

/**
 * The signed-in user's own ratings for one raport. RLS lets an authenticated
 * user SELECT every row, so user_id is filtered explicitly — without it this
 * would return everybody's ratings. Anonymous -> empty, never an error.
 */
export async function loadMyPredictionRatings(
  raportId: string,
): Promise<PredictionRatingRow[]> {
  if (!raportId) return [];
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return [];

    const { data, error } = await (supabase as any)
      .from('prediction_ratings')
      .select('raport_id, ebird_code, site_index, rating, note')
      .eq('raport_id', raportId)
      .eq('user_id', userId);
    if (error) {
      console.warn('[pred_rate] load failed', error);
      return [];
    }
    const rows = Array.isArray(data) ? data : [];
    const out: PredictionRatingRow[] = [];
    for (const r of rows) {
      const rating = (r as { rating?: unknown }).rating;
      if (!isPredictionRating(rating)) continue;
      out.push({
        raportId: String((r as { raport_id?: unknown }).raport_id ?? ''),
        ebirdCode: String((r as { ebird_code?: unknown }).ebird_code ?? ''),
        siteIndex: Number((r as { site_index?: unknown }).site_index),
        rating,
        note: ((r as { note?: string | null }).note ?? null),
      });
    }
    return out;
  } catch (e) {
    console.warn('[pred_rate] load threw', e);
    return [];
  }
}
