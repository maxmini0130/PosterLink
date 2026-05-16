import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import youthSeoul from "./adapters/youth-seoul.js";

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

const limit = Number(process.argv[2] ?? "500");
const dryRun = process.argv.includes("--dry-run");

function isYouthSeoulUrl(value) {
  return typeof value === "string" && value.includes("youth.seoul.go.kr/infoData/sprtInfo/view.do");
}

function isThumbnailImage(value) {
  return typeof value === "string" && value.includes("/atch/getImg.do");
}

async function main() {
  const { data, error } = await supabase
    .from("posters")
    .select("id, title, thumbnail_url, source_key")
    .not("source_key", "is", null)
    .like("source_key", "%youth.seoul.go.kr/infoData/sprtInfo/view.do%")
    .like("thumbnail_url", "%/atch/getImg.do%")
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []).filter((row) => isYouthSeoulUrl(row.source_key) && isThumbnailImage(row.thumbnail_url));
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  console.log(`Checking ${rows.length} youth.seoul rows with thumbnail images${dryRun ? " (dry-run)" : ""}...`);

  for (const row of rows) {
    try {
      const detail = await youthSeoul.parseDetail(row.source_key);
      const nextImage = detail.images?.[0] ?? null;

      if (!nextImage || nextImage === row.thumbnail_url || isThumbnailImage(nextImage)) {
        unchanged += 1;
        console.log(`- unchanged: ${row.title}`);
        continue;
      }

      console.log(`- update: ${row.title}`);
      console.log(`  ${row.thumbnail_url}`);
      console.log(`  -> ${nextImage}`);

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("posters")
          .update({ thumbnail_url: nextImage })
          .eq("id", row.id);
        if (updateError) throw updateError;
      }

      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`- failed: ${row.title} — ${error.message}`);
    }
  }

  console.log(JSON.stringify({ checked: rows.length, updated, unchanged, failed, dryRun }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
