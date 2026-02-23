const DEFAULT_ORG_SLUG = "hjchtdyzgukmxqhibphb";

function readEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

async function main(): Promise<void> {
  const accessToken = readEnv("SUPABASE_ACCESS_TOKEN");
  const orgSlug = readEnv("SUPABASE_ORG_SLUG") || DEFAULT_ORG_SLUG;

  if (!accessToken) {
    throw new Error("Missing SUPABASE_ACCESS_TOKEN");
  }

  const endpoint = `https://api.supabase.com/v1/organizations/${encodeURIComponent(orgSlug)}/projects`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Management API failed (${response.status}): ${text}`);
  }

  const projects = (await response.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(projects) || projects.length === 0) {
    console.log(`No projects found for org slug: ${orgSlug}`);
    return;
  }

  console.log(`Projects for org slug: ${orgSlug}`);
  for (const project of projects) {
    const name = String(project.name || "(unnamed)");
    const ref = String(project.id || project.ref || "(missing)");
    const status = String(project.status || "(unknown)");
    console.log(`- ${name} | ref=${ref} | status=${status}`);
  }
}

main().catch((error) => {
  console.error((error as Error)?.message || String(error));
  process.exit(1);
});
