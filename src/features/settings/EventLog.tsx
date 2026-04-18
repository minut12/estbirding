import { useState } from 'react';
import { getLog, clearLog } from '@/lib/eventLog';
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
      try {
        await navigator.share({ title: 'EstBirding logi', text });
      } catch {}
    } else {
      copy();
    }
  };

  const handleClear = () => {
    if (confirm('Kustuta logi?')) { clearLog(); refresh(); }
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">📋 Sündmuste logi</h3>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={copy}>Kopeeri</Button>
        <Button size="sm" variant="outline" onClick={share}>Jaga</Button>
        <Button size="sm" variant="outline" onClick={refresh}>Värskenda</Button>
        <Button size="sm" variant="outline" onClick={handleClear}>Tühjenda</Button>
      </div>
      <textarea
        id="eventLogText"
        readOnly
        value={text}
        className="w-full h-64 text-xs font-mono bg-gray-50 border rounded-lg p-2 resize-y"
        style={{ fontSize: '11px', lineHeight: '1.4' }}
      />
      <p className="text-xs text-muted-foreground">
        Viimased 150 sündmust. Kopeeri ja kleebi Claude'ile.
      </p>
    </div>
  );
}
