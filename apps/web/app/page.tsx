import { fetchPublicHomeSummary } from "../lib/homeSummary";
import HomeClient from "./HomeClient";
import { fetchTopRegionCategoryCombinations } from "../lib/publicDiscovery";

export const metadata = { alternates: { canonical: "/" } };

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [topCombinations, initialSummary] = await Promise.all([
    fetchTopRegionCategoryCombinations(20),
    fetchPublicHomeSummary(),
  ]);

  return (
    <HomeClient
      topCombinations={topCombinations}
      initialSummary={initialSummary}
    />
  );
}
