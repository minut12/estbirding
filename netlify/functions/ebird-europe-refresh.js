// Scheduled: notable observations from 7 neighbour countries -> Supabase
// `europe_ebird_cache`. Port of the n8n workflow "Europe eBird Cache Refresh"
// (grgbwJuDlljqEKba).
import { runEuropeRefresh } from '../lib/ebird.js';

export default async (req) => {
  const { next_run } = await req.json().catch(() => ({}));
  const result = await runEuropeRefresh();
  console.log(JSON.stringify({ fn: 'ebird-europe-refresh', next_run, ...result }));
};

export const config = { schedule: '45 3,15 * * *' }; // 06:45/18:45 Tallinn (summer); UTC drift after DST accepted
