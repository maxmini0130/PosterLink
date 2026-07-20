import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_POSTER_IMAGE_BUCKET,
  removeStoragePaths,
  storagePathFromValue,
} from "./storage-cleanup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const bucket = process.env.POSTER_IMAGE_BUCKET?.trim() || DEFAULT_POSTER_IMAGE_BUCKET;
const apply = process.argv.includes("--apply");
const prefixArg = process.argv.find((arg) => arg.startsWith("--prefix="));
const prefix = prefixArg?.slice("--prefix=".length).replace(/^\/+|\/+$/g, "") ?? "";

async function listStoragePaths(folder = "") {
  const paths = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      const itemPath = folder ? `${folder}/${item.name}` : item.name;
      const isFolder = item.id === null || item.metadata === null;
      if (isFolder) {
        paths.push(...await listStoragePaths(itemPath));
      } else {
        paths.push(itemPath);
      }
    }

    if (data.length < 1000) break;
    offset += data.length;
  }

  return paths;
}

async function fetchReferencedStoragePaths() {
  const referenced = new Set();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("posters")
      .select("thumbnail_url, poster_images(storage_path)")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const poster of data) {
      const values = [
        poster.thumbnail_url,
        ...((poster.poster_images ?? []).map((image) => image.storage_path)),
      ];
      for (const value of values) {
        const storagePath = storagePathFromValue(value, bucket);
        if (storagePath) referenced.add(storagePath);
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return referenced;
}

const [storagePaths, referencedPaths] = await Promise.all([
  listStoragePaths(prefix),
  fetchReferencedStoragePaths(),
]);

const orphanPaths = storagePaths.filter((storagePath) => !referencedPaths.has(storagePath));

console.log(`Bucket: ${bucket}`);
console.log(`Prefix: ${prefix || "(all)"}`);
console.log(`Storage objects: ${storagePaths.length}`);
console.log(`Referenced objects: ${referencedPaths.size}`);
console.log(`Orphan objects: ${orphanPaths.length}`);

for (const orphanPath of orphanPaths.slice(0, 50)) {
  console.log(`- ${orphanPath}`);
}
if (orphanPaths.length > 50) {
  console.log(`...and ${orphanPaths.length - 50} more`);
}

if (!apply) {
  console.log("\nDry-run only. Re-run with --apply to delete orphan objects.");
  process.exit(0);
}

const deleted = await removeStoragePaths(supabase, orphanPaths, { bucket });
console.log(`Deleted orphan objects: ${deleted}`);
