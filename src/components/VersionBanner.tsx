import { useState, useEffect } from 'react';
import { clearAppCaches, doSoftReload } from '@/lib/cache-reset';
import { checkVersionMismatch, markVersionSeen, APP_VERSION } from '@/lib/version';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VersionBanner() {
  const [show, setShow] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (checkVersionMismatch()) {
      setShow(true);
    }
    markVersionSeen();
  }, []);

  if (!show) return null;

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await clearAppCaches();
      toast.success('Vahemälu tühjendatud. Laen uuesti…');
      await new Promise((r) => setTimeout(r, 600));
      window.location.href = window.location.pathname + '?v=' + Date.now();
    } catch {
      toast.error('Värskendamine ebaõnnestus');
      setUpdating(false);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-primary text-primary-foreground px-4 py-2 flex items-center justify-between gap-2 text-sm shadow-md">
      <span>Uus versioon saadaval</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={updating}
        onClick={handleUpdate}
        className="gap-1.5 h-7 text-xs"
      >
        <RefreshCw className={`w-3 h-3 ${updating ? 'animate-spin' : ''}`} />
        Värskenda
      </Button>
    </div>
  );
}
