import { useMemo, useState } from "react";
import { Code } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  broadcastSupabaseConfigToMapIframes,
  clearSupabaseOverrides,
  getSupabaseAnonKeyOverride,
  getSupabaseConfigSource,
  getFunctionsBaseUrl,
  getSupabaseUrl,
  getSupabaseUrlOverride,
  setSupabaseOverrides,
  validateSupabaseConfig,
} from "@/config/supabaseConfig";

const LS_KEY = "linn_admin_key";

export default function DeveloperSettings() {
  const [key, setKey] = useState(() => localStorage.getItem(LS_KEY) || "");
  const [supabaseUrlOverride, setSupabaseUrlOverride] = useState(() => getSupabaseUrlOverride() || "");
  const [supabaseAnonOverride, setSupabaseAnonOverride] = useState(() => getSupabaseAnonKeyOverride() || "");
  const [supabaseConfigTick, setSupabaseConfigTick] = useState(0);

  const supabaseDiag = useMemo(() => {
    void supabaseConfigTick;
    return validateSupabaseConfig();
  }, [supabaseConfigTick]);

  const resolvedSupabaseUrl = useMemo(() => {
    void supabaseConfigTick;
    return getSupabaseUrl() || "(puudub)";
  }, [supabaseConfigTick]);

  const resolvedFunctionsBase = useMemo(() => {
    void supabaseConfigTick;
    return getFunctionsBaseUrl();
  }, [supabaseConfigTick]);

  const configSource = useMemo(() => {
    void supabaseConfigTick;
    return getSupabaseConfigSource();
  }, [supabaseConfigTick]);

  const handleSave = () => {
    localStorage.setItem(LS_KEY, key);
    toast.success("Admin key salvestatud");
  };

  const handleClear = () => {
    localStorage.removeItem(LS_KEY);
    setKey("");
    toast.success("Admin key eemaldatud");
  };

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        <Code className="h-4 w-4 text-primary" />
        Arendaja
      </h3>

      <div className="space-y-2">
        <Label htmlFor="adminKey">Linnuliigid admin key</Label>
        <Input
          id="adminKey"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="ADMIN_KEY"
        />
        <div className="flex gap-2">
          <Button onClick={handleSave}>Salvesta</Button>
          <Button variant="outline" onClick={handleClear}>Eemalda</Button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Supabase (test override)</h4>
        <Label htmlFor="supabaseUrlOverride">Supabase URL override</Label>
        <Input
          id="supabaseUrlOverride"
          type="text"
          placeholder="https://<project-ref>.supabase.co"
          value={supabaseUrlOverride}
          onChange={(e) => setSupabaseUrlOverride(e.target.value)}
        />
        <Label htmlFor="supabaseAnonOverride">Supabase anon key override</Label>
        <Input
          id="supabaseAnonOverride"
          type="password"
          placeholder="Optional"
          value={supabaseAnonOverride}
          onChange={(e) => setSupabaseAnonOverride(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const result = setSupabaseOverrides({
                supabaseUrlOverride: supabaseUrlOverride.trim() || null,
                supabaseAnonKeyOverride: supabaseAnonOverride.trim() || null,
              });
              if (!result.ok) {
                toast.error(result.error || "Supabase override vigane");
                return;
              }
              setSupabaseUrlOverride(getSupabaseUrlOverride() || "");
              setSupabaseAnonOverride(getSupabaseAnonKeyOverride() || "");
              setSupabaseConfigTick((v) => v + 1);
              broadcastSupabaseConfigToMapIframes();
              toast.success("Supabase override salvestatud");
            }}
          >
            Salvesta
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              clearSupabaseOverrides();
              setSupabaseUrlOverride("");
              setSupabaseAnonOverride("");
              setSupabaseConfigTick((v) => v + 1);
              broadcastSupabaseConfigToMapIframes();
              toast.success("Supabase override eemaldatud");
            }}
          >
            Eemalda
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Config source: {configSource}</p>
        <p className="text-xs text-muted-foreground">Resolved URL: {resolvedSupabaseUrl}</p>
        <p className="text-xs text-muted-foreground">Functions URL: {resolvedFunctionsBase}</p>
        <p className={`text-xs ${supabaseDiag.ok ? "text-emerald-700" : "text-red-700"}`}>
          {supabaseDiag.ok ? "Supabase config: OK" : `Supabase config: ${supabaseDiag.error}`}
        </p>
      </div>
    </div>
  );
}
