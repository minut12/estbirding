import { useState } from 'react';
import { supabase } from '@/config/supabaseClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type DiagnosticsItem = {
  title: string;
  link: string | null;
  published_at: string | null;
  status: 'inserted' | 'updated' | 'skipped' | 'error';
  skip_reason: string | null;
};

type DiagnosticsSource = {
  sourceId: string;
  slug: string;
  source: string;
  enabled: boolean;
  rssUrl: string;
  fetchStatus?: string;
  parsedCount?: number;
  insertedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  lastError?: string | null;
  visibleCountInNewsList?: number;
  latestItems?: DiagnosticsItem[];
};

type DiagnosticsReport = {
  perSource?: DiagnosticsSource[];
};

export default function NewsDiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DiagnosticsReport | null>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('news-refresh', {
        method: 'POST',
        body: {
          reason: 'diagnostics',
          cache_images: true,
          cache_limit: 10,
          translateForeignNews: true,
        },
      });
      if (error) throw error;
      setReport((data || null) as DiagnosticsReport);
      setOpen(true);
      toast.success('Diagnostika käivitatud');
    } catch (error: unknown) {
      const maybeErr = error as { message?: string } | null;
      toast.error(`Diagnostika ebaõnnestus (${maybeErr?.message || 'Viga'})`);
    } finally {
      setLoading(false);
    }
  };

  const copyDiagnostics = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast.success('Diagnostika kopeeritud');
    } catch {
      toast.error('Diagnostika kopeerimine ebaõnnestus');
    }
  };

  return (
    <details
      className="rounded-lg border border-border bg-card p-4"
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none">
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">Uudiste diagnostika</h3>
          <p className="text-xs text-muted-foreground">Näitab live uudiste värskenduse tulemusi allikate kaupa.</p>
        </div>
      </summary>

      <div className="mt-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={runDiagnostics} disabled={loading} className="w-full sm:w-auto">
            {loading ? 'Käivitan…' : 'Käivita diagnostika'}
          </Button>
          <Button variant="outline" onClick={copyDiagnostics} disabled={!report} className="w-full sm:w-auto">
            Kopeeri diagnostika
          </Button>
        </div>

        {(report?.perSource || []).map((source) => (
          <div key={source.sourceId} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm">{source.source}</span>
              <Badge variant={source.fetchStatus === 'success' ? 'secondary' : 'outline'}>
                {source.fetchStatus || 'unknown'}
              </Badge>
            </div>

            <div className="grid gap-1 text-xs text-muted-foreground break-all">
              <div>source name: {source.source}</div>
              <div>source slug/key/id: {source.slug} / {source.sourceId}</div>
              <div>url: {source.rssUrl || '(puudub)'}</div>
              <div>enabled: {String(source.enabled)}</div>
              <div>fetch status: {source.fetchStatus || 'unknown'}</div>
              <div>parsed count: {source.parsedCount ?? 0}</div>
              <div>inserted count: {source.insertedCount ?? 0}</div>
              <div>updated count: {source.updatedCount ?? 0}</div>
              <div>skipped count: {source.skippedCount ?? 0}</div>
              <div>last error: {source.lastError || '(none)'}</div>
              <div>visible count in actual News list query: {source.visibleCountInNewsList ?? 0}</div>
            </div>

            {(source.latestItems || []).length > 0 && (
              <div className="space-y-2">
                {(source.latestItems || []).map((item, index) => (
                  <div key={`${source.sourceId}-${index}`} className="rounded-md border border-border p-2 text-xs space-y-1">
                    <div>title: {item.title || '(pealkiri puudub)'}</div>
                    <div>published_at: {item.published_at || '(kuupäev puudub)'}</div>
                    <div className="break-all">link: {item.link || '(link puudub)'}</div>
                    <div>status: {item.status}</div>
                    <div>skip reason: {item.skip_reason || '(none)'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
