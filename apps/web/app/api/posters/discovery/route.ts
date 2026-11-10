import { NextRequest, NextResponse } from "next/server";
import { fetchPublicDiscovery } from "../../../../lib/publicDiscovery";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const result = await fetchPublicDiscovery({
      sort: params.get("sort"),
      includeClosed: params.get("closed") === "include",
      limit: 36,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "공고 목록을 불러오지 못했습니다." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
