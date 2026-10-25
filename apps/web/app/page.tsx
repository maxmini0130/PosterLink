import { fetchPublicHomeSummary } from "../lib/homeSummary";
import HomeClient from "./HomeClient";
import {
  fetchPublicDiscovery,
  fetchTopRegionCategoryCombinations,
} from "../lib/publicDiscovery";

export const metadata = { alternates: { canonical: "/" } };

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [topCombinations, initialSummary, initialFeed] = await Promise.all([
    fetchTopRegionCategoryCombinations(20),
    fetchPublicHomeSummary(),
    fetchPublicDiscovery({ sort: "deadline", limit: 36 }),
  ]);
  const initialClosedFallback = initialFeed.posters.length === 0;
  const visibleFeed = initialClosedFallback
    ? await fetchPublicDiscovery({
        sort: "latest",
        includeClosed: true,
        limit: 12,
      })
    : initialFeed;

  return (
    <HomeClient
      topCombinations={topCombinations}
      initialSummary={initialSummary}
      initialPosters={visibleFeed.posters}
      initialClosedFallback={initialClosedFallback}
    />
  );
}
