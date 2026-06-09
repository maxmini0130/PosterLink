import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^\[?::1\]?$/i,
];

function isAllowedImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) return false;
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get("url");

  if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "PosterLink/1.0 image proxy",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json({ error: "Image fetch failed" }, { status: response.status });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "URL is not an image" }, { status: 415 });
    }

    const image = await response.arrayBuffer();

    return new NextResponse(image, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image proxy failed" }, { status: 502 });
  }
}
