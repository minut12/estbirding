import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationSubscription } from './useNotificationSubscription';

export default function NotificationSettingsCard() {
  const { state, enable, disable, busy, error } = useNotificationSubscription();

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
    </div>
  );
}
