import HomeClient from "./HomeClient";
import { fetchTopRegionCategoryCombinations } from "../lib/publicDiscovery";
import { fetchPublicHomeSummary } from "../lib/homeSummary";

export const metadata = { alternates: { canonical: "/" } };

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [topCombinations, summary] = await Promise.all([
    fetchTopRegionCategoryCombinations(20),
    fetchPublicHomeSummary().catch(() => null),
  ]);
  return <HomeClient topCombinations={topCombinations} summary={summary} />;
}
