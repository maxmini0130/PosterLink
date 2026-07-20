import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import youthSeoul from "./adapters/youth-seoul.js";
import { scorePosterImageCandidate } from "./poster-image-rules.js";
import { deletePostersWithStorage, replacePosterImagesWithStorageCleanup } from "./storage-cleanup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const bucket = process.env.POSTER_IMAGE_BUCKET?.trim() || "poster-originals";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const dryRun = process.argv.includes("--dry-run");
const deleteUnrepaired = process.argv.includes("--delete-unrepaired");
const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "250");
const idsArg = process.argv.find((arg) => arg.startsWith("--ids="))?.slice("--ids=".length);
const ids = idsArg ? idsArg.split(/[,\s]+/).map((id) => id.trim()).filter(Boolean) : [];
const statusArg = process.argv.find((arg) => arg.startsWith("--status="))?.slice("--status=".length);

function getImageExtension(imageUrl, contentType) {
  const normalizedType = contentType?.split(";")[0]?.toLowerCase();
  const byType = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }[normalizedType];
  if (byType) return byType;

  try {
    const match = new URL(imageUrl).pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (match) return match[1].toLowerCase();
  } catch {
    // Fall through to default.
  }

  return "jpg";
}

async function importImageToStorage(imageUrl, sourceKey, index) {
  if (imageUrl.includes("/storage/v1/object/public/")) return imageUrl;

  const imageOrigin = (() => {
    try {
      return new URL(imageUrl).origin;
    } catch {
      return undefined;
    }
  })();

  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 image repair",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
      ...(imageOrigin ? { Referer: imageOrigin } : {}),
    },
  });
  if (!response.ok) throw new Error(`image download failed (${response.status})`);

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`not an image content type: ${contentType}`);
  }

  const imageBytes = new Uint8Array(await response.arrayBuffer());
  const hash = crypto.createHash("sha256").update(`${sourceKey}:${imageUrl}:${index}`).digest("hex").slice(0, 24);
  const storagePath = `crawler/youth-seoul/${hash}.${getImageExtension(imageUrl, contentType)}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, imageBytes, { contentType, upsert: true });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

function isYouthSeoulSource(value) {
  return String(value ?? "").includes("youth.seoul.go.kr/infoData/sprtInfo/view.do");
}

async function fetchRows() {
  let query = supabase
    .from("posters")
    .select("id,title,summary_short,thumbnail_url,source_key,poster_status")
    .not("source_key", "is", null)
    .limit(limit);

  if (ids.length > 0) query = query.in("id", ids);
  if (statusArg) query = query.eq("poster_status", statusArg);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).filter((row) => isYouthSeoulSource(row.source_key));
}

function selectReplacementCandidate(detail) {
  const candidates = detail.posterImageCandidates ?? [];
  const orderedImages = detail.images ?? [];

  for (const imageUrl of orderedImages) {
    const matchingCandidate = candidates.find((candidate) => candidate.imageUrl === imageUrl && candidate.rule?.passes);
    if (matchingCandidate) return matchingCandidate;
  }

  return candidates.find((candidate) => candidate.rule?.passes) ?? null;
}

async function main() {
  const rows = await fetchRows();
  let checked = 0;
  let repaired = 0;
  let skipped = 0;
  let failed = 0;
  let deleted = 0;
  const failures = [];

  console.log(`Checking ${rows.length} youth.seoul rows for WA/cert thumbnails${dryRun ? " (dry-run)" : ""}...`);

  for (const row of rows) {
    checked += 1;

    try {
      const currentRule = await scorePosterImageCandidate(row.thumbnail_url, {
        title: row.title,
        content: row.summary_short,
        sourceUrl: row.source_key,
      });

      if (currentRule.passes) {
        skipped += 1;
        continue;
      }

      const detail = await youthSeoul.parseDetail(row.source_key);
      const replacementCandidate = selectReplacementCandidate(detail);
      if (!replacementCandidate) {
        if (deleteUnrepaired && row.poster_status === "review") {
          if (!dryRun) {
            await deletePostersWithStorage(supabase, [row.id], { bucket, status: "review" });
          }
          deleted += 1;
          console.log(`- deleted ${row.id}: ${currentRule.reason}`);
          continue;
        }

        skipped += 1;
        failures.push({ id: row.id, reason: `no replacement (${currentRule.reason})` });
        continue;
      }

      const replacementImage = replacementCandidate.imageUrl;
      const replacementRule = replacementCandidate.rule;
      if (!replacementRule.passes) {
        skipped += 1;
        failures.push({ id: row.id, reason: `replacement rejected (${replacementRule.reason})` });
        continue;
      }

      const publicUrl = dryRun
        ? replacementImage
        : await importImageToStorage(replacementImage, row.source_key, 0);

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("posters")
          .update({ thumbnail_url: publicUrl })
          .eq("id", row.id);
        if (updateError) throw updateError;

        await replacePosterImagesWithStorageCleanup(supabase, row.id, [publicUrl], { bucket });
      }

      repaired += 1;
      console.log(`- repaired ${row.id}: ${currentRule.reason} -> ${replacementRule.dimensions?.width ?? "?"}x${replacementRule.dimensions?.height ?? "?"}`);
    } catch (error) {
      failed += 1;
      failures.push({ id: row.id, reason: error.message });
      console.error(`- failed ${row.id}: ${error.message}`);
    }
  }

  console.log(JSON.stringify({ checked, repaired, deleted, skipped, failed, failures, dryRun }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
