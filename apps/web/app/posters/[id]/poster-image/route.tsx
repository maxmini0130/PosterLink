import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { createPublicSupabaseClient } from "../../../../lib/publicDiscovery";
import { PUBLIC_POSTER_EXPOSURE_FILTER } from "../../../../lib/publicPosterVisibility";
import { DefaultPosterCanvas } from "../../../components/pl/DefaultPoster";

// Node.js, not Edge: the 2.8MB font would exceed the Edge function size
// limit and fail the Vercel build (Preview of release/design-20261102).
export const runtime = "nodejs";
let font: Promise<Buffer> | undefined;
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id))
    return new Response("Not found", { status: 404 });
  const { data, error } = await createPublicSupabaseClient()
    .from("posters")
    .select("title,organizer_name,poster_categories(categories(code,name))")
    .eq("id", params.id)
    .in("poster_status", ["published", "closed"])
    .or(PUBLIC_POSTER_EXPOSURE_FILTER)
    .maybeSingle();
  if (error || !data) return new Response("Not found", { status: 404 });
  font ??= readFile(
    path.join(process.cwd(), "public/fonts/NotoSerifKR-Bold.woff"),
  );
  const category = ((data.poster_categories as unknown as Array<{
    categories: { code: string; name: string };
  }>) ?? [])[0]?.categories;
  return new ImageResponse(
    <DefaultPosterCanvas
      title={data.title}
      category={category?.code}
      organization={data.organizer_name}
    />,
    {
      width: 900,
      height: 1200,
      fonts: [
        { name: "PosterSerif", data: await font, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "public,max-age=3600" },
    },
  );
}
