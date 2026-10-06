import { useState } from 'react';
import { getLog, clearLog, log } from '@/lib/eventLog';
import { Button } from '@/components/ui/button';
import { RotateCw } from 'lucide-react';
import { toast } from 'sonner';

export default function EventLog() {
  const [text, setText] = useState(getLog());
  const refresh = () => setText(getLog());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Kopeeritud');
    } catch {
      const el = document.getElementById('eventLogText') as HTMLTextAreaElement | null;
      if (el) { el.select(); document.execCommand('copy'); toast.success('Kopeeritud'); }
    }
  };

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'EstBirds logi', text }); } catch {}
    } else { copy(); }
  };

  const diagnostics = [
    {
      label: 'Push-v\u00f5tmed',
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
      label: 'Teavitatavad liigid',
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
      label: 'Pilve teavitused',
      action: async () => {
        try {
          const r = await fetch('https://rfjhrosxbaihyrnbmmbl.supabase.co/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json?t=' + Date.now());
          const d = await r.json();
          const n = Object.entries(d.items || {}).filter(([, v]: any) => v?.notify === true);
          log('☁️ Cloud notify: ' + n.length + ' species');
          log('☁️ Cloud updatedAt: ' + (d.updatedAt || '?'));
        } catch (e: any) { log('❌ cloud fetch: ' + (e?.message || e)); }
      },
    },
    {
      label: 'Rariliini hetkt\u00f5mmis',
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
      label: 'Load',
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
      label: 'DB tellimused',
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
      label: 'Tellimuse SQL',
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
  ];

  const clearAll = () => {
    clearLog();
    log('Log cleared');
    refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {diagnostics.map(d => (
          <Button
            key={d.label}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { try { d.action(); } catch {} setTimeout(refresh, 300); }}
          >
            {d.label}
          </Button>
        ))}
      </div>

      <textarea
        id="eventLogText"
        readOnly
        value={text}
        className="w-full rounded-[10px] bg-neutral-900 text-neutral-100 font-mono text-[12px] leading-[1.6] h-60 p-3 border-0 resize-y"
      />

      <div className="flex gap-2 flex-wrap items-center">
        <Button size="sm" onClick={copy}>Kopeeri</Button>
        <Button size="sm" variant="outline" onClick={share}>Jaga</Button>
        <Button size="sm" variant="outline" onClick={clearAll}>{'T\u00fchjenda'}</Button>
        <Button size="sm" variant="outline" className="ml-auto h-8 w-8 p-0" onClick={refresh} aria-label={'V\u00e4rskenda'}>
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Kopeeri ja kleebi Claude'ile. Viimased 150 sündmust.
      </p>
    </div>
  );
}
