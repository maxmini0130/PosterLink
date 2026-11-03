import { NextResponse } from "next/server";
import { loadHomeFeed } from "../../../lib/homeFeedServer";

export const dynamic = "force-dynamic";

/**
 * Public home sections for explicit conditions (a guest's saved conditions or
 * a member's profile are sent by the browser) and the next "새로 올라온 공고"
 * pages. Reads public data with the anon key only.
 *   ?region=<uuid>&categories=<uuid,uuid>&follows=<uuid,..>&since=<ms>&pages=<1-20>&from=<1-20>
 * Returns pages[from-1 .. pages-1]; `from=1` also returns the upper sections.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const int = (key: string, fallback: number) => {
    const value = Number.parseInt(params.get(key) ?? "", 10);
    return Number.isFinite(value) ? Math.min(Math.max(value, 1), 20) : fallback;
  };
  const pages = int("pages", 1);
  const from = Math.min(int("from", 1), pages);
  try {
    const feed = await loadHomeFeed({
      regionId: params.get("region"),
      categoryIds: (params.get("categories") ?? "")
        .split(",")
        .filter(Boolean)
        .slice(0, 8),
      followedIds: (params.get("follows") ?? "")
        .split(",")
        .filter(Boolean)
        .slice(0, 100),
      since: Number.isFinite(Number(params.get("since")))
        ? Number(params.get("since")) || null
        : null,
      pageCount: pages,
    });
    const { layout } = feed;
    return NextResponse.json(
      {
        ...feed,
        layout: {
          ...layout,
          picks: from === 1 ? layout.picks : [],
          deadline: from === 1 ? layout.deadline : [],
          followed: from === 1 ? layout.followed : [],
          pages: layout.pages.slice(from - 1),
        },
        from,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "home" }, { status: 502 });
  }
}
