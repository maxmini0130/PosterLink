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

function normalizeImageUrl(imageUrl, sourceUrl) {
  if (!imageUrl) return null;
  const value = String(imageUrl).trim();
  if (!value) return null;
  if (/^(https?:|data:)/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;

  try {
    return new URL(value, sourceUrl).href;
  } catch {
    return value;
  }
}

function normalizeImages(images, sourceUrl) {
  return [...new Set((images ?? [])
    .map((imageUrl) => normalizeImageUrl(imageUrl, sourceUrl))
    .filter(Boolean))];
}

async function fetchExistingImages(posterId) {
  const { data, error } = await supabase
    .from("poster_images")
    .select("storage_path")
    .eq("poster_id", posterId);

  if (error) throw error;
  return new Set((data ?? []).map((image) => image.storage_path));
}

async function main() {
  const { data, error } = await supabase
    .from("posters")
    .select("id, title, thumbnail_url, source_key")
    .not("source_key", "is", null)
    .like("source_key", "%youth.seoul.go.kr/infoData/sprtInfo/view.do%")
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []).filter((row) => isYouthSeoulUrl(row.source_key));
  let checked = 0;
  let imageRowsInserted = 0;
  let thumbnailsUpdated = 0;
  let unchanged = 0;
  let failed = 0;

  console.log(`Backfilling poster_images for ${rows.length} youth.seoul rows${dryRun ? " (dry-run)" : ""}...`);

  for (const row of rows) {
    checked += 1;

    try {
      const detail = await youthSeoul.parseDetail(row.source_key);
      const images = normalizeImages([...(detail.images ?? []), row.thumbnail_url], row.source_key);

      if (images.length === 0) {
        unchanged += 1;
        console.log(`- no images: ${row.title}`);
        continue;
      }

      const existingImages = await fetchExistingImages(row.id);
      const missingImages = images.filter((imageUrl) => !existingImages.has(imageUrl));
      const nextThumbnail = images[0] ?? null;
      const shouldUpdateThumbnail = nextThumbnail && nextThumbnail !== row.thumbnail_url;

      if (missingImages.length === 0 && !shouldUpdateThumbnail) {
        unchanged += 1;
        console.log(`- unchanged: ${row.title} (${images.length} images)`);
        continue;
      }

      console.log(`- update: ${row.title} (+${missingImages.length} images${shouldUpdateThumbnail ? ", thumbnail" : ""})`);

      if (!dryRun) {
        if (missingImages.length > 0) {
          const { error: insertError } = await supabase.from("poster_images").insert(
            missingImages.map((imageUrl, index) => ({
              poster_id: row.id,
              storage_path: imageUrl,
              image_type: existingImages.size === 0 && index === 0 ? "thumbnail" : "original",
            }))
          );
          if (insertError) throw insertError;
        }

        if (shouldUpdateThumbnail) {
          const { error: updateError } = await supabase
            .from("posters")
            .update({ thumbnail_url: nextThumbnail })
            .eq("id", row.id);
          if (updateError) throw updateError;
        }
      }

      imageRowsInserted += missingImages.length;
      if (shouldUpdateThumbnail) thumbnailsUpdated += 1;
    } catch (error) {
      failed += 1;
      console.error(`- failed: ${row.title} — ${error.message}`);
    }
  }

  console.log(JSON.stringify({
    checked,
    imageRowsInserted,
    thumbnailsUpdated,
    unchanged,
    failed,
    dryRun,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
