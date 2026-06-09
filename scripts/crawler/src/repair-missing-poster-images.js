import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { sites } from "./sites.js";
import { getAdapter } from "./adapters/index.js";

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

const limit = Number(process.argv[2] ?? "300");
const dryRun = process.argv.includes("--dry-run");
const sourceFilter = process.argv.find((arg) => arg.startsWith("--source="))?.slice("--source=".length);

function isMissingOrInvalidImage(value) {
  return !value || !/^(https?:|data:)/i.test(String(value).trim());
}

function hasNoImageRows(row) {
  return !Array.isArray(row.poster_images) || row.poster_images.length === 0;
}

function getPrimarySourceUrl(row) {
  const sourceKey = String(row.source_key ?? "").trim();
  if (sourceKey) return sourceKey;

  const links = Array.isArray(row.poster_links) ? row.poster_links : [];
  const primaryLink = links.find((link) => link.is_primary)?.url;
  return String(primaryLink ?? links[0]?.url ?? "").trim() || null;
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

function hostMatches(sourceUrl, site) {
  try {
    const sourceHost = new URL(sourceUrl).host.replace(/^www\./, "");
    const siteHost = new URL(site.domain).host.replace(/^www\./, "");
    return sourceHost === siteHost || sourceHost.endsWith(`.${siteHost}`);
  } catch {
    return false;
  }
}

function findSiteForSource(sourceUrl) {
  return sites.find((site) => hostMatches(sourceUrl, site)) ?? null;
}

async function fetchExistingImages(posterId) {
  const { data, error } = await supabase
    .from("poster_images")
    .select("storage_path")
    .eq("poster_id", posterId);

  if (error) throw error;
  return new Set((data ?? []).map((image) => image.storage_path));
}

async function syncPosterImages(row, images) {
  const existingImages = await fetchExistingImages(row.id);
  const missingImages = images.filter((imageUrl) => !existingImages.has(imageUrl));
  const updates = {};

  if (images[0] && isMissingOrInvalidImage(row.thumbnail_url)) {
    updates.thumbnail_url = images[0];
  }
  if (!row.source_key && row.sourceUrl) {
    updates.source_key = row.sourceUrl;
  }

  if (dryRun) return { missingImages, updates };

  if (missingImages.length > 0) {
    const { error } = await supabase.from("poster_images").insert(
      missingImages.map((imageUrl, index) => ({
        poster_id: row.id,
        storage_path: imageUrl,
        image_type: existingImages.size === 0 && index === 0 ? "thumbnail" : "original",
      }))
    );
    if (error) throw error;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("posters")
      .update(updates)
      .eq("id", row.id);
    if (error) throw error;
  }

  return { missingImages, updates };
}

async function main() {
  let query = supabase
    .from("posters")
    .select("id, title, thumbnail_url, source_key, poster_status, poster_links(url, is_primary), poster_images(storage_path)")
    .eq("poster_status", "review")
    .limit(limit);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? [])
    .map((row) => ({ ...row, sourceUrl: getPrimarySourceUrl(row) }))
    .filter((row) => isMissingOrInvalidImage(row.thumbnail_url) || hasNoImageRows(row))
    .filter((row) => row.sourceUrl)
    .filter((row) => !sourceFilter || row.sourceUrl.includes(sourceFilter));
  let checked = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  console.log(`Repairing ${rows.length} review rows with missing images${dryRun ? " (dry-run)" : ""}...`);

  for (const row of rows) {
    checked += 1;

    try {
      const site = findSiteForSource(row.sourceUrl);
      if (!site) {
        unchanged += 1;
        console.log(`- no site match: ${row.title} (${row.sourceUrl})`);
        continue;
      }

      const adapter = getAdapter(site.adapter);
      const detail = await adapter.parseDetail(row.sourceUrl, site);
      const images = normalizeImages(detail.images, row.sourceUrl);

      if (images.length === 0) {
        unchanged += 1;
        console.log(`- no images found: ${row.title}`);
        continue;
      }

      const result = await syncPosterImages(row, images);
      if (result.missingImages.length === 0 && Object.keys(result.updates).length === 0) {
        unchanged += 1;
        console.log(`- unchanged: ${row.title}`);
        continue;
      }

      updated += 1;
      console.log(`- repaired: ${row.title} (+${result.missingImages.length} images${result.updates.thumbnail_url ? ", thumbnail" : ""})`);
      console.log(`  ${images[0]}`);
    } catch (error) {
      failed += 1;
      console.error(`- failed: ${row.title} - ${error.message}`);
    }
  }

  console.log(JSON.stringify({ checked, updated, unchanged, failed, dryRun }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
