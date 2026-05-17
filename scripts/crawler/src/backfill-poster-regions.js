import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { inferRegionCodes, SEOUL_SIGUNGU_REGIONS } from "./region-rules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const limit = Number(process.argv[2] ?? "1000");
const dryRun = process.argv.includes("--dry-run");

async function ensureSeoulRegions() {
  const { data: seoul, error: seoulError } = await supabase
    .from("regions")
    .upsert({
      code: "REG_SEOUL",
      name: "서울특별시",
      level: "sido",
      full_name: "서울특별시",
      is_active: true,
    }, { onConflict: "code" })
    .select("id")
    .single();

  if (seoulError) throw seoulError;

  const rows = SEOUL_SIGUNGU_REGIONS.map(([code, name, fullName]) => ({
    code,
    name,
    full_name: fullName,
    parent_id: seoul.id,
    level: "sigungu",
    is_active: true,
  }));

  const { error } = await supabase
    .from("regions")
    .upsert(rows, { onConflict: "code" });

  if (error) throw error;
}

async function loadRegionMap() {
  const { data, error } = await supabase
    .from("regions")
    .select("id, code");

  if (error) throw error;
  return Object.fromEntries((data ?? []).filter((region) => region.code).map((region) => [region.code, region.id]));
}

async function main() {
  if (!dryRun) await ensureSeoulRegions();

  const regionMap = await loadRegionMap();
  const { data: posters, error } = await supabase
    .from("posters")
    .select("id, title, source_org_name, source_key, summary_short")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  let checked = 0;
  let linked = 0;
  let skipped = 0;

  for (const poster of posters ?? []) {
    checked += 1;
    const codes = inferRegionCodes(poster);
    const rows = codes
      .map((code) => regionMap[code] ? { poster_id: poster.id, region_id: regionMap[code] } : null)
      .filter(Boolean);

    if (rows.length === 0) {
      skipped += 1;
      continue;
    }

    if (!dryRun) {
      const { error: insertError } = await supabase
        .from("poster_regions")
        .upsert(rows, { onConflict: "poster_id,region_id", ignoreDuplicates: true });

      if (insertError) throw insertError;
    }
    linked += rows.length;
  }

  console.log(JSON.stringify({ checked, linked, skipped, dryRun }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
