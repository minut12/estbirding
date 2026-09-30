// netlify/functions/ebird-checklist.js
// Public, read-only: observer comments + photo count for one eBird checklist.
// Used by the Ulevaade EU cards on expand. No secret: the sub_id is already
// public on the card; the eBird token stays server-side inside ebirdGet.
import { ebirdGet } from '../lib/ebird.js';

const SUB_ID = /^S\d{4,12}$/;

export default async (req) => {
  const url = new URL(req.url);
  const subId = (url.searchParams.get('subId') || '').trim();
  if (!SUB_ID.test(subId)) return Response.json({ ok: false, error: 'bad_sub_id' }, { status: 400 });
  try {
    const r = await ebirdGet(`/product/checklist/view/${subId}`, { timeoutMs: 9000 });
    if (r.status !== 200) return Response.json({ ok: false, error: 'ebird_status', status: r.status }, { status: 502 });
    const body = JSON.parse(r.text || '{}');
    const obs = Array.isArray(body.obs) ? body.obs : [];
    const comments = [];
    let photoCount = 0;
    for (const o of obs) {
      const text = typeof o?.comments === 'string' ? o.comments.trim() : '';
      if (text) comments.push({ speciesCode: String(o.speciesCode || ''), text: text.slice(0, 600) });
      const p = o?.mediaCounts && typeof o.mediaCounts.P === 'number' ? o.mediaCounts.P : 0;
      photoCount += p;
    }
    const checklistComment = typeof body.comments === 'string' && body.comments.trim() ? body.comments.trim().slice(0, 600) : null;
    return Response.json(
      { ok: true, subId, comments, checklistComment, photoCount, obsDt: body.obsDt || null },
      { headers: { 'Cache-Control': 'public, max-age=21600, s-maxage=21600' } },
    );
  } catch (e) {
    return Response.json({ ok: false, error: 'ebird_timeout', detail: String((e && e.message) || e) }, { status: 504 });
  }
};

export const config = { path: '/api/ebird-checklist' };
