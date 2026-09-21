import HomeClient from "./HomeClient";
import { fetchTopRegionCategoryCombinations } from "../lib/publicDiscovery";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const topCombinations = await fetchTopRegionCategoryCombinations(20);

  return <HomeClient topCombinations={topCombinations} />;
}
