import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { embedPosterText, embeddingToPgVector } from "./poster-embedder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

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

async function main() {
  const { data: posters, error } = await supabase
    .from("posters")
    .select("id, title, summary_short, summary_long")
    .in("poster_status", ["published", "review"])
    .is("embedding", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  let checked = 0;
  let embedded = 0;
  let skipped = 0;

  for (const poster of posters ?? []) {
    checked += 1;
    const embedding = await embedPosterText({
      title: poster.title,
      summaryShort: poster.summary_short,
      summaryLong: poster.summary_long,
    });

    const pgVector = embeddingToPgVector(embedding);
    if (!pgVector) {
      skipped += 1;
      continue;
    }

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from("posters")
        .update({ embedding: pgVector })
        .eq("id", poster.id);

      if (updateError) throw updateError;
    }
    embedded += 1;
  }

  console.log(JSON.stringify({ checked, embedded, skipped, dryRun }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
