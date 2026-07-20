import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { sites } from "./sites.js";
import { getAdapter } from "./adapters/index.js";
import { replacePosterImagesWithStorageCleanup } from "./storage-cleanup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const siteId = process.argv.find((arg) => arg.startsWith("--site="))?.slice("--site=".length) ?? "mapo-scholarship";
const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "1000");
const dryRun = process.argv.includes("--dry-run");
const bucket = process.env.POSTER_IMAGE_BUCKET?.trim() || "poster-originals";
const site = sites.find((candidate) => candidate.id === siteId);
if (!site) throw new Error(`Unknown site: ${siteId}`);

const adapter = getAdapter(site.adapter);
const sourceHost = new URL(site.domain).host.replace(/^www\./, "");

function hostMatches(value) {
  try {
    const host = new URL(value).host.replace(/^www\./, "");
    return host === sourceHost || host.endsWith(`.${sourceHost}`);
  } catch {
    return false;
  }
}

function getPrimarySourceUrl(row) {
  if (row.source_key && hostMatches(row.source_key)) return row.source_key;
  const links = Array.isArray(row.poster_links) ? row.poster_links : [];
  return links.find((link) => link.is_primary && hostMatches(link.url))?.url
    ?? links.find((link) => hostMatches(link.url))?.url
    ?? null;
}

function makeSummaryShort(content) {
  const text = String(content ?? "").trim();
  return text.length > 300 ? `${text.slice(0, 297).trim()}...` : text || null;
}

function imageExtension(imageUrl, contentType) {
  const fromType = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }[contentType?.split(";")[0]?.toLowerCase()];
  if (fromType) return fromType;

  try {
    return new URL(imageUrl).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? "jpg";
  } catch {
    return "jpg";
  }
}

async function importImage(imageUrl, sourceUrl, index) {
  if (imageUrl.includes("/storage/v1/object/public/")) return imageUrl;

  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 site refresh",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
    },
  });
  if (!response.ok) throw new Error(`image download failed ${response.status}: ${imageUrl}`);

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`not an image content type: ${contentType}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = crypto.createHash("sha256").update(`${sourceUrl}:${imageUrl}:${index}`).digest("hex").slice(0, 24);
  const storagePath = `crawler/${siteId}/${hash}.${imageExtension(imageUrl, contentType)}`;

  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

async function syncPosterImages(posterId, imageUrls) {
  await replacePosterImagesWithStorageCleanup(supabase, posterId, imageUrls, { bucket });
}

const { data, error } = await supabase
  .from("posters")
  .select("id,title,thumbnail_url,source_key,poster_links(url,is_primary)")
  .limit(limit);
if (error) throw error;

const rows = (data ?? [])
  .map((row) => ({ ...row, sourceUrl: getPrimarySourceUrl(row) }))
  .filter((row) => row.sourceUrl);

let refreshed = 0;
let skippedNoImage = 0;
let failed = 0;
console.log(`Refreshing ${rows.length} rows for ${siteId}${dryRun ? " (dry-run)" : ""}...`);

for (const row of rows) {
  try {
    const detail = await adapter.parseDetail(row.sourceUrl, site);
    if (!detail.images?.length) {
      skippedNoImage += 1;
      console.log(`- no image: ${row.title}`);
      continue;
    }

    const storedImages = [];
    for (const [index, imageUrl] of detail.images.entries()) {
      storedImages.push(await importImage(imageUrl, row.sourceUrl, index));
    }

    console.log(`- refresh: ${detail.title || row.title}`);
    console.log(`  ${detail.images[0]} -> ${storedImages[0]}`);

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from("posters")
        .update({
          title: detail.title || row.title,
          summary_short: makeSummaryShort(detail.content),
          summary_long: detail.content || null,
          thumbnail_url: storedImages[0],
          source_key: row.sourceUrl,
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
      await syncPosterImages(row.id, storedImages);
    }

    refreshed += 1;
  } catch (error) {
    failed += 1;
    console.error(`- failed: ${row.title} - ${error.message}`);
  }
}

console.log(JSON.stringify({ target: rows.length, refreshed, skippedNoImage, failed, dryRun }, null, 2));
