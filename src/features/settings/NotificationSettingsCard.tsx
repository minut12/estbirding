import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getFunctionsBaseUrl, getSupabaseAuthHeaders } from '@/config/supabaseConfig';
import { log } from '@/lib/eventLog';
import { reconcilePushSubscription } from '@/lib/pushReconcile';
import { useNotificationSubscription } from './useNotificationSubscription';

// P35: 'needs-reenable' is permission granted but no live subscription — the
// state the Sep-10 rotation left this app in, and the one worth naming plainly.
type DbStatus = 'unknown' | 'present' | 'missing' | 'needs-reenable';

const STATUS_TEXT: Record<Exclude<DbStatus, 'unknown'>, string> = {
  present: 'Tellimus andmebaasis: olemas',
  missing: 'Tellimus andmebaasis: puudub',
  'needs-reenable': 'Teavitused vajavad uuesti sisselülitamist',
};

interface TestPushResponse {
  ok?: boolean;
  expired?: boolean;
  statusCode?: number | null;
  status?: number | null;
  detail?: string;
  error?: string;
}

export default function NotificationSettingsCard() {
  const { state, enable, disable, busy, error } = useNotificationSubscription();
  const [dbStatus, setDbStatus] = useState<DbStatus>('unknown');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reconcile first, then read back the row — so the status line reports the
  // state we just repaired rather than the one we arrived in.
  const refreshStatus = useCallback(async () => {
    try {
      await reconcilePushSubscription();
    } catch {
      // reconcilePushSubscription logs its own failure branches.
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!mountedRef.current) return;
      if (!sub) {
        setEndpoint(null);
        setDbStatus(Notification.permission === 'granted' ? 'needs-reenable' : 'missing');
        return;
      }
      setEndpoint(sub.endpoint);
      const { data, error: selectErr } = await supabase
        .from('push_subscriptions')
        .select('endpoint')
        .eq('endpoint', sub.endpoint)
        .maybeSingle();
      if (!mountedRef.current) return;
      setDbStatus(!selectErr && data ? 'present' : 'missing');
    } catch {
      if (mountedRef.current) setDbStatus('missing');
    }
  }, []);

  // Runs on mount once the hook's own probe settles, and again after every
  // enable/disable — both of those move state.status.
  useEffect(() => {
    if (state.status === 'unknown' || state.status === 'unsupported') return;
    void refreshStatus();
  }, [state.status, refreshStatus]);

  const sendTestPush = useCallback(async () => {
    if (!endpoint || sending) return;
    setSending(true);
    setTestResult(null);
    try {
      const res = await fetch(`${getFunctionsBaseUrl()}/send-test-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getSupabaseAuthHeaders() },
        body: JSON.stringify({ endpoint }),
      });
      const body = (await res.json().catch(() => ({}))) as TestPushResponse;

      if (res.ok && body.ok === true) {
        if (mountedRef.current) setTestResult('Testteavitus saadetud.');
        log(`🔔 test-push: saadetud (status ${body.statusCode ?? '?'})`);
      } else {
        const detail = body.expired === true
          ? 'tellimus on aegunud'
          : String(body.detail || body.error || `HTTP ${res.status}`);
        if (mountedRef.current) setTestResult(`Testteavituse saatmine ebaõnnestus: ${detail}`);
        log(`❌ test-push: ${detail}`);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) setTestResult(`Testteavituse saatmine ebaõnnestus: ${detail}`);
      log(`❌ test-push: ${detail}`);
    } finally {
      if (mountedRef.current) setSending(false);
      void refreshStatus();
    }
  }, [endpoint, sending, refreshStatus]);

  if (state.status === 'unsupported') {
    return null;
  }

  const isSubscribed = state.status === 'subscribed';
  const isDenied = state.status === 'denied';
  const isLoading = state.status === 'unknown';

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        {isSubscribed ? (
          <Bell className="w-5 h-5 mt-0.5 text-primary shrink-0" />
        ) : (
          <BellOff className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground">Push-teavitused</h3>
          <p className="text-sm text-muted-foreground break-words">
            Saa teavitus, kui Eesti naabermaades on registreeritud haruldane lind.
            Teavitused katavad kõiki rare-, super- ja mega-kategooria liike.
          </p>
        </div>
      </div>

      {isDenied && (
        <p className="text-sm text-amber-600 dark:text-amber-400 break-words">
          Brauser on teavituste loa keelanud. Et need uuesti lubada, ava brauseri
          seadete kaudu selle saidi õigused ja luba teavitused.
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive break-words">Viga: {error}</p>
      )}

      <div className="flex justify-end">
        {isSubscribed ? (
          <Button variant="outline" onClick={disable} disabled={busy}>
            {busy ? 'Tühistan…' : 'Lülita välja'}
          </Button>
        ) : (
          <Button onClick={enable} disabled={busy || isDenied || isLoading}>
            {busy ? 'Lubaman…' : 'Luba teavitused'}
          </Button>
        )}
      </div>

      <div className="border-t border-border pt-3 space-y-2">
        {dbStatus !== 'unknown' && (
          <p className="text-sm text-muted-foreground break-words">{STATUS_TEXT[dbStatus]}</p>
        )}

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={sendTestPush}
            disabled={sending || dbStatus !== 'present'}
          >
            {sending ? 'Saadan…' : 'Saada testteavitus'}
          </Button>
        </div>

        {testResult && (
          <p className="text-sm text-muted-foreground break-words">{testResult}</p>
        )}
      </div>
    </div>
  );
}
