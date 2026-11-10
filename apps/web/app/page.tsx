import HomeClient from "./HomeClient";
import { fetchTopRegionCategoryCombinations } from "../lib/publicDiscovery";
import { fetchPublicHomeSummary } from "../lib/homeSummary";
import { loadHomeFeed } from "../lib/homeFeedServer";

export const metadata = { alternates: { canonical: "/" } };

export const dynamic = "force-dynamic";

/**
 * Home v5: the default sections (서울 전체, no conditions) render on the
 * server; the browser swaps in condition-first sections for members and
 * guests with saved conditions. `?page=N` renders N feed pages for the
 * "더 보기" link (search engines, no JavaScript).
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const requested = Number.parseInt(searchParams.page ?? "1", 10);
  const pageCount = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), 20)
    : 1;
  const [topCombinations, summary, feed] = await Promise.all([
    fetchTopRegionCategoryCombinations(20),
    fetchPublicHomeSummary().catch(() => null),
    loadHomeFeed({ pageCount }).catch(() => null),
  ]);
  return (
    <HomeClient
      initial={feed}
      initialPages={pageCount}
      topCombinations={topCombinations}
      summary={summary}
    />
  );
}
