import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Code, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const LS_KEY = 'linn_admin_key';

export default function DeveloperSettings() {
  const [key, setKey] = useState(() => localStorage.getItem(LS_KEY) || '');

  const handleSave = () => {
    localStorage.setItem(LS_KEY, key);
    toast.success('Admin key salvestatud');
  };

  const handleClear = () => {
    localStorage.removeItem(LS_KEY);
    setKey('');
    toast.success('Admin key eemaldatud');
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Code className="w-4 h-4 text-primary" />
        Arendaja
      </h3>
      <div className="space-y-2">
        <Label htmlFor="adminKey">Linnuliigid admin key</Label>
        <Input
          id="adminKey"
          type="password"
          placeholder={'Valikuline \u2014 vajalik ainult \u201EForce refresh\u201C jaoks'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Seda võtit kasutatakse linnuliigid kaardi andmete jõuga värskendamiseks.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSave} className="gap-1.5" disabled={!key}>
          <Save className="w-3.5 h-3.5" />
          Salvesta
        </Button>
        <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5" disabled={!localStorage.getItem(LS_KEY)}>
          <Trash2 className="w-3.5 h-3.5" />
          Tühjenda
        </Button>
      </div>
    </div>
  );
}
