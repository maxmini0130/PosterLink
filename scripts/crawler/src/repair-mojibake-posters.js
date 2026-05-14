import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import genericBoard from "./adapters/generic-board.js";
import { sites } from "./sites.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function looksMojibake(value) {
  const text = String(value ?? "");
  if (!text) return false;
  const replacementCount = (text.match(/\uFFFD/g) ?? []).length;
  return replacementCount >= 2 || /[�]{1,}/.test(text);
}

function normalizeSourceKey(sourceUrl) {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    url.hash = "";
    return url.href;
  } catch {
    return String(sourceUrl).trim();
  }
}

async function main() {
  const sourceHost = process.argv[2] ?? "mycc.or.kr";
  const dryRun = process.argv.includes("--dry-run");

  const { data: rows, error } = await supabase
    .from("posters")
    .select("id, title, summary_short, source_key, poster_status, created_at")
    .ilike("source_key", `%${sourceHost}%`)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const targets = (rows ?? []).filter((row) => looksMojibake(row.title) || looksMojibake(row.summary_short));
  console.log(`Found ${targets.length} mojibake posters for ${sourceHost}`);

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of targets) {
    const sourceUrl = normalizeSourceKey(row.source_key);
    if (!sourceUrl) {
      skipped++;
      continue;
    }

    try {
      const detail = await genericBoard.parseDetail(sourceUrl, sites.find((site) => site.id === "mapo-youth"));
      const updates = {};
      if (detail.title && looksMojibake(row.title)) updates.title = detail.title.substring(0, 200);
      if (looksMojibake(row.summary_short)) {
        updates.summary_short = detail.content ? detail.content.substring(0, 300) : null;
      }

      if (Object.keys(updates).length === 0) {
        skipped++;
        console.log(`- skip ${row.id}: no replacement text (${row.title})`);
        continue;
      }

      console.log(`- ${dryRun ? "would fix" : "fix"} ${row.id}`);
      console.log(`  old: ${row.title}`);
      if (updates.title) console.log(`  new: ${updates.title}`);

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("posters")
          .update(updates)
          .eq("id", row.id);
        if (updateError) throw updateError;
      }

      fixed++;
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (err) {
      failed++;
      console.error(`- failed ${row.id}: ${err.message}`);
    }
  }

  console.log(`Done. fixed=${fixed} skipped=${skipped} failed=${failed}${dryRun ? " dryRun=true" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
