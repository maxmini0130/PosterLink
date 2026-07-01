import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_KEY, or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/export-poster-ai-dataset.js [--output=data/ai-poster-dataset] [--limit=1000]

Labels:
  published -> poster
  rejected  -> not_poster

Requires:
  SUPABASE_URL + SUPABASE_KEY
  or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY`);
  process.exit(0);
}

const outputDir = path.resolve(args.output || "data/ai-poster-dataset");
const limitPerStatus = Number(args.limit || "1000");
const statuses = ["published", "rejected"];
const labelByStatus = {
  published: "poster",
  rejected: "not_poster",
};

function getExtension(imageUrl, contentType) {
  const fromContentType = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }[contentType?.split(";")[0]?.toLowerCase()];
  if (fromContentType) return fromContentType;

  try {
    return new URL(imageUrl).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() || "jpg";
  } catch {
    return "jpg";
  }
}

function normalizeImageUrl(value) {
  const imageUrl = String(value ?? "").trim();
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return null;
}

function pickImageUrl(row) {
  const imageRows = Array.isArray(row.poster_images) ? row.poster_images : [];
  const preferred = imageRows.find((image) => image.image_type === "thumbnail") ?? imageRows[0];
  return normalizeImageUrl(row.thumbnail_url) || normalizeImageUrl(preferred?.storage_path);
}

async function downloadImage(imageUrl, posterId) {
  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 poster AI dataset export",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
    },
  });

  if (!response.ok) throw new Error(`image download failed ${response.status}`);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`not an image content type: ${contentType}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = crypto.createHash("sha256").update(`${posterId}:${imageUrl}`).digest("hex").slice(0, 16);
  return {
    bytes,
    ext: getExtension(imageUrl, contentType),
    hash,
    contentType,
  };
}

async function fetchRows(status) {
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,source_org_name,poster_status,rejection_reason,thumbnail_url,source_key,created_at,poster_images(storage_path,image_type)")
    .eq("poster_status", status)
    .not("thumbnail_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(limitPerStatus);

  if (error) throw error;
  return data ?? [];
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const manifest = [];
  const counts = { poster: 0, not_poster: 0, skipped: 0, failed: 0 };

  for (const status of statuses) {
    const label = labelByStatus[status];
    const labelDir = path.join(outputDir, label);
    await fs.mkdir(labelDir, { recursive: true });

    const rows = await fetchRows(status);
    console.log(`Exporting ${rows.length} ${status} rows as ${label}...`);

    for (const row of rows) {
      const imageUrl = pickImageUrl(row);
      if (!imageUrl) {
        counts.skipped += 1;
        continue;
      }

      try {
        const image = await downloadImage(imageUrl, row.id);
        const fileName = `${row.id}_${image.hash}.${image.ext}`;
        const filePath = path.join(labelDir, fileName);
        await fs.writeFile(filePath, image.bytes);

        manifest.push({
          id: row.id,
          label,
          status,
          title: row.title,
          source_org_name: row.source_org_name,
          rejection_reason: row.rejection_reason,
          source_key: row.source_key,
          image_url: imageUrl,
          file: path.relative(outputDir, filePath).replace(/\\/g, "/"),
          content_type: image.contentType,
          created_at: row.created_at,
        });
        counts[label] += 1;
        process.stdout.write(label === "poster" ? "+" : "-");
      } catch (error) {
        counts.failed += 1;
        process.stdout.write("!");
        console.warn(`\n  failed: ${row.title} - ${error.message}`);
      }
    }
    console.log("");
  }

  const manifestPath = path.join(outputDir, "manifest.jsonl");
  await fs.writeFile(
    manifestPath,
    manifest.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf-8",
  );

  console.log(JSON.stringify({ outputDir, manifestPath, counts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
