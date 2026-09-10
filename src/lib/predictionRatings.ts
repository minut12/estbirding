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
  /**
   * True when the row was carried from an earlier raport rather than rated on
   * the one being viewed. `raportId` is then the raport it was rated on, not
   * the current one. Nothing reads this yet — it exists so carried chips can
   * be styled later without another change to the data layer.
   */
  carried: boolean;
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
 * Maps either shape onto PredictionRatingRow: the RPC names the originating
 * raport `from_raport_id` and flags `carried`, the per-raport table read has
 * plain `raport_id` and no flag at all (absent -> false). Rows with a rating
 * outside the enum are dropped rather than trusted.
 */
function toPredictionRatingRows(data: unknown): PredictionRatingRow[] {
  const rows = Array.isArray(data) ? data : [];
  const out: PredictionRatingRow[] = [];
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const rating = row.rating;
    if (!isPredictionRating(rating)) continue;
    out.push({
      raportId: String(row.from_raport_id ?? row.raport_id ?? ''),
      ebirdCode: String(row.ebird_code ?? ''),
      siteIndex: Number(row.site_index),
      rating,
      note: ((row.note as string | null | undefined) ?? null),
      carried: Boolean(row.carried),
    });
  }
  return out;
}

/**
 * The signed-in user's own ratings, seeded onto one raport.
 *
 * Ratings are keyed per raport but the cron cuts a new raport every few hours,
 * so reading only `raportId` opens every fresh raport with blank chips. The
 * RPC re-keys the caller's ratings from the last `days` days onto this raport
 * by (ebird_code, predicted site label) — site order shifts between raports,
 * so the label is the stable key — with site_index -1 (species level) carried
 * by ebird_code alone and the latest rated_at winning per key.
 *
 * If the RPC is absent (P10a not yet applied) or errors, this falls back to
 * the per-raport query, so a deploy-order mismatch degrades to today's votes
 * instead of blanking the chips. RLS lets an authenticated user SELECT every
 * row, so that fallback filters user_id explicitly — without it, it would
 * return everybody's ratings. Anonymous -> empty, never an error.
 */
export async function loadMyPredictionRatings(
  raportId: string,
  days = 7,
): Promise<PredictionRatingRow[]> {
  if (!raportId) return [];
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return [];

    const { data: carriedData, error: carriedError } = await (supabase as any)
      .rpc('my_carried_prediction_ratings', {
        p_raport_id: raportId,
        p_days: days,
      });
    if (!carriedError) return toPredictionRatingRows(carriedData);
    console.warn('[pred_rate] carried load failed, falling back', carriedError);

    const { data, error } = await (supabase as any)
      .from('prediction_ratings')
      .select('raport_id, ebird_code, site_index, rating, note')
      .eq('raport_id', raportId)
      .eq('user_id', userId);
    if (error) {
      console.warn('[pred_rate] load failed', error);
      return [];
    }
    return toPredictionRatingRows(data);
  } catch (e) {
    console.warn('[pred_rate] load threw', e);
    return [];
  }
}
