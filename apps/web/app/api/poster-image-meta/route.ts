import { NextRequest, NextResponse } from "next/server";
import { createPublicSupabaseClient } from "../../../lib/publicDiscovery";
import { PUBLIC_POSTER_EXPOSURE_FILTER } from "../../../lib/publicPosterVisibility";
import {
  assessPosterImage,
  readImageDimensions,
} from "../../../../../packages/lib/posterImagePolicy.cjs";

export const runtime = "nodejs";
const cache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
async function inspect(id: string, src: string) {
  const client = createPublicSupabaseClient();
  const { data, error } = await client
    .from("posters")
    .select("thumbnail_url,poster_images(*)")
    .eq("id", id)
    .in("poster_status", ["published", "closed"])
    .or(PUBLIC_POSTER_EXPOSURE_FILTER)
    .maybeSingle();
  if (error || !data) return { status: "missing" };
  const images = (data.poster_images ?? []) as Array<Record<string, unknown>>;
  if (src !== data.thumbnail_url && !images.some((i) => i.storage_path === src))
    return { status: "missing" };
  const saved = images.find((i) => i.storage_path === src);
  if (saved?.image_width && !saved.image_status) return { status: null, src };
  if (["missing", "unsuitable", "broken"].includes(String(saved?.image_status)))
    return { status: saved.image_status, src };
  const width = Number(saved?.image_width || saved?.width),
    height = Number(saved?.image_height || saved?.height);
  if (width > 0 && height > 0)
    return {
      width,
      height,
      status: assessPosterImage({ url: src, width, height }),
      src,
    };
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 6000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const res = await fetch(src, {
      headers: { Range: "bytes=0-524287" },
      redirect: "error",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok || !res.body) return { status: "broken", src };
    reader = res.body.getReader();
    let bytes = Buffer.alloc(0);
    while (bytes.length < 524288) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes = Buffer.concat([
        bytes,
        Buffer.from(chunk.value).subarray(0, 524288 - bytes.length),
      ]);
      const dimensions = readImageDimensions(bytes);
      if (dimensions)
        return {
          ...dimensions,
          status: assessPosterImage({ url: src, ...dimensions }),
          src,
        };
    }
    return { status: null, src };
  } catch {
    return { status: null, src };
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => {});
    controller.abort();
  }
}
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "",
    src = request.nextUrl.searchParams.get("src") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || src.length > 2000)
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  try {
    const u = new URL(src),
      base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    if (
      u.origin !== base.origin ||
      !u.pathname.startsWith("/storage/v1/object/public/") ||
      u.username ||
      u.password
    )
      return NextResponse.json({ error: "unsupported image" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "invalid image" }, { status: 400 });
  }
  const key = id + ":" + src,
    stored = cache.get(key);
  if (stored && stored.until > Date.now())
    return NextResponse.json(stored.value);
  let work = pending.get(key);
  if (!work) {
    work = inspect(id, src);
    pending.set(key, work);
  }
  try {
    const value = await work;
    if (cache.size >= 512) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + 3600000, value });
    return NextResponse.json(value, {
      headers: { "Cache-Control": "public,max-age=3600" },
    });
  } finally {
    pending.delete(key);
  }
}
