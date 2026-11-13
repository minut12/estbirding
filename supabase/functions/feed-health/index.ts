// redeploy-marker: 2026-11-13 - P182c cron_log finish: calls defaults to 0 (column is NOT NULL)
// redeploy-marker: 2026-11-12 - P181e feed-health (freshness check + ops push, cron_runs log for Netlify jobs)
// supabase/functions/feed-health/index.ts
//
// POST {}                      -> hourly check (pg_cron m7-feed-health): feed_health_tick(), then ONE alert
//                                 push for feeds late/missing on 2+ consecutive checks (re-alert at most every
//                                 12 h per feed) and ONE "taastus" push for feeds that are ok again.
// POST {action:"cron_log",...} -> Netlify scheduled functions log their start / finish into cron_runs.
// Auth: x-webhook-secret must equal env VAATLUSTE_WEBHOOK_SECRET (same secret m7_call_ef sends).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type FeedAction = "alert" | "recover";

interface TickRow {
  feed: string;
  label: string;
  status: "ok" | "late" | "missing";
  age: string | null;
  target: string;
  detail: string | null;
  consecutive_misses: number;
  action: FeedAction | null;
}

interface OpsSubscription {
  endpoint: string;
  key_p256dh: string;
  key_auth: string;
}

interface PushOutcome {
  sent: number;
  expired: number;
  errors: number;
  subscriptions: number;
}

const LOG_JOBS = ["ebird-ee", "ebird-europe"];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Postgres interval text ("02:50:58", "4 days 19:40:47") -> short Estonian age ("2 t", "4 p 19 t").
export function shortAge(age: string | null): string {
  if (!age) return "";
  const m = /^(?:(\d+) days? )?(\d+):(\d+):/.exec(age);
  if (!m) return "";
  const days = Number(m[1] || 0);
  const hours = Number(m[2]);
  const minutes = Number(m[3]);
  if (days > 0) return `${days} p ${hours} t`;
  if (hours > 0) return `${hours} t`;
  return `${minutes} min`;
}

export function alertBody(rows: TickRow[]): string {
  return rows.map((r) => {
    if (r.status === "missing") return `${r.label}: puudub`;
    const age = shortAge(r.age);
    return age ? `${r.label}: hilineb (${age})` : `${r.label}: hilineb`;
  }).join("; ");
}

async function sendOpsPush(
  sb: SupabaseClient,
  title: string,
  body: string,
  tag: string,
): Promise<PushOutcome> {
  const out: PushOutcome = { sent: 0, expired: 0, errors: 0, subscriptions: 0 };
  const { data, error } = await sb
    .from("push_subscriptions")
    .select("endpoint, key_p256dh, key_auth")
    .eq("ops_alerts", true);
  if (error) throw new Error("push_subscriptions: " + error.message);
  const subs = (data ?? []) as OpsSubscription[];
  out.subscriptions = subs.length;
  const payload = JSON.stringify({ species: "", title, body, url: "/", tag });
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.key_p256dh, auth: sub.key_auth } },
        payload,
        { TTL: 43200, urgency: "high" },
      );
      out.sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        out.expired++;
      } else {
        out.errors++;
        console.error("[feed-health] push failed:", status ?? null, errorMessage(err));
      }
    }
  }
  return out;
}

async function cronLog(sb: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const job = String(body.job ?? "");
  const runId = String(body.run_id ?? "");
  const phase = String(body.phase ?? "");
  if (!LOG_JOBS.includes(job)) return json(400, { error: "unknown job" });
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return json(400, { error: "run_id must be a uuid" });
  if (phase === "start") {
    const { error } = await sb.from("cron_runs").insert({ job, run_id: runId, hop: 0, state: {} });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, job, phase });
  }
  if (phase === "finish") {
    const state = body.state && typeof body.state === "object" ? body.state : {};
    const patch = {
      finished_at: new Date().toISOString(),
      // P182c: calls is NOT NULL (default 0); a null here made every finish call fail with 500.
      calls: typeof body.calls === "number" ? body.calls : 0,
      ok: body.ok === true,
      state,
      error: typeof body.error === "string" ? body.error.slice(0, 1000) : null,
    };
    const { data, error } = await sb.from("cron_runs").update(patch).eq("job", job).eq("run_id", runId).select("id");
    if (error) return json(500, { error: error.message });
    // The start call was lost: still record the run as one finished row.
    if (!data || data.length === 0) {
      const ins = await sb.from("cron_runs").insert({ job, run_id: runId, hop: 0, ...patch });
      if (ins.error) return json(500, { error: ins.error.message });
    }
    return json(200, { ok: true, job, phase });
  }
  return json(400, { error: "phase must be start or finish" });
}

Deno.serve(async (req) => {
  const expected = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!expected || req.headers.get("x-webhook-secret") !== expected) {
    return json(401, { error: "unauthorized" });
  }
  if (req.method !== "POST") return json(405, { error: "POST only" });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (body.action === "cron_log") return await cronLog(sb, body);

    const { data, error } = await sb.rpc("feed_health_tick");
    if (error) throw new Error("feed_health_tick: " + error.message);
    const rows = (data ?? []) as TickRow[];
    const alerts = rows.filter((r) => r.action === "alert");
    const recovered = rows.filter((r) => r.action === "recover");
    const dryRun = body.dry_run === true;

    const result: Record<string, unknown> = {
      checked: rows.length,
      not_ok: rows.filter((r) => r.status !== "ok").map((r) => ({ feed: r.feed, status: r.status, misses: r.consecutive_misses })),
      alerts: alerts.map((r) => r.feed),
      recovered: recovered.map((r) => r.feed),
    };
    if (dryRun || (alerts.length === 0 && recovered.length === 0)) return json(200, result);

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@estbirding.ee";
    if (!vapidPublic || !vapidPrivate) return json(500, { ...result, error: "VAPID keys not configured" });
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    if (alerts.length > 0) {
      const title = alerts.length === 1 ? "Andmevoo t\u00f5rge" : "Andmevoogude t\u00f5rge";
      const push = await sendOpsPush(sb, title, alertBody(alerts), "ops-feed-health");
      result.alert_push = push;
      // Mark only when a device got it, so a failed or unsubscribed alert is retried on the next check.
      if (push.sent > 0) {
        const mark = await sb.rpc("feed_health_mark", { p_feeds: alerts.map((r) => r.feed), p_action: "alert" });
        if (mark.error) console.error("[feed-health] mark alert:", mark.error.message);
      }
    }

    if (recovered.length > 0) {
      const title = recovered.length === 1 ? "Andmevoog taastus" : "Andmevood taastusid";
      const push = await sendOpsPush(sb, title, recovered.map((r) => r.label).join(", "), "ops-feed-health-ok");
      result.recover_push = push;
      // Cleared unless every send failed outright (then the next check retries).
      if (push.sent > 0 || push.errors === 0) {
        const mark = await sb.rpc("feed_health_mark", { p_feeds: recovered.map((r) => r.feed), p_action: "recover" });
        if (mark.error) console.error("[feed-health] mark recover:", mark.error.message);
      }
    }

    console.log("[feed-health]", JSON.stringify(result));
    return json(200, result);
  } catch (e: unknown) {
    console.error("[feed-health] unhandled:", e);
    return json(500, { error: errorMessage(e) });
  }
});
