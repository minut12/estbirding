import { maps, getActiveMap } from './config';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';

export default function MapTab() {
  const [selectedId, setSelectedId] = useState(getActiveMap().id);
  const current = maps.find((m) => m.id === selectedId) ?? getActiveMap();

  return (
    <div className="flex flex-col h-full">
      {/* Map selector header */}
      <div className="px-4 py-3 border-b border-border bg-card">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {maps.map((m) => (
              <SelectItem key={m.id} value={m.id} disabled={!m.enabled}>
                {m.name}
                {!m.enabled && ' (varsti)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Map iframe */}
      <div className="flex-1 relative">
        <iframe
          key={current.id}
          src={current.source}
          title={current.name}
          className="absolute inset-0 w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      </div>
    </div>
  );
}
