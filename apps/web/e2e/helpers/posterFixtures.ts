import fs from "fs";
import path from "path";

let envLoaded = false;

function loadLocalEnv() {
  if (envLoaded) return;
  envLoaded = true;
  const envPath = path.join(__dirname, "../../.env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

export async function findPosterIdByStatus(status: "closed" | "published") {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const params = new URLSearchParams({
    select: "id",
    poster_status: `eq.${status}`,
    order: "created_at.desc",
    limit: "1",
  });
  const response = await fetch(`${url}/rest/v1/posters?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}
