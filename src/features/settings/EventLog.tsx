import { useState } from 'react';
import { getLog, clearLog, log } from '@/lib/eventLog';
import { Button } from '@/components/ui/button';

export default function EventLog() {
  const [text, setText] = useState(getLog());
  const refresh = () => setText(getLog());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Kopeeritud!');
    } catch {
      const el = document.getElementById('eventLogText') as HTMLTextAreaElement | null;
      if (el) { el.select(); document.execCommand('copy'); alert('Kopeeritud!'); }
    }
  };

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'EstBirding logi', text }); } catch {}
    } else { copy(); }
  };

  const diagnostics = [
    {
      label: '🔔 Push keys',
      action: async () => {
        try {
          if (!('serviceWorker' in navigator)) return log('❌ SW not supported');
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (!sub) return log('❌ No push subscription — click a bell first');
          const j = sub.toJSON();
          log('📋 ENDPOINT: ' + j.endpoint);
          log('📋 P256DH: ' + (j.keys?.p256dh || 'missing'));
          log('📋 AUTH: ' + (j.keys?.auth || 'missing'));
        } catch (e: any) { log('❌ ' + (e?.message || e)); }
      },
    },
    {
      label: '🔕 Notify count',
      action: () => {
        try {
          const bm = JSON.parse(localStorage.getItem('bm_notify_species') || '[]');
          const meta = JSON.parse(localStorage.getItem('estbirding.speciesMeta.v1') || '{}');
          const metaNotify = Object.keys(meta).filter(k => meta[k]?.notify === true);
          log('🔕 bm_notify_species: ' + bm.length);
          log('🔕 speciesMeta notify: ' + metaNotify.length);
        } catch (e: any) { log('❌ ' + (e?.message || e)); }
      },
    },
    {
      label: '☁️ Cloud notify',
      action: async () => {
        try {
          const r = await fetch('https://eenwcyuyugyrjgpivxrq.supabase.co/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json?t=' + Date.now());
          const d = await r.json();
          const n = Object.entries(d.items || {}).filter(([, v]: any) => v?.notify === true);
          log('☁️ Cloud notify: ' + n.length + ' species');
          log('☁️ Cloud updatedAt: ' + (d.updatedAt || '?'));
        } catch (e: any) { log('❌ cloud fetch: ' + (e?.message || e)); }
      },
    },
    {
      label: '📸 Snapshot status',
      action: () => {
        try {
          const pts = JSON.parse(localStorage.getItem('bm_rari_points') || '{}');
          const count = Object.keys(pts).length;
          const withCoords = Object.values(pts).filter((p: any) => p?.lat && p?.lon).length;
          const with7d = Object.values(pts).filter((p: any) => (p?.occ7 || 0) > 0).length;
          log('📸 Points: ' + count + ' | coords: ' + withCoords + ' | 7d active: ' + with7d);
        } catch (e: any) { log('❌ ' + (e?.message || e)); }
      },
    },
    {
      label: '🔐 Permission',
      action: () => {
        try {
          const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unavailable';
          const sw = 'serviceWorker' in navigator ? 'yes' : 'no';
          const push = 'PushManager' in window ? 'yes' : 'no';
          const standalone = window.matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no';
          log('🔐 Notification: ' + perm);
          log('🔐 ServiceWorker: ' + sw + ' | PushManager: ' + push);
          log('🔐 Standalone (PWA): ' + standalone);
          log('🔐 UserAgent: ' + navigator.userAgent.slice(0, 80));
        } catch (e: any) { log('❌ ' + (e?.message || e)); }
      },
    },
    {
      label: '🗄️ DB subscriptions',
      action: async () => {
        try {
          const { supabase } = await import('@/config/supabaseClient');
          const { data, error } = await supabase.from('push_subscriptions').select('endpoint,subscribed_species,device_label,updated_at');
          if (error) return log('❌ DB: ' + error.message);
          log('🗄️ Subscriptions: ' + (data?.length || 0));
          (data || []).forEach((row: any, i: number) => {
            log('  #' + (i + 1) + ' ' + (row.device_label || '?') + ' | species: ' + (row.subscribed_species?.length || 0) + ' | ' + (row.endpoint?.slice(0, 50) || '') + '...');
          });
        } catch (e: any) { log('❌ ' + (e?.message || e)); }
      },
    },
    {
      label: '📋 Insert sub SQL',
      action: async () => {
        try {
          if (!('serviceWorker' in navigator)) return log('❌ No SW');
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (!sub) return log('❌ No subscription');
          const j = sub.toJSON();
          const device = /Android/.test(navigator.userAgent) ? 'Android' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : 'Desktop';
          const sql = `INSERT INTO push_subscriptions (endpoint, key_p256dh, key_auth, subscribed_species, device_label) VALUES ('${j.endpoint}', '${j.keys?.p256dh}', '${j.keys?.auth}', ARRAY['Sookurg'], '${device}') ON CONFLICT (endpoint) DO UPDATE SET key_p256dh='${j.keys?.p256dh}', key_auth='${j.keys?.auth}', updated_at=now();`;
          log('📋 SQL (copy this to Lovable):');
          log(sql);
        } catch (e: any) { log('❌ ' + (e?.message || e)); }
      },
    },
    {
      label: '🧹 Clear log',
      action: () => {
        clearLog();
        log('🧹 Log cleared');
      },
    },
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">📋 Sündmuste logi</h3>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">🔧 Diagnostika</h4>
        <div className="grid grid-cols-2 gap-2">
          {diagnostics.map(d => (
            <Button
              key={d.label}
              variant="outline"
              size="sm"
              className="text-xs justify-start h-auto min-h-[44px] py-2 px-3"
              onClick={() => { try { d.action(); } catch {} setTimeout(refresh, 300); }}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={copy}>Kopeeri</Button>
        <Button size="sm" variant="outline" onClick={share}>Jaga</Button>
        <Button size="sm" variant="outline" onClick={refresh}>Värskenda</Button>
      </div>

      <textarea
        id="eventLogText"
        readOnly
        value={text}
        className="w-full h-64 text-xs font-mono bg-gray-50 border rounded-lg p-2 resize-y"
        style={{ fontSize: '11px', lineHeight: '1.4' }}
      />
      <p className="text-xs text-muted-foreground">
        Kopeeri ja kleebi Claude'ile. Viimased 150 sündmust.
      </p>
    </div>
  );
}
