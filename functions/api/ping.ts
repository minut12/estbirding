// functions/api/ping.ts
export const config = { runtime: "edge" };
export default async function handler(_req: Request) {
  return new Response(JSON.stringify({ ok: true, fn: "api/ping" }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
