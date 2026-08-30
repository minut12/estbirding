// On-demand, secret-protected eBird access at /api/ebird-relay. Two modes:
//   ?job=ee|europe  — run a scheduled job by hand (scheduled functions do not
//                     fire on branch deploys, so this is how we test them)
//   ?path=...       — passthrough to api.ebird.org for the Supabase Edge
//                     Functions that cannot reach eBird themselves (M7.5/M7.6)
import { ebirdGet, runEeRefresh, runEuropeRefresh } from '../lib/ebird.js';

export default async (req) => {
  const secret = (Netlify.env.get('EBIRD_RELAY_SECRET') || '').trim();
  if (!secret || req.headers.get('x-relay-secret') !== secret) return new Response('unauthorized', { status: 401 });
  const url = new URL(req.url);
  const job = url.searchParams.get('job');
  if (job === 'ee' || job === 'europe') {           // manual run of a scheduled job (testing on the branch deploy)
    const result = job === 'ee' ? await runEeRefresh() : await runEuropeRefresh();
    return Response.json(result, { status: result.ok ? 200 : 502 });
  }
  const path = url.searchParams.get('path') || '';   // passthrough for the EFs (M7.5/M7.6)
  if (!/^\/data\/obs\/[A-Za-z0-9-]+\/recent(\/[A-Za-z0-9]+)?(\?.*)?$/.test(path)) return new Response('bad path', { status: 400 });
  try {
    const r = await ebirdGet(path, { timeoutMs: 9000 });
    return new Response(r.text, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  } catch (e) {
    return Response.json({ ok: false, error: 'ebird_timeout', detail: String((e && e.message) || e) }, { status: 504 });
  }
};

export const config = { path: '/api/ebird-relay' };
