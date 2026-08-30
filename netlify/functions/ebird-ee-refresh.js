// Scheduled: Estonian recent observations -> Supabase `ebird_cache`.
// Port of the n8n workflow "My workflow 2" (a2ee1WpJsb63Jlyc).
import { runEeRefresh } from '../lib/ebird.js';

export default async (req) => {
  const { next_run } = await req.json().catch(() => ({}));
  const result = await runEeRefresh();
  console.log(JSON.stringify({ fn: 'ebird-ee-refresh', next_run, ...result }));
};

export const config = { schedule: '0 4,11,18 * * *' }; // 07/14/21 Tallinn (summer); UTC drift after DST accepted
